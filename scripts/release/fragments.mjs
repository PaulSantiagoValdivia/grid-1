// @ts-check
/**
 * The changelog fragments: one file per feature in `changes/`, so features built at the same
 * time never edit the same lines of CHANGELOG.md or docs/result-contract.md. The release step
 * reads them all, writes them into both changelogs and deletes them. Pure functions on text, as
 * in `prepare.mjs`; `scripts/release.mjs` reads and deletes the files.
 *
 * A fragment, `changes/<ID>.md`:
 *
 *   # 2026-11-22: a first layout from the brief (BRF-6)
 *
 *   ## For people
 *
 *   - The line for CHANGELOG.md's "Unreleased", in plain words.
 *
 *   ## For agents
 *
 *   - The entry for the changelog for agents in docs/result-contract.md.
 *
 *   ## Codes
 *
 *   | `room/new-code` | Wording | Needed |
 *
 * The first line is the entry's heading in the changelog for agents: the day, what changed and
 * the feature's ID, which is the file's name. Every part below it may be left out, but a
 * fragment says something, and a new code comes with its entry for agents. Each code row goes
 * into the contract's code table after the last code with the same prefix, else at its end.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/
const HEADING = /^# (\d{4}-\d{2}-\d{2}): (.+) \(([^()]+)\)$/
const PARTS = /** @type {const} */ (['For people', 'For agents', 'Codes'])
export const CODE_ROW = /^\| `([a-z]+)\/[a-z0-9-]+` \|.*\|$/

/** @typedef {{ id: string, day: string, title: string, people: string, agents: string, codes: string[] }} Fragment */

/**
 * The files in `changes/` that are fragments: every `.md` but the folder's README.
 * @param {string[]} names
 * @returns {string[]}
 */
export function fragmentNames(names) {
  return names.filter((name) => name.endsWith('.md') && name !== 'README.md').sort()
}

/**
 * Read one fragment. Throws, naming the file and what is wrong.
 * @param {string} name the file's name in `changes/`, such as `BRF-6.md`
 * @param {string} text
 * @returns {Fragment}
 */
export function readFragment(name, text) {
  const id = name.replace(/\.md$/, '')
  const where = `changes/${name}`
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const heading = HEADING.exec(lines[0] ?? '')
  if (!heading) throw new Error(`${where}: the first line must be "# <YYYY-MM-DD>: <what changed> (${id})".`)
  const day = heading[1] ?? ''
  const title = heading[2] ?? ''
  const named = heading[3] ?? ''
  if (named !== id) throw new Error(`${where}: the heading names ${named}; it names the file's ID, ${id}.`)
  /** @type {Record<string, string[]>} */
  const parts = {}
  /** @type {string[] | null} */
  let into = null
  for (const line of lines.slice(1)) {
    const part = /^## (.+)$/.exec(line)
    if (part) {
      const key = /** @type {string} */ (part[1]).trim()
      if (!(/** @type {readonly string[]} */ (PARTS)).includes(key)) throw new Error(`${where}: "## ${key}" is not a part: use ${PARTS.map((p) => `"## ${p}"`).join(', ')}.`)
      if (parts[key]) throw new Error(`${where}: "## ${key}" is given twice.`)
      into = parts[key] = []
      continue
    }
    if (/^#{1,2} /.test(line)) throw new Error(`${where}: one "# " heading only, on the first line; parts are "## " headings.`)
    if (into) into.push(line)
    else if (line.trim() !== '') throw new Error(`${where}: text before the first part; put it under "## For people" or "## For agents".`)
  }
  const body = (/** @type {string} */ key) => (parts[key] ?? []).join('\n').trim()
  const people = body('For people')
  const agents = body('For agents')
  const rows = body('Codes').split('\n').filter((line) => line.trim() !== '')
  for (const row of rows) {
    if (!CODE_ROW.test(row)) throw new Error(`${where}: under "## Codes" each line is a row of the code table, "| \`kind/code\` | Wording | Needed |": ${JSON.stringify(row.slice(0, 60))}.`)
  }
  if (people === '' && agents === '') throw new Error(`${where}: says nothing: write "## For people", "## For agents" or both.`)
  if (rows.length > 0 && agents === '') throw new Error(`${where}: a new code comes with its entry under "## For agents".`)
  if (/^#{1,3} /m.test(agents)) throw new Error(`${where}: "## For agents" holds a heading; its entry is the fragment's first line.`)
  return { id, day, title, people, agents, codes: rows }
}

/**
 * Fragments newest first, then by ID, the order both changelogs list them in.
 * @param {Fragment[]} fragments
 * @returns {Fragment[]}
 */
function ordered(fragments) {
  return [...fragments].sort((a, b) => (a.day === b.day ? (a.id < b.id ? -1 : 1) : a.day < b.day ? 1 : -1))
}

/**
 * CHANGELOG.md with every fragment's line for people at the top of "Unreleased".
 * @param {string} changelog
 * @param {Fragment[]} fragments
 * @returns {string}
 */
export function withPeopleEntries(changelog, fragments) {
  const lines = ordered(fragments).map((f) => f.people).filter((text) => text !== '')
  if (lines.length === 0) return changelog
  const m = /^## Unreleased\n+/m.exec(changelog)
  if (!m) throw new Error('CHANGELOG.md has no "## Unreleased" section.')
  return `${changelog.slice(0, m.index)}## Unreleased\n\n${lines.join('\n')}\n\n${changelog.slice(m.index + m[0].length)}`
}

/**
 * The result contract with every fragment's code rows in its code table and its entry at the
 * top of the changelog for agents.
 * @param {string} contract
 * @param {Fragment[]} fragments
 * @returns {string}
 */
export function withAgentEntries(contract, fragments) {
  const list = ordered(fragments)
  let text = contract
  for (const fragment of list) for (const row of fragment.codes) text = withCodeRow(text, row, fragment.id)
  const entries = list.filter((f) => f.agents !== '').map((f) => `### ${f.day}: ${f.title} (${f.id})\n\n${f.agents}\n\n`)
  if (entries.length === 0) return text
  const m = /^## Changelog for agents\n+/m.exec(text)
  if (!m) throw new Error('docs/result-contract.md has no "## Changelog for agents" section.')
  const at = m.index + m[0].length
  return `${text.slice(0, at)}${entries.join('')}${text.slice(at)}`
}

/**
 * The contract with one more row in its code table, after the last code of its kind.
 * @param {string} contract
 * @param {string} row
 * @param {string} id the fragment it came from
 * @returns {string}
 */
function withCodeRow(contract, row, id) {
  const start = contract.search(/^## The codes$/m)
  if (start < 0) throw new Error('docs/result-contract.md has no "## The codes" section.')
  const lines = contract.slice(start).split('\n')
  const head = lines.findIndex((line) => line.startsWith('|---'))
  if (head < 0) throw new Error('docs/result-contract.md: "## The codes" has no table.')
  let end = head + 1
  while (end < lines.length && /** @type {string} */ (lines[end]).startsWith('| ')) end++
  const code = /** @type {string} */ (/^\| `([^`]+)`/.exec(row)?.[1])
  const kind = code.split('/')[0]
  const table = lines.slice(head + 1, end)
  if (table.some((line) => line.startsWith(`| \`${code}\` |`))) throw new Error(`changes/${id}.md: ${code} is already in the contract's code table.`)
  let after = -1
  table.forEach((line, i) => {
    if (line.startsWith(`| \`${kind}/`)) after = i
  })
  const place = head + 1 + (after < 0 ? table.length : after + 1)
  lines.splice(place, 0, row)
  return contract.slice(0, start) + lines.join('\n')
}

/**
 * Every fragment, read; throws on the first that cannot be, or on a day that is not one.
 * @param {Array<[string, string]>} files name and text of each file in `changes/`
 * @returns {Fragment[]}
 */
export function readFragments(files) {
  const names = new Set(fragmentNames(files.map(([name]) => name)))
  const fragments = files.filter(([name]) => names.has(name)).map(([name, text]) => readFragment(name, text))
  for (const f of fragments) if (!DATE.test(f.day) || Number.isNaN(Date.parse(f.day))) throw new Error(`changes/${f.id}.md: "${f.day}" is not a day.`)
  return fragments
}
