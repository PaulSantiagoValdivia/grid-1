import { describe, expect, it, vi } from 'vitest'
import { CadApps, type CadLookup } from '../cadApps'

/** A fake disk: folder → entries, plus the files that exist and the registry's App Paths. */
function fakeLookup(platform: NodeJS.Platform, opts: {
  roots: string[]
  dirs?: Record<string, string[]>
  files?: string[]
  registry?: Record<string, string>
}): CadLookup & { listDir: ReturnType<typeof vi.fn> } {
  const files = new Set(opts.files ?? [])
  return {
    platform,
    roots: opts.roots,
    listDir: vi.fn(async (dir: string) => opts.dirs?.[dir] ?? []),
    isFile: async (path: string) => files.has(path),
    registryDefault: async (key: string) => opts.registry?.[key] ?? null,
  }
}

const APP_PATHS = 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths'

describe('CadApps on macOS', () => {
  const mac = (dirs: Record<string, string[]>) => fakeLookup('darwin', { roots: ['/Applications', '/Users/me/Applications'], dirs })

  it('finds AutoCAD inside the Autodesk folder and SketchUp in its versioned folder', async () => {
    const apps = new CadApps(mac({
      '/Applications': ['Autodesk', 'SketchUp 2024', 'Safari.app'],
      '/Applications/Autodesk': ['AutoCAD 2025'],
      '/Applications/Autodesk/AutoCAD 2025': ['AutoCAD 2025.app', 'Uninstall AutoCAD 2025.app'],
      '/Applications/SketchUp 2024': ['SketchUp.app', 'LayOut.app'],
    }))
    await expect(apps.installed()).resolves.toEqual({ autocad: true, sketchup: true, revit: false })
    await expect(apps.locate('autocad')).resolves.toBe('/Applications/Autodesk/AutoCAD 2025/AutoCAD 2025.app')
    await expect(apps.locate('sketchup')).resolves.toBe('/Applications/SketchUp 2024/SketchUp.app')
  })

  it('picks the newest version when several are installed, and looks in ~/Applications too', async () => {
    const apps = new CadApps(mac({
      '/Users/me/Applications': ['Autodesk'],
      '/Users/me/Applications/Autodesk': ['AutoCAD 2023', 'AutoCAD 2025'],
      '/Users/me/Applications/Autodesk/AutoCAD 2023': ['AutoCAD 2023.app'],
      '/Users/me/Applications/Autodesk/AutoCAD 2025': ['AutoCAD 2025.app'],
    }))
    await expect(apps.locate('autocad')).resolves.toBe('/Users/me/Applications/Autodesk/AutoCAD 2025/AutoCAD 2025.app')
  })

  it('does not mistake viewers, uninstallers or look-alikes for the programs', async () => {
    const apps = new CadApps(mac({
      '/Applications': ['SketchUp Viewer.app', 'AutoCAD Viewer.app', 'Uninstall AutoCAD.app', 'Revit.app'],
    }))
    await expect(apps.installed()).resolves.toEqual({ autocad: false, sketchup: false, revit: false })
  })

  it('never looks inside an app bundle', async () => {
    const lookup = mac({ '/Applications': ['Big.app'], '/Applications/Big.app': ['AutoCAD.app'] })
    await expect(new CadApps(lookup).locate('autocad')).resolves.toBeNull()
    expect(lookup.listDir).not.toHaveBeenCalledWith('/Applications/Big.app')
  })

  it('reports Revit as missing, since it has no Mac version', async () => {
    const lookup = mac({ '/Applications': ['Revit 2025.app'] })
    await expect(new CadApps(lookup).locate('revit')).resolves.toBeNull()
  })
})

describe('CadApps on Windows', () => {
  const PF = 'C:\\Program Files'

  it('reads App Paths first and checks the file is really there', async () => {
    const apps = new CadApps(fakeLookup('win32', {
      roots: [PF],
      registry: {
        [`HKLM\\${APP_PATHS}\\acad.exe`]: 'C:\\Program Files\\Autodesk\\AutoCAD 2025\\acad.exe',
        // A stale entry left by an uninstaller must not count.
        [`HKLM\\${APP_PATHS}\\SketchUp.exe`]: 'C:\\Old\\SketchUp.exe',
      },
      files: ['C:\\Program Files\\Autodesk\\AutoCAD 2025\\acad.exe'],
    }))
    await expect(apps.installed()).resolves.toEqual({ autocad: true, sketchup: false, revit: false })
    await expect(apps.locate('autocad')).resolves.toBe('C:\\Program Files\\Autodesk\\AutoCAD 2025\\acad.exe')
  })

  it('falls back to the usual install folders, newest version first', async () => {
    const apps = new CadApps(fakeLookup('win32', {
      roots: [PF],
      dirs: {
        [`${PF}\\Autodesk`]: ['Revit 2024', 'Revit 2025', 'AutoCAD 2024'],
        [`${PF}\\SketchUp`]: ['SketchUp 2023', 'SketchUp 2024'],
      },
      files: [
        `${PF}\\Autodesk\\Revit 2024\\Revit.exe`, `${PF}\\Autodesk\\Revit 2025\\Revit.exe`,
        `${PF}\\Autodesk\\AutoCAD 2024\\acad.exe`, `${PF}\\SketchUp\\SketchUp 2024\\SketchUp.exe`,
      ],
    }))
    await expect(apps.installed()).resolves.toEqual({ autocad: true, sketchup: true, revit: true })
    await expect(apps.locate('revit')).resolves.toBe(`${PF}\\Autodesk\\Revit 2025\\Revit.exe`)
    await expect(apps.locate('sketchup')).resolves.toBe(`${PF}\\SketchUp\\SketchUp 2024\\SketchUp.exe`)
  })

  it('accepts a quoted App Paths value from the per-user hive', async () => {
    const exe = 'C:\\Users\\me\\SketchUp\\SketchUp.exe'
    const apps = new CadApps(fakeLookup('win32', {
      roots: [PF], registry: { [`HKCU\\${APP_PATHS}\\SketchUp.exe`]: `"${exe}"` }, files: [exe],
    }))
    await expect(apps.locate('sketchup')).resolves.toBe(exe)
  })
})

describe('CadApps failures and caching', () => {
  it('reports nothing installed when the lookup itself fails, instead of throwing', async () => {
    const lookup: CadLookup = {
      platform: 'win32', roots: ['C:\\Program Files'],
      listDir: async () => { throw new Error('EACCES') },
      isFile: async () => { throw new Error('EIO') },
      registryDefault: async () => { throw new Error('reg.exe missing') },
    }
    await expect(new CadApps(lookup).installed()).resolves.toEqual({ autocad: false, sketchup: false, revit: false })
  })

  it('reports nothing on a platform it does not know', async () => {
    const apps = new CadApps(fakeLookup('linux', { roots: ['/opt'], dirs: { '/opt': ['AutoCAD.app'] } }))
    await expect(apps.installed()).resolves.toEqual({ autocad: false, sketchup: false, revit: false })
  })

  it('reuses the answer for a minute, then looks again so a new install shows up', async () => {
    let now = 1_000
    const dirs: Record<string, string[]> = { '/Applications': [] }
    const lookup = fakeLookup('darwin', { roots: ['/Applications'], dirs })
    const apps = new CadApps(lookup, () => now)
    await expect(apps.installed()).resolves.toMatchObject({ sketchup: false })
    dirs['/Applications'] = ['SketchUp.app']
    now += 59_000
    await expect(apps.installed()).resolves.toMatchObject({ sketchup: false })
    now += 2_000
    await expect(apps.installed()).resolves.toMatchObject({ sketchup: true })
  })
})
