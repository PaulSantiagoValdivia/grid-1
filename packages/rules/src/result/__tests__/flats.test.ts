/**
 * CNT-4: the flats list's faults in the result record: each code worded once, about the flat by
 * its name, worth a look, and a plan with a sound list gets no line for it.
 */
import { describe, expect, it } from 'vitest'
import { duplexHouse, edit } from '@ongrid/floorplan/test-support/plans'
import { inspectPlan } from '../..'

const flatLines = (plan: unknown) => inspectPlan(plan).lines.filter((line) => line.code.startsWith('flat/'))

describe('CNT-4 the flats list in the result record', () => {
  it('gives a sound duplex no line', () => {
    expect(flatLines(duplexHouse())).toEqual([])
  })

  it('words each fault about the flat by its name, worth a look, on the floor of its first room', () => {
    const plan = edit(duplexHouse(), (p) => {
      p.flats![0]!.rooms.push('studdy')
      p.flats![1]!.rooms.push('hall')
      p.flats![1]!.type = 'studios'
    })
    const lines = flatLines(plan)
    expect(lines.map((l) => [l.code, l.kind, l.thing, l.floor])).toEqual([
      ['flat/unknown-room', 'worth-a-look', { kind: 'flat', id: 'D1' }, 'ground'],
      ['flat/room-in-two', 'worth-a-look', { kind: 'flat', id: 'S1' }, 'ground'],
      ['flat/unknown-type', 'worth-a-look', { kind: 'flat', id: 'S1' }, 'ground']
    ])
    expect(lines[0]!.message).toBe('Flat "Duplex 1" names a room the plan does not have')
    expect(lines[0]!.found).toContain('"study" is the room most likely meant')
    expect(lines[2]!.message).toBe('Flat "Studio 1" is of a type the plan\'s flat types do not state')
    expect(lines[2]!.fix.length).toBeGreaterThan(10)
  })

  it('words a type stated twice about the plan, naming the type', () => {
    const plan = edit(duplexHouse(), (p) => {
      p.flatTypes!.push({ id: 'studio', name: 'Studio again' })
    })
    const [line] = flatLines(plan)
    expect(line!.message).toBe('The plan states flat type "studio" more than once')
  })
})
