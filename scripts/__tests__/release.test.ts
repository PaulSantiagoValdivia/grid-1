import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { fragmentNames, readFragment, readFragments, withAgentEntries, withPeopleEntries } from '../release/fragments.mjs'
import { GATES } from '../release/gates.mjs'
import {
  compareVersions,
  lastRelease,
  parseVersion,
  readPlanFormat,
  readResultVersion,
  releaseAgentChangelog,
  releaseChangelog,
  versionProblem,
  withVersion,
} from '../release/prepare.mjs'
import { distTag, gateSteps, packedManifest, Refused, release } from '../release.mjs'

/**
 * QAR-10: the release step. It cuts a version by the rule, updates both changelogs in one run,
 * stops at the first gate that fails with every file as it was, packs a tarball with its
 * provenance settings, and never publishes. The workflow runs the same step as a dry run.
 */

const root = resolve(__dirname, '../..')
const text = (path: string): string => readFileSync(join(root, path), 'utf8')
const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})
const temp = (prefix: string): string => {
  const path = mkdtempSync(join(tmpdir(), prefix))
  made.push(path)
  return path
}

const CUT = { version: '0.1.0', date: '2026-11-22', resultVersion: 1, planFormat: 1 }

describe('versions', () => {
  it('orders a preview before its release, and previews by number', () => {
    const order = ['0.0.0', '0.1.0-preview.1', '0.1.0-preview.2', '0.1.0-preview.10', '0.1.0', '0.1.1', '1.0.0']
    const parsed = order.map((v) => parseVersion(v)!)
    for (let i = 1; i < parsed.length; i++) expect(compareVersions(parsed[i - 1]!, parsed[i]!), order[i]).toBeLessThan(0)
    expect(parseVersion('1.2')).toBeNull()
    expect(parseVersion('v1.2.3')).toBeNull()
    expect(parseVersion('01.2.3')).toBeNull()
  })

  it('takes any later version for the first release', () => {
    expect(versionProblem({ current: '0.0.0', next: '0.1.0-preview.1', last: null, resultVersion: 1, planFormat: 1 })).toBeNull()
    expect(versionProblem({ current: '0.0.0', next: '0.0.0', last: null, resultVersion: 1, planFormat: 1 })).toMatch(/not after/)
    expect(versionProblem({ current: '0.0.0', next: 'next', last: null, resultVersion: 1, planFormat: 1 })).toMatch(/not a version/)
  })

  it('makes a raised result version or plan format raise the breaking number', () => {
    const last = { version: '0.1.0', date: '2026-11-22', resultVersion: 1, planFormat: 1 }
    const same = { current: '0.1.0', last, resultVersion: 1, planFormat: 1 }
    expect(versionProblem({ ...same, next: '0.1.1' })).toBeNull()
    expect(versionProblem({ ...same, next: '0.1.1', resultVersion: 2 })).toMatch(/result version \(1 to 2\).*0\.2\.0 or later/)
    expect(versionProblem({ ...same, next: '0.1.1', planFormat: 2 })).toMatch(/plan format version \(1 to 2\)/)
    expect(versionProblem({ ...same, next: '0.2.0', resultVersion: 2 })).toBeNull()
    expect(versionProblem({ ...same, next: '0.2.0-preview.1', resultVersion: 2 })).toBeNull()
    const one = { current: '1.2.0', last: { ...last, version: '1.2.0' }, resultVersion: 2, planFormat: 1 }
    expect(versionProblem({ ...one, next: '1.3.0' })).toMatch(/2\.0\.0 or later/)
    expect(versionProblem({ ...one, next: '2.0.0' })).toBeNull()
  })

  it('reads the result version and the plan format version from their code', () => {
    expect(readResultVersion(text('packages/rules/src/result/types.ts'))).toBe(1)
    expect(readPlanFormat(text('packages/floorplan/src/types/floorplan.ts'))).toBe(1)
    expect(() => readResultVersion('export const RESULT_VERSION = one')).toThrow(/RESULT_VERSION/)
  })

  it('publishes a preview under its own tag, never latest', () => {
    expect(distTag('0.1.0')).toBe('latest')
    expect(distTag('0.1.0-preview.1')).toBe('preview')
    expect(distTag('0.1.0-1')).toBe('next')
  })
})

describe('CHANGELOG.md, for people', () => {
  const changelog = text('CHANGELOG.md')

  it('turns Unreleased into the release, with the versions it carries', () => {
    const cut = releaseChangelog(changelog, CUT)
    expect(cut).toMatch(/^## Unreleased\n\n## 0\.1\.0 \(2026-11-22\)\n\nResult version 1, plan format version 1\.\n\n/m)
    const entries = changelog.slice(changelog.indexOf('## Unreleased') + '## Unreleased'.length).trim()
    expect(cut).toContain(entries)
    expect(lastRelease(cut)).toEqual(CUT)
    expect(lastRelease(changelog)).toBeNull()
  })

  it('refuses an empty Unreleased, a version twice and a day that is not one', () => {
    const cut = releaseChangelog(changelog, CUT)
    expect(() => releaseChangelog(cut, { ...CUT, version: '0.1.1' })).toThrow(/nothing under "## Unreleased"/)
    const more = cut.replace('## Unreleased\n', '## Unreleased\n\n- Something new.\n')
    expect(() => releaseChangelog(more, CUT)).toThrow(/already has a section for 0\.1\.0/)
    expect(releaseChangelog(more, { ...CUT, version: '0.1.1' })).toMatch(/## 0\.1\.1 \(2026-11-22\)\n\nResult version 1, plan format version 1\.\n\n- Something new\.\n\n## 0\.1\.0/)
    expect(() => releaseChangelog(changelog, { ...CUT, date: '22 November' })).toThrow(/YYYY-MM-DD/)
  })
})

describe('the changelog for agents, in the result contract', () => {
  const contract = text('docs/result-contract.md')

  it('puts the release heading above the entries it ships, which keep theirs', () => {
    const cut = releaseAgentChangelog(contract, CUT)
    const at = cut.indexOf('### Release 0.1.0 (2026-11-22): result version 1')
    expect(at).toBeGreaterThan(cut.indexOf('## Changelog for agents'))
    expect(cut.slice(at)).toMatch(/^### Release 0\.1\.0 \(2026-11-22\): result version 1\n\nongrid 0\.1\.0 ships the entries below, down to the next release heading\.\n\n### \d{4}-\d{2}-\d{2}: /)
    // The contract test reads the dated entry for the version; it is still there.
    expect(cut).toMatch(/^### \d{4}-\d{2}-\d{2}: version 1\b/m)
    expect(cut.replace(/### Release 0\.1\.0 [^\n]*\n\n[^\n]*\n\n/, '')).toBe(contract)
  })

  it('ships a new entry in the next release, and says when there is none', () => {
    const cut = releaseAgentChangelog(contract, CUT)
    const none = releaseAgentChangelog(cut, { ...CUT, version: '0.1.1' })
    expect(none).toMatch(/### Release 0\.1\.1 \(2026-11-22\): result version 1\n\nNo change for agents since the release below\.\n\n### Release 0\.1\.0/)
    const entry = cut.replace('### Release 0.1.0', '### 2026-12-01: version 1 (XYZ-1)\n\n- A new code.\n\n### Release 0.1.0')
    expect(releaseAgentChangelog(entry, { ...CUT, version: '0.1.1' })).toMatch(/### Release 0\.1\.1 [^\n]*\n\nongrid 0\.1\.1 ships the entries below[^\n]*\n\n### 2026-12-01: version 1 \(XYZ-1\)\n\n- A new code\.\n\n### Release 0\.1\.0/)
    expect(() => releaseAgentChangelog(cut, CUT)).toThrow(/already has a heading for 0\.1\.0/)
  })
})

describe('the fragments in changes/', () => {
  const changelog = text('CHANGELOG.md')
  const contract = text('docs/result-contract.md')
  const FRAGMENT = [
    '# 2026-12-01: a new thing (XYZ-1)',
    '',
    '## For people',
    '',
    '- You can do a new thing (XYZ-1).',
    '',
    '## For agents',
    '',
    '- `grid_check` gives `room/new-thing`.',
    '',
    '## Codes',
    '',
    '| `room/new-thing` | Room "{name}" is new | nothing |',
    '| `zone/first` | A zone | nothing |',
    '',
  ].join('\n')

  it('reads a fragment: its day, what changed, its ID and its parts', () => {
    expect(readFragment('XYZ-1.md', FRAGMENT)).toEqual({
      id: 'XYZ-1',
      day: '2026-12-01',
      title: 'a new thing',
      people: '- You can do a new thing (XYZ-1).',
      agents: '- `grid_check` gives `room/new-thing`.',
      codes: ['| `room/new-thing` | Room "{name}" is new | nothing |', '| `zone/first` | A zone | nothing |'],
    })
    expect(readFragment('XYZ-2.md', '# 2026-12-01: internal (XYZ-2)\n\n## For people\n\n- A line.\n').agents).toBe('')
    expect(fragmentNames(['README.md', 'B-2.md', 'A-1.md', 'notes.txt'])).toEqual(['A-1.md', 'B-2.md'])
  })

  it('refuses a fragment it cannot place, naming the file and the fault', () => {
    const refused: Array<[string, RegExp]> = [
      ['XYZ-1: a new thing\n', /first line must be "# <YYYY-MM-DD>: <what changed> \(XYZ-1\)"/],
      [FRAGMENT.replace('(XYZ-1)', '(XYZ-9)'), /names XYZ-9; it names the file's ID, XYZ-1/],
      [FRAGMENT.replace('## Codes', '## Notes'), /"## Notes" is not a part/],
      [FRAGMENT.replace('## Codes', '## For people'), /"## For people" is given twice/],
      ['# 2026-12-01: a new thing (XYZ-1)\n\nStray text.\n', /text before the first part/],
      ['# 2026-12-01: a new thing (XYZ-1)\n\n## Codes\n\n| `room/x` | X | y |\n', /says nothing/],
      ['# 2026-12-01: a new thing (XYZ-1)\n\n## For people\n\n- A line.\n\n## Codes\n\n| `room/x` | X | y |\n', /a new code comes with its entry under "## For agents"/],
      [FRAGMENT.replace('| `zone/first` | A zone | nothing |', 'room/x is new'), /each line is a row of the code table/],
      [FRAGMENT.replace('- `grid_check`', '### A heading\n\n- `grid_check`'), /holds a heading/],
    ]
    for (const [fragment, reason] of refused) expect(() => readFragment('XYZ-1.md', fragment), String(reason)).toThrow(reason)
    expect(() => readFragments([['XYZ-1.md', FRAGMENT.replace('2026-12-01', '2026-13-45')]])).toThrow(/"2026-13-45" is not a day/)
  })

  it("puts each fragment's line for people at the top of Unreleased, newest first", () => {
    const older = readFragment('ABC-2.md', '# 2026-11-30: an older thing (ABC-2)\n\n## For people\n\n- An older thing.\n')
    const combined = withPeopleEntries(changelog, [older, readFragment('XYZ-1.md', FRAGMENT)])
    expect(combined).toContain('## Unreleased\n\n- You can do a new thing (XYZ-1).\n- An older thing.\n\n')
    expect(combined.replace('- You can do a new thing (XYZ-1).\n- An older thing.\n\n', '')).toBe(changelog)
    expect(withPeopleEntries(changelog, [])).toBe(changelog)
    // An empty Unreleased is filled, so the release step has something to cut.
    const empty = releaseChangelog(changelog, CUT)
    expect(releaseChangelog(withPeopleEntries(empty, [older]), { ...CUT, version: '0.1.1' })).toMatch(/## 0\.1\.1 \(2026-11-22\)\n\nResult version 1, plan format version 1\.\n\n- An older thing\.\n\n## 0\.1\.0/)
  })

  it('puts the entry for agents at the top of their changelog and each code in the table by its kind', () => {
    const combined = withAgentEntries(contract, [readFragment('XYZ-1.md', FRAGMENT)])
    expect(combined).toMatch(/^## Changelog for agents\n\n### 2026-12-01: a new thing \(XYZ-1\)\n\n- `grid_check` gives `room\/new-thing`\.\n\n### /m)
    const table = combined.slice(combined.indexOf('## The codes'), combined.indexOf('### Words Grid does not read')).split('\n').filter((l) => l.startsWith('| `'))
    const at = table.indexOf('| `room/new-thing` | Room "{name}" is new | nothing |')
    expect(table[at - 1]).toMatch(/^\| `room\//)
    expect(table[at + 1]).not.toMatch(/^\| `room\//)
    expect(table.at(-1)).toBe('| `zone/first` | A zone | nothing |')
    const cut = releaseAgentChangelog(combined, CUT)
    expect(cut).toMatch(/### Release 0\.1\.0 \(2026-11-22\): result version 1\n\nongrid 0\.1\.0 ships the entries below[^\n]*\n\n### 2026-12-01: a new thing \(XYZ-1\)/)
    const listed = [...contract.matchAll(/^\| `([a-z]+\/[a-z0-9-]+)` \|/gm)].map((m) => m[1])
    const taken = FRAGMENT.replaceAll('room/new-thing', String(listed.find((code) => code?.startsWith('room/'))))
    expect(() => withAgentEntries(contract, [readFragment('XYZ-1.md', taken)])).toThrow(/is already in the contract's code table/)
  })

  it('reads and combines every fragment waiting in changes/', () => {
    const folder = join(root, 'changes')
    const names = existsSync(folder) ? readdirSync(folder) : []
    const fragments = readFragments(names.map((name) => [name, readFileSync(join(folder, name), 'utf8')] as [string, string]))
    // A version no release takes, so this holds inside the release step's own tests gate too.
    expect(() => releaseAgentChangelog(withAgentEntries(contract, fragments), { ...CUT, version: '99.0.0' })).not.toThrow()
    expect(() => withPeopleEntries(changelog, fragments)).not.toThrow()
  })
})

it('writes the version into the lock file for the workspace packages only', () => {
  const lock = text('package-lock.json')
  const cut = withVersion(lock, '0.1.0', true)
  const before = lock.split('\n')
  const after = cut.split('\n')
  expect(after).toHaveLength(before.length)
  const changed = after.flatMap((line, i) => (line === before[i] ? [] : [i]))
  const parsed = JSON.parse(cut) as { version: string; packages: Record<string, { version?: string }> }
  const workspaces = Object.keys(parsed.packages).filter((key) => key === '' || /^packages\/[^/]+$/.test(key))
  expect(changed).toHaveLength(workspaces.length + 1)
  for (const key of workspaces) expect(parsed.packages[key]!.version).toBe('0.1.0')
  expect(parsed.version).toBe('0.1.0')
  expect(withVersion(text('package.json'), '0.1.0', false)).toBe(text('package.json').replace('"version": "0.0.0"', '"version": "0.1.0"'))
})

// A copy of what the release step reads and writes, to run it on.
const COPIED = [
  'CHANGELOG.md',
  'docs/result-contract.md',
  'package.json',
  'package-lock.json',
  'packages/rules/src/result/types.ts',
  'packages/floorplan/src/types/floorplan.ts',
  ...readdirSync(join(root, 'packages')).map((name) => `packages/${name}/package.json`).filter((path) => existsSync(join(root, path))),
]

function copy(fragments: Record<string, string> = {}): { dir: string; files: Map<string, string> } {
  const dir = temp('grid-release-')
  const files = new Map<string, string>()
  mkdirSync(join(dir, 'changes'))
  for (const [name, fragment] of Object.entries(fragments)) {
    writeFileSync(join(dir, 'changes', name), fragment)
    files.set(`changes/${name}`, fragment)
  }
  for (const path of COPIED) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    cpSync(join(root, path), join(dir, path))
    files.set(path, text(path))
  }
  return { dir, files }
}

const node = (code: string) => ({ command: process.execPath, args: ['-e', code] })
/** One step per gate; `failing` exits 1, and each step that runs leaves its name in ran.txt. */
function steps(failing?: string) {
  return GATES.map((gate) => ({
    name: gate.name,
    ...node(`require('fs').appendFileSync('ran.txt', '${gate.name}\\n'); process.exit(${gate.name === failing ? 1 : 0})`),
  }))
}

/** A packer that packs a manifest of the caller's choice, as npm pack lays it out. */
function packing(manifest: Record<string, unknown>) {
  return (folder: string): string => {
    const stage = join(folder, 'stage', 'package')
    mkdirSync(stage, { recursive: true })
    writeFileSync(join(stage, 'package.json'), JSON.stringify(manifest))
    writeFileSync(join(stage, 'grid.mjs'), '')
    const file = join(folder, `ongrid-${String(manifest['version'])}.tgz`)
    // Relative names, from the folder: GNU tar on Windows reads the `C:` of a path as a host (QAR-4).
    const tar = spawnSync('tar', ['-czf', basename(file), '-C', 'stage', 'package'], { cwd: folder })
    expect(tar.status, tar.stderr?.toString()).toBe(0)
    rmSync(join(folder, 'stage'), { recursive: true, force: true })
    return file
  }
}
const PACKED = { name: 'ongrid', version: '0.1.0', private: true, publishConfig: { access: 'public', provenance: true }, repository: { type: 'git', url: 'git+https://github.com/ongrid-arch/grid.git' } }
const quiet = () => {}

describe('the release step', () => {
  it.each(['scoreboard', 'label', 'licences'])('stops at a failed %s gate, packs nothing and puts every file back', (gate) => {
    const { dir, files } = copy()
    const out = join(dir, 'dist', 'release', '0.1.0')
    expect(() => release({ root: dir, ...CUT, dryRun: true, out, steps: steps(gate), pack: packing(PACKED), log: quiet })).toThrow(new RegExp(`the ${gate} gate failed`))
    const ran = readFileSync(join(dir, 'ran.txt'), 'utf8').trim().split('\n')
    expect(ran.at(-1)).toBe(gate)
    expect(ran).toEqual(GATES.map((g) => g.name).slice(0, ran.length))
    expect(existsSync(out)).toBe(false)
    for (const [path, before] of files) expect(readFileSync(join(dir, path), 'utf8'), path).toBe(before)
  })

  it('runs the gates on what it wrote: both changelogs and the versions, in one step', () => {
    const { dir } = copy()
    const check = node([
      "const fs = require('fs')",
      "if (!fs.readFileSync('CHANGELOG.md', 'utf8').includes('## 0.1.0 (2026-11-22)')) process.exit(1)",
      "if (!fs.readFileSync('docs/result-contract.md', 'utf8').includes('### Release 0.1.0 (2026-11-22)')) process.exit(1)",
      "if (JSON.parse(fs.readFileSync('packages/cli/package.json', 'utf8')).version !== '0.1.0') process.exit(1)",
    ].join('; '))
    const record = release({ root: dir, ...CUT, dryRun: true, out: join(dir, 'out'), steps: [{ name: 'sees', ...check }], pack: packing(PACKED), log: quiet })
    expect(record['gates']).toEqual(['sees'])
  })

  it('a dry run packs, records the provenance and stops before publishing, with every file as it was', () => {
    const { dir, files } = copy()
    const out = join(dir, 'dist', 'release', '0.1.0')
    const lines: string[] = []
    const record = release({ root: dir, ...CUT, dryRun: true, out, steps: steps(), pack: packing(PACKED), log: (line) => lines.push(line) })
    for (const [path, before] of files) expect(readFileSync(join(dir, path), 'utf8'), path).toBe(before)
    expect(record).toMatchObject({ release: '0.1.0', dryRun: true, published: false, gates: GATES.map((g) => g.name), resultVersion: 1, planFormat: 1 })
    const pack = record['package'] as Record<string, unknown>
    expect(pack).toMatchObject({ name: 'ongrid', file: 'pack/ongrid-0.1.0.tgz', publishConfig: { access: 'public', provenance: true } })
    expect(pack['integrity']).toMatch(/^sha512-[A-Za-z0-9+/]+=*$/)
    expect((record['publishing'] as Record<string, string>)['command']).toBe('npm publish pack/ongrid-0.1.0.tgz --provenance --access public --tag latest')
    expect(JSON.parse(readFileSync(join(out, 'release.json'), 'utf8'))).toEqual(record)
    expect(readFileSync(join(out, 'CHANGELOG.md'), 'utf8')).toContain('## 0.1.0 (2026-11-22)')
    expect(readFileSync(join(out, 'result-contract.md'), 'utf8')).toContain('### Release 0.1.0 (2026-11-22): result version 1')
    expect(lines.at(-1)).toBe("Stopped before publishing: publishing waits on the owner's yes (CMD-8). Nothing was published.")
  })

  it('combines the fragments into both changelogs, deletes them for the gates, and a dry run puts them back', () => {
    const fragment = '# 2026-11-22: a new thing (XYZ-1)\n\n## For people\n\n- You can do a new thing (XYZ-1).\n\n## For agents\n\n- No new code in the record.\n'
    const { dir, files } = copy({ 'XYZ-1.md': fragment, 'README.md': '# Not a fragment\n' })
    const check = node([
      "const fs = require('fs')",
      "if (fs.existsSync('changes/XYZ-1.md') || !fs.existsSync('changes/README.md')) process.exit(1)",
      "if (!fs.readFileSync('CHANGELOG.md', 'utf8').includes('## 0.1.0 (2026-11-22)\\n\\nResult version 1, plan format version 1.\\n\\n- You can do a new thing (XYZ-1).\\n')) process.exit(1)",
      "if (!fs.readFileSync('docs/result-contract.md', 'utf8').includes('ships the entries below, down to the next release heading.\\n\\n### 2026-11-22: a new thing (XYZ-1)\\n\\n- No new code in the record.\\n\\n')) process.exit(1)",
    ].join('; '))
    const out = join(dir, 'out')
    const lines: string[] = []
    release({ root: dir, ...CUT, dryRun: true, out, steps: [{ name: 'sees', ...check }], pack: packing(PACKED), log: (line) => lines.push(line) })
    expect(lines).toContain('Combined and deleted 1 fragment: changes/XYZ-1.md.')
    for (const [path, before] of files) expect(readFileSync(join(dir, path), 'utf8'), path).toBe(before)
    expect(readFileSync(join(out, 'CHANGELOG.md'), 'utf8')).toContain('- You can do a new thing (XYZ-1).')
    expect(readFileSync(join(out, 'result-contract.md'), 'utf8')).toContain('### 2026-11-22: a new thing (XYZ-1)')
  })

  it('refuses a fragment it cannot read before writing anything', () => {
    const { dir, files } = copy({ 'XYZ-1.md': '# A new thing\n' })
    expect(() => release({ root: dir, ...CUT, dryRun: true, steps: [], log: quiet })).toThrow(/changes\/XYZ-1\.md: the first line must be/)
    for (const [path, before] of files) expect(readFileSync(join(dir, path), 'utf8'), path).toBe(before)
  })

  it('refuses a tarball that is not private, or not set for provenance', () => {
    for (const [manifest, reason] of [
      [{ ...PACKED, private: false }, /not private/],
      [{ ...PACKED, publishConfig: { access: 'public' } }, /provenance/],
      [{ ...PACKED, version: '0.0.9' }, /holds version 0\.0\.9/],
    ] as const) {
      const { dir, files } = copy()
      expect(() => release({ root: dir, ...CUT, dryRun: true, out: join(dir, 'out'), steps: [], pack: packing(manifest), log: quiet })).toThrow(reason)
      for (const [path, before] of files) expect(readFileSync(join(dir, path), 'utf8'), path).toBe(before)
    }
  })

  it('refuses a version against the rule before writing anything, and a real cut outside a clean checkout', () => {
    const { dir, files } = copy()
    expect(() => release({ root: dir, ...CUT, version: '0.0.0', dryRun: true, steps: [], log: quiet })).toThrow(Refused)
    expect(() => release({ root: dir, ...CUT, dryRun: false, steps: [], log: quiet })).toThrow(/working tree has changes/)
    for (const [path, before] of files) expect(readFileSync(join(dir, path), 'utf8'), path).toBe(before)
  })

  it('reads the package.json of a tarball npm packed', () => {
    const dir = temp('grid-release-pack-')
    const file = packing(PACKED)(dir)
    expect(packedManifest(readFileSync(file))).toEqual(PACKED)
  })
})

describe('the gates', () => {
  const scripts = (JSON.parse(text('package.json')) as { scripts: Record<string, string> }).scripts

  it('hold the scoreboard gate, the label test and the licence check, and run the full checks', () => {
    expect(GATES.map((g) => g.name)).toEqual(['build', 'typecheck', 'lint', 'label', 'licences', 'data', 'tests', 'scoreboard'])
    const by = Object.fromEntries(GATES.map((g) => [g.name, g]))
    expect(by['scoreboard']!.npm).toBe('scoreboard')
    expect(by['licences']!.npm).toBe('check:licenses')
    expect(by['label']!.vitest).toEqual(['packages/cli/src/__tests__/label.test.ts'])
    expect(by['tests']!.vitest).toEqual([])
  })

  it('name scripts and tests that exist', () => {
    for (const gate of GATES) {
      if (gate.npm !== undefined) expect(scripts[gate.npm], gate.name).toBeDefined()
      for (const file of gate.vitest ?? []) expect(existsSync(join(root, file)), file).toBe(true)
    }
  })

  it('run as commands, with the tests on fewer cores when asked', () => {
    const steps = gateSteps(root, GATES, 2)
    expect(steps.map((s) => s.name)).toEqual(GATES.map((g) => g.name))
    const label = steps.find((s) => s.name === 'label')!
    expect(label.args.slice(-4)).toEqual(['run', 'packages/cli/src/__tests__/label.test.ts', '--maxWorkers=2', '--minWorkers=1'])
    expect(steps.find((s) => s.name === 'scoreboard')!.args.slice(-2)).toEqual(['run', 'scoreboard'])
  })
})

describe('the release workflow', () => {
  const workflow = text('.github/workflows/release.yml')
  const lines = workflow.split('\n').filter((line) => !line.trimStart().startsWith('#'))
  const body = lines.join('\n')

  it('starts by hand only', () => {
    const on = body.slice(body.indexOf('\non:'), body.indexOf('\npermissions:'))
    expect(on).toMatch(/^\non:\n {2}workflow_dispatch:\n/)
    expect(on.match(/^ {2}\S/gm)).toHaveLength(1)
  })

  it('runs the release step as a dry run, so every gate, and stops before any publish step', () => {
    expect(body).toContain('run: node scripts/release.mjs "$VERSION" --dry-run')
    expect(body).not.toMatch(/npm publish|pnpm publish|yarn publish|npm dist-tag|git push|git tag/)
    expect(body).not.toContain('continue-on-error')
    expect(body).not.toMatch(/^\s+if:/m)
    // The version comes in through the environment, never into a script.
    for (const line of lines.filter((l) => /^\s+run:/.test(l))) expect(line).not.toContain('${{')
  })

  it('asks for no token and holds no secret', () => {
    expect(body).toMatch(/^permissions:\n {2}contents: read\n/m)
    expect(body).not.toContain('id-token')
    expect(body).not.toMatch(/secrets\.|NODE_AUTH_TOKEN|NPM_TOKEN/)
  })
})
