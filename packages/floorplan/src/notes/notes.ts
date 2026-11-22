/**
 * The plan checks as notes a person reads on the plan.
 *
 * A note's title is the finding's one wording (`geometry/rules/messages.ts`, MSG-1), the same
 * words as the report's `message`, with the names as their own segments so the list can set
 * them apart without parsing text. The detail says more, from the finding's code and ids. Pure.
 */
import { limit, metresText, passageText, planCheckWordings as wordings, planFloors, type RuleFinding, type RulesReport, type WordingPart } from '../geometry'
import type { FloorPlan } from '../types/floorplan'

/** A run of text; `name` marks a room or floor name as the plan writes it. */
export type NoteText = WordingPart

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

  // A floor whose only door out leads to a space not drawn words its cut-off rooms the longer way.
  const wayOutNotDrawn = new Set(report.notChecked.filter((n) => n.reason === 'way_out_not_drawn').map((n) => n.floor))

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
          title: wayOutNotDrawn.has(finding.floor) ? wordings.noRouteToAnyDoorOut(roomName(room!)) : wordings.noRoute(roomName(room!)),
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
          title: wordings.roomWithoutDoor(roomName(room!)),
          detail: [words('Nothing joins it to another room.')]
        }
      case 'no_exit':
        return {
          ...base,
          title: wordings.noExit(floorName(finding.floor)),
          detail: [words('No door leads outside.')]
        }
      case 'door_to_undrawn_space':
        return {
          ...base,
          title: wordings.doorToUndrawnSpace(roomName(room!)),
          detail: [words("If that space is a shared landing or a stair, draw it as a room, or mark the wall as exterior if the door leads outside.")]
        }
      case 'door_to_outside_above_ground':
        return {
          ...base,
          title: wordings.doorOutAboveGround(roomName(room!), metresText(finding.elevation ?? 0)),
          detail: [words('It is not counted as a way out. If it opens onto a balcony, a terrace or an outside stair, draw that as a room.')]
        }
      case 'opening_too_small_to_pass': {
        const p = finding.passage
        return {
          ...base,
          title: wordings.openingTooSmall(roomName(room!)),
          detail: [
            words(p === undefined ? '' : `${passageText(p)}. `),
            words(
              `Grid counts a door or an opening as a way through when it is at least ${metresText(limit('passableWidth'))} m wide and ` +
                `${metresText(limit('passableHeight'))} m high, with its sill no more than ${metresText(limit('passableSill'))} m above the floor. ` +
                "That is Grid's own size, not a code figure."
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
