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
 *   Reopened by WRT-3 (lab WR-4): an opening MAY state an `anchor`, what Grid's edits keep its
 *   place from when its wall changes: an end of the wall, or a named room's inside face.
 *   `offset` is still where it is drawn from. Optional, never defaulted (version 1).
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
 *   a height. It need not be a whole number: a half level sorts between two.
 *
 *   Reopened by LVL-1 (lab VE-2, VE-3): a floor MAY state where it stands and how
 *   high it is, in metres, apart from its order. `elevation` is the top of its
 *   floor slab above the ground floor's (0), `height` its clear height, which a
 *   wall on it that states no height of its own takes, and `slab` the thickness
 *   of the slab it stands on. All three are optional and never defaulted, so a
 *   plan that states none reads and stacks exactly as before (version 1).
 *
 * C6 · Items (CNT-12, on CNT-11's decision)
 *   A placed item has a kind, a place (`at`, the middle of its footprint), a turn (degrees,
 *   counter-clockwise), a size (width along its back × depth to its front), a height and a label.
 *   Items are one list, never walls and never rooms: they add no area and close no outline. The
 *   room an item is in is found from the outlines (the smallest room on its floor that holds its
 *   middle), never named. This version holds fixed fixtures only (`ITEM_KINDS`); loose furniture,
 *   points and seats are later, in the same shape.
 */
import { z } from 'zod'
import { BOUNDARY_MAX, PARTS_MAX, textProblem, type TextKind } from './planText'

export * from './planText'

/**
 * The error `parseFloorPlan` throws and one problem it lists. Callers take them from here and
 * never import the schema library themselves, so they always meet the copy the schema uses.
 */
export { ZodError as PlanSchemaError } from 'zod'
export type { ZodIssue as PlanSchemaIssue } from 'zod'

/**
 * A name, an id or a path from the plan (MSG-9): one line, no control or direction characters,
 * no lone half of a character pair, and no longer than its limit (`planText.ts`). A refusal
 * names the part and the limit, never the text.
 */
const text = (kind: TextKind) =>
  z.string().superRefine((value, ctx) => {
    const problem = textProblem(value, kind)
    if (problem !== null) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem })
  })

/** A list of parts, at most `PARTS_MAX` long (MSG-9). */
const parts = <T extends z.ZodTypeAny>(item: T, noun: string) =>
  z.array(item).superRefine((list, ctx) => {
    if (list.length <= PARTS_MAX) return
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `has ${list.length.toLocaleString('en-US')} entries; a plan may have at most ${PARTS_MAX.toLocaleString('en-US')} ${noun}`,
    })
  })

/**
 * Every number in a plan is finite (MSG-15, lab T-7). JSON reads a number too large to hold,
 * such as 1e400, as infinity; `z.number()` alone would accept it, and every area and export
 * built on it would hold "Infinity". How large a finite number may be is the geometry's
 * question (`largest` in `geometry/tolerances.ts`), not the schema's.
 */
const finite = (): z.ZodNumber =>
  z.number().finite({ message: 'Expected a finite number: this one is too large to hold and reads as infinity' })

// Coordinate pair [x, y] in meters (floor plan space, see C4)
const Vec2 = z.tuple([finite(), finite()])

/** C5: the floor an entity belongs to when it does not name one. */
export const DEFAULT_FLOOR_ID = 'ground'

export const FloorSchema = z.object({
  id: text('id').pipe(z.string().min(1)),
  name: text('name').pipe(z.string().min(1)),
  // Ordering only: 0 = ground, 1 = the floor above it, -1 = basement, 0.5 a half level
  // between them. NOT an elevation: that is `elevation` (C5).
  level: finite().default(0),
  // LVL-1 (C5, reopened). Optional and never defaulted: unstated, the floor stands where the
  // stacking rule puts it (`floorElevations`), as in a plan written before LVL-1.
  // Metres from the ground floor's floor level (0) to the top of this floor's slab.
  elevation: finite().optional(),
  // Metres from this floor's level to its ceiling: what a wall on it with no height takes.
  height: finite().positive().optional(),
  // Metres: the thickness of the slab this floor stands on.
  slab: finite().nonnegative().optional(),
  // LVL-4: metres the outside walls of this floor rise above the roof over it, where it has one
  // (every part of the floor with nothing above it). Optional and never defaulted: unstated, the
  // roof has no parapet (version 1).
  parapet: finite().positive().optional(),
})

export const WallKindSchema = z.enum(['exterior', 'interior', 'partition'])

/**
 * What a wall that does not state its thickness or height gets. A virtual wall is a
 * dividing line on the floor (an open-plan room contour, e.g. a kitchen open to the
 * dining room): it has no material, so it takes no floor and stands no height, and
 * 0 is both what it may state and what it gets.
 */
export const WALL_DEFAULTS = {
  solid: { thickness: 0.2, height: 2.7 },
  virtual: { thickness: 0, height: 0 },
} as const

/** Fills the thickness and height a wall leaves out, by whether it is virtual. */
function withWallDefaults(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw
  const wall = raw as Record<string, unknown>
  const defaults = wall.virtual === true ? WALL_DEFAULTS.virtual : WALL_DEFAULTS.solid
  return {
    ...wall,
    thickness: wall.thickness === undefined ? defaults.thickness : wall.thickness,
    height: wall.height === undefined ? defaults.height : wall.height,
  }
}

export const WallSchema = z.preprocess(
  withWallDefaults,
  z
    .object({
      id: text('id'),
      start: Vec2,
      end: Vec2,
      // C1: grows thickness/2 on each side of the start→end axis. A virtual wall's
      // written thickness is never used: it is a line, measured on its axis.
      thickness: finite(),
      height: finite(),
      // Explicit field — do not infer from thickness; an interior wall can be thick
      kind: WallKindSchema.default('interior'),
      // Boundary wall with no physical material (open-plan room contour, e.g. kitchen open to dining)
      virtual: z.boolean().optional(),
      // C5: unstated means the ground floor. Optional, not defaulted — a plan written
      // before floors existed must round-trip with no key added to it.
      floor: text('id').pipe(z.string().min(1)).optional(),
    })
    .superRefine((wall, ctx) => {
      // A solid wall needs some thickness and height; a dividing line may have none.
      const virtual = wall.virtual === true
      for (const key of ['thickness', 'height'] as const) {
        const value = wall[key]
        if (virtual ? value >= 0 : value > 0) continue
        // The same issue `.positive()` gave before, so its message and path do not change.
        ctx.addIssue({ code: z.ZodIssueCode.too_small, type: 'number', minimum: 0, inclusive: virtual, exact: false, path: [key] })
      }
    }),
)

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
  // LVL-3: a lift shaft, drawn as a room on every floor it serves. The drawing checks line the
  // shafts up from floor to floor; a lift is never taken as a way out.
  'lift',
  'storage',
  'other',
] as const

export const RoomUseSchema = z.enum(ROOM_USES)

/**
 * A use as Grid reads it (MSG-4): whatever its capitals, so `Bedroom` is `bedroom`. Anything
 * else is left as it is, for the schema to read as unstated and `readingNotes` to name.
 */
export function readUse(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const lower = value.toLowerCase()
  return (ROOM_USES as readonly string[]).includes(lower) ? lower : value
}

/** A list of wall ids round a room or one of its holes, at most `BOUNDARY_MAX` long (MSG-9). */
const wallList = () =>
  z.array(text('id')).superRefine((list, ctx) => {
    if (list.length <= BOUNDARY_MAX) return
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `lists ${list.length.toLocaleString('en-US')} walls; a room may list at most ${BOUNDARY_MAX.toLocaleString('en-US')}`,
    })
  })

/** LVL-4: the most points a lowered zone of a ceiling may have. */
export const CEILING_ZONE_MAX = BOUNDARY_MAX

/**
 * LVL-4: a part of a room's ceiling that is lower than the rest: a bulkhead over a kitchen, a
 * strip lowered for ducts. `points` is its outline on the plan (C4), three points or more; `height`
 * is metres from the room's floor to its underside.
 */
export const LoweredZoneSchema = z.object({
  name: text('name').optional(),
  points: z
    .array(Vec2)
    .min(3)
    .superRefine((list, ctx) => {
      if (list.length <= CEILING_ZONE_MAX) return
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `has ${list.length.toLocaleString('en-US')} points; a lowered zone may have at most ${CEILING_ZONE_MAX.toLocaleString('en-US')}`,
      })
    }),
  height: finite().positive(),
})

/**
 * LVL-4: a room's ceiling. It is flat, at the room's `height` (ARE-10) above its floor, or, when
 * the room states none, as high as its storey; `lowered` are the zones under it at their own
 * heights. Stating `ceiling` says the room has one: the IFC writes it, and a ceiling plan, lights
 * and grilles come later.
 */
export const CeilingSchema = z.object({
  lowered: parts(LoweredZoneSchema, 'lowered zones in one ceiling').optional(),
})

export const RoomSchema = z.object({
  id: text('id'),
  name: text('name'),
  // C3: ordered wall IDs in counter-clockwise order (top view), inner-face contour
  boundary: wallList(),
  // ARE-6: the holes in the room, one list of walls each, in the order they are met going
  // round the hole: a courtyard in a ring gallery, a core in a car park. The room's floor is
  // its outline less each hole, measured to the faces of the hole's walls that look into the
  // room, so the hole's walls are not floor either. Optional and never defaulted, so a plan
  // written before ARE-6 reads with no key added (version 1).
  holes: parts(wallList(), 'holes in one room').optional(),
  // C5: unstated means the ground floor. Every wall in `boundary` must be on this
  // same floor — a cross-floor boundary is a validation error.
  floor: text('id').pipe(z.string().min(1)).optional(),
  // Unstated means "not said", never a default, so an old plan gains no key. An
  // unknown value is read as unstated instead of rejecting the whole plan: `use`
  // only feeds advisory checks, and a parse error means no preview at all. MSG-4: a use is
  // read whatever its capitals, and one Grid does not know is named (`readingNotes`).
  use: z.preprocess(readUse, RoomUseSchema).optional().catch(undefined),
  // ARE-5: the room sits inside another room on its floor, as a wardrobe pod, a lift shaft or
  // an en-suite drawn inside a bedroom. The room it sits in is found from the outlines, never
  // named here: the smallest room on the same floor that holds it. Its floor, with its own
  // walls, is taken off that room, so every square metre is counted once. Optional and never
  // defaulted, so a plan written before ARE-5 reads with no key added (version 1).
  inside: z.boolean().optional(),
  // ARE-10: the room's height, floor to ceiling, in metres. Optional and never defaulted, so
  // a plan written before it reads with no key added (version 1). Unstated, the room is as
  // high as the lowest solid wall round it (`roomHeight` in the command's measuring).
  height: finite().positive().optional(),
  // LVL-7: how far the room's floor stands above (positive) or below (negative) its storey's
  // floor level, in metres: a genkan, a sunken wet area, a stage. A platform inside a room is
  // a room marked `inside` with its own offset, so one field says both. The step is drawn at
  // the openings to rooms at another level, and along a dividing line between them. Optional
  // and never defaulted: unstated, the room stands on its storey's floor (version 1).
  floorOffset: finite().optional(),
  // LVL-4: the room is a void, open to the floor below: it has no floor, so its storey's slab is
  // open over it and the room below rises through it. It adds no floor area and needs no door.
  // Optional and never defaulted (version 1).
  void: z.boolean().optional(),
  // LVL-4: the room's ceiling (CeilingSchema): it stands at the room's `height`, with any zones
  // lowered under it. Optional and never defaulted (version 1).
  ceiling: CeilingSchema.optional(),
})

/**
 * LVL-4: the site. `ground` is the level of the ground outside, in metres from the ground floor's
 * floor level (0), the same datum as a floor's `elevation`: -0.15 for a floor 15 cm above the
 * ground. With it stated, a door or window in an outside wall that lies below the ground is
 * named, and the ground floor is the floor nearest it. One level for the whole site: a ground
 * level for each wall, for a slope, comes later.
 */
export const SiteSchema = z.object({
  ground: finite().optional(),
})

export const OpeningTypeSchema = z.enum(['door', 'window', 'opening'])

/** The four sides of the drawing: north is +Y (C4). */
export const COMPASS_SIDES = ['north', 'east', 'south', 'west'] as const

/** What an opening's anchor measures from: an end of its wall, or a side of the drawing. */
export const ANCHOR_FROM = ['start', 'end', ...COMPASS_SIDES] as const

/**
 * WRT-3 (C2, reopened; lab WR-4): what an opening's place is kept from when Grid's edits change
 * its wall. `offset` stays the one place the opening is drawn from (C2); the anchor only tells
 * an edit what to keep. `from` is an end of the wall (`start`, `end`, or the end toward a side
 * of the drawing, so the wall's direction need not be known) or, with `room`, that room's
 * inside face on that side: the opening keeps the distance from it to its own nearer edge, as
 * rooms text writes `0.4 from west of hall`. Unstated, an edit keeps the opening where it is in
 * the building. Optional and never defaulted (version 1).
 */
export const OpeningAnchorSchema = z
  .object({
    from: z.enum(ANCHOR_FROM),
    room: text('id').pipe(z.string().min(1)).optional(),
  })
  .superRefine((anchor, ctx) => {
    if (anchor.room !== undefined && (anchor.from === 'start' || anchor.from === 'end')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['from'], message: 'measures from a side of the room it names: north, east, south or west, not an end of the wall' })
    }
  })

export const OpeningSchema = z.object({
  id: text('id'),
  wall: text('id'),
  type: OpeningTypeSchema,
  // C2: distance from wall.start to the NEAR edge of the opening, along the wall axis (m)
  offset: finite().nonnegative(),
  width: finite().positive(),
  // Height from the floor to the bottom of the opening; 0 for doors (sill at floor)
  sill: finite().nonnegative().default(0),
  height: finite().positive(),
  // Doors only. Optional and never defaulted: absent means "not decided",
  // and an undecided door draws no swing. `hinge` names the end of the opening
  // along the wall axis; `start` is the end nearer wall.start (the C2 datum).
  // `swing` names the face the door opens toward; `left` is the face the wall
  // normal points at (90 degrees counter-clockwise from start->end), as in
  // geometry/wall.ts `wallFaces`.
  hinge: z.enum(['start', 'end']).optional(),
  swing: z.enum(['left', 'right']).optional(),
  // WRT-3: what its place is kept from when an edit changes its wall (OpeningAnchorSchema).
  anchor: OpeningAnchorSchema.optional(),
})

export const ReferenceImageSchema = z.object({
  // Path relative to the project directory
  path: text('path'),
  opacity: finite().min(0).max(1).default(0.4),
  // Bumped on every write. The destination filename is stable
  // (assets/reference.<ext>), so replacing an image with one of the same
  // extension changes no other field — without this the renderer would keep
  // showing the previous picture until a reload.
  updatedAt: finite().optional(),
})

/** LVL-3: the most points a stair's walking line may have: a foot, a head and the turns between. */
export const STAIR_RUN_MAX = 64

/**
 * LVL-3 (decided in LVL-2): a stair is a designed object, stated once across the two floors it
 * joins. The plan says what is meant (where it starts and ends, how wide it is, and the line a
 * person walks up it) and Grid works out the rest: the rise from the floors' levels (LVL-1), the
 * number of risers, their height, the going and the pitch (`planStairs` in the geometry core),
 * and which room it leaves from and arrives in, which joins the two floors for the way-out check.
 * Optional and never defaulted, so a plan written before LVL-3 reads with no key added (version 1).
 */
/**
 * A straight stair said by its two ends, `start` and `end`, as the lab's agents first wrote one
 * (lab H-1, h01a), is read as the walking line `[start, end]`. Only when it states no `run`.
 */
export function withRunFromEnds(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw
  const stair = raw as Record<string, unknown>
  if (stair.run !== undefined || stair.start === undefined || stair.end === undefined) return raw
  const { start, end, ...rest } = stair
  return { ...rest, run: [start, end] }
}

export const StairSchema = z.preprocess(withRunFromEnds, z.object({
  id: text('id'),
  name: text('name').optional(),
  // The floor the walking line starts on and the floor it ends on. Either may be the higher.
  from: text('id').pipe(z.string().min(1)),
  to: text('id').pipe(z.string().min(1)),
  // Metres: the width of the flight, measured across the walking line, which runs down its middle.
  width: finite().positive(),
  // The walking line, in plan coordinates (C4): from the edge of the stair on `from` (the middle
  // of its first riser there) to its edge on `to`. A straight flight has two points; each point
  // between is a turn, with a square landing as wide as the flight centred on it. A straight
  // stair may say its two points as `start` and `end` instead (`withRunFromEnds`).
  run: z
    .array(Vec2)
    .min(2)
    .superRefine((list, ctx) => {
      if (list.length <= STAIR_RUN_MAX) return
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `has ${list.length.toLocaleString('en-US')} points; a stair's walking line may have at most ${STAIR_RUN_MAX}`,
      })
    }),
  // How many risers, when the design has chosen. Unstated, Grid works it out from the rise and
  // the walking line's length. Optional and never defaulted.
  risers: z.number().int().positive().optional(),
}))

/**
 * CNT-12: the kinds an item may be in this version. CNT-11 decided fixtures now, because the
 * checks need them, and furniture later; points (a hydrant, a camera) and seats come with it.
 * `kitchen-run` is a run of base units with its worktop, the sink and hob in it.
 */
export const ITEM_KINDS = ['toilet', 'basin', 'shower', 'bath', 'kitchen-run'] as const

export type ItemKind = (typeof ITEM_KINDS)[number]

/**
 * CNT-12 (C6): a fixture placed on a floor. It is never a wall and never a room: it adds no
 * floor area, closes no room and takes no part in a room's outline.
 *
 * `at` is the middle of its footprint on the plan. `size` is its width, along its back, and its
 * depth, from its back to its front. Unturned, its back faces -Y (down the 2D view) and its front
 * +Y; `turn` turns it counter-clockwise about `at`, in degrees. `height` is from the floor of the
 * room it stands in to its top. Every figure is the author's: Grid gives a fixture no size of its
 * own. `kind` is read as written, so a kind this version does not hold (a table) is left out with
 * a note (`item/unknown-kind`) instead of refusing the whole plan.
 */
export const ItemSchema = z.object({
  id: text('id'),
  kind: text('id'),
  at: Vec2,
  size: z.tuple([finite().positive(), finite().positive()]),
  height: finite().positive(),
  // Optional and never defaulted: unstated, the item is not turned.
  turn: finite().optional(),
  // What the drawing and an export call it: "WC", "Island". Unstated, its kind.
  label: text('name').optional(),
  // C5: unstated means the ground floor.
  floor: text('id').pipe(z.string().min(1)).optional(),
})

/**
 * SHT-7: what writing on the drawing can be. A `note` is text, a `tag` short text in a box, a
 * `symbol` one of `ANNOTATION_SYMBOLS`, and a `key` the drawing's key, listing what it shows.
 */
export const ANNOTATION_KINDS = ['note', 'tag', 'symbol', 'key'] as const
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number]

/** SHT-7: the symbols a drawing can carry: a north arrow, and the way in. */
export const ANNOTATION_SYMBOLS = ['north', 'entrance'] as const

/**
 * SHT-7: writing on the drawing. It is drawn and exported as text, and never measured or checked.
 *
 * It is placed at a point (`at`, in plan metres) or in a room (`room`, by id: under the room's
 * name), never both; a key placed by neither goes under the drawing. `floor` is the floor a note
 * placed at a point is on (C5: unstated, the ground floor); a note in a room is on its room's.
 * `turn` turns a symbol, in degrees counter-clockwise: a north arrow points up the drawing when
 * unturned. One object for every kind, so a field the format does not have is named (MSG-4).
 */
export const AnnotationSchema = z
  .object({
    id: text('id'),
    kind: z.enum(ANNOTATION_KINDS),
    text: text('name').optional(),
    symbol: z.enum(ANNOTATION_SYMBOLS).optional(),
    at: Vec2.optional(),
    room: text('id').optional(),
    floor: text('id').pipe(z.string().min(1)).optional(),
    turn: finite().optional(),
  })
  .superRefine((note, ctx) => {
    const say = (message: string, path: string): void => ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [path] })
    if (note.at !== undefined && note.room !== undefined) say('is placed both at a point and in a room: give one, at or room', 'room')
    if ((note.kind === 'note' || note.kind === 'tag') && (note.text === undefined || note.text.trim() === '')) say(`a ${note.kind} needs its text`, 'text')
    if (note.kind === 'symbol' && note.symbol === undefined) say(`a symbol needs which one: ${ANNOTATION_SYMBOLS.join(' or ')}`, 'symbol')
    if (note.kind !== 'key' && note.at === undefined && note.room === undefined) say(`a ${note.kind} needs a place: at, a point, or room, a room's id`, 'at')
  })

/** SHT-7: what a sketch item is: a line through points, an arc, a rectangle, a closed shape, or text. */
export const SKETCH_KINDS = ['line', 'arc', 'rect', 'shape', 'text'] as const
export type SketchKind = (typeof SKETCH_KINDS)[number]

/**
 * SHT-7: a sketch item, drawn in every plan view and exported on a layer of its own, and never
 * measured, checked or taken as a wall, a room or anything Grid understands: a garden, a street,
 * a fence, a hatch, an option's outline.
 *
 * `category` is the author's word for what it is ("garden", "street"): it names its layer in an
 * export and its entry in the key. `points` for a line (two or more) and a shape (three or
 * more); `from` and `to`, two opposite corners, for a rect; `at`, `radius`, `start` and `end`
 * (degrees counter-clockwise from +X, the arc running counter-clockwise) for an arc; `at` and
 * `text` for text. `floor`: C5, unstated is the ground floor.
 */
export const SketchItemSchema = z
  .object({
    id: text('id'),
    kind: z.enum(SKETCH_KINDS),
    category: text('id').pipe(z.string().min(1)),
    floor: text('id').pipe(z.string().min(1)).optional(),
    points: z.array(Vec2).max(BOUNDARY_MAX).optional(),
    from: Vec2.optional(),
    to: Vec2.optional(),
    at: Vec2.optional(),
    radius: finite().positive().optional(),
    start: finite().optional(),
    end: finite().optional(),
    text: text('name').optional(),
  })
  .superRefine((item, ctx) => {
    const need = (ok: boolean, message: string, path: string): void => {
      if (!ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `a sketch ${item.kind} needs ${message}`, path: [path] })
    }
    if (item.kind === 'line') need((item.points?.length ?? 0) >= 2, 'points, two or more', 'points')
    if (item.kind === 'shape') need((item.points?.length ?? 0) >= 3, 'points, three or more', 'points')
    if (item.kind === 'rect') {
      need(item.from !== undefined, 'from, one corner', 'from')
      need(item.to !== undefined, 'to, the opposite corner', 'to')
    }
    if (item.kind === 'arc') {
      need(item.at !== undefined, 'at, its centre', 'at')
      need(item.radius !== undefined, 'radius', 'radius')
      need(item.start !== undefined && item.end !== undefined, 'start and end, in degrees', 'start')
    }
    if (item.kind === 'text') {
      need(item.at !== undefined, 'at, where the text goes', 'at')
      need(item.text !== undefined && item.text.trim() !== '', 'its text', 'text')
    }
  })

/**
 * LVL-1: a solid wall that states no height takes its floor's stated `height`. Done on the file
 * as read, before the wall's own default (2.7 m) fills the gap, because after that a wall that
 * said 2.7 cannot be told from one that said nothing (lab AU3-6). A floor that states no
 * height, or a plan with no floor list, leaves every wall as it was.
 */
function withFloorHeights(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw
  const plan = raw as Record<string, unknown>
  if (!Array.isArray(plan.floors) || !Array.isArray(plan.walls)) return raw
  const heights = new Map<string, number>()
  for (const floor of plan.floors as unknown[]) {
    if (typeof floor !== 'object' || floor === null) continue
    const { id, height } = floor as Record<string, unknown>
    // The first entry wins, as in `planFloors`; a height the schema refuses is left to refuse.
    if (typeof id !== 'string' || heights.has(id)) continue
    if (typeof height === 'number' && Number.isFinite(height) && height > 0) heights.set(id, height)
  }
  if (heights.size === 0) return raw
  const walls = (plan.walls as unknown[]).map((wall) => {
    if (typeof wall !== 'object' || wall === null || Array.isArray(wall)) return wall
    const w = wall as Record<string, unknown>
    if (w.height !== undefined || w.virtual === true) return wall
    const floor = typeof w.floor === 'string' ? w.floor : DEFAULT_FLOOR_ID
    const height = heights.get(floor)
    return height === undefined ? wall : { ...w, height }
  })
  return { ...plan, walls }
}

/** The plan's fields, as an object. Read a plan with `FloorPlanSchema`, which also applies `withFloorHeights`. */
export const FloorPlanFieldsSchema = z.object({
  version: z.literal('1').default('1'),
  units: z.literal('m').default('m'),
  // QAR-5: the project's own id, which the IFC builds every element's identity from (with the
  // element's kind, floor and id), so a re-export of the project is recognised as the same
  // model whatever the file is called. `grid init` writes it. Keep it, and the parts' ids,
  // stable: a new id reads as a new element. Optional and never defaulted (version 1).
  projectId: text('id').pipe(z.string().min(1)).optional(),
  walls: parts(WallSchema, 'walls').default([]),
  rooms: parts(RoomSchema, 'rooms').default([]),
  openings: parts(OpeningSchema, 'openings').default([]),
  // C5: names and orders the floors. Advisory — a floor named only by a wall or
  // room still counts as a floor of the plan, so geometry can never become
  // unreachable because a registry entry was forgotten. See geometry/floors.ts.
  floors: parts(FloorSchema, 'floors').optional(),
  // LVL-3: stairs, each stated once across the floors it joins. Optional and never defaulted.
  stairs: parts(StairSchema, 'stairs').optional(),
  // LVL-4: the site, with its ground level (SiteSchema). Optional and never defaulted (version 1).
  site: SiteSchema.optional(),
  referenceImage: ReferenceImageSchema.optional(),
  // CNT-12: the fixtures (C6). Optional and never defaulted, so a plan written before it reads
  // with no key added (version 1).
  items: parts(ItemSchema, 'items').optional(),
  // SHT-7: writing on the drawing: the title over it, then notes, tags, symbols and a key, and a
  // sketch layer that is drawn only. Optional and never defaulted (version 1).
  title: text('name').optional(),
  annotations: parts(AnnotationSchema, 'annotations').optional(),
  sketch: parts(SketchItemSchema, 'sketch items').optional(),
  // WRT-2: the plan was last written from rooms text (`grid write`). `revision` is its
  // fingerprint as Grid wrote it, `boundaries` each room's boundary fingerprint: a boundary is
  // derived from where the rooms are, and one edited by hand is refused (`room/derived-edited`).
  // Optional and never defaulted (version 1). One that cannot be read is read as unstated.
  written: z
    .object({
      from: z.literal('rooms'),
      revision: z.string().regex(/^[0-9a-f]{16}$/),
      boundaries: z.record(text('id'), z.string().regex(/^[0-9a-f]{8}$/)),
    })
    .optional()
    .catch(undefined),
})

export const FloorPlanSchema = z.preprocess(withFloorHeights, FloorPlanFieldsSchema)

export type Vec2 = z.infer<typeof Vec2>
export type Floor = z.infer<typeof FloorSchema>
export type WallKind = z.infer<typeof WallKindSchema>
export type Wall = z.infer<typeof WallSchema>
export type RoomUse = z.infer<typeof RoomUseSchema>
export type Room = z.infer<typeof RoomSchema>
export type OpeningType = z.infer<typeof OpeningTypeSchema>
export type Opening = z.infer<typeof OpeningSchema>
export type Stair = z.infer<typeof StairSchema>
export type Ceiling = z.infer<typeof CeilingSchema>
export type LoweredZone = z.infer<typeof LoweredZoneSchema>
export type Site = z.infer<typeof SiteSchema>
export type OpeningAnchor = z.infer<typeof OpeningAnchorSchema>
export type ReferenceImage = z.infer<typeof ReferenceImageSchema>
export type Item = z.infer<typeof ItemSchema>
export type Annotation = z.infer<typeof AnnotationSchema>
export type SketchItem = z.infer<typeof SketchItemSchema>
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
