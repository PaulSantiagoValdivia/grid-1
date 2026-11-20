/**
 * Grid's preview tool server. An agent's host starts it as an MCP server over stdio:
 * it reads JSON-RPC lines on stdin and answers on stdout. `grid serve` runs the same loop.
 *
 * See `serve.ts` for what the loop may and may not do.
 */
import { startToolServer } from './serve'

startToolServer()
