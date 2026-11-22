import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../../types/floorplan'
import { exportPlan } from '../../../export/planExport'
import { planFloors } from '../../floors'
import { DXF_ROOM_TAG, NEUTRAL_DXF_PROFILE, readDxfProfile } from '../dxf'
import { attributesOf, dxfProblems, readDxf, valueOf } from './dxf-reader'

/**
 * HND-1: every DXF Grid writes holds together the way a CAD program needs it to.
 *
 * No DXF reader is a dependency here, so `dxfProblems` checks the structure itself: well-formed
 * pairs, sections in order, AutoCAD 2013's version with metres, every handle once and past by the
 * seed, every owner and pointer resolved, every table a CAD program needs, and every layer, line
 * type, text style, dimension style and block named by something declared. These run it over
 * every fixture of this package, floor by floor, and over the cases that stress the writer.
 */
const FIXTURES = resolve(__dirname, '../../../../fixtures')
const fixtures = readdirSync(FIXTURES).filter((name) => name.endsWith('.json')).map((name) => ({ name, plan: parseFloorPlan(JSON.parse(readFileSync(resolve(FIXTURES, name), 'utf8'))) }))
const OPTIONS = { projectId: 'p', projectName: 'p', now: new Date('2026-11-22T00:00:00Z') } as const
const dxfOf = (plan: FloorPlan, floorId?: string, extra: Partial<Parameters<typeof exportPlan>[2]> = {}): string =>
  exportPlan(plan, 'dxf', { ...OPTIONS, ...(floorId === undefined ? {} : { floorId }), ...extra }).data as string

describe('the structure of every DXF (HND-1)', () => {
  it('has the fixtures to read', () => {
    expect(fixtures.length).toBeGreaterThan(8)
  })

  it.each(fixtures.map((f) => [f.name, f.plan] as const))('%s: every floor gives a file with no structural problem', (_name, plan) => {
    for (const floor of planFloors(plan)) expect(dxfProblems(dxfOf(plan, floor.id)), floor.id).toEqual([])
  })

  it('an empty plan gives a file with no structural problem', () => {
    expect(dxfProblems(dxfOf({ version: '1', units: 'm', walls: [], rooms: [], openings: [] }))).toEqual([])
  })

  it('so does a plan with a broken part, a hostile name and a profile of its own', () => {
    const plan = parseFloorPlan(JSON.parse(readFileSync(resolve(FIXTURES, 'two-bed-flat.json'), 'utf8')))
    plan.walls.push({ ...plan.walls[0]!, id: 'zero', start: [30, 30], end: [30, 30] })
    plan.rooms[0]!.name = 'Baño\r\n0\r\nEOF \\U+0041 ^J %%d'
    const reading = readDxfProfile({ scale: 50, layers: { doors: { layer: 'A-Door', colour: 3, lineweight: 0.35 }, windows: { layer: 'A-DOOR', colour: 3, lineweight: 0.35 }, 'dividing-lines': { linetype: 'dash-dot' } } })
    if (!('profile' in reading)) throw new Error(reading.problems.join('; '))
    const dxf = dxfOf(plan, undefined, { dxfProfile: reading.profile })
    expect(dxfProblems(dxf)).toEqual([])
    expect(attributesOf(dxf, DXF_ROOM_TAG.block).map((tag) => tag[DXF_ROOM_TAG.name])).toContain('Baño0EOF \\U+005CU+0041 ^ J %%%%%%d')
  })

  it('finds a problem where there is one, so the checks above can fail', () => {
    const dxf = dxfOf(fixtures[0]!.plan)
    expect(dxfProblems(dxf.replace('\r\nAC1027\r\n', '\r\nAC1009\r\n'))).toContain('$ACADVER is AC1009, not AC1027')
    expect(dxfProblems(dxf.replace(`\r\n8\r\n${NEUTRAL_DXF_PROFILE.pens.rooms.layer}\r\n`, '\r\n8\r\nNOWHERE\r\n')).some((p) => p.includes('layer NOWHERE'))).toBe(true)
    const doc = readDxf(dxf)
    const handle = valueOf(doc.entities[0]!, 5)!
    expect(dxfProblems(dxf.replace(`\r\n5\r\n${valueOf(doc.entities[1]!, 5)}\r\n`, `\r\n5\r\n${handle}\r\n`)).some((p) => p.includes('used twice'))).toBe(true)
    expect(dxfProblems(`${dxf}0\r\n`)).not.toEqual([])
  })
})
