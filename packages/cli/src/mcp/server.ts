/**
 * Grid's preview tool server. An agent's host starts it as an MCP server over stdio:
 * it reads JSON-RPC lines on stdin and answers on stdout.
 *
 * Its whole surface is that loop: it imports only Node's stdlib and the pure
 * protocol, and reads no files, opens no sockets and talks to no other process.
 */
import { createInterface } from 'readline'
import { handleLine } from './protocol'

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })

lines.on('line', (line) => {
  const out = handleLine(line)
  if (out !== null) process.stdout.write(`${out}\n`)
})

// No exit call: when the host closes stdin the loop has nothing left and the process
// ends on its own, after any answer still being written.
