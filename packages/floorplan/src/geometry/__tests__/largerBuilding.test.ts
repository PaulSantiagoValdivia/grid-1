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
import { door, edit, flat } from '../../test-support/plans'
import { stand, twoFlats } from '../../test-support/largerBuilding'

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
