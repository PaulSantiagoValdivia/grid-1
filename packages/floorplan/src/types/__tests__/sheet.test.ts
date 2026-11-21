import { describe, expect, it } from 'vitest'
import { parseSheetWords, sheetWordsProblem, SHEET_PARAGRAPH_MAX, SheetWordsRefused } from '../sheet'

const floors = ['ground', 'first']
const ok = { version: '1', name: 'Solace House', headline: 'A retreat', intro: ['One.'], floors: { ground: ['Two.'] } }

describe('sheet.json (VEW-7)', () => {
  it('takes good words', () => {
    expect(sheetWordsProblem(ok, floors)).toBeNull()
    expect(parseSheetWords(ok, floors).floors?.['ground']).toEqual(['Two.'])
  })
  it('takes only a version', () => {
    expect(sheetWordsProblem({ version: '1' }, floors)).toBeNull()
  })
  it('refuses a missing or other version', () => {
    expect(sheetWordsProblem({}, floors)).toMatch(/version/)
    expect(sheetWordsProblem({ version: '2' }, floors)).toMatch(/version/)
  })
  it('refuses an unknown field by name', () => {
    expect(sheetWordsProblem({ version: '1', logo: 'x' }, floors)).toMatch(/"logo"/)
  })
  it('refuses a floor the plan does not have, quoting its id', () => {
    expect(sheetWordsProblem({ version: '1', floors: { roof: ['x'] } }, floors)).toMatch(/"roof"/)
  })
  it('refuses a long paragraph, naming the limit and not the text', () => {
    const long = 'secret '.repeat(SHEET_PARAGRAPH_MAX)
    const problem = sheetWordsProblem({ version: '1', intro: [long] }, floors)!
    expect(problem).toMatch(/intro\[0\]/)
    expect(problem).toMatch(String(SHEET_PARAGRAPH_MAX))
    expect(problem).not.toMatch(/secret/)
  })
  it('refuses a fourth paragraph', () => {
    expect(sheetWordsProblem({ version: '1', intro: ['a', 'b', 'c', 'd'] }, floors)).toMatch(/intro.*3/)
  })
  it('refuses line breaks, control and direction characters', () => {
    for (const bad of ['a\nb', 'a\u0007b', 'a‮b']) {
      expect(sheetWordsProblem({ version: '1', headline: bad }, floors)).toMatch(/headline/)
    }
  })
  it('refuses an empty name', () => {
    expect(sheetWordsProblem({ version: '1', name: '' }, floors)).toMatch(/name/)
  })
  it('throws SheetWordsRefused from parseSheetWords', () => {
    expect(() => parseSheetWords({ version: '1', logo: 1 }, floors)).toThrow(SheetWordsRefused)
  })
})
