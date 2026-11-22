/**
 * How a plan looks: its named looks, their colours, line widths and typeface, as final values.
 *
 * A look (SHT-1) is a named set of values that the one drawing function, `planScene`, applies
 * to the same geometry. Nothing here measures the plan: a look only says how each part the
 * core works out is drawn.
 *
 * - `working`: the screen and every picture an agent gets. The app's colours, clear labels and
 *   strong contrast, with lines in screen pixels.
 * - `technical`: sheets and files to hand on. Black on white, cut walls outlined heaviest with a
 *   grey tone inside, windows as a break in the wall with two face lines and a glass line, and a
 *   door with no stated swing marked as undecided. Its lines are in millimetres on paper, from a
 *   pen set chosen by the output scale (1:50, 1:100 or 1:200).
 * - `dark`: the working look on dark paper, as the app's dark theme.
 *
 * The app's stylesheets (`plan-tokens.css`, `canvas2d/plan.css`) say the working look again in
 * CSS. A test reads both sheets and checks every value here against them, so a restyle that
 * changes one and not the other fails.
 *
 * Pure: no DOM.
 */

/** A look's colours. */
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

/** The parts of the drawing a look gives a line width. */
export type LinePart =
  | 'wallOutline'
  | 'virtual'
  | 'opening'
  | 'jamb'
  | 'step'
  | 'fixture'
  | 'doorLeaf'
  | 'doorArc'
  | 'dimension'
  | 'extension'
  | 'leader'
  | 'windowFace'
  | 'glass'
  | 'undecided'

/** The parts of the drawing a look gives a dash pattern. */
export type DashPart = 'virtual' | 'roomDimension' | 'undecided'

/** Lines for the screen: widths and dashes in screen pixels, whatever the zoom. */
export interface ScreenLines {
  readonly unit: 'px'
  readonly widths: Readonly<Record<LinePart, number>>
  readonly dashes: Readonly<Record<DashPart, readonly number[]>>
}

/** The output scales a paper look has a pen set for: 1:50, 1:100 and 1:200. */
export const PAPER_SCALES = [50, 100, 200] as const
export type PaperScale = (typeof PAPER_SCALES)[number]

/** The pens of a paper look, heaviest first. */
export type Pen = 'cut' | 'medium' | 'fine' | 'finest'

/**
 * Lines for paper: each part is drawn with one pen, and each output scale has its own pen set,
 * in millimetres on the paper. Dashes are millimetres on the paper too.
 */
export interface PaperLines {
  readonly unit: 'mm'
  readonly pens: Readonly<Record<PaperScale, Readonly<Record<Pen, number>>>>
  readonly pen: Readonly<Record<LinePart, Pen>>
  readonly dashes: Readonly<Record<DashPart, readonly number[]>>
}

/** A named look: every value the drawing function needs to draw a plan one way. */
export interface Look {
  readonly name: string
  readonly colors: PlanLook
  readonly lines: ScreenLines | PaperLines
  /** The colour of the thin lines: door leaves, swings, jambs, steps and window lines. */
  readonly ink: string
  /**
   * The colour of the heavy outline round every cut wall, with the wall's own colour as a tone
   * inside it; `null` draws walls solid, with no outline.
   */
  readonly wallOutline: string | null
  /** Windows as a break in the wall, bridged by two face lines and a glass line, not a tint. */
  readonly glass: boolean
  /** A door with no stated hinge or swing gets its own "undecided" mark, not a plain gap. */
  readonly undecidedDoors: boolean
}

/** The names a look is chosen by. */
export const LOOK_NAMES = ['working', 'technical', 'dark'] as const
export type LookName = (typeof LOOK_NAMES)[number]

/** The working look's lines: `LINE_PX`, the app's own, and the parts only other looks draw. */
const SCREEN_LINES: ScreenLines = {
  unit: 'px',
  widths: {
    wallOutline: 0,
    virtual: LINE_PX.virtual,
    opening: LINE_PX.opening,
    jamb: LINE_PX.jamb,
    step: LINE_PX.step,
    fixture: LINE_PX.fixture,
    doorLeaf: LINE_PX.doorLeaf,
    doorArc: LINE_PX.doorArc,
    dimension: LINE_PX.dimension,
    extension: LINE_PX.extension,
    leader: LINE_PX.leader,
    windowFace: LINE_PX.opening,
    glass: LINE_PX.opening,
    undecided: LINE_PX.opening
  },
  dashes: { virtual: LINE_PX.virtualDash, roomDimension: LINE_PX.roomDimensionDash, undecided: [4, 3] }
}

/**
 * The technical look's pens, in millimetres on paper: Grid's own choice from the usual pen
 * sizes, four weights, one step finer for each halving of the scale.
 */
export const PAPER_PENS: PaperLines['pens'] = {
  50: { cut: 0.7, medium: 0.35, fine: 0.25, finest: 0.18 },
  100: { cut: 0.5, medium: 0.25, fine: 0.18, finest: 0.13 },
  200: { cut: 0.35, medium: 0.18, fine: 0.13, finest: 0.1 }
}

const PAPER_LINES: PaperLines = {
  unit: 'mm',
  pens: PAPER_PENS,
  pen: {
    wallOutline: 'cut',
    virtual: 'fine',
    opening: 'fine',
    jamb: 'fine',
    step: 'medium',
    fixture: 'finest',
    doorLeaf: 'medium',
    doorArc: 'finest',
    dimension: 'finest',
    extension: 'finest',
    leader: 'finest',
    windowFace: 'fine',
    glass: 'fine',
    undecided: 'fine'
  },
  dashes: { virtual: [2, 1.2], roomDimension: [0.8, 0.8], undecided: [1, 0.8] }
}

/** Black on white: the technical look's colours. Walls are a grey tone inside a black outline. */
export const TECHNICAL_COLORS: PlanLook = {
  paper: '#ffffff',
  room: '#ffffff',
  wall: '#8c8c8c',
  wallExterior: '#8c8c8c',
  virtual: '#595959',
  window: '#ffffff',
  label: '#000000',
  labelSoft: '#3c3c3c',
  dimension: '#000000',
  dimensionSoft: '#595959',
  dimensionText: '#000000',
  dimensionSoftText: '#3c3c3c',
  warning: '#000000',
  font: PICTURE_FONT
}

/** The screen and every picture an agent gets: the app's light theme. */
export const WORKING_LOOK: Look = {
  name: 'working',
  colors: LIGHT_LOOK,
  lines: SCREEN_LINES,
  ink: LIGHT_LOOK.wall,
  wallOutline: null,
  glass: false,
  undecidedDoors: false
}

/** The working look on dark paper: the app's dark theme. */
export const DARK_WORKING_LOOK: Look = { ...WORKING_LOOK, name: 'dark', colors: DARK_LOOK, ink: DARK_LOOK.wall }

/** Sheets and files to hand on: black on white, with lines in millimetres on paper. */
export const TECHNICAL_LOOK: Look = {
  name: 'technical',
  colors: TECHNICAL_COLORS,
  lines: PAPER_LINES,
  ink: '#000000',
  wallOutline: '#000000',
  glass: true,
  undecidedDoors: true
}

export const LOOKS: Readonly<Record<LookName, Look>> = {
  working: WORKING_LOOK,
  technical: TECHNICAL_LOOK,
  dark: DARK_WORKING_LOOK
}

/** Colours of your own, drawn the working way. */
export function lookWithColors(colors: PlanLook): Look {
  return { ...WORKING_LOOK, name: 'custom', colors, ink: colors.wall }
}

/** How long a CSS pixel is on paper, in millimetres: 96 to the inch. */
export const PX_MM = 25.4 / 96

/**
 * The scale a picture is drawn at, as N in 1:N, when each of its pixels is a CSS pixel on paper
 * and measures `metresPerPixel` of the plan.
 */
export function paperScaleOf(metresPerPixel: number): number {
  return (metresPerPixel * 1000) / PX_MM
}

/**
 * The pen set for a scale: the one of 1:50, 1:100 and 1:200 it is nearest to, by ratio, so 1:70
 * draws with the 1:50 pens and 1:150 with the 1:200 pens.
 */
export function penSetFor(scale: number): PaperScale {
  if (scale <= Math.sqrt(50 * 100)) return 50
  if (scale <= Math.sqrt(100 * 200)) return 100
  return 200
}

/** Every line width and dash of a look, in plan metres, for one zoom and output scale. */
export interface LineMetres {
  readonly width: (part: LinePart) => number
  readonly dash: (part: DashPart) => readonly number[]
}

/**
 * A look's line widths and dashes in plan metres. A screen look's pixels are times the metres
 * per pixel; a paper look's millimetres are times the scale, read from the pen set for it.
 * `paperScale` is N in 1:N; left out, it is the picture's own (`paperScaleOf`).
 */
export function lineMetres(look: Look, metresPerPixel: number, paperScale?: number): LineMetres {
  const { lines } = look
  if (lines.unit === 'px') {
    return {
      width: (part) => lines.widths[part] * metresPerPixel,
      dash: (part) => lines.dashes[part].map((value) => value * metresPerPixel)
    }
  }
  const scale = paperScale ?? paperScaleOf(metresPerPixel)
  const pens = lines.pens[penSetFor(scale)]
  const metres = (mm: number): number => (mm * scale) / 1000
  return {
    width: (part) => metres(pens[lines.pen[part]]),
    dash: (part) => lines.dashes[part].map(metres)
  }
}

/** A look by itself, or colours of your own, which are drawn the working way. */
export function toLook(look: Look | PlanLook): Look {
  return 'colors' in look ? look : lookWithColors(look)
}
