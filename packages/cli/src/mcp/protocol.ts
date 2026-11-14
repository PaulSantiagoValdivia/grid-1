/**
 * The few MCP messages Grid's preview tool needs, by hand.
 *
 * This runs inside the tool server an agent's host starts, so it imports nothing:
 * no SDK, no files, no network. A call is only echoed back.
 */

export const PREVIEW_SERVER_NAME = 'grid'
export const PREVIEW_TOOL_NAME = 'show_in_preview'
export const PREVIEW_NOTE_MAX = 120
const ID_MAX = 64
const FALLBACK_PROTOCOL_VERSION = '2025-06-18'

export interface PreviewArgs {
  floor?: string
  view?: '2d' | '3d'
  room?: string
  note?: string
}

const TOOL = {
  name: PREVIEW_TOOL_NAME,
  description:
    "Show the user something in Grid's live preview of the plan. Call it once after you edit "
    + 'floor-plan.json, with the floor you changed and the view that shows the change best '
    + '(3d for heights and volumes, 2d for layout), and always a short note in your own words '
    + 'saying what to look at. Also call it when the user asks to see something. It only moves '
    + 'the preview; it changes nothing in the plan.',
  inputSchema: {
    type: 'object',
    properties: {
      floor: { type: 'string', description: 'A floor id from the plan\'s "floors", for example "first".' },
      view: { type: 'string', enum: ['2d', '3d'], description: '2d for the plan view, 3d for the model.' },
      room: { type: 'string', description: 'A room id. The preview shows the floor that room is on.' },
      note: {
        type: 'string',
        maxLength: PREVIEW_NOTE_MAX,
        description: 'One short sentence for the user, in your own words, saying what to look at.',
      },
    },
    additionalProperties: false,
  },
  annotations: { title: 'Show in preview', readOnlyHint: true, openWorldHint: false },
}

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g
const HAS_CONTROL = /[\u0000-\u001f\u007f-\u009f]/

function cleanId(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') return null
  const id = value.trim()
  return id && id.length <= ID_MAX && !HAS_CONTROL.test(id) ? id : null
}

/** The tool's arguments, cleaned, or null when they can't be shown. */
export function parsePreviewArgs(raw: unknown): PreviewArgs | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  if (Object.keys(record).some((key) => !['floor', 'view', 'room', 'note'].includes(key))) return null

  const floor = cleanId(record['floor'])
  const room = cleanId(record['room'])
  if (floor === null || room === null) return null

  const view = record['view']
  if (view !== undefined && view !== '2d' && view !== '3d') return null

  const rawNote = record['note']
  if (rawNote !== undefined && typeof rawNote !== 'string') return null
  const note = rawNote?.replace(CONTROL, '').trim().slice(0, PREVIEW_NOTE_MAX)

  if (floor === undefined && room === undefined && view === undefined) return null

  const args: PreviewArgs = {}
  if (floor !== undefined) args.floor = floor
  if (view !== undefined) args.view = view
  if (room !== undefined) args.room = room
  if (note) args.note = note
  return args
}

function echo(args: PreviewArgs): string {
  const target = args.floor ?? (args.room !== undefined ? `the floor of ${args.room}` : undefined)
  if (target === undefined) return `Showing ${args.view}`
  return `Showing ${target}${args.view ? ` in ${args.view}` : ''}`
}

type Id = string | number | null

function reply(id: Id, result: unknown): string {
  return JSON.stringify({ jsonrpc: '2.0', id, result })
}

function fail(id: Id, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })
}

function toolText(text: string, isError = false): Record<string, unknown> {
  return isError ? { content: [{ type: 'text', text }], isError: true } : { content: [{ type: 'text', text }] }
}

/** One JSON-RPC line in, one line out, or null when nothing should be sent. */
export function handleLine(line: string): string | null {
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

  const params = (typeof message['params'] === 'object' && message['params'] !== null
    ? message['params']
    : {}) as Record<string, unknown>

  switch (message['method']) {
    case 'initialize': {
      const asked = params['protocolVersion']
      return reply(id, {
        protocolVersion: typeof asked === 'string' && asked.length <= 32 ? asked : FALLBACK_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: PREVIEW_SERVER_NAME, version: '1' },
      })
    }
    case 'ping':
      return reply(id, {})
    case 'tools/list':
      return reply(id, { tools: [TOOL] })
    case 'tools/call': {
      if (params['name'] !== PREVIEW_TOOL_NAME) return fail(id, -32602, 'Unknown tool')
      const args = parsePreviewArgs(params['arguments'])
      if (!args) {
        return reply(id, toolText(
          'Pass a floor id, a room id or a view ("2d" or "3d"), and optionally a short note.',
          true,
        ))
      }
      return reply(id, toolText(echo(args)))
    }
    default:
      return fail(id, -32601, 'Method not found')
  }
}
