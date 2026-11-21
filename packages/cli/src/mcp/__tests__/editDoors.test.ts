import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { openProject } from '../../fs/projectFiles'
import { GRID_TOOLS } from '../serveTools'

/**
 * MSG-14: after an edit, the answer says which doors now join other rooms, read from where each
 * door stands. On the sample flat, bringing the bathroom's east wall in 2 m leaves the bathroom
 * door, on the wall between the bathroom and the living room, in front of the kitchen.
 */

const sample = resolve(__dirname, '../../../fixtures/two-bed-flat.json')
const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), 'grid-edit-doors-'))
  made.push(dir)
  writeFileSync(join(dir, 'plan.json'), readFileSync(sample))
  return dir
}

const tool = (name: string) => GRID_TOOLS.find((t) => t.name === name)!

describe('the answer to an edit', () => {
  it('says the bathroom door now joins the kitchen and the living room', async () => {
    const dir = project()
    const answer = await tool('grid_move_room_side').run({ plan: 'plan.json', room: 'bath', side: 'east', by: -2, out: 'moved.json' }, { project: openProject(dir, dir) })
    const data = answer.data as { doors: string[] }
    expect(data.doors).toEqual(['bath-door joined bath and lounge; it now joins kitchen and lounge.'])
    expect(answer.text.split('\n')).toContain('bath-door joined bath and lounge; it now joins kitchen and lounge.')
  })

  it('says nothing about doors when none joins other rooms', async () => {
    const dir = project()
    const answer = await tool('grid_move_room_side').run({ plan: 'plan.json', room: 'bed2', side: 'north', by: 0.5, out: 'moved.json' }, { project: openProject(dir, dir) })
    expect((answer.data as { doors: string[] }).doors).toEqual([])
    expect(answer.text).not.toMatch(/now joins/)
  })
})
