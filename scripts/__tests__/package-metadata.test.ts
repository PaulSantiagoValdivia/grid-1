import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../..')

// Every package.json in the repository. A new package must be added here.
const manifests = [
  'package.json',
  'packages/floorplan/package.json',
  'packages/rules/package.json',
  'packages/viewer/package.json',
  'packages/cli/package.json',
]

describe.each(manifests)('%s', (file) => {
  const manifest = JSON.parse(readFileSync(resolve(root, file), 'utf8')) as Record<string, unknown>

  it('is licensed under Apache-2.0', () => {
    expect(manifest.license).toBe('Apache-2.0')
  })

  it('stays private until publishing is approved', () => {
    expect(manifest.private).toBe(true)
  })
})

it('lists every workspace package', () => {
  const rootManifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
    workspaces: string[]
  }
  expect(rootManifest.workspaces).toEqual(['packages/*'])
  const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8')) as {
    packages: Record<string, unknown>
  }
  const workspaces = Object.keys(lock.packages)
    .filter((key) => key.startsWith('packages/') && !key.includes('node_modules'))
    .map((key) => `${key}/package.json`)
  expect(manifests.slice(1).sort()).toEqual(workspaces.sort())
})
