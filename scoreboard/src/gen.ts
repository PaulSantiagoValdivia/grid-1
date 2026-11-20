// Seeded plan generators, ported from the Grid lab's cluster L (the "many and random" plans).
// Every plan is rebuilt from its seed and options, so the scoreboard stores seeds, not plans.
// The generator knows the rectangles it built, so it also returns each room's true net area,
// worked out from the construction and never from Grid.
//
// Keep this file byte-for-byte compatible in behaviour: the damage set and the sound plans are
// checked against fingerprints of the lab's own plans (see damage.ts and the tests).
export type Raw = {
  version: '1'
  units: 'm'
  walls: RawWall[]
  rooms: RawRoom[]
  openings: RawOpening[]
  floors?: { id: string; name: string; level: number }[]
}
export interface RawWall {
  id: string
  start: [number, number]
  end: [number, number]
  thickness: number
  height: number
  kind: 'exterior' | 'interior' | 'partition'
  virtual?: boolean
  floor?: string
}
export interface RawRoom {
  id: string
  name: string
  boundary: string[]
  use?: string
  floor?: string
}
export interface RawOpening {
  id: string
  wall: string
  type: 'door' | 'window' | 'opening'
  offset: number
  width: number
  sill?: number
  height: number
  hinge?: 'start' | 'end'
  swing?: 'left' | 'right'
}

export interface Rng {
  (): number
  int(lo: number, hi: number): number
  range(lo: number, hi: number): number
  pick<T>(list: readonly T[]): T
  chance(p: number): boolean
  shuffle<T>(list: readonly T[]): T[]
}

export function rng(seed: number): Rng {
  let a = seed >>> 0
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const r = next as Rng
  r.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1))
  r.range = (lo, hi) => lo + next() * (hi - lo)
  r.pick = (list) => list[Math.floor(next() * list.length)]!
  r.chance = (p) => next() < p
  r.shuffle = (list) => {
    const out = [...list]
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1))
      ;[out[i], out[j]] = [out[j]!, out[i]!]
    }
    return out
  }
  return r
}

const USES = ['bedroom', 'living', 'dining', 'kitchen', 'bathroom', 'corridor', 'storage', 'other'] as const
const round = (v: number, step: number): number => Math.round(v / step) * step
const r3 = (v: number): number => Math.round(v * 1000) / 1000

// ───────────────────────── random rectangle buildings ─────────────────────────

/** A straight wall line of the construction: horizontal (y = pos) or vertical (x = pos). */
interface LineSpec {
  key: string
  axis: 'h' | 'v'
  pos: number
  from: number
  to: number
  thickness: number
  kind: 'exterior' | 'interior' | 'partition'
  /** Coordinates along the line where a perpendicular line ends on it. */
  cuts: number[]
}

interface Leaf {
  x0: number
  x1: number
  y0: number
  y1: number
  s: LineSpec
  e: LineSpec
  n: LineSpec
  w: LineSpec
}

export interface BuildingOptions {
  readonly seed: number
  readonly rooms: number
  readonly floors: number
  /** 'lines': one wall per straight line. 'pieces': every line cut at each junction. */
  readonly mode: 'lines' | 'pieces'
  /** Smallest centre-line room side. */
  readonly minRoom?: number
  readonly thick?: readonly [number, number]
  readonly extThick?: readonly [number, number]
  /** Coordinate step. 0 keeps raw random decimals. */
  readonly step?: number
  readonly openings?: boolean
}

export interface TruthRoom {
  readonly id: string
  readonly floor: string
  readonly area: number
  /** Centre-line rectangle, for shrinking and for messages. */
  readonly rect: readonly [number, number, number, number]
  readonly t: readonly [number, number, number, number]
}

export interface Generated {
  readonly plan: Raw
  readonly truth: readonly TruthRoom[]
  readonly meta: Record<string, unknown>
}

const FLOOR_IDS = ['ground', 'first', 'second', 'third']

export function randomBuilding(options: BuildingOptions): Generated {
  const r = rng(options.seed)
  const minRoom = options.minRoom ?? 1.4
  const step = options.step ?? 0.05
  const snap = (v: number): number => (step > 0 ? r3(round(v, step)) : v)
  const [tLo, tHi] = options.thick ?? [0.07, 0.3]
  const [eLo, eHi] = options.extThick ?? [0.2, 0.5]

  const side = Math.max(minRoom * 1.5, Math.sqrt(options.rooms) * r.range(2.6, 4.2))
  const W = snap(Math.max(minRoom, side * r.range(0.7, 1.5)))
  const H = snap(Math.max(minRoom, side * r.range(0.7, 1.5)))

  const plan: Raw = { version: '1', units: 'm', walls: [], rooms: [], openings: [] }
  if (options.floors > 1) {
    plan.floors = FLOOR_IDS.slice(0, options.floors).map((id, level) => ({ id, name: `${id[0]!.toUpperCase()}${id.slice(1)} floor`, level }))
  }
  const truth: TruthRoom[] = []
  let doorsMissing = 0

  for (let f = 0; f < options.floors; f++) {
    const floorId = FLOOR_IDS[f]!
    const p = options.floors > 1 ? `${floorId}-` : ''
    const height = r3(round(r.range(2.4, 3.2), 0.05))
    let lineNo = 0
    const mk = (axis: 'h' | 'v', pos: number, from: number, to: number, ext: boolean): LineSpec => ({
      key: `${p}${ext ? 'ext' : 'w'}${++lineNo}`,
      axis,
      pos,
      from,
      to,
      thickness: r3(round(ext ? r.range(eLo, eHi) : r.range(tLo, tHi), 0.01)),
      kind: ext ? 'exterior' : r.chance(0.6) ? 'interior' : 'partition',
      cuts: []
    })
    const s = mk('h', 0, 0, W, true)
    const e = mk('v', W, 0, H, true)
    const n = mk('h', H, 0, W, true)
    const w = mk('v', 0, 0, H, true)
    const lines: LineSpec[] = [s, e, n, w]
    let leaves: Leaf[] = [{ x0: 0, x1: W, y0: 0, y1: H, s, e, n, w }]

    while (leaves.length < options.rooms) {
      const able = leaves.filter((l) => l.x1 - l.x0 >= 2 * minRoom || l.y1 - l.y0 >= 2 * minRoom)
      if (able.length === 0) break
      // Bigger rooms are split more often.
      able.sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0))
      const leaf = able[Math.floor(r() * r() * able.length)]!
      const w0 = leaf.x1 - leaf.x0
      const h0 = leaf.y1 - leaf.y0
      const canV = w0 >= 2 * minRoom
      const canH = h0 >= 2 * minRoom
      const vertical = canV && canH ? (w0 > h0 ? r.chance(0.75) : r.chance(0.25)) : canV
      if (vertical) {
        let x = snap(r.range(leaf.x0 + minRoom, leaf.x1 - minRoom))
        x = Math.min(Math.max(x, leaf.x0 + minRoom), leaf.x1 - minRoom)
        const line = mk('v', x, leaf.y0, leaf.y1, false)
        lines.push(line)
        leaf.s.cuts.push(x)
        leaf.n.cuts.push(x)
        leaves = leaves.filter((l) => l !== leaf)
        leaves.push({ ...leaf, x1: x, e: line }, { ...leaf, x0: x, w: line })
      } else {
        let y = snap(r.range(leaf.y0 + minRoom, leaf.y1 - minRoom))
        y = Math.min(Math.max(y, leaf.y0 + minRoom), leaf.y1 - minRoom)
        const line = mk('h', y, leaf.x0, leaf.x1, false)
        lines.push(line)
        leaf.w.cuts.push(y)
        leaf.e.cuts.push(y)
        leaves = leaves.filter((l) => l !== leaf)
        leaves.push({ ...leaf, y1: y, n: line }, { ...leaf, y0: y, s: line })
      }
    }

    // Walls. Each line becomes one wall, or one wall per stretch between junctions.
    interface Piece {
      id: string
      from: number
      to: number
      flipped: boolean
    }
    const pieces = new Map<LineSpec, Piece[]>()
    for (const line of lines) {
      const stops =
        options.mode === 'pieces'
          ? [line.from, ...[...new Set(line.cuts)].filter((c) => c > line.from + 1e-9 && c < line.to - 1e-9).sort((a, b) => a - b), line.to]
          : [line.from, line.to]
      const list: Piece[] = []
      for (let i = 0; i + 1 < stops.length; i++) {
        const id = stops.length === 2 ? line.key : `${line.key}.${i + 1}`
        const flipped = r.chance(0.5)
        const a: [number, number] = line.axis === 'h' ? [stops[i]!, line.pos] : [line.pos, stops[i]!]
        const b: [number, number] = line.axis === 'h' ? [stops[i + 1]!, line.pos] : [line.pos, stops[i + 1]!]
        plan.walls.push({
          id,
          start: flipped ? b : a,
          end: flipped ? a : b,
          thickness: line.thickness,
          height,
          kind: line.kind,
          ...(options.floors > 1 ? { floor: floorId } : {})
        })
        list.push({ id, from: stops[i]!, to: stops[i + 1]!, flipped })
      }
      pieces.set(line, list)
    }

    const along = (line: LineSpec, lo: number, hi: number, descending: boolean): string[] => {
      const ids = pieces
        .get(line)!
        .filter((piece) => piece.to > lo + 1e-9 && piece.from < hi - 1e-9)
        .map((piece) => piece.id)
      return descending ? ids.reverse() : ids
    }

    leaves.forEach((leaf, i) => {
      let boundary = [
        ...along(leaf.s, leaf.x0, leaf.x1, false),
        ...along(leaf.e, leaf.y0, leaf.y1, false),
        ...along(leaf.n, leaf.x0, leaf.x1, true),
        ...along(leaf.w, leaf.y0, leaf.y1, true)
      ]
      const turn = r.int(0, boundary.length - 1)
      boundary = [...boundary.slice(turn), ...boundary.slice(0, turn)]
      if (r.chance(0.3)) boundary.reverse()
      const id = `${p}room${i + 1}`
      plan.rooms.push({
        id,
        name: `Room ${i + 1}${options.floors > 1 ? ` (${floorId})` : ''}`,
        boundary,
        use: r.pick(USES),
        ...(options.floors > 1 ? { floor: floorId } : {})
      })
      const t: [number, number, number, number] = [leaf.s.thickness, leaf.e.thickness, leaf.n.thickness, leaf.w.thickness]
      const netW = leaf.x1 - leaf.x0 - t[1] / 2 - t[3] / 2
      const netH = leaf.y1 - leaf.y0 - t[0] / 2 - t[2] / 2
      truth.push({
        id,
        floor: floorId,
        area: netW > 0 && netH > 0 ? netW * netH : 0,
        rect: [leaf.x0, leaf.y0, leaf.x1, leaf.y1],
        t
      })
    })

    if (options.openings === false) continue

    // Openings. A free stretch of a line is the run between two junctions, so it has
    // exactly one room on each side. One opening per stretch at most, so none overlap.
    let openingNo = 0
    const place = (line: LineSpec, lo: number, hi: number, type: 'door' | 'window' | 'opening'): boolean => {
      const margin = 0.35
      const room = hi - lo - 2 * margin
      const width =
        type === 'window' ? r3(round(r.range(0.6, Math.min(2.2, room)), 0.05)) : type === 'door' ? r3(round(r.range(0.7, 1.0), 0.05)) : r3(round(r.range(0.8, Math.min(2.5, room)), 0.05))
      if (!(room >= 0.6) || width > room + 1e-9 || !(width > 0)) return false
      const from = r3(lo + margin + r.range(0, room - width))
      const piece = pieces.get(line)!.find((pc) => from >= pc.from - 1e-9 && from + width <= pc.to + 1e-9)
      if (!piece) return false
      const offset = r3(piece.flipped ? piece.to - (from + width) : from - piece.from)
      const sill = type === 'window' ? r3(round(r.range(0.4, 1.1), 0.05)) : 0
      const oh = type === 'window' ? r3(round(r.range(0.6, Math.min(1.5, height - sill - 0.1)), 0.05)) : r3(round(r.range(2.0, 2.1), 0.05))
      plan.openings.push({
        id: `${p}${type === 'window' ? 'win' : type === 'door' ? 'door' : 'gap'}${++openingNo}`,
        wall: piece.id,
        type,
        offset: Math.max(0, offset),
        width,
        ...(type === 'window' ? { sill } : {}),
        height: oh,
        ...(type === 'door' ? { hinge: r.pick(['start', 'end'] as const), swing: r.pick(['left', 'right'] as const) } : {})
      })
      return true
    }
    const stretches = (line: LineSpec): [number, number][] => {
      const stops = [line.from, ...[...new Set(line.cuts)].sort((a, b) => a - b), line.to]
      const out: [number, number][] = []
      for (let i = 0; i + 1 < stops.length; i++) out.push([stops[i]!, stops[i + 1]!])
      return out
    }
    let entrance = f > 0
    for (const line of lines) {
      const runs = r.shuffle(stretches(line))
      if (line.kind === 'exterior') {
        for (const [lo, hi] of runs) {
          if (!entrance && place(line, lo, hi, 'door')) entrance = true
          else if (r.chance(0.75)) place(line, lo, hi, 'window')
        }
      } else {
        // One way through per inside line keeps every room reachable.
        let done = false
        for (const [lo, hi] of runs) {
          if (!done) done = place(line, lo, hi, r.chance(0.8) ? 'door' : 'opening')
          else if (r.chance(0.15)) place(line, lo, hi, 'door')
        }
        if (!done) doorsMissing++
      }
    }
    if (!entrance) doorsMissing++
  }

  return { plan, truth, meta: { ...options, W, H, built: plan.rooms.length, doorsMissing } }
}

// ───────────────────────── shapes built from rectangles ─────────────────────────

export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
