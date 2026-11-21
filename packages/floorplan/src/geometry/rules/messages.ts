/**
 * The fixed templates every finding's message comes from. Plain English, rooms
 * by their names: these lines are shown to the user as they are, so no
 * data-model words, and never anything that reads as "this plan complies".
 * Every name is the plan's text, so it is quoted (MSG-9): a room named with a
 * sentence still reads as a name.
 */

import { quoted, quotedList } from '../../types/planText'

export const messages = {
  noExit: (floor: string): string => `${quoted(floor)} has no door to the outside`,
  roomWithoutDoor: (room: string): string => `${quoted(room)} has no door or opening to another space`,
  noRoute: (room: string): string => `${quoted(room)} has no route to a door to the outside`,
  noRouteToAnyDoorOut: (room: string): string =>
    `${quoted(room)} has no route to a door to the outside, nor to a door into a space that is not drawn`,
  noStairs: (floor: string): string =>
    `The way out of ${quoted(floor)} was not checked: no stair joins it to the ground floor`,
  outOfLine: (
    kind: 'stair' | 'lift',
    upper: readonly string[],
    upperFloors: readonly string[],
    lower: readonly string[],
    lowerFloors: readonly string[]
  ): string =>
    `${kind === 'stair' ? 'The stair' : 'The lift shaft'} ${quotedList(upper, ' and ')} on ${quotedList(upperFloors, ' and ')} ` +
    `does not lie over ${quotedList(lower, ' or ')} on ${quotedList(lowerFloors, ' and ')}, so ` +
    (kind === 'stair' ? 'it does not join the two floors' : 'the shaft is out of line'),
  wayOutNotDrawn: (floor: string): string =>
    `The way out of ${quoted(floor)} was not checked: its only door out leads to a space that is not drawn`,
  cannotBeDrawn: (floor: string, rooms: readonly string[]): string =>
    rooms.length > 0
      ? `On ${quoted(floor)}, ${quotedList(rooms)} could not be drawn and ${rooms.length === 1 ? 'was' : 'were'} not checked`
      : `On ${quoted(floor)}, some doors could not be drawn and were not checked`,
  doorToUndrawnSpace: (room: string): string =>
    `A door from ${quoted(room)} leads to a space that is not drawn as a room`,
  doorOutAboveGround: (room: string, height: string): string =>
    `A door from ${quoted(room)} leads outside ${height} m above the ground, so it is not a way out`
}
