#!/usr/bin/env node
// @ts-check
/**
 * The file npm links as `grid` and `ongrid`. It runs the built command, `dist/grid.mjs`.
 *
 * npm makes the links when the repository is installed, before anything is built, and only
 * for a file that is already there; on Windows it also reads the file's first line to write
 * the `.cmd` shim. So the links point here, to a committed file, and this file runs the build.
 */
import { existsSync } from 'node:fs'

const built = new URL('../dist/grid.mjs', import.meta.url)

if (existsSync(built)) {
  await import(built.href)
} else {
  process.stderr.write('grid: the command is not built yet: run npm run build in the repository first.\n')
  process.exitCode = 1
}
