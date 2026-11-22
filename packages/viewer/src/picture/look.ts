/**
 * How a plan looks on paper: its colours, line widths and typeface, as final values.
 *
 * The app's stylesheets (`plan-tokens.css`, `canvas2d/plan.css`) say the same thing in CSS.
 * A test reads both sheets and checks every value here against them, so a restyle that
 * changes one and not the other fails.
 *
 * Pure: no DOM.
 */

export interface PlanLook {
  readonly paper: string
  readonly room: string
  readonly wall: string
  readonly wallExterior: string
  readonly virtual: string
  readonly window: string
  readonly label: string
  readonly labelSoft: string
  readonly dimension: string
  readonly dimensionSoft: string
  readonly dimensionText: string
  readonly dimensionSoftText: string
  readonly warning: string
  /** A CSS font-family list. The first one installed is used. */
  readonly font: string
}

/**
 * Sans-serif faces found on macOS, Windows and most Linux machines, in that order. The app
 * uses its own `--font-sans`, which a picture cannot see.
 */
export const PICTURE_FONT = "Helvetica, Arial, 'Liberation Sans', 'DejaVu Sans', sans-serif"

/** The light theme, from `plan-tokens.css`. */
export const LIGHT_LOOK: PlanLook = {
  paper: '#ffffff',
  room: '#f2efe7',
  wall: '#232320',
  wallExterior: '#121210',
  virtual: '#b3afa2',
  window: '#dce9f2',
  label: '#232320',
  labelSoft: '#75726a',
  dimension: '#6f6c63',
  dimensionSoft: '#a9a598',
  dimensionText: '#4a483f',
  dimensionSoftText: '#75726a',
  warning: '#b4531a',
  font: PICTURE_FONT
}

/** The dark theme, from `plan-tokens.css`. */
export const DARK_LOOK: PlanLook = {
  paper: '#15150f',
  room: '#23201a',
  wall: '#ddd8cc',
  wallExterior: '#f3f1ec',
  virtual: '#635a4d',
  window: '#22323d',
  label: '#ddd8cc',
  labelSoft: '#8a8175',
  dimension: '#a9a598',
  dimensionSoft: '#635a4d',
  dimensionText: '#c9c4b6',
  dimensionSoftText: '#8a8175',
  warning: '#f2a774',
  font: PICTURE_FONT
}

/**
 * Line widths and dashes in screen pixels, from `plan.css`. The app keeps them at this size
 * whatever the zoom with `vector-effect: non-scaling-stroke`; a picture has one zoom, so it
 * writes them in metres instead (pixels times metres per pixel).
 */
export const LINE_PX = {
  virtual: 1.5,
  virtualDash: [7, 5],
  opening: 1,
  jamb: 1,
  /** A step between rooms at different levels (LVL-7). */
  step: 1.5,
  /** A stair's flights, landings, risers and walking line (LVL-3). */
  stair: 0.75,
  /** How long the head of a stair's arrow is. */
  stairArrow: 8,
  /** A fixture's symbol (CNT-12). */
  fixture: 0.75,
  doorLeaf: 1.5,
  doorArc: 0.75,
  dimension: 1,
  extension: 0.75,
  /** The line from a label moved out of its room back to the room. */
  leader: 0.75,
  roomDimensionDash: [3, 3],
  /** The warning dot's ring. Drawn inside a group already scaled to pixels. */
  warningRing: 1.5,
  /** The halo behind a warning's text. Drawn inside a group already scaled to pixels. */
  warningHalo: 4
} as const

/** Font sizes in screen pixels, from `plan.css`. */
export const TEXT_PX = {
  roomName: 13,
  roomArea: 11,
  dimension: 11,
  roomDimension: 10,
  warning: 12
} as const

/** A length for an attribute: short, and the same on every machine. */
export function lengthText(value: number): string {
  return String(Number(value.toPrecision(4)))
}
