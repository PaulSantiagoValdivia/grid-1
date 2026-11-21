/**
 * Sizes far outside a building's, asked about as questions (MSG-15, lab MS-3, AE-6).
 *
 * A plan typed in feet, a height with a digit too many or a wall 2 mm thick still draws, and
 * nothing else in the checks would say a word. These are warnings worded as questions: the size
 * may be meant. The limits are Grid's own (`tolerances.ts`), chosen to catch a slipped digit or
 * unit, and are no rule: a message never says what a building must be.
 *
 * Where the plan says it is a home (a room in it is used as a bedroom or a living room), the
 * limits for a home apply; otherwise those for any building.
 */

import type { FloorPlan, Opening, PlanIndex, Wall } from './plan'
import { floorOf } from './floors'
import { area } from './vec2'
import { tryRoomPolygon } from './room'
import type { BuildingKind, ToleranceName } from './tolerances'
import { limit } from './tolerances'
import { fixedText } from './rounding'
import type { Issue } from './validate'

/** The room uses that make a plan a home. */
const HOME_USES: readonly string[] = ['bedroom', 'living']

/** What kind of building the plan says it is: a home when a room in it is used as one. */
export function buildingKind(plan: FloorPlan): BuildingKind {
  return plan.rooms.some((room) => room.use !== undefined && HOME_USES.includes(room.use)) ? 'home' : 'any'
}

/** The units an agent most often types as metres, with how many metres one of them is. */
const UNITS = [
  { name: 'feet', metres: 0.3048 },
  { name: 'inches', metres: 25.4 / 1000 },
  { name: 'centimetres', metres: 1 / 100 },
  { name: 'millimetres', metres: 1 / 1000 }
] as const

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** A size to two decimals, or to three significant figures below a metre, so 0.0015 stays 0.0015. */
function size(value: number): string {
  if (Math.abs(value) >= 1 || value === 0) return fixedText(value, 2)
  const shown = Number(value.toPrecision(3)).toString()
  return /^-?0\.\d$/.test(shown) ? `${shown}0` : shown
}

const squareMetres = (value: number): string =>
  `${value.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`

const NOT_A_RULE = "The limit is Grid's own, for catching a slipped digit or unit, and no rule."

const inHome = (building: BuildingKind): string =>
  building === 'home' ? ' in a home (a room in this plan is a bedroom or a living room)' : ''

function within(value: number, low: ToleranceName, high: ToleranceName): boolean {
  return value >= limit(low) && value <= limit(high)
}

interface Typical {
  readonly height: number | null
  readonly thickness: number | null
  readonly door: number | null
}

/**
 * The units question: the plan's typical sizes are not a building's in metres, and are in one
 * of `UNITS`. Null when the sizes read as metres, or as no unit at all.
 */
function unitsQuestion(typical: Typical): Issue | null {
  const { height, thickness, door } = typical
  if (height === null || thickness === null) return null
  if (within(height, 'typicalHeightLowest', 'typicalHeightHighest')) return null
  for (const unit of UNITS) {
    const read = (value: number): number => value * unit.metres
    if (!within(read(height), 'typicalHeightLowest', 'typicalHeightHighest')) continue
    if (!within(read(thickness), 'typicalThicknessLowest', 'typicalThicknessHighest')) continue
    if (door !== null && !within(read(door), 'typicalDoorLowest', 'typicalDoorHighest')) continue
    const sizes = [`${size(height)} m high`, `${size(thickness)} m thick`]
    const inMetres = [`${size(read(height))} m`, `${size(read(thickness))} m`]
    const doors = door === null ? '' : `, and its doors ${size(door)} m wide`
    if (door !== null) inMetres.push(`${size(read(door))} m`)
    const list = inMetres.length === 3 ? `${inMetres[0]}, ${inMetres[1]} and ${inMetres[2]}` : `${inMetres[0]} and ${inMetres[1]}`
    return {
      entity: 'plan',
      id: 'plan',
      code: 'plan/units-question',
      severity: 'warning',
      message:
        `Is this plan in ${unit.name}? Its walls are typically ${sizes.join(' and ')}${doors}: ` +
        `read as ${unit.name}, those are ${list}. Grid reads every size as metres. If the plan was ` +
        `typed in ${unit.name}, multiply every length by ${unit.metres} (wall points, thickness and ` +
        `height; opening offset, width, sill and height).`
    }
  }
  return null
}

function wallQuestions(wall: Wall, others: readonly Wall[], building: BuildingKind): string[] {
  const asked: string[] = []
  const typicalHeight = others.length >= 3 ? median(others.map((w) => w.height)) : null
  const highest = limit('wallHighest', building)
  // Against the other walls first: that names what the wall most likely should be.
  if (typicalHeight !== null && wall.height >= typicalHeight * limit('wallHigherThanTypical')) {
    asked.push(
      `Wall ${wall.id} is ${size(wall.height)} m high, the others on its floor typically ` +
        `${size(typicalHeight)} m: is that meant? Grid stands a storey on its tallest wall, so this ` +
        `one makes the storey ${size(wall.height)} m high.`
    )
  } else if (wall.height > highest) {
    asked.push(
      `Wall ${wall.id} is ${size(wall.height)} m high: is that meant? Grid asks about walls higher ` +
        `than ${size(highest)} m${inHome(building)}, and stands a storey on its tallest wall.`
    )
  } else if (wall.height < limit('wallLowest', building)) {
    asked.push(
      `Wall ${wall.id} is ${size(wall.height)} m high: is that meant? Grid asks about solid walls ` +
        `lower than ${size(limit('wallLowest', building))} m.`
    )
  }
  const thickest = limit('wallThickest', building)
  if (wall.thickness < limit('wallThinnest', building)) {
    asked.push(
      `Wall ${wall.id} is ${size(wall.thickness)} m thick: is that meant? Grid asks about solid ` +
        `walls thinner than ${size(limit('wallThinnest', building))} m. If it is a line on the ` +
        `floor with no substance, mark it virtual.`
    )
  } else if (wall.thickness > thickest) {
    asked.push(
      `Wall ${wall.id} is ${size(wall.thickness)} m thick: is that meant? Grid asks about walls ` +
        `thicker than ${size(thickest)} m${inHome(building)}.`
    )
  }
  return asked
}

const OPENING_NOUN = { door: 'Door', window: 'Window', opening: 'Opening' } as const

function openingQuestions(opening: Opening, building: BuildingKind): string[] {
  const asked: string[] = []
  const noun = `${OPENING_NOUN[opening.type]} ${opening.id}`
  const narrowest = limit('openingNarrowest', building)
  if (opening.width < narrowest) {
    const still = opening.type === 'door' ? ' It still counts as a way through.' : ''
    asked.push(
      `${noun} is ${size(opening.width)} m wide: is that meant? Grid asks about openings ` +
        `narrower than ${size(narrowest)} m.${still}`
    )
  }
  const lowest = limit('openingLowest', building)
  if (opening.height < lowest) {
    asked.push(
      `${noun} is ${size(opening.height)} m high: is that meant? Grid asks about openings ` +
        `lower than ${size(lowest)} m.`
    )
  }
  return asked
}

/**
 * Questions about sizes far outside a building's: first whether the whole plan was typed in
 * another unit, then single walls, openings and rooms. When the units question is asked, the
 * single sizes it explains are not asked about one by one. Warnings only: nothing is skipped.
 */
export function validatePlausibility(
  plan: FloorPlan,
  index: PlanIndex,
  broken: ReadonlySet<string>,
  issues: Issue[]
): void {
  const building = buildingKind(plan)
  const solid = plan.walls.filter((wall) => !wall.virtual && !broken.has(wall.id))
  const doors = plan.openings.filter((o) => o.type === 'door' && !broken.has(o.id))
  const units = unitsQuestion({
    height: median(solid.map((w) => w.height)),
    thickness: median(solid.map((w) => w.thickness)),
    door: median(doors.map((o) => o.width))
  })
  if (units !== null) {
    issues.push(units)
    return
  }

  const ask = (entity: Issue['entity'], id: string, code: string, message: string): void => {
    issues.push({ entity, id, code, severity: 'warning', message: `${message} ${NOT_A_RULE}` })
  }

  const byFloor = new Map<string, Wall[]>()
  for (const wall of solid) {
    const floor = floorOf(wall)
    const list = byFloor.get(floor)
    if (list) list.push(wall)
    else byFloor.set(floor, [wall])
  }
  for (const wall of solid) {
    const others = byFloor.get(floorOf(wall))!.filter((w) => w !== wall)
    for (const message of wallQuestions(wall, others, building)) ask('wall', wall.id, 'wall/size-question', message)
  }

  for (const opening of plan.openings) {
    if (broken.has(opening.id)) continue
    for (const message of openingQuestions(opening, building)) ask('opening', opening.id, 'opening/size-question', message)
  }

  const largest = limit('roomLargest', building)
  for (const room of plan.rooms) {
    if (broken.has(room.id)) continue
    const outline = tryRoomPolygon(room, index)
    if (outline === null) continue
    const measured = area(outline)
    if (!(measured > largest)) continue
    ask(
      'room',
      room.id,
      'room/size-question',
      `Room ${room.id} measures ${squareMetres(measured)}: is that meant? Grid asks about rooms ` +
        `larger than ${squareMetres(largest)}${inHome(building)}. Check its walls' coordinates and ` +
        `thickness.`
    )
  }
}
