import { describe, expect, it } from 'vitest'
import type { Vec2 } from '../vec2'
import { signedArea } from '../vec2'
import type { Triangulation } from '../triangulate'
import { triangulate } from '../triangulate'

/**
 * The triangulator is tested by invariants, not by expected triangles: there
 * are many valid triangulations of a polygon, and a test that pins one of them
 * passes for a mirrored or inside-out result as long as it happens to match.
 * What every valid answer shares is what is asserted here.
 */

const p = (x: number, y: number): Vec2 => ({ x, y })

/** Counter-clockwise, like a wall elevation's outline. */
const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  p(x0, y0),
  p(x1, y0),
  p(x1, y1),
  p(x0, y1)
]

/** Clockwise, the way `scene3d.holeFrom` winds an opening. */
const hole = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  p(x0, y0),
  p(x0, y1),
  p(x1, y1),
  p(x1, y0)
]

// ---------------------------------------------------------------------------
// Independent helpers: nothing below calls into the module under test.
// ---------------------------------------------------------------------------

function trianglePoints(result: Triangulation, tri: readonly [number, number, number]): Vec2[] {
  return tri.map((i) => result.vertices[i]!)
}

/** Even-odd containment, so it does not depend on how a ring winds. */
function insidePolygon(point: Vec2, ring: readonly Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!
    const b = ring[j]!
    if (a.y > point.y !== b.y > point.y) {
      const x = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
      if (point.x < x) inside = !inside
    }
  }
  return inside
}

function insideRegion(point: Vec2, outline: readonly Vec2[], holes: readonly (readonly Vec2[])[]) {
  return insidePolygon(point, outline) && !holes.some((h) => insidePolygon(point, h))
}

/** Projection interval of a triangle onto an axis. */
function project(points: readonly Vec2[], axis: Vec2): [number, number] {
  const values = points.map((q) => q.x * axis.x + q.y * axis.y)
  return [Math.min(...values), Math.max(...values)]
}

/**
 * Whether two triangles share interior area. Separating-axis test: they are
 * apart if some edge normal puts them on different sides. Touching along an
 * edge or at a corner is not overlapping, hence the strict margin.
 */
function overlap(a: readonly Vec2[], b: readonly Vec2[]): boolean {
  for (const tri of [a, b]) {
    for (let i = 0; i < 3; i++) {
      const from = tri[i]!
      const to = tri[(i + 1) % 3]!
      const axis = p(-(to.y - from.y), to.x - from.x)
      const [minA, maxA] = project(a, axis)
      const [minB, maxB] = project(b, axis)
      const scale = Math.hypot(axis.x, axis.y)
      if (maxA <= minB + 1e-9 * scale || maxB <= minA + 1e-9 * scale) return false
    }
  }
  return true
}

function key(i: number, j: number): string {
  return `${i}>${j}`
}

/** Everything every valid triangulation of `outline` minus `holes` satisfies. */
function expectValid(
  outline: readonly Vec2[],
  holes: readonly (readonly Vec2[])[],
  result: Triangulation
): void {
  const expected =
    Math.abs(signedArea(outline)) - holes.reduce((s, h) => s + Math.abs(signedArea(h)), 0)

  // 1. The triangles tile exactly the region's area.
  const total = result.triangles.reduce(
    (sum, tri) => sum + signedArea(trianglePoints(result, tri)),
    0
  )
  expect(total).toBeCloseTo(expected, 9)

  // 2. Every triangle is counter-clockwise and not a sliver of zero area.
  for (const tri of result.triangles) {
    expect(signedArea(trianglePoints(result, tri))).toBeGreaterThan(1e-12)
  }

  // 3. No triangle falls outside the region (or into a hole). The centroid
  //    alone would miss a triangle that merely clips a corner, so three more
  //    points sit just inside each corner.
  for (const tri of result.triangles) {
    const [a, b, c] = trianglePoints(result, tri) as [Vec2, Vec2, Vec2]
    const centre = p((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3)
    const samples = [centre, ...[a, b, c].map((v) => p(v.x + (centre.x - v.x) * 0.02, v.y + (centre.y - v.y) * 0.02))]
    for (const s of samples) expect(insideRegion(s, outline, holes)).toBe(true)
  }

  // 4. No two triangles overlap.
  for (let i = 0; i < result.triangles.length; i++) {
    for (let j = i + 1; j < result.triangles.length; j++) {
      const a = trianglePoints(result, result.triangles[i]!)
      const b = trianglePoints(result, result.triangles[j]!)
      expect(overlap(a, b), `triangles ${i} and ${j} overlap`).toBe(false)
    }
  }

  // 5. The mesh is conforming: a boundary edge belongs to one triangle, in the
  //    ring's direction; every other edge to exactly two, in opposite
  //    directions. A T-junction or a flipped triangle breaks this.
  const directed = new Map<string, number>()
  for (const [a, b, c] of result.triangles) {
    for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
      directed.set(key(i, j), (directed.get(key(i, j)) ?? 0) + 1)
    }
  }
  const boundary = new Set<string>()
  for (const ring of result.rings) {
    for (let k = 0; k < ring.length; k++) boundary.add(key(ring[k]!, ring[(k + 1) % ring.length]!))
  }
  for (const [edge, count] of directed) {
    expect(count, `edge ${edge} used ${count} times`).toBe(1)
    const [i, j] = edge.split('>')
    const opposite = directed.has(`${j}>${i}`)
    expect(
      boundary.has(edge) !== opposite,
      `edge ${edge} must be either boundary or shared with its opposite`
    ).toBe(true)
  }
  for (const edge of boundary) expect(directed.has(edge), `ring edge ${edge} unused`).toBe(true)

  // 6. The rings are the region's boundary: the outer ones wind
  //    counter-clockwise, the holes clockwise, and they sum to its area.
  const ringArea = result.rings.reduce(
    (sum, ring) => sum + signedArea(ring.map((i) => result.vertices[i]!)),
    0
  )
  expect(ringArea).toBeCloseTo(expected, 9)
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

interface Case {
  readonly name: string
  readonly outline: Vec2[]
  readonly holes: Vec2[][]
}

const CASES: Case[] = [
  { name: 'a square', outline: rect(0, 0, 1, 1), holes: [] },
  {
    name: 'a triangle',
    outline: [p(0, 0), p(4, 0), p(1, 3)],
    holes: []
  },
  {
    name: 'an L, concave',
    outline: [p(0, 0), p(4, 0), p(4, 1), p(1, 1), p(1, 4), p(0, 4)],
    holes: []
  },
  {
    name: 'a comb with deep teeth',
    outline: [
      p(0, 0), p(7, 0), p(7, 3), p(6, 3), p(6, 1), p(5, 1), p(5, 3), p(4, 3),
      p(4, 1), p(3, 1), p(3, 3), p(2, 3), p(2, 1), p(1, 1), p(1, 3), p(0, 3)
    ],
    holes: []
  },
  { name: 'a square with a hole in the middle', outline: rect(0, 0, 6, 6), holes: [hole(2, 2, 4, 4)] },
  {
    name: 'a square with two holes',
    outline: rect(0, 0, 10, 4),
    holes: [hole(1, 1, 3, 3), hole(6, 1, 9, 3)]
  },
  {
    name: 'a wall with a window',
    outline: rect(0, 0, 5, 2.7),
    holes: [hole(1, 0.9, 2.2, 2.1)]
  },
  {
    // The door's bottom edge lies ON the wall's bottom edge: the hole touches
    // the outline along a segment. This is the case that made earcut-style
    // ray casting unreliable.
    name: 'a wall with a door (sill 0)',
    outline: rect(0, 0, 5, 2.7),
    holes: [hole(1, 0, 1.9, 2.1)]
  },
  {
    name: 'a door at the start of the wall (touches a corner)',
    outline: rect(0, 0, 5, 2.7),
    holes: [hole(0, 0, 0.9, 2.1)]
  },
  {
    name: 'a door at the end of the wall',
    outline: rect(0, 0, 5, 2.7),
    holes: [hole(4.1, 0, 5, 2.1)]
  },
  {
    name: 'a window flush against the top',
    outline: rect(0, 0, 5, 2.7),
    holes: [hole(1, 1, 2, 2.7)]
  },
  {
    name: 'a full-height opening that cuts the wall in two',
    outline: rect(0, 0, 5, 2.7),
    holes: [hole(2, 0, 3, 2.7)]
  },
  {
    name: 'a door and a window sharing part of an edge',
    outline: rect(0, 0, 5, 2.7),
    holes: [hole(1, 0, 2, 2.1), hole(2, 0.9, 3, 2.1)]
  },
  {
    name: 'a door and a window touching at one corner',
    outline: rect(0, 0, 5, 2.7),
    holes: [hole(1, 0, 2, 1.5), hole(2, 1.5, 3, 2.4)]
  },
  {
    name: 'two doors side by side and a window',
    outline: rect(0, 0, 8, 2.7),
    holes: [hole(0.5, 0, 1.4, 2.1), hole(1.4, 0, 2.3, 2.1), hole(4, 0.9, 5.5, 2.1)]
  },
  {
    name: 'holes wound counter-clockwise (the wrong way)',
    outline: rect(0, 0, 6, 6),
    holes: [rect(2, 2, 4, 4)]
  },
  {
    name: 'an outline wound clockwise (the wrong way)',
    outline: rect(0, 0, 6, 6).reverse(),
    holes: [hole(2, 2, 4, 4)]
  }
]

describe('triangulate — invariants', () => {
  for (const { name, outline, holes } of CASES) {
    it(`tiles ${name} exactly`, () => {
      expectValid(outline, holes, triangulate(outline, holes))
    })
  }

  it('turns a square into two triangles', () => {
    expect(triangulate(rect(0, 0, 1, 1)).triangles).toHaveLength(2)
  })

  it('splits a wall at a full-height opening into two separate pieces', () => {
    const result = triangulate(rect(0, 0, 5, 2.7), [hole(2, 0, 3, 2.7)])
    const outer = result.rings.filter((ring) => signedArea(ring.map((i) => result.vertices[i]!)) > 0)
    expect(outer).toHaveLength(2)
    expect(result.rings).toHaveLength(2)
  })

  it('reports the wall under an open door as no boundary at all', () => {
    // The door's bottom and the wall's bottom are the same segment, so it is
    // not a face: a solid built from these rings must not have one.
    const result = triangulate(rect(0, 0, 5, 2.7), [hole(1, 0, 1.9, 2.1)])
    const bottom = result.rings
      .flatMap((ring) => ring.map((i, k) => [result.vertices[i]!, result.vertices[ring[(k + 1) % ring.length]!]!]))
      .filter(([a, b]) => a.y === 0 && b.y === 0)
    const covered = bottom.reduce((s, [a, b]) => s + Math.abs(b.x - a.x), 0)
    expect(covered).toBeCloseTo(5 - 0.9, 9)
  })
})

describe('triangulate — tolerance', () => {
  it('treats a hole that overshoots the outline by float noise as touching it', () => {
    // 0.1 + 0.2 !== 0.3. An opening whose far edge is computed as offset +
    // width can miss the wall length by an ulp and still be valid.
    const length = 0.3
    const result = triangulate(rect(0, 0, length, 2.7), [hole(0.1, 0, 0.1 + 0.2, 2.1)])
    expectValid(rect(0, 0, length, 2.7), [hole(0.1, 0, length, 2.1)], result)
  })

  it('treats adjacent openings whose shared edge differs by noise as sharing it', () => {
    const noisy = 1.9 + 1e-12
    const holes = [hole(1, 0, 1.9, 2.1), hole(noisy, 0, 2.8, 2.1)]
    const result = triangulate(rect(0, 0, 5, 2.7), holes)
    expectValid(rect(0, 0, 5, 2.7), [hole(1, 0, 1.9, 2.1), hole(1.9, 0, 2.8, 2.1)], result)
  })
})

describe('triangulate — total on bad input', () => {
  it('returns nothing for fewer than three points', () => {
    expect(triangulate([p(0, 0), p(1, 0)]).triangles).toEqual([])
    expect(triangulate([]).triangles).toEqual([])
  })

  it('ignores repeated consecutive points', () => {
    const outline = [p(0, 0), p(1, 0), p(1, 0), p(1, 1), p(0, 1), p(0, 0)]
    expectValid(rect(0, 0, 1, 1), [], triangulate(outline))
  })

  it('ignores a collinear sliver of a hole', () => {
    expectValid(rect(0, 0, 4, 4), [], triangulate(rect(0, 0, 4, 4), [[p(1, 1), p(2, 1), p(3, 1)]]))
  })

  it('terminates on overlapping holes, which validation now skips but a caller could still pass', () => {
    const result = triangulate(rect(0, 0, 5, 2.7), [hole(1, 0.5, 3, 2), hole(2, 0.5, 4, 2)])
    expect(Array.isArray(result.triangles)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Rotation equivariance
// ---------------------------------------------------------------------------

function rotate(points: readonly Vec2[], angle: number, about: Vec2 = p(0, 0)): Vec2[] {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return points.map((q) => {
    const dx = q.x - about.x
    const dy = q.y - about.y
    return p(about.x + dx * cos - dy * sin, about.y + dx * sin + dy * cos)
  })
}

function canonical(result: Triangulation): string[] {
  return result.triangles.map((tri) => [...tri].sort((a, b) => a - b).join(',')).sort()
}

/**
 * Triangulating a rotated copy must give the same triangles over the same
 * vertices, with the vertices rotated. If the algorithm leans on the frame —
 * "leftmost point", "ray to +x", ties broken by coordinate — a rotation
 * changes the answer, and the wall extruded along a diagonal differs from the
 * same wall along an axis. This invariant has caught that class of bug here.
 */
function expectRotationEquivariant(
  outline: readonly Vec2[],
  holes: readonly (readonly Vec2[])[],
  angle: number
): void {
  const before = triangulate(outline, holes)
  // Two empty results are trivially equal; that must not count as a pass.
  expect(before.triangles.length).toBeGreaterThan(0)
  const about = p(1.3, -0.7)
  const after = triangulate(
    rotate(outline, angle, about),
    holes.map((h) => rotate(h, angle, about))
  )

  expect(canonical(after)).toEqual(canonical(before))
  expect(after.vertices).toHaveLength(before.vertices.length)
  const back = rotate(after.vertices, -angle, about)
  back.forEach((q, i) => {
    expect(q.x).toBeCloseTo(before.vertices[i]!.x, 9)
    expect(q.y).toBeCloseTo(before.vertices[i]!.y, 9)
  })
}

describe('triangulate — rotation equivariance', () => {
  for (const { name, outline, holes } of CASES) {
    for (const angle of [0.37, 1.1, 2.6, -0.9]) {
      it(`${name}, rotated by ${angle}`, () => {
        expectRotationEquivariant(outline, holes, angle)
      })
    }
  }
})

// ---------------------------------------------------------------------------
// Randomised, seeded: a failure reproduces from its seed
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A random star-shaped polygon: radii vary, angles only increase, so it is
 * simple and counter-clockwise but usually concave. Every vertex is at least
 * `inner` from the origin, which keeps a disc of about half that inside, and
 * that is where the holes go.
 */
function randomStar(rand: () => number): { outline: Vec2[]; inner: number } {
  const n = 5 + Math.floor(rand() * 8)
  const inner = 6
  const outline: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const angle = ((i + rand() * 0.7) / n) * Math.PI * 2
    const radius = inner + rand() * 4
    outline.push(p(Math.cos(angle) * radius, Math.sin(angle) * radius))
  }
  return { outline, inner }
}

/** Small squares on a 2×2 grid inside the inscribed disc; some touch. */
function randomHoles(rand: () => number): Vec2[][] {
  const spacing = rand() < 0.5 ? 2 : 0.8 // 0.8 makes neighbours share an edge
  const holes: Vec2[][] = []
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      if (rand() < 0.5) continue
      const cx = (sx * spacing) / 2
      const cy = (sy * spacing) / 2
      holes.push(hole(cx - 0.4, cy - 0.4, cx + 0.4, cy + 0.4))
    }
  }
  return holes
}

/** A wall elevation with openings placed along it; some touch, some reach the edges. */
function randomWall(rand: () => number): Case {
  const length = 3 + Math.round(rand() * 50) / 10
  const height = 2.4 + Math.round(rand() * 6) / 10
  const holes: Vec2[][] = []
  let cursor = 0
  while (cursor < length - 0.7) {
    const gap = rand() < 0.4 ? 0 : Math.round(rand() * 8) / 10
    const width = 0.6 + Math.round(rand() * 8) / 10
    const from = cursor + gap
    const to = from + width
    if (to > length) break
    const sill = [0, 0, 0.9, 1.2][Math.floor(rand() * 4)]!
    const head = rand() < 0.3 ? height : sill + 0.6 + Math.round(rand() * 8) / 10
    if (head <= height && head > sill + 0.1) holes.push(hole(from, sill, to, Math.min(head, height)))
    cursor = to
  }
  return { name: 'random wall', outline: rect(0, 0, length, height), holes }
}

describe('triangulate — randomised', () => {
  it('tiles 60 random star polygons, with and without holes', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rand = mulberry32(seed)
      const { outline } = randomStar(rand)
      const holes = seed % 2 === 0 ? randomHoles(rand) : []
      expectValid(outline, holes, triangulate(outline, holes))
    }
  })

  it('tiles 120 random wall elevations, openings touching the edges and each other', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const { outline, holes } = randomWall(mulberry32(1000 + seed))
      expectValid(outline, holes, triangulate(outline, holes))
    }
  })

  it('is rotation-equivariant on random walls and stars', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const wall = randomWall(mulberry32(5000 + seed))
      expectRotationEquivariant(wall.outline, wall.holes, 0.1 + seed * 0.37)

      const rand = mulberry32(9000 + seed)
      const { outline } = randomStar(rand)
      expectRotationEquivariant(outline, randomHoles(rand), 0.2 + seed * 0.53)
    }
  })
})
