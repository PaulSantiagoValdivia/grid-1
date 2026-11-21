// @ts-check
/**
 * Bundles the `grid` command into `dist/grid.mjs`, which `grid` and `ongrid` run.
 *
 * Grid's packages are TypeScript sources; esbuild (MIT) turns the command and everything it
 * imports into an ES module that plain Node runs. `@napi-rs/canvas` stays outside: it is a
 * native module, loaded from `node_modules` on the first PNG.
 *
 * What a command imports only when it needs it goes into its own file under `dist/chunks/`,
 * so the rest start without it: a 3D still (`grid draw --3d`) brings Three and React, about
 * 1.7 MB, which every other command would otherwise read at start.
 *
 * Usage: node build.mjs [--metafile]
 */
import { build } from 'esbuild'
import { chmodSync, cpSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = (/** @type {string} */ path) => fileURLToPath(new URL(path, import.meta.url))

// Chunks of an earlier build would pile up under their old names.
rmSync(here('./dist'), { recursive: true, force: true })

const result = await build({
  entryPoints: { grid: here('./src/command/bin.ts') },
  outdir: here('./dist'),
  outExtension: { '.js': '.mjs' },
  chunkNames: 'chunks/[name]-[hash]',
  splitting: true,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['@napi-rs/canvas'],
  // React's production build: the development one only adds checks and warnings.
  define: { 'process.env.NODE_ENV': '"production"' },
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

// The sheet's fonts (VEW-7), read by the canvas beside grid.mjs.
cpSync(here('./fonts'), here('./dist/fonts'), { recursive: true })

if (result.metafile) writeFileSync(here('./dist/meta.json'), JSON.stringify(result.metafile))
