/**
 * CMD-7 (T-app-integrator-4, T-app-integrator-9, T-estate-agent-listings-3, -22): an agent with no
 * copy of the repository gets the instructions on `initialize`, as on `server/discover`, and reads
 * the guide and the plan's JSON Schema from the tool server.
 */
import { describe, expect, it } from 'vitest'
import { planJsonSchema } from '@ongrid/floorplan/types/planSchema'
import { handleLine, INSTRUCTIONS } from '../../mcp/protocol'
import { projectResources } from '../../mcp/serveTools'
import { agentGuide } from '../guide'

async function rpc(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const line = await handleLine(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), [], projectResources())
  return JSON.parse(line as string) as Record<string, unknown>
}

describe('the tool server, for an agent with no copy of the repository', () => {
  it('sends its instructions on initialize, the same as on server/discover', async () => {
    const init = (await rpc('initialize', { protocolVersion: '2025-06-18' }))['result'] as Record<string, unknown>
    expect(init['instructions']).toBe(INSTRUCTIONS)
    const meta = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} }
    const discover = (await rpc('server/discover', { _meta: meta }))['result'] as Record<string, unknown>
    expect(discover['instructions']).toBe(INSTRUCTIONS)
  })

  it('serves the guide for agents as markdown', async () => {
    const read = (await rpc('resources/read', { uri: 'grid://guide' }))['result'] as { contents: { uri: string; mimeType: string; text: string }[] }
    expect(read.contents).toEqual([{ uri: 'grid://guide', mimeType: 'text/markdown', text: agentGuide() }])
  })

  it('serves the plan JSON Schema, the one the build writes', async () => {
    const read = (await rpc('resources/read', { uri: 'grid://schema/plan' }))['result'] as { contents: { mimeType: string; text: string }[] }
    expect(read.contents[0]?.mimeType).toBe('application/schema+json')
    expect(JSON.parse(read.contents[0]?.text as string)).toEqual(planJsonSchema())
  })
})
