/**
 * The names the view tool takes, apart from the drawing code, which is loaded only when a
 * picture is drawn: it brings Three and React with it.
 */

/**
 * The looks a plan view is drawn in (SHT-1): `working`, the default for every picture an agent
 * gets, `technical`, black on white as on a sheet, and `dark`. `light` and `mono` are the older
 * names for `working` and `technical`, still taken.
 */
export const LOOKS = ['working', 'technical', 'dark', 'light', 'mono'] as const
export type LookName = (typeof LOOKS)[number]

/** The look an older name stands for. */
export function namedLook(look: LookName): 'working' | 'technical' | 'dark' {
  return look === 'light' ? 'working' : look === 'mono' ? 'technical' : look
}

export const SIDES = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'above'] as const
export type Side = (typeof SIDES)[number]
