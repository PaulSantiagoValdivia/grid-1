import { describe, expect, it } from 'vitest'
import { pathProblem } from '../../fs/projectFiles'
import { T1_PLAN_TEXT } from '../../fs/__tests__/attackCases'
import { exportBaseOf, exportNameOf } from '../export'

describe('export file names: sanitised, never refused', () => {
  it('keeps a plain plan file name, as before', () => {
    expect(exportNameOf('two-bed-flat.json', 'dxf', null)).toEqual({ fileName: 'two-bed-flat.dxf' })
    expect(exportNameOf('plans/My House 2026.json', 'ifc', null)).toEqual({ fileName: 'my-house-2026.ifc' })
  })

  it.each([
    ['CON.json', 'plan-con.dxf'],
    ['nul.json', 'plan-nul.dxf'],
    ['Aux!.json', 'plan-aux.dxf'],
    ['COM1.json', 'plan-com1.dxf'],
    ['lpt9', 'plan-lpt9.dxf'],
  ])('puts plan- before %j, a name Windows keeps for a device (T-4)', (file, fileName) => {
    const name = exportNameOf(file, 'dxf', null)
    expect(name.fileName).toBe(fileName)
    expect(name.note).toMatch(/a name Windows keeps for a device/)
    expect(pathProblem(name.fileName)).toBeNull()
  })

  it('keeps a reserved word that is only part of a name', () => {
    expect(exportNameOf('con-flat.json', 'dxf', null)).toEqual({ fileName: 'con-flat.dxf' })
    expect(exportNameOf('con.json', 'dxf', 2)).toEqual({ fileName: 'con-floor-2.dxf' })
  })

  it.each(T1_PLAN_TEXT)('never carries plan text that reads as a claim or an instruction (T-1): %j', (text) => {
    const name = exportNameOf(`${text}.json`, 'dxf', null)
    expect(name.fileName).toBe('floor-plan.dxf')
    expect(name.note).toMatch(/^Named the export floor-plan\.dxf: /)
    expect(name.note).not.toContain(text)
  })

  it('names one floor of several by its place in the plan, never by the floor\'s own name', () => {
    expect(exportNameOf('house.json', 'obj', 2)).toEqual({ fileName: 'house-floor-2.obj' })
  })

  it('stays a name every system can write', () => {
    for (const file of ['../../etc/passwd', '/etc/passwd', 'C:\\Windows\\win.ini', 'x\u0000y', '.', '..', '', 'a'.repeat(5000), 'x.dxf.', 'x.dxf ']) {
      const { fileName } = exportNameOf(file, 'glb', 3)
      expect(fileName).toMatch(/^[a-z0-9-]+\.glb$/)
      expect(pathProblem(fileName)).toBeNull()
    }
  })
})

it('gives the base a sheet is named after (VEW-7)', () => {
  expect(exportBaseOf('My House.json')).toEqual({ base: 'my-house' })
  expect(exportBaseOf('approved-plan.json').base).toBe('floor-plan')
})
