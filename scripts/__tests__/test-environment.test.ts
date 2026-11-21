import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * QAR-6 (Z-15): Vitest switches a test file to the browser stand-in when any comment in it
 * names the environment, so a sentence about the switch turned it on in a test meant to run
 * without one. A file asks for its environment on its first line, and nowhere else.
 */

const root = resolve(__dirname, '../..')
const SWITCH = /@(vitest|jest)-environment\b/

function testFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === 'dist' ? [] : testFiles(path)
    return /\.test\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : []
  })
}

describe('a test file’s environment', () => {
  it('is named on its first line only', () => {
    const elsewhere = ['packages', 'scripts', 'scoreboard']
      .flatMap((folder) => testFiles(join(root, folder)))
      .flatMap((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .map((line, i) => ({ line, i }))
          .filter(({ line, i }) => i > 0 && SWITCH.test(line) && file !== __filename)
          .map(({ i }) => `${relative(root, file)}:${i + 1}`))
    expect(elsewhere).toEqual([])
  })
})
