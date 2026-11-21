/**
 * The fixed templates every finding's message comes from. Plain English, rooms
 * by their names: these lines are shown to the user as they are, so no
 * data-model words, and never anything that reads as "this plan complies".
 */

export const messages = {
  noExit: (floor: string): string => `${floor} has no door to the outside`,
  roomWithoutDoor: (room: string): string => `${room} has no door or opening to another space`,
  noRoute: (room: string): string => `${room} has no route to a door to the outside`,
  noRouteToAnyDoorOut: (room: string): string =>
    `${room} has no route to a door to the outside, nor to a door into a space that is not drawn`,
  noStairs: (floor: string): string =>
    `The way out of ${floor} was not checked: the plan has no stairs`,
  wayOutNotDrawn: (floor: string): string =>
    `The way out of ${floor} was not checked: its only door out leads to a space that is not drawn`,
  cannotBeDrawn: (floor: string, rooms: readonly string[]): string =>
    rooms.length > 0
      ? `On ${floor}, ${rooms.join(', ')} could not be drawn and ${rooms.length === 1 ? 'was' : 'were'} not checked`
      : `On ${floor}, some doors could not be drawn and were not checked`,
  doorToUndrawnSpace: (room: string): string =>
    `A door from ${room} leads to a space that is not drawn as a room`
}
