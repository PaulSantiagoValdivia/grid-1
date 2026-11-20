/**
 * An independent measure of the floor a room encloses. Test code only.
 *
 * It exists so that area tests compare Grid with something other than Grid. It shares no
 * code with `packages/floorplan`'s geometry and imports nothing at all; a test checks that.
 * It never reads a room's boundary list either. It measures the floor the way a person with
 * a planimeter would, from the wall footprints alone:
 *
 *  1. Every wall is a solid strip: its centre line widened by half its thickness on each
 *     side, with square ends exactly at the ends of the centre line.
 *  2. Where two walls end at the same point at an angle, the gap between their square ends
 *     is filled ("the corner made good"). A wall that ends against the middle of another
 *     needs no fill: its strip already ends inside the other one.
 *  3. The floor is the free space around a chosen seed point, bounded by those solids.
 *
 * Step 3 is exact, not sampled. The plane is cut into vertical slabs at every x where a
 * solid has a corner or two solid edges cross. Inside one slab nothing changes order, so
 * each free gap at the slab's middle is a trapezoid whose area is its width times its
 * height at the middle. Trapezoids in neighbouring slabs that share part of the slab line
 * are the same space, and a trapezoid that is unbounded, or open past the first or last
 * slab line, is outside.
 *
 * Virtual walls (lines with no width) are not handled: pass only walls with material.
 */

export type Point = readonly [number, number]

export interface SolidWall {
  readonly start: Point
  readonly end: Point
  readonly thickness: number
}

/** Ends closer than this are one joint. */
const JOINT = 1e-6
/** Below this a length counts as zero. */
const TINY = 1e-9

interface Edge {
  readonly a: Point
  readonly b: Point
}

interface Cell {
  readonly area: number
  /** Bottom and top of the gap on the slab's left and right lines; infinite when unbounded. */
  readonly left: readonly [number, number]
  readonly right: readonly [number, number]
}

/** The floor area (m²) of the space around `seed`. Throws when the seed is in a wall or outside. */
export function enclosedArea(walls: readonly SolidWall[], seed: Point): number {
  const solids = footprints(walls)
  const edges = solids.flatMap(edgesOf)
  const xs = slabLines(solids, edges)
  const slabs = xs.slice(1).map((x1, k) => cellsOf(solids, xs[k]!, x1))

  // Join the trapezoids into spaces. Node 0 is the outside.
  let next = 1
  const ids = slabs.map((cells) => cells.map(() => next++))
  const join = unionFind(next)
  slabs.forEach((cells, k) => {
    cells.forEach((cell, i) => {
      const id = ids[k]![i]!
      if (!Number.isFinite(cell.area)) join.union(id, 0)
      if (k === 0 && span(cell.left) > TINY) join.union(id, 0)
      if (k === slabs.length - 1 && span(cell.right) > TINY) join.union(id, 0)
      if (k + 1 < slabs.length) {
        slabs[k + 1]!.forEach((next, j) => {
          if (overlap(cell.right, next.left) > TINY) join.union(id, ids[k + 1]![j]!)
        })
      }
    })
  })

  const home = findSeed(slabs, xs, seed)
  if (home === null) throw new Error(`The seed (${seed[0]}, ${seed[1]}) falls inside a wall`)
  const space = home === 'outside' ? join.find(0) : join.find(ids[home[0]]![home[1]]!)
  if (space === join.find(0)) throw new Error(`The seed (${seed[0]}, ${seed[1]}) is not enclosed`)

  let total = 0
  slabs.forEach((cells, k) => cells.forEach((cell, i) => {
    if (join.find(ids[k]![i]!) === space) total += cell.area
  }))
  return total
}

/** The wall strips and the corner fills, each a convex polygon. */
function footprints(walls: readonly SolidWall[]): Point[][] {
  interface End { readonly wall: number; readonly at: Point; readonly dir: Point; readonly half: number }
  const strips: Point[][] = []
  const ends: End[] = []
  walls.forEach((w, i) => {
    const dx = w.end[0] - w.start[0]
    const dy = w.end[1] - w.start[1]
    const len = Math.hypot(dx, dy)
    if (len < TINY || w.thickness <= 0) return
    const dir: Point = [dx / len, dy / len]
    const half = w.thickness / 2
    const off = (p: Point, side: number): Point => [p[0] - dir[1] * half * side, p[1] + dir[0] * half * side]
    strips.push([off(w.start, -1), off(w.end, -1), off(w.end, 1), off(w.start, 1)])
    ends.push({ wall: i, at: w.start, dir, half }, { wall: i, at: w.end, dir, half })
  })

  const fills: Point[][] = []
  for (let i = 0; i < ends.length; i++) {
    for (let j = i + 1; j < ends.length; j++) {
      const p = ends[i]!
      const q = ends[j]!
      if (p.wall === q.wall) continue
      if (Math.hypot(p.at[0] - q.at[0], p.at[1] - q.at[1]) > JOINT) continue
      const turn = p.dir[0] * q.dir[1] - p.dir[1] * q.dir[0]
      if (Math.abs(turn) < 1e-9) continue // in line: no corner to fill
      // The fill is bounded by the two square ends and by where the faces of one wall
      // meet the faces of the other. Faces that meet far away (walls almost in line)
      // are ignored, as a mitre that long would not be built.
      const reach = 4 * Math.max(p.half, q.half)
      const points: Point[] = []
      for (const s of [1, -1]) {
        const pFace: Point = [p.at[0] - p.dir[1] * p.half * s, p.at[1] + p.dir[0] * p.half * s]
        const qFace: Point = [q.at[0] - q.dir[1] * q.half * s, q.at[1] + q.dir[0] * q.half * s]
        points.push(pFace, qFace)
        for (const t of [1, -1]) {
          const other: Point = [q.at[0] - q.dir[1] * q.half * t, q.at[1] + q.dir[0] * q.half * t]
          const meet = meetOfLines(pFace, p.dir, other, q.dir)
          if (meet && Math.hypot(meet[0] - p.at[0], meet[1] - p.at[1]) <= reach) points.push(meet)
        }
      }
      const hull = convexHull(points)
      if (hull.length >= 3) fills.push(hull)
    }
  }
  return [...strips, ...fills]
}

function meetOfLines(p: Point, u: Point, q: Point, v: Point): Point | null {
  const det = u[0] * v[1] - u[1] * v[0]
  if (Math.abs(det) < 1e-12) return null
  const s = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / det
  return [p[0] + u[0] * s, p[1] + u[1] * s]
}

/** Andrew's monotone chain; counter-clockwise, without repeated or in-line points. */
function convexHull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const side = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const chain = (list: readonly Point[]) => {
    const out: Point[] = []
    for (const p of list) {
      while (out.length >= 2 && side(out[out.length - 2]!, out[out.length - 1]!, p) <= TINY) out.pop()
      out.push(p)
    }
    out.pop()
    return out
  }
  return [...chain(sorted), ...chain([...sorted].reverse())]
}

function edgesOf(polygon: readonly Point[]): Edge[] {
  return polygon.map((a, i) => ({ a, b: polygon[(i + 1) % polygon.length]! }))
}

/** Every x where the order of edges can change: corners and crossings. */
function slabLines(solids: readonly Point[][], edges: readonly Edge[]): number[] {
  const xs = solids.flat().map((p) => p[0])
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const x = crossingX(edges[i]!, edges[j]!)
      if (x !== null) xs.push(x)
    }
  }
  xs.sort((a, b) => a - b)
  return xs.filter((x, i) => i === 0 || x - xs[i - 1]! > TINY)
}

function crossingX(e: Edge, f: Edge): number | null {
  const r: Point = [e.b[0] - e.a[0], e.b[1] - e.a[1]]
  const s: Point = [f.b[0] - f.a[0], f.b[1] - f.a[1]]
  const det = r[0] * s[1] - r[1] * s[0]
  if (Math.abs(det) < 1e-15) return null
  const qp: Point = [f.a[0] - e.a[0], f.a[1] - e.a[1]]
  const t = (qp[0] * s[1] - qp[1] * s[0]) / det
  const u = (qp[0] * r[1] - qp[1] * r[0]) / det
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return e.a[0] + r[0] * t
}

/** Height of a non-vertical edge's line at `x`. */
function heightAt(e: Edge, x: number): number {
  return e.a[1] + ((e.b[1] - e.a[1]) * (x - e.a[0])) / (e.b[0] - e.a[0])
}

/** The free gaps between the solids in the slab from x0 to x1. */
function cellsOf(solids: readonly Point[][], x0: number, x1: number): Cell[] {
  const mid = (x0 + x1) / 2
  // Where the slab's middle line passes through each solid: from its bottom edge to its top.
  const blocks: { lo: number; hi: number; loEdge: Edge; hiEdge: Edge }[] = []
  for (const polygon of solids) {
    let lo: { y: number; e: Edge } | null = null
    let hi: { y: number; e: Edge } | null = null
    for (const e of edgesOf(polygon)) {
      if (Math.min(e.a[0], e.b[0]) >= mid || Math.max(e.a[0], e.b[0]) <= mid) continue
      const y = heightAt(e, mid)
      if (!lo || y < lo.y) lo = { y, e }
      if (!hi || y > hi.y) hi = { y, e }
    }
    if (lo && hi && hi.y - lo.y > TINY) blocks.push({ lo: lo.y, hi: hi.y, loEdge: lo.e, hiEdge: hi.e })
  }
  blocks.sort((a, b) => a.lo - b.lo)
  const merged: typeof blocks = []
  for (const b of blocks) {
    const last = merged[merged.length - 1]
    if (last && b.lo <= last.hi + TINY) {
      if (b.hi > last.hi) merged[merged.length - 1] = { ...last, hi: b.hi, hiEdge: b.hiEdge }
    } else {
      merged.push(b)
    }
  }

  const width = x1 - x0
  const at = (e: Edge | null, x: number, fallback: number) => (e ? heightAt(e, x) : fallback)
  const cell = (below: Edge | null, above: Edge | null): Cell => ({
    area: below && above ? width * (heightAt(above, mid) - heightAt(below, mid)) : Infinity,
    left: [at(below, x0, -Infinity), at(above, x0, Infinity)],
    right: [at(below, x1, -Infinity), at(above, x1, Infinity)]
  })
  const cells: Cell[] = []
  let below: Edge | null = null
  for (const b of merged) {
    cells.push(cell(below, b.loEdge))
    below = b.hiEdge
  }
  cells.push(cell(below, null))
  return cells
}

const span = (r: readonly [number, number]) => r[1] - r[0]
const overlap = (a: readonly [number, number], b: readonly [number, number]) => Math.min(a[1], b[1]) - Math.max(a[0], b[0])

/** Which slab and gap hold the seed; null when it is inside a solid. */
function findSeed(slabs: readonly Cell[][], xs: readonly number[], seed: Point): [number, number] | 'outside' | null {
  const k = xs.findIndex((x, i) => i + 1 < xs.length && x <= seed[0] && seed[0] <= xs[i + 1]!)
  if (k < 0) return 'outside'
  const t = (seed[0] - xs[k]!) / (xs[k + 1]! - xs[k]!)
  const along = (a: number, b: number) => (Number.isFinite(a) ? a + (b - a) * t : a)
  const i = slabs[k]!.findIndex((c) => along(c.left[0], c.right[0]) < seed[1] && seed[1] < along(c.left[1], c.right[1]))
  return i < 0 ? null : [k, i]
}

function unionFind(size: number) {
  const parent = Array.from({ length: size }, (_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!
      i = parent[i]!
    }
    return i
  }
  return {
    find,
    union(a: number, b: number) {
      parent[find(a)] = find(b)
    }
  }
}
