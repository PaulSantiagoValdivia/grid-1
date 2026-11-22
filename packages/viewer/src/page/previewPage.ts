/**
 * VEW-4: the preview page, the one viewer page of the plan in 2D and 3D that an agent's host shows
 * as an MCP App and `grid preview` serves as a local page.
 *
 * It draws only what it is given. Every picture comes from the tool server's page call
 * (`grid_preview_sync`): the 2D drawing as the viewer's own SVG (`pictureToSvg`, each part with
 * its `data-id`), the 3D model as a still taken through VEW-3's camera record, and with them the
 * shared record beside the plan: what the person selected, the parts the agent picked out and the
 * room it framed. A click on the 2D drawing returns the id of the part under it; a click on the 3D
 * picture asks the server which part it shows. Either is written to the record, where the agent
 * reads it, and in an MCP App also told to the host (`ui/update-model-context`).
 *
 * The page reads the record and the plan again every half second as a local page and every second
 * and a half in a host, and draws again when either changed: the server answers a call that names
 * the revision the page has with nothing more when nothing changed.
 *
 * `previewPageMain` is written into the page as its own text (`previewPageHtml`), so it refers to
 * nothing outside its own body: no import, no constant of this module.
 */

/** What the page calls the tool server with: one tool call, answered with MCP's CallToolResult. */
export type PreviewCall = (name: string, args: Record<string, unknown>) => Promise<PreviewCallResult>

export interface PreviewCallResult {
  readonly content?: ReadonlyArray<{ readonly type: string; readonly text?: string; readonly data?: string; readonly mimeType?: string }>
  readonly structuredContent?: Record<string, unknown>
  readonly isError?: boolean
}

export { PREVIEW_RESOURCE_MIME, PREVIEW_RESOURCE_URI, PREVIEW_SYNC_TOOL } from './names'

/** What a running page offers its tests: stop it, and look at what it holds. */
export interface PreviewPageHandle {
  stop(): void
  /** Resolves after the next read of the record and plan has been drawn. */
  synced(): Promise<void>
}

/**
 * The page's script. `call` is given in tests; a page reads `data-grid-mode` on its body to
 * choose: `local` calls `POST call` on the server it came from, anything else talks to the host
 * over `postMessage`, as the MCP Apps standard has it.
 */
export function previewPageMain(win: Window & typeof globalThis, given?: PreviewCall): PreviewPageHandle {
  const TOOL = 'grid_preview_sync'
  const doc = win.document
  const body = doc.body
  const local = body.getAttribute('data-grid-mode') === 'local'
  const every = local ? 500 : 1500
  const STILL_CLICK = 4

  type Result = PreviewCallResult
  type Box = { id: string; x: number; y: number; width: number; height: number }
  type Args = { [key: string]: unknown }
  type Camera = Args & { bearing: number; tilt: number; distance: number }
  type Shared = { view: string; floor: string | null; selected: { id: string; kind: string; floor: string } | null; highlight: string[]; frame: string | null; note: string | null; changedBy: string | null; revision: number }

  const $ = (id: string): HTMLElement => doc.getElementById(id) as HTMLElement
  const stage2d = $('plan2d')
  const stage3d = $('plan3d') as HTMLImageElement
  const floorPick = $('floor') as HTMLSelectElement
  const status = $('status')
  const noteLine = $('note')
  const buttons = { '2d': $('view-2d'), '3d': $('view-3d') }

  let plan: string | undefined = body.getAttribute('data-grid-plan') || undefined
  let since = ''
  let record: Shared | null = null
  let parts = new Map<string, { kind: string; name: string | null }>()
  let boxes: Box[] = []
  let full: string | null = null
  let camera: Camera | null = null
  let shownAgentRevision = -1
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let waiting: Array<() => void> = []
  let busy = false
  let started = false
  const dark = (): boolean => body.getAttribute('data-theme') === 'dark' || (body.getAttribute('data-theme') !== 'light' && !!win.matchMedia && win.matchMedia('(prefers-color-scheme: dark)').matches)

  // -- talking to the server ---------------------------------------------------------------------

  let nextId = 1
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  const send = (message: Record<string, unknown>): void => { win.parent.postMessage({ jsonrpc: '2.0', ...message }, '*') }
  const request = (method: string, params: Record<string, unknown>): Promise<unknown> => new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    send({ id, method, params })
  })

  const call: PreviewCall = given ?? (local
    ? async (name, args) => {
      const reply = await win.fetch('call', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, arguments: args }) })
      return (await reply.json()) as Result
    }
    : (name, args) => request('tools/call', { name, arguments: args }) as Promise<Result>)

  const textOf = (result: Result): string => (result.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n')
  const imageOf = (result: Result): string | null => {
    const image = (result.content ?? []).find((c) => c.type === 'image' && typeof c.data === 'string')
    return image ? `data:${image.mimeType ?? 'image/png'};base64,${image.data}` : null
  }

  /** Tells the host what the person selected, so the agent knows on its next turn. */
  const tellHost = (text: string, selected: unknown): void => {
    if (local || given) return
    request('ui/update-model-context', { content: [{ type: 'text', text }], structuredContent: { selected } }).catch(() => undefined)
  }

  // -- drawing -----------------------------------------------------------------------------------

  const svgOf = (): SVGSVGElement | null => stage2d.querySelector('svg')

  const mark = (): void => {
    const svg = svgOf()
    if (!svg || !record) return
    const highlight = new Set(record.highlight)
    const selected = record.selected?.id ?? null
    svg.querySelectorAll('[data-id]').forEach((node) => {
      const id = node.getAttribute('data-id') ?? ''
      const part = node.getAttribute('data-part')
      if (part === 'dimension') return
      node.classList.toggle('grid-hl', highlight.has(id))
      node.classList.toggle('grid-sel', id === selected)
    })
  }

  /** The room the agent framed, with a margin round it; the whole drawing without one. */
  const frameView = (): void => {
    const svg = svgOf()
    if (!svg || full === null) return
    const box = record?.frame ? boxes.find((b) => b.id === record!.frame) : undefined
    if (!box) {
      svg.setAttribute('viewBox', full)
      return
    }
    const margin = Math.max(box.width, box.height, 2) * 0.15 + 0.5
    svg.setAttribute('viewBox', `${box.x - margin} ${box.y - margin} ${box.width + margin * 2} ${box.height + margin * 2}`)
  }

  const words = (): void => {
    const selected = record?.selected
    const part = selected ? parts.get(selected.id) : undefined
    status.textContent = selected ? `Selected: ${selected.kind} ${part?.name ? `${part.name} (${selected.id})` : selected.id}` : 'Click a part to select it.'
    noteLine.textContent = record?.note ?? ''
    noteLine.hidden = !record?.note
    for (const view of ['2d', '3d'] as const) buttons[view].setAttribute('aria-pressed', String(record?.view === view))
  }

  const floorsOf = (floors: Array<{ id: string; name: string }>, shown: string | null): void => {
    const now = floors.map((f) => f.id).join('\n')
    if (floorPick.getAttribute('data-floors') !== now) {
      floorPick.replaceChildren(...floors.map((f) => {
        const option = doc.createElement('option')
        option.value = f.id
        option.textContent = f.name
        return option
      }))
      floorPick.setAttribute('data-floors', now)
    }
    floorPick.hidden = floors.length < 2
    if (shown !== null) floorPick.value = shown
  }

  const take = (result: Result): void => {
    const data = result.structuredContent ?? {}
    if (result.isError) {
      status.textContent = textOf(result).split('\n').filter((line) => !line.startsWith('General guidance')).join(' ')
      return
    }
    if (typeof data['planFile'] === 'string') plan = data['planFile'] as string
    if (typeof data['revision'] === 'string') since = data['revision'] as string
    if (data['record']) record = data['record'] as Shared
    if (Array.isArray(data['parts'])) parts = new Map((data['parts'] as Array<{ id: string; kind: string; name: string | null }>).map((p) => [p.id, { kind: p.kind, name: p.name }]))
    const drawing = data['drawing'] as { view: string; floor: string; svg?: string; boxes?: Box[]; camera?: Camera } | null | undefined
    if (drawing) {
      if (Array.isArray(data['floors'])) floorsOf(data['floors'] as Array<{ id: string; name: string }>, drawing.floor)
      if (drawing.view === '2d' && typeof drawing.svg === 'string') {
        const kept = svgOf()?.getAttribute('viewBox') ?? null
        const keep = full !== null && kept !== null && kept !== full
        stage2d.innerHTML = drawing.svg
        const svg = svgOf()
        if (svg) {
          full = svg.getAttribute('viewBox')
          svg.removeAttribute('width')
          svg.removeAttribute('height')
          // A drawing drawn again keeps the person's zoom; the agent's frame is set below.
          if (keep && kept !== null) svg.setAttribute('viewBox', kept)
        }
        boxes = drawing.boxes ?? []
        stage3d.hidden = true
        stage2d.hidden = false
      } else if (drawing.view === '3d') {
        const image = imageOf(result)
        if (image) stage3d.src = image
        camera = drawing.camera ?? null
        stage2d.hidden = true
        stage3d.hidden = false
      }
    }
    if (record && record.changedBy === 'agent' && record.revision !== shownAgentRevision) {
      shownAgentRevision = record.revision
      frameView()
    } else if (drawing && drawing.view === '2d' && shownAgentRevision === -1) {
      shownAgentRevision = record?.revision ?? 0
      frameView()
    }
    mark()
    words()
  }

  const sync = async (change: Args = {}): Promise<void> => {
    const asked: Args = { ...change }
    if (plan !== undefined) asked['plan'] = plan
    // A change always gets the whole answer back; a plain read names what the page has.
    if (since !== '' && Object.keys(change).length === 0) asked['since'] = since
    asked['look'] = dark() ? 'dark' : 'working'
    try {
      take(await call(TOOL, asked))
    } catch (error) {
      status.textContent = `The preview could not reach Grid: ${(error as Error).message}`
    }
  }

  const loop = async (): Promise<void> => {
    if (stopped) return
    if (!busy) {
      busy = true
      await sync()
      busy = false
    }
    const done = waiting
    waiting = []
    for (const resolve of done) resolve()
    if (!stopped) timer = setTimeout(() => { void loop() }, every)
  }

  /** One change the person made, sent at once, between the reads. */
  const change = async (asked: Args): Promise<void> => {
    while (busy) await new Promise((resolve) => setTimeout(resolve, 20))
    busy = true
    await sync(asked)
    busy = false
  }

  // -- the person's hands --------------------------------------------------------------------------

  let down: { x: number; y: number } | null = null
  let panFrom: { x: number; y: number; box: number[] } | null = null

  stage2d.addEventListener('pointerdown', (event) => {
    down = { x: event.clientX, y: event.clientY }
    const svg = svgOf()
    const box = svg?.getAttribute('viewBox')?.split(/[\s,]+/).map(Number)
    panFrom = box && box.length === 4 ? { x: event.clientX, y: event.clientY, box } : null
  })
  stage2d.addEventListener('pointermove', (event) => {
    const svg = svgOf()
    if (!panFrom || !svg || event.buttons === 0) return
    const scale = panFrom.box[2]! / Math.max(1, stage2d.clientWidth)
    svg.setAttribute('viewBox', `${panFrom.box[0]! - (event.clientX - panFrom.x) * scale} ${panFrom.box[1]! - (event.clientY - panFrom.y) * scale} ${panFrom.box[2]} ${panFrom.box[3]}`)
  })
  const still = (event: { clientX: number; clientY: number }): boolean => down === null || Math.hypot(event.clientX - down.x, event.clientY - down.y) <= STILL_CLICK
  stage2d.addEventListener('click', (event) => {
    panFrom = null
    if (!still(event)) return
    const hit = (event.target as Element | null)?.closest?.('[data-id]')
    const id = hit && hit.getAttribute('data-part') !== 'dimension' ? hit.getAttribute('data-id') : null
    if (id) {
      if (record) record = { ...record, selected: { id, kind: parts.get(id)?.kind ?? 'room', floor: record.floor ?? '' } }
      mark()
      words()
      void change({ select: id }).then(() => {
        const part = parts.get(id)
        tellHost(`In Grid's preview the person selected ${part?.kind ?? 'part'} "${id}"${part?.name ? ` (${part.name})` : ''}.`, record?.selected ?? null)
      })
    } else void change({ clear: true })
  })
  stage2d.addEventListener('wheel', (event) => {
    const svg = svgOf()
    const box = svg?.getAttribute('viewBox')?.split(/[\s,]+/).map(Number)
    if (!svg || !box || box.length !== 4) return
    event.preventDefault()
    const factor = event.deltaY > 0 ? 1.15 : 1 / 1.15
    const rect = stage2d.getBoundingClientRect()
    const fx = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5
    const fy = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5
    const [x, y, w, h] = box as [number, number, number, number]
    svg.setAttribute('viewBox', `${x + w * fx * (1 - factor)} ${y + h * fy * (1 - factor)} ${w * factor} ${h * factor}`)
  }, { passive: false })
  stage2d.addEventListener('dblclick', () => frameView())

  let orbit: { x: number; y: number } | null = null
  stage3d.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    orbit = { x: event.clientX, y: event.clientY }
    down = { x: event.clientX, y: event.clientY }
  })
  stage3d.addEventListener('pointerup', (event) => {
    if (!orbit) return
    const dx = event.clientX - orbit.x
    const dy = event.clientY - orbit.y
    orbit = null
    if (Math.hypot(dx, dy) <= STILL_CLICK) {
      // The picture is fitted inside the element, with bands on two sides: a click is read on the picture.
      const rect = stage3d.getBoundingClientRect()
      const natural = { width: stage3d.naturalWidth || rect.width, height: stage3d.naturalHeight || rect.height }
      const fit = Math.min(rect.width / natural.width, rect.height / natural.height)
      if (!(fit > 0)) return
      const left = rect.left + (rect.width - natural.width * fit) / 2
      const top = rect.top + (rect.height - natural.height * fit) / 2
      const x = (event.clientX - left) / (natural.width * fit)
      const y = (event.clientY - top) / (natural.height * fit)
      if (x < 0 || x > 1 || y < 0 || y > 1) return
      void change({ pick: { x, y } }).then(() => {
        if (record?.selected) tellHost(`In Grid's preview the person selected ${record.selected.kind} "${record.selected.id}" on the 3D model.`, record.selected)
      })
      return
    }
    if (!camera) return
    void change({ camera: { ...camera, bearing: camera.bearing - dx * 0.4, tilt: Math.max(-10, Math.min(89, camera.tilt + dy * 0.3)) } })
  })
  let zoomTimer: ReturnType<typeof setTimeout> | null = null
  let zoomBy = 1
  stage3d.addEventListener('wheel', (event) => {
    event.preventDefault()
    zoomBy *= event.deltaY > 0 ? 1.1 : 1 / 1.1
    if (zoomTimer) clearTimeout(zoomTimer)
    zoomTimer = setTimeout(() => {
      if (camera) void change({ camera: { ...camera, distance: Math.max(1, camera.distance * zoomBy) } })
      zoomBy = 1
    }, 250)
  }, { passive: false })

  buttons['2d'].addEventListener('click', () => { void change({ view: '2d' }) })
  buttons['3d'].addEventListener('click', () => { void change({ view: '3d' }) })
  floorPick.addEventListener('change', () => { void change({ floor: floorPick.value }) })

  // -- starting ----------------------------------------------------------------------------------

  const start = (): void => {
    if (started) return
    started = true
    void loop()
  }

  if (!local && !given) {
    win.addEventListener('message', (event: MessageEvent) => {
      if (event.source !== win.parent) return
      const message = event.data as { id?: number; method?: string; params?: Args; result?: unknown; error?: { message?: string } }
      if (!message || typeof message !== 'object') return
      if (message.method === undefined && typeof message.id === 'number') {
        const waiter = pending.get(message.id)
        if (!waiter) return
        pending.delete(message.id)
        if (message.error) waiter.reject(new Error(message.error.message ?? 'refused'))
        else waiter.resolve(message.result)
        return
      }
      const params = message.params ?? {}
      if (message.method === 'ui/notifications/tool-input') {
        const args = (params['arguments'] ?? {}) as Args
        if (typeof args['plan'] === 'string') plan = args['plan']
        start()
      } else if (message.method === 'ui/notifications/tool-result') {
        const data = (params['structuredContent'] ?? {}) as Args
        if (typeof data['planFile'] === 'string') plan = data['planFile']
        start()
      } else if (message.method === 'ui/notifications/host-context-changed') {
        if (params['theme'] === 'dark' || params['theme'] === 'light') body.setAttribute('data-theme', params['theme'])
      } else if (message.method === 'ui/resource-teardown') {
        stopped = true
        if (timer) clearTimeout(timer)
        if (message.id !== undefined) send({ id: message.id, result: {} })
      } else if (message.method === 'ping' && message.id !== undefined) {
        send({ id: message.id, result: {} })
      }
    })
    void request('ui/initialize', { protocolVersion: '2026-01-26', appInfo: { name: 'grid-preview', version: '1' }, appCapabilities: {} }).then((result) => {
      const context = (result as { hostContext?: { theme?: string } } | null)?.hostContext
      if (context?.theme === 'dark' || context?.theme === 'light') body.setAttribute('data-theme', context.theme)
      send({ method: 'ui/notifications/initialized', params: {} })
      send({ method: 'ui/notifications/size-changed', params: { width: Math.round(body.scrollWidth), height: Math.max(480, Math.round(body.scrollHeight)) } })
      // A host that sends no tool input still gets the project's plan.
      setTimeout(start, 400)
    }, () => start())
  } else start()

  return {
    stop() {
      stopped = true
      if (timer) clearTimeout(timer)
    },
    synced: () => new Promise<void>((resolve) => { waiting.push(resolve) }),
  }
}

/** The page's look: the plan's paper and ink, the picked-out parts and the selection. */
const STYLE = `
:root { color-scheme: light dark; --paper: #fbfaf7; --ink: #1f1d1a; --soft: #6b665e; --line: #d9d5cc; --pick: #f2b705; --pick-ink: #b45309; --sel: #2563eb; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --paper: #1c1b19; --ink: #ece9e2; --soft: #a39e94; --line: #3a3833; } }
body[data-theme="dark"] { --paper: #1c1b19; --ink: #ece9e2; --soft: #a39e94; --line: #3a3833; }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body { display: flex; flex-direction: column; min-height: 480px; background: var(--paper); color: var(--ink); font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
header { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--line); }
header .views { display: inline-flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
header button { font: inherit; border: 0; padding: 4px 12px; background: transparent; color: var(--ink); cursor: pointer; }
header button[aria-pressed="true"] { background: var(--ink); color: var(--paper); }
header select { font: inherit; padding: 3px 6px; background: var(--paper); color: var(--ink); border: 1px solid var(--line); border-radius: 6px; }
#status { color: var(--soft); flex: 1 1 200px; overflow-wrap: anywhere; }
main { position: relative; flex: 1 1 auto; min-height: 360px; overflow: hidden; }
#plan2d, #plan3d { position: absolute; inset: 0; width: 100%; height: 100%; }
#plan2d { cursor: grab; touch-action: none; }
#plan2d svg { width: 100%; height: 100%; display: block; }
#plan3d { object-fit: contain; cursor: grab; touch-action: none; user-select: none; -webkit-user-drag: none; }
#note { margin: 0; padding: 8px 12px; border-top: 1px solid var(--line); }
#plan2d .grid-hl[data-part="room"] { fill: var(--pick) !important; fill-opacity: 0.45 !important; }
#plan2d .grid-hl:not([data-part="room"]) { stroke: var(--pick-ink) !important; stroke-width: 0.12 !important; }
#plan2d .grid-sel[data-part="room"] { fill: var(--sel) !important; fill-opacity: 0.22 !important; }
#plan2d .grid-sel:not([data-part="room"]) { stroke: var(--sel) !important; stroke-width: 0.12 !important; }
#plan2d [data-id] { cursor: pointer; }
`

const BODY = `
<header>
  <span class="views" role="group" aria-label="View"><button id="view-2d" type="button" aria-pressed="true">2D</button><button id="view-3d" type="button" aria-pressed="false">3D</button></span>
  <select id="floor" aria-label="Floor" hidden></select>
  <span id="status" role="status">Reading the plan…</span>
</header>
<main>
  <div id="plan2d" aria-label="The floor plan; click a part to select it"></div>
  <img id="plan3d" alt="The 3D model of the plan; drag to turn it, click a part to select it" hidden>
</main>
<p id="note" hidden></p>
`

function escapeAttribute(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * The page as one HTML text: its look, its body and its script, with nothing loaded from
 * anywhere else, as an MCP App's default content security policy needs. `local` names the plan
 * a local page shows, and makes it call the server it came from.
 */
export function previewPageHtml(local?: { readonly plan: string | null }): string {
  const attributes = local ? ` data-grid-mode="local"${local.plan === null ? '' : ` data-grid-plan="${escapeAttribute(local.plan)}"`}` : ''
  // The script is the function's own text: it must refer to nothing outside its body.
  const script = `(${previewPageMain.toString()})(window);`.replace(/<\/script/gi, '<\\/script')
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Grid preview</title>\n<style>${STYLE}</style>\n</head>\n<body${attributes}>${BODY}<script>${script}</script>\n</body>\n</html>\n`
}
