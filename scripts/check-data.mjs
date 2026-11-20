// @ts-check
/**
 * Scans the data the repository keeps from the Grid lab (everything under `scoreboard/`) for
 * what must never be committed: paths from someone's machine, paths into the lab, e-mail
 * addresses, fields that hold a person, and names of people. Compressed files are read
 * uncompressed. Exits 1 and lists every hit when anything is found.
 *
 * Usage: node scripts/check-data.mjs [folder ...]   (default: scoreboard)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** In JSON a backslash is written twice; both spellings are looked for. */
const RULES = [
  { what: 'a home folder path', pattern: /\/(?:Users|home)\/[A-Za-z0-9._-]+/g },
  { what: 'a Windows drive path', pattern: /\b[A-Za-z]:(?:\\\\|\\|\/)(?:Users|Documents|Windows|[A-Za-z0-9._ -]+(?:\\\\|\\|\/))/g },
  { what: 'a path from the home folder', pattern: /(?:^|[\s"'(=])~\/[A-Za-z0-9._-]/g },
  { what: 'a temporary folder path', pattern: /\/(?:private\/tmp|var\/folders)\//g },
  { what: 'a file address', pattern: /file:\/\//g },
  { what: 'a path into the lab', pattern: /grid-test\//g },
  { what: 'an e-mail address', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z][A-Za-z.]+/g },
  { what: 'a field that holds a person', pattern: /"(?:author|owner|client|createdBy|email|e-mail|phone|telephone|person|customer)"\s*:/gi },
  { what: 'a title before a name', pattern: /\b(?:Mr|Mrs|Ms|Miss|Dr)\.? [A-Z][a-z]+/g },
  // "Anna's bedroom": a capitalised word owning something. Room words that do this are allowed.
  { what: "a person's name", pattern: /\b(?!(?:Men|Women|Children|Child|Boys|Girls|Master|Guest|Guests|Staff|Visitors|Owner|Owners|Baby|Kids|Nanny|Grid)'s\b)[A-Z][a-z]+'s\b/g },
]

/**
 * Every hit in one text, as "what: match".
 * @param {string} text
 * @returns {string[]}
 */
export function scanText(text) {
  const hits = []
  for (const rule of RULES) {
    for (const match of text.matchAll(rule.pattern)) hits.push(`${rule.what}: ${match[0].trim()}`)
  }
  return hits
}

/**
 * @param {string} path
 * @returns {string}
 */
function readText(path) {
  const bytes = readFileSync(path)
  return (path.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8')
}

/**
 * Every file under a folder, leaving out what the build makes.
 * @param {string} folder
 * @returns {string[]}
 */
function files(folder) {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name)
    if (name === 'dist' || name === 'node_modules') return []
    return statSync(path).isDirectory() ? files(path) : [path]
  })
}

/**
 * @param {readonly string[]} folders
 * @returns {{ file: string, hits: string[] }[]}
 */
export function scanFolders(folders) {
  return folders
    .flatMap((folder) => files(join(ROOT, folder)))
    .map((file) => ({ file: relative(ROOT, file), hits: scanText(readText(file)) }))
    .filter((result) => result.hits.length > 0)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const folders = process.argv.length > 2 ? process.argv.slice(2) : ['scoreboard']
  const found = scanFolders(folders)
  for (const { file, hits } of found) {
    const shown = [...new Set(hits)]
    console.error(`${file}: ${shown.slice(0, 10).join('; ')}${shown.length > 10 ? ` and ${shown.length - 10} more` : ''}`)
  }
  if (found.length > 0) {
    console.error(`check-data: found ${found.length} file(s) with machine paths or personal data.`)
    process.exit(1)
  }
  console.log(`check-data: ${folders.join(', ')}: no machine paths and no personal data.`)
}
