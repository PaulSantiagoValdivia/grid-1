import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CODES, LINE_KINDS, RESULT_VERSION } from '../..'

const CONTRACT = readFileSync(fileURLToPath(new URL('../../../../../docs/result-contract.md', import.meta.url)), 'utf8')

describe('docs/result-contract.md', () => {
  it('lists every code the catalogue words, and no other', () => {
    const listed = [...CONTRACT.matchAll(/^\| `((?:plan|floor|wall|room|opening|item|stair)\/[a-z0-9-]+)` \|/gm)].map((m) => m[1])
    expect([...listed].sort()).toEqual(Object.keys(CODES).sort())
    expect(new Set(listed).size).toBe(listed.length)
  })

  it('names every kind of line, in list order, and the record version', () => {
    const order = LINE_KINDS.map((kind) => CONTRACT.indexOf(`. \`${kind}\`:`))
    for (const at of order) expect(at).toBeGreaterThan(0)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(CONTRACT).toContain(`| \`resultVersion\` | \`${RESULT_VERSION}\`.`)
  })

  it('has its stability promise and a changelog entry for the version', () => {
    expect(CONTRACT).toContain('## What may change')
    expect(CONTRACT).toMatch(new RegExp(`^### \\d{4}-\\d{2}-\\d{2}: version ${RESULT_VERSION}\\b`, 'm'))
  })
})
