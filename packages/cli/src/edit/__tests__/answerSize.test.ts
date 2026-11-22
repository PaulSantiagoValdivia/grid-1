import { readFileSync } from 'fs'
import { resolve } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'

/**
 * WRT-3, lab AU6-3 and U-3: an edit's answer names the plan by its path in the project, never
 * the full path, and its size does not grow with the building. The same edits, on bedroom 2 of
 * the lab's two-bedroom flat and on bedroom 2 of flat C in the lab's 588-part block, answer
 * within 10% of the same size.
 */

const FIXTURES = resolve(__dirname, '../../../../floorplan/fixtures/edits')
const raw = (name: string): unknown => JSON.parse(readFileSync(resolve(FIXTURES, `${name}.json`), 'utf8'))

let b: Bench
beforeAll(() => {
  b = bench({ 'flat.json': raw('flat-v00'), 'block.json': raw('block-588') })
})
afterAll(() => b.close())

const EDITS: ReadonlyArray<[string, Record<string, unknown>]> = [
  ['grid_rename_room', { name: 'Guest room', use: 'other' }],
  ['grid_move_room_side', { side: 'north', by: -0.1 }],
  ['grid_move_room_side', { side: 'east', by: -0.1 }],
]

describe('the size of an edit\'s answer', () => {
  for (const [tool, args] of EDITS) {
    it(`${tool} ${JSON.stringify(args)}: within 10% on the flat and on the block, with paths in the project`, async () => {
      const flat = await b.call(tool, { plan: 'flat.json', room: 'bed2', out: 'flat-after.json', ...args })
      const block = await b.call(tool, { plan: 'block.json', room: 'L1-C-bed2', out: 'block-after.json', ...args })
      expect(flat.isError, flat.text).toBe(false)
      expect(block.isError, block.text).toBe(false)
      for (const reply of [flat, block]) {
        expect(JSON.stringify(reply)).not.toContain(b.folder)
        expect(reply.text.split('\n').at(-1)).toMatch(/^Wrote "(flat|block)-after\.json"\.$/)
      }
      const [small, large] = [flat.text.length, block.text.length].sort((x, y) => x - y) as [number, number]
      expect((large - small) / large, `${flat.text}\n---\n${block.text}`).toBeLessThanOrEqual(0.1)
    }, 120_000)
  }
})
