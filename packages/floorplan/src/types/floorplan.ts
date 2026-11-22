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
 *
 * C7 · North, front and where the building is (CNT-3)
 *   C4 names the sides of the drawing (+Y is called north, as rooms text and the edits do); the
 *   plan MAY also state its real north. `north` is the way north lies on the drawing, in degrees
 *   counter-clockwise from +Y, as a north symbol's `turn` is: 0 north is up the drawing, 90 it
 *   points to -X, -90 to +X. `yAxis` says which way +Y runs on the drawing as the building is
 *   seen from above, with +X to the right: `up` is C4, `down` says the coordinates are the
 *   building's mirror image (as a screen or an image's pixels run). `front` names the part whose
 *   outside face is the front: a wall, or an opening (the front door) by its wall. `site` says
 *   where the building sits: `origin`, a point of the plan, and where that point is on the earth
 *   (`latitude` and `longitude` in degrees, `elevation` in metres); it places nothing without
 *   `origin`. LVL-4 adds `site.ground`, the ground's level from the ground floor's (no `origin`
 *   needed). All four are optional and
 *   never defaulted, so a plan that states none reads exactly as before (version 1): it has no
 *   north, and its y runs up (C4).
 *
 * C8 · Where a value came from (WRT-6, lab WR-15, AE-4, AU3-6)
 *   A value may say where it came from: given by the person, measured, scanned or assumed, and
 *   how sure it is (`tolerance`, metres). It says so in the plan's `marks`, one list beside the
 *   parts, by part, id and value: no number becomes an object and no part changes shape.
 *   A value a wall leaves out stays not stated: the reading fills its thickness, height and kind
 *   for the geometry (the derived layer: a height from the wall's floor, else `WALL_DEFAULTS`)
 *   and says which in `unstated`, which is never written back (`statedWall`). Version 1.
 *
 * C9 · Facts of the person's own (CNT-9)
 *   A wall, an opening, a room and a floor MAY carry facts of the person's own in `properties`:
 *   a name and a value, text, a number or true or false (a fire rating, a department, a head
 *   count). They sit in that one object, never as loose fields, so a misspelt field of the
 *   format is still named (MSG-4). A room MAY state its room number in `number`. Grid checks
 *   nothing against a fact. Optional and never defaulted (version 1).
 *
 * C10 · The place (COD-3)
 *   `site.country` names the country the building will be built in, by a name or a code on
 *   Grid's list (`places.ts`); any other text is refused, naming the field and never the text.
 *   It picks the figures the checks apply (`@ongrid/rules`); a plan that states no place gets
 *   no figure applied, and its report says so. Optional and never defaulted (version 1).
 */
import { z } from 'zod'
import { BOUNDARY_MAX, PARTS_MAX, PROPERTIES_MAX, textProblem, type TextKind } from './planText'
import { factKey } from './facts'
import { placeProblem } from './places'
import { roofFrame, roofTop } from './roofFrame'

export * from './planText'
export * from './facts'

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

/** COD-3: a place, by a name or a code on Grid's list. A refusal names the field and the rule, never the text. */
const placeText = () =>
  z.string().superRefine((value, ctx) => {
    const problem = textProblem(value, 'name') ?? placeProblem(value)
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

/**
 * CNT-9 (C9): facts of the person's own, by name: text (one line, at most a name's length), a
 * finite number, or true or false. A name is one line and not blank; two names one part carries
 * may not differ only in capitals, spaces, dashes or underscores (`factKey`), and a part carries
 * at most `PROPERTIES_MAX`. A fact the schema refuses is left out on its own, not with the others
 * (`readParts.ts`). Grid checks nothing against a fact.
 */
export const PropertiesSchema = z
  .record(
    text('name').pipe(z.string().refine((name) => name.trim().length > 0, { message: 'is blank: a fact needs a name' })),
    z.union([text('name').pipe(z.string().min(1)), finite(), z.boolean()]),
  )
  .superRefine((facts, ctx) => {
    const names = Object.keys(facts)
    if (names.length > PROPERTIES_MAX) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `has ${names.length.toLocaleString('en-US')} facts; one part may carry at most ${PROPERTIES_MAX}` })
      return
    }
    const seen = new Map<string, string>()
    for (const name of names) {
      const key = factKey(name)
      const first = seen.get(key)
      if (first === undefined) seen.set(key, name)
      else ctx.addIssue({ code: z.ZodIssueCode.custom, path: [name], message: 'names the same fact as another name on this part, in other capitals or spaces' })
    }
  })

/** C5: the floor an entity belongs to when it does not name one. */
export const DEFAULT_FLOOR_ID = 'ground'

/**
 * CNT-5: what kind of building the plan is, or a floor of it is (`Floor.building`). A figure
 * check runs only in the kinds of building its figures were read for (`packages/rules`). One
 * kind for each, in Grid's own words (`BUILDING_TYPE_TEXT`); a building of mixed use says so
 * floor by floor.
 */
export const BUILDING_TYPES = [
  'home',
  'office',
  'shop',
  'food',
  'hotel',
  'school',
  'health',
  'sport',
  'assembly',
  'industry',
  'warehouse',
  'parking',
  'other',
] as const

export const BuildingTypeSchema = z.enum(BUILDING_TYPES)

export type BuildingType = z.infer<typeof BuildingTypeSchema>

/** Each kind of building as a sentence names it, with its article: "this plan is an office". */
export const BUILDING_TYPE_TEXT: Readonly<Record<BuildingType, string>> = {
  home: 'a home',
  office: 'an office',
  shop: 'a shop',
  food: 'a café, restaurant or bar',
  hotel: 'a hotel or hostel',
  school: 'a school',
  health: 'a health building, such as a clinic',
  sport: 'a sports building',
  assembly: 'a building people gather in, such as a hall',
  industry: 'a workshop or factory',
  warehouse: 'a warehouse',
  parking: 'a car park',
  other: 'another kind of building',
}

/** The four sides of the drawing: north is +Y (C4). */
export const COMPASS_SIDES = ['north', 'east', 'south', 'west'] as const

/** LVL-6: the shapes a roof over a floor can take. */
export const ROOF_SHAPES = ['flat', 'mono-pitch', 'gable', 'hip'] as const

/** LVL-6: the two ways a gable's ridge can run, along the sides of the drawing (C4). */
export const RIDGE_RUNS = ['east-west', 'north-south'] as const

/**
 * LVL-6: a window in the roof's slope. `at` is its middle on the plan (C4); `width` runs along the
 * slope's eaves and `length` up the slope, both measured on the slope, as a rooflight's size is
 * given. It lies in one plane of the roof, wholly inside the roof.
 */
export const RooflightSchema = z.object({
  id: text('id').pipe(z.string().min(1)),
  at: Vec2,
  width: finite().positive(),
  length: finite().positive(),
})

/**
 * LVL-6: the roof over a floor, as planes its walls and rooms are cut to. Heights are metres
 * above the floor's level, to the roof's underside (the ceiling under it), measured on the lines
 * of the floor's outside walls: the roof's eaves lie along the sides of the smallest rectangle
 * that holds those lines, turned to the floor's longest outside wall.
 *
 * - `flat`: the underside is level at `eaves`.
 * - `mono-pitch`: one plane, from `eaves` on the side opposite `highSide`, rising to that side.
 * - `gable`: two planes from `eaves` on the two sides along `ridgeRuns` (unstated, along the
 *   rectangle's longer sides), meeting at the ridge over the middle.
 * - `hip`: four planes from `eaves` on all four sides, at one pitch.
 *
 * A sloped roof states its `pitch` in degrees, or its `ridge`, the underside's height at the top
 * (the high side of a mono-pitch roof), never both. `rooflights` are its windows. `dormers` are
 * not drawn yet: a roof that lists any is drawn without them, and the check says so.
 */
export const RoofSchema = z
  .object({
    shape: z.enum(ROOF_SHAPES),
    eaves: finite().positive(),
    pitch: finite().gt(0).lt(90).optional(),
    ridge: finite().positive().optional(),
    ridgeRuns: z.enum(RIDGE_RUNS).optional(),
    highSide: z.enum(COMPASS_SIDES).optional(),
    rooflights: parts(RooflightSchema, 'rooflights in one roof').optional(),
    dormers: z.array(z.unknown()).optional(),
  })
  .superRefine((roof, ctx) => {
    const add = (path: string, message: string): void => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message })
    const sloped = roof.shape !== 'flat'
    if (!sloped && (roof.pitch !== undefined || roof.ridge !== undefined)) add(roof.pitch !== undefined ? 'pitch' : 'ridge', 'belongs to a sloped roof: a flat roof states only its eaves, the height of its underside')
    if (sloped && (roof.pitch === undefined) === (roof.ridge === undefined)) add('pitch', 'needs the pitch in degrees or the ridge height in metres, one of the two: either gives the slope')
    if (roof.ridge !== undefined && !(roof.ridge > roof.eaves)) add('ridge', 'must be higher than the eaves: the roof rises from its eaves to its ridge')
    if (roof.ridgeRuns !== undefined && roof.shape !== 'gable') add('ridgeRuns', 'belongs to a gable roof: only a gable says which way its ridge runs')
    if (roof.shape === 'mono-pitch' && roof.highSide === undefined) add('highSide', 'is needed on a mono-pitch roof: the side of the drawing it rises to, north, east, south or west')
    if (roof.highSide !== undefined && roof.shape !== 'mono-pitch') add('highSide', 'belongs to a mono-pitch roof: only it has one high side')
  })

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
  // LVL-6: the roof over this floor (RoofSchema): flat, mono-pitch, gable or hip, which its walls
  // and rooms are cut to. Optional and never defaulted: unstated, the roof is flat on the floor's
  // walls, as LVL-4 made it (version 1).
  roof: RoofSchema.optional(),
  // CNT-5: what kind of building this floor is, when it is not the plan's (`FloorPlan.building`):
  // the shop on the ground floor of a block of flats. Optional and never defaulted: unstated, the
  // floor is the plan's kind (version 1).
  building: BuildingTypeSchema.optional(),
  // CNT-9 (C9): facts of the person's own. Optional and never defaulted (version 1).
  properties: PropertiesSchema.optional(),
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

/**
 * WRT-6 (lab AU3-6): what a solid wall may leave out, which the reading fills (`WALL_DEFAULTS`,
 * or its floor's stated height) and records in `unstated`, so a value left out stays "not
 * stated" for everything that reads the plan back or writes it again.
 */
export const UNSTATED_WALL_VALUES = ['thickness', 'height', 'kind'] as const
export type UnstatedWallValue = (typeof UNSTATED_WALL_VALUES)[number]

/**
 * Set by `withFloorHeights` on a wall whose height it took from the wall's floor, so that
 * `withWallDefaults` records the height as not stated. A symbol, so no file can write it.
 */
const HEIGHT_FROM_FLOOR = Symbol('height from the floor')

/**
 * Fills the thickness and height a wall leaves out, by whether it is virtual, and records what a
 * solid wall left out in `unstated` (WRT-6). A file's own `unstated` is not read: it is the
 * reading's, and `readingNotes` names it as a field Grid does not know.
 */
function withWallDefaults(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw
  const wall: Record<string, unknown> = { ...(raw as Record<string, unknown>) }
  delete wall.unstated
  const virtual = wall.virtual === true
  const defaults = virtual ? WALL_DEFAULTS.virtual : WALL_DEFAULTS.solid
  const left: UnstatedWallValue[] = []
  if (!virtual) {
    if (wall.thickness === undefined) left.push('thickness')
    if (wall.height === undefined || (raw as Record<symbol, unknown>)[HEIGHT_FROM_FLOOR] === true) left.push('height')
    if (wall.kind === undefined) left.push('kind')
  }
  return {
    ...wall,
    thickness: wall.thickness === undefined ? defaults.thickness : wall.thickness,
    height: wall.height === undefined ? defaults.height : wall.height,
    ...(left.length > 0 ? { unstated: left } : {}),
  }
}

/**
 * A wall as its file states it (WRT-6): without the values the reading filled in and without
 * `unstated`, for whatever writes a wall back, so a default never lands in a file that stated
 * none. A wall that left nothing out is returned as it is.
 */
export function statedWall<T extends { readonly unstated?: readonly UnstatedWallValue[] }>(wall: T): Omit<T, 'unstated'> {
  if (wall.unstated === undefined) return wall
  const { unstated, ...rest } = wall
  const out: Record<string, unknown> = { ...rest }
  for (const key of unstated) delete out[key]
  return out as Omit<T, 'unstated'>
}

/** Whether a wall's height was left out of its file, so the reading filled it (WRT-6). */
export function heightStated(wall: { readonly unstated?: readonly UnstatedWallValue[] }): boolean {
  return !(wall.unstated ?? []).includes('height')
}

/**
 * WRT-6 (lab AU3-6): whether a solid wall's height is stated by nothing, not by the wall and not
 * by its floor, so the reading gave it Grid's default (`WALL_DEFAULTS`). A height its floor
 * states is stated, once, on the floor. A dividing line has no height to state.
 */
export function heightByDefault(
  plan: { readonly floors?: readonly { readonly id: string; readonly height?: number | undefined }[] | undefined },
  wall: { readonly virtual?: boolean | undefined; readonly floor?: string | undefined; readonly unstated?: readonly UnstatedWallValue[] | undefined },
): boolean {
  if (wall.virtual === true || heightStated(wall)) return false
  const floor = wall.floor ?? DEFAULT_FLOOR_ID
  return (plan.floors ?? []).find((f) => f.id === floor)?.height === undefined
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
      // CNT-9 (C9): facts of the person's own. Optional and never defaulted (version 1).
      properties: PropertiesSchema.optional(),
      // WRT-6: what the file left out and the reading filled in (`withWallDefaults`). Grid's
      // reading only: never in a file, and written back by `statedWall` without those values.
      unstated: z.array(z.enum(UNSTATED_WALL_VALUES)).optional(),
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
// room's name, shape or area. CNT-5: the list reaches past homes, in groups: rooms of a home,
// rooms people work, buy, learn, are treated or train in, rooms for moving between floors and
// rooms, and rooms for services. `assembly` is a room people gather in: a hall, an auditorium,
// a function room. The person's own word for a room is its name ("Pooja room",
// "Bryggers"); its use is the one of these it is.
export const ROOM_USES = [
  'bedroom',
  'living',
  'dining',
  'kitchen',
  'bathroom',
  'toilet',
  'utility',
  'study',
  'office',
  'meeting',
  'reception',
  'retail',
  'classroom',
  'treatment',
  'waiting',
  'sport',
  'changing',
  'staff',
  'worship',
  'assembly',
  'corridor',
  'stair',
  // LVL-3: a lift shaft, drawn as a room on every floor it serves. The drawing checks line the
  // shafts up from floor to floor; a lift is never taken as a way out.
  'lift',
  'storage',
  'plant',
  'parking',
  'other',
] as const

export const RoomUseSchema = z.enum(ROOM_USES)

/**
 * CNT-5: words people and agents write for a room's use that plainly mean one of `ROOM_USES`,
 * local words among them (`bryggers`, Danish for a utility room; `pooja`, a prayer room), folded
 * as `foldUseWord` folds them. A use written as one of these words is read as its use; the word
 * stays the room's name, which is where the person's own word belongs.
 *
 * No word here is read as `bedroom`, `living` or `dining`: the figure checks look at rooms of
 * those uses (`packages/rules`), so a room comes under them only by its author's own choice of
 * use, never by a word Grid read for them. `bed` or `lounge` stays a suggestion (`nearestUse`).
 * Nor does a word that means two things (`hall`, `studio`) read as either.
 */
export const USE_WORDS: Readonly<Record<string, RoomUse>> = {
  wc: 'toilet',
  loo: 'toilet',
  lavatory: 'toilet',
  restroom: 'toilet',
  washroom: 'toilet',
  shower: 'bathroom',
  showers: 'bathroom',
  ensuite: 'bathroom',
  kitchenette: 'kitchen',
  laundry: 'utility',
  scullery: 'utility',
  bryggers: 'utility',
  offices: 'office',
  workspace: 'office',
  boardroom: 'meeting',
  conference: 'meeting',
  shop: 'retail',
  sales: 'retail',
  servery: 'retail',
  teaching: 'classroom',
  consulting: 'treatment',
  consultation: 'treatment',
  examination: 'treatment',
  gym: 'sport',
  fitness: 'sport',
  locker: 'changing',
  lockers: 'changing',
  staffroom: 'staff',
  prayer: 'worship',
  pooja: 'worship',
  puja: 'worship',
  chapel: 'worship',
  hallway: 'corridor',
  passage: 'corridor',
  landing: 'corridor',
  lobby: 'corridor',
  circulation: 'corridor',
  stairs: 'stair',
  staircase: 'stair',
  stairwell: 'stair',
  elevator: 'lift',
  store: 'storage',
  stockroom: 'storage',
  warehouse: 'storage',
  closet: 'storage',
  cupboard: 'storage',
  pantry: 'storage',
  larder: 'storage',
  wardrobe: 'storage',
  plantroom: 'plant',
  boiler: 'plant',
  garage: 'parking',
  carpark: 'parking',
}

/**
 * A use word as `USE_WORDS` holds it: lower case, letters and digits only, and a last "room"
 * taken off, so `Pooja room`, `staff_room` and `Plant-room` are `pooja`, `staff` and `plant`.
 */
export function foldUseWord(word: string): string {
  const folded = word.toLowerCase().replace(/[^a-z0-9]/g, '')
  return folded.length > 4 && folded.endsWith('room') ? folded.slice(0, -4) : folded
}

/**
 * A use as Grid reads it (MSG-4, CNT-5): whatever its capitals, so `Bedroom` is `bedroom`; and a
 * word that plainly means a use (`USE_WORDS`), so `WC` is `toilet` and `staff room` is `staff`.
 * Anything else is left as it is, for the schema to read as unstated and `readingNotes` to name.
 */
export function readUse(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const lower = value.toLowerCase()
  if ((ROOM_USES as readonly string[]).includes(lower)) return lower
  const folded = foldUseWord(value)
  if ((ROOM_USES as readonly string[]).includes(folded) && !FIGURE_READ_USES.includes(folded)) return folded
  return Object.hasOwn(USE_WORDS, folded) ? USE_WORDS[folded] : value
}

/** The uses no word is read as (`USE_WORDS`): written as they are, or not at all. */
const FIGURE_READ_USES: readonly string[] = ['bedroom', 'living', 'dining']

/**
 * CNT-5: who a room is for. `private`: one household's or one tenant's own (a flat's bedroom, an
 * office let to one firm). `shared`: shared by some households or tenants and not others (a
 * kitchen shared by four student rooms). `common`: the building's, for everyone in it (the
 * stair, the entrance lobby, the bin store). `commercial`: let or run as a business (a shop).
 * Optional and never defaulted; no check reads it yet.
 */
export const ROOM_TENURES = ['private', 'shared', 'common', 'commercial'] as const

export const RoomTenureSchema = z.enum(ROOM_TENURES)

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
  // CNT-5: who the room is for (`ROOM_TENURES`). Optional and never defaulted (version 1).
  tenure: RoomTenureSchema.optional(),
  // CNT-5: the firm's own type for the room, as its room data sheets name it ("B2 double
  // bedroom", "Consult A"), beside the fixed `use`. Grid keeps it and reads nothing from it.
  // Optional and never defaulted (version 1).
  roomType: text('name').optional(),
  // CNT-9 (C9): the room's number as the person states it, text: "101", "G.04", "B-12a". The
  // schedules give it in place of the number Grid counts, and the IFC space takes it as its name.
  // Optional and never defaulted (version 1).
  number: text('id').pipe(z.string().refine((value) => value.trim().length > 0, { message: 'is blank: leave the number out instead' })).optional(),
  // CNT-9 (C9): facts of the person's own. Optional and never defaulted (version 1).
  properties: PropertiesSchema.optional(),
})

export const OpeningTypeSchema = z.enum(['door', 'window', 'opening'])

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
  // CNT-9 (C9): facts of the person's own. Optional and never defaulted (version 1).
  properties: PropertiesSchema.optional(),
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

/** CNT-3 (C7): which way +Y runs on the drawing, with +X to the right. `up` is C4. */
export const Y_AXES = ['up', 'down'] as const
export type YAxis = (typeof Y_AXES)[number]

/**
 * CNT-3 (C7): the front of the building: the outside face of a wall, or of the wall an opening
 * (the front door) is in. Exactly one of the two.
 */
export const FrontSchema = z
  .object({
    wall: text('id').pipe(z.string().min(1)).optional(),
    opening: text('id').pipe(z.string().min(1)).optional(),
  })
  .superRefine((front, ctx) => {
    if ((front.wall === undefined) === (front.opening === undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['wall'], message: 'names the front by one part: wall, a wall\'s id, or opening, an opening\'s id' })
    }
  })

/**
 * CNT-3 (C7): where the building sits. `origin` is a point of the plan, in metres; `latitude` and
 * `longitude` (degrees, north and east positive, given together) and `elevation` (metres above
 * sea level) say where that point is on the earth. Each is optional, so a site an agent wrote
 * with fields Grid does not hold yet (a plot boundary, setbacks) still reads, with those fields
 * named; nothing is placed on the earth until `origin` is stated.
 *
 * LVL-4: `ground` is the level of the ground outside, in metres from the ground floor's floor
 * level (0), the same datum as a floor's `elevation` (not `site.elevation`, which is above sea
 * level): -0.15 for a floor 15 cm above the ground. It needs no `origin`. With it stated, a door
 * or window in an outside wall that lies below the ground is named, and the ground floor is the
 * floor nearest it. One level for the whole site: a ground level for each wall, for a slope,
 * comes later.
 */
export const SiteSchema = z
  .object({
    origin: Vec2.optional(),
    latitude: finite().min(-90).max(90).optional(),
    longitude: finite().min(-180).max(180).optional(),
    elevation: finite().optional(),
    ground: finite().optional(),
    // COD-3: the country the building will be built in, by its name or its two- or three-letter
    // code (ISO 3166-1), as Grid's list (`places.ts`) has it. It picks the figures the checks
    // apply; with none stated, no figure is applied. Kept as written; a report names the place
    // from the list, never from this text.
    country: placeText().optional(),
  })
  .superRefine((site, ctx) => {
    if ((site.latitude === undefined) !== (site.longitude === undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [site.latitude === undefined ? 'latitude' : 'longitude'], message: 'needs latitude and longitude together: one alone places nothing' })
    }
  })

/**
 * WRT-6 (lab WR-15, AE-4): where a value came from. `given` by the person, `measured` (taped or
 * lasered), `scanned` (from a capture of the building) or `assumed` by whoever wrote the plan.
 */
export const MARK_SOURCES = ['given', 'measured', 'scanned', 'assumed'] as const
export type MarkSource = (typeof MARK_SOURCES)[number]

/** WRT-6: the parts a mark can be on, and the values of each it can name. */
export const MARKED_VALUES = {
  wall: ['start', 'end', 'thickness', 'height', 'kind'],
  room: ['name', 'use', 'height', 'floorOffset'],
  opening: ['type', 'offset', 'width', 'height', 'sill', 'hinge', 'swing'],
  floor: ['name', 'level', 'elevation', 'height', 'slab'],
  item: ['kind', 'at', 'size', 'height', 'turn'],
} as const satisfies Record<string, readonly string[]>
export type MarkedPart = keyof typeof MARKED_VALUES
export const MARKED_PARTS = Object.keys(MARKED_VALUES) as MarkedPart[]

/** The values a mark's tolerance can be on: lengths. A word (a kind, a use, a name) has none. */
export const MARKED_LENGTHS: ReadonlySet<string> = new Set(['start', 'end', 'thickness', 'height', 'floorOffset', 'offset', 'width', 'sill', 'elevation', 'slab', 'at', 'size'])

/**
 * WRT-6: a mark on one value of one part, or on the part as a whole (no `value`): where it came
 * from and, where that matters, how sure it is. `tolerance` is in metres, give or take, on each
 * length the mark covers: a scanned wall within 0.02 m. A mark on a value wins over a mark on its
 * part. The marks are one list beside the parts, so no part and no number changes shape: a plan
 * with none reads exactly as before. Optional and never defaulted (version 1).
 */
export const MarkSchema = z
  .object({
    part: z.enum(MARKED_PARTS as [MarkedPart, ...MarkedPart[]]),
    id: text('id').pipe(z.string().min(1)),
    value: text('id').pipe(z.string().min(1)).optional(),
    source: z.enum(MARK_SOURCES),
    tolerance: finite().positive().optional(),
  })
  .superRefine((mark, ctx) => {
    const values: readonly string[] = MARKED_VALUES[mark.part]
    if (mark.value !== undefined && !values.includes(mark.value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: `names a value a ${mark.part} mark cannot be on: one of ${values.join(', ')}, or none for the whole ${mark.part}` })
    }
    if (mark.tolerance !== undefined && mark.value !== undefined && !MARKED_LENGTHS.has(mark.value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tolerance'], message: `is on ${mark.value}, which is not a length: a tolerance is in metres, on a length` })
    }
  })

/**
 * LVL-1: a solid wall that states no height takes its floor's stated `height`. Done on the file
 * as read, before the wall's own default (2.7 m) fills the gap. WRT-6 (lab AU3-6): either way the
 * wall records its height as not stated (`unstated`), so the reading is the derived layer and a
 * stated 2.7 can still be told from one that said nothing. A floor that states no height, or a
 * plan with no floor list, leaves every wall as it was.
 *
 * LVL-6: on a floor that states its `roof`, such a wall rises to the roof instead: it takes the
 * roof's top (its ridge, or a flat roof's eaves), and the roof cuts it to its slope. A gable drawn
 * with no height is then the gable's shape. Its height is recorded as not stated all the same.
 */
function withFloorHeights(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw
  const plan = raw as Record<string, unknown>
  if (!Array.isArray(plan.floors) || !Array.isArray(plan.walls)) return raw
  const heights = new Map<string, number>()
  const roofs = new Map<string, Roof>()
  const seen = new Set<string>()
  for (const floor of plan.floors as unknown[]) {
    if (typeof floor !== 'object' || floor === null) continue
    const { id, height, roof } = floor as Record<string, unknown>
    // The first entry wins, as in `planFloors`; a height the schema refuses is left to refuse.
    if (typeof id !== 'string' || seen.has(id)) continue
    seen.add(id)
    if (typeof height === 'number' && Number.isFinite(height) && height > 0) heights.set(id, height)
    if (roof !== undefined) {
      const read = RoofSchema.safeParse(roof)
      if (read.success) roofs.set(id, read.data)
    }
  }
  if (heights.size === 0 && roofs.size === 0) return raw
  const floorOfRaw = (w: Record<string, unknown>): string => (typeof w.floor === 'string' ? w.floor : DEFAULT_FLOOR_ID)
  const tops = new Map<string, number>()
  for (const [id, roof] of roofs) {
    const lines = (plan.walls as unknown[]).flatMap((wall) => {
      if (typeof wall !== 'object' || wall === null || Array.isArray(wall)) return []
      const w = wall as Record<string, unknown>
      if (w.virtual === true || floorOfRaw(w) !== id || !isPair(w.start) || !isPair(w.end)) return []
      return [{ start: w.start, end: w.end, outside: w.kind === 'exterior' }]
    })
    const outside = lines.filter((l) => l.outside)
    const frame = roofFrame(outside.length > 0 ? outside : lines)
    if (frame !== null) tops.set(id, roofTop(roof, frame))
  }
  const walls = (plan.walls as unknown[]).map((wall) => {
    if (typeof wall !== 'object' || wall === null || Array.isArray(wall)) return wall
    const w = wall as Record<string, unknown>
    if (w.height !== undefined || w.virtual === true) return wall
    const floor = floorOfRaw(w)
    const height = tops.get(floor) ?? heights.get(floor)
    return height === undefined ? wall : { ...w, height, [HEIGHT_FROM_FLOOR]: true }
  })
  return { ...plan, walls }
}

const isPair = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length === 2 && value.every((v) => typeof v === 'number' && Number.isFinite(v))

/** The plan's fields, as an object. Read a plan with `FloorPlanSchema`, which also applies `withFloorHeights`. */
export const FloorPlanFieldsSchema = z.object({
  version: z.literal('1').default('1'),
  units: z.literal('m').default('m'),
  // CNT-5: what kind of building the plan is (`BUILDING_TYPES`). A floor may say otherwise for
  // itself (`Floor.building`). Optional and never defaulted: unstated, the plan does not say,
  // and the figure checks run as they did before CNT-5 (version 1).
  building: BuildingTypeSchema.optional(),
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
  referenceImage: ReferenceImageSchema.optional(),
  // CNT-12: the fixtures (C6). Optional and never defaulted, so a plan written before it reads
  // with no key added (version 1).
  items: parts(ItemSchema, 'items').optional(),
  // SHT-7: writing on the drawing: the title over it, then notes, tags, symbols and a key, and a
  // sketch layer that is drawn only. Optional and never defaulted (version 1).
  title: text('name').optional(),
  annotations: parts(AnnotationSchema, 'annotations').optional(),
  sketch: parts(SketchItemSchema, 'sketch items').optional(),
  // CNT-3 (C7): the plan's real north (degrees counter-clockwise from +Y), which way its y runs,
  // its front and where it sits; LVL-4 adds the site's ground level (`site.ground`). Optional
  // and never defaulted (version 1).
  north: finite().optional(),
  yAxis: z.enum(Y_AXES).optional(),
  front: FrontSchema.optional(),
  site: SiteSchema.optional(),
  // WRT-6 (C8): where values came from, given, measured, scanned or assumed, and how sure each is
  // (`MarkSchema`). Optional and never defaulted (version 1).
  marks: parts(MarkSchema, 'marks').optional(),
  // WRT-2: the plan was last written from rooms text (`grid write`). `revision` is its
  // fingerprint as Grid wrote it, `boundaries` each room's boundary fingerprint: a boundary is
  // derived from where the rooms are, and one edited by hand is refused (`room/derived-edited`).
  // Optional and never defaulted (version 1). One that cannot be read is read as unstated.
  // WRT-7: how the person reads lengths and areas: the unit, the area unit, the decimal mark and
  // the precision (`types/units.ts`). It never changes a stored number: the file is in metres.
  // Optional and never defaulted (version 1). One that cannot be read is read as unstated.
  display: z
    .object({
      length: z.enum(['m', 'cm', 'mm', 'ft-in']),
      area: z.enum(['m2', 'ft2']).optional(),
      decimal: z.enum(['point', 'comma']).optional(),
      precision: z.number().int().min(0).max(5).optional(),
    })
    .optional()
    .catch(undefined),
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
export type RoomTenure = z.infer<typeof RoomTenureSchema>
export type Room = z.infer<typeof RoomSchema>
export type OpeningType = z.infer<typeof OpeningTypeSchema>
export type Opening = z.infer<typeof OpeningSchema>
export type Stair = z.infer<typeof StairSchema>
export type Ceiling = z.infer<typeof CeilingSchema>
export type Roof = z.infer<typeof RoofSchema>
export type Rooflight = z.infer<typeof RooflightSchema>
export type RoofShape = (typeof ROOF_SHAPES)[number]
export type LoweredZone = z.infer<typeof LoweredZoneSchema>
export type OpeningAnchor = z.infer<typeof OpeningAnchorSchema>
export type ReferenceImage = z.infer<typeof ReferenceImageSchema>
export type Item = z.infer<typeof ItemSchema>
export type Annotation = z.infer<typeof AnnotationSchema>
export type SketchItem = z.infer<typeof SketchItemSchema>
export type Front = z.infer<typeof FrontSchema>
export type Site = z.infer<typeof SiteSchema>
export type Mark = z.infer<typeof MarkSchema>
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
