/**
 * Is one plan the same building as another, though written another way (WRT-2)? Two plans
 * written separately share few ids, so nothing here pairs parts by id:
 *
 * - walls: the floor each floor's walls cover, laid on a centimetre grid, with the outside
 *   walls and each wall's height compared cell by cell;
 * - openings: each one by where it is in the building (its middle, to the millimetre), its size,
 *   and where a door hangs and which way it swings;
 * - areas: each room's area as Grid measures it, by floor and name;
 * - checks: the codes the drawing check and the local rules check give, as many of each.
 *
 * For tests only. The lab compared its rooms-first plans with their originals the same way
 * (lab entry WR-20).
 */
import type { FloorPlan, Wall } from '../types/floorplan'
import { indexPlan } from '../geometry/plan'
import { tryRoomPolygon } from '../geometry/room'
import { validatePlan } from '../geometry/validate'
import { checkPlanSanity } from '../geometry/rules/check'

const STEP = 0.01

const floorOf = (part: { floor?: string | undefined }): string => part.floor ?? 'ground'

interface Grid {
  x0: number
  y0: number
  nx: number
  ny: number
}

function gridFor(plans: readonly FloorPlan[]): Grid {
  const pts = plans.flatMap((p) => p.walls.flatMap((w) => [w.start, w.end]))
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const x0 = Math.min(...xs) - 1
  const y0 = Math.min(...ys) - 1
  return { x0, y0, nx: Math.ceil((Math.max(...xs) + 1 - x0) / STEP) + 1, ny: Math.ceil((Math.max(...ys) + 1 - y0) / STEP) + 1 }
}

/** Each cell's wall height (the highest wall over it), 0 where no solid wall stands. */
function heights(plan: FloorPlan, floor: string, grid: Grid, only?: (wall: Wall) => boolean): Float64Array {
  const cells = new Float64Array(grid.nx * grid.ny)
  for (const w of plan.walls) {
    if (floorOf(w) !== floor || w.virtual === true || (only && !only(w))) continue
    const [sx, sy] = w.start
    const dx = w.end[0] - sx
    const dy = w.end[1] - sy
    const len = Math.hypot(dx, dy)
    if (len === 0) continue
    const ux = dx / len
    const uy = dy / len
    const half = w.thickness / 2
    const reach = half + STEP
    const i0 = Math.max(0, Math.floor((Math.min(sx, w.end[0]) - reach - grid.x0) / STEP))
    const i1 = Math.min(grid.nx - 1, Math.ceil((Math.max(sx, w.end[0]) + reach - grid.x0) / STEP))
    const j0 = Math.max(0, Math.floor((Math.min(sy, w.end[1]) - reach - grid.y0) / STEP))
    const j1 = Math.min(grid.ny - 1, Math.ceil((Math.max(sy, w.end[1]) + reach - grid.y0) / STEP))
    for (let j = j0; j <= j1; j++) {
      const y = grid.y0 + (j + 0.5) * STEP - sy
      for (let i = i0; i <= i1; i++) {
        const x = grid.x0 + (i + 0.5) * STEP - sx
        const s = x * ux + y * uy
        const d = -x * uy + y * ux
        if (s >= 0 && s <= len && Math.abs(d) <= half) {
          const k = j * grid.nx + i
          cells[k] = Math.max(cells[k]!, w.height)
        }
      }
    }
  }
  return cells
}

export interface FloorMatch {
  readonly floor: string
  /** m² covered by the walls of one plan and not the other. */
  readonly walls: number
  /** The same, for outside walls only. */
  readonly outsideWalls: number
  /** m² covered by walls in both plans, at different heights. */
  readonly heights: number
}

export interface BuildingMatch {
  readonly floors: readonly FloorMatch[]
  /** Openings of the first plan on a wall it has, and how many of them the second has the same. */
  readonly openings: { readonly same: number; readonly of: number; readonly onlyFirst: readonly string[]; readonly onlySecond: readonly string[] }
  /** The largest difference in one room's area, m², and the rooms only one plan has. */
  readonly areas: { readonly worst: number; readonly unmatched: readonly string[] }
  readonly checks: { readonly first: readonly string[]; readonly second: readonly string[] }
}

function openingKeys(plan: FloorPlan): Array<{ key: string; id: string }> {
  const walls = new Map(plan.walls.map((w) => [w.id, w]))
  const r = (v: number): string => (Math.round(v * 1000) / 1000 + 0).toFixed(3)
  const out: Array<{ key: string; id: string }> = []
  for (const o of plan.openings) {
    const w = walls.get(o.wall)
    if (!w) continue
    const dx = w.end[0] - w.start[0]
    const dy = w.end[1] - w.start[1]
    const len = Math.hypot(dx, dy)
    const ux = dx / len
    const uy = dy / len
    const at = (s: number): [number, number] => [w.start[0] + ux * s, w.start[1] + uy * s]
    const a = at(o.offset)
    const b = at(o.offset + o.width)
    const key = [floorOf(w), o.type, r((a[0] + b[0]) / 2), r((a[1] + b[1]) / 2), r(o.width), r(o.sill), r(o.height)]
    if (o.hinge !== undefined) {
      const h = o.hinge === 'start' ? a : b
      key.push('hinge', r(h[0]), r(h[1]))
    }
    if (o.swing !== undefined) {
      const sign = o.swing === 'left' ? 1 : -1
      key.push('swing', r(-uy * sign), r(ux * sign))
    }
    out.push({ key: key.join(' '), id: o.id })
  }
  return out
}

function areasOf(plan: FloorPlan): Map<string, number> {
  const index = indexPlan(plan)
  const out = new Map<string, number>()
  for (const room of plan.rooms) {
    const poly = tryRoomPolygon(room, index)
    let area = 0
    if (poly) for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!
      const q = poly[(i + 1) % poly.length]!
      area += (p.x * q.y - q.x * p.y) / 2
    }
    const key = `${floorOf(room)} | ${room.name}`
    out.set(key, (out.get(key) ?? 0) + Math.abs(area))
  }
  return out
}

function checkCodes(plan: FloorPlan): string[] {
  const drawing = validatePlan(plan).issues.map((i) => `${i.severity} ${i.code}`)
  const rules = checkPlanSanity(plan).findings.map((f) => `rule ${f.code}`)
  return [...drawing, ...rules].sort()
}

export function sameBuilding(first: FloorPlan, second: FloorPlan): BuildingMatch {
  const grid = gridFor([first, second])
  const floors = [...new Set([...first.walls, ...second.walls].map(floorOf))].sort()
  const cell = STEP * STEP
  const floorMatches = floors.map((floor): FloorMatch => {
    const a = heights(first, floor, grid)
    const b = heights(second, floor, grid)
    const ea = heights(first, floor, grid, (w) => w.kind === 'exterior')
    const eb = heights(second, floor, grid, (w) => w.kind === 'exterior')
    let walls = 0
    let outside = 0
    let high = 0
    for (let k = 0; k < a.length; k++) {
      if (a[k]! > 0 !== b[k]! > 0) walls++
      else if (a[k]! > 0 && Math.abs(a[k]! - b[k]!) > 1e-6) high++
      if (ea[k]! > 0 !== eb[k]! > 0) outside++
    }
    return { floor, walls: walls * cell, outsideWalls: outside * cell, heights: high * cell }
  })
  const ka = openingKeys(first)
  const kb = openingKeys(second)
  const inB = new Set(kb.map((k) => k.key))
  const inA = new Set(ka.map((k) => k.key))
  const aa = areasOf(first)
  const ab = areasOf(second)
  let worst = 0
  const unmatched: string[] = []
  for (const [key, area] of aa) {
    const other = ab.get(key)
    if (other === undefined) unmatched.push(key)
    else worst = Math.max(worst, Math.abs(area - other))
  }
  for (const key of ab.keys()) if (!aa.has(key)) unmatched.push(key)
  return {
    floors: floorMatches,
    openings: {
      same: ka.filter((k) => inB.has(k.key)).length,
      of: ka.length,
      onlyFirst: ka.filter((k) => !inB.has(k.key)).map((k) => k.id),
      onlySecond: kb.filter((k) => !inA.has(k.key)).map((k) => k.id),
    },
    areas: { worst, unmatched },
    checks: { first: checkCodes(first), second: checkCodes(second) },
  }
}
