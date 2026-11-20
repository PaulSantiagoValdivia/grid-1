/**
 * The file `grid` and `ongrid` run. Everything it does is in `main.ts`; this only connects
 * it to the process.
 */
import { runGrid } from './main'

const code = await runGrid(process.argv.slice(2), {
  stdout: (data) => { process.stdout.write(data) },
  stderr: (text) => { process.stderr.write(text) },
  stdoutIsTerminal: process.stdout.isTTY === true,
  cwd: process.cwd(),
})
// exitCode, not exit(): what is still being written to a pipe gets written. `grid serve`
// returns at once and keeps running until its host closes standard input.
process.exitCode = code
