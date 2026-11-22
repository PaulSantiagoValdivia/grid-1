/**
 * MSG-1 (lab MS-18): `grid check` and `grid_check` answer with the result record's one list and
 * one count. The plan here lies 505 m from the origin and has two door warnings; it used to get
 * three lists beside a report of no notes.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { openProject } from '../../fs/projectFiles'
import { GRID_TOOLS } from '../../mcp/serveTools'
import { checkPlan, checkText } from '../check'
import { loadPlan } from '../plan'

const dir = mkdtempSync(join(tmpdir(), 'grid-one-list-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const at = (x: number, y: number): [number, number] => [505 + x, y]
const wall = (id: string, start: [number, number], end: [number, number]) => ({ id, start, end, thickness: 0.2, height: 2.7, kind: 'exterior' })
const door = (id: string, on: string, offset: number, extra: Record<string, unknown>) => ({ id, wall: on, type: 'door', offset, width: 0.9, sill: 0, height: 2.1, ...extra })
const PLAN = {
  version: '1',
  units: 'm',
  walls: [wall('s', at(0, 0), at(4, 0)), wall('e', at(4, 0), at(4, 4)), wall('n', at(4, 4), at(0, 4)), wall('w', at(0, 0), at(0, 4))],
  rooms: [{ id: 'r', name: 'Studio', use: 'living', boundary: ['s', 'e', 'n', 'w'] }],
  openings: [
    door('d1', 's', 0.3, { hinge: 'start', swing: 'left' }),
    door('d2', 'w', 0.3, { hinge: 'start', swing: 'right' }),
    door('d3', 'n', 1.5, { hinge: 'start' }),
  ],
}
writeFileSync(join(dir, 'plan.json'), JSON.stringify(PLAN))

describe('the MS-18 plan', () => {
  const project = openProject(dir, dir)

  it('grid check counts the far plan and both door warnings in one list', () => {
    const result = checkPlan(loadPlan(project, 'plan.json'), {})
    const codes = result.result.lines.map((l) => l.code)
    expect(codes).toEqual(expect.arrayContaining(['plan/far-from-origin', 'opening/doors-collide', 'opening/hinge-without-swing']))
    const text = checkText(result, 1)
    expect(text.split('\n')[0]).toBe('General guidance, not your local rules')
    expect(text).toContain(`To look at (${result.result.count}): ${result.result.count} worth a look.`)
    expect(text).not.toMatch(/\b0 notes|Notes: 0|To look at: nothing/)
    expect(text).toMatch(/^ {2}\d+\. worth a look, opening "d1": Door "d1" hits another door when they open\. \[opening\/doors-collide\]$/m)
    expect(text).toMatch(/^ {6}fix: Turn one of them/m)
  })

  it('grid_check gives the same count and lines, each with found, needed and fix', async () => {
    const tool = GRID_TOOLS.find((t) => t.name === 'grid_check')!
    const answer = await tool.run({ plan: 'plan.json' }, { project })
    const data = answer.data as { count: number; lines: { code: string; found: string; needed: string; fix: string }[] }
    expect(data.count).toBe(checkPlan(loadPlan(project, 'plan.json'), {}).result.count)
    expect(data.count).toBeGreaterThanOrEqual(3)
    for (const line of data.lines) for (const field of [line.found, line.needed, line.fix]) expect(field.length).toBeGreaterThan(0)
    expect(answer.text).toContain(`To look at: ${data.count} (${data.count} worth a look).`)
  })

  it('grid_check says what the checks never look at, ceiling height and load-bearing walls among them (COD-4)', async () => {
    const tool = GRID_TOOLS.find((t) => t.name === 'grid_check')!
    const answer = await tool.run({ plan: 'plan.json' }, { project })
    const limits = (answer.data as { limits: string[] }).limits
    expect(limits).toEqual(checkPlan(loadPlan(project, 'plan.json'), {}).result.limits)
    expect(limits).toContainEqual(expect.stringMatching(/^Ceiling height is not checked\b/))
    expect(limits).toContainEqual(expect.stringMatching(/^Which walls carry load is not known\b/))
    expect(answer.text).toContain(`Never looked at, whatever the plan (${limits.length}):`)
    expect(answer.text).toMatch(/^ {2}Ceiling height is not checked\b/m)
    expect(answer.text).toMatch(/^ {2}Which walls carry load is not known\b/m)
  })
})
