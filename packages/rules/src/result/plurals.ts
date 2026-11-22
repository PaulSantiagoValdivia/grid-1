/**
 * MSG-5 (lab MS-14): how a finding's English wording reads for several rooms at once, part by
 * part: the words that change, singular then plural. MSG-11: the words of a line for several
 * rooms are the message files' `.many` wordings (`check.roomWithoutDoor.many`, …), in every
 * language; this table is the English of that change, which a test reads a line back with, so a
 * line for several rooms keeps its code's one wording.
 */
export const PLURALS: readonly (readonly [singular: string, plural: string])[] = [
  ['The window of ', 'The windows of '],
  ['A door from ', 'Doors from '],
  ['An opening from ', 'Openings from '],
  [' has no ', ' have no '],
  [' is too ', ' are too '],
  [' is under ', ' are under '],
  [' leads ', ' lead '],
  ['so it is not a way', 'so they are not ways']
]
