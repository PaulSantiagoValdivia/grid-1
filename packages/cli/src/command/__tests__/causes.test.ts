/**
 * MSG-5: `grid check` and `grid_check` set a line that follows from another under it, say how
 * many problems there are, and list the notes held back under the line that holds them. The
 * plan: one room with a wall of no length, and a door on that wall.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { openProject } from '../../fs/projectFiles'
import { GRID_TOOLS } from '../../mcp/serveTools'
import { checkPlan, checkText } from '../check'
import { loadPlan } from '../plan'

const dir = mkdtempSync(join(tmpdir(), 'grid-causes-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const wall = (id: string, start: [number, number], end: [number, number], kind = 'exterior') => ({ id, start, end, thickness: 0.2, height: 2.7, kind })
const PLAN = {
  version: '1',
  units: 'm',
  walls: [
    wall('s', [0, 0], [4, 0]),
    wall('e', [4, 0], [4, 4]),
    wall('n', [4, 4], [0, 4]),
    wall('w', [0, 4], [0, 0]),
    wall('mid', [2, 0], [2, 4], 'interior'),
    wall('stub', [2, 2], [2, 2], 'interior'),
  ],
  rooms: [
    { id: 'a', name: 'West', boundary: ['s', 'mid', 'n', 'w', 'stub'] },
    { id: 'b', name: 'East', boundary: ['s', 'e', 'n', 'mid'] },
  ],
  openings: [
    { id: 'front', wall: 's', type: 'door', offset: 0.5, width: 0.9, sill: 0, height: 2.1 },
    { id: 'd', wall: 'stub', type: 'door', offset: 0, width: 0.9, sill: 0, height: 2.1 },
  ],
}
writeFileSync(join(dir, 'plan.json'), JSON.stringify(PLAN))

describe('a wall of no length, a room on it and a door on it', () => {
  const project = openProject(dir, dir)

  it('grid check sets the room and the door under the wall, and the note it held back under its line', () => {
    const result = checkPlan(loadPlan(project, 'plan.json'), {})
    const record = result.result
    expect(record.lines.map((l) => `${l.code}${l.causedBy ? ` <- ${l.causedBy.id}` : ''}`).slice(0, 3)).toEqual([
      'wall/zero-length',
      'opening/broken-wall <- stub',
      'room/broken-wall <- stub',
    ])
    expect(record.problems).toBe(1)
    const text = checkText(result, 1)
    expect(text).toContain(`To look at (${record.count}): `)
    expect(text).toContain(' 1 problem; 2 lines follow from it.')
    expect(text).toMatch(/^ {6}2\. left out, opening "d": .*\[opening\/broken-wall\]$/m)
    expect(text).toMatch(/^ {10}follows from: "stub" \(wall\/zero-length\)$/m)
    // East shares its walls with West, which could not be drawn: whether it has a door waits.
    expect(text).toMatch(/held back: room "b" \(room\/no-door\), waits for "a"/)
    expect(record.counts.finding).toBe(0)
  })

  it('grid_check returns the problems and each line\'s cause', async () => {
    const tool = GRID_TOOLS.find((t) => t.name === 'grid_check')!
    const answer = await tool.run({ plan: 'plan.json' }, { project })
    const data = answer.data as { problems: number; lines: { code: string; causedBy?: { code: string; id: string } }[] }
    expect(data.problems).toBe(1)
    expect(data.lines[1]!.causedBy).toEqual({ code: 'wall/zero-length', id: 'stub' })
    expect(answer.text).toContain('Follows from "stub" (wall/zero-length).')
  })
})
