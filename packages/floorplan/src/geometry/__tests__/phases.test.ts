import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { readPlanParts } from '../../types/readParts'
import { readingNotes } from '../../types/reading'
import { refurbishment, refurbishmentRaw } from '../../test-support/phases'
import { buildFloorPlan } from '../floorplan'
import { mergeBase, partPhases, phaseClashes, phaseCounts, planHasPhases, planInState } from '../phases'
import { validatePlan } from '../validate'
import { planAreaFigures } from '../areas'
import { buildScene } from '../scene3d'

const errors = (plan: FloorPlan) => validatePlan(plan).issues.filter((i) => i.severity === 'error')

describe('existing, demolished and new (CNT-10)', () => {
  it('keeps every phase as the file states it, with no note and nothing left out', () => {
    const raw = refurbishmentRaw()
    const plan = refurbishment()
    const stated = (list: string) => (raw[list] as { id: string; phase?: string }[]).map((p) => [p.id, p.phase])
    expect(plan.walls.map((w) => [w.id, w.phase])).toEqual(stated('walls'))
    expect(plan.rooms.map((r) => [r.id, r.phase])).toEqual(stated('rooms'))
    expect(plan.openings.map((o) => [o.id, o.phase])).toEqual(stated('openings'))
    const parts = readPlanParts(raw)
    expect(parts.plan).not.toBeNull()
    expect('faults' in parts ? parts.faults : null).toEqual([])
    expect(readingNotes(raw)).toEqual([])
    // Written back as read: no default lands in the file.
    expect(JSON.parse(JSON.stringify(plan)).openings.find((o: { id: string }) => o.id === 'd-kitchen').phase).toBeUndefined()
  })

  it('reads an opening that states no phase in its wall\'s, when that is demolished or new', () => {
    const phases = partPhases(refurbishment())
    expect(phases.get('d-kitchen')).toBe('demolished')
    expect(phases.get('d-study')).toBe('new')
    expect(phaseCounts(refurbishment())).toEqual({
      existing: { walls: 6, openings: 5, rooms: 1 },
      demolished: { walls: 1, openings: 3, rooms: 3 },
      new: { walls: 1, openings: 3, rooms: 3 },
    })
  })

  it('holds two states: before the work and after it', () => {
    const plan = refurbishment()
    const before = planInState(plan, 'before')
    const after = planInState(plan, 'after')
    expect(before.walls.map((w) => w.id)).not.toContain('wst')
    expect(after.walls.map((w) => w.id)).not.toContain('wk')
    expect(before.rooms.map((r) => r.id).sort()).toEqual(['bath', 'dining', 'kitchen', 'living-old'])
    expect(after.rooms.map((r) => r.id).sort()).toEqual(['bath', 'kitchen-dining', 'living', 'study'])
    expect(after.openings.map((o) => o.id)).not.toContain('d-kitchen')
    expect(planInState(after, 'after')).toBe(after)
  })

  it('accepts a widened door as an old opening and a new one in the same place (done when 2)', () => {
    const plan = refurbishment()
    expect(errors(plan)).toEqual([])
    expect(validatePlan(plan).issues.map((i) => i.code)).not.toContain('opening/overlap')
    // The same two openings with no phase overlap, as before.
    const strip = <T extends { phase?: unknown }>(part: T): T => {
      const rest = { ...part }
      delete rest.phase
      return rest
    }
    const unphased = parseFloorPlan({ ...refurbishmentRaw(), walls: plan.walls.map(strip), rooms: plan.rooms.filter((r) => r.phase !== 'demolished').map(strip), openings: plan.openings.filter((o) => o.id !== 'd-kitchen').map(strip) })
    expect(validatePlan(unphased).issues.map((i) => i.code)).toContain('opening/overlap')
  })

  it('refuses an opening or a room that stands when its wall does not', () => {
    const raw = refurbishmentRaw()
    const openings = (raw['openings'] as Record<string, unknown>[]).map((o) => (o['id'] === 'd-kitchen' ? { ...o, phase: 'new' } : o))
    const rooms = (raw['rooms'] as Record<string, unknown>[]).map((r) => (r['id'] === 'bath' ? { ...r, boundary: ['wb', 'we', 'wn', 'wst'] } : r))
    const plan = parseFloorPlan({ ...raw, openings, rooms })
    expect(phaseClashes(plan).map((c) => [c.code, c.id, c.wall])).toEqual([
      ['opening/phase-wall', 'd-kitchen', 'wk'],
      ['room/phase-wall', 'bath', 'wst'],
    ])
    const result = validatePlan(plan)
    expect(result.broken.has('d-kitchen')).toBe(true)
    expect(result.broken.has('bath')).toBe(true)
    expect(result.issues.filter((i) => i.id === 'bath').map((i) => i.code)).toEqual(['room/phase-wall'])
  })

  it('checks a demolished part as it stands before the work', () => {
    const raw = refurbishmentRaw()
    // A demolished wall whose door does not fit it is still a fault, before the work.
    const openings = (raw['openings'] as Record<string, unknown>[]).map((o) => (o['id'] === 'd-kitchen' ? { ...o, offset: 4.8 } : o))
    const issues = validatePlan(parseFloorPlan({ ...raw, openings })).issues
    expect(issues.filter((i) => i.id === 'd-kitchen').map((i) => i.severity)).toContain('error')
  })

  it('reads a plan with no phase exactly as before', () => {
    const plan = parseFloorPlan({ version: '1', walls: [{ id: 'a', start: [0, 0], end: [4, 0] }], rooms: [], openings: [] })
    expect(planHasPhases(plan)).toBe(false)
    expect(planInState(plan, 'after')).toBe(plan)
    expect(partPhases(plan).size).toBe(0)
    expect(buildFloorPlan(plan).walls[0]).not.toHaveProperty('phase')
  })

  it('measures and models the building after the work', () => {
    const plan = refurbishment()
    const rooms = planAreaFigures(plan).floors.flatMap((f) => f.rooms.map((r) => r.id)).sort()
    expect(rooms).toEqual(['bath', 'kitchen-dining', 'living', 'study'])
    const scene = buildScene(plan)
    expect(scene.walls.map((w) => w.id)).not.toContain('wk')
  })

  it('draws the demolished walls and openings as they stood, and the rest with their phase', () => {
    const drawing = buildFloorPlan(refurbishment())
    const phaseOf = (id: string) => drawing.walls.find((w) => w.id === id)?.phase
    expect(phaseOf('wk')).toBe('demolished')
    expect(phaseOf('wst')).toBe('new')
    expect(phaseOf('ws')).toBe('existing')
    expect(drawing.walls[0]!.id).toBe('wk')
    const openings = new Map(drawing.openings.map((o) => [o.id, o.phase]))
    expect(openings.get('d-bath-old')).toBe('demolished')
    expect(openings.get('d-bath')).toBe('new')
    expect(openings.get('d-kitchen')).toBe('demolished')
    expect(drawing.rooms.map((r) => r.id).sort()).toEqual(['bath', 'kitchen-dining', 'living', 'study'])
    expect(drawing.issues.filter((i) => i.severity === 'error')).toEqual([])
  })
})

describe('a fit-out on a base plan (CNT-10, CP4-4)', () => {
  const shell = parseFloorPlan({
    version: '1',
    walls: [
      { id: 's1', start: [0, 0], end: [8, 0], thickness: 0.3, kind: 'exterior' },
      { id: 's2', start: [8, 0], end: [8, 5], thickness: 0.3, kind: 'exterior' },
      { id: 's3', start: [8, 5], end: [0, 5], thickness: 0.3, kind: 'exterior' },
      { id: 's4', start: [0, 5], end: [0, 0], thickness: 0.3, kind: 'exterior' },
    ],
    rooms: [{ id: 'shell', name: 'Shell', boundary: ['s1', 's2', 's3', 's4'] }],
    openings: [{ id: 'entrance', wall: 's1', type: 'door', offset: 1, width: 1, height: 2.1 }],
  })
  const fitOut = parseFloorPlan({
    version: '1',
    base: 'shell.json',
    walls: [{ id: 'p1', start: [4, 0], end: [4, 5], thickness: 0.1, kind: 'partition' }],
    rooms: [
      { id: 'front', name: 'Front', boundary: ['s1', 'p1', 's3', 's4'] },
      { id: 'back', name: 'Back', boundary: ['s1', 's2', 's3', 'p1'] },
    ],
    openings: [{ id: 'd1', wall: 'p1', type: 'door', offset: 2, width: 0.8, height: 2.1 }],
  })

  it('reads the base\'s walls and openings as existing and its own parts as new', () => {
    const merged = mergeBase(fitOut, shell)
    expect([...merged.walls]).toEqual(['s1', 's2', 's3', 's4'])
    expect([...merged.openings]).toEqual(['entrance'])
    expect(merged.clashes).toEqual([])
    const phases = partPhases(merged.plan)
    expect(phases.get('s1')).toBe('existing')
    expect(phases.get('p1')).toBe('new')
    expect(phases.get('front')).toBe('new')
    expect(merged.plan.rooms.map((r) => r.id)).toEqual(['front', 'back'])
    expect(errors(merged.plan)).toEqual([])
  })

  it('names a base part whose id the fit-out uses', () => {
    const clash = parseFloorPlan({ ...fitOut, walls: [...fitOut.walls, { id: 's2', start: [0, 1], end: [1, 1] }] })
    expect(mergeBase(clash, shell).clashes).toEqual(['s2'])
  })
})
