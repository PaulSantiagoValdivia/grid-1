/**
 * CNT-6 (C23): a plan that is part of a larger building. A door cut through to another home is
 * said and is never a route (lab EL-4); a flat entered from a landing the plan does not draw gets
 * no "leads to a space that is not drawn" note (R-10); an open edge is not a door (S-3); and
 * neighbours drawn for context add nothing to any figure (EL-17).
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../plan'
import { indexPlan } from '../plan'
import { checkPlanSanity } from '../rules'
import { floorGraph } from '../rules/graph'
import { wallSides } from '../exposure'
import { planAreaFigures } from '../areas'
import { planEnvelope } from '../envelope'
import { floorElevations } from '../elevations'
import { buildingHeights } from '../storeys'
import { buildFloorPlan } from '../floorplan'
import { planForFloor } from '../floors'
import { validatePlan } from '../validate'
import { door, edit, flat } from '../../test-support/plans'
import { houseWithNeighbours, stand, twoFlats } from '../../test-support/largerBuilding'

const summary = (plan: FloorPlan): string[] => checkPlanSanity(plan).findings.map((f) => `${f.code} ${f.rooms.join('+')} ${f.openings.join('+')}`.trim())
const notices = (plan: FloorPlan): string[] => checkPlanSanity(plan).notChecked.map((n) => `${n.reason} ${n.floor} ${n.openings.join('+')}`)
const everything = (plan: FloorPlan): string => {
  const report = checkPlanSanity(plan)
  return [...report.findings.map((f) => f.message), ...report.notChecked.map((n) => n.message)].join('\n')
}

describe('CNT-6 flats entered from a landing the plan does not draw (lab R-10)', () => {
  it('gives two flats with front doors in separating walls no note that a door leads to a space not drawn', () => {
    const plan = twoFlats()
    expect(summary(plan)).toEqual([])
    expect(notices(plan)).toEqual(['way_out_through_common_parts ground fa+fb'])
    expect(everything(plan)).not.toMatch(/leads to a space that is not drawn/)
    expect(everything(plan)).toMatch(/goes on through the building's common parts/)
  })

  it('reads the front doors as ways on, never as exits or doors into a space not drawn', () => {
    const graph = floorGraph(twoFlats())
    expect(graph.exits).toEqual([])
    expect(graph.undrawn).toEqual([])
    expect(graph.common).toEqual([{ room: 'A-hall', opening: 'fa' }, { room: 'B-hall', opening: 'fb' }])
  })

  it('does the same for one flat whose entrance wall is marked separating, or states the landing beyond it', () => {
    const separating = edit(flat(), (copy) => {
      copy.walls.find((w) => w.id === 's1')!.kind = 'separating'
    })
    expect(summary(separating)).toEqual([])
    expect(notices(separating)).toEqual(['way_out_through_common_parts ground front'])
    const stated = edit(flat(), (copy) => {
      const s1 = copy.walls.find((w) => w.id === 's1')!
      s1.kind = 'interior'
      s1.beyond = 'common'
    })
    expect(summary(stated)).toEqual([])
    expect(notices(stated)).toEqual(['way_out_through_common_parts ground front'])
  })

  it('keeps the party wall and the walls to the landing out of the outside walls', () => {
    const plan = twoFlats()
    const index = indexPlan(plan)
    expect(wallSides(index, 'p')?.exposure).toBe('separating')
    expect(wallSides(index, 's_a1')?.exposure).toBe('separating')
    // The ends, inside the corner walls' bodies, have no room on either face.
    expect(wallSides(index, 's_a1')?.stretches.map((s) => s.worked).filter((w) => w !== 'detached')).toEqual(['separating'])
    expect(wallSides(index, 's_a2')?.exposure).toBe('exterior')
  })
})

describe('CNT-6 a door cut through to another home (lab EL-4)', () => {
  it('says a door through the party wall between two flats, and does not count it as a route', () => {
    const plan = edit(twoFlats(), (copy) => {
      copy.openings.push(door('cut', 'p', 2))
    })
    expect(summary(plan)).toEqual(['door_between_homes A-living+B-living cut'])
    expect(checkPlanSanity(plan).findings[0]!.message).toBe('A door from "A living room" opens into "B living room", in another home')
    expect(floorGraph(plan).links.some((l) => l.via === 'cut')).toBe(false)
  })

  it('finds a home that escapes through its neighbour: its rooms reach no way out, and it has no front door', () => {
    const plan = edit(twoFlats(), (copy) => {
      copy.openings = copy.openings.filter((o) => o.id !== 'fb')
      copy.openings.push(door('cut', 'p', 2))
    })
    expect(summary(plan)).toEqual([
      'door_between_homes A-living+B-living cut',
      'flat_without_front_door B-living+B-hall',
      'no_route_to_exit B-hall',
      'no_route_to_exit B-living'
    ])
  })

  it('says a door through a wall with a neighbour beyond it', () => {
    const plan = edit(twoFlats(), (copy) => {
      const e = copy.walls.find((w) => w.id === 'e')!
      e.kind = 'separating'
      e.beyond = 'neighbour'
      copy.openings.push(door('next-door', 'e', 2))
    })
    expect(summary(plan)).toEqual(['door_between_homes B-hall next-door'])
    expect(checkPlanSanity(plan).findings[0]!.message).toBe('A door from "B hall" opens through a separating wall into a neighbour')
  })

  it('reads rooms of one flat as joined, and rooms in no flat as common parts', () => {
    const plan = edit(twoFlats(), (copy) => {
      copy.flats = [{ id: 'A', rooms: ['A-hall', 'A-living'] }]
      copy.openings.push(door('cut', 'p', 2))
    })
    expect(summary(plan)).toEqual([])
  })
})

describe('CNT-6 an open edge is not a door (lab S-3)', () => {
  it('gives a stand open to an aisle that states the common parts beyond it no note and no way out', () => {
    const plan = stand('common')
    expect(summary(plan)).toEqual([])
    expect(notices(plan)).toEqual(['way_out_through_common_parts ground front'])
    const graph = floorGraph(plan)
    expect(graph.exits).toEqual([])
    expect(graph.openEdges).toEqual([{ room: 'stand', edge: 'front', beyond: 'common' }])
  })

  it('takes an open edge stated to the outside as a way out, as a terrace edge is', () => {
    expect(summary(stand('outside'))).toEqual([])
    expect(notices(stand('outside'))).toEqual([])
    expect(floorGraph(stand('outside')).exits).toEqual([{ room: 'stand', opening: 'front' }])
  })

  it('never says an open edge into floor no room claims is a door into a space not drawn', () => {
    // The hall's walls close round the aisle in front of the stand, and no room claims it.
    const plan = edit(stand(), (copy) => {
      copy.walls.push(
        { id: 'h-s', start: [-1, -2], end: [5, -2], thickness: 0.2, height: 3, kind: 'exterior' },
        { id: 'h-e', start: [5, -2], end: [5, 3], thickness: 0.2, height: 3, kind: 'exterior' },
        { id: 'h-w', start: [-1, 3], end: [-1, -2], thickness: 0.2, height: 3, kind: 'exterior' },
        { id: 'h-n1', start: [5, 3], end: [4, 3], thickness: 0.2, height: 3, kind: 'exterior' },
        { id: 'h-n2', start: [0, 3], end: [-1, 3], thickness: 0.2, height: 3, kind: 'exterior' }
      )
    })
    expect(summary(plan).filter((line) => line.startsWith('door_to_undrawn_space'))).toEqual([])
    expect(floorGraph(plan).openEdges.map((e) => e.beyond)).toEqual(['undrawn'])
  })
})

describe('CNT-6 party walls measured to their middle', () => {
  it('takes half the party wall and half the walls to the landing off the gross external area, and nothing off the gross internal', () => {
    const plan = twoFlats()
    const separating = planAreaFigures(plan)
    const asOutside = planAreaFigures(
      edit(plan, (copy) => {
        for (const wall of copy.walls) if (wall.kind === 'separating' && wall.id !== 'p') wall.kind = 'exterior'
      })
    )
    // The walls to the landing, 0.2 m thick: 3.1 m of each lies past its middle, 0.1 m deep, from the
    // corner wall's outside face to where the outside wall carries on; the party wall has rooms on
    // both faces, so it is all counted.
    expect(asOutside.grossExternal.area! - separating.grossExternal.area!).toBeCloseTo(2 * 3.1 * 0.1, 3)
    expect(separating.grossInternal.area).toBeCloseTo(asOutside.grossInternal.area!, 6)
    const floor = separating.floors[0]!
    expect(floor.net + floor.walls! + floor.unclaimed!).toBeCloseTo(floor.grossExternal!, 6)
  })
})

describe('CNT-6 neighbours drawn for context (lab EL-17)', () => {
  it('adds 0 m² to any figure when the neighbours are context shapes, where as rooms they added 160 m² of net', () => {
    const alone = planAreaFigures(houseWithNeighbours(true))
    const asRooms = planAreaFigures(houseWithNeighbours(false))
    const house = planAreaFigures(edit(houseWithNeighbours(true), (copy) => delete copy.context))
    expect(alone.net.area).toBeCloseTo(house.net.area!, 9)
    expect(alone.grossInternal.area).toBeCloseTo(house.grossInternal.area!, 9)
    expect(alone.grossExternal.area).toBeCloseTo(house.grossExternal.area!, 9)
    expect(asRooms.net.area! - alone.net.area!).toBeCloseTo(2 * 9.8 * 7.8, 6)
  })

  it('draws the context shapes on their floor, and checks nothing against them', () => {
    const plan = houseWithNeighbours(true)
    const drawing = buildFloorPlan(planForFloor(plan, 'ground'))
    expect(drawing.context?.map((shape) => [shape.id, shape.name, shape.points.length])).toEqual([
      ['left', 'No. 12', 4],
      ['right', 'No. 16', 4]
    ])
    expect(drawing.bounds.min.x).toBeLessThanOrEqual(-10.5)
    expect(checkPlanSanity(plan).findings).toEqual(checkPlanSanity(edit(plan, (copy) => delete copy.context)).findings)
    expect(validatePlan(plan).issues).toEqual(validatePlan(edit(plan, (copy) => delete copy.context)).issues)
  })
})

describe('CNT-6 a floor of a larger building (lab AC-7)', () => {
  const thirdFloor = (): FloorPlan => edit(flat(), (copy) => {
    copy.floors = [{ id: 'ground', name: 'Third floor', level: 0, above: 'common', below: 'neighbour' }]
  })

  it('gives a floor with more of the building above and below it no roof and no ground slab', () => {
    const before = planEnvelope(flat()).floors[0]!
    expect(before.roof).not.toBeNull()
    expect(before.slab?.kind).toBe('base')
    const after = planEnvelope(thirdFloor()).floors[0]!
    expect(after.roof).toBeNull()
    expect(after.roofKnown).toBe(true)
    expect(after.above).toBe('common')
    expect(after.slab?.kind).toBe('floor')
    expect(planEnvelope(thirdFloor()).roofArea).toBe(0)
  })

  it('does not take its doors out for ways out at the ground', () => {
    expect(summary(thirdFloor())).toEqual(['door_to_outside_above_ground hall front'])
    expect(checkPlanSanity(thirdFloor()).findings[0]!.message).toBe('A door from "Hall" leads outside on a floor with more of the building below it, so it is not a way out')
  })
})

describe('CNT-6 several buildings in one plan', () => {
  const campus = (): FloorPlan => {
    const house = flat()
    const studio = edit(flat(), (copy) => {
      for (const wall of copy.walls) {
        wall.id = `st-${wall.id}`
        wall.start = [wall.start[0] + 20, wall.start[1]]
        wall.end = [wall.end[0] + 20, wall.end[1]]
        wall.floor = 'studio'
      }
      for (const room of copy.rooms) {
        room.id = `st-${room.id}`
        room.boundary = room.boundary.map((id) => `st-${id}`)
        room.floor = 'studio'
      }
      for (const opening of copy.openings) {
        opening.id = `st-${opening.id}`
        opening.wall = `st-${opening.wall}`
      }
    })
    const upper = edit(flat(), (copy) => {
      for (const wall of copy.walls) {
        wall.id = `up-${wall.id}`
        wall.floor = 'upper'
        wall.height = 3
      }
      for (const room of copy.rooms) {
        room.id = `up-${room.id}`
        room.boundary = room.boundary.map((id) => `up-${id}`)
        room.floor = 'upper'
      }
      copy.openings = []
    })
    return {
      ...house,
      walls: [...house.walls, ...upper.walls, ...studio.walls],
      rooms: [...house.rooms, ...upper.rooms, ...studio.rooms],
      openings: [...house.openings, ...studio.openings],
      floors: [
        { id: 'ground', name: 'House ground', level: 0 },
        { id: 'upper', name: 'House upper', level: 1 },
        { id: 'studio', name: 'Studio', level: 0 }
      ],
      buildings: [
        { id: 'house', name: 'House', floors: ['ground', 'upper'] },
        { id: 'studio', name: 'Garden studio', floors: ['studio', 'nowhere'] }
      ]
    }
  }

  it('gives each building its own areas, the sum of its own floors', () => {
    const figures = planAreaFigures(campus())
    const floorNet = new Map(figures.floors.map((f) => [f.floor, f.net] as const))
    expect(figures.buildings.map((b) => [b.id, b.name, b.floors])).toEqual([
      ['house', 'House', ['ground', 'upper']],
      ['studio', 'Garden studio', ['studio']]
    ])
    expect(figures.buildings[0]!.net).toBeCloseTo(floorNet.get('ground')! + floorNet.get('upper')!, 9)
    expect(figures.buildings[1]!.net).toBeCloseTo(floorNet.get('studio')!, 9)
  })

  it('stacks each building on its own: the studio stands at 0 and its height is its own', () => {
    const plan = campus()
    const levels = floorElevations(plan).floors
    expect(levels.get('studio')?.floorLevel).toBe(0)
    expect(levels.get('upper')!.floorLevel).toBeGreaterThan(2.7)
    const heights = buildingHeights(plan)
    expect(heights.map((b) => b.id)).toEqual(['house', 'studio'])
    expect(heights[1]!.height!.height).toBeCloseTo(2.7 + 0.25, 9)
    expect(heights[0]!.height!.height).toBeGreaterThan(heights[1]!.height!.height)
  })

  it('names a floor a building lists that the plan does not have, and leaves it out', () => {
    expect(validatePlan(campus()).issues.filter((i) => i.code.startsWith('building/')).map((i) => `${i.code} ${i.id}`)).toEqual(['building/unknown-floor studio'])
  })
})
