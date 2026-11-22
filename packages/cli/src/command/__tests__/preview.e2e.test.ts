/**
 * VEW-4: `grid preview`, the preview as a local page, run as the built command: it serves the
 * page on this computer only, answers the page's one call, refuses every other request, and
 * tells a change to the plan file within 2 s.
 */
import { spawn, spawnSync, type ChildProcess } from 'child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { request } from 'http'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { twoBedFlat } from '../../mcp/__tests__/replay/plans'

const bundle = resolve(__dirname, '..', '..', '..', 'dist', 'grid.mjs')

let folder: string
let child: ChildProcess
let url: string
let port: number

/** One request to the page's server, with the headers given; the answer's status, type and text. */
function ask(path: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ status: number; type: string; text: string; headers: Record<string, unknown> }> {
  return new Promise((done, failed) => {
    const sent = request({ host: '127.0.0.1', port, path, method: options.method ?? 'GET', headers: options.headers ?? {} }, (reply) => {
      let text = ''
      reply.setEncoding('utf8')
      reply.on('data', (chunk: string) => { text += chunk })
      reply.on('end', () => done({ status: reply.statusCode ?? 0, type: String(reply.headers['content-type'] ?? ''), text, headers: reply.headers }))
    })
    sent.on('error', failed)
    if (options.body !== undefined) sent.write(options.body)
    sent.end()
  })
}

const sync = (args: Record<string, unknown>, headers: Record<string, string> = {}) => ask('/call', {
  method: 'POST',
  headers: { 'content-type': 'application/json', host: `127.0.0.1:${port}`, ...headers },
  body: JSON.stringify({ name: 'grid_preview_sync', arguments: args }),
})

beforeAll(async () => {
  if (!existsSync(bundle)) throw new Error('dist/grid.mjs is missing: run npm run build first (npm test does it)')
  folder = mkdtempSync(join(tmpdir(), 'grid-preview-command-'))
  writeFileSync(join(folder, 'grid.json'), '{"version":1}\n')
  writeFileSync(join(folder, 'plan.json'), JSON.stringify(twoBedFlat()))
  child = spawn(process.execPath, [bundle, 'preview', '--port', '0'], { cwd: folder, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  await new Promise<void>((started, failed) => {
    child.stdout!.on('data', (chunk: Buffer) => {
      out += chunk.toString()
      if (out.includes('Ctrl+C')) started()
    })
    child.on('exit', (code) => failed(new Error(`grid preview stopped with ${code}: ${out}`)))
  })
  const found = /http:\/\/127\.0\.0\.1:(\d+)\//.exec(out)
  expect(out).toMatch(/^Grid's preview of "plan\.json": http:\/\/127\.0\.0\.1:\d+\/\n/)
  url = found![0]
  port = Number(found![1])
}, 30_000)

afterAll(() => {
  child?.kill()
  rmSync(folder, { recursive: true, force: true })
})

describe('grid preview (VEW-4)', () => {
  it('serves the page, holding all it needs, with rules that let it load nothing else', async () => {
    const page = await ask('/')
    expect(page.status).toBe(200)
    expect(page.type).toBe('text/html; charset=utf-8')
    expect(page.text).toContain('<body data-grid-mode="local" data-grid-plan="plan.json">')
    expect(String(page.headers['content-security-policy'])).toContain("default-src 'none'")
    expect(String(page.headers['content-security-policy'])).toContain("connect-src 'self'")
    expect(url).toBe(`http://127.0.0.1:${port}/`)
  })

  it('answers the page\'s call, and tells a change to the plan file within 2 s', async () => {
    const first = JSON.parse((await sync({ plan: 'plan.json' })).text) as { structuredContent: { revision: string; drawing: { svg: string } } }
    expect(first.structuredContent.drawing.svg).toContain('data-id="kitchen"')
    const same = JSON.parse((await sync({ plan: 'plan.json', since: first.structuredContent.revision })).text) as { structuredContent: { changed: boolean } }
    expect(same.structuredContent.changed).toBe(false)
    const plan = twoBedFlat() as { rooms: Array<{ id: string; name: string }> }
    plan.rooms.find((r) => r.id === 'kitchen')!.name = 'Galley'
    writeFileSync(join(folder, 'plan.json'), JSON.stringify(plan))
    const start = Date.now()
    // The page asks every 500 ms; the server tells the change on the first ask after it.
    const changed = JSON.parse((await sync({ plan: 'plan.json', since: first.structuredContent.revision })).text) as { structuredContent: { changed: boolean; drawing: { svg: string } } }
    expect(changed.structuredContent.changed).toBe(true)
    expect(changed.structuredContent.drawing.svg).toContain('Galley')
    expect(Date.now() - start + 500).toBeLessThan(2000)
  })

  it('refuses a request addressed to another name, a call from another site, and any other call', async () => {
    expect((await ask('/', { headers: { host: 'attacker.example:80' } })).status).toBe(421)
    expect((await sync({}, { host: `evil.example:${port}` })).status).toBe(421)
    expect((await sync({}, { origin: 'http://evil.example' })).status).toBe(403)
    expect((await sync({}, { origin: `http://127.0.0.1:${port}` })).status).toBe(200)
    expect((await ask('/call', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })).status).toBe(415)
    expect((await ask('/call')).status).toBe(405)
    const other = await ask('/call', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'grid_mirror', arguments: { how: 'left-right' } }) })
    expect(other.status).toBe(404)
    expect((await ask('/plan.json')).status).toBe(404)
  })

  it('refuses a plan outside the project before it serves anything', () => {
    const run = spawnSync(process.execPath, [bundle, 'preview', '../elsewhere.json', '--port', '0'], { cwd: folder, encoding: 'utf8' })
    expect(run.status).toBe(1)
    expect(run.stdout).toBe('')
    expect(run.stderr).toContain('"../elsewhere.json"')
  })

  it('refuses a port it cannot take, by name', () => {
    const run = spawnSync(process.execPath, [bundle, 'preview', '--port', 'eighty'], { cwd: folder, encoding: 'utf8' })
    expect(run.status).toBe(2)
    expect(run.stderr).toContain('--port takes a whole number')
  })
})
