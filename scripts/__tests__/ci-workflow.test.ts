import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * QAR-4: the checks on GitHub. One workflow, `.github/workflows/ci.yml`, runs every gate on
 * Node 22 for every pull request and every push to main, on Linux and on Windows, reading the
 * repository and nothing else. GitHub itself cannot run here: this holds the file to what it
 * must say, and the same commands run locally.
 */

const root = resolve(__dirname, '../..')
const workflows = join(root, '.github/workflows')
const ci = readFileSync(join(workflows, 'ci.yml'), 'utf8')
const scripts = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts

/** The lines of a YAML file that are not comments. */
function code(text: string): string[] {
  return text.split('\n').filter((line) => !/^\s*#/.test(line)).map((line) => line.replace(/\s+#.*$/, ''))
}

describe('the CI workflow', () => {
  it('runs on every pull request and on pushes to main', () => {
    expect(ci).toMatch(/^on:\n {2}pull_request:\n {2}push:\n {4}branches: \[main\]$/m)
  })

  it('runs on Linux and on Windows, on Node 22', () => {
    expect(ci).toMatch(/^ {8}os: \[ubuntu-latest, windows-latest\]$/m)
    expect(ci).toMatch(/runs-on: \$\{\{ matrix\.os \}\}/)
    expect(ci).toMatch(/node-version-file: \.nvmrc/)
    expect(readFileSync(join(root, '.nvmrc'), 'utf8').trim()).toBe('22')
  })

  it('runs every gate, in order, each a script of package.json', () => {
    const runs = code(ci).map((line) => /^\s*- run: (.+)$/.exec(line)?.[1]).filter((run): run is string => run !== undefined)
    expect(runs).toEqual(['npm ci', 'npm run build', 'npm run typecheck', 'npm run lint', 'npm test', 'npm run check:licenses', 'npm run check:data', 'npm run scoreboard'])
    for (const run of runs.slice(1)) {
      const script = run === 'npm test' ? 'test' : run.replace(/^npm run /, '')
      expect(scripts[script], run).toBeDefined()
    }
  })

  it('gives every job a time limit and lets one system fail without stopping the other', () => {
    expect(ci).toMatch(/^ {4}timeout-minutes: \d+$/m)
    expect(ci).toMatch(/^ {6}fail-fast: false$/m)
  })

  it('gives the scoreboard 10 minutes at most (QAR-1)', () => {
    const limit = ci.match(/^ {6}- run: npm run scoreboard\r?\n {8}timeout-minutes: (\d+)$/m)
    expect(limit, 'the scoreboard step has its own time limit').not.toBeNull()
    expect(Number(limit![1])).toBeLessThanOrEqual(10)
  })
})

describe('every workflow', () => {
  const files = readdirSync(workflows).filter((name) => /\.ya?ml$/.test(name))

  it.each(files)('%s reads the repository and nothing more', (name) => {
    const text = code(readFileSync(join(workflows, name), 'utf8')).join('\n')
    expect(text).toMatch(/^permissions:\n {2}contents: read$/m)
    // No other permission, at the top or in a job, and no secret.
    expect(text.match(/permissions:/g)).toHaveLength(1)
    expect(text).not.toMatch(/: write\b/)
    expect(text).not.toMatch(/secrets\./)
    expect(text).not.toMatch(/pull_request_target/)
  })

  it.each(files)('%s pins every action to a commit, with its release beside it', (name) => {
    const uses = readFileSync(join(workflows, name), 'utf8').split('\n').filter((line) => /^\s*- uses: /.test(line))
    expect(uses.length).toBeGreaterThan(0)
    for (const line of uses) expect(line, line).toMatch(/^\s*- uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/)
  })

  it.each(files)('%s keeps no git credentials on the runner', (name) => {
    const text = readFileSync(join(workflows, name), 'utf8')
    const checkouts = text.match(/uses: actions\/checkout@/g)?.length ?? 0
    expect(text.match(/persist-credentials: false/g)?.length ?? 0).toBe(checkouts)
  })
})

describe('line endings', () => {
  it('are LF on every checkout, Windows too, and binary files are kept as they are', () => {
    const attributes = readFileSync(join(root, '.gitattributes'), 'utf8')
    expect(code(attributes)).toContain('* text=auto eol=lf')
    expect(code(attributes)).toContain('scoreboard/data/*.gz binary')
  })
})
