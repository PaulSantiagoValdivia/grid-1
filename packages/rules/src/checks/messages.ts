/**
 * The fixed templates the figure checks' messages come from. Plain English, rooms
 * by their names: these lines are shown to the user as they are, so no
 * data-model words, and never anything that reads as "this plan complies".
 */

export const messages = {
  roomTooSmall: (room: string, minimum: number): string => `${room} is under ${minimum} m²`,
  noEscapeOpening: (room: string): string => `${room} has no window or door to escape through`,
  escapeWindowTooSmall: (room: string): string => `${room}'s window is too small to escape through`,
  escapeWindowTooHigh: (room: string): string => `${room}'s window is too high to escape through`,
  /** `floor` only in a plan with more than one. */
  noUse: (floor: string | null, count: number): string => {
    const what =
      count === 1
        ? "1 room that doesn't say what it's for"
        : `${count} rooms that don't say what they're for`
    return floor === null
      ? `Room sizes weren't checked for ${what}`
      : `On ${floor}, room sizes weren't checked for ${what}`
  },
  /** `what` is "Room sizes" or "Escape openings"; `country` as the caller stated it. */
  noFiguresForPlace: (what: string, country: string): string =>
    `${what} were not checked: the figures here are from US model codes, and this plan is for ${country}`
}
