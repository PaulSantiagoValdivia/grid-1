/**
 * `packages/floorplan` stays pure (AGENTS.md): no React, no Three.js, no DOM and no network. A
 * plan goes in and numbers come out, so the same core runs in Node, in a browser and in a test
 * without a window. `geometry/__tests__/diff-purity.test.ts` holds the plan diff to a stricter
 * rule; this one covers the whole package.
 *
 * Every source file outside the tests may import only relative paths and the packages listed in
 * `ALLOWED`, and the package may depend on nothing else. No source file may reach for a browser
 * or network global.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const PACKAGE = resolve(__dirname, '../..')
const SOURCE = resolve(PACKAGE, 'src')

/** The only packages the core may use, and what for. */
const ALLOWED: Readonly<Record<string, string>> = {
  zod: 'reading the plan file (types/floorplan.ts)',
  'polygon-clipping': 'joining wall footprints into spaces, and cutting room outlines against each other (geometry/polygons.ts), MIT',
}

/** Names that only a browser or a network client has. */
const FORBIDDEN_GLOBALS = [
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'HTMLElement',
  'requestAnimationFrame',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
]

function sources(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (name === '__tests__' || name === 'test-support') continue
      out.push(...sources(path))
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(path)
    }
  }
  return out
}

/** Every reason `source` is not pure. Empty when it is. */
function impurities(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  const found: string[] = []
  const specifiers = [
    // `import … from 'x'` and `export … from 'x'`, over several lines if need be.
    ...code.matchAll(/^\s*(?:import|export)\s[^'"`;]*?\bfrom\s+['"]([^'"]+)['"]/gm),
    ...code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
    ...code.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm),
    ...code.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
  ].map((m) => m[1]!)
  for (const specifier of specifiers) {
    if (specifier.startsWith('.')) continue
    if (!(specifier in ALLOWED)) found.push(`imports ${specifier}`)
  }
  // MSG-11: a global is looked for in the code, not in its text: a message key such as
  // `line.item/blocks-window.says` names a window and reaches for none.
  const bare = code.replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
  for (const name of FORBIDDEN_GLOBALS) {
    if (new RegExp(`(?<![.\\w])${name}\\s*[.([]`).test(bare)) found.push(`uses ${name}`)
  }
  return found
}

describe('packages/floorplan has no DOM, React, Three.js or network import', () => {
  const files = sources(SOURCE)

  it('reads the sources', () => {
    expect(files.length).toBeGreaterThan(20)
    expect(files.some((f) => f.endsWith('spaces.ts'))).toBe(true)
  })

  it('imports only relative paths and the allowed packages, and reaches for no browser or network global', () => {
    const bad = files
      .map((file) => [relative(PACKAGE, file), impurities(readFileSync(file, 'utf8'))] as const)
      .filter(([, found]) => found.length > 0)
    expect(bad).toEqual([])
  })

  it('depends on the allowed packages only', () => {
    const pkg = JSON.parse(readFileSync(join(PACKAGE, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
    const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})]
    expect(names.filter((name) => !(name in ALLOWED))).toEqual([])
  })

  it('catches what it is meant to catch', () => {
    expect(impurities("import * as THREE from 'three'")).toEqual(['imports three'])
    expect(impurities("import { useMemo } from 'react'")).toEqual(['imports react'])
    expect(impurities("import { get } from 'node:https'")).toEqual(['imports node:https'])
    expect(impurities('const r = await fetch(url)')).toEqual(['uses fetch'])
    expect(impurities('document.createElement("svg")')).toEqual(['uses document'])
    expect(impurities('const plan = { document: 1 }; plan.document.x')).toEqual([])
    expect(impurities("import polygonClipping from 'polygon-clipping'")).toEqual([])
    expect(impurities("import {\n  a,\n  b\n} from 'three'")).toEqual(['imports three'])
    expect(impurities("const s = `${a} from 'x'`")).toEqual([])
  })
})
