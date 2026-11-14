import { describe, expect, it } from 'vitest'
import { parseRegDefault } from '../systemLookup'

describe('parseRegDefault', () => {
  it('reads the default value whatever the label is called in this language', () => {
    const out = '\r\nHKEY_LOCAL_MACHINE\\...\\App Paths\\acad.exe\r\n    (Predeterminado)    REG_SZ    C:\\Program Files\\Autodesk\\AutoCAD 2025\\acad.exe\r\n\r\n'
    expect(parseRegDefault(out)).toBe('C:\\Program Files\\Autodesk\\AutoCAD 2025\\acad.exe')
  })

  it('expands environment variables in an expandable value', () => {
    process.env.GRID_TEST_ROOT = 'D:\\Apps'
    expect(parseRegDefault('    (Default)    REG_EXPAND_SZ    %GRID_TEST_ROOT%\\SketchUp.exe\r\n')).toBe('D:\\Apps\\SketchUp.exe')
    delete process.env.GRID_TEST_ROOT
  })

  it('returns null when there is no string value', () => {
    expect(parseRegDefault('ERROR: The system was unable to find the specified registry key or value.')).toBeNull()
    expect(parseRegDefault('    (Default)    REG_DWORD    0x1')).toBeNull()
  })
})
