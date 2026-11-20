// @ts-check
/**
 * Bundles the `grid` command into one file, `dist/grid.mjs`, which `grid` and `ongrid` run.
 *
 * Grid's packages are TypeScript sources; esbuild (MIT) turns the command and everything it
 * imports into one ES module that plain Node runs. `@napi-rs/canvas` stays outside: it is a
 * native module, loaded from `node_modules` on the first PNG.
 *
 * Usage: node build.mjs [--metafile]
 */
import { build } from 'esbuild'
import { chmodSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = (/** @type {string} */ path) => fileURLToPath(new URL(path, import.meta.url))

const result = await build({
  entryPoints: [here('./src/command/bin.ts')],
  outfile: here('./dist/grid.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['@napi-rs/canvas'],
  banner: { js: '#!/usr/bin/env node' },
  // The licence comments of what is bundled stay, at the end of the file.
  legalComments: 'eof',
  minify: true,
  sourcemap: false,
  metafile: process.argv.includes('--metafile'),
  logLevel: 'warning',
})

// Runnable as ./dist/grid.mjs too. npm sets this itself when it links the bin.
chmodSync(here('./dist/grid.mjs'), 0o755)

if (result.metafile) writeFileSync(here('./dist/meta.json'), JSON.stringify(result.metafile))
