/**
 * SHT-6: the papers and scales of a sheet at a true scale, apart from its layout, so the command
 * and the tool server can check a request without loading the drawing (`drawingSheet.ts`, a
 * chunk of its own in the built file).
 */

/** The papers a sheet is printed on, in millimetres, short side first (ISO 216). */
export const PAPERS = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  A2: { width: 420, height: 594 },
  A1: { width: 594, height: 841 },
  A0: { width: 841, height: 1189 },
} as const
export type PaperName = keyof typeof PAPERS
export const PAPER_NAMES = Object.keys(PAPERS) as PaperName[]

/** The scales tried, in turn, when none is asked for: 1:100 first, as the card's prototype. */
export const SCALES_TRIED = [100, 200, 500] as const
/** The scales offered when a floor does not fit: the usual ones for a building. */
export const COMMON_SCALES = [20, 25, 50, 100, 200, 250, 500, 1000] as const
/** The largest N a scale may have: 1:1000, as the DXF's sheet allows. */
export const SCALE_MAX = 1000

/** The scale as written on the sheet: `1:100`. */
export const scaleText = (scale: number): string => `1:${scale}`
