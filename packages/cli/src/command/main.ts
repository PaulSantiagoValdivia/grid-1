/**
 * The `grid` command, which `ongrid` runs too: `init`, `write`, `edit`, `mark`, `diff`, `check`,
 * `describe`, `draw`, `export`, `tidy`, `occupancy`, `serve` and `mcp`, the same server under the name an
 * agent's host types (`npx -y ongrid mcp`, CMD-9).
 *
 * A thin front end. Each command reads its own options strictly (see `options.ts`), reads the
 * plan, hands it to Grid's packages, and writes what comes back. `serve` starts the tool server
 * an agent's host talks to, from the same file.
 *
 * Every file a command reads or writes is inside the project folder: the folder named with
 * `--project`, or else the folder it runs in. Any other path is refused (`fs/projectFiles.ts`).
 * A project folder that holds `grid.json`, as `grid init` makes it, is a Grid project: there
 * `check`, `describe`, `draw` and `export` read its `plan.json` when no plan file is named
 * (`init.ts`).
 *
 * Exit codes: 0 when the command did its work, 1 when the plan or a path was refused or a file
 * could not be written, 2 when the command line was refused. Every refusal is one line on
 * standard error, with its cause first.
 */
import { planFloors } from '@ongrid/floorplan/geometry'
import { GENERAL_GUIDANCE_LABEL } from '@ongrid/rules'
import { version } from '../../package.json'
import { CanvasMissing } from '../draw/canvas'
import { openProject, PathRefused, type Project } from '../fs/projectFiles'
import { TextNotDecoded } from '../fs/textEncoding'
import { FontsMissing } from '../sheet/fonts'
import { linkSeats, occupancyFileOf, occupancyText, OccupancyRefused, readOccupancy } from '../occupancy/occupancy'
import { checkSheetRequest, makeSheet, readSheetWords, sheetIntoProject } from '../sheet/sheetFile'
import { startToolServer } from '../mcp/serve'
import { projectTools } from '../mcp/serveTools'
import { CHECK_OPTIONS, checkJson, checkPlan, checkText, markNote, withSeen, type MarkAsk, type MarkDone } from './check'
import { readSeen, SeenRefused } from '../seen/marks'
import { EDIT_SUMMARY, EDIT_USAGE, EditCommandRefused, runEdit } from './edit'
import { checkDescribeRequest, DESCRIBE_OPTIONS, describePlan, describeRooms } from './describe'
import { DIFF_OPTIONS, MARK_OPTIONS, runDiff, runMark } from './diff'
import { MARKERS_MAX, MarkerRefused } from '../versions/markers'
import { GitUnread } from '../versions/git'
import { checkDrawRequest, DRAW_OPTIONS, drawFile, undecidedNote } from './draw'
import { checkExportRequest, EXPORT_OPTIONS, exportFile, exportIntoProject, ExportWriteFailed, leftOutText } from './export'
import type { LeftOutPart } from '@ongrid/floorplan/export'
import { INIT_OPTIONS, initFolder, initProject, InitRefused, initText, PROJECT_FILE, PROJECT_PLAN, projectPlanFile } from './init'
import { helpText, onePlanFile, parseOptions, PROJECT_OPTION, textOf, UsageError, type OptionSpecs } from './options'
import { loadPlan, PlanRefused, type LoadedPlan } from './plan'
import { SHEET_OPTIONS } from './sheet'
import { checkTidyRequest, TIDY_OPTIONS, tidyAppliedText, tidyFile, tidyList, tidyListText } from './tidy'
import { readRoomsFile, RoomsRefused, WRITE_OPTIONS, writeRoomsIntoProject } from './write'

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
  init: {
    usage: 'grid init [<folder>]',
    summary: `Starts a project folder: ${PROJECT_FILE}, a starter ${PROJECT_PLAN} and exports/. Makes the folder when it isn't there.`,
    options: INIT_OPTIONS,
  },
  write: {
    usage: 'grid write <plan.rooms> [--plan <plan.json>] [--replace] [--json] [--project <folder>]',
    summary: 'Writes a plan from rooms text: name the rooms with their sizes and neighbours, and Grid works out the walls. The main way to write a plan.',
    options: WRITE_OPTIONS,
  },
  edit: {
    usage: EDIT_USAGE,
    summary: EDIT_SUMMARY,
    // Each verb takes its own options: grid edit <verb> --help.
    options: {},
  },
  mark: {
    usage: 'grid mark [<name>] [--plan <plan.json>] [--remove] [--project <folder>]',
    summary: `Keeps the plan as it is now under a name (start unless named), beside it, for grid diff --since <name> to compare with: no git needed. At most ${MARKERS_MAX}.`,
    options: MARK_OPTIONS,
  },
  diff: {
    usage: 'grid diff [<plan.json>] [--since <name>|git] [--rooms <ids>] [--show all|summary|changes|issues] [--picture <file.png>] [--floor <id>] [--json] [--project <folder>]',
    summary: 'Says what changed since a start marker or the last commit, by what stands where, not by ids: issues first, then room by room, then each change. --picture draws it.',
    options: DIFF_OPTIONS,
  },
  check: {
    usage: 'grid check [<plan.json>] [--floor <id>] [--country <code>] [--full] [--json] [--seen <n> --reason <text> --by <name> | --unseen <n>] [--project <folder>]',
    summary: 'Checks a plan and prints the report: general guidance, not your local rules. Short, about this plan, unless --full. --seen sets a note aside as seen, with your reason and name, in the marks file beside the plan.',
    options: CHECK_OPTIONS,
  },
  describe: {
    usage: 'grid describe [<plan.json>] [--length line|rooms|walls] [--for person|agent] [--as rooms] [--project <folder>]',
    summary: 'Describes the plan in a few lines: its rooms, which rooms each opening joins, and its walls with --length walls. --for agent adds the ids. --as rooms reads it back as rooms text to change and write again.',
    options: DESCRIBE_OPTIONS,
  },
  draw: {
    usage: 'grid draw [<plan.json>] [--png | --3d | --view <name>] [--facade <side>] [--look <name>] [--hide <parts>] [--colour use] [--key] [--ids] [--out <file>] [--floor <id>] [--scale <n>] [--project <folder>]',
    summary: 'Draws one floor of a plan as an SVG picture, or a PNG with --png, in the technical look unless --look names another, with what grid check finds marked on it by its numbers and listed under it. With --3d, draws the 3D model as the app opens it, as a PNG. With --facade north (east, south or west), draws that side of the building in elevation, every floor at its level.',
    options: DRAW_OPTIONS,
  },
  export: {
    usage: 'grid export [<plan.json>] --format dxf|ifc|glb|obj [--floor <id>] [--out <file>] [--project <folder>]',
    summary: 'Writes the plan as a file for another program, into exports/ beside the plan unless --out names one.',
    options: EXPORT_OPTIONS,
  },
  sheet: {
    usage: 'grid sheet [<plan.json>] --layout client|check [--sheet <sheet.json>] [--out <file.pdf>] [--project <folder>]',
    summary: 'Writes the plan as an A3 PDF for people: client (with the words of sheet.json) or check (ids and findings).',
    options: SHEET_OPTIONS,
  },
  tidy: {
    usage: 'grid tidy [<plan.json>] [--apply <ids>|all] [--out <file.json>] [--json] [--project <folder>]',
    summary: 'Lists the faults where walls meet, each with the fix Grid offers. With --apply, makes the fixes chosen on the plan file.',
    options: TIDY_OPTIONS,
  },
  occupancy: {
    usage: 'grid occupancy [<plan.json>] [--project <folder>]',
    summary: 'Lists who sits where, from the occupancy file beside the plan (plan.occupancy.json), by room. No export carries it.',
    options: PROJECT_OPTION,
  },
  serve: {
    usage: 'grid serve [--project <folder>]',
    summary: "Starts Grid's tool server on standard input and output, for an agent's host to talk to.",
    options: PROJECT_OPTION,
  },
  mcp: {
    usage: 'grid mcp [--project <folder>]',
    summary: 'The same as serve, under the name agents start it by: npx -y ongrid mcp.',
    options: PROJECT_OPTION,
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
  // A name of eight letters or more (describe) still gets a space before its summary.
  ...Object.entries(COMMANDS).map(([name, command]) => `  ${name.length < 8 ? name.padEnd(8) : `${name} `}${command.summary}`),
  '',
  'Run grid <command> --help for its options.',
  '',
  'Grid reads and writes files only inside the project folder: the folder it runs in, or the',
  'one named with --project. The top of a disk and the home folder are never a project folder.',
  'A path outside it, also through a symbolic link, is refused, and so are web addresses,',
  'network paths and names Windows keeps for devices, such as CON or NUL. A relative path',
  'starts from the folder Grid runs in; for the tools of grid serve, from the project folder.',
  '',
  `A project folder that holds ${PROJECT_FILE}, as grid init makes it, is a Grid project. There,`,
  `write writes ${PROJECT_PLAN}, and check, describe, draw, export, sheet, tidy, occupancy, mark and diff read it when no plan file is named, and export`,
  'writes into exports/. grid init never replaces a file: it refuses a folder that already holds',
  `${PROJECT_FILE} or ${PROJECT_PLAN}.`,
  '',
].join('\n')

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Why a file can't be written, in one line; a path outside the project keeps its own refusal. */
function writeRefusal(file: string, error: unknown): unknown {
  if (error instanceof PathRefused) return error
  const code = (error as NodeJS.ErrnoException).code
  if (code === 'ENOENT') return new WriteFailed(`Can't write ${file}: its folder does not exist.`)
  if (code === 'EACCES' || code === 'EPERM') return new WriteFailed(`Can't write ${file}: permission denied.`)
  if (code === 'EISDIR') return new WriteFailed(`Can't write ${file}: it is a folder.`)
  return new WriteFailed(`Can't write ${file}: ${oneLine((error as Error).message)}`)
}

function write(project: Project, file: string, data: string | Uint8Array): string {
  try {
    return project.writeFile(file, data)
  } catch (error) {
    throw writeRefusal(file, error)
  }
}

/** Refuses, as `write` would, a file whose folder is missing or whose name is a folder, writing nothing. */
function checkWritable(project: Project, file: string): void {
  try {
    project.writable(file)
  } catch (error) {
    throw writeRefusal(file, error)
  }
}

/**
 * Says, on standard error, which parts a picture or an export leaves out. An export says what its
 * own file leaves out (HND-6, `exported`); a picture, what the plan cannot draw.
 */
function warnLeftOut(io: CommandIo, loaded: LoadedPlan, exported?: readonly LeftOutPart[]): void {
  // MSG-6: a part the reader left out is named by its id, or its place when it has none.
  const faults = loaded.faults ?? []
  const read = faults.flatMap((f) => (f.kind === 'read-as-meant' || f.kind === 'value-left-out' ? [] : [f.part.id ?? `${f.part.list}[${f.part.index}]`]))
  const ids = [...new Set([...loaded.broken, ...read])].sort()
  const otherwise = faults.length - read.length
  if (otherwise > 0) io.stderr(`Read ${otherwise} value${otherwise === 1 ? '' : 's'} otherwise than written. grid check says which.\n`)
  if (exported !== undefined) {
    const line = leftOutText(exported)
    if (line !== null) io.stderr(`${line}\n`)
    return
  }
  if (ids.length === 0) return
  const list = ids.length > 5 ? `${ids.slice(0, 5).join(', ')} and ${ids.length - 5} more` : ids.join(', ')
  io.stderr(`Left out ${ids.length} part${ids.length === 1 ? '' : 's'} that can't be drawn: ${list}. grid check says why.\n`)
}

/**
 * MSG-10: what `--seen` or `--unseen` asks, checked: a number, and with `--seen` a reason and a
 * name. `--reason` and `--by` mean nothing without `--seen`, and are refused by name.
 */
function markAsk(parsed: ReturnType<typeof parseOptions>): MarkAsk | null {
  const seen = textOf(parsed, '--seen')
  const unseen = textOf(parsed, '--unseen')
  const reason = textOf(parsed, '--reason')
  const by = textOf(parsed, '--by')
  if (seen !== undefined && unseen !== undefined) throw new UsageError('--seen and --unseen were both given: give one.')
  if (seen === undefined) {
    if (reason !== undefined) throw new UsageError('--reason goes with --seen <n>: it is why that note is set aside.')
    if (by !== undefined) throw new UsageError('--by goes with --seen <n>: it is who sets that note aside.')
  }
  const value = seen ?? unseen
  if (value === undefined) return null
  const flag = seen !== undefined ? '--seen' : '--unseen'
  if (!/^[1-9]\d{0,6}$/.test(value)) throw new UsageError(`${flag} takes the number of a note in the report, such as 3.`)
  const number = Number(value)
  if (seen === undefined) return { mark: 'unseen', number }
  if (reason === undefined) throw new UsageError('--seen needs --reason: why the note is set aside, in one line.')
  if (by === undefined) throw new UsageError('--seen needs --by: who sets it aside, as the name or role you give.')
  return { mark: 'seen', number, reason, by }
}

async function runCommand(name: CommandName, args: readonly string[], io: CommandIo): Promise<number> {
  if (name === 'edit') {
    await runEdit(args, io.cwd, (text) => io.stdout(text))
    return EXIT_OK
  }
  const command = COMMANDS[name]
  const parsed = parseOptions(name, args, { ...command.options, ...HELP_FLAG })
  if (parsed.values.has('--help')) {
    io.stdout(helpText(command.usage, command.summary, command.options))
    return EXIT_OK
  }

  const projectOption = textOf(parsed, '--project')

  if (name === 'serve' || name === 'mcp') {
    if (parsed.positionals.length > 0) throw new UsageError(`${name} takes no arguments: got ${parsed.positionals.join(', ')}.`)
    let project: Project | PathRefused
    try {
      project = openProject(projectOption, io.cwd, 'project')
    } catch (error) {
      // A folder named with --project must be right before the server starts. The folder it
      // runs in may not be one, as when a host starts it at the top of the disk: then the
      // preview still works and each file tool answers with the reason.
      if (!(error instanceof PathRefused) || projectOption !== undefined) throw error
      project = error
    }
    startToolServer(projectTools(project))
    return EXIT_OK
  }

  if (name === 'init') {
    const folder = initFolder(parsed.positionals)
    io.stdout(initText(initProject(folder, io.cwd), folder))
    return EXIT_OK
  }

  if (name === 'write') {
    if (parsed.positionals.length !== 1) throw new UsageError(`write takes one rooms text file: grid write <plan.rooms>${parsed.positionals.length > 1 ? `, but was given ${parsed.positionals.length}` : ''}.`)
    const roomsFile = parsed.positionals[0]!
    if (roomsFile === '-') throw new UsageError('write reads rooms text from a file, not from standard input: name the file.')
    if (roomsFile.toLowerCase().endsWith('.json')) throw new UsageError(`write reads rooms text, not a plan: ${JSON.stringify(roomsFile)} ends in .json. Name the plan to write with --plan.`)
    const project = openProject(projectOption, io.cwd)
    const target = textOf(parsed, '--plan') ?? projectPlanFile(project)
    if (target === null) throw new UsageError(`write needs a plan to write: --plan <plan.json>, or run it in a project folder grid init made, which holds ${PROJECT_FILE}.`)
    const done = writeRoomsIntoProject(project, readRoomsFile(project, roomsFile), target, { replace: parsed.values.has('--replace') })
    if (parsed.values.has('--json')) {
      const r = done.result
      io.stdout(`${JSON.stringify({ label: GENERAL_GUIDANCE_LABEL, written: done.written, rooms: r.rooms, walls: r.walls.map((w) => ({ id: w.id, kind: w.kind, virtual: w.virtual, thickness: w.thickness, length: w.length, rooms: w.rooms })), openings: r.openings, guesses: r.guesses, warnings: r.warnings, sizes: r.sizes, verdict: done.verdict, drawingProblems: done.drawingProblems }, null, 2)}\n`)
    } else io.stdout(`${[GENERAL_GUIDANCE_LABEL, ...done.lines].join('\n')}\n`)
    return EXIT_OK
  }

  if (name === 'mark') {
    if (parsed.positionals.length > 1) throw new UsageError(`mark takes one marker name: grid mark [<name>], but was given ${parsed.positionals.length}.`)
    const marker = parsed.positionals[0]
    if (marker !== undefined && marker.toLowerCase().endsWith('.json')) throw new UsageError(`mark takes a marker name, not a plan: ${JSON.stringify(marker)} ends in .json. Name the plan with --plan.`)
    const project = openProject(projectOption, io.cwd)
    const target = textOf(parsed, '--plan') ?? projectPlanFile(project)
    if (target === null) throw new UsageError(`mark needs a plan: --plan <plan.json>, or run it in a project folder grid init made, which holds ${PROJECT_FILE}.`)
    io.stdout(runMark(project, target, marker, parsed.values.has('--remove')))
    return EXIT_OK
  }

  // A plan file named on the command line, or else the plan of the Grid project it runs in.
  let planFile: string
  if (parsed.positionals.length > 0) {
    planFile = onePlanFile(name, parsed.positionals)
  } else {
    const found = projectPlanFile(openProject(projectOption, io.cwd))
    if (found === null) {
      throw new UsageError(`${name} needs a plan file: grid ${name} <plan.json>, or run it in a project folder grid init made, which holds ${PROJECT_FILE}.`)
    }
    planFile = found
  }

  if (name === 'check') {
    const json = parsed.values.has('--json')
    const ask = markAsk(parsed)
    const project = openProject(projectOption, io.cwd)
    const loaded = loadPlan(project, planFile)
    const country = textOf(parsed, '--country')
    // MSG-10: a number is the note's in the whole plan's report, whatever --floor shows.
    const done: MarkDone | null = ask === null ? null : markNote(project, planFile, loaded, checkPlan(loaded, { country }), ask, ask.mark === 'seen' ? '--seen' : '--unseen')
    const result = withSeen(checkPlan(loaded, { floor: textOf(parsed, '--floor'), country }), loaded, readSeen(project, planFile))
    if (json) io.stdout(checkJson(result, done ?? undefined))
    else {
      const text = checkText(result, planFloors(loaded.plan).length, { full: parsed.values.has('--full') })
      // The label stays the first line; what was marked comes right after it.
      io.stdout(done === null ? text : text.replace('\n', `\n${done.text}\n`))
    }
    return EXIT_OK
  }

  if (name === 'diff') {
    const project = openProject(projectOption, io.cwd)
    const request = { since: textOf(parsed, '--since'), rooms: textOf(parsed, '--rooms'), show: textOf(parsed, '--show'), picture: textOf(parsed, '--picture'), floor: textOf(parsed, '--floor') }
    const done = await runDiff(project, planFile, request)
    if (done.png !== null && request.picture !== undefined) {
      const written = project.shown(write(project, request.picture, done.png))
      io.stdout(parsed.values.has('--json') ? done.json : `${done.text}Wrote the picture of floor ${JSON.stringify(done.floor)} to ${written}\n`)
    } else io.stdout(parsed.values.has('--json') ? done.json : done.text)
    return EXIT_OK
  }

  if (name === 'describe') {
    const request = { length: textOf(parsed, '--length'), for: textOf(parsed, '--for'), as: textOf(parsed, '--as') }
    const { length, audience, as } = checkDescribeRequest(request)
    const loaded = loadPlan(openProject(projectOption, io.cwd), planFile)
    io.stdout(as === 'rooms' ? describeRooms(loaded) : describePlan(loaded, length, audience))
    return EXIT_OK
  }

  if (name === 'draw') {
    const request = {
      png: parsed.values.has('--png'),
      // VEW-3: a saved view is the 3D model through its camera.
      threeD: parsed.values.has('--3d') || parsed.values.has('--view'),
      view: textOf(parsed, '--view'),
      facade: textOf(parsed, '--facade'),
      out: textOf(parsed, '--out'),
      floor: textOf(parsed, '--floor'),
      scale: textOf(parsed, '--scale'),
      ids: parsed.values.has('--ids'),
      units: textOf(parsed, '--units'),
      decimal: textOf(parsed, '--decimal'),
      look: textOf(parsed, '--look'),
      hide: textOf(parsed, '--hide'),
      colour: textOf(parsed, '--colour'),
      key: parsed.values.has('--key'),
    }
    const { scale, look } = checkDrawRequest(request)
    if ((request.png || request.threeD) && request.out === undefined && io.stdoutIsTerminal) {
      throw new UsageError('A PNG is not shown in a terminal: name a file with --out, or send the output to a file or another program.')
    }
    const project = openProject(projectOption, io.cwd)
    const loaded = loadPlan(project, planFile)
    const { file: picture, undecidedDoors } = await drawFile(loaded, request, scale, look)
    warnLeftOut(io, loaded)
    const undecided = undecidedNote(undecidedDoors)
    if (undecided) io.stderr(undecided)
    if (request.out === undefined) {
      io.stdout(picture)
    } else {
      io.stdout(`Wrote ${project.shown(write(project, request.out, picture))}\n`)
    }
    return EXIT_OK
  }

  if (name === 'tidy') {
    const json = parsed.values.has('--json')
    const out = textOf(parsed, '--out')
    const ids = checkTidyRequest({ apply: textOf(parsed, '--apply'), out })
    const project = openProject(projectOption, io.cwd)
    // CMD-15: --out is checked even when no fix is made and nothing is written.
    if (out !== undefined) project.resolve(out)
    // Read whole: tidy writes the file back, and must not drop a part the reader would leave out.
    const loaded = loadPlan(project, planFile, { whole: true })
    if (ids === null) {
      const list = tidyList(loaded)
      io.stdout(json ? `${JSON.stringify(list, null, 2)}\n` : tidyListText(list))
      return EXIT_OK
    }
    const done = tidyFile(project, planFile, ids)
    const written = done.text === null ? null : project.shown(write(project, out ?? planFile, done.text))
    const result = { label: GENERAL_GUIDANCE_LABEL, applied: done.applied, skipped: done.skipped, left: done.left, written }
    io.stdout(json ? `${JSON.stringify(result, null, 2)}\n` : tidyAppliedText(result))
    return EXIT_OK
  }

  if (name === 'occupancy') {
    const project = openProject(projectOption, io.cwd)
    const loaded = loadPlan(project, planFile)
    const read = readOccupancy(project, planFile)
    if (read === null) {
      throw new OccupancyRefused(`There is no ${project.shown(project.resolve(occupancyFileOf(planFile)))}: who sits where is kept in that file, beside the plan and apart from it.`)
    }
    io.stdout(occupancyText(project.shown(read.file), linkSeats(loaded.plan, read.occupancy)))
    return EXIT_OK
  }

  if (name === 'sheet') {
    const request = { layout: textOf(parsed, '--layout'), sheet: textOf(parsed, '--sheet'), out: textOf(parsed, '--out') }
    const layout = checkSheetRequest(request)
    const project = openProject(projectOption, io.cwd)
    const words = layout === 'client' ? readSheetWords(project, planFile, loadPlan(project, planFile), request.sheet) : null
    if (request.out === undefined) {
      const done = await sheetIntoProject(project, planFile, layout, words)
      warnLeftOut(io, done.loaded)
      if (done.note) io.stderr(`${done.note}\n`)
      io.stdout(`Wrote ${project.shown(done.written)}\n`)
      return EXIT_OK
    }
    // Drawing a large plan takes seconds: a file that can't be written is refused first.
    checkWritable(project, request.out)
    const made = await makeSheet(project, planFile, layout, words)
    warnLeftOut(io, made.loaded)
    if (made.note) io.stderr(`${made.note}\n`)
    io.stdout(`Wrote ${project.shown(write(project, request.out, made.pdf))}\n`)
    return EXIT_OK
  }

  const request = { format: textOf(parsed, '--format'), floor: textOf(parsed, '--floor'), out: textOf(parsed, '--out') }
  const format = checkExportRequest(request)
  const project = openProject(projectOption, io.cwd)
  if (request.out === undefined) {
    const done = exportIntoProject(project, planFile, format, request)
    warnLeftOut(io, done.loaded, done.leftOut)
    if (done.note) io.stderr(`${done.note}\n`)
    io.stdout(`Wrote ${project.shown(done.written)}\n`)
    return EXIT_OK
  }
  const loaded = loadPlan(project, planFile)
  const made = exportFile(loaded, planFile, format, request)
  warnLeftOut(io, loaded, made.leftOut)
  io.stdout(`Wrote ${project.shown(write(project, request.out, made.data))}\n`)
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
    if (error instanceof PlanRefused || error instanceof RoomsRefused || error instanceof EditCommandRefused || error instanceof PathRefused || error instanceof TextNotDecoded || error instanceof WriteFailed || error instanceof ExportWriteFailed || error instanceof InitRefused || error instanceof OccupancyRefused || error instanceof SeenRefused || error instanceof MarkerRefused || error instanceof GitUnread || error instanceof CanvasMissing || error instanceof FontsMissing) {
      io.stderr(`grid: ${error.message}\n`)
      return EXIT_REFUSED
    }
    // Anything else is Grid's own fault. Still one line first, then the detail for a bug report.
    io.stderr(`grid: something went wrong inside Grid: ${oneLine(String((error as Error)?.message ?? error))}\n`)
    if (error instanceof Error && error.stack) io.stderr(`${error.stack}\n`)
    return EXIT_REFUSED
  }
}
