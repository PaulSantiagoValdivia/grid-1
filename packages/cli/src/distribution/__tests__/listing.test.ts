import { spawnSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { approvalWords, GENERAL_GUIDANCE_LABEL } from '@ongrid/rules'
import { GRID_TOOLS } from '../../mcp/serveTools'
import {
  cursorLink,
  installLines,
  installText,
  marketplaceFiles,
  MCP_NAME,
  mcpbManifest,
  mcpbTools,
  ONE_LINE,
  packageManifest,
  PACKAGE_NAME,
  pluginFiles,
  REPOSITORY,
  SERVER_COMMAND,
  SERVER_KEY,
  serverJson,
} from '../listing'
import { zip } from '../zip'
import { unzip } from './unzip'

/**
 * CMD-9: every install artefact is made from one source, `listing.ts`. These tests hold the
 * shapes each agent reads. `install.e2e.test.ts` installs each one and makes a call.
 */

const cli = resolve(__dirname, '../../..')
const repo = resolve(cli, '../..')
const cliManifest = JSON.parse(readFileSync(join(cli, 'package.json'), 'utf8')) as { version: string; dependencies: Record<string, string> }
const VERSION = '1.2.3'

function json(text: string | undefined): Record<string, unknown> {
  expect(text).toBeDefined()
  return JSON.parse(text as string) as Record<string, unknown>
}

describe('the one line', () => {
  it('is npx -y ongrid mcp, and every artefact starts the server with it', () => {
    expect(ONE_LINE).toBe('npx -y ongrid mcp')
    expect([SERVER_COMMAND.command, ...SERVER_COMMAND.args].join(' ')).toBe(ONE_LINE)
    expect(PACKAGE_NAME).toBe('ongrid')
    expect(SERVER_KEY).toBe('grid')
  })
})

describe('the package an install unpacks', () => {
  const manifest = packageManifest(VERSION)

  it('stays private until publishing is approved (CMD-8), under Apache-2.0', () => {
    expect(manifest['private']).toBe(true)
    expect(manifest['license']).toBe('Apache-2.0')
    expect(manifest['name']).toBe(PACKAGE_NAME)
    expect(manifest['version']).toBe(VERSION)
  })

  it('runs from the one bundled file: both commands, no package of its own to fetch', () => {
    expect(manifest['bin']).toEqual({ grid: 'grid.mjs', ongrid: 'grid.mjs' })
    expect(manifest['dependencies']).toBeUndefined()
    // The canvas draws the PNGs. It is native, so it stays outside the bundle, and optional:
    // without it everything but a picture works.
    expect(manifest['optionalDependencies']).toEqual({ '@napi-rs/canvas': cliManifest.dependencies['@napi-rs/canvas'] })
    expect(manifest['engines']).toEqual({ node: '>=22' })
  })

  it('is set to publish with provenance, public, from this repository (QAR-10)', () => {
    expect(manifest['publishConfig']).toEqual({ access: 'public', provenance: true })
    expect(manifest['repository']).toMatchObject({ type: 'git', url: `git+${REPOSITORY}.git` })
  })

  it('names the registry entry it belongs to (mcpName)', () => {
    expect(manifest['mcpName']).toBe(MCP_NAME)
    expect(serverJson(VERSION)['name']).toBe(MCP_NAME)
  })
})

describe('the registry entry (server.json)', () => {
  const entry = serverJson(VERSION)

  it('points at the npm package, started over stdio with the mcp argument', () => {
    expect(entry['$schema']).toMatch(/^https:\/\/static\.modelcontextprotocol\.io\/schemas\/[\d-]+\/server\.schema\.json$/)
    expect(entry['version']).toBe(VERSION)
    expect(entry['packages']).toEqual([{
      registryType: 'npm',
      registryBaseUrl: 'https://registry.npmjs.org',
      identifier: PACKAGE_NAME,
      version: VERSION,
      transport: { type: 'stdio' },
      packageArguments: [{ type: 'positional', value: 'mcp' }],
    }])
    expect(entry['repository']).toMatchObject({ url: 'https://github.com/ongrid-arch/grid', source: 'github' })
  })

  it('states a fact in at most 100 characters', () => {
    const description = entry['description'] as string
    expect(description.length).toBeGreaterThan(20)
    expect(description.length).toBeLessThanOrEqual(100)
    expect(description).not.toMatch(/\b(best|powerful|leading|easy|simply|perfect|prefer)\b/i)
  })
})

describe('the plugin folder, for Claude Code and Codex', () => {
  const files = pluginFiles(VERSION)

  it('holds a manifest for each, the server for each, Grid\'s skill and the four a firm can own (COD-8)', () => {
    expect(Object.keys(files).sort()).toEqual([
      '.claude-plugin/plugin.json',
      '.mcp.json',
      'mcp.json',
      'plugin.json',
      'skills/dimensioning/SKILL.md',
      'skills/firm-standards/SKILL.md',
      'skills/grid/SKILL.md',
      'skills/option-table/SKILL.md',
      'skills/room-programme/SKILL.md',
    ])
  })

  it('names the plugin grid in both manifests, with the version and licence', () => {
    for (const path of ['.claude-plugin/plugin.json', 'plugin.json']) {
      expect(json(files[path])).toMatchObject({ name: 'grid', version: VERSION, license: 'Apache-2.0' })
    }
    expect(json(files['plugin.json'])['$schema']).toMatch(/agent-plugins\.org\/schemas\/1\.0\.0\/plugin\.schema\.json$/)
  })

  it('starts the server with the one line, in Claude Code\'s file and the portable one', () => {
    expect(json(files['.mcp.json'])).toEqual({ mcpServers: { grid: { command: 'npx', args: ['-y', 'ongrid', 'mcp'] } } })
    expect(json(files['mcp.json'])).toMatchObject({ mcpServers: { grid: { type: 'stdio', command: 'npx', args: ['-y', 'ongrid', 'mcp'] } } })
  })

  it('has a skill that says when to use the tools and keeps the label', () => {
    const skill = files['skills/grid/SKILL.md'] as string
    const front = /^---\nname: (.+)\ndescription: (.+)\n---\n/.exec(skill)
    expect(front?.[1]).toBe('grid')
    expect(front?.[2]).toMatch(/^Use when /)
    expect(skill).toContain(GENERAL_GUIDANCE_LABEL)
    for (const tool of ['grid_describe', 'grid_check', 'grid_view', 'grid_write_rooms']) expect(skill).toContain(tool)
    // WRT-1, WRT-2: rooms-first is the main way to write, and the plan file the source of truth.
    expect(skill).toContain('Write a plan rooms first, the main way to write one')
    expect(skill.replace(/\s+/g, ' ')).toContain('The plan file is the source of truth')
    expect(skill).not.toMatch(/\bcompl(y|ies|iant)\b|\bapproved\b/i)
  })

  // COD-8: the skills beside Grid's own, plain text a firm can copy into its repository and own.
  const OWNED: Record<string, readonly string[]> = {
    'firm-standards': ['grid_check', 'firm-standards.json', 'corridor_width', 'door_clear_width', 'turning_circle', 'fixture_clearance', 'room_area', 'room_width'],
    'room-programme': ['grid_write_brief', 'grid_write_rooms', 'grid_areas', 'grid_check'],
    'option-table': ['grid_compare', 'grid_check'],
    dimensioning: ['grid_measure', 'grid_view', 'grid_sheet'],
  }
  for (const [name, tools] of Object.entries(OWNED)) {
    it(`has the ${name} skill, with the frontmatter, Grid's tools by name, the label and no word of approval`, () => {
      const skill = files[`skills/${name}/SKILL.md`] as string
      const front = /^---\nname: (.+)\ndescription: (.+)\n---\n/.exec(skill)
      expect(front?.[1]).toBe(name)
      expect(front?.[2]).toMatch(/^Use when /)
      // A description says when not to use it, as every tool's does.
      expect(front?.[2]).toMatch(/\bNot for\b/)
      expect(skill).toContain(GENERAL_GUIDANCE_LABEL)
      for (const tool of tools) expect(skill).toContain(tool)
      expect(skill).toContain('A firm can copy it into its own repository')
      expect(skill).not.toMatch(/\bcompl(y|ies|iant)\b|\bapproved\b/i)
      expect(approvalWords(skill)).toEqual([])
      for (const tool of skill.match(/\bgrid_[a-z_]+/g) ?? []) expect(GRID_TOOLS.map((t) => t.name)).toContain(tool)
    })
  }

  it('says the firm\'s standards are the firm\'s own, apart from the code figures, and tied to no place', () => {
    const skill = (files['skills/firm-standards/SKILL.md'] as string).replace(/\s+/g, ' ')
    expect(skill).toContain("not from any code or standard, and not tied to a place")
    expect(skill).toContain("The firm's own standards")
    expect(skill).toContain('apart from the code figures')
  })
})

describe('the marketplaces that list the plugin', () => {
  const files = marketplaceFiles(VERSION)

  it('hold the plugin under plugins/grid, as pluginFiles makes it', () => {
    for (const [path, text] of Object.entries(pluginFiles(VERSION))) expect(files[`plugins/grid/${path}`]).toBe(text)
  })

  it('list it for Claude Code by the plugin\'s own name', () => {
    const market = json(files['.claude-plugin/marketplace.json'])
    expect(market).toMatchObject({ name: 'grid', owner: { name: expect.any(String) } })
    expect(market['plugins']).toEqual([expect.objectContaining({ name: 'grid', source: './plugins/grid', version: VERSION })])
  })

  it('list it for Codex as a local source', () => {
    const market = json(files['.agents/plugins/marketplace.json'])
    expect(market['plugins']).toEqual([expect.objectContaining({ name: 'grid', source: { source: 'local', path: './plugins/grid' } })])
  })
})

describe('the Add to Cursor link', () => {
  it('is Cursor\'s install link with the server\'s command as base64 JSON', () => {
    const link = new URL(cursorLink())
    expect(`${link.protocol}//${link.host}${link.pathname}`).toBe('cursor://anysphere.cursor-deeplink/mcp/install')
    expect(link.searchParams.get('name')).toBe('grid')
    expect(JSON.parse(atob(link.searchParams.get('config') as string))).toEqual({ command: 'npx', args: ['-y', 'ongrid', 'mcp'] })
  })
})

describe('the set-up lines', () => {
  const lines = Object.fromEntries(installLines().map((entry) => [entry.agent, entry.line]))

  it('cover each agent that takes a typed line', () => {
    expect(Object.keys(lines)).toEqual(['Claude Code', 'Codex', 'VS Code', 'Copilot CLI'])
  })

  it('add the server under the name grid with the one line', () => {
    expect(lines['Claude Code']).toBe('claude mcp add grid -- npx -y ongrid mcp')
    expect(lines['Codex']).toBe('codex mcp add grid -- npx -y ongrid mcp')
    expect(lines['Copilot CLI']).toBe('copilot mcp add grid -- npx -y ongrid mcp')
  })

  it('give VS Code its JSON in one quoted argument', () => {
    const line = lines['VS Code'] as string
    const quotedJson = /^code --add-mcp '(.+)'$/.exec(line)?.[1]
    expect(JSON.parse(quotedJson as string)).toEqual({ name: 'grid', type: 'stdio', command: 'npx', args: ['-y', 'ongrid', 'mcp'] })
  })

  it('are all in the README, with the Cursor link, so the two cannot drift apart', () => {
    const readme = readFileSync(join(repo, 'README.md'), 'utf8')
    expect(readme).toContain(ONE_LINE)
    for (const line of Object.values(lines)) expect(readme).toContain(line)
    expect(readme).toContain(cursorLink())
    expect(readme).toContain(installText())
  })
})

describe('the bundle for Claude\'s desktop app (.mcpb)', () => {
  const manifest = mcpbManifest(VERSION, mcpbTools(GRID_TOOLS))

  it('runs the bundled file with node, in the project folder the person picks', () => {
    expect(manifest).toMatchObject({
      manifest_version: '0.3',
      name: 'grid',
      version: VERSION,
      author: { name: expect.any(String) },
      license: 'Apache-2.0',
      server: {
        type: 'node',
        entry_point: 'server/grid.mjs',
        mcp_config: { command: 'node', args: ['${__dirname}/server/grid.mjs', 'mcp', '--project', '${user_config.project}'] },
      },
      user_config: { project: { type: 'directory', required: true } },
      compatibility: { runtimes: { node: '>=22.0.0' } },
    })
  })

  it('lists every tool, in the server\'s order, each with a short description', () => {
    const tools = manifest['tools'] as Array<{ name: string; description: string }>
    expect(tools.map((tool) => tool.name)).toEqual(GRID_TOOLS.map((tool) => tool.name))
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(10)
      expect(tool.description.length).toBeLessThanOrEqual(200)
    }
  })
})

describe('the zip writer the bundle is packed with', () => {
  const files = [
    { path: 'manifest.json', data: new TextEncoder().encode('{"name":"grid"}') },
    { path: 'server/grid.mjs', data: new TextEncoder().encode('#!/usr/bin/env node\n'.repeat(50)), executable: true },
    { path: 'server/empty.txt', data: new Uint8Array() },
  ]

  it('round-trips every file, with its mode', () => {
    const read = unzip(zip(files))
    expect([...read.keys()]).toEqual(['manifest.json', 'server/empty.txt', 'server/grid.mjs'])
    for (const file of files) expect(read.get(file.path)?.data.equals(Buffer.from(file.data))).toBe(true)
    expect(read.get('server/grid.mjs')?.mode).toBe(0o100755)
    expect(read.get('manifest.json')?.mode).toBe(0o100644)
  })

  it('writes the same bytes for the same files, in any order', () => {
    expect(Buffer.from(zip(files)).equals(Buffer.from(zip([...files].reverse())))).toBe(true)
  })

  it('refuses a path that would leave the bundle', () => {
    for (const path of ['../x', '/abs', 'a/../../b', 'a\\b', '']) {
      expect(() => zip([{ path, data: new Uint8Array() }])).toThrow(/path/)
    }
  })

  const hasUnzip = spawnSync('unzip', ['-v']).status === 0
  it.skipIf(!hasUnzip)('is read by the system unzip too', () => {
    const dir = mkdtempSync(join(tmpdir(), 'grid-zip-'))
    try {
      writeFileSync(join(dir, 'test.zip'), zip(files))
      const run = spawnSync('unzip', ['-t', join(dir, 'test.zip')], { encoding: 'utf8' })
      expect(run.status).toBe(0)
      expect(run.stdout).toContain('No errors detected')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
