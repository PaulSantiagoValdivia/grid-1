import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The plan format's conventions, C1, C2 and on, in the header of `floorplan.ts`. Features built
// at the same time get their numbers from the coordinator (AGENTS.md); this catches two that
// still took the same one, as two features once both took C18.
const source = readFileSync(resolve(__dirname, '../floorplan.ts'), 'utf8')
const header = source.slice(0, source.indexOf('*/'))
const conventions = [...header.matchAll(/^ \* C(\d+) · (.+)$/gm)].map((m) => ({ number: Number(m[1]), title: m[2] }))

describe('the conventions in the plan format', () => {
  it('are read from the header', () => {
    expect(conventions.length).toBeGreaterThanOrEqual(19)
    expect(conventions[0]).toEqual({ number: 1, title: 'Wall thickness' })
  })

  it('each have a number of their own', () => {
    const taken = new Map<number, string[]>()
    for (const { number, title } of conventions) taken.set(number, [...(taken.get(number) ?? []), title])
    const twice = [...taken].filter(([, titles]) => titles.length > 1).map(([number, titles]) => `C${number}: ${titles.join(' and ')}`)
    expect(twice).toEqual([])
  })
})
