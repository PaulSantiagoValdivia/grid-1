import { describe, expect, it } from 'vitest'
import type { FloorPlan, Opening } from '../../types/floorplan'
import { GENERAL_GUIDANCE_LABEL, RULES, type RuleFinding, type RulesReport } from '../../geometry'
import { planNotes, type NoteText } from '../notes'

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
  return { schemaVersion: 1, basis: 'general-baseline', label: GENERAL_GUIDANCE_LABEL, rules: RULES, findings, notChecked, limits: [] }
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
