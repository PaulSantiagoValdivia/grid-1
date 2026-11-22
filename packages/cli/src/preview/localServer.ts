/**
 * VEW-4: the preview as a local page, for a host that shows no MCP App: `grid preview` serves the
 * one viewer page on this computer only, and answers its one call, `grid_preview_sync`, through
 * the same tool server code an agent's host talks to (`handleLine`), with the same project folder
 * and the same refusals.
 *
 * It listens on 127.0.0.1 alone, so no other computer can reach it. It answers only a request
 * addressed to that address or to localhost on its own port (a page of another site that renamed
 * itself to point at this computer is refused), and a call only from its own page: a call must be
 * JSON, which a page of another site cannot send without asking first, and when the browser names
 * the page it came from, that must be this server. It reads no file of its own: the page is held
 * in memory, and the plan and its preview record are read by the tool, through `projectFiles.ts`.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import type { AddressInfo } from 'net'
import type { Project } from '../fs/projectFiles'
import { handleLine, LINE_MAX_BYTES } from '../mcp/protocol'
import { PREVIEW_SYNC_TOOL } from '../mcp/previewTools'
import { projectTools } from '../mcp/serveTools'

/** The port `grid preview` asks for first; another one is taken when it is in use. */
export const PREVIEW_PORT = 4178

export interface LocalPreview {
  /** The page's address, such as http://127.0.0.1:4178/. */
  readonly url: string
  readonly port: number
  /** Whether the port asked for was in use, so another was taken. */
  readonly moved: boolean
  close(): Promise<void>
}

/** The page's own rules for the browser: nothing loaded from anywhere, and calls only back here. */
const PAGE_POLICY = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

function send(response: ServerResponse, status: number, type: string, body: string, extra: Record<string, string> = {}): void {
  response.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    ...extra,
  })
  response.end(body)
}

/** The request's body as text, or null when it is longer than the tool server reads. */
function bodyOf(request: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > LINE_MAX_BYTES) {
        resolve(null)
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

/**
 * Starts the page's server for a project. `plan` is the plan file the page shows, relative to the
 * project folder, or null for the project's own plan.
 */
export async function startLocalPreview(options: { readonly project: Project; readonly plan: string | null; readonly port?: number; readonly page: string }): Promise<LocalPreview> {
  const tools = projectTools(options.project).filter((tool) => tool.definition.name === PREVIEW_SYNC_TOOL)
  let port = 0
  const hosts = (): Set<string> => new Set([`127.0.0.1:${port}`, `localhost:${port}`])

  const server = createServer((request, response) => {
    void (async () => {
      // A name another site gave this computer is not this server's.
      if (!hosts().has((request.headers.host ?? '').toLowerCase())) return send(response, 421, 'text/plain; charset=utf-8', 'This server answers only at its own address.\n')
      const path = (request.url ?? '/').split('?', 1)[0]
      if (request.method === 'GET' && (path === '/' || path === '/index.html')) {
        return send(response, 200, 'text/html; charset=utf-8', options.page, { 'content-security-policy': PAGE_POLICY })
      }
      if (path === '/call') {
        if (request.method !== 'POST') return send(response, 405, 'text/plain; charset=utf-8', 'POST a call.\n', { allow: 'POST' })
        const origin = request.headers.origin
        if (origin !== undefined && !hosts().has(origin.replace(/^http:\/\//i, '').toLowerCase())) return send(response, 403, 'text/plain; charset=utf-8', 'Only the preview page may call.\n')
        if (!(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) return send(response, 415, 'text/plain; charset=utf-8', 'A call is JSON.\n')
        const text = await bodyOf(request)
        if (text === null) return send(response, 413, 'text/plain; charset=utf-8', `A call may be at most ${LINE_MAX_BYTES} bytes.\n`)
        let call: unknown
        try {
          call = JSON.parse(text)
        } catch {
          return send(response, 400, 'text/plain; charset=utf-8', 'A call is JSON.\n')
        }
        const asked = typeof call === 'object' && call !== null ? (call as Record<string, unknown>) : {}
        if (asked['name'] !== PREVIEW_SYNC_TOOL) return send(response, 404, 'text/plain; charset=utf-8', `The page calls ${PREVIEW_SYNC_TOOL} only.\n`)
        const line = await handleLine(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: PREVIEW_SYNC_TOOL, arguments: asked['arguments'] ?? {} } }), tools)
        const answer = line === null ? null : (JSON.parse(line) as { result?: unknown; error?: { message?: string } })
        if (answer?.result === undefined) return send(response, 400, 'text/plain; charset=utf-8', `${answer?.error?.message ?? 'The call was refused.'}\n`)
        return send(response, 200, 'application/json; charset=utf-8', JSON.stringify(answer.result))
      }
      return send(response, 404, 'text/plain; charset=utf-8', 'Not here.\n')
    })().catch(() => {
      if (!response.headersSent) send(response, 500, 'text/plain; charset=utf-8', 'Something went wrong inside Grid.\n')
      else response.end()
    })
  })

  const listen = (asked: number): Promise<number> => new Promise((resolve, reject) => {
    const failed = (error: Error): void => { server.off('listening', done); reject(error) }
    const done = (): void => { server.off('error', failed); resolve((server.address() as AddressInfo).port) }
    server.once('error', failed)
    server.once('listening', done)
    server.listen(asked, '127.0.0.1')
  })

  const asked = options.port ?? PREVIEW_PORT
  let moved = false
  try {
    port = await listen(asked)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE' || asked === 0) throw error
    moved = true
    port = await listen(0)
  }
  return {
    url: `http://127.0.0.1:${port}/`,
    port,
    moved,
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections()
      server.close(() => resolve())
    }),
  }
}
