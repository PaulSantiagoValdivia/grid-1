// @ts-check
/**
 * QAR-10: the release step. One run cuts a version and stops before publishing:
 *
 *   1. checks the version against the rule in RELEASING.md;
 *   2. writes it: CHANGELOG.md's "Unreleased" becomes the release's section, the changelog for
 *      agents in docs/result-contract.md gets the release's heading, and every package.json and
 *      the lock file get the version;
 *   3. runs every gate in `release/gates.mjs`, in order, on what it wrote; the first that fails
 *      stops the release by name;
 *   4. packs the package (`packages/cli/pack.mjs`) and checks the tarball: the version, still
 *      private, and the provenance settings;
 *   5. writes `release.json` beside the tarball: the commit it was built from, the tarball's
 *      integrity, the gates passed, and the publish command that waits on the owner's yes.
 *
 * Nothing is published, pushed or tagged. With --dry-run every file it wrote in step 2 is put
 * back at the end, and copies of the two changelogs go beside the tarball to read. A failed
 * gate puts them back too, so a release is all or nothing.
 *
 * Usage: node scripts/release.mjs <version> [--dry-run] [--date YYYY-MM-DD] [--out <folder>] [--max-workers <n>]
 *        (default out: dist/release/<version>, which git ignores)
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { GATES } from './release/gates.mjs'
import {
  lastRelease,
  parseVersion,
  readPlanFormat,
  readResultVersion,
  releaseAgentChangelog,
  releaseChangelog,
  versionProblem,
  withVersion,
} from './release/prepare.mjs'

/** @typedef {import('./release/gates.mjs').Gate} Gate */
/** @typedef {{ name: string, command: string, args: string[] }} Step */
/**
 * @typedef {{
 *   root: string,
 *   version: string,
 *   date: string,
 *   dryRun: boolean,
 *   out?: string,
 *   steps?: Step[],
 *   pack?: (folder: string) => string,
 *   log?: (line: string) => void,
 * }} Options
 */

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const windows = process.platform === 'win32'

export class Refused extends Error {}

/** How this computer runs npm: the npm that started this script when there is one. */
function npm() {
  const execpath = process.env['npm_execpath']
  return execpath && /npm-cli\.[cm]?js$/.test(execpath) ? { command: process.execPath, args: [execpath] } : { command: 'npm', args: [] }
}

/**
 * The gates as commands to run.
 * @param {string} root
 * @param {readonly Gate[]} gates
 * @param {number | undefined} maxWorkers
 * @returns {Step[]}
 */
export function gateSteps(root, gates, maxWorkers) {
  return gates.map((gate) => {
    if (gate.npm !== undefined) {
      const { command, args } = npm()
      return { name: gate.name, command, args: [...args, 'run', gate.npm] }
    }
    const workers = maxWorkers === undefined ? [] : [`--maxWorkers=${maxWorkers}`]
    return { name: gate.name, command: process.execPath, args: [join(root, 'node_modules', 'vitest', 'vitest.mjs'), 'run', ...(gate.vitest ?? []), ...workers] }
  })
}

/**
 * @param {string} root
 * @param {string[]} args
 * @returns {string | null}
 */
function git(root, args) {
  const run = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  return run.status === 0 ? run.stdout.trim() : null
}

/**
 * The package.json at `package/package.json` in a packed tarball.
 * @param {Buffer} tgz
 * @returns {Record<string, unknown>}
 */
export function packedManifest(tgz) {
  const tar = gunzipSync(tgz)
  for (let at = 0; at + 512 <= tar.length;) {
    const header = tar.subarray(at, at + 512)
    if (header.every((byte) => byte === 0)) break
    const text = (/** @type {number} */ from, /** @type {number} */ to) => header.subarray(from, to).toString('utf8').replace(/\0.*$/s, '')
    const prefix = text(345, 500)
    const name = prefix === '' ? text(0, 100) : `${prefix}/${text(0, 100)}`
    const size = parseInt(text(124, 136).trim() || '0', 8)
    if (name === 'package/package.json') return JSON.parse(tar.subarray(at + 512, at + 512 + size).toString('utf8'))
    at += 512 + Math.ceil(size / 512) * 512
  }
  throw new Refused('the tarball holds no package/package.json.')
}

/**
 * The npm tag a version is published under: a preview's first word, or latest.
 * @param {string} version
 */
export function distTag(version) {
  const first = parseVersion(version)?.pre[0]
  return first === undefined ? 'latest' : typeof first === 'string' ? first : 'next'
}

/**
 * The files the release writes, by path from the root.
 * @param {string} root
 * @returns {string[]}
 */
function manifests(root) {
  const packages = readdirSync(join(root, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, 'packages', entry.name, 'package.json')))
    .map((entry) => `packages/${entry.name}/package.json`)
    .sort()
  return ['package.json', ...packages]
}

/**
 * Pack the package with `packages/cli/pack.mjs` into `folder` and return the tarball's path.
 * @param {string} root
 * @returns {(folder: string) => string}
 */
function packWith(root) {
  return (folder) => {
    const run = spawnSync(process.execPath, [join(root, 'packages', 'cli', 'pack.mjs'), '--out', folder], { cwd: root, stdio: 'inherit' })
    if (run.status !== 0) throw new Refused('packing failed (packages/cli/pack.mjs).')
    const tarballs = readdirSync(folder).filter((name) => name.endsWith('.tgz'))
    if (tarballs.length !== 1) throw new Refused(`packing left ${tarballs.length} tarballs in ${folder}.`)
    return join(folder, /** @type {string} */ (tarballs[0]))
  }
}

/**
 * Cut a release, as the header says. Throws Refused, naming the reason, when it stops early.
 * @param {Options} options
 * @returns {Record<string, unknown>} the release record, as written to release.json
 */
export function release(options) {
  const { root, version, date, dryRun } = options
  const log = options.log ?? ((line) => process.stdout.write(`${line}\n`))
  const read = (/** @type {string} */ path) => readFileSync(join(root, path), 'utf8')
  const out = resolve(options.out ?? join(root, 'dist', 'release', version))

  // 1. The version, against the rule. Nothing is written before every check here holds.
  const files = manifests(root)
  const current = JSON.parse(read('packages/cli/package.json')).version
  for (const path of files) {
    const held = JSON.parse(read(path)).version
    if (held !== current) throw new Refused(`${path} holds ${held} and packages/cli/package.json ${current}: every package carries one version.`)
  }
  const changelog = read('CHANGELOG.md')
  const contract = read('docs/result-contract.md')
  const last = lastRelease(changelog)
  const resultVersion = readResultVersion(read('packages/rules/src/result/types.ts'))
  const planFormat = readPlanFormat(read('packages/floorplan/src/types/floorplan.ts'))
  const problem = versionProblem({ current, next: version, last, resultVersion, planFormat })
  if (problem) throw new Refused(problem)
  const commit = git(root, ['rev-parse', 'HEAD'])
  const status = git(root, ['status', '--porcelain'])
  const clean = status === ''
  if (!dryRun && !clean) throw new Refused('the working tree has changes: commit them first, or run with --dry-run.')
  if (existsSync(out) && readdirSync(out).length > 0 && !existsSync(join(out, 'release.json'))) {
    throw new Refused(`${out} holds files that are not a release: name an empty folder.`)
  }

  // 2. What the release writes: both changelogs and every version, all or nothing.
  const cut = { version, date, resultVersion, planFormat }
  /** @type {Map<string, string>} */
  const written = new Map([
    ['CHANGELOG.md', releaseChangelog(changelog, cut)],
    ['docs/result-contract.md', releaseAgentChangelog(contract, cut)],
    ...files.map((path) => /** @type {[string, string]} */ ([path, withVersion(read(path), version, false)])),
    ['package-lock.json', withVersion(read('package-lock.json'), version, true)],
  ])
  /** @type {Map<string, string>} */
  const originals = new Map([...written.keys()].map((path) => [path, read(path)]))
  let keep = false
  try {
    for (const [path, text] of written) writeFileSync(join(root, path), text)
    log(`Cut ${version} (${date}): CHANGELOG.md, the changelog for agents and ${files.length} package.json files, with the lock file.`)

    // 3. The gates, in order. The first that fails stops the release.
    const steps = options.steps ?? gateSteps(root, GATES, undefined)
    const passed = []
    for (const step of steps) {
      log(`Gate: ${step.name}`)
      const run = spawnSync(step.command, step.args, { cwd: root, stdio: 'inherit', shell: windows && step.command === 'npm' })
      if (run.status !== 0) throw new Refused(`the ${step.name} gate failed, so nothing was packed. ${dryRun ? 'Nothing was kept' : 'Every file the release wrote is as it was'}.`)
      passed.push(step.name)
    }

    // 4. The tarball, and what it must say.
    rmSync(out, { recursive: true, force: true })
    mkdirSync(out, { recursive: true })
    const tarball = (options.pack ?? packWith(root))(join(out, 'pack'))
    const bytes = readFileSync(tarball)
    const manifest = packedManifest(bytes)
    const publishConfig = /** @type {Record<string, unknown> | undefined} */ (manifest['publishConfig'])
    if (manifest['version'] !== version) throw new Refused(`the tarball holds version ${String(manifest['version'])}, not ${version}.`)
    if (manifest['private'] !== true) throw new Refused('the tarball is not private: it stays private until the owner says yes (CMD-8).')
    if (publishConfig?.['provenance'] !== true) throw new Refused('the tarball is not set to publish with provenance (publishConfig.provenance).')

    // 5. The record: where it came from, what it holds, and what waits on the owner.
    const file = relative(out, tarball).split(sep).join('/')
    const record = {
      release: version,
      date,
      dryRun,
      builtFrom: { commit, workingTreeClean: clean, node: process.version },
      resultVersion,
      planFormat,
      package: {
        name: manifest['name'],
        file,
        size: bytes.length,
        integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
        repository: manifest['repository'],
        publishConfig,
      },
      gates: passed,
      published: false,
      publishing: {
        waitsOn: "the owner's yes, recorded in RELEASING.md (CMD-8)",
        from: 'the release workflow only, so npm can record the run and the commit',
        command: `npm publish ${file} --provenance --access public --tag ${distTag(version)}`,
      },
    }
    writeFileSync(join(out, 'release.json'), `${JSON.stringify(record, null, 2)}\n`)
    writeFileSync(join(out, 'CHANGELOG.md'), /** @type {string} */ (written.get('CHANGELOG.md')))
    writeFileSync(join(out, 'result-contract.md'), /** @type {string} */ (written.get('docs/result-contract.md')))
    keep = !dryRun
    const shown = relative(root, out).split(sep).join('/')
    log(`Packed ${file} into ${shown}, with release.json (built from ${commit ?? 'no commit'}${clean ? '' : ', with changes not committed'}).`)
    log(dryRun
      ? 'Dry run: every file the release wrote is back as it was; the changelogs it wrote are beside the tarball.'
      : `Next: read the diff, commit it as "chore(release): ${version}" and tag it v${version}.`)
    log("Stopped before publishing: publishing waits on the owner's yes (CMD-8). Nothing was published.")
    return record
  } finally {
    if (!keep) for (const [path, text] of originals) writeFileSync(join(root, path), text)
  }
}

/**
 * @param {string[]} argv
 * @returns {number} the exit code
 */
export function main(argv) {
  const usage = 'Usage: node scripts/release.mjs <version> [--dry-run] [--date YYYY-MM-DD] [--out <folder>] [--max-workers <n>]'
  /** @type {string | undefined} */
  let version
  let dryRun = false
  let date = new Date().toISOString().slice(0, 10)
  /** @type {string | undefined} */
  let out
  /** @type {number | undefined} */
  let maxWorkers
  const seen = new Set()
  for (let i = 0; i < argv.length; i++) {
    const arg = /** @type {string} */ (argv[i])
    if (arg.startsWith('--')) {
      if (seen.has(arg)) return refuse(`${arg} is given twice. ${usage}`, 2)
      seen.add(arg)
    }
    const value = () => {
      const next = argv[++i]
      if (next === undefined || next.startsWith('--')) throw new Refused(`${arg} needs a value. ${usage}`)
      return next
    }
    try {
      if (arg === '--dry-run') dryRun = true
      else if (arg === '--date') date = value()
      else if (arg === '--out') out = resolve(value())
      else if (arg === '--max-workers') {
        const n = Number(value())
        if (!Number.isInteger(n) || n < 1) return refuse(`--max-workers takes a whole number above 0. ${usage}`, 2)
        maxWorkers = n
      } else if (!arg.startsWith('--') && version === undefined) version = arg
      else return refuse(`unknown option ${JSON.stringify(arg)}. ${usage}`, 2)
    } catch (error) {
      return refuse(error instanceof Error ? error.message : String(error), 2)
    }
  }
  if (version === undefined) return refuse(`name the version. ${usage}`, 2)
  try {
    release({ root: REPO, version, date, dryRun, out, steps: gateSteps(REPO, GATES, maxWorkers) })
    return 0
  } catch (error) {
    if (error instanceof Refused || error instanceof Error) return refuse(error.message, 1)
    throw error
  }
}

/**
 * @param {string} message
 * @param {number} code
 */
function refuse(message, code) {
  process.stderr.write(`release: ${message}\n`)
  return code
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2))
