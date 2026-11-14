import { describe, expect, it } from 'vitest'
import { handleLine, parsePreviewArgs, PREVIEW_TOOL_NAME } from '../protocol'

function call(message: unknown): Record<string, unknown> {
  const out = handleLine(JSON.stringify(message))
  expect(out).not.toBeNull()
  return JSON.parse(out as string) as Record<string, unknown>
}

function toolCall(args: unknown, name = PREVIEW_TOOL_NAME): Record<string, unknown> {
  return call({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name, arguments: args } })
}

describe('the preview tool protocol', () => {
  it('answers initialize with the version the client asked for and a tools capability', () => {
    const res = call({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18' } })
    expect(res).toMatchObject({
      jsonrpc: '2.0',
      id: 0,
      result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'grid' } },
    })
  })

  it('stays silent on notifications', () => {
    expect(handleLine(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }))).toBeNull()
  })

  it('ignores blank lines', () => {
    expect(handleLine('   ')).toBeNull()
  })

  it('answers ping', () => {
    expect(call({ jsonrpc: '2.0', id: 3, method: 'ping' })).toEqual({ jsonrpc: '2.0', id: 3, result: {} })
  })

  it('lists show_in_preview as a read-only tool with its arguments', () => {
    const res = call({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) as { result: { tools: Array<Record<string, unknown>> } }
    expect(res.result.tools).toHaveLength(1)
    const tool = res.result.tools[0] as {
      name: string
      description: string
      inputSchema: { properties: Record<string, unknown>; additionalProperties: boolean }
      annotations: { readOnlyHint: boolean }
    }
    expect(tool.name).toBe('show_in_preview')
    expect(tool.annotations.readOnlyHint).toBe(true)
    expect(Object.keys(tool.inputSchema.properties).sort()).toEqual(['floor', 'note', 'room', 'view'])
    expect(tool.inputSchema.additionalProperties).toBe(false)
    expect(tool.description).toMatch(/note/i)
  })

  it('echoes a valid call and does nothing else', () => {
    const res = toolCall({ floor: 'first', view: '3d', note: 'Look at the new bathroom' })
    expect(res).toEqual({
      jsonrpc: '2.0',
      id: 7,
      result: { content: [{ type: 'text', text: 'Showing first in 3d' }] },
    })
  })

  it('echoes a room or a view on its own', () => {
    expect((toolCall({ room: 'f1-r2' }) as { result: { content: Array<{ text: string }> } }).result.content[0].text)
      .toBe('Showing the floor of f1-r2')
    expect((toolCall({ view: '2d' }) as { result: { content: Array<{ text: string }> } }).result.content[0].text)
      .toBe('Showing 2d')
  })

  it('reports invalid arguments as a tool error', () => {
    for (const args of [{}, { view: '4d' }, { floor: 3 }, { floor: '' }, { floor: 'x', extra: true }, null, 'first']) {
      const res = toolCall(args) as { result: { isError?: boolean; content: Array<{ text: string }> } }
      expect(res.result.isError).toBe(true)
      expect(res.result.content[0].text.length).toBeGreaterThan(0)
    }
  })

  it('rejects an unknown tool name', () => {
    const res = toolCall({ floor: 'first' }, 'delete_everything')
    expect(res).toMatchObject({ id: 7, error: { code: -32602 } })
  })

  it('rejects unknown methods that expect an answer', () => {
    expect(call({ jsonrpc: '2.0', id: 9, method: 'resources/list' })).toMatchObject({ id: 9, error: { code: -32601 } })
  })

  it('answers a malformed line with a parse error', () => {
    const out = handleLine('{not json')
    expect(JSON.parse(out as string)).toMatchObject({ id: null, error: { code: -32700 } })
  })
})

describe('parsePreviewArgs', () => {
  it('keeps the four arguments', () => {
    expect(parsePreviewArgs({ floor: 'first', view: '3d', room: 'r1', note: 'Here' }))
      .toEqual({ floor: 'first', view: '3d', room: 'r1', note: 'Here' })
  })

  it('trims an oversized note to 120 characters', () => {
    const parsed = parsePreviewArgs({ floor: 'first', note: 'a'.repeat(500) })
    expect(parsed?.note).toHaveLength(120)
  })

  it('strips control characters from the note and drops an empty one', () => {
    expect(parsePreviewArgs({ floor: 'first', note: 'Look\u0000 here\n' })?.note).toBe('Look here')
    expect(parsePreviewArgs({ floor: 'first', note: '\u0007' })).toEqual({ floor: 'first' })
  })

  it('needs a floor, a view or a room', () => {
    expect(parsePreviewArgs({ note: 'Only a note' })).toBeNull()
  })

  it('rejects overlong ids', () => {
    expect(parsePreviewArgs({ floor: 'f'.repeat(200) })).toBeNull()
  })
})
