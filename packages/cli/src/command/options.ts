/**
 * Strict options for each `grid` command.
 *
 * Every command lists the options it takes. Anything else is refused by name: an option the
 * command does not take, one given twice, a value given to a switch, or a missing value. A
 * repeated option is never resolved by keeping the first or the last: the person meant one of
 * them, and Grid can't tell which.
 */

/** Why a command line was refused. The message is one line and names the option. */
export class UsageError extends Error {
  override readonly name = 'UsageError'
}

/** An option a command takes: a switch (`--png`) or one that takes a value (`--floor first`). */
export interface OptionSpec {
  readonly takesValue: boolean
  /** One line for the command's help, after the option's name. */
  readonly help: string
}

export type OptionSpecs = Readonly<Record<`--${string}`, OptionSpec>>

/** Every command that reads or writes a file takes it. See `fs/projectFiles.ts`. */
export const PROJECT_OPTION: OptionSpecs = {
  '--project': {
    takesValue: true,
    help: 'The project folder. Grid reads and writes files only inside it. The folder Grid runs in when left out.',
  },
}

export interface ParsedArgs {
  readonly positionals: readonly string[]
  /** A switch's value is `true`; any other option's value is its text. */
  readonly values: ReadonlyMap<string, string | true>
}

function optionList(specs: OptionSpecs): string {
  const names = Object.keys(specs)
  return names.length === 0 ? 'It takes no options.' : `Its options: ${names.join(', ')}.`
}

/**
 * Reads a command's arguments (`command` is its name, such as `check`): `--name value`, `--name=value`, switches, and the plan file.
 * Everything after `--` is a file name, even when it starts with a dash.
 *
 * When several things are wrong, the first message names the one that can't be fixed by
 * changing a value: an unknown option first, then one given twice, then a missing or stray
 * value.
 */
export function parseOptions(command: string, args: readonly string[], specs: OptionSpecs): ParsedArgs {
  const unknown: string[] = []
  const repeated: string[] = []
  const values: string[] = []
  const seen = new Map<string, string | true>()
  const positionals: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--') {
      positionals.push(...args.slice(i + 1))
      break
    }
    if (!arg.startsWith('-') || arg === '-') {
      positionals.push(arg)
      continue
    }
    const eq = arg.indexOf('=')
    const name = eq === -1 ? arg : arg.slice(0, eq)
    const spec = name.startsWith('--') ? specs[name as `--${string}`] : undefined
    if (!spec) {
      unknown.push(`${command} has no option ${JSON.stringify(name)}. ${optionList(specs)}`)
      // An unknown option's value, if it has one, can't be told from a file name. Nothing
      // runs anyway, so the rest is read as best it can be.
      continue
    }
    if (seen.has(name)) {
      repeated.push(`${name} was given more than once. Give it once.`)
      if (spec.takesValue && eq === -1) i++
      continue
    }
    if (!spec.takesValue) {
      if (eq !== -1) values.push(`${name} is a switch and takes no value: use ${name} on its own.`)
      seen.set(name, true)
      continue
    }
    const value = eq === -1 ? args[i + 1] : arg.slice(eq + 1)
    if (eq === -1) i++
    if (value === undefined || value === '' || (eq === -1 && value.startsWith('--'))) {
      values.push(`${name} needs a value.`)
      if (eq === -1 && value !== undefined && value.startsWith('--')) i--
      continue
    }
    seen.set(name, value)
  }

  const problems = [...unknown, ...repeated, ...values]
  if (problems.length > 0) {
    const more = problems.length - 1
    throw new UsageError(more === 0 ? problems[0] : `${problems[0]} (and ${more} more problem${more === 1 ? '' : 's'})`)
  }
  return { positionals, values: seen }
}

/** The one plan file a command takes. */
export function onePlanFile(command: string, positionals: readonly string[]): string {
  if (positionals.length === 0) throw new UsageError(`${command} needs a plan file: grid ${command} <plan.json>`)
  if (positionals.length > 1) {
    throw new UsageError(`${command} takes one plan file, but was given ${positionals.length}: ${positionals.join(', ')}`)
  }
  const file = positionals[0]!
  if (file === '-') throw new UsageError(`${command} reads a plan from a file, not from standard input: name the file.`)
  return file
}

/** The text of an option that takes a value, or undefined when it was not given. */
export function textOf(parsed: ParsedArgs, name: string): string | undefined {
  const value = parsed.values.get(name)
  return typeof value === 'string' ? value : undefined
}

export function helpText(usage: string, summary: string, specs: OptionSpecs): string {
  const names = Object.keys(specs) as Array<keyof OptionSpecs>
  const width = Math.max(0, ...names.map((name) => name.length + (specs[name]!.takesValue ? 8 : 0)))
  const lines = names.map((name) => {
    const spec = specs[name]!
    const shown = spec.takesValue ? `${name} <value>` : name
    return `  ${shown.padEnd(width + 2)}${spec.help}`
  })
  return [`Usage: ${usage}`, '', summary, ...(lines.length > 0 ? ['', 'Options:', ...lines] : []), ''].join('\n')
}
