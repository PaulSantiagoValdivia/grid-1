/**
 * CMD-9: the one source of every way Grid is installed in an agent. The package an install
 * unpacks, the registry's server.json, the plugin folder for Claude Code and Codex with the
 * marketplaces that list it, the Add to Cursor link, the set-up lines for the agents that take a
 * typed line, and the manifest of the bundle for Claude's desktop app all come from here, so
 * they name the same package, server and command. `pack.mjs` writes them; it publishes nothing.
 *
 * Every one of them starts the server with one line, `npx -y ongrid mcp`. That line fetches the
 * package from npm, which waits on publishing (CMD-8). Until then `pack.mjs` packs the same
 * package into a tarball, and the tests install it from there.
 *
 * Pure: it builds text and data and touches no file. Descriptions state what Grid does and
 * never praise it or tell an agent to prefer it.
 *
 * Formats, read on 21 November 2026 and not yet tried against the hosts themselves:
 * - MCP Registry server.json and `mcpName`: github.com/modelcontextprotocol/registry, docs.
 * - MCPB manifest 0.3: github.com/modelcontextprotocol/mcpb, MANIFEST.md.
 * - Claude Code plugins and marketplaces: code.claude.com/docs/en/plugins-reference and
 *   /plugin-marketplaces.
 * - Codex plugins and marketplaces: developers.openai.com/plugins/build/plugins.
 * - Cursor install links: cursor.com/docs/context/mcp/install-links.
 * - VS Code `code --add-mcp`: code.visualstudio.com/docs/agents/reference/mcp-configuration.
 * - Copilot CLI `copilot mcp add`: docs.github.com, Copilot CLI, add MCP servers.
 */
import { GENERAL_GUIDANCE_LABEL } from '@ongrid/rules'
import { RETELLING_RULE } from '../mcp/retelling'
import { dependencies } from '../../package.json'
import type { GridTool } from '../mcp/toolkit'
import { ROOM_NAMES_TRAVEL } from '../mcp/protocol'

/** The npm package, and the command `npx` runs from it. */
export const PACKAGE_NAME = 'ongrid'
/** The name every host lists the server and the plugin under. */
export const SERVER_KEY = 'grid'
/** The registry's name for the server, which the package names as `mcpName`. Its namespace is the GitHub owner's. */
export const MCP_NAME = 'io.github.ongrid-arch/grid'
export const REPOSITORY = 'https://github.com/ongrid-arch/grid'
const AUTHOR = { name: 'The Grid authors', url: REPOSITORY }
const LICENSE = 'Apache-2.0'
/** What Grid is, as a fact, in at most 100 characters (the registry's limit). */
export const DESCRIPTION = 'Reads, measures, checks, draws and changes floor plans kept in one plan file.'
const KEYWORDS = ['floor plan', 'architecture', 'mcp', 'cad']

/** The one line that starts Grid's tool server. */
export const SERVER_COMMAND = { command: 'npx', args: ['-y', PACKAGE_NAME, 'mcp'] } as const
export const ONE_LINE = [SERVER_COMMAND.command, ...SERVER_COMMAND.args].join(' ')

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

/**
 * The package.json of the package an install unpacks: the one bundled file as both commands,
 * and nothing to fetch but the canvas, which is native and optional (without it every tool
 * works except a picture). It stays private until publishing is approved (CMD-8).
 *
 * `publishConfig` holds the provenance settings (QAR-10): once published, from the release
 * workflow only, npm records which commit and which run built the package, and `repository`
 * is the repository npm compares that record with. RELEASING.md says how.
 */
export function packageManifest(version: string): Record<string, unknown> {
  return {
    name: PACKAGE_NAME,
    version,
    private: true,
    description: DESCRIPTION,
    license: LICENSE,
    type: 'module',
    bin: { grid: 'grid.mjs', ongrid: 'grid.mjs' },
    files: ['grid.mjs', 'chunks/', 'fonts/', 'README.md', 'LICENSE', 'NOTICE'],
    engines: { node: '>=22' },
    mcpName: MCP_NAME,
    repository: { type: 'git', url: `git+${REPOSITORY}.git`, directory: 'packages/cli' },
    homepage: REPOSITORY,
    keywords: KEYWORDS,
    optionalDependencies: { '@napi-rs/canvas': dependencies['@napi-rs/canvas'] },
    publishConfig: { access: 'public', provenance: true },
  }
}

/** The short README the package carries. */
export function packageReadme(): string {
  return [
    '# Grid (ongrid)',
    '',
    `${DESCRIPTION} The \`grid\` and \`ongrid\` commands do the same thing.`,
    '',
    `Start the tool server for an agent with \`${ONE_LINE}\`. Run \`grid --help\` for the commands.`,
    '',
    `Every report is labelled "${GENERAL_GUIDANCE_LABEL}".`,
    '',
    `Source, issues and the other ways to install: ${REPOSITORY}`,
    '',
    `Licensed under ${LICENSE}. See LICENSE and NOTICE.`,
    '',
  ].join('\n')
}

/** The official MCP Registry's entry. It is accepted only once the package is on npm (CMD-8). */
export function serverJson(version: string): Record<string, unknown> {
  return {
    $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
    name: MCP_NAME,
    description: DESCRIPTION,
    repository: { url: REPOSITORY, source: 'github', subfolder: 'packages/cli' },
    version,
    packages: [{
      registryType: 'npm',
      registryBaseUrl: 'https://registry.npmjs.org',
      identifier: PACKAGE_NAME,
      version,
      transport: { type: 'stdio' },
      packageArguments: [{ type: 'positional', value: 'mcp' }],
    }],
  }
}

/** The skill the plugin carries: when to reach for Grid's tools, and how to start. */
function skill(): string {
  return [
    '---',
    `name: ${SERVER_KEY}`,
    'description: Use when the person wants to see, measure, check or change a floor plan kept in a Grid plan file (plan.json, or a folder grid init made), or asks about its rooms, doors, windows, areas or walls. Not for plans that exist only as pictures or PDFs.',
    '---',
    '',
    '# Grid',
    '',
    "Grid's tools work on one plan file inside the project folder. Pass `plan`, the plan file's path",
    'inside that folder; in a folder `grid init` made, leave it out and the tools read `plan.json`.',
    '',
    '1. Start with `grid_describe` to learn the rooms and what each door joins.',
    '2. Answer questions about sizes with `grid_areas`, `grid_measure`, `grid_schedule` or `grid_takeoff`.',
    '3. Show the plan with `grid_view` when the person wants to see it.',
    '4. Run `grid_check` after any change, and tell the person what it finds.',
    '5. Write a plan rooms first, the main way to write one: `grid_write_rooms` takes the rooms',
    '   with their sizes and neighbours and works out the walls. The plan file is the source of',
    '   truth: to change a plan, read it back with `grid_describe` as=rooms, change the text and',
    '   write it again. For one sentence of request, one change: `grid_change_opening`,',
    '   `grid_move_room_side`, `grid_merge_rooms`, `grid_split_room`, `grid_add_room`,',
    '   `grid_stretch`, `grid_rename_room` or `grid_mirror`; each says what it changed, what it',
    '   guessed and what it could not keep. Change the plan only when asked.',
    '6. When a Grid tool\'s answer looks wrong, `grid_report_problem` drafts an issue about it.',
    '   Grid sends nothing: show the person the draft and let them decide whether to file it.',
    '',
    ROOM_NAMES_TRAVEL,
    '',
    `Keep the label every report carries, "${GENERAL_GUIDANCE_LABEL}".`,
    RETELLING_RULE,
    '',
  ].join('\n')
}

/**
 * The plugin folder, path by path: a manifest each for Claude Code (`.claude-plugin/`) and for
 * Codex (the portable `plugin.json`), the server for each (`.mcp.json`, `mcp.json`), and the skill.
 */
export function pluginFiles(version: string): Record<string, string> {
  const about = { name: SERVER_KEY, version, description: DESCRIPTION, author: AUTHOR, homepage: REPOSITORY, repository: REPOSITORY, license: LICENSE, keywords: KEYWORDS }
  return {
    '.claude-plugin/plugin.json': json(about),
    '.mcp.json': json({ mcpServers: { [SERVER_KEY]: { command: SERVER_COMMAND.command, args: [...SERVER_COMMAND.args] } } }),
    'plugin.json': json({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', ...about }),
    'mcp.json': json({
      $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
      mcpServers: { [SERVER_KEY]: { type: 'stdio', command: SERVER_COMMAND.command, args: [...SERVER_COMMAND.args] } },
    }),
    'skills/grid/SKILL.md': skill(),
  }
}

/**
 * A marketplace folder that lists the plugin, for Claude Code (`/plugin marketplace add`) and
 * Codex (`codex plugin marketplace add`), with the plugin under `plugins/grid/`. Committed at the
 * repository's top, it would let both add Grid by the repository's name (CMD-8).
 */
export function marketplaceFiles(version: string): Record<string, string> {
  const source = `./plugins/${SERVER_KEY}`
  const plugin = Object.fromEntries(Object.entries(pluginFiles(version)).map(([path, text]) => [`plugins/${SERVER_KEY}/${path}`, text]))
  return {
    '.claude-plugin/marketplace.json': json({
      name: SERVER_KEY,
      owner: AUTHOR,
      plugins: [{ name: SERVER_KEY, source, description: DESCRIPTION, version, license: LICENSE }],
    }),
    '.agents/plugins/marketplace.json': json({
      name: SERVER_KEY,
      owner: AUTHOR,
      plugins: [{ name: SERVER_KEY, source: { source: 'local', path: source }, description: DESCRIPTION, version }],
    }),
    ...plugin,
  }
}

/** Cursor's install link: the server's command as base64 JSON. */
export function cursorLink(): string {
  const config = btoa(JSON.stringify({ command: SERVER_COMMAND.command, args: SERVER_COMMAND.args }))
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${SERVER_KEY}&config=${config}`
}

/** The line each agent that takes a typed line is set up with. */
export function installLines(): ReadonlyArray<{ readonly agent: string; readonly line: string }> {
  const add = (program: string): string => `${program} mcp add ${SERVER_KEY} -- ${ONE_LINE}`
  const vscode = JSON.stringify({ name: SERVER_KEY, type: 'stdio', command: SERVER_COMMAND.command, args: SERVER_COMMAND.args })
  return [
    { agent: 'Claude Code', line: add('claude') },
    { agent: 'Codex', line: add('codex') },
    { agent: 'VS Code', line: `code --add-mcp '${vscode}'` },
    { agent: 'Copilot CLI', line: add('copilot') },
  ]
}

/** The install page `pack.mjs` writes beside the files, and the README's section holds. */
export function installText(): string {
  return [
    `Every way below starts Grid's tool server with \`${ONE_LINE}\`.`,
    '',
    ...installLines().map(({ agent, line }) => `- ${agent}: \`${line}\``),
    `- Cursor: [Add to Cursor](${cursorLink()})`,
    `- Claude Code, as a plugin with a skill: \`/plugin marketplace add ongrid-arch/grid\`, then \`/plugin install grid@grid\``,
    '- Codex, as a plugin with a skill: `codex plugin marketplace add ongrid-arch/grid`',
    "- Claude's desktop app: open the `.mcpb` file for your computer and pick the project folder.",
    '',
  ].join('\n')
}

/** A tool's description for the bundle's manifest: its first sentence, at most 200 characters. */
function shortDescription(description: string): string {
  const first = /^.*?[.!?](?=\s|$)/.exec(description)?.[0] ?? description
  if (first.length <= 200) return first
  return `${first.slice(0, 199).replace(/\s+\S*$/, '')}…`
}

/** The tools as the bundle's manifest lists them, in the server's order. */
export function mcpbTools(tools: readonly GridTool[]): Array<{ name: string; description: string }> {
  return tools.map((tool) => ({ name: tool.name, description: shortDescription(tool.description) }))
}

/**
 * The manifest of the bundle for Claude's desktop app. The app unpacks the bundle and runs the
 * bundled file with its own Node; the person picks the project folder on install, since the
 * app starts servers in no folder of theirs.
 */
export function mcpbManifest(version: string, tools: ReadonlyArray<{ name: string; description: string }>, platform?: string): Record<string, unknown> {
  return {
    manifest_version: '0.3',
    name: SERVER_KEY,
    display_name: 'Grid',
    version,
    description: DESCRIPTION,
    author: AUTHOR,
    repository: { type: 'git', url: REPOSITORY },
    homepage: REPOSITORY,
    license: LICENSE,
    keywords: KEYWORDS,
    server: {
      type: 'node',
      entry_point: 'server/grid.mjs',
      mcp_config: { command: 'node', args: ['${__dirname}/server/grid.mjs', 'mcp', '--project', '${user_config.project}'] },
    },
    user_config: {
      project: {
        type: 'directory',
        title: 'Project folder',
        description: 'The folder that holds your plan files. Grid reads and writes files only inside it.',
        required: true,
      },
    },
    tools,
    compatibility: {
      ...(platform ? { platforms: [platform] } : {}),
      runtimes: { node: '>=22.0.0' },
    },
  }
}
