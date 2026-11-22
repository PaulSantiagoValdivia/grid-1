/**
 * MSG-1, `docs/result-contract.md`: on the tool server a refusal is a result marked as an error,
 * and a protocol error is kept for a request that is malformed. Every tool is tried with the
 * ways a call is refused: arguments that are not an object, an argument the tool does not take,
 * a plan that is not there and a plan the format refuses.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { openProject } from '../../fs/projectFiles'
import { handleLine } from '../protocol'
import { GRID_TOOLS, projectTools } from '../serveTools'

const dir = mkdtempSync(join(tmpdir(), 'grid-contract-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
// A version Grid does not read: since MSG-6 a fault inside a part no longer refuses the plan.
writeFileSync(join(dir, 'refused.json'), JSON.stringify({ version: '2', walls: [{ id: 'w1', start: [0, 0], end: [4, 0], thickness: -1 }] }))
const tools = projectTools(openProject(dir, dir))

async function send(message: unknown): Promise<Record<string, unknown>> {
  const line = typeof message === 'string' ? message : JSON.stringify(message)
  return JSON.parse((await handleLine(line, tools)) as string) as Record<string, unknown>
}

const callOf = (name: string, args: unknown, id = 1) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } })

describe('a refusal is a result marked as an error', () => {
  const refusals: [string, (name: string) => unknown][] = [
    ['arguments that are not an object', () => [1, 2]],
    ['an argument the tool does not take', () => ({ plan: 'plan.json', colour: 'red' })],
    ['a plan that is not there', () => ({ plan: 'missing.json' })],
    ['a plan the format refuses', () => ({ plan: 'refused.json' })],
  ]

  for (const [what, args] of refusals) {
    it(`for ${what}, by every tool`, async () => {
      for (const tool of GRID_TOOLS) {
        // A tool that needs more than a plan is refused for what it lacks; that is a refusal too.
        const reply = await send(callOf(tool.name, args(tool.name)))
        expect(reply['error'], tool.name).toBeUndefined()
        const result = reply['result'] as { isError?: boolean; content: { type: string; text: string }[] }
        expect(result.isError, `${tool.name}: ${what}`).toBe(true)
        expect(result.content[0]!.type).toBe('text')
        expect(result.content[0]!.text.length).toBeGreaterThan(0)
      }
    })
  }
})

describe('a protocol error is kept for a malformed request', () => {
  it.each([
    ['text that is not JSON', '{ "jsonrpc": ', -32700],
    ['JSON that is not a request', '[1, 2]', -32600],
    ['a method the server does not have', { jsonrpc: '2.0', id: 1, method: 'tools/run' }, -32601],
    ['a tool the server does not have', callOf('grid_paint', {}), -32602],
  ])('%s', async (_what, message, code) => {
    const reply = await send(message)
    expect(reply['result']).toBeUndefined()
    expect((reply['error'] as { code: number }).code).toBe(code)
  })
})
