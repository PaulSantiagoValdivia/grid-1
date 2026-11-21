/**
 * The one wording of every finding and notice of the plan checks (MSG-1, AU4-1). Plain English,
 * rooms by their names: these lines are shown to the user as they are, so no data-model words,
 * and never anything that reads as "this plan complies".
 *
 * Each wording is written once, as parts (`wordings`), and every place that shows it uses it:
 * the report's `message` quotes the names (`messages`, MSG-9: a room named with a sentence still
 * reads as a name), the notes a person reads set the names apart (`notes.ts`), and the result
 * record (`@ongrid/rules`) repeats the message. None of them words a finding its own way.
 */

import { quoted } from '../../types/planText'

/** A run of a wording; `name` marks a room or floor name as the plan writes it. */
export interface WordingPart {
  readonly text: string
  readonly name?: true
}

const name = (text: string): WordingPart => ({ text, name: true })
const words = (text: string): WordingPart => ({ text })

/** "A", "A, B", each a name: the way a report lists rooms. */
function listed(names: readonly string[]): WordingPart[] {
  return names.flatMap((text, i) => (i === 0 ? [name(text)] : [words(', '), name(text)]))
}

/** A wording as one line of text, every name in quotes. */
export function wordingText(parts: readonly WordingPart[]): string {
  return parts.map((part) => (part.name ? quoted(part.text) : part.text)).join('')
}

export const wordings = {
  noExit: (floor: string): WordingPart[] => [name(floor), words(' has no door to the outside')],
  roomWithoutDoor: (room: string): WordingPart[] => [name(room), words(' has no door or opening to another space')],
  noRoute: (room: string): WordingPart[] => [name(room), words(' has no route to a door to the outside')],
  noRouteToAnyDoorOut: (room: string): WordingPart[] => [
    name(room),
    words(' has no route to a door to the outside, nor to a door into a space that is not drawn')
  ],
  noStairs: (floor: string): WordingPart[] => [
    words('The way out of '),
    name(floor),
    words(' was not checked: the plan has no stairs')
  ],
  wayOutNotDrawn: (floor: string): WordingPart[] => [
    words('The way out of '),
    name(floor),
    words(' was not checked: its only door out leads to a space that is not drawn')
  ],
  /** `rooms` holds at least one name. One wording for one room or many (MSG-1). */
  roomsNotDrawn: (floor: string, rooms: readonly string[]): WordingPart[] => [
    words('On '),
    name(floor),
    words(', rooms that could not be drawn were not checked: '),
    ...listed(rooms)
  ],
  doorsNotDrawn: (floor: string): WordingPart[] => [
    words('On '),
    name(floor),
    words(', some doors could not be drawn and were not checked')
  ],
  doorToUndrawnSpace: (room: string): WordingPart[] => [
    words('A door from '),
    name(room),
    words(' leads to a space that is not drawn as a room')
  ],
  /** `height` as the check prints it, in metres. */
  doorOutAboveGround: (room: string, height: string): WordingPart[] => [
    words('A door from '),
    name(room),
    words(` leads outside ${height} m above the ground, so it is not a way out`)
  ]
}

/** The same wordings as report lines. */
export const messages = {
  noExit: (floor: string): string => wordingText(wordings.noExit(floor)),
  roomWithoutDoor: (room: string): string => wordingText(wordings.roomWithoutDoor(room)),
  noRoute: (room: string): string => wordingText(wordings.noRoute(room)),
  noRouteToAnyDoorOut: (room: string): string => wordingText(wordings.noRouteToAnyDoorOut(room)),
  noStairs: (floor: string): string => wordingText(wordings.noStairs(floor)),
  wayOutNotDrawn: (floor: string): string => wordingText(wordings.wayOutNotDrawn(floor)),
  cannotBeDrawn: (floor: string, rooms: readonly string[]): string =>
    wordingText(rooms.length > 0 ? wordings.roomsNotDrawn(floor, rooms) : wordings.doorsNotDrawn(floor)),
  doorToUndrawnSpace: (room: string): string => wordingText(wordings.doorToUndrawnSpace(room)),
  doorOutAboveGround: (room: string, height: string): string => wordingText(wordings.doorOutAboveGround(room, height))
}
