/**
 * LVL-6: where a floor's roof stands, from the lines of the walls it rests on. Pure arithmetic on
 * the file's numbers, so the schema (a wall under a roof that states no height rises to the roof)
 * and the geometry (`geometry/roofs.ts`) read the roof the same way.
 *
 * The roof's eaves lie along the sides of the smallest rectangle that holds the walls' lines,
 * turned to the longest of them: the building's own axes, so a plan drawn off the drawing's axes
 * gets its roof square to its walls. `east` is the rectangle's axis nearer the drawing's +X, and
 * `north` the one nearer +Y (C4).
 */
import type { Roof } from './floorplan'

export interface RoofFrame {
  /** Unit direction of the rectangle's east-west sides. */
  readonly east: { readonly x: number; readonly y: number }
  /** Unit direction of its north-south sides: `east` turned a quarter counter-clockwise. */
  readonly north: { readonly x: number; readonly y: number }
  /** The rectangle, in metres along `east` (`west`..`east`) and along `north` (`south`..`north`). */
  readonly west: number
  readonly eastEdge: number
  readonly south: number
  readonly northEdge: number
}

type Line = { readonly start: readonly [number, number]; readonly end: readonly [number, number] }

/** The rectangle the roof stands on, or null when the lines hold no area (no line, or all in a row). */
export function roofFrame(lines: readonly Line[]): RoofFrame | null {
  const finite = lines.filter((l) => [...l.start, ...l.end].every(Number.isFinite) && (l.start[0] !== l.end[0] || l.start[1] !== l.end[1]))
  if (finite.length === 0) return null
  let longest = finite[0]!
  let best = -1
  for (const line of finite) {
    const length = Math.hypot(line.end[0] - line.start[0], line.end[1] - line.start[1])
    if (length > best) {
      best = length
      longest = line
    }
  }
  // The longest line's direction, turned by quarters into the half-quarter round the drawing's +X.
  const quarter = Math.PI / 2
  let angle = Math.atan2(longest.end[1] - longest.start[1], longest.end[0] - longest.start[0]) % quarter
  if (angle > quarter / 2) angle -= quarter
  if (angle <= -quarter / 2) angle += quarter
  const east = { x: Math.cos(angle), y: Math.sin(angle) }
  const north = { x: -east.y, y: east.x }
  let west = Infinity
  let eastEdge = -Infinity
  let south = Infinity
  let northEdge = -Infinity
  for (const line of finite) {
    for (const [x, y] of [line.start, line.end]) {
      const u = x * east.x + y * east.y
      const v = x * north.x + y * north.y
      west = Math.min(west, u)
      eastEdge = Math.max(eastEdge, u)
      south = Math.min(south, v)
      northEdge = Math.max(northEdge, v)
    }
  }
  if (!(eastEdge > west) || !(northEdge > south)) return null
  return { east, north, west, eastEdge, south, northEdge }
}

/** Which way a gable's ridge runs: as stated, else along the rectangle's longer sides. */
export function ridgeRunsOf(roof: Roof, frame: RoofFrame): 'east-west' | 'north-south' {
  if (roof.ridgeRuns !== undefined) return roof.ridgeRuns
  return frame.eastEdge - frame.west >= frame.northEdge - frame.south ? 'east-west' : 'north-south'
}

/**
 * How far a sloped roof rises from its eaves to its top, on plan, in metres: half the span across
 * a gable's ridge, half the rectangle's shorter side for a hip, the whole span for a mono-pitch
 * roof. 0 for a flat roof.
 */
export function roofRun(roof: Roof, frame: RoofFrame): number {
  const width = frame.eastEdge - frame.west
  const depth = frame.northEdge - frame.south
  switch (roof.shape) {
    case 'flat':
      return 0
    case 'gable':
      return (ridgeRunsOf(roof, frame) === 'east-west' ? depth : width) / 2
    case 'hip':
      return Math.min(width, depth) / 2
    case 'mono-pitch':
      return roof.highSide === 'north' || roof.highSide === 'south' ? depth : width
  }
}

/** The rise per metre on plan: the tangent of the pitch, or the ridge over the run. 0 when flat. */
export function roofSlope(roof: Roof, frame: RoofFrame): number {
  if (roof.shape === 'flat') return 0
  if (roof.pitch !== undefined) return Math.tan((roof.pitch * Math.PI) / 180)
  const run = roofRun(roof, frame)
  return roof.ridge !== undefined && run > 0 ? (roof.ridge - roof.eaves) / run : 0
}

/** The underside's highest point above the floor's level: the ridge, or the eaves of a flat roof. */
export function roofTop(roof: Roof, frame: RoofFrame): number {
  if (roof.shape === 'flat') return roof.eaves
  if (roof.ridge !== undefined) return roof.ridge
  return roof.eaves + roofSlope(roof, frame) * roofRun(roof, frame)
}
