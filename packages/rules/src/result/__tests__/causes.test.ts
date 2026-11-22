/**
 * MSG-5: the record's side of notes traced to their cause. An escape note that rests on a window
 * that could not be drawn is held back, and the check says it did not look; identical notes are
 * one line, in the code's one wording; a line on a plan that may not be in metres is filed under
 * that question.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '@ongrid/floorplan/geometry'
import { edit, flat, window_ } from '@ongrid/floorplan/test-support/plans'
import { checkLocalRules, inspectPlan } from '../..'

/** The flat with its bedroom used as one, and a window on the bedroom's outside wall. */
const bedroomFlat = () =>
  edit(flat(), (copy) => {
    copy.rooms.find((r) => r.id === 'bedroom')!.use = 'bedroom'
    copy.openings.push(window_('win_bed', 'n2', 1.5, 1.2))
  })

describe('an escape note on a window that could not be drawn', () => {
  // The window runs off its wall, 5 m long.
  const offWall = () =>
    edit(bedroomFlat(), (copy) => {
      copy.openings.find((o) => o.id === 'win_bed')!.offset = 4.5
    })

  it('is held back on the floor\'s line, which names the window', () => {
    const result = inspectPlan(offWall())
    expect(result.lines.filter((l) => l.kind === 'finding')).toEqual([])
    const line = result.lines.find((l) => l.code === 'floor/not-checked-doors-not-drawn')!
    expect(line.message).toBe('On "Ground floor", these doors or windows could not be drawn, so they and what rests on them were not checked: "win_bed"')
    expect(line.held).toEqual([{ code: 'room/no-escape-opening', thing: { kind: 'room', id: 'bedroom' }, floor: 'ground', also: [], waitsFor: ['win_bed'] }])
    expect(line.found).toBe('doors or windows that cannot be drawn; held back until they can be: whether "Bedroom" has a window or door to escape through')
  })

  it('is given once the window is drawn, and the check says it did not look at the room until then', () => {
    expect(inspectPlan(bedroomFlat()).lines.filter((l) => l.kind === 'finding')).toEqual([])
    const noWindow = edit(bedroomFlat(), (copy) => {
      copy.openings = copy.openings.filter((o) => o.id !== 'win_bed')
    })
    expect(inspectPlan(noWindow).lines.filter((l) => l.kind === 'finding').map((l) => l.code)).toEqual(['room/no-escape-opening'])
    const escape = checkLocalRules(offWall()).coverage.find((c) => c.ruleId === 'escape-opening')!
    expect(escape.skipped).toContainEqual({ floor: 'ground', ids: ['bedroom'], reason: 'waits_for_part', why: 'beside a part that could not be drawn: held until it can be' })
    expect(escape.lookedAt.flatMap((g) => g.ids)).not.toContain('bedroom')
  })
})

describe('identical notes', () => {
  // The bedroom and the bathroom each lose their only door: the same note, word for word.
  const twoDoorless = () =>
    edit(flat(), (copy) => {
      copy.openings = copy.openings.filter((o) => o.id !== 'd_bb' && o.id !== 'd_hb')
      copy.walls.find((w) => w.id === 'bb')!.kind = 'interior'
    })

  it('are one line that lists the rooms, the verb agreeing, every id kept', () => {
    const findings = inspectPlan(twoDoorless()).lines.filter((l) => l.kind === 'finding')
    expect(findings.map((l) => l.message)).toEqual(['"Bathroom", "Bedroom" have no door or opening to another space'])
    expect(findings[0]!.each).toEqual([
      { kind: 'room', id: 'bathroom' },
      { kind: 'room', id: 'bedroom' }
    ])
    expect(findings[0]!.also).toEqual(['bedroom'])
    // The report and the notes on the plan keep one per room.
    expect(checkLocalRules(twoDoorless()).findings.map((f) => f.rooms[0])).toEqual(['bathroom', 'bedroom'])
  })

  it('stay apart when anything but the name differs', () => {
    const result = inspectPlan(edit(flat(), (copy) => {
      copy.openings = copy.openings.filter((o) => o.id !== 'd_hb')
    }))
    // The bedroom opens only into the bathroom, which opens only into the bedroom: different words.
    expect(result.lines.filter((l) => l.kind === 'finding').map((l) => l.each === undefined)).toEqual([true, true])
  })
})

describe('a plan that may not be in metres', () => {
  it('files under its question what is measured against a size, and that question under the unit it states', () => {
    const mm = edit(bedroomFlat(), (copy) => {
      copy.walls = copy.walls.map((w) => ({ ...w, start: [w.start[0] * 1000, w.start[1] * 1000], end: [w.end[0] * 1000, w.end[1] * 1000], thickness: w.thickness * 1000, height: w.height * 1000 }))
      copy.openings = copy.openings.map((o) => ({ ...o, offset: o.offset * 1000, width: o.width * 1000, height: o.height * 1000, sill: o.sill * 1000 }))
    })
    // A unit Grid does not read (WRT-7 reads m, cm, mm, ft and in), so the plan is read as metres.
    const result = inspectPlan({ ...mm, units: 'yd' })
    const filed = result.lines.map((l) => `${l.code}${l.causedBy ? ` <- ${l.causedBy.code}` : ''}`)
    expect(filed.slice(0, 3)).toEqual(['plan/value-left-out', 'plan/units-question <- plan/value-left-out', 'plan/far-from-origin <- plan/units-question'])
    expect(filed).toContain('room/escape-window-too-high <- plan/units-question')
    expect(result.problems).toBe(1)
  })
})

describe('a fixture beside a part that could not be drawn (CNT-13)', () => {
  // A kitchen and a bathroom side by side; a toilet stands in front of the bathroom's outside door.
  const w = (id: string, start: [number, number], end: [number, number]) => ({ id, start, end, thickness: 0.2, height: 2.7, kind: 'exterior' as const })
  const rooms = (bath: string[]): FloorPlan => ({
    version: '1',
    units: 'm',
    walls: [w('w1', [0, 0], [4, 0]), w('w2', [4, 0], [4, 3]), w('w3', [4, 3], [0, 3]), w('w4', [0, 3], [0, 0]), w('w5', [4, 0], [7, 0]), w('w6', [7, 0], [7, 3]), w('w7', [7, 3], [4, 3])],
    rooms: [
      { id: 'r1', name: 'Kitchen', use: 'kitchen', boundary: ['w1', 'w2', 'w3', 'w4'] },
      { id: 'r2', name: 'Bathroom', use: 'bathroom', boundary: bath }
    ],
    openings: [{ id: 'd1', wall: 'w5', type: 'door', offset: 1, width: 0.9, sill: 0, height: 2.1 }],
    items: [{ id: 'wc', kind: 'toilet', at: [5.8, 0.4], size: [0.4, 0.6], height: 0.8 }]
  })
  const codes = (plan: FloorPlan) => inspectPlan(plan).lines.map((l) => [l.code, l.thing.id, l.causedBy ?? null])

  it('files "stands in no room" under the room that could not be drawn, and keeps what it measured on its own', () => {
    // The bathroom's walls listed out of order: it cannot be drawn, so the toilet is in no room drawn.
    const result = inspectPlan(rooms(['w5', 'w7', 'w6', 'w2']))
    const unclosed = result.lines.findIndex((l) => l.code === 'room/unclosed')
    expect(result.lines[unclosed]!.thing).toEqual({ kind: 'room', id: 'r2' })
    expect(result.lines[unclosed + 1]).toMatchObject({ code: 'item/outside-rooms', thing: { kind: 'item', id: 'wc' }, causedBy: { code: 'room/unclosed', id: 'r2' } })
    // Measured from the wall, the door and the toilet alone: true whatever the room, so no cause.
    const blocks = result.lines.find((l) => l.code === 'item/blocks-doorway')!
    expect(blocks.causedBy).toBeUndefined()
    expect(result.problems).toBe(2)
    // Once the room is drawn, the toilet is in it and only the doorway line is left.
    expect(codes(rooms(['w2', 'w5', 'w6', 'w7'])).filter(([code]) => String(code).startsWith('item/'))).toEqual([['item/blocks-doorway', 'wc', null]])
  })

  it('says nothing of a doorway that runs off its wall, and names the door as not drawn, until it fits', () => {
    const offWall = (offset: number): FloorPlan => {
      const plan = rooms(['w2', 'w5', 'w6', 'w7'])
      return { ...plan, openings: [{ ...plan.openings[0]!, offset }], items: [{ ...plan.items![0]!, at: [6.4, 0.4] }] }
    }
    // The door runs from 2.40 to 3.30 m on a wall 3 m long.
    const result = inspectPlan(offWall(2.4))
    expect(result.lines.map((l) => l.code).filter((c) => c.startsWith('item/'))).toEqual([])
    expect(result.lines.find((l) => l.code === 'opening/out-of-wall')!.thing.id).toBe('d1')
    expect(result.lines.find((l) => l.code === 'floor/not-checked-doors-not-drawn')!.also).toEqual(['d1'])
    // Moved to fit, the door is drawn and the toilet in front of it is named, a problem of its own.
    expect(codes(offWall(2)).filter(([code]) => String(code).startsWith('item/'))).toEqual([['item/blocks-doorway', 'wc', null]])
  })
})
