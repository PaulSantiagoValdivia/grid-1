/**
 * VEW-4: the preview page in a browser (jsdom), as `grid preview` serves it: the page's own
 * script, its calls to the local server, the tools behind it and the files beside the plan.
 *
 * A click on a part returns its id and the agent reads it; the parts the agent picks out and the
 * room it frames change what the page shows; a change to the plan file is drawn within 2 s.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { JSDOM } from 'jsdom'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { previewPageHtml } from '@ongrid/viewer/src/page/previewPage'
import { openProject } from '../../fs/projectFiles'
import { handleLine } from '../../mcp/protocol'
import { projectTools } from '../../mcp/serveTools'
import { twoBedFlat } from '../../mcp/__tests__/replay/plans'
import { startLocalPreview, type LocalPreview } from '../localServer'

let folder: string
let server: LocalPreview
let dom: JSDOM

async function agent(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const line = await handleLine(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }), projectTools(openProject(folder, folder, 'project')))
  return (JSON.parse(line as string) as { result: Record<string, unknown> }).result
}

/** Waits for a condition the page should reach, up to a limit, and says how long it took. */
async function until(what: string, test: () => boolean, limit = 8000): Promise<number> {
  const start = Date.now()
  while (!test()) {
    if (Date.now() - start > limit) throw new Error(`The page did not reach this in ${limit} ms: ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return Date.now() - start
}

const doc = (): Document => dom.window.document
const svg = (): SVGSVGElement | null => doc().querySelector('#plan2d svg')
const part = (id: string, kind = 'room'): Element => doc().querySelector(`#plan2d [data-part="${kind}"][data-id="${id}"]`)!
const record = (): Record<string, unknown> => (existsSync(join(folder, 'plan.preview.json')) ? JSON.parse(readFileSync(join(folder, 'plan.preview.json'), 'utf8')) as Record<string, unknown> : {})

beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), 'grid-page-'))
  writeFileSync(join(folder, 'grid.json'), '{"version":1}\n')
  writeFileSync(join(folder, 'plan.json'), JSON.stringify(twoBedFlat()))
  server = await startLocalPreview({ project: openProject(folder, folder, 'project'), plan: 'plan.json', port: 0, page: previewPageHtml({ plan: 'plan.json' }) })
  dom = await JSDOM.fromURL(server.url, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    // jsdom has no fetch of its own: the page's calls go to the server it came from.
    beforeParse(window) {
      Object.assign(window, { fetch: (url: string, init?: RequestInit) => fetch(new URL(url, server.url), init) })
    },
  })
}, 30_000)

afterAll(async () => {
  dom?.window.close()
  await server?.close()
  rmSync(folder, { recursive: true, force: true })
})

// The page reads the plan and the record every half second, and some of these steps wait for it.
describe('the preview page (VEW-4)', { timeout: 20_000 }, () => {
  it('opens as a local page and draws the plan', async () => {
    await until('the 2D drawing', () => svg() !== null)
    expect(part('kitchen')).toBeTruthy()
    expect(doc().getElementById('status')!.textContent).toBe('Click a part to select it.')
  })

  it('returns the id a click hits, and the agent reads it', async () => {
    part('kitchen').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    await until('the selection in the record', () => (record()['selected'] as { id?: string } | null)?.id === 'kitchen')
    const read = await agent('grid_preview', {})
    expect((read['structuredContent'] as Record<string, unknown>)['selected']).toEqual({ id: 'kitchen', kind: 'room', name: 'Kitchen', floor: 'ground' })
    await until('the selection drawn', () => part('kitchen').classList.contains('grid-sel'))
    expect(doc().getElementById('status')!.textContent).toBe('Selected: room Kitchen (kitchen)')
    // A door's leaf or its hole: the id of the door.
    const door = doc().querySelector('#plan2d [data-id="door-bath"]:not([data-part="dimension"])')!
    door.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    await until('the door in the record', () => (record()['selected'] as { id?: string } | null)?.id === 'door-bath')
    expect(record()['selected']).toMatchObject({ kind: 'door' })
  })

  it('shows the parts the agent picks out and frames the room it names', async () => {
    const full = svg()!.getAttribute('viewBox')
    await agent('grid_preview', { room: 'bed1', highlight: ['win-bed1', 'door-bed1'], note: 'The new window.' })
    await until('the parts picked out', () => doc().querySelectorAll('#plan2d [data-id="win-bed1"].grid-hl').length > 0)
    expect(doc().querySelectorAll('#plan2d [data-id="door-bed1"].grid-hl').length).toBeGreaterThan(0)
    expect(doc().querySelectorAll('#plan2d [data-id="kitchen"].grid-hl')).toHaveLength(0)
    // Framed: bed1 runs from x 4.6 to 9.2 and y 0 to 3.3 in the plan, y down in the drawing.
    await until('the room framed', () => svg()!.getAttribute('viewBox') !== full)
    const [x, y, w, h] = svg()!.getAttribute('viewBox')!.split(' ').map(Number) as [number, number, number, number]
    expect(x).toBeLessThan(4.7)
    expect(x + w).toBeGreaterThan(9.1)
    expect(y).toBeLessThan(-3.2)
    expect(y + h).toBeGreaterThan(-0.1)
    expect(w).toBeLessThan(Number(full!.split(' ')[2]))
    expect(doc().getElementById('note')!.textContent).toBe('The new window.')
    // Nothing picked out when the agent sends an empty list.
    await agent('grid_preview', { highlight: [] })
    await until('nothing picked out', () => doc().querySelectorAll('#plan2d .grid-hl').length === 0)
  })

  it('draws the plan again within 2 s of the plan file changing', async () => {
    const plan = twoBedFlat() as { rooms: Array<{ id: string; name: string }> }
    plan.rooms.find((r) => r.id === 'kitchen')!.name = 'Galley'
    writeFileSync(join(folder, 'plan.json'), JSON.stringify(plan))
    const took = await until('the new name drawn', () => (svg()?.textContent ?? '').includes('Galley'), 6000)
    expect(took).toBeLessThan(2000)
  })

  it('turns to 3D when the agent asks, showing the model\'s picture', async () => {
    await agent('grid_preview', { view: '3d' })
    const image = doc().getElementById('plan3d') as HTMLImageElement
    await until('the 3D picture', () => !image.hidden && image.src.startsWith('data:image/png;base64,'))
    expect((doc().getElementById('plan2d') as HTMLElement).hidden).toBe(true)
    expect(doc().getElementById('view-3d')!.getAttribute('aria-pressed')).toBe('true')
  })
})

/**
 * The same page in an agent's host, as the MCP Apps standard has it: it talks to its parent
 * window over postMessage, and the host passes its tool calls on to the tool server. Here the host
 * is a stand-in that answers as one would, over the real tools.
 */
describe('the preview page as an MCP App (VEW-4)', { timeout: 20_000 }, () => {
  it('starts with ui/initialize, reads the plan the tool input names, and tells the host what the person selected', async () => {
    const sent: Array<Record<string, unknown>> = []
    let page: JSDOM | null = null
    // jsdom takes only a window as a message's source: the stand-in host is set on the event as it is.
    // It answers later, as a host does: the page sends its first request while it is still loading.
    const deliver = (data: unknown, source: unknown = host): void => {
      setTimeout(() => {
        const event = new page!.window.Event('message')
        Object.defineProperty(event, 'data', { value: data })
        Object.defineProperty(event, 'source', { value: source })
        page!.window.dispatchEvent(event)
      }, 0)
    }
    const host = {
      postMessage(message: Record<string, unknown>) {
        sent.push(message)
        const reply = (result: unknown): void => {
          deliver({ jsonrpc: '2.0', id: message['id'], result })
        }
        const params = message['params'] as Record<string, unknown>
        if (message['method'] === 'ui/initialize') reply({ protocolVersion: '2026-01-26', hostInfo: { name: 'stand-in', version: '1' }, hostCapabilities: {}, hostContext: { theme: 'dark' } })
        else if (message['method'] === 'tools/call') void agent(params['name'] as string, params['arguments'] as Record<string, unknown>).then(reply)
        else if (message['method'] === 'ui/update-model-context') reply({})
      },
    }
    page = new JSDOM(previewPageHtml(), {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      beforeParse(window) {
        Object.defineProperty(window, 'parent', { value: host })
      },
    })
    try {
      await until('ui/initialize', () => sent.some((m) => m['method'] === 'ui/initialize'))
      expect(sent[0]).toMatchObject({ jsonrpc: '2.0', method: 'ui/initialize', params: { protocolVersion: '2026-01-26', appInfo: { name: 'grid-preview' } } })
      await until('initialized', () => sent.some((m) => m['method'] === 'ui/notifications/initialized'))
      expect(page.window.document.body.getAttribute('data-theme')).toBe('dark')
      deliver({ jsonrpc: '2.0', method: 'ui/notifications/tool-input', params: { arguments: { plan: 'plan.json', view: '2d' } } })
      // The agent turned the shared preview to 3D above; the page shows what the record holds.
      await agent('grid_preview', { view: '2d' })
      await until('the 2D drawing', () => page!.window.document.querySelector('#plan2d svg') !== null)
      const call = sent.find((m) => m['method'] === 'tools/call')!
      expect(call['params']).toMatchObject({ name: 'grid_preview_sync', arguments: { plan: 'plan.json', look: 'dark' } })
      page.window.document.querySelector('#plan2d [data-part="room"][data-id="bed2"]')!.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true }))
      await until('the host told', () => sent.some((m) => m['method'] === 'ui/update-model-context'))
      const told = sent.find((m) => m['method'] === 'ui/update-model-context')!
      expect(told['params']).toMatchObject({ content: [{ type: 'text', text: expect.stringContaining('"bed2"') }], structuredContent: { selected: { id: 'bed2', kind: 'room' } } })
      expect(record()['selected']).toMatchObject({ id: 'bed2' })
      // The host takes the page down: it answers, and stops reading.
      deliver({ jsonrpc: '2.0', id: 99, method: 'ui/resource-teardown', params: { reason: 'closed' } })
      await until('the teardown answered', () => sent.some((m) => m['id'] === 99 && m['result'] !== undefined))
      // A message from anywhere but the host is not read.
      const before = sent.length
      deliver({ jsonrpc: '2.0', id: 100, method: 'ping' }, null)
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(sent.slice(before).some((m) => m['id'] === 100)).toBe(false)
    } finally {
      page.window.close()
    }
  })
})
