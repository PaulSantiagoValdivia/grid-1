/**
 * The `grid` command, which `ongrid` runs too: `check`, `draw`, `export` and `serve`.
 *
 * A thin front end. Each command reads its own options strictly (see `options.ts`), reads the
 * plan, hands it to Grid's packages, and writes what comes back. `serve` starts the tool server
 * an agent's host talks to, from the same file.
 *
 * Exit codes: 0 when the command did its work, 1 when the plan was refused or a file could not
 * be written, 2 when the command line was refused. Every refusal is one line on standard
 * error, with its cause first.
 */
import { isAbsolute, relative } from 'path'
import { planFloors } from '@ongrid/floorplan/geometry'
import { version } from '../../package.json'
import { writeProjectExport } from '../export/projectExports'
import { atomicWriteFile } from '../fs/atomicWrite'
import { startToolServer } from '../mcp/serve'
import { CHECK_OPTIONS, checkJson, checkPlan, checkText } from './check'
import { checkDrawRequest, DRAW_OPTIONS, drawFile } from './draw'
import { checkExportRequest, EXPORT_OPTIONS, exportFile, projectFolderOf } from './export'
import { helpText, onePlanFile, parseOptions, textOf, UsageError, type OptionSpecs } from './options'
import { loadPlan, PlanRefused, type LoadedPlan } from './plan'

export const EXIT_OK = 0
export const EXIT_REFUSED = 1
export const EXIT_USAGE = 2

export interface CommandIo {
  readonly stdout: (data: string | Uint8Array) => void
  readonly stderr: (text: string) => void
  /** Whether standard output is a terminal, where a PNG's bytes would be noise. */
  readonly stdoutIsTerminal: boolean
  readonly cwd: string
}

/** Why a file could not be written. The message is one line. */
class WriteFailed extends Error {}

const HELP_FLAG: OptionSpecs = { '--help': { takesValue: false, help: 'Show this help.' } }

const COMMANDS = {
  check: {
    usage: 'grid check <plan.json> [--floor <id>] [--country <code>] [--json]',
    summary: 'Checks a plan and prints the report: general guidance, not your local rules.',
    options: CHECK_OPTIONS,
  },
  draw: {
    usage: 'grid draw <plan.json> [--png] [--out <file>] [--floor <id>] [--scale <n>]',
    summary: 'Draws one floor of a plan as an SVG picture, or a PNG with --png.',
    options: DRAW_OPTIONS,
  },
  export: {
    usage: 'grid export <plan.json> --format dxf|ifc|glb|obj [--floor <id>] [--out <file>]',
    summary: 'Writes the plan as a file for another program, into exports/ beside the plan unless --out names one.',
    options: EXPORT_OPTIONS,
  },
  serve: {
    usage: 'grid serve',
    summary: "Starts Grid's tool server on standard input and output, for an agent's host to talk to.",
    options: {},
  },
} as const satisfies Record<string, { usage: string; summary: string; options: OptionSpecs }>

type CommandName = keyof typeof COMMANDS

function isCommand(name: string): name is CommandName {
  return Object.hasOwn(COMMANDS, name)
}

const OVERVIEW = [
  'Usage: grid <command> [options]   (ongrid does the same)',
  '',
  'Commands:',
  ...Object.entries(COMMANDS).map(([name, command]) => `  ${name.padEnd(8)}${command.summary}`),
  '',
  'Run grid <command> --help for its options.',
  '',
].join('\n')

function shown(io: CommandIo, file: string): string {
  const path = relative(io.cwd, file)
  return path && !path.startsWith('..') && !isAbsolute(path) ? path : file
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function write(file: string, data: string | Uint8Array): void {
  try {
    atomicWriteFile(file, data)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') throw new WriteFailed(`Can't write ${file}: its folder does not exist.`)
    if (code === 'EACCES' || code === 'EPERM') throw new WriteFailed(`Can't write ${file}: permission denied.`)
    if (code === 'EISDIR') throw new WriteFailed(`Can't write ${file}: it is a folder.`)
    throw new WriteFailed(`Can't write ${file}: ${oneLine((error as Error).message)}`)
  }
}

/** Says, on standard error, which parts a picture or an export leaves out. */
function warnLeftOut(io: CommandIo, loaded: LoadedPlan): void {
  const ids = [...loaded.broken].sort()
  if (ids.length === 0) return
  const list = ids.length > 5 ? `${ids.slice(0, 5).join(', ')} and ${ids.length - 5} more` : ids.join(', ')
  io.stderr(`Left out ${ids.length} part${ids.length === 1 ? '' : 's'} that can't be drawn: ${list}. grid check says why.\n`)
}

async function runCommand(name: CommandName, args: readonly string[], io: CommandIo): Promise<number> {
  const command = COMMANDS[name]
  const parsed = parseOptions(name, args, { ...command.options, ...HELP_FLAG })
  if (parsed.values.has('--help')) {
    io.stdout(helpText(command.usage, command.summary, command.options))
    return EXIT_OK
  }

  if (name === 'serve') {
    if (parsed.positionals.length > 0) throw new UsageError(`serve takes no arguments: got ${parsed.positionals.join(', ')}.`)
    startToolServer()
    return EXIT_OK
  }

  const planFile = onePlanFile(name, parsed.positionals)

  if (name === 'check') {
    const json = parsed.values.has('--json')
    const loaded = loadPlan(planFile)
    const result = checkPlan(loaded, { floor: textOf(parsed, '--floor'), country: textOf(parsed, '--country') })
    io.stdout(json ? checkJson(result) : checkText(result, planFloors(loaded.plan).length))
    return EXIT_OK
  }

  if (name === 'draw') {
    const request = {
      png: parsed.values.has('--png'),
      out: textOf(parsed, '--out'),
      floor: textOf(parsed, '--floor'),
      scale: textOf(parsed, '--scale'),
    }
    const { scale } = checkDrawRequest(request)
    if (request.png && request.out === undefined && io.stdoutIsTerminal) {
      throw new UsageError('A PNG is not shown in a terminal: name a file with --out, or send the output to a file or another program.')
    }
    const loaded = loadPlan(planFile)
    const picture = await drawFile(loaded, request, scale)
    warnLeftOut(io, loaded)
    if (request.out === undefined) {
      io.stdout(picture)
    } else {
      write(request.out, picture)
      io.stdout(`Wrote ${shown(io, request.out)}\n`)
    }
    return EXIT_OK
  }

  const request = { format: textOf(parsed, '--format'), floor: textOf(parsed, '--floor'), out: textOf(parsed, '--out') }
  const format = checkExportRequest(request)
  const loaded = loadPlan(planFile)
  const made = exportFile(loaded, planFile, format, request)
  warnLeftOut(io, loaded)
  let target: string
  if (request.out === undefined) {
    try {
      target = writeProjectExport(projectFolderOf(planFile), made.fileName, made.data)
    } catch (error) {
      throw new WriteFailed(`Can't write the export beside ${planFile}: ${oneLine((error as Error).message)}`)
    }
  } else {
    write(request.out, made.data)
    target = request.out
  }
  io.stdout(`Wrote ${shown(io, target)}\n`)
  return EXIT_OK
}

/** Runs one command line, without `node` and the script. Resolves to the exit code. */
export async function runGrid(argv: readonly string[], io: CommandIo): Promise<number> {
  const [first, ...rest] = argv
  try {
    if (first === undefined) {
      throw new UsageError(`Name a command: ${Object.keys(COMMANDS).join(', ')}. Run grid --help for more.`)
    }
    if (first === '--help' || first === '-h' || first === 'help') {
      if (first === 'help' && rest.length > 0) {
        const [topic] = rest
        if (topic !== undefined && isCommand(topic)) return await runCommand(topic, ['--help'], io)
        throw new UsageError(`There is no command ${JSON.stringify(topic)}. Its commands: ${Object.keys(COMMANDS).join(', ')}.`)
      }
      if (rest.length > 0) throw new UsageError(`${first} takes nothing after it: got ${rest.join(' ')}.`)
      io.stdout(OVERVIEW)
      return EXIT_OK
    }
    if (first === '--version') {
      if (rest.length > 0) throw new UsageError(`--version takes nothing after it: got ${rest.join(' ')}.`)
      io.stdout(`${version}\n`)
      return EXIT_OK
    }
    if (!isCommand(first)) {
      throw new UsageError(`There is no command ${JSON.stringify(first)}. Its commands: ${Object.keys(COMMANDS).join(', ')}.`)
    }
    return await runCommand(first, rest, io)
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr(`grid: ${error.message}\n`)
      return EXIT_USAGE
    }
    if (error instanceof PlanRefused || error instanceof WriteFailed) {
      io.stderr(`grid: ${error.message}\n`)
      return EXIT_REFUSED
    }
    // Anything else is Grid's own fault. Still one line first, then the detail for a bug report.
    io.stderr(`grid: something went wrong inside Grid: ${oneLine(String((error as Error)?.message ?? error))}\n`)
    if (error instanceof Error && error.stack) io.stderr(`${error.stack}\n`)
    return EXIT_REFUSED
  }
}
