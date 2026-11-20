// `npm run scoreboard`: runs the lab's plans through Grid, prints the five counts and fails
// (exit code 1) when any count is worse than the figures stored in scoreboard/current.json.
//
//   --every <n>         only every n-th generated and damaged plan (a quicker, partial run)
//   --write-current     store this run's counts as the new current figures
//   --out <file>        also write the whole result, as JSON, to this file
//   --against <file>    compare with the counts stored in this file instead of current.json
import { readFileSync, writeFileSync } from 'node:fs'
import { runScoreboard } from './counts'
import { readStored, report, STORED, type Stored } from './report'

interface Args {
  every: number
  writeCurrent: boolean
  out?: string
  against?: string
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { every: 1, writeCurrent: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '--write-current') args.writeCurrent = true
    else if (arg === '--every' || arg === '--out' || arg === '--against') {
      const value = argv[++i]
      if (value === undefined) throw new Error(`${arg} needs a value`)
      if (arg === '--out') args.out = value
      else if (arg === '--against') args.against = value
      else {
        args.every = Number(value)
        if (!Number.isInteger(args.every) || args.every < 1) throw new Error(`--every takes a whole number of 1 or more: got ${value}`)
      }
    } else throw new Error(`unknown option ${arg}`)
  }
  if (args.writeCurrent && args.against) throw new Error('--write-current and --against do not go together')
  if (args.writeCurrent && args.every !== 1) throw new Error('--write-current needs a full run: leave out --every')
  return args
}

function main(): number {
  let args: Args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`scoreboard: ${(error as Error).message}\n`)
    return 2
  }
  const started = performance.now()
  const result = runScoreboard({ every: args.every, log: (line) => process.stderr.write(`  ${line}\n`) })
  const seconds = (performance.now() - started) / 1000
  if (args.out) writeFileSync(args.out, `${JSON.stringify(result, null, 1)}\n`)
  const partial = args.every !== 1
  const stored = args.against ? (JSON.parse(readFileSync(args.against, 'utf8')) as Stored) : readStored('current.json')
  const { text, worse } = report(result, readStored('baseline.json'), stored, partial)
  process.stdout.write(`${text}\nRan in ${seconds.toFixed(1)} s.\n`)
  if (args.writeCurrent) {
    const next: Stored = { what: 'The counts the build must not fall below. Update them in the commit that moves them, and say why.', counts: result.counts, detail: result.detail }
    writeFileSync(STORED('current.json'), `${JSON.stringify(next, null, 1)}\n`)
    process.stdout.write('Stored as scoreboard/current.json.\n')
    return 0
  }
  return worse ? 1 : 0
}

process.exitCode = main()
