/**
 * FloorPlan — data model v1
 *
 * Closed conventions (do not change without team consensus):
 *
 * C1 · Wall thickness
 *   Grows symmetrically from the axis: thickness/2 on each side of the start→end line.
 *   The wall axis IS the reference line.
 *
 * C2 · Opening position
 *   `offset` is the distance from wall.start to the NEAR edge of the opening,
 *   measured along the wall axis.
 *   Invariant: offset >= 0 && offset + width <= wall_length.
 *
 * C3 · Room boundary
 *   Area is measured from INNER FACES (usable area — what the user walks on).
 *   Wall IDs in `boundary` must be ordered counter-clockwise (top view).
 *
 * C4 · Coordinate system
 *   Floor plan: +X right, +Y forward (up in 2D view). Units: meters.
 *   Three.js mapping: (plan_x, height, -plan_y). Three.js Y is vertical.
 *
 * C5 · Floors
 *   A plan is a stack of floors sharing ONE origin and one coordinate system.
 *   Every wall and room names the floor it belongs to; an unstated floor means
 *   the ground floor, which is what a single-floor plan is. Openings inherit
 *   their wall's floor and never state one of their own.
 *   Floors are NEVER offset in XY to "stack" them, and there is no z in the
 *   file: 3D stacks floors on slabs, at heights derived from their walls
 *   (`floorElevations` in the geometry core). Each floor's own geometry still
 *   rises from z = 0 (C4); stacking only translates it.
 *   `Floor.level` orders floors (0 ground, 1 above, -1 basement). It is an
 *   ordering index, NOT an elevation — it sets the order of the stack, never
 *   a height.
 */
import { z } from 'zod'

// Coordinate pair [x, y] in meters (floor plan space, see C4)
const Vec2 = z.tuple([z.number(), z.number()])

/** C5: the floor an entity belongs to when it does not name one. */
export const DEFAULT_FLOOR_ID = 'ground'

export const FloorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  // Ordering only: 0 = ground, 1 = the floor above it, -1 = basement.
  // NOT an elevation — 3D derives heights from the walls (C4/C5).
  level: z.number().int().default(0),
})

export const WallKindSchema = z.enum(['exterior', 'interior', 'partition'])

export const WallSchema = z.object({
  id: z.string(),
  start: Vec2,
  end: Vec2,
  // C1: grows thickness/2 on each side of the start→end axis
  thickness: z.number().positive().default(0.2),
  height: z.number().positive().default(2.7),
  // Explicit field — do not infer from thickness; an interior wall can be thick
  kind: WallKindSchema.default('interior'),
  // Boundary wall with no physical material (open-plan room contour, e.g. kitchen open to dining)
  virtual: z.boolean().optional(),
  // C5: unstated means the ground floor. Optional, not defaulted — a plan written
  // before floors existed must round-trip with no key added to it.
  floor: z.string().min(1).optional(),
})

// What a room is for. Explicit, like `Wall.kind`: nothing infers it from the
// room's name, shape or area.
export const ROOM_USES = [
  'bedroom',
  'living',
  'dining',
  'kitchen',
  'bathroom',
  'corridor',
  'stair',
  'storage',
  'other',
] as const

export const RoomUseSchema = z.enum(ROOM_USES)

export const RoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  // C3: ordered wall IDs in counter-clockwise order (top view), inner-face contour
  boundary: z.array(z.string()),
  // C5: unstated means the ground floor. Every wall in `boundary` must be on this
  // same floor — a cross-floor boundary is a validation error.
  floor: z.string().min(1).optional(),
  // Unstated means "not said", never a default, so an old plan gains no key. An
  // unknown value is read as unstated instead of rejecting the whole plan: `use`
  // only feeds advisory checks, and a parse error means no preview at all.
  use: RoomUseSchema.optional().catch(undefined),
})

export const OpeningTypeSchema = z.enum(['door', 'window', 'opening'])

export const OpeningSchema = z.object({
  id: z.string(),
  wall: z.string(),
  type: OpeningTypeSchema,
  // C2: distance from wall.start to the NEAR edge of the opening, along the wall axis (m)
  offset: z.number().nonnegative(),
  width: z.number().positive(),
  // Height from the floor to the bottom of the opening; 0 for doors (sill at floor)
  sill: z.number().nonnegative().default(0),
  height: z.number().positive(),
  // Doors only. Optional and never defaulted: absent means "not decided",
  // and an undecided door draws no swing. `hinge` names the end of the opening
  // along the wall axis; `start` is the end nearer wall.start (the C2 datum).
  // `swing` names the face the door opens toward; `left` is the face the wall
  // normal points at (90 degrees counter-clockwise from start->end), as in
  // geometry/wall.ts `wallFaces`.
  hinge: z.enum(['start', 'end']).optional(),
  swing: z.enum(['left', 'right']).optional(),
})

export const ReferenceImageSchema = z.object({
  // Path relative to the project directory
  path: z.string(),
  opacity: z.number().min(0).max(1).default(0.4),
  // Bumped on every write. The destination filename is stable
  // (assets/reference.<ext>), so replacing an image with one of the same
  // extension changes no other field — without this the renderer would keep
  // showing the previous picture until a reload.
  updatedAt: z.number().optional(),
})

export const FloorPlanSchema = z.object({
  version: z.literal('1').default('1'),
  units: z.literal('m').default('m'),
  walls: z.array(WallSchema).default([]),
  rooms: z.array(RoomSchema).default([]),
  openings: z.array(OpeningSchema).default([]),
  // C5: names and orders the floors. Advisory — a floor named only by a wall or
  // room still counts as a floor of the plan, so geometry can never become
  // unreachable because a registry entry was forgotten. See geometry/floors.ts.
  floors: z.array(FloorSchema).optional(),
  referenceImage: ReferenceImageSchema.optional(),
})

export type Vec2 = z.infer<typeof Vec2>
export type Floor = z.infer<typeof FloorSchema>
export type WallKind = z.infer<typeof WallKindSchema>
export type Wall = z.infer<typeof WallSchema>
export type RoomUse = z.infer<typeof RoomUseSchema>
export type Room = z.infer<typeof RoomSchema>
export type OpeningType = z.infer<typeof OpeningTypeSchema>
export type Opening = z.infer<typeof OpeningSchema>
export type ReferenceImage = z.infer<typeof ReferenceImageSchema>
export type FloorPlan = z.infer<typeof FloorPlanSchema>

export const EMPTY_FLOOR_PLAN: FloorPlan = {
  version: '1',
  units: 'm',
  walls: [],
  rooms: [],
  openings: [],
}

export function parseFloorPlan(raw: unknown): FloorPlan {
  return FloorPlanSchema.parse(raw)
}

export function safeParseFloorPlan(raw: unknown): FloorPlan | null {
  const result = FloorPlanSchema.safeParse(raw)
  return result.success ? result.data : null
}
