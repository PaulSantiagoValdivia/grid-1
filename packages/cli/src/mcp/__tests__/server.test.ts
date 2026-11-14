import { spawn } from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { build } from 'esbuild'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The server is started as its own Node process, the way an agent's host starts it.

let dir: string
let script: string

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'grid-preview-tool-'))
  script = join(dir, 'server.js')
  await build({
    entryPoints: [join(__dirname, '..', 'server.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: script,
    logLevel: 'silent',
  })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

function exchange(lines: unknown[]): Promise<Array<Record<string, unknown>>> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let out = ''
    child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString() })
    child.on('error', reject)
    child.on('close', () => {
      try {
        resolve(out.split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line)))
      } catch (error) {
        reject(error)
      }
    })
    for (const line of lines) child.stdin.write(`${JSON.stringify(line)}\n`)
    child.stdin.end()
  })
}

describe('the preview tool server', () => {
  it('answers initialize and a tool call over stdio, and nothing for notifications', async () => {
    const replies = await exchange([
      { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'show_in_preview', arguments: { floor: 'first', view: '3d' } } },
    ])

    expect(replies.map((reply) => reply['id'])).toEqual([0, 1])
    expect(replies[0]).toMatchObject({ result: { serverInfo: { name: 'grid' } } })
    expect(replies[1]).toMatchObject({ result: { content: [{ type: 'text', text: 'Showing first in 3d' }] } })
  }, 20_000)
})
