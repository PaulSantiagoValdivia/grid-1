// @ts-check
/**
 * Bundles the scoreboard runner into `dist/scoreboard.mjs` with esbuild (MIT), as the `grid`
 * command is bundled: Grid's packages are TypeScript sources that plain Node cannot run.
 */
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const here = (/** @type {string} */ path) => fileURLToPath(new URL(path, import.meta.url))

// `dist/retell.mjs` is the MSG-3 retelling run (`npm run retell`), which the owner runs.
for (const [entry, out] of [
  ['./src/main.ts', './dist/scoreboard.mjs'],
  ['./src/retellMain.ts', './dist/retell.mjs'],
]) {
  await build({
    entryPoints: [here(entry)],
    outfile: here(out),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    legalComments: 'eof',
    logLevel: 'warning',
  })
}
