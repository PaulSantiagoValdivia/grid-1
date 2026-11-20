/**
 * The export writer keeps every export inside the plan's own exports folder (lab entry T-9,
 * case 3b, rewritten for the project resolver of CMD-15).
 */
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openProject, type Project } from '../../fs/projectFiles'
import { writeProjectExport } from '../projectExports'

let root: string
let outside: string
let project: Project

beforeEach(() => {
  root = realpathSync.native(mkdtempSync(join(tmpdir(), 'grid-exports-')))
  outside = realpathSync.native(mkdtempSync(join(tmpdir(), 'grid-outside-')))
  project = openProject(root, root)
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
})

describe('writeProjectExport', () => {
  it('writes a plain file name into exports/ beside the plan', () => {
    const written = writeProjectExport(project, '.', 'ok.dxf', 'x')
    expect(written).toBe(join(root, 'exports', 'ok.dxf'))
  })

  it.each(['../escaped.dxf', '/tmp/abs.dxf', 'a/b.dxf', '..\\win-escape.dxf', '.hidden', '', 'nul\u0000.dxf'])(
    'refuses %j, a name that is not a plain file name, and writes nothing',
    (name) => {
      expect(() => writeProjectExport(project, '.', name, 'x')).toThrow()
      expect(existsSync(join(root, 'escaped.dxf'))).toBe(false)
      expect(existsSync(join(root, '..', 'escaped.dxf'))).toBe(false)
      expect(readdirSync(outside)).toEqual([])
    },
  )

  it('refuses an exports folder that is a link to somewhere else', () => {
    symlinkSync(outside, join(root, 'exports'), process.platform === 'win32' ? 'junction' : 'dir')
    expect(() => writeProjectExport(project, '.', 'ok.dxf', 'x')).toThrow()
    expect(readdirSync(outside)).toEqual([])
  })
})
