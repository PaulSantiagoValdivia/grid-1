/**
 * Pictures of a plan without a browser or the app. Pure: no DOM, no React.
 *
 * `planToSvg(plan, options)` returns one floor as an SVG file with its colours, line widths
 * and font written in. Its elements are the ones the app's 2D view draws. For PNG, see
 * `drawPlan` in the `ongrid` package.
 */
export { planToSvg, planPicture, pictureView, pictureToSvg, DEFAULT_WIDTH } from './planSvg'
export type { PictureOptions, Picture } from './planSvg'
export { LIGHT_LOOK, DARK_LOOK, PICTURE_FONT } from './look'
export type { PlanLook } from './look'
export type { LabelStyle } from '../canvas2d/labelPlacement'
