/**
 * Grid's tool server loop: JSON-RPC lines on standard input, answers on standard output.
 *
 * The loop itself imports only Node's stdlib and the pure protocol, and opens no sockets and
 * talks to no other process. The tools that read or write files are handed in
 * (`serveTools.ts`), and reach the disk only through the project's resolver. `server.ts`
 * starts it on its own; `grid serve` starts it from the command's file.
 */
import { createInterface } from 'readline'
import { handleLine, type ServerTool } from './protocol'

export function startToolServer(tools: readonly ServerTool[] = []): void {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })

  lines.on('line', (line) => {
    const out = handleLine(line, tools)
    if (out !== null) process.stdout.write(`${out}\n`)
  })

  // No exit call: when the host closes stdin the loop has nothing left and the process
  // ends on its own, after any answer still being written.
}
