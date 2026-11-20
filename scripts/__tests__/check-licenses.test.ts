import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkLicense, checkLock, isBlockedId, parseExpression } from '../check-licenses.mjs'

const script = resolve(__dirname, '../check-licenses.mjs')

function lockWith(licenses: Record<string, unknown>) {
  const packages: Record<string, Record<string, unknown>> = {
    '': { name: 'fixture', version: '0.0.0', license: 'Apache-2.0' },
  }
  for (const [name, license] of Object.entries(licenses)) {
    packages[`node_modules/${name}`] = { version: '1.0.0', license }
  }
  return { name: 'fixture', lockfileVersion: 3, packages }
}

describe('isBlockedId', () => {
  it.each(['GPL-2.0', 'GPL-3.0-only', 'GPL-3.0-or-later', 'LGPL-2.1+', 'AGPL-3.0', 'MPL-2.0', 'EPL-2.0', 'gpl', 'GPLv3'])(
    'blocks %s',
    (id) => expect(isBlockedId(id)).toBe(true),
  )

  it.each(['MIT', 'Apache-2.0', 'ISC', 'BSD-3-Clause', 'BlueOak-1.0.0', 'CC-BY-4.0', 'Python-2.0', 'MIT-0', 'GFDL-1.3'])(
    'allows %s',
    (id) => expect(isBlockedId(id)).toBe(false),
  )
})

describe('checkLicense', () => {
  it('passes an OR expression when one choice is allowed', () => {
    expect(checkLicense('(MIT OR GPL-2.0)')).toEqual({ allowed: true, blocked: [] })
    expect(checkLicense('GPL-3.0 OR Apache-2.0')).toEqual({ allowed: true, blocked: [] })
  })

  it('fails an OR expression when every choice is blocked', () => {
    expect(checkLicense('(GPL-2.0 OR MPL-2.0)')).toEqual({ allowed: false, blocked: ['GPL-2.0', 'MPL-2.0'] })
  })

  it('fails an AND expression when either side is blocked', () => {
    expect(checkLicense('(MIT AND LGPL-3.0)')).toEqual({ allowed: false, blocked: ['LGPL-3.0'] })
  })

  it('binds AND tighter than OR', () => {
    // MIT OR (Apache-2.0 AND GPL-2.0): MIT can be chosen.
    expect(checkLicense('MIT OR Apache-2.0 AND GPL-2.0').allowed).toBe(true)
    // (MIT OR Apache-2.0) AND GPL-2.0: GPL-2.0 always applies.
    expect(checkLicense('(MIT OR Apache-2.0) AND GPL-2.0').allowed).toBe(false)
  })

  it('still blocks a licence with an exception', () => {
    expect(checkLicense('GPL-2.0-only WITH Classpath-exception-2.0')).toEqual({
      allowed: false,
      blocked: ['GPL-2.0-only'],
    })
  })

  it('falls back to looking at every word when the expression does not parse', () => {
    expect(checkLicense('GNU GPL v3').allowed).toBe(false)
    expect(checkLicense('SEE LICENSE IN LICENSE.md').allowed).toBe(true)
  })

  it('rejects malformed expressions in the parser', () => {
    expect(() => parseExpression('(MIT OR')).toThrow()
    expect(() => parseExpression('MIT GPL-2.0')).toThrow()
    expect(() => parseExpression('GPL-2.0 WITH')).toThrow()
  })
})

describe('checkLock', () => {
  it('passes a lock file with only permissive licences', () => {
    const result = checkLock(lockWith({ a: 'MIT', b: '(MIT OR GPL-2.0)', c: { type: 'ISC' } }))
    expect(result).toEqual({ checked: 4, findings: [] })
  })

  it('reports each copyleft entry with its name and version', () => {
    const result = checkLock(lockWith({ a: 'MIT', b: 'GPL-3.0', '@scope/c': 'MPL-2.0' }))
    expect(result.checked).toBe(4)
    expect(result.findings).toEqual([
      { path: 'node_modules/b', name: 'b', version: '1.0.0', license: 'GPL-3.0', blocked: ['GPL-3.0'] },
      {
        path: 'node_modules/@scope/c',
        name: '@scope/c',
        version: '1.0.0',
        license: 'MPL-2.0',
        blocked: ['MPL-2.0'],
      },
    ])
  })

  it('skips entries without a licence field', () => {
    const lock = lockWith({ a: 'MIT' })
    lock.packages['packages/x'] = { version: '0.0.0' }
    expect(checkLock(lock).checked).toBe(2)
  })

  it('refuses a lock file without a packages section', () => {
    expect(() => checkLock({ lockfileVersion: 1, dependencies: {} })).toThrow(/packages/)
  })
})

describe('check-licenses script', () => {
  let dir: string | undefined

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = undefined
  })

  function run(lock: unknown) {
    dir = mkdtempSync(join(tmpdir(), 'grid-licences-'))
    const lockPath = join(dir, 'package-lock.json')
    writeFileSync(lockPath, JSON.stringify(lock))
    return spawnSync(process.execPath, [script, lockPath], { encoding: 'utf8' })
  }

  it('exits 1 and names the package when the fixture has a copyleft entry', () => {
    const result = run(lockWith({ fine: 'MIT', bad: 'AGPL-3.0-only' }))
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('bad@1.0.0')
    expect(result.stderr).toContain('AGPL-3.0-only')
  })

  it('exits 0 when the fixture has none', () => {
    const result = run(lockWith({ fine: 'MIT', dual: '(MIT OR GPL-2.0)' }))
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Checked 3 licences')
  })

  it('passes on the repository lock file', () => {
    const result = spawnSync(process.execPath, [script, resolve(__dirname, '../../package-lock.json')], {
      encoding: 'utf8',
    })
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
  })
})

describe('the grid command', () => {
  // Not only "not copyleft": the tool that builds dist/grid.mjs, and what the file carries or
  // loads, must be under a permissive licence, named outright.
  const PERMISSIVE = new Set(['MIT', 'Apache-2.0', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD'])
  const lock = JSON.parse(readFileSync(resolve(__dirname, '../../package-lock.json'), 'utf8')) as {
    packages: Record<string, { license?: unknown }>
  }
  const entries = (pattern: RegExp) =>
    Object.entries(lock.packages).filter(([path]) => pattern.test(path.replace(/^.*node_modules\//, '')))

  it.each([
    ['esbuild, which builds it', /^(esbuild|@esbuild\/.+)$/],
    ['zod, which it carries', /^zod$/],
    ['@napi-rs/canvas, which it loads for a PNG', /^@napi-rs\/canvas(-.+)?$/],
  ])('%s, is under a permissive licence', (_what, pattern) => {
    const found = entries(pattern)
    expect(found.length).toBeGreaterThan(0)
    for (const [path, entry] of found) expect([path, PERMISSIVE.has(String(entry.license))]).toEqual([path, true])
  })
})
