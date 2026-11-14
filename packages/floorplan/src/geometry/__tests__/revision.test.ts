import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../plan'
import { indexPlan, openingsOf } from '../plan'
import { diffRevisions, planRevision, wallRevision, wallRevisions } from '../revision'

const base: FloorPlan = JSON.parse(
  readFileSync(resolve(__dirname, '../../../fixtures/floor-plan.json'), 'utf8')
)
const copy = (): FloorPlan => JSON.parse(JSON.stringify(base))

describe('a plan that did not really change', () => {
  it('keeps the same revision across a fresh parse', () => {
    // The watcher hands over a new object on every write, even when nothing
    // moved. Identity says "changed"; the revision says the truth.
    expect(planRevision(copy())).toBe(planRevision(base))
  })

  it('ignores the order walls are listed in', () => {
    const shuffled = copy()
    shuffled.walls.reverse()
    expect(planRevision(shuffled)).toBe(planRevision(base))
  })

  it('ignores the order openings are listed in', () => {
    const plan = copy()
    const wall = plan.walls.find((w) => w.id === 'w1')!
    plan.openings.push({
      id: 'extra',
      wall: 'w1',
      type: 'window',
      offset: 4,
      width: 1,
      height: 1,
      sill: 1
    })
    const forward = wallRevision(wall, openingsOf(indexPlan(plan), 'w1'))
    plan.openings.reverse()
    const backward = wallRevision(wall, openingsOf(indexPlan(plan), 'w1'))
    expect(forward).toBe(backward)
  })

  it('ignores a room rename', () => {
    const renamed = copy()
    renamed.rooms[0]!.name = 'Living'
    // The outline is identical, so nothing needs rebuilding.
    expect(wallRevisions(renamed)).toEqual(wallRevisions(base))
  })

  it('ignores a change of wall kind, which is line weight and not shape', () => {
    const plan = copy()
    const wall = plan.walls.find((w) => w.id === 'w5')!
    const before = wallRevision(wall)
    wall.kind = 'partition'
    expect(wallRevision(wall)).toBe(before)
  })
})

describe('a plan that did change', () => {
  it('notices a wall that moved', () => {
    const moved = copy()
    moved.walls.find((w) => w.id === 'w5')!.start = [5.5, 0]
    expect(planRevision(moved)).not.toBe(planRevision(base))
  })

  it('notices a wall that got thicker', () => {
    const thicker = copy()
    thicker.walls.find((w) => w.id === 'w1')!.thickness = 0.3
    expect(planRevision(thicker)).not.toBe(planRevision(base))
  })

  it('notices an opening that slid along its wall', () => {
    const slid = copy()
    slid.openings.find((o) => o.id === 'o1')!.offset += 0.5
    expect(planRevision(slid)).not.toBe(planRevision(base))
  })

  it('notices a door turning into a window', () => {
    const swapped = copy()
    swapped.openings.find((o) => o.id === 'o1')!.type = 'window'
    expect(planRevision(swapped)).not.toBe(planRevision(base))
  })

  it('notices a room whose boundary changed, through its walls', () => {
    const rebuilt = copy()
    rebuilt.rooms.find((r) => r.id === 'r1')!.boundary = ['w1', 'w2', 'w3', 'w4']
    expect(planRevision(rebuilt)).not.toBe(planRevision(base))
  })
})

describe('the diff', () => {
  it('reports only the wall that moved', () => {
    const moved = copy()
    moved.walls.find((w) => w.id === 'w5')!.height = 3
    const { changed, removed } = diffRevisions(wallRevisions(base), wallRevisions(moved))
    expect(changed).toEqual(['w5'])
    expect(removed).toEqual([])
  })

  it('reports nothing when the plan is re-read unchanged', () => {
    const { changed, removed } = diffRevisions(wallRevisions(base), wallRevisions(copy()))
    expect(changed).toEqual([])
    expect(removed).toEqual([])
  })

  it('separates a deleted wall from a new one', () => {
    const edited = copy()
    edited.walls = edited.walls.filter((w) => w.id !== 'w5')
    edited.walls.push({
      id: 'w6',
      start: [2, 0],
      end: [2, 2.5],
      thickness: 0.1,
      height: 2.7,
      kind: 'interior'
    })

    const { changed, removed } = diffRevisions(wallRevisions(base), wallRevisions(edited))
    expect(changed).toEqual(['w6'])
    expect(removed).toEqual(['w5'])
  })

  it('an opening moving only dirties its own wall', () => {
    const slid = copy()
    slid.openings.find((o) => o.id === 'o2')!.offset += 0.3
    const { changed } = diffRevisions(wallRevisions(base), wallRevisions(slid))
    // o2 lives on w3, so nothing else needs rebuilding.
    expect(changed).toEqual(['w3'])
  })
})

/**
 * Floors · C5.
 *
 * `wallRevision` keys the 3D geometry cache and means "what changes a wall's
 * shape". Moving a wall to another storey changes neither its extrusion nor its
 * z = 0 basis, so it must NOT dirty the key — the scene's alive-set already
 * disposes walls that leave. `planRevision` means "would this plan draw
 * differently", so there it must count.
 */
describe('floors and the revision keys', () => {
  function twoFloors(): FloorPlan {
    const plan = copy()
    return {
      ...plan,
      floors: [
        { id: 'ground', name: 'Ground floor', level: 0 },
        { id: 'first', name: 'First floor', level: 1 }
      ],
      walls: plan.walls.map((wall) => ({ ...wall, floor: 'ground' }))
    }
  }

  it('does not dirty a wall key when only its floor changes', () => {
    const before = twoFloors()
    const after = twoFloors()
    after.walls[0]!.floor = 'first'

    expect(wallRevision(after.walls[0]!)).toBe(wallRevision(before.walls[0]!))
    expect(wallRevisions(after).get(after.walls[0]!.id)).toBe(
      wallRevisions(before).get(before.walls[0]!.id)
    )
  })

  it('dirties the plan key when a wall changes floor', () => {
    const before = twoFloors()
    const after = twoFloors()
    after.walls[0]!.floor = 'first'

    expect(planRevision(after)).not.toBe(planRevision(before))
  })

  it('dirties the plan key when a floor is renamed', () => {
    const before = twoFloors()
    const after = twoFloors()
    after.floors![1] = { ...after.floors![1]!, name: 'Upstairs' }

    expect(planRevision(after)).not.toBe(planRevision(before))
  })

  it('dirties the plan key when a floor level changes', () => {
    const before = twoFloors()
    const after = twoFloors()
    after.floors![1] = { ...after.floors![1]!, level: 2 }

    expect(planRevision(after)).not.toBe(planRevision(before))
  })

  it('ignores the order floors are listed in', () => {
    const plan = twoFloors()
    const reversed = { ...plan, floors: [...plan.floors!].reverse() }

    expect(planRevision(reversed)).toBe(planRevision(plan))
  })

  it('leaves a plan that never mentions floors with the key it always had', () => {
    // The floor segment must be empty, not "undefined", for an untouched plan.
    expect(planRevision(copy())).toBe(planRevision(copy()))
  })
})
