import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../plan'
import { diffPlans, revertChanges } from '../diff'
import { edit, moveWall, opening, sixRoomHouse, twoFloorPlan, wall, withRoom } from './diff-fixtures'

const changesOf = (base: FloorPlan, head: FloorPlan) => diffPlans(base, head).changes

describe('revertChanges', () => {
  it('puts a moved wall and the door that followed it back', () => {
    const base = sixRoomHouse()
    const head = moveWall(base, 'v1_0', 0.5, 0)
    const result = revertChanges(base, head, changesOf(base, head))
    expect(diffPlans(base, result).changes).toEqual([])
  })

  it('removes what was added and restores what was removed', () => {
    const base = sixRoomHouse()
    const head = edit(base, (copy) => {
      copy.walls.push(wall('extra', [1, 1], [2, 1]))
      copy.openings.push(opening('extra-door', 'extra', 'door', 0.1, 0.8))
      copy.rooms = copy.rooms.filter((r) => r.id !== 'r10')
    })
    const result = revertChanges(base, head, changesOf(base, head))
    expect(result.walls.some((w) => w.id === 'extra')).toBe(false)
    expect(result.openings.some((o) => o.id === 'extra-door')).toBe(false)
    expect(result.rooms.find((r) => r.id === 'r10')).toEqual(base.rooms.find((r) => r.id === 'r10'))
    expect(diffPlans(base, result).changes).toEqual([])
  })

  it('puts back only the changes it is given', () => {
    const base = sixRoomHouse()
    const head = withRoom(moveWall(base, 'v3_1', 0.3, 0), 'r00', { name: 'Kitchen' })
    const wallChange = changesOf(base, head).filter((c) => c.entity.id === 'v3_1')
    const result = revertChanges(base, head, wallChange)
    expect(result.walls.find((w) => w.id === 'v3_1')).toEqual(base.walls.find((w) => w.id === 'v3_1'))
    expect(result.rooms.find((r) => r.id === 'r00')?.name).toBe('Kitchen')
  })

  it('leaves everything it does not name as the same objects, in the same order', () => {
    const base = sixRoomHouse()
    const head = moveWall(base, 'v1_0', 0.5, 0)
    const result = revertChanges(base, head, changesOf(base, head).filter((c) => c.entity.id === 'v1_0'))
    expect(result.walls.map((w) => w.id)).toEqual(head.walls.map((w) => w.id))
    result.walls.forEach((w, i) => {
      if (w.id !== 'v1_0') expect(w).toBe(head.walls[i])
    })
    expect(result.rooms).toBe(head.rooms)
  })

  it('puts a floor back', () => {
    const base = twoFloorPlan()
    const head = edit(base, (copy) => {
      copy.floors = copy.floors?.map((f) => (f.id === 'first' ? { ...f, name: 'Upstairs' } : f))
    })
    const result = revertChanges(base, head, changesOf(base, head))
    expect(result.floors).toEqual(base.floors)
  })

  it('changes nothing for no changes', () => {
    const base = sixRoomHouse()
    const head = moveWall(base, 'v1_0', 0.5, 0)
    expect(revertChanges(base, head, [])).toEqual(head)
  })
})
