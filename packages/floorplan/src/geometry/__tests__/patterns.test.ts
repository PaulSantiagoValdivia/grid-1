/**
 * LVL-8: opening patterns, a facade's rhythm stated once, expand into the plain openings a person
 * would place by hand, and say what they could not place.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan, type Opening } from '../../types/floorplan'
import { readPlanParts } from '../../types/readParts'
import { planInMetres } from '../../types/units'
import { EXPORT_FORMATS, exportPlan } from '../../export/planExport'
import { expandPatterns, withPatterns } from '../patterns'
import { planForFloor } from '../floors'
import { validatePlan } from '../validate'

/** A box of four walls, 10 m by 6 m, on one floor; ids `<p>s`, `<p>e`, `<p>n`, `<p>w`. */
const box = (floor: string, p: string, reversedNorth = false) => [
  { id: `${p}s`, start: [0, 0], end: [10, 0], thickness: 0.2, height: 2.7, kind: 'exterior', floor },
  { id: `${p}e`, start: [10, 0], end: [10, 6], thickness: 0.2, height: 2.7, kind: 'exterior', floor },
  reversedNorth
    ? { id: `${p}n`, start: [0, 6], end: [10, 6], thickness: 0.2, height: 2.7, kind: 'exterior', floor }
    : { id: `${p}n`, start: [10, 6], end: [0, 6], thickness: 0.2, height: 2.7, kind: 'exterior', floor },
  { id: `${p}w`, start: [0, 6], end: [0, 0], thickness: 0.2, height: 2.7, kind: 'exterior', floor },
]

/** A house of two floors, the first floor's north wall drawn the other way round. */
function house(extra: Record<string, unknown> = {}): FloorPlan {
  return parseFloorPlan({
    version: '1',
    floors: [
      { id: 'ground', name: 'Ground floor', level: 0 },
      { id: 'first', name: 'First floor', level: 1 },
    ],
    walls: [...box('ground', 'g'), ...box('first', 'f', true)],
    rooms: [
      { id: 'g', name: 'Hall', boundary: ['gs', 'ge', 'gn', 'gw'], floor: 'ground' },
      { id: 'f', name: 'Bed', boundary: ['fs', 'fe', 'fn', 'fw'], floor: 'first' },
    ],
    openings: [{ id: 'd1', wall: 'gs', type: 'door', offset: 4.5, width: 1, height: 2.1 }],
    ...extra,
  })
}

const window = { type: 'window', width: 1.2, height: 1.4, sill: 0.9 }
const placed = (plan: FloorPlan, pattern: string): Opening[] => {
  const result = expandPatterns(plan)
  return (result.placed.get(pattern) ?? []).map((id) => result.plan.openings.find((o) => o.id === id)!)
}

describe('where a pattern puts its openings', () => {
  it('spreads a count evenly from the start margin to the end margin', () => {
    const plan = house({ patterns: [{ id: 'nw', wall: 'gn', opening: window, count: 5, margins: { start: 1, end: 1 } }] })
    // 10 m less 1 m each end: 8 m; the first window from 1 m, the last ending at 9 m, so the five
    // stand 1.7 m apart, centre to centre, with 0.5 m between them.
    expect(placed(plan, 'nw').map((o) => o.offset)).toEqual([1, 2.7, 4.4, 6.1, 7.8])
    // Kept to the micrometre, as a person writes a length.
    const thirds = house({ patterns: [{ id: 't', wall: 'gn', opening: window, count: 4, margins: { start: 1, end: 1 } }] })
    expect(placed(thirds, 't').map((o) => o.offset)).toEqual([1, 3.266667, 5.533333, 7.8])
  })

  it('puts one opening alone in the middle of the free stretch', () => {
    const plan = house({ patterns: [{ id: 'one', wall: 'ge', opening: window, count: 1, margins: { start: 1 } }] })
    // 6 m less the start margin: 5 m, from 1 m; the window's middle at 3.5 m.
    expect(placed(plan, 'one').map((o) => o.offset)).toEqual([2.9])
  })

  it('places one every spacing from the start margin, as many as fit before the end margin', () => {
    const plan = house({ patterns: [{ id: 'sp', wall: 'gn', opening: window, spacing: 2.5, margins: { start: 0.6, end: 0.6 } }] })
    // 8.8 m free: windows at 0.6, 3.1, 5.6 and 8.1, the last ending at 9.3, before 9.4.
    expect(placed(plan, 'sp').map((o) => o.offset)).toEqual([0.6, 3.1, 5.6, 8.1])
  })

  it('places a count at a spacing from the start margin', () => {
    const plan = house({ patterns: [{ id: 'cs', wall: 'gn', opening: window, count: 2, spacing: 3, margins: { start: 2 } }] })
    expect(placed(plan, 'cs').map((o) => o.offset)).toEqual([2, 5])
  })

  it('gives each opening the template and an id from the pattern, the floor and its number', () => {
    const plan = house({ patterns: [{ id: 'dd', wall: 'gn', opening: { type: 'door', width: 0.9, height: 2.1, hinge: 'start', swing: 'left' }, count: 2, margins: { start: 1, end: 1 } }] })
    expect(placed(plan, 'dd')).toEqual([
      { id: 'dd-ground-1', wall: 'gn', type: 'door', offset: 1, width: 0.9, sill: 0, height: 2.1, hinge: 'start', swing: 'left' },
      { id: 'dd-ground-2', wall: 'gn', type: 'door', offset: 8.1, width: 0.9, sill: 0, height: 2.1, hinge: 'start', swing: 'left' },
    ])
  })

  it('repeats on the floors above where the openings stand, on the wall in the same line, from its own start', () => {
    const plan = house({ patterns: [{ id: 'up', wall: 'gn', opening: window, count: 2, margins: { start: 1, end: 1 }, floors: ['first'] }] })
    const openings = placed(plan, 'up')
    // On the ground the north wall runs from x 10 to 0: offsets 1 and 7.8 stand at x 9..7.8 and 2.2..1.
    // Upstairs it runs from x 0 to 10, so the same windows are 1 and 7.8 from its start too, mirrored.
    expect(openings.map((o) => [o.id, o.wall, o.offset])).toEqual([
      ['up-ground-1', 'gn', 1],
      ['up-ground-2', 'gn', 7.8],
      ['up-first-1', 'fn', 7.8],
      ['up-first-2', 'fn', 1],
    ])
  })

  it('reads a pattern in a plan written in millimetres in metres, like every other length', () => {
    const raw = { units: 'mm', patterns: [{ id: 'p', wall: 'gn', opening: { type: 'window', width: 1200, height: 1400, sill: 900 }, spacing: 2500, margins: { start: 600, end: 600 } }] }
    expect(planInMetres(raw).raw.patterns).toEqual([{ id: 'p', wall: 'gn', opening: { type: 'window', width: 1.2, height: 1.4, sill: 0.9 }, spacing: 2.5, margins: { start: 0.6, end: 0.6 } }])
  })

  it('leaves a plan with no patterns as it is', () => {
    const plan = house()
    expect(expandPatterns(plan).plan).toBe(plan)
    expect(withPatterns(plan)).toBe(plan)
  })

  it('takes the patterns off the plan it gives, so expanding again changes nothing', () => {
    const plan = house({ patterns: [{ id: 'nw', wall: 'gs', opening: window, count: 2 }] })
    const once = expandPatterns(plan).plan
    expect(once.patterns).toBeUndefined()
    expect(expandPatterns(once).plan).toBe(once)
  })
})

describe('what a pattern could not place is said, never dropped in silence', () => {
  const codes = (plan: FloorPlan): string[] => expandPatterns(plan).issues.map((i) => i.code)

  it('names a wall the plan does not have, with the nearest', () => {
    const plan = house({ patterns: [{ id: 'p', wall: 'gnn', opening: window, count: 2 }] })
    const [issue] = expandPatterns(plan).issues
    expect(issue).toMatchObject({ code: 'pattern/unknown-wall', entity: 'pattern', id: 'p', severity: 'error' })
    expect(issue!.message).toContain('"gn"')
    expect(placed(plan, 'p')).toEqual([])
  })

  it('says a pattern does not fit, with what it needs and has', () => {
    const plan = house({ patterns: [{ id: 'p', wall: 'ge', opening: window, count: 5, margins: { start: 1, end: 1 } }] })
    const [issue] = expandPatterns(plan).issues
    expect(issue!.code).toBe('pattern/does-not-fit')
    expect(issue!.message).toContain("needs 6.00 m for 5 openings 1.20 m wide, and has between its margins, 4.00 m of the wall's 6.00 m")
    expect(codes(house({ patterns: [{ id: 'q', wall: 'ge', opening: window, spacing: 1 }] }))).toEqual(['pattern/does-not-fit'])
  })

  it('names a floor the plan does not have, and a floor with no wall in the line', () => {
    expect(codes(house({ patterns: [{ id: 'p', wall: 'gn', opening: window, count: 2, floors: ['frist'] }] }))).toEqual(['pattern/unknown-floor'])
    const plan = house({ patterns: [{ id: 'p', wall: 'gn', opening: window, count: 2, floors: ['first'] }] })
    const short = { ...plan, walls: plan.walls.map((w) => (w.id === 'fn' ? { ...w, start: [0, 6] as [number, number], end: [5, 6] as [number, number] } : w)) }
    const result = expandPatterns(short)
    expect(result.issues.map((i) => i.code)).toEqual(['pattern/no-wall-above'])
    expect(result.issues[0]!.message).toContain('opening 1 of 2')
    expect(result.placed.get('p')).toEqual(['p-ground-1', 'p-ground-2', 'p-first-2'])
  })

  it('leaves out an opening that would lie over another, and one whose id is taken', () => {
    const over = house({ patterns: [{ id: 'p', wall: 'gs', opening: window, count: 3, margins: { start: 1, end: 1 } }] })
    const result = expandPatterns(over)
    // The middle window, 4.4 to 5.6, lies over the door, 4.5 to 5.5.
    expect(result.issues.map((i) => [i.code, i.message.includes('"d1"')])).toEqual([['pattern/overlaps-opening', true]])
    expect(result.placed.get('p')).toEqual(['p-ground-1', 'p-ground-3'])
    const taken = house({ patterns: [{ id: 'p', wall: 'gn', opening: window, count: 1 }], openings: [{ id: 'p-ground-1', wall: 'ge', type: 'window', offset: 1, width: 1, height: 1 }] })
    expect(codes(taken)).toEqual(['pattern/id-clash'])
  })

  it('is part of the drawing check, which checks the openings a pattern places like any other', () => {
    const plan = house({ patterns: [{ id: 'p', wall: 'gnn', opening: window, count: 2 }, { id: 'tall', wall: 'gn', opening: { type: 'window', width: 1, height: 3, sill: 0.9 }, count: 1 }] })
    const issues = validatePlan(plan).issues
    expect(issues.some((i) => i.code === 'pattern/unknown-wall' && i.id === 'p')).toBe(true)
    // The tall window runs above its wall: the drawing check names the opening the pattern placed.
    expect(issues.some((i) => i.entity === 'opening' && i.id === 'tall-ground-1')).toBe(true)
  })

  it('reads a pattern with neither a count nor a spacing as a part left out, and keeps the rest', () => {
    const read = readPlanParts({ ...house(), patterns: [{ id: 'bad', wall: 'gn', opening: window }, { id: 'good', wall: 'gs', opening: window, count: 1 }] })
    expect(read.plan?.patterns?.map((p) => p.id)).toEqual(['good'])
    expect(read.plan === null ? [] : read.faults.map((f) => [f.kind, 'part' in f && f.part !== null ? f.part.list : null])).toEqual([['part-left-out', 'patterns']])
  })

  it('never cuts a slice with a pattern on it: a slice holds plain openings only', () => {
    const plan = house({ patterns: [{ id: 'p', wall: 'gn', opening: window, count: 2, floors: ['first'] }] })
    expect(planForFloor(plan, 'first').patterns).toBeUndefined()
    expect(planForFloor(withPatterns(plan), 'first').openings.map((o) => o.id)).toEqual(['p-first-1', 'p-first-2'])
  })
})

describe('done when: a pattern exports the same bytes as its openings written out by hand', () => {
  const now = new Date('2026-11-22T10:00:00Z')
  const options = { projectId: 'facade-test', projectName: 'Facade test', now }
  const patterned = house({
    patterns: [
      { id: 'nw', wall: 'gn', opening: window, count: 2, margins: { start: 1, end: 1 }, floors: ['first'] },
      { id: 'sw', wall: 'gs', opening: { type: 'window', width: 1, height: 1.2, sill: 1 }, spacing: 2.5, margins: { start: 0.5, end: 6 } },
    ],
  })
  // What a person would write: the same windows, placed by hand, with the numbers worked out on paper.
  const byHand = house({
    openings: [
      { id: 'd1', wall: 'gs', type: 'door', offset: 4.5, width: 1, height: 2.1 },
      { id: 'nw-ground-1', wall: 'gn', type: 'window', offset: 1, width: 1.2, sill: 0.9, height: 1.4 },
      { id: 'nw-ground-2', wall: 'gn', type: 'window', offset: 7.8, width: 1.2, sill: 0.9, height: 1.4 },
      { id: 'nw-first-1', wall: 'fn', type: 'window', offset: 7.8, width: 1.2, sill: 0.9, height: 1.4 },
      { id: 'nw-first-2', wall: 'fn', type: 'window', offset: 1, width: 1.2, sill: 0.9, height: 1.4 },
      { id: 'sw-ground-1', wall: 'gs', type: 'window', offset: 0.5, width: 1, sill: 1, height: 1.2 },
      { id: 'sw-ground-2', wall: 'gs', type: 'window', offset: 3, width: 1, sill: 1, height: 1.2 },
    ],
  })

  it('expands into exactly the openings written by hand', () => {
    expect(expandPatterns(patterned).plan.openings).toEqual(byHand.openings)
  })

  for (const format of EXPORT_FORMATS) {
    it(`writes the same ${format.toUpperCase()}, byte for byte, on every floor`, () => {
      for (const floorId of ['ground', 'first']) {
        const a = exportPlan(patterned, format, { ...options, floorId }).data
        const b = exportPlan(byHand, format, { ...options, floorId }).data
        expect(typeof a === 'string' ? a : Buffer.from(a).toString('base64')).toBe(typeof b === 'string' ? b : Buffer.from(b).toString('base64'))
        if (format === 'ifc') break
      }
    })
  }

  it('holds the windows in the export, so the test above compares something', () => {
    const ifc = exportPlan(patterned, 'ifc', options).data as string
    expect(ifc).toContain('nw-first-2')
    expect((ifc.match(/IFCWINDOW\(/g) ?? []).length).toBe(6)
  })
})

describe('a pattern of doors or windows of a kind (CNT-14 with LVL-8)', () => {
  const sliding = { type: 'door', width: 2, height: 2.1, kind: 'sliding', opens: { width: 1 }, hinge: 'start', swing: 'left' }

  it('gives every opening its kind, its part that opens and its handing', () => {
    const plan = house({ patterns: [{ id: 'sd', wall: 'gn', opening: sliding, count: 2, margins: { start: 1, end: 1 } }] })
    expect(placed(plan, 'sd')).toEqual([
      { id: 'sd-ground-1', wall: 'gn', type: 'door', offset: 1, width: 2, sill: 0, height: 2.1, hinge: 'start', swing: 'left', kind: 'sliding', opens: { width: 1 } },
      { id: 'sd-ground-2', wall: 'gn', type: 'door', offset: 7, width: 2, sill: 0, height: 2.1, hinge: 'start', swing: 'left', kind: 'sliding', opens: { width: 1 } },
    ])
    // A sliding door sweeps nothing: the plan states its handing, and no door is left unchecked.
    expect(validatePlan(expandPatterns(plan).plan).issues.filter((i) => i.code.startsWith('opening/'))).toEqual([])
  })

  it('turns the handing on a wall above that runs the other way, so each door hangs from the same jamb', () => {
    const door = { type: 'door', width: 0.9, height: 2.1, kind: 'single', hinge: 'start', swing: 'left' }
    const plan = house({ patterns: [{ id: 'dd', wall: 'gn', opening: door, count: 1, floors: ['first'] }] })
    // The ground's north wall runs from x 10 to 0 and the first floor's from 0 to 10: the end nearer
    // its start and its left face are the other way round upstairs.
    expect(placed(plan, 'dd').map((o) => [o.wall, o.kind, o.hinge, o.swing])).toEqual([
      ['gn', 'single', 'start', 'left'],
      ['fn', 'single', 'end', 'right'],
    ])
  })

  it('reads the part that opens in a plan written in millimetres in metres', () => {
    const raw = { units: 'mm', patterns: [{ id: 'p', wall: 'gn', opening: { type: 'window', width: 1200, height: 1400, opens: { width: 600, height: 700 } }, count: 2 }], openings: [{ id: 'w', wall: 'gs', type: 'window', offset: 100, width: 1200, height: 1400, opens: { width: 600 } }] }
    const { raw: inMetres } = planInMetres(raw)
    expect(inMetres.patterns[0]!.opening.opens).toEqual({ width: 0.6, height: 0.7 })
    expect(inMetres.openings[0]!.opens).toEqual({ width: 0.6 })
  })
})
