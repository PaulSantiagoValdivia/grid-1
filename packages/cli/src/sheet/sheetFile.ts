/**
 * VEW-7: the files of `grid sheet` and `grid_sheet`. The words are read from `sheet.json`
 * beside the plan, or from the file named; the PDF goes into `exports/` beside the plan, or to
 * the file named. Every file goes through the project (`projectFiles.ts`).
 */
import path from 'path'
import { planFloors } from '@ongrid/floorplan/geometry'
import { parseSheetWords, SheetWordsRefused, type SheetWords } from '@ongrid/floorplan/types/sheet'
import { exportBaseOf, writeBesidePlan } from '../command/export'
import { loadPlan, PlanRefused, type LoadedPlan } from '../command/plan'
import { UsageError } from '../command/options'
import { askedLanguage, languageFor } from '../command/language'
import type { Language } from '@ongrid/floorplan/messages'
import { quoted, type Project } from '../fs/projectFiles'
import { sheetPages, SHEET_LAYOUTS, type SheetLayout } from './pages'
import { sheetPdf } from './pdf'

export const SHEET_FILE = 'sheet.json'
const SHEET_FILE_MAX_BYTES = 64 * 1024

/** `lang`: MSG-11's `--lang`, as given; read with `sheetLanguage`. */
export interface SheetRequest { readonly layout?: string; readonly sheet?: string; readonly out?: string; readonly lang?: string }

/** The language a sheet request asks for (`--lang`), refused by name when Grid does not write it; undefined when none is asked. */
export function sheetLanguage(request: SheetRequest): Language | undefined {
  return askedLanguage(request.lang)
}

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
  sheetLanguage(request)
  return request.layout as SheetLayout
}

/**
 * The file's text. A missing file is no words (null) when `mayBeMissing`, else a refusal. A
 * refusal names the file as `shown`.
 */
function readSheetFile(project: Project, file: string, shown: string, mayBeMissing: boolean): string | null {
  try {
    return project.readText(file, SHEET_FILE_MAX_BYTES).text
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' && mayBeMissing) return null
    if (code === 'ENOENT') throw new PlanRefused(`There is no file ${quoted(shown)}.`)
    if (code === 'EISDIR') throw new PlanRefused(`${quoted(shown)} is a folder, not a sheet file.`)
    if (code === 'EFBIG') throw new PlanRefused(`${quoted(shown)} is larger than ${SHEET_FILE_MAX_BYTES / 1024} KB, the most Grid reads in a sheet file.`)
    throw error
  }
}

/**
 * The words for a client sheet: the file named, else `sheet.json` beside the plan, else none.
 * A file named is called what it was named; the one beside the plan, by its path in the project.
 */
export function readSheetWords(project: Project, planFile: string, loaded: LoadedPlan, given: string | undefined): SheetWords | null {
  const file = given ?? path.join(path.dirname(planFile), SHEET_FILE)
  const shown = given ?? project.relative(project.resolve(file))
  const text = readSheetFile(project, file, shown, given === undefined)
  if (text === null) return null
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new PlanRefused(`${quoted(shown)} is not JSON.`)
  }
  try {
    return parseSheetWords(raw, planFloors(loaded.plan).map((floor) => floor.id))
  } catch (error) {
    if (error instanceof SheetWordsRefused) throw new PlanRefused(`${quoted(shown)} is not a sheet: ${error.message}.`)
    throw error
  }
}

/** A sheet made and not yet written: the plan as read, the PDF and its laid-out pages. */
export interface MadeSheet {
  readonly loaded: LoadedPlan
  readonly pdf: Uint8Array
  /** What is on each page; a floor page, or its continuation, also says which floor. */
  readonly pages: readonly { readonly kind: string; readonly title: string | null; readonly floor?: string }[]
  /** The name of the file in `exports/`, and why Grid changed the sheet's name, when it did. */
  readonly fileName: string
  readonly note?: string
}

/**
 * Reads the plan and makes the sheet. `grid sheet --out` writes it where it is told. MSG-11: its
 * words are in `language` when one is asked for, else the plan's own (`display.language`), else
 * English.
 */
export async function makeSheet(project: Project, planFile: string, layout: SheetLayout, words: SheetWords | null, language?: Language): Promise<MadeSheet> {
  const loaded = loadPlan(project, planFile)
  const { base, note } = exportBaseOf(planFile)
  const sheet = sheetPages(loaded, words, layout, { name: base, date: new Date(), language: await languageFor(language, loaded.plan) })
  // The laid-out sheet is the one written: text that did not fit flows onto continuation pages.
  const { pdf, sheet: laidOut } = await sheetPdf(loaded.plan, sheet)
  const pages = laidOut.pages.map((page) => (page.floor === null ? { kind: page.kind, title: page.title } : { kind: page.kind, title: page.title, floor: page.floor }))
  const fileName = `${base}-${layout}.pdf`
  return note === undefined
    ? { loaded, pdf, pages, fileName }
    // The name the sheet shows and its file in exports/ start with: true of --out as well.
    : { loaded, pdf, pages, fileName, note: `Named the sheet ${base}: ${note}.` }
}

export interface SheetDone {
  readonly loaded: LoadedPlan
  /** The real path written. */
  readonly written: string
  readonly pages: MadeSheet['pages']
  readonly note?: string
}

/**
 * Makes the sheet and writes it into `exports/` beside the plan, replacing an earlier copy, as
 * `grid export` writes its files. The command and the tool server both call this.
 */
export async function sheetIntoProject(project: Project, planFile: string, layout: SheetLayout, words: SheetWords | null, language?: Language): Promise<SheetDone> {
  const { loaded, pdf, pages, fileName, note } = await makeSheet(project, planFile, layout, words, language)
  const written = writeBesidePlan(project, planFile, fileName, pdf)
  return note === undefined ? { loaded, written, pages } : { loaded, written, pages, note }
}
