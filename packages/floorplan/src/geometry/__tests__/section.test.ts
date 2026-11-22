/**
 * LVL-9: a section along a line, drawn from the model (lab SE-5, N-section). The cut parts join
 * into connected shapes, the levels are the plan's, and what the plan does not state is hatched and
 * listed.
 */
import { describe, expect, it } from 'vitest'
import { labPlan } from '../../test-support/lab'
import { stairHouse, twoFloorHouse } from '../../test-support/plans'
import { parseFloorPlan } from '../../types/floorplan'
import type { FloorPlan } from '../plan'
import { levelText, planSection, sectionFrame, type PlanSection, type SectionLine } from '../section'
import { drawingMarks } from '../drawingMarks'
import { buildFloorPlan } from '../floorplan'
import { planForFloor } from '../floors'
import { signedArea } from '../vec2'

/** The lab's townhouse (A/scenarios/townhouse.json): three floors, a stair room on each, no stated stair. */
const townhouse = (): FloorPlan => labPlan('A/scenarios/townhouse.json')
/** Down the middle of its stair rooms (x 4.3 to 5.5, y 3.5 to 7.5), from the street to the garden, looking west. */
const THROUGH_STAIR: SectionLine = { from: { x: 4.9, y: -2 }, to: { x: 4.9, y: 13 }, toward: 'left' }

const area = (section: PlanSection): number => section.cut.reduce((sum, p) => sum + Math.abs(signedArea(p.outline)) - p.holes.reduce((h, ring) => h + Math.abs(signedArea(ring)), 0), 0)
const ringsArea = (rings: readonly (readonly { x: number; y: number }[])[]): number => rings.reduce((sum, ring) => sum + Math.abs(signedArea(ring)), 0)

describe('a section through the townhouse stair (lab SE-5)', () => {
  const section = planSection(townhouse(), THROUGH_STAIR)

  it('cuts twelve walls, three slabs and the roof, one by one', () => {
    const walls = section.parts.filter((p) => p.kind === 'wall')
    expect(walls.map((p) => p.id)).toEqual(['g-s', 'g-n', 'g-cs', 'g-cn', 'f-s', 'f-n', 'f-cs', 'f-cn', 't-s', 't-n', 't-cs', 't-cn'])
    expect(walls.every((p) => p.rings.length === 1)).toBe(true)
    expect(section.parts.filter((p) => p.kind === 'slab').map((p) => p.id)).toEqual(['ground', 'first', 'second'])
    expect(section.parts.filter((p) => p.kind === 'roof').map((p) => p.id)).toEqual(['second'])
    // The rectangles cut, one per wall and per piece of slab: the twelve-and-more of SE-5.
    expect(section.parts.flatMap((p) => p.rings).length).toBeGreaterThanOrEqual(16)
  })

  it('joins them into one connected shape, not twelve separate rectangles', () => {
    expect(section.cut).toHaveLength(1)
    // The rooms the walls and slabs close round are its holes: three floors of three rooms cut, less
    // the stairwell, which is open from the ground floor to the roof (LVL-4's opening over a stair room).
    expect(section.cut[0]!.holes).toHaveLength(7)
    // Joined, nothing is lost or counted twice.
    const parts = ringsArea(section.parts.flatMap((p) => p.rings))
    expect(area(section)).toBeCloseTo(parts, 6)
  })

  it('stands each floor\'s walls on its slab and under the slab or roof above', () => {
    const wall = (id: string) => section.parts.find((p) => p.id === id)!.rings[0]!
    const slab = (id: string) => section.parts.find((p) => p.kind === 'slab' && p.id === id)!.rings
    const ys = (ring: readonly { y: number }[]) => [Math.min(...ring.map((p) => p.y)), Math.max(...ring.map((p) => p.y))]
    expect(ys(wall('g-s'))).toEqual([0, 2.7])
    expect(ys(slab('first')[0]!)).toEqual([2.7, 2.95])
    expect(ys(wall('f-s'))[0]).toBe(2.95)
    expect(ys(section.parts.find((p) => p.kind === 'roof')!.rings[0]!)[0]).toBe(ys(wall('t-s'))[1])
  })

  it('says which side of each outside wall cut is outside, and runs the ground past the building', () => {
    expect(section.parts.find((p) => p.id === 'g-s')!.outside).toBe('left')
    expect(section.parts.find((p) => p.id === 'g-n')!.outside).toBe('right')
    expect(section.parts.find((p) => p.id === 'g-cs')!.outside).toBeNull()
    // The outline runs from y = -0.15 to 11.15: 1.85 to 13.15 across the section, and the ground
    // runs to the line's ends, past the building.
    expect(section.ground.segments).toEqual([[0, 1.85], [13.15, 15]])
  })

  it('looks the other way when asked: the picture is mirrored', () => {
    const back = planSection(townhouse(), { ...THROUGH_STAIR, toward: 'right' })
    expect(back.parts.find((p) => p.id === 'g-s')!.outside).toBe('right')
    expect(back.cut).toHaveLength(1)
    expect(back.look).toEqual({ x: 1, y: -0 })
  })

  it('draws what lies beyond the cut farthest first', () => {
    expect(section.beyond.length).toBeGreaterThan(0)
    for (let i = 1; i < section.beyond.length; i++) expect(section.beyond[i - 1]!.depth).toBeGreaterThanOrEqual(section.beyond[i]!.depth)
    // Looking west from x = 4.9, the stair room's far wall (g-stw at x = 4.3) is seen, 0.55 m away.
    const stw = section.beyond.find((f) => f.id === 'g-stw' && f.edge === null)!
    expect(stw.depth).toBeCloseTo(0.55, 9)
  })

  it('gives each room cut its own height, from its floor', () => {
    const kitchen = section.rooms.find((r) => r.room === 'g-rear')!
    expect(kitchen).toMatchObject({ floor: 'ground', floorLevel: 0, height: 2.7, heightStated: false })
    expect(section.rooms.find((r) => r.room === 'f-rear')).toMatchObject({ floorLevel: 2.95, height: 2.9 })
  })

  it('lists the stair rooms with no stated stair, and draws no flight in them', () => {
    expect(section.parts.some((p) => p.kind === 'stair')).toBe(false)
    expect(section.assumed.find((a) => a.kind === 'no-stair')!.ids).toEqual(['g-stair', 'f-stair', 't-stair'])
  })
})

describe('a section through a stated stair (LVL-3)', () => {
  const plan = stairHouse()
  // Along the walking line, from the hall's front wall to the back of the house, looking east.
  const section = planSection(plan, { from: { x: 0.6, y: -1 }, to: { x: 0.6, y: 9 }, toward: 'right' })

  it('cuts the flight tread by tread, joined to the slabs it stands on and rises to', () => {
    const stair = section.parts.find((p) => p.kind === 'stair')!
    expect(stair.id).toBe('s1')
    const tops = stair.rings.map((ring) => Math.max(...ring.map((p) => p.y))).sort((a, b) => a - b)
    // Every tread one riser higher than the one before.
    for (let i = 1; i < tops.length; i++) expect(tops[i]! - tops[i - 1]!).toBeCloseTo(tops[0]!, 5)
    expect(section.cut).toHaveLength(1)
  })

  it('lists the risers Grid worked out', () => {
    expect(section.assumed.find((a) => a.kind === 'risers')!.ids).toEqual(['s1'])
  })
})

describe('the levels of a section (LVL-9 done-when 2)', () => {
  const stated = (): FloorPlan => ({
    ...twoFloorHouse(),
    floors: [
      { id: 'ground', name: 'Ground floor', level: 0, elevation: 0, slab: 0.3, height: 2.6 },
      { id: 'first', name: 'First floor', level: 1, elevation: 3.1, slab: 0.3, height: 2.5 }
    ],
    site: { ground: -0.45 }
  })
  const line: SectionLine = { from: { x: 2, y: -2 }, to: { x: 2, y: 10 }, toward: 'left' }

  it('stands every level mark at the level the plan states', () => {
    const section = planSection(parseFloorPlan(stated()), line)
    expect(section.levels.map((l) => [l.floor, l.level, l.source])).toEqual([['ground', 0, 'stated'], ['first', 3.1, 'stated']])
    expect(section.levels.map((l) => levelText(l.level))).toEqual(['±0.000', '+3.100'])
    expect(section.ground).toMatchObject({ level: -0.45, stated: true })
  })

  it('hatches nothing and lists no level, slab or ground the plan states', () => {
    const section = planSection(parseFloorPlan(stated()), line)
    expect(section.assumed.map((a) => a.kind)).toEqual(['roof', 'room-height'])
    // The slab the floor states is cut at its own thickness.
    const slab = section.parts.find((p) => p.kind === 'slab' && p.id === 'first')!.rings[0]!
    expect(Math.min(...slab.map((p) => p.y))).toBeCloseTo(2.8, 9)
  })

  it('works out the levels a plan does not state, and lists each one with the slabs and the roof it took', () => {
    const section = planSection(townhouse(), THROUGH_STAIR)
    expect(section.levels.map((l) => [l.floor, l.level, l.source])).toEqual([['ground', 0, 'datum'], ['first', 2.95, 'worked-out'], ['second', 6.1, 'worked-out']])
    expect(section.assumed.filter((a) => a.kind === 'level').map((a) => a.ids[0])).toEqual(['first', 'second'])
    const hatched = section.assumed.filter((a) => a.hatched)
    expect(hatched.map((a) => `${a.kind}:${a.ids.join(',')}`)).toEqual(['slab:ground', 'slab:first', 'slab:second', 'roof:second'])
    // Each hatches exactly what it is about: the slab's or the roof's cut pieces.
    for (const a of hatched) {
      const part = section.parts.find((p) => p.kind === a.kind && p.id === a.ids[0])!
      expect(a.pieces.reduce((sum, p) => sum + Math.abs(signedArea(p.outline)), 0)).toBeCloseTo(ringsArea(part.rings), 6)
    }
    expect(section.assumed.find((a) => a.kind === 'ground')!.words).toBe('The ground is taken at ±0.000, the ground floor\'s level: the site states no ground level.')
    expect(section.assumed.find((a) => a.kind === 'roof')!.words).toBe('The roof over "Second floor" is taken as flat and 0.25 m thick, on its walls: the plan states no roof.')
  })

  it('uses the room\'s own height, not the storey\'s tallest wall', () => {
    const plan = stated()
    const lower = { ...plan, rooms: plan.rooms.map((r) => (r.id === 'hall' ? { ...r, height: 2.4 } : r)) }
    const section = planSection(parseFloorPlan(lower), line)
    expect(section.rooms.find((r) => r.room === 'hall')).toMatchObject({ height: 2.4, heightStated: true })
    expect(section.rooms.find((r) => r.room === 'bedroom')).toMatchObject({ height: 2.6, heightStated: false })
  })

  it('hatches and lists walls whose height nothing states', () => {
    const plan = twoFloorHouse()
    const bare = parseFloorPlan({ ...plan, walls: plan.walls.map((w) => Object.fromEntries(Object.entries(w).filter(([key]) => key !== 'height'))) })
    const section = planSection(bare, line)
    const walls = section.assumed.filter((a) => a.kind === 'wall-height')
    expect(walls.map((a) => a.hatched)).toEqual([true, true])
    expect(walls[0]!.ids).toEqual(['s1', 'n2', 'hb'])
  })
})

describe('a line that cuts nothing', () => {
  it('gives the ground along the line and nothing else', () => {
    const section = planSection(townhouse(), { from: { x: 20, y: 5 }, to: { x: 30, y: 5 }, toward: 'left' })
    expect(section.parts).toEqual([])
    expect(section.cut).toEqual([])
    expect(section.ground.segments).toEqual([[0, 10]])
  })
})

describe('the marks on a plan', () => {
  const plan = townhouse()
  const drawing = buildFloorPlan(planForFloor(plan, 'first'))
  const around = drawing.bounds

  it('marks the section\'s line and the way it looks', () => {
    const marks = drawingMarks(plan, 'first', drawing, around, { section: THROUGH_STAIR })
    expect(marks.section).toEqual({ from: THROUGH_STAIR.from, to: THROUGH_STAIR.to, look: sectionFrame(THROUGH_STAIR).look, label: 'A' })
    expect(marks.elevations).toEqual([])
    expect(marks.levels).toEqual([])
  })

  it('stands an elevation mark outside each side, named by the way it faces', () => {
    const marks = drawingMarks(plan, 'first', drawing, around, { elevations: true })
    expect(marks.elevations.map((m) => m.faces)).toEqual(['south', 'east', 'north', 'west'])
    expect(marks.elevations.every((m) => !m.northStated)).toBe(true)
    // Outside what the picture frames, looking back at the building.
    const south = marks.elevations[0]!
    expect(south.at.y).toBeLessThan(around.min.y)
    expect(south.look).toEqual({ x: -0, y: 1 })
    // With north stated a quarter turn to the left, the top of the drawing faces east.
    const turned = drawingMarks({ ...plan, north: 90 }, 'first', drawing, around, { elevations: true })
    expect(turned.elevations.map((m) => m.faces)).toEqual(['west', 'south', 'east', 'north'])
  })

  it('marks each room\'s floor level, worked out when the floor states none', () => {
    const marks = drawingMarks(plan, 'first', drawing, around, { levels: true })
    expect(marks.levels.map((m) => m.room).sort()).toEqual(drawing.rooms.map((r) => r.id).sort())
    expect(marks.levels.every((m) => m.level === 2.95 && !m.stated)).toBe(true)
  })
})
