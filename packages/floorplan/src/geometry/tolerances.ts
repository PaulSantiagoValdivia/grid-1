/**
 * Grid's tolerances and limits: the one table every check reads (MSG-15).
 *
 * Every figure here is Grid's own, chosen for checking a drawing. None comes from a building
 * code or a standard, none cites a document, and none says what a building must be. A limit
 * only decides when Grid asks whether a size is meant. That is why the entries carry no source:
 * there is none to cite.
 *
 * There are three kinds of entry:
 *
 * - `tolerance`: how close two things must be to count as one, or how far one may run past
 *   another and still fit. Drawn by hand, a plan is exact to a millimetre or so; a survey or a
 *   scan is not, and loosening these is how a survey is checked (`withTolerances`).
 * - `limit`: a size past which Grid refuses a number (`largest`) or asks whether it is meant
 *   (the plausibility limits). A limit with a `home` figure uses that figure where the plan
 *   says it is a home: a room in it is used as a bedroom or a living room.
 * - `arithmetic`: what the floating-point numbers can tell apart. These guard against rounding
 *   noise, say nothing about a building, and cannot be adjusted.
 *
 * The checks read an entry when they run, through `tolerance` and `limit`, so a change made with
 * `withTolerances` reaches every check that runs inside it.
 */

export type ToleranceKind = 'tolerance' | 'limit' | 'arithmetic'

/** What an entry is in. A `ratio` and a `sine` have no unit. */
export type ToleranceUnit = 'm' | 'm²' | 'radian' | 'sine' | 'ratio'

/** The kinds of building a limit can depend on, as the plan says it (`buildingKind`). */
export type BuildingKind = 'any' | 'home'

export interface ToleranceEntry {
  readonly kind: ToleranceKind
  readonly value: number
  /** The figure in a home, where it differs. Plausibility limits only. */
  readonly home?: number
  readonly unit: ToleranceUnit
  /** What the figure decides, in Grid's words. */
  readonly decides: string
  /** Always the same: the figure is Grid's own check on the drawing and cites no document. */
  readonly basis: 'grid-drawing-check'
}

/** The grids that a polygon join is retried on, coarsest last, in metres. */
export interface GridsEntry {
  readonly kind: 'arithmetic'
  readonly values: readonly number[]
  readonly unit: 'm'
  readonly decides: string
  readonly basis: 'grid-drawing-check'
}

const own = 'grid-drawing-check' as const

/**
 * The table. Changing a value here changes every check that uses it; record the change in the
 * step's review file, with what it moved.
 */
export const TOLERANCES = {
  // ── Openings ──────────────────────────────────────────────────────────────────────────────
  openingOverrun: {
    kind: 'tolerance',
    value: 0.001,
    unit: 'm',
    decides:
      'How far an opening may run past either end of its wall, below the floor, above the top of ' +
      'its wall or into the next opening on its wall, and still fit. A wall whose ends were ' +
      'rounded to the millimetre is up to this much shorter than intended. A refusal states the ' +
      'overrun and the offset that fits.',
    basis: own
  },

  // ── Walls that meet ───────────────────────────────────────────────────────────────────────
  gap: {
    kind: 'tolerance',
    value: 0.02,
    unit: 'm',
    decides:
      'A wall reaches the wall it meets when its end lies within half the thicker of the two ' +
      'walls plus this much of the other wall\'s line: walls are drawn to faces as well as to ' +
      'centre lines. Wall bodies already reach half their thickness, so the check of the spaces ' +
      'walls enclose lengthens every wall by this much at both ends. The wall faults name a wall ' +
      'short of its corner or past it by more than that, and two walls whose bodies overlap by ' +
      'more than this across their width.',
    basis: own
  },
  wallContact: {
    kind: 'tolerance',
    value: 0.01,
    unit: 'm',
    decides:
      'Slack beyond the walls\' own bodies when a room\'s outline is traced: two walls this much ' +
      'further apart than their half thicknesses still touch or carry on in a row, a corner this ' +
      'far past a wall\'s end is still at that end, and a corner may lie the thicker wall plus ' +
      'this from a wall that is said to reach it.',
    basis: own
  },
  strayCorner: {
    kind: 'tolerance',
    value: 1,
    unit: 'm',
    decides:
      'A corner of a room further than this from both of its walls (or further than the thicker ' +
      'wall plus `wallContact`, when that is more) is not a corner: the walls do not meet there, ' +
      'their lines merely cross, and the wall list is out of order.',
    basis: own
  },
  nearlyParallel: {
    kind: 'tolerance',
    value: 0.2588,
    unit: 'sine',
    decides:
      'Two neighbouring walls of a room whose directions differ by less than this (the sine of ' +
      '15 degrees) may be one straight side, when they touch end to end.',
    basis: own
  },
  sameFace: {
    kind: 'tolerance',
    value: 1e-6,
    unit: 'm',
    decides:
      'Two walls in a row whose inner faces are on one line to within this show the room one ' +
      'face. Faces further apart are joined by a step of that size.',
    basis: own
  },
  mitreReach: {
    kind: 'tolerance',
    value: 4,
    unit: 'ratio',
    decides:
      'How far a joined corner may reach along a wall from the point where the walls meet, in ' +
      'half thicknesses of the thicker wall. Walls meeting at so sharp an angle that their faces ' +
      'cross further out than this are left cut square there, as a drawing would bevel them, ' +
      'instead of ending in a long spike.',
    basis: own
  },
  swingContact: {
    kind: 'tolerance',
    value: 0.01,
    unit: 'm',
    decides:
      'How far a wall must reach into a door\'s swing before it is in the way, and how wide the ' +
      'overlap of two swings must be before they collide. A wall that touches the jamb or rests ' +
      'against the open leaf is not in the way.',
    basis: own
  },
  stepPastFace: {
    kind: 'tolerance',
    value: 0.05,
    unit: 'm',
    decides:
      'How far past a wall\'s face the route check steps through a door to find the room on the ' +
      'other side.',
    basis: own
  },

  // ── Areas ─────────────────────────────────────────────────────────────────────────────────
  areaReported: {
    kind: 'tolerance',
    value: 0.01,
    unit: 'm²',
    decides:
      'The smallest area a message names: floor no room claims, floor two rooms share, a room\'s ' +
      'floor outside its walls. A room "wholly inside" another may have this much outside it. ' +
      'The scoreboard says two areas differ past the same figure.',
    basis: own
  },
  areaEqual: {
    kind: 'tolerance',
    value: 1e-6,
    unit: 'm²',
    decides:
      'Two areas closer than this are the same, and a room with less floor than this has none. ' +
      'Far below what is printed, so an area drawn at exactly a figure is never read as a hair ' +
      'under it.',
    basis: own
  },
  wallShare: {
    kind: 'tolerance',
    value: 0.001,
    unit: 'm²',
    decides: 'Wall lying under a room below this is not named wall by wall.',
    basis: own
  },

  // ── The spaces the walls enclose (spaces.ts) ──────────────────────────────────────────────
  touch: {
    kind: 'tolerance',
    value: 0.002,
    unit: 'm',
    decides: 'How close a wall must come to a piece of floor to be named as one of its walls.',
    basis: own
  },
  touchLength: {
    kind: 'tolerance',
    value: 0.02,
    unit: 'm',
    decides: 'How long that contact must be.',
    basis: own
  },
  slit: {
    kind: 'tolerance',
    value: 0.003,
    unit: 'm',
    decides:
      'Half the width of a slit that does not join two spaces: two rooms lie in one space only ' +
      'when they still do with every wall and line widened by this much.',
    basis: own
  },
  lineInside: {
    kind: 'tolerance',
    value: 0.05,
    unit: 'm',
    decides: 'The shortest stretch of a dividing line, or of a wall, inside a room that a message names.',
    basis: own
  },

  // ── Writing a plan rooms first (rooms/, WRT-2) ────────────────────────────────────────────
  roomsWallWidest: {
    kind: 'tolerance',
    value: 0.6,
    unit: 'm',
    decides:
      'The widest gap between two rooms written rooms first that is still one wall between them. ' +
      'A wider gap that is not a room is refused, naming both rooms.',
    basis: own
  },
  roomsTouch: {
    kind: 'tolerance',
    value: 0.02,
    unit: 'm',
    decides:
      'Two rooms written rooms first that are closer than this touch, with no wall between them: ' +
      'refused unless the rooms are said to be open to each other.',
    basis: own
  },
  roomsFaceStep: {
    kind: 'tolerance',
    value: 0.002,
    unit: 'm',
    decides:
      'Two faces of rooms written rooms first that run side by side further out of line than this ' +
      'are named as sizes that do not add up.',
    basis: own
  },

  // ── Comparing two versions of a plan (diff/) ──────────────────────────────────────────────
  diffLength: {
    kind: 'tolerance',
    value: 0.001,
    unit: 'm',
    decides: 'Two lengths or coordinates closer than this are unchanged between two versions.',
    basis: own
  },
  diffMovement: {
    kind: 'tolerance',
    value: 0.01,
    unit: 'm',
    decides: 'When an edit is held to a scope, a change whose numbers all moved less than this is rounding, not an edit, and is ignored.',
    basis: own
  },
  diffSameLine: {
    kind: 'tolerance',
    value: 0.01,
    unit: 'm',
    decides: 'A removed wall and an added wall closer than this to one line may be the same wall.',
    basis: own
  },
  diffOpeningOffset: {
    kind: 'tolerance',
    value: 0.05,
    unit: 'm',
    decides: 'A removed opening and an added one whose offsets differ by less than this may be the same.',
    basis: own
  },
  diffWallOverlap: {
    kind: 'tolerance',
    value: 0.9,
    unit: 'ratio',
    decides: 'The share of its length a removed wall must have in common with an added one to be the same wall.',
    basis: own
  },
  diffRoomAreaShare: {
    kind: 'tolerance',
    value: 0.1,
    unit: 'ratio',
    decides: 'A removed room and an added one whose areas differ by less than this share of the larger may be the same.',
    basis: own
  },
  diffRoomCentre: {
    kind: 'tolerance',
    value: 0.1,
    unit: 'm',
    decides: 'And a removed room and an added one whose centres are closer than this may be the same.',
    basis: own
  },

  // ── Floors (LVL-1) ────────────────────────────────────────────────────────────────────────
  wallAboveStorey: {
    kind: 'tolerance',
    value: 0.001,
    unit: 'm',
    decides:
      'How far a wall may rise past the height its floor states and still fit inside the storey. ' +
      'Past it, the wall is named with both heights.',
    basis: own
  },
  sameLevelOverlap: {
    kind: 'tolerance',
    value: 0.5,
    unit: 'ratio',
    decides:
      'Two floors at one level stand one over the other when the boxes around their walls share ' +
      'more than this share of the smaller box. Floors side by side at one level share less.',
    basis: own
  },
  outsideDoorAboveGround: {
    kind: 'limit',
    value: 2,
    unit: 'm',
    decides:
      'A door to the outside on a floor standing higher than this above the ground floor opens in ' +
      'mid-air: it is named, and it is not a way out. Lower, a few steps outside can reach the ground.',
    basis: own
  },

  // ── A way through that a person fits (MSG-18) ─────────────────────────────────────────────
  passableWidth: {
    kind: 'limit',
    value: 0.4,
    unit: 'm',
    decides:
      'Grid\'s own size, not a code figure. A door or a doorless opening narrower than this is ' +
      'too narrow for a person to get through: it is named, and no route, way out or door to another ' +
      'room is read through it.',
    basis: own
  },
  passableHeight: {
    kind: 'limit',
    value: 1.2,
    unit: 'm',
    decides:
      'Grid\'s own size, not a code figure. A door or a doorless opening lower than this is too ' +
      'low for a person to get through, even stooping: it is named and is not a way through.',
    basis: own
  },
  passableSill: {
    kind: 'limit',
    value: 0.3,
    unit: 'm',
    decides:
      'Grid\'s own size, not a code figure. A door or a doorless opening whose sill stands higher ' +
      'than this above its floor is not at the floor: it is named and is not a way through. Lower, ' +
      'it is a step.',
    basis: own
  },
  // ── Fixtures (CNT-12) ─────────────────────────────────────────────────────────────────────
  itemIntoWall: {
    kind: 'tolerance',
    value: 0.005,
    unit: 'm',
    decides:
      'How far a fixture may reach into the body of a solid wall and still stand against its face. ' +
      'Past it, the fixture is named with the wall it runs into.',
    basis: own
  },
  itemAboveRoom: {
    kind: 'tolerance',
    value: 0.001,
    unit: 'm',
    decides:
      'How far a fixture may rise past the height of the room it stands in and still fit under the ' +
      'ceiling. Past it, the fixture is named with both heights.',
    basis: own
  },

  // ── A step inside a floor (LVL-7) ─────────────────────────────────────────────────────────
  sameFloorLevel: {
    kind: 'tolerance',
    value: 0.005,
    unit: 'm',
    decides:
      'Two rooms side by side whose floors stand closer than this in height share a level: no step ' +
      'is drawn between them.',
    basis: own
  },
  floorOffsetLargest: {
    kind: 'limit',
    value: 1.5,
    unit: 'm',
    decides:
      'A room set further than this above or below its storey is asked about: so far off, it is more ' +
      'likely a floor of its own, a half level or a mezzanine.',
    basis: own
  },

  // ── Stairs and lifts (LVL-3) ──────────────────────────────────────────────────────────────
  stairRoomOverlap: {
    kind: 'tolerance',
    value: 0.5,
    unit: 'ratio',
    decides:
      'Two rooms used as a stair (or as a lift) on neighbouring floors are one stair (or one shaft) ' +
      'when they share at least this of the smaller one, and the way-out check goes up and down ' +
      'it. Stair rooms on both floors that share less are named as out of line. The lab found ' +
      'every sound pair at or above this and every planted fault below it (AU3-1).',
    basis: own
  },
  stairStepLength: {
    kind: 'limit',
    value: 0.63,
    unit: 'm',
    decides:
      'How a stair that states no number of risers is laid out: Grid takes the number that brings ' +
      'twice the riser plus the going nearest this length, the stride of a person on a stair. It ' +
      'only lays the stair out; it judges no riser and no going.',
    basis: own
  },

  // ── Limits: refused ───────────────────────────────────────────────────────────────────────
  largest: {
    kind: 'limit',
    value: 1e7,
    unit: 'm',
    decides:
      'The largest coordinate or size Grid accepts. Past it a number is no building, the ' +
      'arithmetic loses the precision the checks need, and the part is refused. A number too ' +
      'large to hold at all (it reads as infinity) is refused by the schema.',
    basis: own
  },
  farFromOrigin: {
    kind: 'limit',
    value: 500,
    unit: 'm',
    decides: 'A plan reaching further than this from the origin gets a warning: most likely a scale or unit error.',
    basis: own
  },

  // ── Limits: plausibility questions ────────────────────────────────────────────────────────
  wallThinnest: {
    kind: 'limit',
    value: 0.02,
    unit: 'm',
    decides: 'A solid wall thinner than this is questioned: most likely a slipped digit or unit, or a line that should be virtual.',
    basis: own
  },
  wallThickest: {
    kind: 'limit',
    value: 3,
    home: 1.5,
    unit: 'm',
    decides: 'A wall thicker than this is questioned.',
    basis: own
  },
  wallLowest: {
    kind: 'limit',
    value: 0.1,
    unit: 'm',
    decides: 'A solid wall lower than this is questioned.',
    basis: own
  },
  wallHighest: {
    kind: 'limit',
    value: 40,
    home: 10,
    unit: 'm',
    decides: 'A wall higher than this is questioned. Grid stands a storey on its tallest wall.',
    basis: own
  },
  wallHigherThanTypical: {
    kind: 'limit',
    value: 4,
    unit: 'ratio',
    decides:
      'A wall this many times higher than the typical solid wall on its floor is questioned, ' +
      'when the floor has at least three other solid walls.',
    basis: own
  },
  openingNarrowest: {
    kind: 'limit',
    value: 0.2,
    unit: 'm',
    decides:
      'An opening narrower than this is questioned. Whether a door is a way through is ' +
      '`passableWidth`.',
    basis: own
  },
  openingLowest: {
    kind: 'limit',
    value: 0.2,
    unit: 'm',
    decides: 'An opening lower than this is questioned.',
    basis: own
  },
  roomLargest: {
    kind: 'limit',
    value: 50000,
    home: 1000,
    unit: 'm²',
    decides: 'A room larger than this is questioned.',
    basis: own
  },
  typicalHeightLowest: {
    kind: 'limit',
    value: 1.8,
    unit: 'm',
    decides:
      'The units question. When the typical solid wall of a plan is outside `typicalHeightLowest` to ' +
      '`typicalHeightHighest` but inside it read in feet, inches, centimetres or millimetres, and the ' +
      'typical thickness (and door width, when there are doors) agrees, Grid asks whether the ' +
      'plan was typed in that unit.',
    basis: own
  },
  typicalHeightHighest: {
    kind: 'limit',
    value: 6,
    unit: 'm',
    decides: 'For the units question: the highest typical solid wall that reads as a storey in metres (see `typicalHeightLowest`).',
    basis: own
  },
  typicalThicknessLowest: {
    kind: 'limit',
    value: 0.08,
    unit: 'm',
    decides: 'For the units question: the thinnest typical solid wall that agrees with a unit.',
    basis: own
  },
  typicalThicknessHighest: {
    kind: 'limit',
    value: 1,
    unit: 'm',
    decides: 'For the units question: the thickest typical solid wall that agrees with a unit.',
    basis: own
  },
  typicalDoorLowest: {
    kind: 'limit',
    value: 0.5,
    unit: 'm',
    decides: 'For the units question: the narrowest typical door that agrees with a unit.',
    basis: own
  },
  typicalDoorHighest: {
    kind: 'limit',
    value: 2.5,
    unit: 'm',
    decides: 'For the units question: the widest typical door that agrees with a unit.',
    basis: own
  },

  // ── Arithmetic: rounding noise, not adjustable ────────────────────────────────────────────
  noLength: {
    kind: 'arithmetic',
    value: 1e-9,
    unit: 'm',
    decides:
      'A length, a height or a distance along a line below this is none: a wall piece, a step or ' +
      'a direction of travel this short is rounding noise.',
    basis: own
  },
  lengthEqual: {
    kind: 'arithmetic',
    value: 1e-9,
    unit: 'm',
    decides:
      'A length this close to the figure it is checked against is that figure (ARE-7): a width ' +
      'drawn at exactly the figure is never read as a hair under it. Areas use `areaEqual`.',
    basis: own
  },
  noArea: {
    kind: 'arithmetic',
    value: 1e-12,
    unit: 'm²',
    decides: 'An area or a cross product below this is none: a triangle, a clipped piece or a turn this small is rounding noise.',
    basis: own
  },
  onLine: {
    kind: 'arithmetic',
    value: 1e-9,
    unit: 'm²',
    decides: 'A cross product below this puts a point on the line through two others.',
    basis: own
  },
  parallel: {
    kind: 'arithmetic',
    value: 1e-9,
    unit: 'sine',
    decides: 'Two directions whose sine is below this are parallel: their lines do not cross.',
    basis: own
  },
  samePoint: {
    kind: 'arithmetic',
    value: 1e-9,
    unit: 'm',
    decides: 'Points closer than this are one vertex when floors are cut into triangles.',
    basis: own
  },
  sameAngle: {
    kind: 'arithmetic',
    value: 1e-9,
    unit: 'radian',
    decides: 'Angles closer than this are one when floors are cut into triangles.',
    basis: own
  },
  noTurn: {
    kind: 'arithmetic',
    value: 1e-6,
    unit: 'sine',
    decides: 'Below this, the pivot of a wall that moved between two versions is so far away that it is noise: the wall was reshaped, not turned.',
    basis: own
  },
  joint: {
    kind: 'arithmetic',
    value: 1e-6,
    unit: 'm',
    decides: 'Ends of two walls closer than this are one joint, and two heights closer than this are one in the 3D build.',
    basis: own
  },
  roomsWritten: {
    kind: 'arithmetic',
    value: 1e-4,
    unit: 'm',
    decides:
      'Rooms text and the plans written from it hold lengths to a tenth of a millimetre, so two ' +
      'lengths that agree to this are the same when a read-back is checked by writing it again.',
    basis: own
  },
  lineHalfWidth: {
    kind: 'arithmetic',
    value: 1e-9,
    unit: 'm',
    decides:
      'Half the width a dividing line is given near the origin when spaces are worked out. It ' +
      'grows with the distance from the origin, so it never falls below what a number there can ' +
      'tell apart.',
    basis: own
  },
  relativeNoise: {
    kind: 'arithmetic',
    value: 1e-9,
    unit: 'ratio',
    decides: 'What a double can tell apart relative to the size it is measured against.',
    basis: own
  },
  farNoise: {
    kind: 'arithmetic',
    value: 1e-14,
    unit: 'ratio',
    decides: 'The share of the plan\'s reach a dividing line is widened by, so far from the origin it still has a width a double can hold.',
    basis: own
  },
  noSlope: {
    kind: 'arithmetic',
    value: 1e-15,
    unit: 'ratio',
    decides: 'A slope below this is none when a segment is clipped.',
    basis: own
  },
  joinGrids: {
    kind: 'arithmetic',
    values: [0, 1e-9, 1e-7, 1e-6, 1e-5],
    unit: 'm',
    decides:
      'The polygon library can fail to close a ring when two edges almost coincide. A join of ' +
      'walls or rooms is tried as drawn, then with every point rounded to these grids, coarsest ' +
      'last.',
    basis: own
  },
  overlapGrids: {
    kind: 'arithmetic',
    values: [0, 1e-9, 1e-7, 1e-6],
    unit: 'm',
    decides: 'The same, for cutting two rooms to see how much floor they share.',
    basis: own
  }
} as const satisfies Record<string, ToleranceEntry | GridsEntry>

type Table = typeof TOLERANCES

/** The entries that hold one number. */
export type ToleranceName = {
  [K in keyof Table]: Table[K] extends { readonly value: number } ? K : never
}[keyof Table]

/** The entries a survey may adjust: every one that is not arithmetic. */
export type AdjustableName = {
  [K in ToleranceName]: Table[K]['kind'] extends 'arithmetic' ? never : K
}[ToleranceName]

export type ToleranceChanges = Partial<Record<AdjustableName, number>>

/** The changes in force, if any (`withTolerances`). */
let active: ToleranceChanges | null = null

/** The value in force for one entry: the table's, or the change in force. */
export function tolerance(name: ToleranceName): number {
  const changed = active === null ? undefined : (active as Partial<Record<ToleranceName, number>>)[name]
  return changed ?? TOLERANCES[name].value
}

/** A limit for a kind of building: its `home` figure in a home, when it has one. */
export function limit(name: ToleranceName, building: BuildingKind = 'any'): number {
  const changed = active === null ? undefined : (active as Partial<Record<ToleranceName, number>>)[name]
  if (changed !== undefined) return changed
  const entry: ToleranceEntry = TOLERANCES[name]
  return building === 'home' && entry.home !== undefined ? entry.home : entry.value
}

/** Whether every entry has its value from the table (no `withTolerances` change is in force). */
export function tolerancesAsStated(): boolean {
  return active === null
}

/**
 * Runs `run` with some entries changed, for a survey or a scan that is less exact than a drawing.
 * A change replaces the entry for every kind of building. Only `tolerance` and `limit` entries
 * may change, each to a positive finite number; anything else throws a `RangeError` before
 * `run` starts. Changes nest: an inner call changes what the outer left in force.
 */
export function withTolerances<T>(changes: ToleranceChanges, run: () => T): T {
  for (const [name, value] of Object.entries(changes)) {
    const entry = (TOLERANCES as Record<string, ToleranceEntry | GridsEntry>)[name]
    if (entry === undefined) throw new RangeError(`There is no tolerance named ${JSON.stringify(name)}`)
    if (entry.kind === 'arithmetic') {
      throw new RangeError(`${name} guards against rounding noise and cannot be adjusted`)
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive finite number, not ${String(value)}`)
    }
  }
  const before = active
  active = { ...(before ?? {}), ...changes }
  try {
    return run()
  } finally {
    active = before
  }
}
