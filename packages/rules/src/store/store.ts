/**
 * The build location and the rules sheet of each project, on this computer only.
 *
 *   <root>/locations.json        { [projectId]: { municipality, country } }
 *   <root>/sheets/<projectId>.json
 *   <root>/runs/                 one folder per lookup, deleted after it
 *
 * `root` is the caller's choice. Keep it outside the project folder, so a backup of the
 * project never carries them. Files are written atomically, readable by this user only. A
 * file that doesn't parse is moved aside as `.bak-<time>` and reads as none.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'fs'
import { join } from 'path'
import { z } from 'zod'
import { atomicWriteJson } from './atomicWrite'
import { RulesLocationSchema, RulesSheetSchema, type RulesLocation, type RulesSheet } from '../sheet/rulesSheet'

/** Project ids are UUIDs; anything else never names a file. */
export const PROJECT_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/

export function assertProjectId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !PROJECT_ID_PATTERN.test(id)) throw new Error('Invalid project id')
}

const LocationsSchema = z.record(z.string().regex(PROJECT_ID_PATTERN), RulesLocationSchema)

export class RulesStore {
  constructor(private readonly root: string) {}

  runsDir(): string {
    return join(this.root, 'runs')
  }

  getLocation(projectId: string): RulesLocation | null {
    assertProjectId(projectId)
    return this.readLocations()[projectId] ?? null
  }

  setLocation(projectId: string, location: RulesLocation): void {
    assertProjectId(projectId)
    const locations = this.readLocations()
    this.writeLocations({ ...locations, [projectId]: RulesLocationSchema.parse(location) })
  }

  /** Clears the location and deletes the sheet with it. */
  clearLocation(projectId: string): void {
    assertProjectId(projectId)
    const locations = this.readLocations()
    if (projectId in locations) {
      this.writeLocations(Object.fromEntries(Object.entries(locations).filter(([id]) => id !== projectId)))
    }
    this.deleteSheet(projectId)
  }

  getSheet(projectId: string): RulesSheet | null {
    assertProjectId(projectId)
    const file = this.sheetPath(projectId)
    if (!existsSync(file)) return null
    return this.readOrSetAside(file, (raw) => RulesSheetSchema.parse(raw), null)
  }

  setSheet(projectId: string, sheet: RulesSheet): void {
    assertProjectId(projectId)
    const parsed = RulesSheetSchema.parse(sheet)
    this.ensureDir(join(this.root, 'sheets'))
    atomicWriteJson(this.sheetPath(projectId), parsed)
  }

  /** Deletes the sheet and any copy of it set aside. */
  deleteSheet(projectId: string): void {
    assertProjectId(projectId)
    const dir = join(this.root, 'sheets')
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      if (name === `${projectId}.json` || name.startsWith(`${projectId}.json.bak-`)) {
        rmSync(join(dir, name), { force: true })
      }
    }
  }

  private sheetPath(projectId: string): string {
    return join(this.root, 'sheets', `${projectId}.json`)
  }

  private readLocations(): Record<string, RulesLocation> {
    const file = join(this.root, 'locations.json')
    if (!existsSync(file)) return {}
    return this.readOrSetAside(file, (raw) => LocationsSchema.parse(raw), {})
  }

  private writeLocations(locations: Record<string, RulesLocation>): void {
    this.ensureDir(this.root)
    atomicWriteJson(join(this.root, 'locations.json'), locations)
  }

  private readOrSetAside<T>(file: string, parse: (raw: unknown) => T, none: T): T {
    try {
      return parse(JSON.parse(readFileSync(file, 'utf8')))
    } catch {
      try {
        renameSync(file, `${file}.bak-${Date.now()}`)
      } catch {
        // A file that can't be moved still reads as none.
      }
      return none
    }
  }

  private ensureDir(dir: string): void {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
}
