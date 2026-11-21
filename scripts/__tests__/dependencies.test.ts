import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * QAR-6: what the lock file holds. One copy of the schema library, so a package that imports
 * it without declaring it still meets the version the plan schema uses, and no 3D helper
 * library, whose two imports brought most of the packages Grid ships.
 */

const lock = JSON.parse(readFileSync(resolve(__dirname, '../../package-lock.json'), 'utf8')) as {
  packages: Record<string, { version?: string }>
}

/** Every copy of `name` in the lock file, by where it is installed. */
const copies = (name: string): string[] =>
  Object.keys(lock.packages).filter((path) => path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`))

describe('the lock file', () => {
  it('holds one copy of zod, at the root, at major version 3', () => {
    expect(copies('zod')).toEqual(['node_modules/zod'])
    expect(lock.packages['node_modules/zod']?.version).toMatch(/^3\./)
  })

  it('holds no 3D helper library', () => {
    expect(copies('@react-three/drei')).toEqual([])
  })
})
