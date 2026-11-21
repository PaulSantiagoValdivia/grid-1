/**
 * Wall geometry.
 *
 * A wall arrives as a segment with no thickness (`start` → `end`) plus a
 * number (`thickness`). Here it becomes the shapes both views draw: a polygon
 * in plan, and a list of parts to raise in 3D. Its ends are cut as the joints
 * with other walls decide (`joints.ts`), and square where it meets none.
 */

import type { Opening, Wall } from './plan'
import type { Line, Vec2 } from './vec2'
import { tolerance } from './tolerances'
import { quoted } from '../types/planText'
import { add, fromTuple, length, normalize, perp, scale, sub } from './vec2'

export interface WallAxis {
  readonly start: Vec2
  readonly end: Vec2
  /** Unit direction from `start` towards `end`. */
  readonly dir: Vec2
  /** Unit normal: the direction half the thickness grows along. */
  readonly normal: Vec2
  readonly length: number
}

export function wallAxis(wall: Wall): WallAxis {
  const start = fromTuple(wall.start)
  const end = fromTuple(wall.end)
  const delta = sub(end, start)
  const len = length(delta)
  if (len === 0) {
    throw new Error(`Wall ${quoted(wall.id)} has zero length: start and end are the same point`)
  }
  const dir = normalize(delta)
  return { start, end, dir, normal: perp(dir), length: len }
}

/** Point on the wall axis, `s` meters away from `start`. */
export function pointAlong(axis: WallAxis, s: number): Vec2 {
  return add(axis.start, scale(axis.dir, s))
}

/**
 * The wall's two faces, as infinite lines.
 *
 * `left` is the face the normal points at (90° counter-clockwise from the
 * wall direction); `right` is the opposite one. They are lines and not
 * segments because rooms need to intersect them past their endpoints.
 */
export function wallFaces(wall: Wall): { left: Line; right: Line } {
  const axis = wallAxis(wall)
  // A virtual wall is a line with no substance: both faces lie on its axis, so
  // the rooms either side of it meet there and no floor is lost between them.
  const half = wall.virtual ? 0 : wall.thickness / 2
  return {
    left: { point: add(axis.start, scale(axis.normal, half)), dir: axis.dir },
    right: { point: add(axis.start, scale(axis.normal, -half)), dir: axis.dir }
  }
}

/** The wall axis as a pair of points. This is what a virtual wall draws as. */
export function wallCenterline(wall: Wall): [Vec2, Vec2] {
  const axis = wallAxis(wall)
  return [axis.start, axis.end]
}

/**
 * How far each face of a wall reaches past one end of its axis, in metres: positive runs past
 * the end, negative stops short of it. `left` is the face the normal points at. Both are 0 at an
 * end cut square; where walls meet, `wallJoints` (joints.ts) decides them (SHT-2).
 */
export interface FaceReach {
  readonly left: number
  readonly right: number
}

/** The reach of a wall's faces at both ends. */
export interface WallEnds {
  readonly start: FaceReach
  readonly end: FaceReach
}

/** A wall cut square at both ends: one that meets no other. */
export const SQUARE_ENDS: WallEnds = { start: { left: 0, right: 0 }, end: { left: 0, right: 0 } }

/**
 * Polygon of a run of the wall in plan, between `from` and `to` meters from
 * `start`. The four vertices come out in order, ready for a `<path>`.
 *
 * A run that reaches an end of the wall takes that end's corner from `ends`: each face runs
 * to where the joint puts it. A run too short for its corner (a door hard against it) keeps
 * the face no shorter than the run's other end.
 */
export function wallSlicePolygon(wall: Wall, from: number, to: number, ends: WallEnds = SQUARE_ENDS): Vec2[] {
  const axis = wallAxis(wall)
  const half = wall.thickness / 2
  const offsetLeft = scale(axis.normal, half)
  const offsetRight = scale(axis.normal, -half)
  const none = tolerance('noLength')
  const atStart = from <= none
  const atEnd = to >= axis.length - none
  const leftFrom = atStart ? from - ends.start.left : from
  const rightFrom = atStart ? from - ends.start.right : from
  const leftTo = Math.max(atEnd ? to + ends.end.left : to, leftFrom)
  const rightTo = Math.max(atEnd ? to + ends.end.right : to, rightFrom)
  return [
    add(pointAlong(axis, leftFrom), offsetLeft),
    add(pointAlong(axis, leftTo), offsetLeft),
    add(pointAlong(axis, rightTo), offsetRight),
    add(pointAlong(axis, rightFrom), offsetRight)
  ]
}

/** Polygon of the whole wall, with no openings taken out, its corners as `ends` puts them. */
export function wallPolygon(wall: Wall, ends: WallEnds = SQUARE_ENDS): Vec2[] {
  return wallSlicePolygon(wall, 0, wallAxis(wall).length, ends)
}

/** How far an opening reaches along the wall, measured from `start`. */
export interface OpeningSpan {
  readonly opening: Opening
  readonly from: number
  readonly to: number
}

export function openingSpan(opening: Opening): OpeningSpan {
  // C2 · `offset` is the near edge, not the center.
  return { opening, from: opening.offset, to: opening.offset + opening.width }
}

export type WallPartKind = 'solid' | 'lintel' | 'sill'

/**
 * A piece of wall that has substance.
 *
 * This is the decision that avoids CSG: instead of subtracting boxes from the
 * wall to cut the openings, we split it into the pieces that do exist. Every
 * piece is a right prism — a rectangle along the wall, between two heights —
 * so raising it in 3D is an extrusion and nothing more.
 */
export interface WallPart {
  readonly kind: WallPartKind
  /** Meters from the wall's `start`. */
  readonly from: number
  readonly to: number
  /** Heights above the floor. */
  readonly zFrom: number
  readonly zTo: number
  /** The opening that produced the piece, for lintels and sills. */
  readonly opening?: Opening
}

/**
 * Breaks the wall into the pieces that need to be drawn and raised.
 *
 * - `solid`: a run from floor to ceiling, between openings.
 * - `lintel`: the header above an opening.
 * - `sill`: the apron below a window.
 *
 * A virtual wall has no substance and returns an empty list.
 */
export function wallParts(wall: Wall, openings: readonly Opening[] = []): WallPart[] {
  if (wall.virtual) return []

  const total = wallAxis(wall).length
  // An opening may run `openingOverrun` past an end of its wall (validate.ts); it is drawn
  // within the wall, so nothing pokes out of it.
  const spans = openings
    .map(openingSpan)
    .map((span) => ({ ...span, from: Math.max(0, span.from), to: Math.min(total, span.to) }))
    .sort((a, b) => a.from - b.from)
  const parts: WallPart[] = []
  const none = tolerance('noLength')

  let cursor = 0
  for (const span of spans) {
    // The solid run left before this opening.
    if (span.from - cursor > none) {
      parts.push({ kind: 'solid', from: cursor, to: span.from, zFrom: 0, zTo: wall.height })
    }

    const { opening } = span
    const head = opening.sill + opening.height

    if (opening.sill > none) {
      parts.push({
        kind: 'sill',
        from: span.from,
        to: span.to,
        zFrom: 0,
        zTo: opening.sill,
        opening
      })
    }
    if (wall.height - head > none) {
      parts.push({
        kind: 'lintel',
        from: span.from,
        to: span.to,
        zFrom: head,
        zTo: wall.height,
        opening
      })
    }

    cursor = Math.max(cursor, span.to)
  }

  if (total - cursor > none) {
    parts.push({ kind: 'solid', from: cursor, to: total, zFrom: 0, zTo: wall.height })
  }

  return parts
}

/**
 * The runs of wall drawn solid in plan.
 *
 * A lintel is invisible from above — looking down at the house, a door is just
 * a gap — so the plan view only needs the `solid` pieces.
 */
export function wallPlanSlices(wall: Wall, openings: readonly Opening[] = [], ends: WallEnds = SQUARE_ENDS): Vec2[][] {
  return wallParts(wall, openings)
    .filter((part) => part.kind === 'solid')
    .map((part) => wallSlicePolygon(wall, part.from, part.to, ends))
}
