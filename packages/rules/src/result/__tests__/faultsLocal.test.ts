/* eslint-disable @typescript-eslint/no-explicit-any -- these tests write wrong values into plans on purpose */
/**
 * MSG-6: a fault stays local. The front door reads a plan part by part, names each part or
 * value it could not read as written by its id and place, and checks the rest.
 */
import { describe, expect, it } from 'vitest'
import { flat } from '@ongrid/floorplan/test-support/plans'
import { inspectPlan } from '../..'

const file = (): Record<string, any> => JSON.parse(JSON.stringify(flat()))

describe('a fault stays local (MSG-6)', () => {
  it('leaves out one opening with a negative offset, and checks the rest of the plan', () => {
    const raw = file()
    raw.openings[1].offset = -0.3
    const result = inspectPlan(raw)
    expect(result.read).toBe(true)
    expect(result.checks.length).toBeGreaterThan(0)
    expect(result.lines[0]).toMatchObject({
      code: 'plan/part-left-out',
      kind: 'left-out',
      thing: { kind: 'opening', id: 'd_hk' },
      floor: 'ground',
      message: 'Door "d_hk" is left out: a value it needs cannot be read',
      found: '-0.3 at openings[1].offset',
      needed: 'a number of at least 0 at openings[1].offset'
    })
  })

  it('names a part with no id by its place, about the plan', () => {
    const raw = file()
    delete raw.walls[12].id
    expect(inspectPlan(raw).lines[0]).toMatchObject({
      code: 'plan/part-left-out',
      thing: { kind: 'plan', id: '' },
      floor: null,
      message: 'The wall at walls[12] is left out: a value it needs cannot be read',
      found: 'missing at walls[12].id'
    })
  })

  it('leaves out only the room of a room and a wall that share an id, and measures the rooms on the wall', () => {
    const raw = file()
    raw.rooms[3].id = 'hk'
    const lines = inspectPlan(raw).lines
    expect(lines.filter((l) => l.kind === 'left-out').map((l) => [l.code, l.thing, l.also, l.found, l.fix])).toEqual([
      [
        'plan/id-clash',
        { kind: 'room', id: 'hk' },
        ['hk'],
        'the id of Wall "hk" (walls[8]) again at rooms[3].id',
        'Rename it, for example to "hk-2". Wall "hk" (walls[8]) keeps its id, and what points at that id points at it.'
      ]
    ])
  })

  it('refuses a blank id and an id that differs from another only in capitals', () => {
    const raw = file()
    raw.openings[5].id = ' '
    raw.rooms[1].id = 'HALL'
    expect(inspectPlan(raw).lines.filter((l) => l.code === 'plan/similar-id' || l.code === 'plan/blank-id').map((l) => [l.code, l.kind, l.thing, l.message])).toEqual([
      ['plan/similar-id', 'left-out', { kind: 'room', id: 'HALL' }, 'Room "Kitchen" is left out: its id differs from another part\'s only in capitals or spaces'],
      ['plan/blank-id', 'left-out', { kind: 'opening', id: ' ' }, 'Window " " is left out: its id is blank']
    ])
  })

  it('names an unfinished merge, where it is and what each side adds', () => {
    const ours = JSON.stringify(file())
    const theirs = JSON.stringify({ ...file(), openings: file().openings.slice(0, 5) })
    const result = inspectPlan(`<<<<<<< agent-a\n${ours}\n=======\n${theirs}\n>>>>>>> agent-b\n`)
    expect(result.read).toBe(false)
    expect(result.lines).toMatchObject([
      {
        code: 'plan/unfinished-merge',
        kind: 'refused',
        message: 'The plan holds an unfinished git merge',
        found: 'one conflict between "agent-a" and "agent-b", the first at line 1: "agent-a" adds "win_b"'
      }
    ])
  })

  it('says NaN and a decimal comma for what they are, in a plan given as text', () => {
    const text = JSON.stringify(file(), null, 1).replace('"width": 1.2', '"width": NaN').replace('"offset": 1.5', '"offset": 1,5')
    expect(inspectPlan(text).lines.filter((l) => l.code === 'plan/part-left-out').map((l) => [l.message, l.found])).toEqual([
      ['Door "front" is left out: a value it needs cannot be read', '1,5, written with a decimal comma at openings[0].offset'],
      ['Window "win_k" is left out: a value it needs cannot be read', 'NaN, which JSON does not hold as a number at openings[4].width']
    ])
  })

  it('says where a text stops being JSON', () => {
    expect(inspectPlan('{\n  "walls": [}\n').lines[0]).toMatchObject({ code: 'plan/not-json', found: 'text that stops being JSON at line 2, column 13' })
  })
})
