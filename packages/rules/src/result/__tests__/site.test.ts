/**
 * BRF-3 (lab EL-16): the record of a plan with a plot. On main at 26729c9 the house slid 2 m, to
 * 1 m from a boundary where 3 m was asked, gave the same lines as where it stood: three
 * `plan/unknown-field` lines for `boundary`, `streets` and `setbacks`, and nothing else
 * (`reviews/BRF-3.md`). The house is the lab's G series house: its outside face runs from x 3
 * to 12 in a plot 15 m wide, so 3.00 m from the east edge, and 1.00 m slid 2 m east.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { labPlanText } from '@ongrid/floorplan/test-support/lab'
import { approvalWords } from '../approvalWords'
import { inspectPlan } from '../inspect'

const raw = (dx = 0, site: Record<string, unknown> = {}): Record<string, unknown> => {
  const plan = JSON.parse(labPlanText('G/scenarios/s01b-site-fields.json')) as Record<string, unknown>
  const walls = (plan['walls'] as { start: number[]; end: number[] }[]).map((w) => ({ ...w, start: [w.start[0]! + dx, w.start[1]], end: [w.end[0]! + dx, w.end[1]] }))
  return { ...plan, walls, site: { boundary: [[0, 0], [15, 0], [15, 30], [0, 30]], streets: [1], setbacks: [{ from: 'all', distance: 3, source: 'given' }], ...site } }
}
const said = (result: ReturnType<typeof inspectPlan>): string[] => result.lines.map((l) => `${l.code} ${l.message}`)

describe('the plot in the record (BRF-3, EL-16)', () => {
  it('reads the boundary, the street and the set-back, and says nothing where the house keeps to it', () => {
    const at = inspectPlan(raw())
    expect(at.read).toBe(true)
    expect(said(at)).toEqual([])
    const check = at.coverage.find((c) => c.ruleId === 'site-boundary')!
    expect(check).toMatchObject({ looksAt: 'edge', lookedAt: [{ floor: '', ids: ['1', '2', '3', '4'] }], lookedAtCount: 4, findings: 0 })
    expect(at.checks.map((c) => c.id)).toContain('site-boundary')
  })

  it('reports the house slid to 1 m from the east boundary where 3 m was asked', () => {
    const slid = inspectPlan(raw(2))
    const line = slid.lines.find((l) => l.code === 'plan/setback-short')!
    expect(line.message).toContain('1.00 m from the east boundary; you asked for 3.00 m')
    expect(line).toMatchObject({
      kind: 'finding',
      thing: { kind: 'plan', id: '' },
      floor: 'ground',
      message: 'The building is 1.00 m from the east boundary; you asked for 3.00 m',
      found: "the building's outside face 1.00 m from edge 2 of the plot's boundary, which faces east",
      needed: "3.00 m from it, the set-back the person asked for from every edge: their own figure, not a code's",
    })
    expect(slid.problems).toBe(1)
    expect(slid.coverage.find((c) => c.ruleId === 'site-boundary')!.findings).toBe(1)
  })

  it('names a house over the boundary, and words no line as a pass', () => {
    const over = inspectPlan(raw(3.5, { streets: [1, 2] }))
    const line = over.lines.find((l) => l.code === 'plan/over-boundary')!
    expect(line.message).toBe('The building reaches 0.50 m over the east boundary, out of the plot')
    expect(line.found).toBe("the building's outside face 0.50 m past edge 2 of the plot's boundary, which faces east, on the street")
    for (const l of [...over.lines, ...inspectPlan(raw(2)).lines]) {
      expect(approvalWords([l.message, l.found, l.needed, l.fix].join(' ')), l.code).toEqual([])
    }
    expect(over.label).toBe('General guidance, not your local rules')
  })

  it('says the site\'s things are drawn only, and leaves one it cannot read out alone', () => {
    const things = [
      { id: 'fence', kind: 'fence', points: [[0, 0], [15, 0], [15, 30], [0, 30], [0, 0]], height: 1.8 },
      { id: 'tree1', kind: 'tree', at: [3, 4], canopy: 5 },
      { id: 'tree2', kind: 'tree', at: [4, 25] },
      { id: 'pool', kind: 'pool', points: [[1, 21], [5, 21], [5, 29], [1, 29]] },
      { id: 'odd', kind: 'path', points: [[0, 0], [1, 0]] },
    ]
    const result = inspectPlan(raw(0, { things }))
    expect(said(result)).toEqual([
      'plan/value-left-out The plan has a value the format cannot read, and is read without it',
      "plan/site-things-drawn-only The site's things are drawn only: 1 fence, 2 trees and 1 pool, not measured or checked, and never taken as a wall, a room or a storey's height",
    ])
    expect(result.lines[0]!.found).toContain('site.things[4].width')
    expect(result.lines[1]).toMatchObject({ kind: 'not-checked', also: ['fence', 'tree1', 'tree2', 'pool'] })
    expect(parseFloorPlan(raw(0, { things: things.slice(0, 4) })).site!.things).toHaveLength(4)
  })

  it('names a boundary that crosses itself, and a set-back from an edge it does not have', () => {
    const crossed = inspectPlan(raw(0, { boundary: [[0, 0], [15, 30], [15, 0], [0, 20]] }))
    expect(said(crossed)).toEqual(['plan/boundary-crosses The site\'s boundary is not one closed shape, so no distance to it and no plot coverage is measured'])
    expect(crossed.coverage.find((c) => c.ruleId === 'site-boundary')!.skipped).toEqual([{ floor: '', ids: ['1', '2', '3', '4'], reason: 'boundary_not_closed', why: 'the boundary is not one closed shape' }])
    const edge = inspectPlan(raw(0, { setbacks: [{ from: 7, distance: 3 }] }))
    expect(edge.lines.map((l) => [l.code, l.found])).toEqual([['plan/value-left-out', expect.stringContaining('site.setbacks[0].from')]])
  })

  it('says no distance was measured when the building has no outline', () => {
    const plan = raw()
    const result = inspectPlan({ ...plan, walls: (plan['walls'] as unknown[]).slice(0, 2), rooms: [], openings: [] })
    const line = result.lines.find((l) => l.code === 'plan/not-checked-boundary')!
    expect(line.message).toBe("No distance to the plot's boundary was measured: no floor at or above the ground floor has walls that close a floor, so the building has no outline to measure from.")
    expect(line.kind).toBe('not-checked')
  })
})
