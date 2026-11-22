/**
 * Pictures of a plan without a browser or the app. Pure: no DOM, no React.
 *
 * `planToSvg(plan, options)` returns one floor as an SVG file with its colours, line widths
 * and font written in. Its elements are the ones the app's 2D view draws. For PNG, see
 * `drawPlan` in the `ongrid` package.
 */
export { planToSvg, planPicture, pictureView, pictureToSvg, lookOf, undecidedDoorsOf, fullHeight, DEFAULT_WIDTH } from './planSvg'
export type { PictureOptions, Picture, PictureFileOptions, PictureShow } from './planSvg'
export type { FaultLine, PictureKey } from './faults'
export {
  LIGHT_LOOK,
  DARK_LOOK,
  PICTURE_FONT,
  LOOKS,
  LOOK_NAMES,
  WORKING_LOOK,
  TECHNICAL_LOOK,
  DARK_WORKING_LOOK,
  PAPER_PENS,
  PAPER_SCALES,
  lineMetres,
  paperScaleOf,
  penSetFor
} from './look'
export type { PlanLook, Look, LookName, PaperScale } from './look'
export type { LabelStyle } from '../canvas2d/labelPlacement'
export { comparisonPicture, COMPARISON_COLORS, COMPARISON_LOOK, UNCHANGED_COLORS } from './comparison'
export type { ComparisonPictureOptions } from './comparison'
