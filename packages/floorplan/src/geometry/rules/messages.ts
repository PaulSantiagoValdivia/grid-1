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
import { metresText } from '../rounding'
import type { RuleFinding } from './types'

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

/** Names joined by `separator`, each a name. */
function joinedWith(names: readonly string[], separator: string): WordingPart[] {
  return names.flatMap((text, i) => (i === 0 ? [name(text)] : [words(separator), name(text)]))
}

/** A wording as one line of text, every name in quotes. */
export function wordingText(parts: readonly WordingPart[]): string {
  return parts.map((part) => (part.name ? quoted(part.text) : part.text)).join('')
}

/** The kinds of opening a plan has (C2). */
export type OpeningKind = 'door' | 'window' | 'opening'

/**
 * LVL-5 (lab A-16, MS-13): openings named by what they are, never a window called a door: `this
 * window`, `these doors`, `these doors and windows`, with the words for them that go with it.
 * With no kinds given, the words of every kind.
 */
export function openingWords(kinds: readonly OpeningKind[] | undefined, count: number): { these: string; plain: string; they: string; them: string } {
  const many = count !== 1
  const order: readonly OpeningKind[] = ['door', 'window', 'opening']
  const nouns: Record<OpeningKind, [string, string]> = { door: ['door', 'doors'], window: ['window', 'windows'], opening: ['doorless opening', 'doorless openings'] }
  const present = kinds === undefined || kinds.length === 0 ? [] : order.filter((k) => kinds.includes(k))
  const they = many ? 'they' : 'it'
  const them = many ? 'them' : 'it'
  if (present.length === 0) return { these: 'these doors or windows', plain: 'doors or windows', they: 'they', them: 'them' }
  if (present.length === 1) {
    const noun = nouns[present[0]!][many ? 1 : 0]
    return { these: `${many ? 'these' : 'this'} ${noun}`, plain: many ? noun : `a ${noun}`, they, them }
  }
  const list = present.map((k) => nouns[k][1])
  const joined = list.length === 2 ? `${list[0]} and ${list[1]}` : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`
  return { these: `these ${joined}`, plain: joined, they: 'they', them: 'them' }
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
    words(' was not checked: no stair joins it to the ground floor')
  ],
  /**
   * LVL-3: rooms used as a stair (or a lift) on one level that lie over none on the level below.
   * `upper` and `lower` hold at least one name each; floors likewise.
   */
  outOfLine: (
    kind: 'stair' | 'lift',
    upper: readonly string[],
    upperFloors: readonly string[],
    lower: readonly string[],
    lowerFloors: readonly string[]
  ): WordingPart[] => [
    words(kind === 'stair' ? 'The stair ' : 'The lift shaft '),
    ...joinedWith(upper, ' and '),
    words(' on '),
    ...joinedWith(upperFloors, ' and '),
    words(' does not lie over '),
    ...joinedWith(lower, ' or '),
    words(' on '),
    ...joinedWith(lowerFloors, ' and '),
    words(kind === 'stair' ? ', so it does not join the two floors' : ', so the shaft is out of line')
  ],
  /**
   * LVL-5 (lab WR-9): a stair room or a lift shaft moved from the one below it. `how` says how far
   * and which way ("is 1.20 m east of", or for a shaft not moved as a whole "has its east side
   * 0.60 m west of that of"), `upperAt` and `lowerAt` where each stands ("(1.20, 0.00) to
   * (2.40, 3.00)").
   */
  shifted: (
    kind: 'stair' | 'lift',
    upper: string,
    upperFloor: string,
    lower: string,
    lowerFloor: string,
    how: string,
    upperAt: string,
    lowerAt: string
  ): WordingPart[] => [
    words(kind === 'stair' ? 'The stair ' : 'The lift shaft '),
    name(upper),
    words(' on '),
    name(upperFloor),
    words(` ${how} `),
    name(lower),
    words(' on '),
    name(lowerFloor),
    words(` below it: it stands from ${upperAt}, the one below from ${lowerAt}`)
  ],
  wayOutNotDrawn: (floor: string): WordingPart[] => [
    words('The way out of '),
    name(floor),
    words(' was not checked: its only door out leads to a space that is not drawn')
  ],
  /**
   * `rooms` holds at least one name. One wording for one room or many (MSG-1). MSG-5: what rests
   * on them (a door beside them, the floor's way out) was not checked either.
   */
  roomsNotDrawn: (floor: string, rooms: readonly string[]): WordingPart[] => [
    words('On '),
    name(floor),
    words(', these rooms could not be drawn, so they and what rests on them were not checked: '),
    ...listed(rooms)
  ],
  /**
   * MSG-5: `openings` holds at least one id, and names them. LVL-5: `kinds`, the type of each, words
   * them as what they are (`openingWords`).
   */
  doorsNotDrawn: (floor: string, openings: readonly string[], kinds?: readonly OpeningKind[]): WordingPart[] => {
    const w = openingWords(kinds, openings.length)
    return [
      words('On '),
      name(floor),
      words(`, ${w.these} could not be drawn, so ${w.they} and what rests on ${w.them} were not checked: `),
      ...listed(openings)
    ]
  },
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
  ],
  /**
   * LVL-4: a door, window or opening in an outside wall that lies below the ground the site states
   * (lab VE-7). Its depth is the finding's `belowGround`: its top when it lies wholly below, else its foot.
   */
  belowGround: (kind: 'door' | 'window' | 'opening', room: string | null, wall: string, wholly: boolean, depth: string): WordingPart[] => [
    words(`The ${kind} in `),
    ...(room === null ? [words('wall '), name(wall)] : [name(room)]),
    words(
      ` lies ${wholly ? 'wholly' : 'partly'} below the ground: its ${wholly ? 'top' : kind === 'window' ? 'sill' : kind === 'door' ? 'threshold' : 'foot'} is ${depth} m under the ground level the site states`
    )
  ],
  /** MSG-18: a door or doorless opening no person fits through. Its size is the finding's `passage`. */
  openingTooSmall: (room: string): WordingPart[] => [
    words('An opening from '),
    name(room),
    words(' is too small for a person to get through, so it is not a way through')
  ]
}

/**
 * What a door or opening no person fits through falls short at, as drawn (MSG-18): "It is 0.30 m
 * wide", "Its sill is 1.50 m above the floor". `drawn` is already printed against the size.
 */
export function passageText(passage: NonNullable<RuleFinding['passage']>): string {
  const size = metresText(passage.drawn, 2, passage.passable)
  const what = passage.kind === 'door' ? 'The door' : 'The opening'
  return passage.short === 'sill'
    ? `${what} has its sill ${size} m above the floor`
    : `${what} is ${size} m ${passage.short === 'width' ? 'wide' : 'high'}`
}

/**
 * BRF-3 (lab EL-16): the set-back the person asked for, in their words: "you asked for 3.00 m", or
 * for one assumed for them, that it is assumed. Their figure, never a code's.
 */
export function askedText(asked: string, source: 'given' | 'assumed' | null): string {
  return source === 'assumed' ? `${asked} m is assumed for you, to confirm` : `you asked for ${asked} m`
}

/** BRF-3: the building stands nearer an edge of its plot than the set-back asked for. */
export function setbackShortText(distance: string, boundary: string, asked: string, source: 'given' | 'assumed' | null): string {
  return `The building is ${distance} m from ${boundary}; ${askedText(asked, source)}`
}

/** BRF-3: the building reaches past an edge of its plot. */
export function overBoundaryText(past: string, boundary: string): string {
  return `The building reaches ${past} m over ${boundary}, out of the plot`
}

/** The same wordings as report lines. */
export const messages = {
  noExit: (floor: string): string => wordingText(wordings.noExit(floor)),
  roomWithoutDoor: (room: string): string => wordingText(wordings.roomWithoutDoor(room)),
  noRoute: (room: string): string => wordingText(wordings.noRoute(room)),
  noRouteToAnyDoorOut: (room: string): string => wordingText(wordings.noRouteToAnyDoorOut(room)),
  noStairs: (floor: string): string => wordingText(wordings.noStairs(floor)),
  outOfLine: (...args: Parameters<typeof wordings.outOfLine>): string => wordingText(wordings.outOfLine(...args)),
  shifted: (...args: Parameters<typeof wordings.shifted>): string => wordingText(wordings.shifted(...args)),
  wayOutNotDrawn: (floor: string): string => wordingText(wordings.wayOutNotDrawn(floor)),
  cannotBeDrawn: (floor: string, rooms: readonly string[], openings: readonly string[], kinds?: readonly OpeningKind[]): string =>
    wordingText(rooms.length > 0 ? wordings.roomsNotDrawn(floor, rooms) : wordings.doorsNotDrawn(floor, openings, kinds)),
  doorToUndrawnSpace: (room: string): string => wordingText(wordings.doorToUndrawnSpace(room)),
  doorOutAboveGround: (room: string, height: string): string => wordingText(wordings.doorOutAboveGround(room, height)),
  belowGround: (kind: 'door' | 'window' | 'opening', room: string | null, wall: string, wholly: boolean, depth: string): string =>
    wordingText(wordings.belowGround(kind, room, wall, wholly, depth)),
  openingTooSmall: (room: string): string => wordingText(wordings.openingTooSmall(room))
}
