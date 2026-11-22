/**
 * The few MCP messages Grid's tool server needs, by hand.
 *
 * This runs inside the tool server an agent's host starts, so it imports nothing: no SDK, no
 * files, no network. The tools are handed in by the caller (`serveTools.ts`), and reach the
 * disk only through the project's resolver.
 *
 * Limits (T-3): a request line of more than `LINE_MAX_BYTES` is refused unread, and so is a
 * request id of more than `REQUEST_ID_MAX` characters. Neither is ever repeated in the answer.
 * Only protocol versions Grid knows are answered with; any other gets Grid's own.
 *
 * Two eras (CMD-9). An older client opens with `initialize` and Grid answers as it always has.
 * A 2026-07-28 client sends no handshake: every request names its version and capabilities in
 * `params._meta`, it starts with `server/discover`, and each result says it is complete. A
 * request is served in the era its own `_meta` shows, so the server keeps no state between
 * lines. A version Grid does not speak is refused with the ones it does (-32022), and so is a
 * method it does not know: a client of neither era learns what to send.
 */
import { RETELLING_RULE } from './retelling'

export const SERVER_NAME = 'grid'
/** The longest request line the server reads: 1 MiB. */
export const LINE_MAX_BYTES = 1_048_576
/** The longest request id, in characters, as for any id Grid takes. */
export const REQUEST_ID_MAX = 64
export const PROTOCOL_VERSIONS = ['2024-11-05', '2025-03-26', '2025-06-18'] as const
const LATEST_PROTOCOL_VERSION = '2025-06-18'
/** The versions served without a handshake, each request naming its own (2026-07-28). */
export const PER_REQUEST_VERSIONS = ['2026-07-28'] as const

const META_VERSION = 'io.modelcontextprotocol/protocolVersion'
const META_CAPABILITIES = 'io.modelcontextprotocol/clientCapabilities'
const META_SERVER_INFO = 'io.modelcontextprotocol/serverInfo'
/** The 2026-07-28 error for a protocol version the server does not speak. */
export const UNSUPPORTED_VERSION = -32022
/** How long a client may keep the tool list and the discover answer: they never change while the server runs. */
const CACHE_MS = 3_600_000
const SERVER_INFO = { name: SERVER_NAME, version: '1' }
/** Only a version shaped like one is repeated back; anything else is text from the client (T-3). */
const VERSION_SHAPE = /^\d{4}-\d{2}-\d{2}$/

function listOf(items: readonly string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** The versions Grid speaks, in one sentence, for every refusal a client of another era may get. */
export const VERSIONS_SPOKEN = `Grid's tool server speaks MCP ${listOf(PER_REQUEST_VERSIONS)}, with the version in each request's _meta and server/discover first, and ${listOf(PROTOCOL_VERSIONS)} after initialize.`

/** What `server/discover` says about the tools, for an agent's host to show. */
/**
 * What the guide, the server's instructions and the tools that write a plan, an export or a
 * sheet all say (HND-9). The DXF writes each room's name, the IFC its name and id, OBJ and GLB
 * its id, the sheet its name; the plan file holds both.
 */
export const ROOM_NAMES_TRAVEL =
  'Room names and ids go into every export (DXF, IFC, OBJ, GLB) and sheet, and travel with the plan file: never put a person\'s name in a room\'s name or id. '
  + 'Who sits where belongs in the occupancy file beside the plan (plan.occupancy.json), which no export carries.'

/**
 * What the server tells an agent's host before any tool (WRT-1, WRT-2): rooms-first is the main
 * way to write a plan, and the plan file, not the rooms text, is the source of truth. BRF-1: the
 * brief comes first, from the person's words.
 */
/**
 * WRT-7: the person's units come from their words or their place, asked only when neither says,
 * and are recorded in the plan's `display`, which every drawing, figure and sheet follows. The plan
 * file stays in metres.
 */
export const UNITS_RULE =
  'Work in the person\'s units: settle them with the brief, from their words (12 ft, 1,800 sq ft, 4 m) or their place, and ask only when neither says. '
  + 'Record them with a display line in the rooms text (display ft-in, display m): Grid\'s drawings, figures and sheets follow it, and the plan file stays in metres. A length may carry its unit in one word (360cm, 12ft, 12\'6").'

export const INSTRUCTIONS =
  'Grid\'s tools read, measure, check, draw and change floor plans kept in plan files inside the project folder. Pass plan: the plan file, as a path inside that folder. '
  + 'Before the first room, keep what the person asked for with grid_write_brief, from their own words, each wish given or assumed; every change then says which lines are met and which missed. '
  + `${UNITS_RULE} `
  + 'Write a plan rooms first, the main way to write one: name the rooms with their inside sizes and neighbours, and the doors and windows by the rooms they join, and grid_write_rooms works out the walls. '
  + 'The plan file is the source of truth; rooms text is a way of writing and reading it. To change a plan, read it back with grid_describe as=rooms, change the text and write it with grid_write_rooms. Each room\'s boundary is derived: never edit it by hand. '
  + `${ROOM_NAMES_TRAVEL} `
  + 'Every report carries the label General guidance, not your local rules. '
  + RETELLING_RULE

type Id = string | number | null

/** One answer of a tool: short text, the same facts as data, and maybe a picture. */
export interface ToolAnswer {
  readonly text: string
  readonly isError?: boolean
  readonly data?: Record<string, unknown>
  readonly image?: { readonly data: Uint8Array; readonly mimeType: string }
}

/** A tool the server offers, handed in by whoever starts the server. */
export interface ServerTool {
  /** The tool as `tools/list` shows it: name, title, description, schemas and hints. */
  readonly definition: { readonly name: string } & Record<string, unknown>
  /**
   * Runs one call. Every refusal comes back as text with `isError`, never as a throw. `request`
   * says what the request itself named: the protocol version, for a 2026-07-28 client (CMD-13).
   */
  call(args: unknown, request?: CallRequest): ToolAnswer | Promise<ToolAnswer>
}

/** What one request names about itself. The server keeps nothing between requests. */
export interface CallRequest {
  readonly protocolVersion?: string
}

function reply(id: Id, result: unknown): string {
  return JSON.stringify({ jsonrpc: '2.0', id, result })
}

function fail(id: Id, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })
}

function base64(bytes: Uint8Array): string {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}

function toolResult(answer: ToolAnswer): Record<string, unknown> {
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: answer.text }]
  if (answer.image) content.push({ type: 'image', data: base64(answer.image.data), mimeType: answer.image.mimeType })
  if (answer.isError === true) return { content, isError: true }
  return answer.data === undefined ? { content } : { content, structuredContent: answer.data }
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

async function runTool(id: Id, tool: ServerTool, args: unknown, wrap: (result: Record<string, unknown>) => Record<string, unknown> = (result) => result, request: CallRequest = {}): Promise<string> {
  let answer: ToolAnswer
  try {
    answer = await tool.call(args, request)
  } catch (error) {
    answer = { text: `Something went wrong inside Grid: ${oneLine(String((error as Error)?.message ?? error))}`, isError: true }
  }
  return reply(id, wrap(toolResult(answer)))
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A 2026-07-28 result: marked complete, and saying which server answered. */
function complete(result: Record<string, unknown>): Record<string, unknown> {
  return { resultType: 'complete', ...result, _meta: { [META_SERVER_INFO]: SERVER_INFO } }
}

/** One request of a 2026-07-28 client, which names its version in its own `_meta`. */
function perRequest(id: Id, method: unknown, params: Record<string, unknown>, tools: readonly ServerTool[]): string | Promise<string> {
  const meta = isObject(params['_meta']) ? params['_meta'] : {}
  const asked = meta[META_VERSION]
  if (typeof asked !== 'string') {
    return fail(id, -32602, `Invalid params: this request needs ${META_VERSION} in its _meta. ${VERSIONS_SPOKEN}`)
  }
  if (!(PER_REQUEST_VERSIONS as readonly string[]).includes(asked)) {
    return JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: {
        code: UNSUPPORTED_VERSION,
        message: `Unsupported protocol version. ${VERSIONS_SPOKEN}`,
        data: { supported: [...PER_REQUEST_VERSIONS], ...(VERSION_SHAPE.test(asked) ? { requested: asked } : {}) },
      },
    })
  }
  if (!isObject(meta[META_CAPABILITIES])) {
    return fail(id, -32602, `Invalid params: this request needs ${META_CAPABILITIES} in its _meta; an empty object is enough.`)
  }
  switch (method) {
    case 'server/discover':
      return reply(id, complete({
        supportedVersions: [...PER_REQUEST_VERSIONS],
        capabilities: { tools: {} },
        instructions: INSTRUCTIONS,
        ttlMs: CACHE_MS,
        cacheScope: 'public',
      }))
    case 'tools/list':
      return reply(id, complete({ tools: tools.map((tool) => tool.definition), ttlMs: CACHE_MS, cacheScope: 'public' }))
    case 'tools/call': {
      const tool = tools.find((t) => t.definition.name === params['name'])
      if (!tool) return fail(id, -32602, 'Unknown tool')
      // The version is one Grid speaks, checked above: it may be repeated.
      return runTool(id, tool, params['arguments'], complete, { protocolVersion: asked })
    }
    default:
      // initialize and ping are gone from this revision; anything else Grid does not offer.
      return fail(id, -32601, `Method not found. ${VERSIONS_SPOKEN}`)
  }
}

function byteLength(line: string): number {
  // A character takes at least one byte, so a long line needs no counting.
  if (line.length > LINE_MAX_BYTES) return line.length
  return new TextEncoder().encode(line).length
}

/**
 * One JSON-RPC line in, one line out, or null when nothing should be sent. A tool call that
 * draws a picture answers later, so a call may give a promise of its line.
 */
export function handleLine(line: string, tools: readonly ServerTool[] = []): string | null | Promise<string> {
  if (byteLength(line) > LINE_MAX_BYTES) {
    return fail(null, -32600, `Request refused unread: the line is longer than ${LINE_MAX_BYTES} bytes (1 MiB), the most Grid's tool server reads.`)
  }
  if (!line.trim()) return null
  let message: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(line)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return fail(null, -32600, 'Invalid request')
    }
    message = parsed as Record<string, unknown>
  } catch {
    return fail(null, -32700, 'Parse error')
  }

  const id = message['id']
  // Notifications carry no id and never get an answer.
  if (id === undefined) return null
  if (typeof id !== 'string' && typeof id !== 'number' && id !== null) return fail(null, -32600, 'Invalid request')
  if (typeof id === 'string' && id.length > REQUEST_ID_MAX) {
    return fail(null, -32600, `Invalid request: a request id may have at most ${REQUEST_ID_MAX} characters.`)
  }

  const params = (typeof message['params'] === 'object' && message['params'] !== null
    ? message['params']
    : {}) as Record<string, unknown>

  // A request that names its version, or asks what the server speaks, is of the 2026-07-28 era.
  if (message['method'] === 'server/discover' || (isObject(params['_meta']) && params['_meta'][META_VERSION] !== undefined)) {
    return perRequest(id, message['method'], params, tools)
  }

  switch (message['method']) {
    case 'initialize': {
      const asked = params['protocolVersion']
      const known = (PROTOCOL_VERSIONS as readonly unknown[]).includes(asked)
      return reply(id, {
        protocolVersion: known ? asked : LATEST_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      })
    }
    case 'ping':
      return reply(id, {})
    case 'tools/list':
      return reply(id, { tools: tools.map((tool) => tool.definition) })
    case 'tools/call': {
      const tool = tools.find((t) => t.definition.name === params['name'])
      if (!tool) return fail(id, -32602, 'Unknown tool')
      return runTool(id, tool, params['arguments'])
    }
    default:
      return fail(id, -32601, `Method not found. ${VERSIONS_SPOKEN}`)
  }
}
