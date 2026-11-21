/**
 * VEW-7: the files of `grid sheet` and `grid_sheet`. The words are read from `sheet.json`
 * beside the plan, or from the file named; the PDF goes into `exports/` beside the plan, or to
 * the file named. Every file goes through the project (`projectFiles.ts`).
 */
import path from 'path'
import { planFloors } from '@ongrid/floorplan/geometry'
import { parseSheetWords, SheetWordsRefused, type SheetWords } from '@ongrid/floorplan/types/sheet'
import { exportBaseOf } from '../command/export'
import { loadPlan, PlanRefused, type LoadedPlan } from '../command/plan'
import { UsageError } from '../command/options'
import { writeProjectExport } from '../export/projectExports'
import { quoted, type Project } from '../fs/projectFiles'
import { sheetPages, SHEET_LAYOUTS, type SheetLayout } from './pages'
import { sheetPdf } from './pdf'

export const SHEET_FILE = 'sheet.json'
const SHEET_FILE_MAX_BYTES = 64 * 1024

export interface SheetRequest { readonly layout?: string; readonly sheet?: string; readonly out?: string }

export function checkSheetRequest(request: SheetRequest): SheetLayout {
  const layouts = SHEET_LAYOUTS.join(' or ')
  if (request.layout === undefined) throw new UsageError(`sheet needs --layout: ${layouts}.`)
  if (!(SHEET_LAYOUTS as readonly string[]).includes(request.layout)) throw new UsageError(`--layout takes ${layouts}.`)
  if (request.layout === 'check' && request.sheet !== undefined) {
    throw new UsageError('--sheet gives the words of a client sheet; a check sheet takes none: leave --sheet out.')
  }
  if (request.out !== undefined && path.extname(request.out).toLowerCase() !== '.pdf') {
    throw new UsageError('--out must name a .pdf file.')
  }
  return request.layout as SheetLayout
}

function readNamedFile(project: Project, file: string): string {
  try {
    return project.readText(file, SHEET_FILE_MAX_BYTES).text
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') throw new PlanRefused(`There is no file ${quoted(file)}.`)
    if (code === 'EISDIR') throw new PlanRefused(`${quoted(file)} is a folder, not a sheet file.`)
    if (code === 'EFBIG') throw new PlanRefused(`${quoted(file)} is larger than ${SHEET_FILE_MAX_BYTES / 1024} KB, the most Grid reads in a sheet file.`)
    throw error
  }
}

/** The words for a client sheet: the file named, else `sheet.json` beside the plan, else none. */
export function readSheetWords(project: Project, planFile: string, loaded: LoadedPlan, given: string | undefined): SheetWords | null {
  const file = given ?? path.join(path.dirname(planFile), SHEET_FILE)
  const text = given === undefined ? project.readTextIfThere(file) : readNamedFile(project, file)
  if (text === null) return null
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new PlanRefused(`${quoted(file)} is not JSON.`)
  }
  try {
    return parseSheetWords(raw, planFloors(loaded.plan).map((floor) => floor.id))
  } catch (error) {
    if (error instanceof SheetWordsRefused) throw new PlanRefused(`${quoted(file)} is not a sheet: ${error.message}.`)
    throw error
  }
}

export interface SheetDone {
  readonly written: string
  readonly pages: readonly { readonly kind: string; readonly title: string | null }[]
  readonly note?: string
}

export async function sheetIntoProject(project: Project, planFile: string, layout: SheetLayout, words: SheetWords | null, out?: string): Promise<SheetDone> {
  const loaded = loadPlan(project, planFile)
  const { base, note } = exportBaseOf(planFile)
  const sheet = sheetPages(loaded, words, layout, { name: base, date: new Date() })
  // The laid-out sheet is the one written: text that did not fit flows onto continuation pages.
  const { pdf, sheet: laidOut } = await sheetPdf(loaded.plan, sheet)
  const written = out === undefined
    ? writeProjectExport(project, path.dirname(planFile), `${base}-${layout}.pdf`, pdf)
    : project.writeFile(out, pdf)
  const pages = laidOut.pages.map((page) => ({ kind: page.kind, title: page.title }))
  return note === undefined ? { written, pages } : { written, pages, note: `Named the sheet ${base}-${layout}.pdf: ${note}.` }
}
