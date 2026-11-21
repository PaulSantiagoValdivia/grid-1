/**
 * The names the view tool takes, apart from the drawing code, which is loaded only when a
 * picture is drawn: it brings Three and React with it.
 */

export const LOOKS = ['light', 'dark', 'mono'] as const
export type LookName = (typeof LOOKS)[number]

export const SIDES = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'above'] as const
export type Side = (typeof SIDES)[number]
