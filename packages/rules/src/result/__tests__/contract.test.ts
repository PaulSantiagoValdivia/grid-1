import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CODES, LINE_KINDS, RESULT_VERSION } from '../..'

const CONTRACT = readFileSync(fileURLToPath(new URL('../../../../../docs/result-contract.md', import.meta.url)), 'utf8')
// A feature's new codes wait in its fragment, `changes/<ID>.md`, under "## Codes", until the
// release step puts them in the contract's code table (scripts/release/fragments.mjs).
const CHANGES = fileURLToPath(new URL('../../../../../changes/', import.meta.url))
const FRAGMENTS = existsSync(CHANGES)
  ? readdirSync(CHANGES).filter((name) => name.endsWith('.md') && name !== 'README.md').map((name) => readFileSync(`${CHANGES}${name}`, 'utf8'))
  : []
// CNT-15: `type/`, the named types list's own codes.
const CODE_ROW = /^\| `((?:plan|floor|wall|room|opening|item|stair|pattern|firm|flat|type)\/[a-z0-9-]+)` \|/gm

describe('docs/result-contract.md', () => {
  it('lists every code the catalogue words, and no other, with the codes waiting in changes/', () => {
    const listed = [CONTRACT, ...FRAGMENTS].flatMap((text) => [...text.matchAll(CODE_ROW)].map((m) => m[1]))
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
