/**
 * LVL-5 (C15, lab VE-9, H-10): a wall that rises through floors, shared by them, and a window in it
 * through two storeys. The lab's case is hx3: a stair window from 0.9 to 5.4 m in the north wall of
 * a house of two floors, refused as taller than its wall and not drawn.
 */
import { describe, expect, it } from 'vitest'
import { ACROSS_STAIR_WINDOW, stairWindowAsWritten, stairWindowThrough } from '../../test-support/through'
import { parseFloorPlan } from '../../types/floorplan'
import type { FloorPlan } from '../plan'
import { planForFloor } from '../floors'
import { floorElevations } from '../elevations'
import { validatePlan } from '../validate'
import { isCarriedOpening, sharedPart, wallFloorIds, wallRise, wholeWall } from '../through'
import { buildFloorPlan } from '../floorplan'
import { buildScene } from '../scene3d'
import { planSection } from '../section'
import { planAreaFigures } from '../areas'
import { toIfc } from '../export/ifc'

const asWritten = stairWindowAsWritten
const throughBoth = stairWindowThrough

const codes = (plan: FloorPlan): string[] => validatePlan(plan).issues.map((i) => `${i.code} ${i.id}`)

describe('the lab\'s stair window through two storeys (VE-9)', () => {
  it('is refused as the lab found it, on a wall of one floor', () => {
    expect(codes(asWritten())).toEqual(['opening/too-tall g-w-stair-tall'])
  })

  it('leaves the drawing with nothing to say once the wall rises through both floors', () => {
    // Not the wall faults of the first floor either: its rooms close on the ground floor's wall.
    expect(codes(throughBoth())).toEqual([])
  })

  it('is accepted as one window through two floors, in a wall that rises through both', () => {
    const plan = throughBoth()
    const result = validatePlan(plan)
    expect(result.issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(result.broken).not.toContain('g-w-stair-tall')
    expect(result.issues.map((i) => i.code)).not.toContain('room/cross-floor')
    expect(plan.openings.filter((o) => o.id === 'g-w-stair-tall')).toHaveLength(1)
    // From the ground floor's level: the ground storey's 2.70 m, its slab's 0.25 m and the first floor's 2.70 m.
    const wall = plan.walls.find((w) => w.id === 'g-n')!
    expect(wallFloorIds(plan, wall)).toEqual(['ground', 'first'])
    expect(wallRise(plan, wall)).toBeCloseTo(5.65, 9)
  })

  it('stands the storeys where they stood with a wall of each floor', () => {
    const before = floorElevations(asWritten()).floors
    const after = floorElevations(throughBoth()).floors
    expect(after.get('first')).toEqual(before.get('first'))
    expect(after.get('ground')).toEqual(before.get('ground'))
  })

  it('gives each floor its stretch of the wall, and of the window', () => {
    const plan = throughBoth()
    const ground = planForFloor(plan, 'ground')
    const first = planForFloor(plan, 'first')
    const g = ground.walls.find((w) => w.id === 'g-n')!
    const f = first.walls.find((w) => w.id === 'g-n')!
    expect(g.height).toBeCloseTo(2.95, 9)
    expect(f.height).toBeCloseTo(2.7, 9)
    expect(f.floor).toBe('first')
    expect(sharedPart(g)!.base).toBe(true)
    expect(sharedPart(f)!.top).toBe(true)
    const low = ground.openings.find((o) => o.id === 'g-w-stair-tall')!
    const high = first.openings.find((o) => o.id === 'g-w-stair-tall')!
    expect([low.sill, low.sill + low.height]).toEqual([0.9, expect.closeTo(2.95, 9)])
    expect([high.sill, high.sill + high.height]).toEqual([0, expect.closeTo(2.45, 9)])
    expect(isCarriedOpening(low)).toBe(false)
    expect(isCarriedOpening(high)).toBe(true)
    // Each floor's slice is sound on its own: no part of the window is refused there.
    for (const slice of [ground, first]) expect(validatePlan(slice).broken).not.toContain('g-w-stair-tall')
  })

  it('is drawn on both floors\' plans, as a window in the wall', () => {
    const plan = throughBoth()
    for (const floor of ['ground', 'first']) {
      const drawing = buildFloorPlan(planForFloor(plan, floor))
      expect(drawing.walls.map((w) => w.id)).toContain('g-n')
      expect(drawing.openings.map((o) => o.id)).toContain('g-w-stair-tall')
    }
  })

  it('is one wall and one window in 3D, from the ground floor\'s level to the top of the first floor', () => {
    const plan = throughBoth()
    const ground = buildScene(planForFloor(plan, 'ground'))
    const first = buildScene(planForFloor(plan, 'first'))
    const wall = ground.walls.find((w) => w.id === 'g-n')!
    expect(wall.elevation.height).toBeCloseTo(5.65, 9)
    // The stair window is 0.7 m wide, 7.0 m along the wall from its start.
    const hole = wall.elevation.holes.find((h) => Math.min(...h.map((p) => p.x)) === 7)!
    expect(Math.min(...hole.map((p) => p.y))).toBeCloseTo(0.9, 9)
    expect(Math.max(...hole.map((p) => p.y))).toBeCloseTo(5.4, 9)
    // Drawn once: the first floor's scene does not draw it again.
    expect(first.walls.map((w) => w.id)).not.toContain('g-n')
  })

  it('is one wall and one window in the IFC, on the ground floor\'s storey', () => {
    const ifc = toIfc(throughBoth(), { projectId: 'p', timestamp: new Date(0) })
    const named = (text: string, kind: string, name: string) => text.split('\n').filter((line) => line.includes(`${kind}(`) && line.includes(`'${name}'`))
    expect(named(ifc, 'IFCWALLSTANDARDCASE', 'g-n')).toHaveLength(1)
    expect(named(ifc, 'IFCWINDOW', 'g-w-stair-tall')).toHaveLength(1)
    // As written, the window is refused and not exported at all (lab H-10: "it is not drawn").
    expect(named(toIfc(asWritten(), { projectId: 'p', timestamp: new Date(0) }), 'IFCWINDOW', 'g-w-stair-tall')).toHaveLength(0)
  })

  it('counts the rooms of both floors as before', () => {
    const before = planAreaFigures(asWritten())
    const after = planAreaFigures(throughBoth())
    expect(after.floors).toEqual(before.floors)
    expect(after.net).toEqual(before.net)
  })

  it('is cut once, whole, by a section through the window, with the window open through the slab', () => {
    const plan = throughBoth()
    const section = planSection(plan, ACROSS_STAIR_WINDOW)
    const wall = section.parts.filter((p) => p.kind === 'wall' && p.id === 'g-n')
    expect(wall).toHaveLength(1)
    const ys = wall[0]!.rings.flatMap((r) => r.map((p) => p.y))
    expect(Math.min(...ys)).toBe(0)
    expect(Math.max(...ys)).toBeCloseTo(5.65, 9)
    // The wall stands below and above the window, and the window is open from 0.9 to 5.4 m.
    const pieces = wall[0]!.rings.map((r) => [Math.min(...r.map((p) => p.y)), Math.max(...r.map((p) => p.y))])
    expect(pieces).toEqual([[0, 0.9], [5.4, expect.closeTo(5.65, 9)]])
    // Nothing cut stands in the window: not the slab between the floors either.
    const across = (x: number, y: number) => section.cut.some((shape) => inside(shape.outline, x, y) && !shape.holes.some((h) => inside(h, x, y)))
    const mid = wall[0]!.rings[0]!.reduce((s, p) => s + p.x, 0) / wall[0]!.rings[0]!.length
    expect(across(mid, 2.8)).toBe(false)
    expect(across(mid, 0.5)).toBe(true)
  })

  it('says so when a wall rises through a floor that is not above its own', () => {
    const raw = JSON.parse(JSON.stringify(throughBoth())) as FloorPlan
    const plan = parseFloorPlan({ ...raw, walls: raw.walls.map((w) => (w.id === 'g-n' ? { ...w, through: 'roof' } : w)) })
    const issue = validatePlan(plan).issues.find((i) => i.code === 'wall/through-floor')!
    expect(issue.severity).toBe('warning')
    expect(issue.message).toBe('Wall "g-n" rises through floor "roof", which the plan does not have, so it stands on its own floor only. The floors above it are "first".')
    // It is then a wall of the ground floor alone: the first floor's rooms rest on another floor's wall.
    expect(codes(plan)).toContain('room/cross-floor f-stair')
  })

  it('keeps a plan with no wall through floors exactly as it was sliced', () => {
    const plan = asWritten()
    const slice = planForFloor(plan, 'first')
    expect(slice.walls.every((w) => plan.walls.includes(w))).toBe(true)
    expect(slice.openings.every((o) => plan.openings.includes(o))).toBe(true)
    expect(wholeWall(slice.walls[0]!, [])!.wall).toBe(slice.walls[0])
  })
})

function inside(ring: readonly { x: number; y: number }[], x: number, y: number): boolean {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!
    const b = ring[j]!
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}
