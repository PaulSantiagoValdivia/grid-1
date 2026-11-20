/**
 * Grid's tool server loop: JSON-RPC lines on standard input, answers on standard output.
 *
 * Its whole surface is that loop: it imports only Node's stdlib and the pure protocol, and
 * reads no files, opens no sockets and talks to no other process. `server.ts` starts it on
 * its own; `grid serve` starts it from the command's file.
 */
import { createInterface } from 'readline'
import { handleLine } from './protocol'

export function startToolServer(): void {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })

  lines.on('line', (line) => {
    const out = handleLine(line)
    if (out !== null) process.stdout.write(`${out}\n`)
  })

  // No exit call: when the host closes stdin the loop has nothing left and the process
  // ends on its own, after any answer still being written.
}
