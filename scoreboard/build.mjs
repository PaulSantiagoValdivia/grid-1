// @ts-check
/**
 * Bundles the scoreboard runner into `dist/scoreboard.mjs` with esbuild (MIT), as the `grid`
 * command is bundled: Grid's packages are TypeScript sources that plain Node cannot run.
 */
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const here = (/** @type {string} */ path) => fileURLToPath(new URL(path, import.meta.url))

await build({
  entryPoints: [here('./src/main.ts')],
  outfile: here('./dist/scoreboard.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  legalComments: 'eof',
  logLevel: 'warning',
})
