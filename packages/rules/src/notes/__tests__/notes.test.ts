import { describe, expect, it } from 'vitest'
import type { FloorPlan, Opening } from '@ongrid/core/types/floorplan'
import {
  GENERAL_GUIDANCE_LABEL,
  LOOKUP_NOTICE,
  RULES,
  resolveFigure,
  type FigureKey,
  type RuleFinding,
  type RulesReport
} from '../../checks'
import { planNotes, type NoteText } from '../notes'

/** The figure as a check applies it when nothing was looked up. */
const baseline = (key: FigureKey) => resolveFigure(key)!

const plain = (text: readonly NoteText[]): string => text.map((t) => t.text).join('')
const names = (text: readonly NoteText[]): string[] => text.filter((t) => t.name).map((t) => t.text)

const opening = (id: string, type: Opening['type']): Opening => ({
  id,
  wall: 'w',
  type,
  offset: 0,
  width: 0.9,
  sill: 0,
  height: 2.1
})

function plan(extra: Partial<FloorPlan> = {}): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: [{ id: 'v', start: [0, 0], end: [1, 0], thickness: 0.1, height: 2.7, kind: 'partition', virtual: true }],
    rooms: [
      { id: 'bedroom', name: 'Back bedroom', boundary: [] },
      { id: 'bathroom', name: 'Bathroom', boundary: [] },
      { id: 'hall', name: 'Hall', boundary: [] },
      { id: 'store', name: 'Storage', boundary: [] },
      { id: 'kitchen', name: 'Kitchen', boundary: [] },
      { id: 'r9', name: '', boundary: [] }
    ],
    openings: [opening('d1', 'door'), opening('d2', 'door'), opening('o1', 'opening')],
    ...extra
  }
}

function finding(code: RuleFinding['code'], rooms: string[], extra: Partial<RuleFinding> = {}): RuleFinding {
  return { code, ruleId: 'r', floor: 'ground', rooms, openings: [], message: 'unused', ...extra }
}

function report(findings: RuleFinding[], notChecked: RulesReport['notChecked'] = []): RulesReport {
  return { schemaVersion: 1, basis: 'general-baseline', label: GENERAL_GUIDANCE_LABEL, rules: RULES, findings, notChecked, limits: [], figures: [] }
}

const one = (p: FloorPlan, f: RuleFinding) => planNotes(p, report([f])).notes[0]!

describe('planNotes', () => {
  it('says a trapped room has no way out, and where its only door leads', () => {
    const note = one(plan(), finding('no_route_to_exit', ['bedroom'], { through: [{ room: 'bathroom', via: 'd1' }] }))
    expect(plain(note.title)).toBe('Back bedroom has no way out')
    expect(names(note.title)).toEqual(['Back bedroom'])
    expect(plain(note.detail)).toBe('Its only door opens into Bathroom.')
    expect(names(note.detail)).toEqual(['Bathroom'])
    expect(note.tag).toBe('Exit')
    expect(note.room).toBe('bedroom')
    expect(note.floor).toBe('ground')
  })

  it('says "it only opens into" for a doorless opening or an open side', () => {
    for (const via of ['o1', 'v']) {
      const note = one(plan(), finding('no_route_to_exit', ['bedroom'], { through: [{ room: 'bathroom', via }] }))
      expect(plain(note.detail)).toBe('It only opens into Bathroom.')
    }
  })

  it('names a room once when two ways lead into it', () => {
    const through = [
      { room: 'hall', via: 'd1' },
      { room: 'hall', via: 'o1' }
    ]
    expect(plain(one(plan(), finding('no_route_to_exit', ['bedroom'], { through })).detail)).toBe('It only opens into Hall.')
  })

  it('joins several rooms in plain English', () => {
    const two = [
      { room: 'bathroom', via: 'd1' },
      { room: 'hall', via: 'd2' }
    ]
    expect(plain(one(plan(), finding('no_route_to_exit', ['bedroom'], { through: two })).detail)).toBe(
      'It only opens into Bathroom and Hall.'
    )
    const three = [...two, { room: 'kitchen', via: 'o1' }]
    const note = one(plan(), finding('no_route_to_exit', ['bedroom'], { through: three }))
    expect(plain(note.detail)).toBe('It only opens into Bathroom, Hall and Kitchen.')
    expect(names(note.detail)).toEqual(['Bathroom', 'Hall', 'Kitchen'])
  })

  it('still reads as a sentence when the check gives no ways through', () => {
    expect(plain(one(plan(), finding('no_route_to_exit', ['bedroom'])).detail)).toBe(
      'None of its doors leads to a way out.'
    )
  })

  it('says a room with no door has none', () => {
    const note = one(plan(), finding('room_without_door', ['store']))
    expect(plain(note.title)).toBe('Storage has no door')
    expect(plain(note.detail)).toBe('Nothing joins it to another room.')
    expect(note.room).toBe('store')
  })

  it('says a floor with no exit has no way out, about the floor and no room', () => {
    const p = plan({ floors: [{ id: 'ground', name: 'Ground floor', level: 0 }] })
    const note = one(p, finding('no_exit', []))
    expect(plain(note.title)).toBe('Ground floor has no way out')
    expect(names(note.title)).toEqual(['Ground floor'])
    expect(plain(note.detail)).toBe('No door leads outside.')
    expect(note.room).toBeNull()
  })

  it('says a door to an undrawn space leads to a space that is not drawn', () => {
    const note = one(plan(), finding('door_to_undrawn_space', ['kitchen'], { openings: ['d1'] }))
    expect(plain(note.title)).toBe('A door from Kitchen leads to a space that is not drawn')
    expect(names(note.title)).toEqual(['Kitchen'])
    expect(plain(note.detail)).toBe('If that space is a shared landing or a stair, draw it as a room, or mark the wall as exterior if the door leads outside.')
    expect(note.room).toBe('kitchen')
  })

  it('uses the id of a room that has no name, and of a floor the plan does not list', () => {
    expect(plain(one(plan(), finding('room_without_door', ['r9'])).title)).toBe('r9 has no door')
    expect(plain(one(plan(), finding('no_exit', [])).title)).toBe('Ground floor has no way out')
    expect(plain(one(plan(), finding('no_exit', [], { floor: 'attic' })).title)).toBe('attic has no way out')
  })

  it('names the floor of a room note only when the plan has several floors', () => {
    const f = finding('room_without_door', ['store'], { floor: 'first' })
    expect(one(plan(), f).floorName).toBeNull()
    const floors = [
      { id: 'ground', name: 'Ground floor', level: 0 },
      { id: 'first', name: 'First floor', level: 1 }
    ]
    expect(one(plan({ floors }), f).floorName).toBe('First floor')
    expect(one(plan({ floors }), finding('no_exit', [])).floorName).toBeNull()
  })

  it('gives unique ids that stay the same for the same report', () => {
    const r = report([
      finding('room_without_door', ['store']),
      finding('door_to_undrawn_space', ['kitchen'], { openings: ['d1'] }),
      finding('door_to_undrawn_space', ['kitchen'], { openings: ['d2'] })
    ])
    const ids = planNotes(plan(), r).notes.map((n) => n.id)
    expect(new Set(ids).size).toBe(3)
    expect(planNotes(plan(), r).notes.map((n) => n.id)).toEqual(ids)
  })

  it('keeps the check order, ends with the guidance label, and says what was not checked', () => {
    const view = planNotes(
      plan(),
      report(
        [finding('room_without_door', ['store']), finding('no_exit', [])],
        [{ reason: 'no_stairs', floor: 'first', rooms: [], openings: [], message: 'The way out of First floor was not checked: the plan has no stairs' }]
      )
    )
    expect(view.notes.map((n) => plain(n.title))).toEqual(['Storage has no door', 'Ground floor has no way out'])
    expect(view.notChecked).toEqual(['The way out of First floor was not checked: the plan has no stairs.'])
    expect(view.label).toBe('General guidance, not your local rules.')
  })

  it('has no notes when the check found nothing', () => {
    expect(planNotes(plan(), report([])).notes).toEqual([])
  })
})

describe('the room-size note', () => {
  const small = finding('room_too_small', ['bedroom'], {
    ruleId: 'habitable-room-area',
    area: 5.8,
    minimum: 6.5,
    figures: [baseline('habitableRoomMinArea')]
  })

  it('says the room is under 6.5 m², with its area to two decimals, where the figure is from and that nobody checked it', () => {
    const note = one(plan(), small)
    expect(plain(note.title)).toBe('Back bedroom is under 6.5 m²')
    expect(names(note.title)).toEqual(['Back bedroom'])
    expect(plain(note.detail)).toBe(
      'It measures 5.80 m². Rooms people sleep or live in need at least 6.5 m². ' +
        'Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.'
    )
    expect(note.tag).toBe('Size')
    expect(note.room).toBe('bedroom')
  })

  it('names the floor in a plan with more than one', () => {
    const twoFloors = plan({
      floors: [
        { id: 'ground', name: 'Ground floor', level: 0 },
        { id: 'first', name: 'First floor', level: 1 }
      ]
    })
    expect(one(twoFloors, { ...small, floor: 'first' }).floorName).toBe('First floor')
  })

  it('keeps the rooms without a use in what was not checked, never as a note', () => {
    const view = planNotes(
      plan(),
      report([], [
        { reason: 'no_use', floor: 'ground', rooms: ['hall', 'store', 'r9'], openings: [], message: "Room sizes weren't checked for 3 rooms that don't say what they're for" }
      ])
    )
    expect(view.notes).toEqual([])
    expect(view.notChecked).toEqual(["Room sizes weren't checked for 3 rooms that don't say what they're for."])
  })
})

describe('the escape notes', () => {
  it('says a bedroom with no window or door outside has no way to escape', () => {
    const note = one(plan(), finding('no_escape_opening', ['bedroom'], { ruleId: 'escape-opening' }))
    expect(plain(note.title)).toBe('Back bedroom has no way to escape')
    expect(names(note.title)).toEqual(['Back bedroom'])
    expect(plain(note.detail)).toBe('It needs a window or a door to the outside that someone can climb through.')
    expect(note.tag).toBe('Escape')
    expect(note.room).toBe('bedroom')
  })

  it('says a window is too small, with its area and the floor’s minimum to two decimals', () => {
    const note = one(
      plan(),
      finding('escape_window_too_small', ['bedroom'], {
        ruleId: 'escape-opening',
        area: 0.4,
        minimum: 0.53,
        width: 0.8,
        height: 0.5,
        figures: [baseline('escapeOpeningMinArea'), baseline('escapeOpeningMinWidth'), baseline('escapeOpeningMinHeight')]
      })
    )
    expect(plain(note.title)).toBe("Back bedroom's window is too small to escape through")
    expect(names(note.title)).toEqual(['Back bedroom'])
    expect(plain(note.detail)).toBe(
      'It opens 0.40 m² as drawn. A bedroom on this floor needs at least 0.53 m², 50.8 cm wide, 61 cm tall. ' +
        'Basis: US model codes (IBC 2024 1031.3.1, IRC 2024 R319.2.1, IBC 2024 1031.3.2, IRC 2024 R319.2.2). ' +
        'Found by an AI and not yet checked by a person.'
    )
    expect(note.tag).toBe('Escape')
  })

  it('says a sill is too high, with its height and the limit to the millimetre', () => {
    const note = one(
      plan(),
      finding('escape_window_too_high', ['bedroom'], {
        ruleId: 'escape-opening',
        sill: 1.2,
        maximum: 1.118,
        figures: [baseline('escapeOpeningMaxSill')]
      })
    )
    expect(plain(note.title)).toBe("Back bedroom's window is too high to escape through")
    expect(plain(note.detail)).toBe(
      'Its sill is 1.20 m above the floor as drawn. It needs to be 1.118 m or lower. ' +
        'Basis: US model codes (IBC 2024 1031.3.3, IRC 2024 R319.2.3). Found by an AI and not yet checked by a person.'
    )
    expect(note.tag).toBe('Escape')
  })
})

describe('a report with findings of both kinds', () => {
  it('keeps the report order, each note written for its own finding', () => {
    const view = planNotes(
      plan(),
      report([
        finding('room_without_door', ['store']),
        finding('no_escape_opening', ['bedroom'], { ruleId: 'escape-opening' }),
        finding('no_exit', []),
        finding('room_too_small', ['bedroom'], { ruleId: 'habitable-room-area', area: 5.8, minimum: 6.5 }),
        finding('door_to_undrawn_space', ['kitchen'], { openings: ['d1'] })
      ])
    )
    expect(view.notes.map((n) => [plain(n.title), n.tag])).toEqual([
      ['Storage has no door', 'Exit'],
      ['Back bedroom has no way to escape', 'Escape'],
      ['Ground floor has no way out', 'Exit'],
      ['Back bedroom is under 6.5 m²', 'Size'],
      ['A door from Kitchen leads to a space that is not drawn', 'Exit']
    ])
    expect(new Set(view.notes.map((n) => n.id)).size).toBe(5)
  })

  it('always ends with the general-guidance label, and carries the lookup line beside it', () => {
    const lookedUp: RulesReport = { ...report([]), basis: 'local-lookup', lookupNotice: LOOKUP_NOTICE }
    const view = planNotes(plan(), lookedUp)
    expect(view.label).toBe('General guidance, not your local rules.')
    expect(view.lookupNotice).toBe(
      'Some figures were found online by an AI and have not been checked by a person. Check their sources.'
    )
    expect(planNotes(plan(), report([])).lookupNotice).toBeNull()
  })

  it('says a looked-up figure was found online and not checked, with its address', () => {
    const source = { url: 'https://example.org/rules', quote: 'at least 9 m2', retrievedAt: '2026-11-14T10:00:00.000Z' }
    const lookedUp = resolveFigure('habitableRoomMinArea', { habitableRoomMinArea: { value: 9, source } }, 'IT')!
    const note = one(plan(), finding('room_too_small', ['bedroom'], { area: 8, minimum: 9, figures: [lookedUp] }))
    expect(plain(note.title)).toBe('Back bedroom is under 9 m²')
    expect(plain(note.detail)).toBe(
      'It measures 8.00 m². Rooms people sleep or live in need at least 9 m². ' +
        'Basis: figures found online for this place. Found by an AI and not yet checked by a person. Source: https://example.org/rules.'
    )
  })

  it('passes on what the checks never look at', () => {
    const view = planNotes(plan(), { ...report([]), limits: ['Windows are measured as drawn'] })
    expect(view.limits).toEqual(['Windows are measured as drawn.'])
  })
})
