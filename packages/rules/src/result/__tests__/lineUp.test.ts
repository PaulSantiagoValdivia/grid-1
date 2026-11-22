/**
 * LVL-5 (lab WR-9, D-7): the record's lines for floors, stairs and shafts that stop lining up, and
 * for a window through two storeys (lab VE-9).
 */
import { describe, expect, it } from 'vitest'
import { inspectPlan } from '../..'
import { labPlan } from '@ongrid/floorplan/test-support/lab'
import { stairWindowThrough } from '@ongrid/floorplan/test-support/through'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'

/** The lab's D2 block with its stair moved 1.2 m east on floor 3 only (lab D-7, WR-9). */
const shifted = (): FloorPlan => labPlan('D/scenarios/d2-stair-shifted-floor3.json')

const withRooms = (plan: FloorPlan, change: (room: FloorPlan['rooms'][number]) => FloorPlan['rooms'][number]): FloorPlan => {
  const raw = JSON.parse(JSON.stringify(plan)) as FloorPlan
  return parseFloorPlan({ ...raw, rooms: raw.rooms.map(change) })
}

describe('a stair moved 1.2 m on one floor, in the record (WR-9)', () => {
  it('is a line on the moved stair room, saying where it stands and by how much', () => {
    const line = inspectPlan(shifted()).lines.find((l) => l.code === 'room/stair-shifted' && l.thing.id === 'L3-stair')!
    expect(line.kind).toBe('finding')
    expect(line.floor).toBe('L3')
    expect(line.message).toMatch(/^The stair "[^"]+" on "Floor 3" is 1\.20 m east of "[^"]+" on "Floor 2" below it: it stands from \(\d+\.\d\d, \d+\.\d\d\) to \(\d+\.\d\d, \d+\.\d\d\), the one below from \(/)
    expect(line.found).toBe('moved 1.20 m east of the one below, on the drawing (north is its top)')
    expect(line.fix).toContain('overhang "meant"')
  })

  it('is no line once the moved stair and the one over it are marked as meant', () => {
    const plan = withRooms(shifted(), (r) => (r.id === 'L3-stair' || r.id === 'L4-stair' ? { ...r, overhang: 'meant' } : r))
    expect(inspectPlan(plan).lines.map((l) => l.code)).not.toContain('room/stair-shifted')
  })
})

describe('the stair window through two storeys, in the record (VE-9)', () => {
  it('is refused as written, and the line calls it a window, not a door', () => {
    const lines = inspectPlan(labPlan('H/scenarios/hx3-window-through-two-storeys.json')).lines
    expect(lines.find((l) => l.code === 'opening/too-tall')!.thing.id).toBe('g-w-stair-tall')
    const notChecked = lines.find((l) => l.code === 'floor/not-checked-doors-not-drawn')!
    expect(notChecked.message).toBe('On "Ground floor", this window could not be drawn, so it and what rests on it were not checked: "g-w-stair-tall"')
    expect(notChecked.found).toBe('a window that cannot be drawn')
    expect(notChecked.needed).toBe('a window that can be drawn')
    expect(`${notChecked.message} ${notChecked.found} ${notChecked.needed} ${notChecked.fix}`).not.toMatch(/\bdoors?\b/)
  })

  it('has no line about it once its wall rises through both floors', () => {
    const lines = inspectPlan(stairWindowThrough()).lines
    expect(lines.filter((l) => l.thing.id === 'g-w-stair-tall' || l.code === 'floor/not-checked-doors-not-drawn')).toEqual([])
    expect(lines.map((l) => l.code)).not.toContain('room/cross-floor')
  })
})
