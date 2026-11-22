// @ts-check
/**
 * QAR-10: what the release step writes, as pure functions on text. `scripts/release.mjs` reads
 * the files, calls these and writes what they return; nothing here touches a file.
 *
 * - The version rule (RELEASING.md): a version is three numbers with an optional preview part.
 *   When the result record's version (`RESULT_VERSION`, MSG-1) or the plan format's version
 *   (CNT-1) has risen since the last release, the release must raise the breaking number: the
 *   major, or the minor while the major is 0.
 * - CHANGELOG.md, for people: what is under "## Unreleased" becomes the release's section.
 * - The changelog for agents, in docs/result-contract.md: the release's heading goes above the
 *   entries written since the last release, which keep their own dated headings.
 */

/** @typedef {{ major: number, minor: number, patch: number, pre: Array<string | number> }} Version */
/** @typedef {{ version: string, date: string, resultVersion: number, planFormat: number }} Release */

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * @param {string} text
 * @returns {Version | null}
 */
export function parseVersion(text) {
  const m = VERSION.exec(text)
  if (!m) return null
  const pre = m[4] === undefined ? [] : m[4].split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part))
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre }
}

/**
 * Semantic-versioning order: numbers first, and a preview comes before its release.
 * @param {Version} a
 * @param {Version} b
 * @returns {number}
 */
export function compareVersions(a, b) {
  for (const key of /** @type {const} */ (['major', 'minor', 'patch'])) if (a[key] !== b[key]) return a[key] - b[key]
  if (a.pre.length === 0 || b.pre.length === 0) return b.pre.length - a.pre.length
  for (let i = 0; i < Math.min(a.pre.length, b.pre.length); i++) {
    const x = /** @type {string | number} */ (a.pre[i])
    const y = /** @type {string | number} */ (b.pre[i])
    if (x === y) continue
    if (typeof x === 'number' && typeof y === 'number') return x - y
    if (typeof x === 'number') return -1
    if (typeof y === 'number') return 1
    return x < y ? -1 : 1
  }
  return a.pre.length - b.pre.length
}

/**
 * The number a breaking change raises: the major, or the minor while the major is 0.
 * @param {Version} v
 * @returns {[number, number]}
 */
function breaking(v) {
  return v.major === 0 ? [0, v.minor] : [v.major, 0]
}

/**
 * Why `next` cannot be released, or null when it can.
 * @param {{ current: string, next: string, last: Release | null, resultVersion: number, planFormat: number }} state
 * @returns {string | null}
 */
export function versionProblem({ current, next, last, resultVersion, planFormat }) {
  const to = parseVersion(next)
  if (!to) return `"${next}" is not a version: write three numbers, such as 0.1.0, or a preview, such as 0.1.0-preview.1.`
  const from = parseVersion(current)
  if (!from) return `the packages hold "${current}", which is not a version.`
  if (compareVersions(to, from) <= 0) return `${next} is not after the packages' version, ${current}.`
  if (!last) return null
  const before = parseVersion(last.version)
  if (!before) return `the last release in CHANGELOG.md, "${last.version}", is not a version.`
  if (compareVersions(to, before) <= 0) return `${next} is not after the last release, ${last.version}.`
  const raised = []
  if (resultVersion !== last.resultVersion) raised.push(`the result version (${last.resultVersion} to ${resultVersion})`)
  if (planFormat !== last.planFormat) raised.push(`the plan format version (${last.planFormat} to ${planFormat})`)
  if (raised.length === 0) return null
  const [a, b] = breaking(to)
  const [c, d] = breaking(before)
  if (a > c || (a === c && b > d)) return null
  const want = before.major === 0 ? `0.${before.minor + 1}.0` : `${before.major + 1}.0.0`
  return `${raised.join(' and ')} changed since ${last.version}, so the release must raise the breaking number: ${want} or later.`
}

/**
 * The record's version, from `packages/rules/src/result/types.ts`.
 * @param {string} source
 * @returns {number}
 */
export function readResultVersion(source) {
  const m = /^export const RESULT_VERSION = (\d+) as const$/m.exec(source)
  if (!m) throw new Error('could not read RESULT_VERSION in packages/rules/src/result/types.ts.')
  return Number(m[1])
}

/**
 * The plan format's version, from the plan schema in `packages/floorplan/src/types/floorplan.ts`.
 * @param {string} source
 * @returns {number}
 */
export function readPlanFormat(source) {
  const at = source.indexOf('export const FloorPlanFieldsSchema = z.object({')
  const m = at < 0 ? null : /^ {2}version: z\.literal\('(\d+)'\)/m.exec(source.slice(at))
  if (!m) throw new Error("could not read the plan format's version in packages/floorplan/src/types/floorplan.ts.")
  return Number(m[1])
}

const RELEASE_HEADING = /^## (\S+) \((\d{4}-\d{2}-\d{2})\)$/m
const RELEASE_FIGURES = /^Result version (\d+), plan format version (\d+)\.$/m

/**
 * The last release CHANGELOG.md records, or null before the first.
 * @param {string} changelog
 * @returns {Release | null}
 */
export function lastRelease(changelog) {
  const heading = RELEASE_HEADING.exec(changelog)
  if (!heading) return null
  const figures = RELEASE_FIGURES.exec(changelog.slice(heading.index))
  if (!figures) throw new Error(`CHANGELOG.md: the section for ${heading[1]} does not say its result and plan format versions.`)
  return { version: /** @type {string} */ (heading[1]), date: /** @type {string} */ (heading[2]), resultVersion: Number(figures[1]), planFormat: Number(figures[2]) }
}

/**
 * @param {string} text
 * @param {RegExp} heading a heading that starts a section at its level
 * @param {RegExp} next the heading that ends it
 * @returns {{ start: number, body: number, end: number } | null}
 */
function section(text, heading, next) {
  const m = heading.exec(text)
  if (!m) return null
  const body = m.index + m[0].length
  next.lastIndex = body
  const n = next.exec(text)
  return { start: m.index, body, end: n ? n.index : text.length }
}

/**
 * CHANGELOG.md with the release's section in place of "Unreleased", and a new, empty
 * "Unreleased" above it.
 * @param {string} changelog
 * @param {Release} release
 * @returns {string}
 */
export function releaseChangelog(changelog, release) {
  if (!DATE.test(release.date)) throw new Error(`"${release.date}" is not a day: write it as YYYY-MM-DD.`)
  if (changelog.includes(`\n## ${release.version} (`)) throw new Error(`CHANGELOG.md already has a section for ${release.version}.`)
  const unreleased = section(changelog, /^## Unreleased$/m, /^## /gm)
  if (!unreleased) throw new Error('CHANGELOG.md has no "## Unreleased" section.')
  const entries = changelog.slice(unreleased.body, unreleased.end).trim()
  if (entries === '') throw new Error('CHANGELOG.md has nothing under "## Unreleased": say what changed for people before a release.')
  const head = changelog.slice(0, unreleased.start)
  const tail = changelog.slice(unreleased.end)
  const figures = `Result version ${release.resultVersion}, plan format version ${release.planFormat}.`
  return `${head}## Unreleased\n\n## ${release.version} (${release.date})\n\n${figures}\n\n${entries}\n${tail === '' ? '' : `\n${tail}`}`
}

/**
 * The result contract with the release's heading in its changelog for agents. The heading goes
 * above the entries written since the last release; when there are none it says so.
 * @param {string} contract
 * @param {Release} release
 * @returns {string}
 */
export function releaseAgentChangelog(contract, release) {
  const agents = section(contract, /^## Changelog for agents$/m, /^## /gm)
  if (!agents) throw new Error('docs/result-contract.md has no "## Changelog for agents" section.')
  if (contract.includes(`\n### Release ${release.version} (`)) throw new Error(`the changelog for agents already has a heading for ${release.version}.`)
  const body = contract.slice(agents.body, agents.end)
  const first = /^### /m.exec(body)
  const at = agents.body + (first ? first.index : body.trimEnd().length)
  const shipped = first !== null && !body.slice(first.index).startsWith('### Release ')
  const heading = `### Release ${release.version} (${release.date}): result version ${release.resultVersion}`
  const says = shipped
    ? `ongrid ${release.version} ships the entries below, down to the next release heading.`
    : 'No change for agents since the release below.'
  const before = contract.slice(0, at)
  return `${before}${first ? '' : '\n\n'}${heading}\n\n${says}\n\n${contract.slice(at).replace(/^\n+/, '')}`
}

/**
 * A package.json, or package-lock.json, with the release's version. The lock keeps every other
 * byte: the root and the workspace packages get the version, the dependencies keep theirs.
 * @param {string} text
 * @param {string} version
 * @param {boolean} lock
 * @returns {string}
 */
export function withVersion(text, version, lock) {
  /** @type {Record<string, any>} */
  const json = JSON.parse(text)
  json['version'] = version
  if (lock) {
    for (const [key, entry] of Object.entries(/** @type {Record<string, Record<string, unknown>>} */ (json['packages'] ?? {}))) {
      if (key === '' || /^packages\/[^/]+$/.test(key)) entry['version'] = version
    }
  }
  return `${JSON.stringify(json, null, 2)}\n`
}
