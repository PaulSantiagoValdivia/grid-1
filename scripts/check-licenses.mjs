// @ts-check
/**
 * Fails when any package in `package-lock.json` is under a GPL, LGPL, AGPL, MPL or EPL licence.
 *
 * Usage: node scripts/check-licenses.mjs [path/to/package-lock.json]
 *
 * How SPDX expressions are read:
 * - `A OR B`: the licensee may pick either, so the package passes when at least one side passes.
 *   `(MIT OR GPL-2.0)` passes; `(GPL-2.0 OR MPL-2.0)` fails.
 * - `A AND B`: both apply, so the package passes only when both sides pass.
 *   `(MIT AND GPL-2.0)` fails.
 * - `A WITH exception`: the exception does not change the family, so `GPL-2.0 WITH
 *   Classpath-exception-2.0` fails.
 * - A trailing `+`, `-only` and `-or-later` do not matter: `LGPL-2.1+` fails.
 * - A licence string that is not a valid expression fails when any word in it names one of the
 *   families, and passes otherwise.
 * - A package with no licence field is not checked here.
 *
 * It then reads the parts list (`sbom.cdx.json`, CycloneDX) that a ready-built package ships
 * beside its binary, for every package of the lock file that is installed, and checks each part
 * the same way. A part under a blocked licence fails unless it is in `ACCEPTED_BUNDLED`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** The licence families Grid does not accept in its dependencies. */
export const BLOCKED_FAMILIES = ['GPL', 'LGPL', 'AGPL', 'MPL', 'EPL']

// The family name, then the end, a version or a separator: `GPL`, `GPL-3.0`, `GPLv3`, `LGPL-2.1+`.
const BLOCKED_ID = /^(?:(?:A|L)?GPL|MPL|EPL)(?:$|[-+.v\d])/i

/**
 * @param {string} id one SPDX licence id, such as `MIT` or `GPL-2.0-or-later`
 * @returns {boolean} whether the id belongs to a blocked family
 */
export function isBlockedId(id) {
  return BLOCKED_ID.test(id)
}

/**
 * @typedef {{ kind: 'id', id: string }
 *   | { kind: 'and' | 'or', left: Expr, right: Expr }} Expr
 */

/**
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  return text.replace(/[()]/g, ' $& ').trim().split(/\s+/).filter(Boolean)
}

/**
 * Parses an SPDX licence expression. AND binds tighter than OR.
 *
 * @param {string} text
 * @returns {Expr}
 * @throws {Error} when the text is not a valid expression
 */
export function parseExpression(text) {
  const tokens = tokenize(text)
  let pos = 0
  const peek = () => tokens[pos]
  const isOp = (/** @type {string | undefined} */ t, /** @type {string} */ op) =>
    t !== undefined && t.toUpperCase() === op

  /** @returns {Expr} */
  const parseOr = () => {
    let left = parseAnd()
    while (isOp(peek(), 'OR')) {
      pos++
      left = { kind: 'or', left, right: parseAnd() }
    }
    return left
  }

  /** @returns {Expr} */
  const parseAnd = () => {
    let left = parseAtom()
    while (isOp(peek(), 'AND')) {
      pos++
      left = { kind: 'and', left, right: parseAtom() }
    }
    return left
  }

  /** @returns {Expr} */
  const parseAtom = () => {
    const token = tokens[pos++]
    if (token === undefined) throw new Error(`Unexpected end of licence expression: ${text}`)
    if (token === '(') {
      const inner = parseOr()
      if (tokens[pos++] !== ')') throw new Error(`Missing ")" in licence expression: ${text}`)
      return inner
    }
    if (token === ')' || isOp(token, 'AND') || isOp(token, 'OR') || isOp(token, 'WITH')) {
      throw new Error(`Unexpected "${token}" in licence expression: ${text}`)
    }
    if (isOp(peek(), 'WITH')) {
      pos++
      const exception = tokens[pos++]
      if (exception === undefined || exception === '(' || exception === ')') {
        throw new Error(`Missing exception after WITH in licence expression: ${text}`)
      }
    }
    return { kind: 'id', id: token }
  }

  const expr = parseOr()
  if (pos !== tokens.length) throw new Error(`Unexpected "${tokens[pos]}" in licence expression: ${text}`)
  return expr
}

/**
 * @param {Expr} expr
 * @returns {{ allowed: boolean, blocked: string[] }} whether the expression can be used, and
 *   the blocked ids that stop it when it cannot
 */
function evaluate(expr) {
  if (expr.kind === 'id') {
    return isBlockedId(expr.id) ? { allowed: false, blocked: [expr.id] } : { allowed: true, blocked: [] }
  }
  const left = evaluate(expr.left)
  const right = evaluate(expr.right)
  const allowed = expr.kind === 'or' ? left.allowed || right.allowed : left.allowed && right.allowed
  return { allowed, blocked: allowed ? [] : [...left.blocked, ...right.blocked] }
}

/**
 * @param {string} license a licence field from the lock file
 * @returns {{ allowed: boolean, blocked: string[] }}
 */
export function checkLicense(license) {
  try {
    return evaluate(parseExpression(license))
  } catch {
    const blocked = tokenize(license).filter(isBlockedId)
    return { allowed: blocked.length === 0, blocked }
  }
}

/**
 * @typedef {{ path: string, name: string, version: string, license: string, blocked: string[] }} Finding
 */

/**
 * @param {unknown} lock the parsed contents of a `package-lock.json` (lockfileVersion 2 or 3)
 * @returns {{ checked: number, findings: Finding[] }}
 */
export function checkLock(lock) {
  const packages =
    lock && typeof lock === 'object' && 'packages' in lock && lock.packages && typeof lock.packages === 'object'
      ? /** @type {Record<string, Record<string, unknown>>} */ (lock.packages)
      : undefined
  if (!packages) throw new Error('The lock file has no "packages" section. Use lockfileVersion 2 or 3.')

  /** @type {Finding[]} */
  const findings = []
  let checked = 0
  for (const [path, entry] of Object.entries(packages)) {
    const raw = entry?.license
    const license =
      typeof raw === 'string'
        ? raw
        : raw && typeof raw === 'object' && 'type' in raw && typeof raw.type === 'string'
          ? raw.type
          : undefined
    if (license === undefined) continue
    checked++
    const result = checkLicense(license)
    if (result.allowed) continue
    const name =
      typeof entry.name === 'string' ? entry.name : path === '' ? '(root)' : path.replace(/^.*node_modules\//, '')
    const version = typeof entry.version === 'string' ? entry.version : ''
    findings.push({ path, name, version, license, blocked: result.blocked })
  }
  return { checked, findings }
}

/**
 * The parts inside a ready-built package's binary that are under a blocked licence and that Grid
 * accepts all the same. Each is under MPL-2.0, whose terms hold file by file: it is shipped
 * unchanged, inside a package under a permissive licence, and `NOTICE` names it with where its
 * source is, which is what MPL-2.0 asks for when its files are passed on unchanged. A test checks
 * that `NOTICE` names each one. The owner accepted these on 2026-11-22, to be looked at again
 * before Grid is published (RELEASING.md, "When publishing is approved"). A new part under a
 * blocked licence, or one of these under another licence, still fails.
 *
 * @type {ReadonlyArray<{ name: string, license: string, in: string }>}
 */
export const ACCEPTED_BUNDLED = [
  { name: 'cssparser', license: 'MPL-2.0', in: '@napi-rs/canvas' },
  { name: 'cssparser-macros', license: 'MPL-2.0', in: '@napi-rs/canvas' },
  { name: 'dtoa-short', license: 'MPL-2.0', in: '@napi-rs/canvas' },
  { name: 'selectors', license: 'MPL-2.0', in: '@napi-rs/canvas' },
]

/**
 * @param {unknown} licenses a CycloneDX component's `licenses` list
 * @returns {string | undefined} one expression for them all, or none when it names no licence
 */
function componentLicense(licenses) {
  if (!Array.isArray(licenses)) return undefined
  /** @type {string[]} */
  const parts = []
  for (const entry of licenses) {
    if (typeof entry?.expression === 'string') parts.push(entry.expression)
    else if (typeof entry?.license?.id === 'string') parts.push(entry.license.id)
    else if (typeof entry?.license?.name === 'string') parts.push(entry.license.name)
  }
  if (parts.length === 0) return undefined
  return parts.length === 1 ? parts[0] : parts.map((part) => `(${part})`).join(' AND ')
}

/**
 * @typedef {{ package: string, name: string, version: string, license: string, blocked: string[] }} BundledFinding
 */

/**
 * @param {unknown} lock the parsed contents of a `package-lock.json`
 * @param {string} root the folder the lock file is in, where its packages are installed
 * @returns {{ lists: number, checked: number, accepted: number, findings: BundledFinding[] }}
 */
export function checkBundled(lock, root) {
  const packages =
    lock && typeof lock === 'object' && 'packages' in lock && lock.packages && typeof lock.packages === 'object'
      ? Object.keys(lock.packages)
      : []
  /** @type {BundledFinding[]} */
  const findings = []
  let lists = 0
  let checked = 0
  let accepted = 0
  for (const path of packages) {
    if (path === '') continue
    const file = join(root, path, 'sbom.cdx.json')
    if (!existsSync(file)) continue
    lists++
    const sbom = JSON.parse(readFileSync(file, 'utf8'))
    const owner = path.replace(/^.*node_modules\//, '')
    for (const component of Array.isArray(sbom?.components) ? sbom.components : []) {
      const license = componentLicense(component?.licenses)
      if (license === undefined) continue
      checked++
      const result = checkLicense(license)
      if (result.allowed) continue
      const name = typeof component.name === 'string' ? component.name : '(unnamed)'
      const known = ACCEPTED_BUNDLED.some(
        (part) => part.name === name && part.license === license && (owner === part.in || owner.startsWith(`${part.in}-`)),
      )
      if (known) {
        accepted++
        continue
      }
      const version = typeof component.version === 'string' ? component.version : ''
      findings.push({ package: owner, name, version, license, blocked: result.blocked })
    }
  }
  return { lists, checked, accepted, findings }
}

/**
 * @param {string} lockPath
 * @returns {number} the exit code
 */
export function main(lockPath) {
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
  const { checked, findings } = checkLock(lock)
  const bundled = checkBundled(lock, dirname(resolve(lockPath)))
  const families = BLOCKED_FAMILIES.join(', ')
  if (findings.length === 0) {
    console.log(`Checked ${checked} licences in ${lockPath}: none is ${families}.`)
  } else {
    console.error(`${findings.length} of ${checked} packages in ${lockPath} use a licence Grid does not accept (${families}):`)
    for (const f of findings) {
      console.error(`  ${f.name}${f.version ? `@${f.version}` : ''}  ${f.license}  (${f.path || 'root'})`)
    }
  }
  if (bundled.lists > 0 && bundled.findings.length === 0) {
    const except = bundled.accepted > 0 ? `, but for the ${bundled.accepted} accepted and named in NOTICE` : ''
    console.log(`Checked ${bundled.checked} parts in ${bundled.lists} ready-built ${bundled.lists === 1 ? 'package' : 'packages'}: none is ${families}${except}.`)
  } else if (bundled.findings.length > 0) {
    console.error(`${bundled.findings.length} parts inside ready-built packages use a licence Grid does not accept (${families}):`)
    for (const f of bundled.findings) {
      console.error(`  ${f.name}${f.version ? `@${f.version}` : ''}  ${f.license}  (inside ${f.package})`)
    }
  }
  return findings.length === 0 && bundled.findings.length === 0 ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv[2] ?? 'package-lock.json')
}
