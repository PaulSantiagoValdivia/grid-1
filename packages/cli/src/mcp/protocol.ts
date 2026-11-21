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
 */

export const SERVER_NAME = 'grid'
/** The longest request line the server reads: 1 MiB. */
export const LINE_MAX_BYTES = 1_048_576
/** The longest request id, in characters, as for any id Grid takes. */
export const REQUEST_ID_MAX = 64
export const PROTOCOL_VERSIONS = ['2024-11-05', '2025-03-26', '2025-06-18'] as const
const LATEST_PROTOCOL_VERSION = '2025-06-18'

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
  /** Runs one call. Every refusal comes back as text with `isError`, never as a throw. */
  call(args: unknown): ToolAnswer | Promise<ToolAnswer>
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

async function runTool(id: Id, tool: ServerTool, args: unknown): Promise<string> {
  let answer: ToolAnswer
  try {
    answer = await tool.call(args)
  } catch (error) {
    answer = { text: `Something went wrong inside Grid: ${oneLine(String((error as Error)?.message ?? error))}`, isError: true }
  }
  return reply(id, toolResult(answer))
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

  switch (message['method']) {
    case 'initialize': {
      const asked = params['protocolVersion']
      const known = (PROTOCOL_VERSIONS as readonly unknown[]).includes(asked)
      return reply(id, {
        protocolVersion: known ? asked : LATEST_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: '1' },
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
      return fail(id, -32601, 'Method not found')
  }
}
