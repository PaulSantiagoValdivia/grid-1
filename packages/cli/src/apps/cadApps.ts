/**
 * Finds AutoCAD, SketchUp and Revit on this computer, to open an export in one of them.
 *
 * Deterministic code over an injected lookup, so tests never depend on what the host has
 * installed.
 *
 * - macOS: the `.app` bundles in /Applications and ~/Applications, up to three folders deep
 *   (AutoCAD installs as /Applications/Autodesk/AutoCAD 2025/AutoCAD 2025.app). Revit has no
 *   Mac version, so it is never found there.
 * - Windows: the registry's App Paths entry for the program's .exe (machine, then user), then
 *   the usual Program Files folders. A path counts only when the file is really there.
 */
import { posix, win32 } from 'path'

export type CadProgram = 'autocad' | 'sketchup' | 'revit'
export type CadInstalled = Record<CadProgram, boolean>

export const CAD_PROGRAMS: readonly CadProgram[] = ['autocad', 'sketchup', 'revit']

export function isCadProgram(value: unknown): value is CadProgram {
  return typeof value === 'string' && (CAD_PROGRAMS as readonly string[]).includes(value)
}

export interface CadLookup {
  readonly platform: NodeJS.Platform
  /** macOS application folders, or Windows Program Files folders. */
  readonly roots: readonly string[]
  /** Entry names in a folder; [] when it is missing, unreadable or not a folder. */
  listDir(dir: string): Promise<string[]>
  isFile(path: string): Promise<boolean>
  /** The default value of a registry key, or null. Only called on Windows. */
  registryDefault(key: string): Promise<string | null>
}

const MAC_BUNDLES: Partial<Record<CadProgram, RegExp>> = {
  autocad: /^AutoCAD(?: LT)?(?: \d{4})?\.app$/,
  sketchup: /^SketchUp(?: \d{4})?\.app$/,
}

interface WindowsInstall {
  readonly exes: readonly string[]
  readonly vendor: string
  readonly folder: RegExp
}

const WINDOWS_INSTALLS: Record<CadProgram, WindowsInstall> = {
  autocad: { exes: ['acad.exe', 'acadlt.exe'], vendor: 'Autodesk', folder: /^AutoCAD(?: LT)?(?: \d{4})?$/i },
  sketchup: { exes: ['SketchUp.exe'], vendor: 'SketchUp', folder: /^SketchUp(?: \d{4})?$/i },
  revit: { exes: ['Revit.exe'], vendor: 'Autodesk', folder: /^Revit(?: \d{4})?$/i },
}

const APP_PATHS = 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths'
const MAC_DEPTH = 3
const CACHE_MS = 60_000

/** Newest first: the highest four-digit year in the path, then the path itself. */
function newest(paths: string[]): string | null {
  const year = (path: string): number => Math.max(0, ...(path.match(/\d{4}/g) ?? []).map(Number))
  return [...paths].sort((a, b) => year(b) - year(a) || b.localeCompare(a))[0] ?? null
}

export class CadApps {
  private cached: { at: number; result: Promise<CadInstalled> } | null = null

  constructor(
    private readonly lookup: CadLookup,
    private readonly now: () => number = Date.now,
  ) {}

  /** Cached for a minute: the menu asks each time it opens, and a new install still shows up. */
  installed(): Promise<CadInstalled> {
    const at = this.now()
    if (!this.cached || at - this.cached.at >= CACHE_MS) {
      const result = Promise.all(CAD_PROGRAMS.map((program) => this.locate(program)))
        .then(([autocad, sketchup, revit]) => ({ autocad: autocad !== null, sketchup: sketchup !== null, revit: revit !== null }))
      this.cached = { at, result }
    }
    return this.cached.result
  }

  /** The program's path, looked up fresh. Null when it isn't installed or the lookup fails. */
  async locate(program: CadProgram): Promise<string | null> {
    try {
      if (this.lookup.platform === 'darwin') return await this.locateMac(program)
      if (this.lookup.platform === 'win32') return await this.locateWindows(program)
    } catch (error) {
      console.error(`[apps] could not look for ${program}:`, error)
    }
    return null
  }

  private async list(dir: string): Promise<string[]> {
    try {
      return await this.lookup.listDir(dir)
    } catch {
      return []
    }
  }

  private async isFile(path: string): Promise<boolean> {
    try {
      return await this.lookup.isFile(path)
    } catch {
      return false
    }
  }

  private async locateMac(program: CadProgram): Promise<string | null> {
    const bundle = MAC_BUNDLES[program]
    if (!bundle) return null
    const found: string[] = []
    const walk = async (dir: string, depth: number): Promise<void> => {
      for (const name of await this.list(dir)) {
        const path = posix.join(dir, name)
        if (name.endsWith('.app')) {
          if (bundle.test(name)) found.push(path)
        } else if (depth < MAC_DEPTH) {
          await walk(path, depth + 1)
        }
      }
    }
    for (const root of this.lookup.roots) await walk(root, 1)
    return newest(found)
  }

  private async locateWindows(program: CadProgram): Promise<string | null> {
    const install = WINDOWS_INSTALLS[program]
    for (const exe of install.exes) {
      for (const hive of ['HKLM', 'HKCU']) {
        let value: string | null = null
        try {
          value = await this.lookup.registryDefault(`${hive}\\${APP_PATHS}\\${exe}`)
        } catch {
          value = null
        }
        const path = value?.trim().replace(/^"(.*)"$/, '$1')
        if (path && win32.isAbsolute(path) && await this.isFile(path)) return path
      }
    }
    const found: string[] = []
    for (const root of this.lookup.roots) {
      const vendorDir = win32.join(root, install.vendor)
      for (const folder of await this.list(vendorDir)) {
        if (!install.folder.test(folder)) continue
        for (const exe of install.exes) {
          const path = win32.join(vendorDir, folder, exe)
          if (await this.isFile(path)) found.push(path)
        }
      }
    }
    return newest(found)
  }
}
