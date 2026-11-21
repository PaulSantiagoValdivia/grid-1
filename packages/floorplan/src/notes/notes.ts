/**
 * The local rules check as notes a person reads on the plan.
 *
 * Built from each finding's code and ids, never by rewording its `message`: that
 * string is the check's own, written for any reader. Names come back as their own
 * segments, so the list can set them apart without parsing text. Pure.
 */
import { planFloors, type RuleFinding, type RulesReport } from '../geometry'
import type { FloorPlan } from '../types/floorplan'

/** A run of text; `name` marks a room or floor name as the plan writes it. */
export interface NoteText {
  readonly text: string
  readonly name?: true
}

export interface PlanNote {
  /** Stable for the same finding: code, floor, rooms and openings. */
  readonly id: string
  readonly floor: string
  /** The room to show; null for a note about a whole floor. */
  readonly room: string | null
  /** Set only on a room's note in a plan with more than one floor. */
  readonly floorName: string | null
  readonly title: readonly NoteText[]
  readonly detail: readonly NoteText[]
  /** What the note is about. Every check so far is about getting out. */
  readonly tag: 'Exit'
}

export interface PlanNotesView {
  readonly notes: readonly PlanNote[]
  /** What the check did not cover, in its own words. Not notes, and not counted. */
  readonly notChecked: readonly string[]
  /** What the checks never look at, whatever the plan. The same lines every time. */
  readonly limits: readonly string[]
  /** Ends every list. */
  readonly label: string
}

const name = (text: string): NoteText => ({ text, name: true })
const words = (text: string): NoteText => ({ text })
const sentence = (text: string): string => (/[.!?]$/.test(text) ? text : `${text}.`)

/** "A", "A and B", "A, B and C", each a name. */
function joined(rooms: readonly string[]): NoteText[] {
  return rooms.flatMap((room, i) => {
    const sep = i === 0 ? [] : [words(i === rooms.length - 1 ? ' and ' : ', ')]
    return [...sep, name(room)]
  })
}

export function planNotes(plan: FloorPlan, report: RulesReport): PlanNotesView {
  const floors = planFloors(plan)
  const floorNames = new Map(floors.map((f) => [f.id, f.name || f.id] as const))
  const roomNames = new Map(plan.rooms.map((r) => [r.id, r.name || r.id] as const))
  const doors = new Set(plan.openings.filter((o) => o.type === 'door').map((o) => o.id))
  const roomName = (id: string): string => roomNames.get(id) ?? id
  const floorName = (id: string): string => floorNames.get(id) ?? id

  const noteOf = (finding: RuleFinding): PlanNote => {
    const room = finding.rooms[0] ?? null
    const id = [finding.code, finding.floor, finding.rooms.join(','), finding.openings.join(',')].join(':')
    const base = {
      id,
      floor: finding.floor,
      room: finding.code === 'no_exit' ? null : room,
      floorName: finding.code !== 'no_exit' && floors.length > 1 ? floorName(finding.floor) : null,
      tag: 'Exit' as const
    }
    switch (finding.code) {
      case 'no_route_to_exit': {
        const through = finding.through ?? []
        const beyond = [...new Set(through.map((step) => step.room))].map(roomName)
        const onlyDoor = through.length === 1 && doors.has(through[0]!.via)
        return {
          ...base,
          title: [name(roomName(room!)), words(' has no way out')],
          // `through` is optional in the report: an older one, or a future code path, may lack it.
          detail: beyond.length === 0
            ? [words('None of its doors leads to a way out.')]
            : onlyDoor
            ? [words('Its only door opens into '), ...joined(beyond), words('.')]
            : [words('It only opens into '), ...joined(beyond), words('.')]
        }
      }
      case 'room_without_door':
        return {
          ...base,
          title: [name(roomName(room!)), words(' has no door')],
          detail: [words('Nothing joins it to another room.')]
        }
      case 'no_exit':
        return {
          ...base,
          title: [name(floorName(finding.floor)), words(' has no way out')],
          detail: [words('No door leads outside.')]
        }
      case 'door_to_undrawn_space':
        return {
          ...base,
          title: [words('A door from '), name(roomName(room!)), words(' leads to a space that is not drawn')],
          detail: [words("If that space is a shared landing or a stair, draw it as a room, or mark the wall as exterior if the door leads outside.")]
        }
      case 'door_to_outside_above_ground':
        return {
          ...base,
          title: [words('A door from '), name(roomName(room!)), words(' opens outside above the ground')],
          detail: [words('It is not counted as a way out. If it opens onto a balcony, a terrace or an outside stair, draw that as a room.')]
        }
      case 'stair_out_of_line':
      case 'lift_out_of_line': {
        const stair = finding.code === 'stair_out_of_line'
        return {
          ...base,
          title: [words(stair ? 'The stair ' : 'The lift shaft '), name(roomName(room!)), words(' does not line up with the floor below')],
          detail: [
            words(
              stair
                ? 'It lies over no stair room on the floor below, so the way out is not followed down it. Move it over the stair below, or state the stair in the plan\'s stairs.'
                : 'It lies over no lift shaft on the floor below. Move it over the shaft below.'
            )
          ]
        }
      }
    }
  }

  return {
    notes: report.findings.map(noteOf),
    notChecked: report.notChecked.map((n) => sentence(n.message)),
    limits: report.limits.map(sentence),
    label: sentence(report.label)
  }
}
