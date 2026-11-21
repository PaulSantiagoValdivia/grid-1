/**
 * Which properties of an entity differ between two versions.
 *
 * Numbers are equal when they are within the tolerance of each other; that is
 * a distance, not a rounding, so a value sitting on the edge of a rounding
 * grid cannot flicker between "changed" and "unchanged". Nothing is rewritten:
 * a change carries the plan's own numbers.
 */

import type { Floor, Opening, Room, Wall } from '../plan'
import { floorOf } from '../floors'
import type { PropChange } from './types'
import { tolerance } from '../tolerances'

type Point = readonly [number, number]

function near(a: number, b: number, epsilon: number): boolean {
  return Math.abs(a - b) <= epsilon
}

function number(
  key: string,
  before: number,
  after: number,
  epsilon: number
): PropChange | null {
  return near(before, after, epsilon) ? null : { key, before, after }
}

function point(key: string, before: Point, after: Point, epsilon: number): PropChange | null {
  return near(before[0], after[0], epsilon) && near(before[1], after[1], epsilon)
    ? null
    : { key, before: [before[0], before[1]], after: [after[0], after[1]] }
}

function exact(
  key: string,
  before: string | boolean,
  after: string | boolean
): PropChange | null {
  return before === after ? null : { key, before, after }
}

function present(changes: readonly (PropChange | null)[]): PropChange[] {
  return changes.filter((change): change is PropChange => change !== null)
}

/** In the schema's own order, so the result does not depend on how it was found. */
export function wallProps(before: Wall, after: Wall, epsilon: number): PropChange[] {
  return present([
    point('start', before.start, after.start, epsilon),
    point('end', before.end, after.end, epsilon),
    number('thickness', before.thickness, after.thickness, epsilon),
    number('height', before.height, after.height, epsilon),
    exact('kind', before.kind, after.kind),
    // Unstated and `false` are the same wall.
    exact('virtual', before.virtual === true, after.virtual === true),
    exact('floor', floorOf(before), floorOf(after))
  ])
}

export function roomProps(before: Room, after: Room): PropChange[] {
  const sameBoundary =
    before.boundary.length === after.boundary.length &&
    before.boundary.every((id, i) => id === after.boundary[i])
  return present([
    exact('name', before.name, after.name),
    // C3 gives the order meaning, so the same walls in another order are a change.
    sameBoundary ? null : { key: 'boundary', before: [...before.boundary], after: [...after.boundary] },
    exact('floor', floorOf(before), floorOf(after)),
    // ARE-5. Unstated and `false` are the same room.
    exact('inside', before.inside === true, after.inside === true)
  ])
}

/** A number a part may leave out (LVL-1): stated and unstated differ, and `null` stands for unstated. */
function optional(key: string, before: number | undefined, after: number | undefined, epsilon: number): PropChange | null {
  if (before === undefined && after === undefined) return null
  if (before === undefined || after === undefined) return { key, before: before ?? null, after: after ?? null }
  return number(key, before, after, epsilon)
}

export function floorProps(before: Floor, after: Floor): PropChange[] {
  const epsilon = tolerance('diffLength')
  return present([
    exact('name', before.name, after.name),
    number('level', before.level, after.level, 0),
    optional('elevation', before.elevation, after.elevation, epsilon),
    optional('height', before.height, after.height, epsilon),
    optional('slab', before.slab, after.slab, epsilon)
  ])
}

export function openingProps(before: Opening, after: Opening, epsilon: number): PropChange[] {
  return present([
    exact('wall', before.wall, after.wall),
    exact('type', before.type, after.type),
    number('offset', before.offset, after.offset, epsilon),
    number('width', before.width, after.width, epsilon),
    number('sill', before.sill, after.sill, epsilon),
    number('height', before.height, after.height, epsilon)
  ])
}
