/**
 * LVL-3: the record's lines for stairs. A stair that cannot be laid out is a line about the
 * stair itself (thing kind `stair`), and stair rooms out of line are a finding on the room.
 */
import { describe, expect, it } from 'vitest'
import { inspectPlan } from '../..'
import { edit, stairHouse, stairRoomHouse } from '@ongrid/floorplan/test-support/plans'

describe('stairs in the result record (LVL-3)', () => {
  it('says a stair that cannot be laid out, on the stair, on the floor it starts from', () => {
    const plan = edit(stairHouse(), (copy) => {
      copy.stairs = [{ ...copy.stairs![0]!, risers: 1 }]
    })
    const line = inspectPlan(plan).lines.find((l) => l.code === 'stair/too-few-risers')
    expect(line).toMatchObject({ thing: { kind: 'stair', id: 's1' }, floor: 'ground' })
    expect(line!.message).toBe('Stair "Main stair" states fewer risers than its flights need')
  })

  it('checks the floor above through a stated stair', () => {
    expect(inspectPlan(stairHouse()).lines.map((l) => l.code)).not.toContain('floor/not-checked-no-stairs')
  })

  it('names stair rooms out of line as a finding on the room', () => {
    const lines = inspectPlan(stairRoomHouse({ shifted: true })).lines.filter((l) => l.code === 'room/stair-out-of-line')
    expect(lines.map((l) => [l.kind, l.thing.id, l.floor])).toEqual([
      ['finding', 'first-stair', 'first'],
      ['finding', 'second-stair', 'second']
    ])
    expect(lines[0]!.message).toBe('The stair "Stair" on "First floor" does not lie over "Stair" on "Ground floor", so it does not join the two floors')
  })
})
