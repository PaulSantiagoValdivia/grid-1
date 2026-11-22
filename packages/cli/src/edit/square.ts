/**
 * Squaring a scan (WRT-6, lab AE-4): an explicit step that says how far each wall moved.
 *
 * A scan of a building gives walls a degree or two off square, and their noise moves room areas
 * by a few percent. Squaring turns each wall that is close to one of the plan's main directions
 * onto it, about its own middle, and then puts the ends back where the walls met: a corner at
 * the crossing of the two new lines, the end of a wall that meets another along its new line.
 * The main directions are the plan's own, worked out from its walls (a building need not be
 * square to the drawing). A wall further off than `squareWithin` is left as it is and named:
 * it may be a bay, a splay or a mistake, which is for the person to say.
 *
 * By default only the walls the plan marks scanned are squared (`marks`, C8); `all` squares
 * every wall. The marks are kept: a squared wall was still scanned, and its tolerance still says
 * how sure its place is. Openings keep their anchor or their place in the building (`seat.ts`).
 *
 * Pure: a survey in, a patch out.
 */
import { add, cross, dot, intersectLines, planMarks, scale, sub, tolerance, wallAxis, wallSureness, type Vec2, type Wall } from '@ongrid/floorplan/geometry'
import { quoted } from '../fs/projectFiles'
import type { Survey } from '../quantities/survey'
import { listed, type OpeningChange, type Patch } from './edits'
import { EditRefused } from './refused'
import { r3, seatOpenings } from './seat'

type Pair = [number, number]

export interface SquareRequest {
  /** Square every wall, not only those the plan marks scanned. */
  readonly all?: boolean
  readonly floor?: string
}

/** How one wall was moved, for the answer. */
export interface WallMove {
  readonly wall: string
  /** Degrees it was turned, counter-clockwise positive. */
  readonly turned: number
  /** Metres the farther of its ends moved. */
  readonly moved: number
}

const DEGREE = Math.PI / 180

/** An angle in (-45°, 45°]: how far a direction is from the nearest of four square directions. */
function offSquare(angle: number): number {
  const quarter = Math.PI / 2
  let a = angle % quarter
  if (a > quarter / 2) a -= quarter
  if (a <= -quarter / 2) a += quarter
  return a
}

/** The plan's main direction, as an angle in (-45°, 45°]: each wall's direction, weighted by its length, folded onto a quarter turn. */
function mainDirection(walls: readonly Wall[]): number {
  let x = 0
  let y = 0
  for (const wall of walls) {
    const axis = wallAxis(wall)
    const angle = Math.atan2(axis.dir.y, axis.dir.x)
    x += axis.length * Math.cos(4 * angle)
    y += axis.length * Math.sin(4 * angle)
  }
  return offSquare(Math.atan2(y, x) / 4)
}

const pair = (p: Vec2): Pair => [r3(p.x), r3(p.y)]

export function squarePlan(survey: Survey, request: SquareRequest): Patch {
  const plan = survey.plan
  const onFloor = (wall: Wall): boolean => request.floor === undefined || (wall.floor ?? 'ground') === request.floor
  const marks = planMarks(plan)
  const walls = plan.walls.filter((w) => onFloor(w) && w.start.some((v, i) => v !== w.end[i]))
  if (walls.length === 0) throw new EditRefused('That floor has no walls to square.')
  const scanned = walls.filter((w) => wallSureness(marks, w.id).source === 'scanned')
  const chosen = request.all === true ? walls : scanned
  if (chosen.length === 0) {
    throw new EditRefused('No wall is marked scanned, so nothing would be squared. Mark the scanned walls in the plan\'s marks (source scanned), or pass all to square every wall.')
  }
  const within = Math.asin(tolerance('squareWithin'))
  const floors = [...new Set(chosen.map((w) => w.floor ?? 'ground'))]

  // Each wall's line after squaring: through its old middle, in its new direction.
  const lines = new Map<string, { point: Vec2; dir: Vec2; turned: number }>()
  const leftOff: string[] = []
  for (const floor of floors) {
    const own = chosen.filter((w) => (w.floor ?? 'ground') === floor)
    const main = mainDirection(own)
    for (const wall of own) {
      const axis = wallAxis(wall)
      const off = offSquare(Math.atan2(axis.dir.y, axis.dir.x) - main)
      if (Math.abs(off) > within) {
        leftOff.push(wall.id)
        continue
      }
      if (Math.abs(off) * axis.length / 2 <= tolerance('noLength')) continue
      const angle = Math.atan2(axis.dir.y, axis.dir.x) - off
      const middle = scale(add(axis.start, axis.end), 0.5)
      lines.set(wall.id, { point: middle, dir: { x: Math.cos(angle), y: Math.sin(angle) }, turned: -off / DEGREE })
    }
  }
  if (lines.size === 0 && leftOff.length > 0) {
    throw new EditRefused(`Every wall to square is more than about 3° off the plan's main directions, so none was turned: ${listed(leftOff.map(quoted))}.`)
  }
  if (lines.size === 0) {
    return { walls: new Map(), openings: new Map(), removeOpenings: new Set(), rooms: new Map(), said: [`Every one of the ${chosen.length} walls to square is on the plan's main directions already: nothing moved.`], extra: { moves: [], leftAsTheyAre: [] } }
  }

  const lineOf = (wall: Wall): { point: Vec2; dir: Vec2 } => lines.get(wall.id) ?? { point: wallAxis(wall).start, dir: wallAxis(wall).dir }
  const sameFloor = (a: Wall, b: Wall): boolean => (a.floor ?? 'ground') === (b.floor ?? 'ground')
  /** The wall an end of `wall` meets: the nearest whose line it lies on, within their thicknesses, along its length. */
  const meets = (wall: Wall, end: Vec2): Wall | null => {
    let best: { wall: Wall; off: number } | null = null
    for (const other of plan.walls) {
      if (other.id === wall.id || !sameFloor(other, wall) || other.start.every((v, i) => v === other.end[i])) continue
      const axis = wallAxis(other)
      // A wall in a row with this one continues it; it does not meet it at a corner.
      if (Math.abs(cross(axis.dir, wallAxis(wall).dir)) < tolerance('nearlyParallel')) continue
      const reach = (wall.thickness + other.thickness) / 2 + tolerance('gap')
      const off = Math.abs(dot(sub(end, axis.start), axis.normal))
      const along = dot(sub(end, axis.start), axis.dir)
      if (off > reach || along < -reach || along > axis.length + reach) continue
      if (best === null || off < best.off) best = { wall: other, off }
    }
    return best?.wall ?? null
  }

  // Every end of a squared wall, and every end that meets a squared wall, goes where the lines cross.
  const changes = new Map<string, { start?: Pair; end?: Pair }>()
  const moves: WallMove[] = []
  for (const wall of plan.walls.filter(onFloor)) {
    if (wall.start.every((v, i) => v === wall.end[i])) continue
    const own = lineOf(wall)
    const squared = lines.has(wall.id)
    const change: { start?: Pair; end?: Pair } = {}
    let moved = 0
    for (const key of ['start', 'end'] as const) {
      const was: Vec2 = { x: wall[key][0], y: wall[key][1] }
      const other = meets(wall, was)
      if (!squared && (other === null || !lines.has(other.id))) continue
      const at = other === null ? null : intersectLines(own, lineOf(other))
      // A crossing far from the old end is not where the walls met: the end only comes onto its line.
      const now = at !== null && Math.hypot(at.x - was.x, at.y - was.y) <= wall.thickness + other!.thickness + tolerance('gap')
        ? at
        : add(own.point, scale(own.dir, dot(sub(was, own.point), own.dir)))
      const distance = Math.hypot(now.x - was.x, now.y - was.y)
      if (distance <= tolerance('noLength')) continue
      change[key] = pair(now)
      moved = Math.max(moved, distance)
    }
    if (change.start === undefined && change.end === undefined) continue
    const s = change.start ?? wall.start
    const e = change.end ?? wall.end
    if (Math.hypot(e[0] - s[0], e[1] - s[1]) < 0.05) throw new EditRefused(`Squaring would leave wall ${quoted(wall.id)} with no length.`)
    changes.set(wall.id, change)
    moves.push({ wall: wall.id, turned: r3(lines.get(wall.id)?.turned ?? 0), moved: r3(moved) })
  }

  // A point on a wall keeps its distance from the wall's middle, along the wall's new line.
  const carry = (point: Vec2, wallId: string): Vec2 => {
    const wall = plan.walls.find((w) => w.id === wallId)
    const line = lines.get(wallId)
    if (!wall || !line) return point
    const axis = wallAxis(wall)
    return add(line.point, scale(line.dir, dot(sub(point, line.point), axis.dir)))
  }
  const seated = seatOpenings(survey, changes, carry, { what: 'squaring the scan' })
  const openings = new Map<string, OpeningChange>()
  for (const [id, offset] of seated.offsets) {
    const o = plan.openings.find((x) => x.id === id)!
    if (Math.abs(offset - o.offset) > tolerance('noLength')) openings.set(id, { offset })
  }

  const turned = moves.filter((m) => m.turned !== 0)
  const said = [
    `Squared the scan: ${turned.length} wall${turned.length === 1 ? '' : 's'} turned onto the plan's main directions${request.all === true ? '' : ' (the walls marked scanned)'}, ${moves.length - turned.length} more with an end moved to meet ${moves.length - turned.length === 1 ? 'it' : 'them'}.`,
    ...moves.slice(0, 30).map((m) => `Wall ${quoted(m.wall)}: ${m.turned === 0 ? 'not turned' : `turned ${Math.abs(m.turned).toFixed(2)}° ${m.turned > 0 ? 'anticlockwise' : 'clockwise'}`}, an end moved ${m.moved.toFixed(3)} m.`),
    ...(moves.length > 30 ? [`And ${moves.length - 30} more walls, each under moves in the data.`] : []),
  ]
  const notKept = [...seated.notKept]
  if (leftOff.length > 0) notKept.push(`${listed(leftOff.map((id) => `wall ${quoted(id)}`))} ${leftOff.length === 1 ? 'is' : 'are'} more than about 3° off the plan's main directions and ${leftOff.length === 1 ? 'was' : 'were'} left as ${leftOff.length === 1 ? 'it is' : 'they are'}: a bay, a splay or a mistake is for the person to say.`)
  const guessed = [...seated.guessed]
  if (request.all !== true && scanned.length < walls.length) guessed.push(`Only the ${scanned.length} walls marked scanned were squared; pass all to square every wall.`)
  return {
    walls: changes,
    openings,
    removeOpenings: new Set(),
    rooms: new Map(),
    said,
    guessed,
    notKept,
    extra: { moves, leftAsTheyAre: leftOff },
  }
}
