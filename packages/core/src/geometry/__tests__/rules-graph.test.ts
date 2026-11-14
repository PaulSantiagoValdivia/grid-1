import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../plan'
import { floorGraph } from '../rules/graph'
import { edit, flat, madeVirtual, window_, withOpening, withoutOpening } from './rules-fixtures'

const links = (plan: FloorPlan) =>
  floorGraph(plan)
    .links.map((l) => `${l.rooms[0]}-${l.rooms[1]} via ${l.via}`)
    .sort()

describe('the route graph of one floor', () => {
  it('joins the rooms of the flat through its doors and finds the front door as the one exit', () => {
    const graph = floorGraph(flat())
    expect(links(flat())).toEqual([
      'bathroom-bedroom via d_bb',
      'bedroom-hall via d_hb',
      'hall-kitchen via d_hk'
    ])
    expect(graph.exits).toEqual([{ room: 'hall', opening: 'front' }])
    expect(graph.undrawn).toEqual([])
    expect(graph.rooms).toEqual(['bathroom', 'bedroom', 'hall', 'kitchen'])
  })

  it('adds nothing for a window', () => {
    const plan = withOpening(flat(), window_('win_h', 'w1', 1))
    expect(floorGraph(plan)).toEqual(floorGraph(flat()))
  })

  it('treats a doorless opening like a door', () => {
    const plan = edit(flat(), (copy) => {
      copy.openings.find((o) => o.id === 'd_hk')!.type = 'opening'
    })
    expect(links(plan)).toContain('hall-kitchen via d_hk')
  })

  it('joins the rooms on the two sides of a virtual wall', () => {
    const plan = madeVirtual(flat(), 'hk')
    expect(links(plan)).toContain('hall-kitchen via hk')
  })

  it('says a door leads to an undrawn space when the wall is not exterior', () => {
    // The bedroom door kept, the hall taken out: the door now leads nowhere drawn.
    const plan = edit(flat(), (copy) => {
      copy.rooms = copy.rooms.filter((r) => r.id !== 'hall')
    })
    const graph = floorGraph(plan)
    expect(graph.undrawn).toEqual(
      expect.arrayContaining([
        { room: 'bedroom', opening: 'd_hb' },
        { room: 'kitchen', opening: 'd_hk' }
      ])
    )
    expect(graph.exits).toEqual([])
  })

  it('has no exit without the front door', () => {
    expect(floorGraph(withoutOpening(flat(), 'front')).exits).toEqual([])
  })

  it('is the same for the same plan with its entities in another order', () => {
    const plan = flat()
    const shuffled = edit(plan, (copy) => {
      copy.walls.reverse()
      copy.rooms.reverse()
      copy.openings.reverse()
    })
    expect(floorGraph(shuffled)).toEqual(floorGraph(plan))
  })
})
