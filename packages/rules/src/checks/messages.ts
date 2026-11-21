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
  /** `country` as the caller stated it. */
  noFiguresForPlace: (what: FigureSubject, country: string): WordingPart[] => [
    words(`${what} were not checked: the figures here are from US model codes, and this plan is for ${country}`)
  ]
}

/** The same wordings as report lines. */
export const messages = {
  roomTooSmall: (room: string, minimum: number): string => wordingText(wordings.roomTooSmall(room, minimum)),
  noEscapeOpening: (room: string): string => wordingText(wordings.noEscapeOpening(room)),
  escapeWindowTooSmall: (room: string): string => wordingText(wordings.escapeWindowTooSmall(room)),
  escapeWindowTooHigh: (room: string): string => wordingText(wordings.escapeWindowTooHigh(room)),
  noUse: (floor: string, count: number): string => wordingText(wordings.noUse(floor, count)),
  noFiguresForPlace: (what: FigureSubject, country: string): string => wordingText(wordings.noFiguresForPlace(what, country))
}
