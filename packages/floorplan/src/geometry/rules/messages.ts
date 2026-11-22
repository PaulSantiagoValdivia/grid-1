/**
 * The one wording of every finding and notice of the plan checks (MSG-1, AU4-1), by its key in
 * the message files (MSG-11). Plain words,
 * rooms by their names: these lines are shown to the user as they are, so no data-model words,
 * and never anything that reads as "this plan complies".
 *
 * Each wording is written once, as parts (`wordings`), and every place that shows it uses it:
 * the report's `message` quotes the names (`messages`, MSG-9: a room named with a sentence still
 * reads as a name), the notes a person reads set the names apart (`notes.ts`), and the result
 * record (`@ongrid/rules`) repeats the message. None of them words a finding its own way.
 */

import { quoted } from '../../types/planText'
import { english, joined, name, num, said, sayParts, type MessageKey, type Said, type Value } from '../../messages/say'
import { metresText } from '../rounding'
import type { RuleFinding } from './types'

/** A run of a wording; `name` marks a room or floor name as the plan writes it. */
export interface WordingPart {
  readonly text: string
  readonly name?: true
}

/** A wording as one line of text, every name in quotes. */
export function wordingText(parts: readonly WordingPart[]): string {
  return parts.map((part) => (part.name ? quoted(part.text) : part.text)).join('')
}

/** A sentence as its runs in English, names set apart: the notes a person reads. */
const parts = (sentence: Said): WordingPart[] => sayParts('en', sentence.key, sentence.values)

/**
 * MSG-11: each wording by its key (`check.*` in the message files) and values, so the report,
 * the notes and the record say it in any language from one wording.
 */
export const saids = {
  noExit: (floor: string): Said => said('check.noExit', { floor: name(floor) }),
  roomWithoutDoor: (room: string): Said => said('check.roomWithoutDoor', { room: name(room) }),
  noRoute: (room: string): Said => said('check.noRoute', { room: name(room) }),
  noRouteToAnyDoorOut: (room: string): Said => said('check.noRouteToAnyDoorOut', { room: name(room) }),
  noStairs: (floor: string): Said => said('check.noStairs', { floor: name(floor) }),
  /**
   * LVL-3: rooms used as a stair (or a lift) on one level that lie over none on the level below.
   * `upper` and `lower` hold at least one name each; floors likewise.
   */
  outOfLine: (kind: 'stair' | 'lift', upper: readonly string[], upperFloors: readonly string[], lower: readonly string[], lowerFloors: readonly string[]): Said =>
    said(`check.outOfLine.${kind}`, {
      upper: joined(upper.map(name), 'join.and'),
      upperFloors: joined(upperFloors.map(name), 'join.and'),
      lower: joined(lower.map(name), 'join.or'),
      lowerFloors: joined(lowerFloors.map(name), 'join.and')
    }),
  wayOutNotDrawn: (floor: string): Said => said('check.wayOutNotDrawn', { floor: name(floor) }),
  /**
   * `rooms` holds at least one name. One wording for one room or many (MSG-1). MSG-5: what rests
   * on them (a door beside them, the floor's way out) was not checked either.
   */
  roomsNotDrawn: (floor: string, rooms: readonly string[]): Said => said('check.roomsNotDrawn', { floor: name(floor), rooms: joined(rooms.map(name), 'join.comma') }),
  /** MSG-5: `openings` holds at least one id, and names them. */
  doorsNotDrawn: (floor: string, openings: readonly string[]): Said => said('check.doorsNotDrawn', { floor: name(floor), openings: joined(openings.map(name), 'join.comma') }),
  doorToUndrawnSpace: (room: string): Said => said('check.doorToUndrawnSpace', { room: name(room) }),
  /** `height` as the check prints it, in metres. */
  doorOutAboveGround: (room: string, height: string): Said => said('check.doorOutAboveGround', { room: name(room), height: num(height) }),
  /**
   * LVL-4: a door, window or opening in an outside wall that lies below the ground the site states
   * (lab VE-7). Its depth is the finding's `belowGround`: its top when it lies wholly below, else its foot.
   */
  belowGround: (kind: 'door' | 'window' | 'opening', room: string | null, wall: string, wholly: boolean, depth: string): Said => {
    const end = wholly ? 'top' : kind === 'window' ? 'sill' : kind === 'door' ? 'threshold' : 'foot'
    return said(`check.belowGround.${wholly ? 'wholly' : 'partly'}`, {
      what: said(`check.below.${kind}.${room === null ? 'wall' : 'room'}` as MessageKey, room === null ? { wall: name(wall) } : { room: name(room) }),
      end: said(`check.below.end.${end}` as MessageKey),
      depth: num(depth)
    })
  },
  /** MSG-18: a door or doorless opening no person fits through. Its size is the finding's `passage`. */
  openingTooSmall: (room: string): Said => said('check.openingTooSmall', { room: name(room) }),
  /**
   * BRF-3 (lab EL-16): the set-back the person asked for, in their words: "you asked for 3.00 m", or
   * for one assumed for them, that it is assumed. Their figure, never a code's. `asked` in metres.
   */
  asked: (asked: string, source: 'given' | 'assumed' | null): Said => said(source === 'assumed' ? 'check.asked.assumed' : 'check.asked', { asked: num(asked) }),
  /** BRF-3: the building stands nearer an edge of its plot than the set-back asked for. `boundary` names the edge (`boundaryEdgeSaid`). */
  setbackShort: (distance: string, boundary: Value, asked: string, source: 'given' | 'assumed' | null): Said =>
    said('check.setbackShort', { distance: num(distance), boundary, asked: saids.asked(asked, source) }),
  /** BRF-3: the building reaches past an edge of its plot. */
  overBoundary: (past: string, boundary: Value): Said => said('check.overBoundary', { past: num(past), boundary })
}

export const wordings = {
  noExit: (floor: string): WordingPart[] => parts(saids.noExit(floor)),
  roomWithoutDoor: (room: string): WordingPart[] => parts(saids.roomWithoutDoor(room)),
  noRoute: (room: string): WordingPart[] => parts(saids.noRoute(room)),
  noRouteToAnyDoorOut: (room: string): WordingPart[] => parts(saids.noRouteToAnyDoorOut(room)),
  noStairs: (floor: string): WordingPart[] => parts(saids.noStairs(floor)),
  outOfLine: (...args: Parameters<typeof saids.outOfLine>): WordingPart[] => parts(saids.outOfLine(...args)),
  wayOutNotDrawn: (floor: string): WordingPart[] => parts(saids.wayOutNotDrawn(floor)),
  roomsNotDrawn: (floor: string, rooms: readonly string[]): WordingPart[] => parts(saids.roomsNotDrawn(floor, rooms)),
  doorsNotDrawn: (floor: string, openings: readonly string[]): WordingPart[] => parts(saids.doorsNotDrawn(floor, openings)),
  doorToUndrawnSpace: (room: string): WordingPart[] => parts(saids.doorToUndrawnSpace(room)),
  doorOutAboveGround: (room: string, height: string): WordingPart[] => parts(saids.doorOutAboveGround(room, height)),
  belowGround: (...args: Parameters<typeof saids.belowGround>): WordingPart[] => parts(saids.belowGround(...args)),
  openingTooSmall: (room: string): WordingPart[] => parts(saids.openingTooSmall(room))
}

/**
 * What a door or opening no person fits through falls short at, as drawn (MSG-18): "It is 0.30 m
 * wide", "Its sill is 1.50 m above the floor". `drawn` is already printed against the size.
 */
export function passageSaid(passage: NonNullable<RuleFinding['passage']>): Said {
  const size = num(metresText(passage.drawn, 2, passage.passable))
  return said(`check.passage.${passage.kind}.${passage.short}`, { size })
}

export function passageText(passage: NonNullable<RuleFinding['passage']>): string {
  return english(passageSaid(passage))
}

/**
 * BRF-3 (lab EL-16): the set-back the person asked for, in their words: "you asked for 3.00 m", or
 * for one assumed for them, that it is assumed. Their figure, never a code's.
 */
export function askedText(asked: string, source: 'given' | 'assumed' | null): string {
  return english(saids.asked(asked, source))
}

/** BRF-3: the building stands nearer an edge of its plot than the set-back asked for. */
export function setbackShortText(distance: string, boundary: string, asked: string, source: 'given' | 'assumed' | null): string {
  return english(saids.setbackShort(distance, boundary, asked, source))
}

/** BRF-3: the building reaches past an edge of its plot. */
export function overBoundaryText(past: string, boundary: string): string {
  return english(saids.overBoundary(past, boundary))
}

/** The same wordings as report lines. */
export const messages = {
  noExit: (floor: string): string => english(saids.noExit(floor)),
  roomWithoutDoor: (room: string): string => english(saids.roomWithoutDoor(room)),
  noRoute: (room: string): string => english(saids.noRoute(room)),
  noRouteToAnyDoorOut: (room: string): string => english(saids.noRouteToAnyDoorOut(room)),
  noStairs: (floor: string): string => english(saids.noStairs(floor)),
  outOfLine: (...args: Parameters<typeof saids.outOfLine>): string => english(saids.outOfLine(...args)),
  wayOutNotDrawn: (floor: string): string => english(saids.wayOutNotDrawn(floor)),
  cannotBeDrawn: (floor: string, rooms: readonly string[], openings: readonly string[]): string =>
    english(rooms.length > 0 ? saids.roomsNotDrawn(floor, rooms) : saids.doorsNotDrawn(floor, openings)),
  doorToUndrawnSpace: (room: string): string => english(saids.doorToUndrawnSpace(room)),
  doorOutAboveGround: (room: string, height: string): string => english(saids.doorOutAboveGround(room, height)),
  belowGround: (...args: Parameters<typeof saids.belowGround>): string => english(saids.belowGround(...args)),
  openingTooSmall: (room: string): string => english(saids.openingTooSmall(room))
}
