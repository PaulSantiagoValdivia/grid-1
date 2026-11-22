/**
 * MSG-5: the record's side of notes traced to their cause. An escape note that rests on a window
 * that could not be drawn is held back, and the check says it did not look; identical notes are
 * one line, in the code's one wording; a line on a plan that may not be in metres is filed under
 * that question.
 */
import { describe, expect, it } from 'vitest'
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
    const result = inspectPlan({ ...mm, units: 'mm' })
    const filed = result.lines.map((l) => `${l.code}${l.causedBy ? ` <- ${l.causedBy.code}` : ''}`)
    expect(filed.slice(0, 3)).toEqual(['plan/value-left-out', 'plan/units-question <- plan/value-left-out', 'plan/far-from-origin <- plan/units-question'])
    expect(filed).toContain('room/escape-window-too-high <- plan/units-question')
    expect(result.problems).toBe(1)
  })
})
