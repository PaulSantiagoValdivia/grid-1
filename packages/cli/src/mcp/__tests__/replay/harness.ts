/**
 * Calls the tool server's tools in this process, on a project folder made for the test, the
 * way an agent's host would call them over stdio (`handleLine`).
 */
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { openProject } from '../../../fs/projectFiles'
import { handleLine } from '../../protocol'
import { projectTools } from '../../serveTools'

export interface Reply {
  readonly text: string
  readonly isError: boolean
  readonly data: Record<string, unknown> | undefined
  readonly image: boolean
  /** VEW-9: how many pictures came back. */
  readonly images: number
}

export interface Bench {
  readonly folder: string
  call(name: string, args: Record<string, unknown>): Promise<Reply>
  write(file: string, plan: unknown): void
  close(): void
}

let next = 1

export function bench(plans: Record<string, unknown>, gridProject = true): Bench {
  const folder = mkdtempSync(join(tmpdir(), 'grid-tools-'))
  if (gridProject) writeFileSync(join(folder, 'grid.json'), '{"version":1}\n')
  const write = (file: string, plan: unknown): void => writeFileSync(join(folder, file), `${JSON.stringify(plan, null, 1)}\n`)
  for (const [file, plan] of Object.entries(plans)) write(file, plan)
  const tools = projectTools(openProject(folder, folder, 'project'))
  return {
    folder,
    write,
    async call(name, args) {
      const line = JSON.stringify({ jsonrpc: '2.0', id: next++, method: 'tools/call', params: { name, arguments: args } })
      const out = JSON.parse((await handleLine(line, tools)) as string) as {
        result?: { content: Array<{ type: string; text?: string}>; isError?: boolean; structuredContent?: Record<string, unknown> }
        error?: { message: string }
      }
      if (!out.result) throw new Error(`protocol error: ${out.error?.message}`)
      return {
        text: out.result.content.find((c) => c.type === 'text')?.text ?? '',
        isError: out.result.isError === true,
        data: out.result.structuredContent,
        image: out.result.content.some((c) => c.type === 'image'),
        images: out.result.content.filter((c) => c.type === 'image').length,
      }
    },
    close: () => rmSync(folder, { recursive: true, force: true }),
  }
}
