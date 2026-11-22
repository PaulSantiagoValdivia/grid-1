/**
 * BRF-3: the plot drawn on the ground floor's plan in its own style, in every look: the boundary,
 * its street edge and the site's things, never as walls or rooms. Lab EL-16 found a fence drawn
 * as solid black walls; here a fence is a fine line in the site's colour, and no wall is added.
 */
import { describe, expect, it } from 'vitest'
import { buildFloorPlan, planForFloor } from '@ongrid/floorplan/geometry'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { labPlanText } from '@ongrid/floorplan/test-support/lab'
import { planPicture, planToSvg } from '@ongrid/viewer/src/picture'
import { LIGHT_SITE, TECHNICAL_SITE } from '@ongrid/viewer/src/picture/look'
import { mirrorPlan } from '../../edit/edits'
import { surveyPlan } from '../../quantities/survey'

const THINGS = [
  { id: 'fence', kind: 'fence', points: [[0, 30], [0, 0]], height: 1.8 },
  { id: 'gate', kind: 'gate', points: [[7.8, 0], [9, 0]] },
  { id: 'path', kind: 'path', points: [[8.4, 0], [8.4, 6], [10.4, 10]], width: 1.2 },
  { id: 'drive', kind: 'paving', points: [[11, 0], [14, 0], [14, 9], [11, 9]] },
  { id: 'oak', kind: 'tree', at: [3, 4], canopy: 5 },
  { id: 'pool', kind: 'pool', points: [[1, 21], [5, 21], [5, 29], [1, 29]] },
]

const sited = (extra: Record<string, unknown> = {}): FloorPlan => {
  const raw = JSON.parse(labPlanText('G/scenarios/s01b-site-fields.json')) as Record<string, unknown>
  return parseFloorPlan({ ...raw, ...extra, site: { boundary: [[0, 0], [15, 0], [15, 30], [0, 30]], streets: [1], things: THINGS } })
}

describe('the site on the plan (BRF-3)', () => {
  it('gives the drawing the boundary, the street edge and each thing, framed with the plot', () => {
    const drawing = buildFloorPlan(sited())
    expect(drawing.site!.boundary).toHaveLength(4)
    expect(drawing.site!.streets).toEqual([[{ x: 0, y: 0 }, { x: 15, y: 0 }]])
    expect(drawing.site!.things.map((t) => [t.id, t.rings.length, t.lines.length, t.tree?.radius ?? null])).toEqual([
      ['fence', 0, 1, null],
      ['gate', 0, 1, null],
      ['path', 1, 0, null],
      ['drive', 1, 0, null],
      ['oak', 0, 0, 2.5],
      ['pool', 1, 0, null],
    ])
    expect(drawing.siteBounds).toMatchObject({ min: { x: 0, y: 0 }, max: { x: 15, y: 30 } })
    // The walls are the house's nine, and no room is added.
    expect(drawing.walls).toHaveLength(9)
    expect(drawing.rooms).toHaveLength(6)
    expect(planPicture(sited()).view.height).toBeGreaterThan(planPicture(parseFloorPlan(JSON.parse(labPlanText('G/scenarios/s01a-house-alone.json')))).view.height)
  })

  it('draws it in the site\'s own colours in the working look, and in black and greys in the technical one', () => {
    const working = planToSvg(sited())
    expect(working).toContain('data-part="site-boundary"')
    expect(working).toContain('data-part="site-street"')
    expect(working).toMatch(new RegExp(`data-kind="pool"[^>]*><path [^>]*fill="${LIGHT_SITE.poolFill}"`))
    expect(working).toMatch(new RegExp(`data-kind="fence"[^>]*><path [^>]*stroke="${LIGHT_SITE.fence}"`))
    const technical = planToSvg(sited(), { look: 'technical' })
    expect(technical).toMatch(new RegExp(`data-kind="pool"[^>]*><path [^>]*fill="${TECHNICAL_SITE.poolFill}"`))
    // Under the rooms: the site group comes before the first room.
    expect(working.indexOf('data-part="site"')).toBeLessThan(working.indexOf('data-part="room"'))
  })

  it('draws the site on the ground floor only', () => {
    const raw = JSON.parse(labPlanText('G/scenarios/s01b-site-fields.json')) as { walls: Record<string, unknown>[] }
    const upper = raw.walls.slice(0, 4).map((w) => ({ ...w, id: `up-${String(w['id'])}`, floor: 'first' }))
    const plan = sited({ floors: [{ id: 'ground', name: 'Ground', level: 0 }, { id: 'first', name: 'First', level: 1 }], walls: [...raw.walls, ...upper] })
    expect(buildFloorPlan(planForFloor(plan, 'ground')).site).not.toBeNull()
    expect(buildFloorPlan(planForFloor(plan, 'first')).site).toBeNull()
  })

  it('mirrors the boundary and the things with the walls, each edge keeping its number', () => {
    const plan = sited()
    const patch = mirrorPlan(surveyPlan(plan), 'left-right')
    const site = (patch.plan as { site: { boundary: number[][]; streets: number[]; things: { id: string; points?: number[][]; at?: number[] }[] } }).site
    // The walls' box runs from x 3.15 to 11.85, so x mirrors to 15 - x.
    expect(site.boundary).toEqual([[15, 0], [0, 0], [0, 30], [15, 30]])
    expect(site.streets).toEqual([1])
    expect(site.things.find((t) => t.id === 'oak')!.at).toEqual([12, 4])
    expect(site.things.find((t) => t.id === 'fence')!.points).toEqual([[15, 30], [15, 0]])
  })
})
