/**
 * CNT-20 (C30): an office's own library, read from the `library` folder beside the plan: every
 * `.json` file in it, in name order, each `{ "version": "1", "items": [...], "rooms": [...] }`
 * (`LibraryFileSchema`). A file that can't be read is named with why and left out; the others are
 * read. The folder is inside the project, as every file Grid reads is (`fs/projectFiles.ts`): an
 * office keeps its library in each project, copied or checked out there.
 */
import path from 'path'
import { LibraryFileSchema, planLibrary, type Library, type OfficeFile } from '@ongrid/floorplan/library'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { PathRefused, type Project } from '../fs/projectFiles'
import { TextNotDecoded } from '../fs/textEncoding'

/** The folder an office's library is kept in, beside the plan. */
export const LIBRARY_FOLDER = 'library'

/** The most Grid reads of one library file, and the most files it reads from the folder. */
export const LIBRARY_FILE_MAX_BYTES = 1024 * 1024
export const LIBRARY_FILES_MAX = 100

export interface OfficeLibrary {
  /** The files read, by their path from the project folder. */
  readonly files: readonly OfficeFile[]
  /** A file left out and why, one line each, never repeating its text. */
  readonly problems: readonly string[]
}

/** The `library` folder of a plan file: beside it. */
export function libraryFolderOf(planFile: string): string {
  return path.join(path.dirname(planFile), LIBRARY_FOLDER)
}

const where = (issuePath: readonly (string | number)[]): string =>
  issuePath.reduce<string>((text, key) => (typeof key === 'number' ? `${text}[${key}]` : text === '' ? key : `${text}.${key}`), '')

/** The office's library beside a plan: empty, with no problem, when there is no folder. */
export function readOfficeLibrary(project: Project, planFile: string): OfficeLibrary {
  const folder = libraryFolderOf(planFile)
  const names = project.folderNames(folder).filter((name) => name.toLowerCase().endsWith('.json'))
  const files: OfficeFile[] = []
  const problems: string[] = []
  if (names.length > LIBRARY_FILES_MAX) problems.push(`the library folder holds ${names.length} files; Grid reads the first ${LIBRARY_FILES_MAX}, by name`)
  for (const name of names.slice(0, LIBRARY_FILES_MAX)) {
    const file = path.join(folder, name)
    const shown = `${LIBRARY_FOLDER}/${name}`
    let text: string
    try {
      text = project.readText(file, LIBRARY_FILE_MAX_BYTES).text
    } catch (error) {
      if (error instanceof PathRefused) {
        problems.push(`${shown} is outside the project folder`)
        continue
      }
      if (error instanceof TextNotDecoded) {
        problems.push(`${shown}: ${error.message.split('\n')[0]}`)
        continue
      }
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'EISDIR') continue
      if (code === 'EFBIG') problems.push(`${shown} is larger than ${LIBRARY_FILE_MAX_BYTES / 1024 / 1024} MB, the most Grid reads in a library file`)
      else if (code === 'EACCES' || code === 'EPERM') problems.push(`${shown} can't be read: permission denied`)
      else throw error
      continue
    }
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      // The parser's message quotes the text around the fault, and the text is the office's.
      problems.push(`${shown} is not JSON`)
      continue
    }
    const read = LibraryFileSchema.safeParse(raw)
    if (!read.success) {
      const first = read.error.issues[0]!
      const at = where(first.path)
      problems.push(`${shown} is not a library file: ${at === '' ? '' : `${at}: `}${first.code === 'unrecognized_keys' ? `holds ${first.keys.length === 1 ? 'a field' : 'fields'} a library file does not have` : first.message.toLowerCase()}`)
      continue
    }
    files.push({ file: project.relative(project.resolve(file)), items: read.data.items ?? [], rooms: read.data.rooms ?? [] })
  }
  return { files, problems }
}

/** The library a plan places from: its own entries, the office's beside it, then Grid's. */
export function libraryFor(project: Project, planFile: string, plan: Pick<FloorPlan, 'library'>): { readonly library: Library; readonly problems: readonly string[] } {
  const office = readOfficeLibrary(project, planFile)
  const library = planLibrary(plan, office.files)
  const repeated = library.repeated.map((r) => `${r.file} names ${JSON.stringify(r.name)} again; the first is kept`)
  return { library, problems: [...office.problems, ...repeated] }
}
