/**
 * LVL-9: the marks a plan carries for its other drawings: where a section is cut and which way it
 * looks, where each elevation is seen from, and the level of each room's floor.
 *
 * - **A section mark** is the cut line as given, with the way it looks (`planSection`'s own frame),
 *   so the plan and the section say the same.
 * - **An elevation mark** stands outside each of the plan's four main sides (`planAxes`, SHT-4: the
 *   way most of its outside walls run), `elevationMarkOffset` beyond the drawing and its
 *   dimensions, looking at the building. It is named by the way that side faces: by the north the
 *   plan states, else by the drawing's own, north at the top (CNT-3).
 * - **A level mark** is each drawn room's floor level: its storey's (LVL-1) and its own offset
 *   (LVL-7), with whether the plan states the storey's elevation.
 *
 * Pure: where each mark is, in plan metres. How a mark looks is the viewer's.
 */

import type { FloorPlan } from './plan'
import type { Bounds, PlanDrawing } from './floorplan'
import { planAxes } from './dimensions'
import { floorElevations } from './elevations'
import { planFloors } from './floors'
import { bearingOf, compassPoint, planOrientation, type CompassPoint } from './orientation'
import { roomFloorOffset } from './steps'
import { limit } from './tolerances'
import type { Vec2 } from './vec2'
import { add, dot, scale } from './vec2'
import type { SectionLine } from './section'
import { sectionFrame } from './section'

export interface SectionMark {
  /** The cut line as given. */
  readonly from: Vec2
  readonly to: Vec2
  /** The way the section looks, a unit direction on the plan. */
  readonly look: Vec2
  /** The section's name on the drawing. */
  readonly label: string
}

export interface ElevationMark {
  /** The way the side of the building it looks at faces, by the compass. */
  readonly faces: CompassPoint
  /** Whether that is the north the plan states, or the drawing's top taken as north. */
  readonly northStated: boolean
  /** The middle of the mark. */
  readonly at: Vec2
  /** The way it looks: at the building, a unit direction on the plan. */
  readonly look: Vec2
}

export interface LevelMark {
  readonly room: string
  /** The room's label point, which the mark is drawn under. */
  readonly at: Vec2
  /** The top of the room's floor, in metres from the ground floor's floor level. */
  readonly level: number
  /** Whether the floor states its elevation (or stands at the datum, 0); otherwise worked out. */
  readonly stated: boolean
}

export interface DrawingMarks {
  readonly section: SectionMark | null
  readonly elevations: readonly ElevationMark[]
  readonly levels: readonly LevelMark[]
}

export interface DrawingMarksAsked {
  readonly section?: SectionLine | null
  readonly elevations?: boolean
  readonly levels?: boolean
}

/**
 * The marks of one floor's drawing. `around` is what the plan's picture frames before the marks
 * (the drawing and its dimensions); an elevation mark stands outside it.
 */
export function drawingMarks(plan: FloorPlan, floor: string, drawing: PlanDrawing, around: Bounds, asked: DrawingMarksAsked): DrawingMarks {
  let section: SectionMark | null = null
  if (asked.section != null) {
    section = { from: asked.section.from, to: asked.section.to, look: sectionFrame(asked.section).look, label: 'A' }
  }

  const elevations: ElevationMark[] = []
  if (asked.elevations === true && drawing.walls.length > 0) {
    const axes = planAxes(drawing.walls)
    const orientation = planOrientation(plan)
    const corners: Vec2[] = [around.min, { x: around.max.x, y: around.min.y }, around.max, { x: around.min.x, y: around.max.y }]
    const centre: Vec2 = { x: (around.min.x + around.max.x) / 2, y: (around.min.y + around.max.y) / 2 }
    const offset = limit('elevationMarkOffset')
    for (const side of [scale(axes.v, -1), axes.u, axes.v, scale(axes.u, -1)]) {
      const reach = Math.max(...corners.map((c) => dot(c, side))) - dot(centre, side)
      const bearing = bearingOf(side, orientation, orientation.north ?? 0) ?? 0
      elevations.push({ faces: compassPoint(bearing), northStated: orientation.north !== null, at: add(centre, scale(side, reach + offset)), look: scale(side, -1) })
    }
  }

  const levels: LevelMark[] = []
  if (asked.levels === true) {
    const storey = floorElevations(plan).floors.get(floor)
    const stated = planFloors(plan).find((f) => f.id === floor)?.elevation !== undefined || (storey?.floorLevel ?? 0) === 0
    const byId = new Map(plan.rooms.map((room) => [room.id, room] as const))
    for (const room of drawing.rooms) {
      const own = byId.get(room.id)
      const offset = own === undefined ? 0 : roomFloorOffset(own)
      levels.push({ room: room.id, at: room.labelAt, level: (storey?.floorLevel ?? 0) + offset, stated })
    }
  }

  return { section, elevations, levels }
}

/** The points the marks reach on the plan, for the picture to frame them too. */
export function marksExtent(marks: DrawingMarks): Vec2[] {
  return [...(marks.section === null ? [] : [marks.section.from, marks.section.to]), ...marks.elevations.map((m) => m.at)]
}
