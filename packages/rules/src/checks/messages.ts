/**
 * The one wording of every finding and notice of the figure checks (MSG-1, AU4-1). Plain
 * English, rooms by their names: these lines are shown to the user as they are, so no
 * data-model words, and never anything that reads as "this plan complies".
 *
 * Each wording is written once, as parts (`wordings`): the report's `message` quotes the names
 * (`messages`, MSG-9), and the notes a person reads set them apart. Neither words a finding its
 * own way.
 */

import { figureText, wordingText, type WordingPart } from '@ongrid/floorplan/geometry'

const name = (text: string): WordingPart => ({ text, name: true })
const words = (text: string): WordingPart => ({ text })

/** What a skipped figure check is called in its notice. */
export type FigureSubject = 'Room sizes' | 'Escape openings'

export const wordings = {
  roomTooSmall: (room: string, minimum: number): WordingPart[] => [name(room), words(` is under ${figureText(minimum)} m²`)],
  noEscapeOpening: (room: string): WordingPart[] => [name(room), words(' has no window or door to escape through')],
  escapeWindowTooSmall: (room: string): WordingPart[] => [
    words('The window of '),
    name(room),
    words(' is too small to escape through')
  ],
  escapeWindowTooHigh: (room: string): WordingPart[] => [
    words('The window of '),
    name(room),
    words(' is too high to escape through')
  ],
  /** One wording for one room or many, on one floor or several (MSG-1). */
  noUse: (floor: string, count: number): WordingPart[] => [
    words('On '),
    name(floor),
    words(`, room sizes were not checked in rooms with no use stated: ${count}`)
  ],
  /** `country`: Grid's name for the place, from its list (COD-3), never the text it was given. */
  noFiguresForPlace: (what: FigureSubject, country: string): WordingPart[] => [
    words(`${what} were not checked: the figures here are from US model codes, and this plan is for ${country}`)
  ],
  /** COD-3 (lab W-12): no place is stated; `usLines` is how many lines the US figures give on the plan. */
  noPlace: (usLines: number): WordingPart[] => [
    words(`No place is stated, so no figure was applied: the US figures would have given ${usLines === 0 ? 'no lines' : usLines === 1 ? '1 line' : `${usLines} lines`}`)
  ],
  /** MSG-2 (lab CH-4): `count` bedrooms on a floor above the third storey. */
  aboveEscapeStoreys: (floor: string, count: number): WordingPart[] => [
    words('On '),
    name(floor),
    words(`, escape openings were not checked in bedrooms: the figures here cover bedrooms up to the third storey: ${count}`)
  ],
  /** MSG-2 (lab CH-1): a plan with walls and no rooms. */
  noRooms: (): WordingPart[] => [words('No check that looks at rooms ran: the plan has no rooms')],
  /**
   * CNT-5 (lab EL-2): the plan says it is a kind of building the check's figures were not read
   * for. `readFor` and `building` as a sentence names them: "homes (houses and flats people live
   * in)", "an office".
   */
  notForBuilding: (what: FigureSubject, readFor: string, building: string): WordingPart[] => [
    words(`${what} were not checked: the figures here were read for ${readFor}, and the plan says this is ${building}`)
  ],
  /** CNT-5: the same, for one floor the plan says is that kind. */
  floorNotForBuilding: (floor: string, what: FigureSubject, readFor: string, building: string): WordingPart[] => [
    words('On '),
    name(floor),
    words(`, ${what.toLowerCase()} were not checked: the figures here were read for ${readFor}, and the plan says this floor is ${building}`)
  ]
}

/** The same wordings as report lines. */
export const messages = {
  roomTooSmall: (room: string, minimum: number): string => wordingText(wordings.roomTooSmall(room, minimum)),
  noEscapeOpening: (room: string): string => wordingText(wordings.noEscapeOpening(room)),
  escapeWindowTooSmall: (room: string): string => wordingText(wordings.escapeWindowTooSmall(room)),
  escapeWindowTooHigh: (room: string): string => wordingText(wordings.escapeWindowTooHigh(room)),
  noUse: (floor: string, count: number): string => wordingText(wordings.noUse(floor, count)),
  noFiguresForPlace: (what: FigureSubject, country: string): string => wordingText(wordings.noFiguresForPlace(what, country)),
  noPlace: (usLines: number): string => wordingText(wordings.noPlace(usLines)),
  aboveEscapeStoreys: (floor: string, count: number): string => wordingText(wordings.aboveEscapeStoreys(floor, count)),
  noRooms: (): string => wordingText(wordings.noRooms()),
  notForBuilding: (what: FigureSubject, readFor: string, building: string): string => wordingText(wordings.notForBuilding(what, readFor, building)),
  floorNotForBuilding: (floor: string, what: FigureSubject, readFor: string, building: string): string =>
    wordingText(wordings.floorNotForBuilding(floor, what, readFor, building))
}
