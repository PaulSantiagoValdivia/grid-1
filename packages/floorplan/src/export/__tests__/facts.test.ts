/**
 * CNT-9: the facts of the person's own go into the IFC, one `Grid_Properties` set per part with
 * one single value per fact, and into the DXF, one line per fact on the `GRID-FACTS` layer. Both
 * stay byte-identical for the same plan, whatever order it lists its parts in (QAR-5), and a plan
 * with no facts exports as before.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { planFloors } from '../../geometry'
import { exportPlan } from '../planExport'
import { factCount, factsOffice } from '../../test-support/facts'

const NOW = new Date('2026-11-21T12:00:00.000Z')
const OPTIONS = { projectId: 'facts', projectName: 'Office', now: NOW }

const office = (): FloorPlan => parseFloorPlan(factsOffice())

const reversed = (plan: FloorPlan): FloorPlan => ({
  ...plan,
  walls: [...plan.walls].reverse(),
  rooms: [...plan.rooms].reverse(),
  openings: [...plan.openings].reverse(),
  floors: [...(plan.floors ?? [])].reverse(),
})

const withoutFacts = (plan: FloorPlan): FloorPlan => {
  const strip = <T extends object>(part: T): T => {
    const rest = { ...part } as T & { properties?: unknown; number?: unknown }
    delete rest.properties
    delete rest.number
    return rest
  }
  return { ...plan, walls: plan.walls.map(strip), rooms: plan.rooms.map(strip), openings: plan.openings.map(strip), floors: plan.floors?.map(strip) }
}

const text = (data: string | Uint8Array): string => (typeof data === 'string' ? data : new TextDecoder().decode(data))

/** The IFC's `Grid_Properties` sets: each set's values, as name and STEP value, by the element's line. */
function ifcFacts(ifc: string): Map<string, [string, string][]> {
  const lines = new Map<string, string>()
  for (const line of ifc.split('\n')) {
    const m = /^#(\d+)=(.*);$/.exec(line)
    if (m) lines.set(m[1]!, m[2]!)
  }
  const out = new Map<string, [string, string][]>()
  for (const [, body] of lines) {
    const rel = /^IFCRELDEFINESBYPROPERTIES\('[^']*',#\d+,\$,\$,\(#(\d+)\),#(\d+)\)$/.exec(body)
    if (!rel) continue
    const set = lines.get(rel[2]!)!
    const named = /^IFCPROPERTYSET\('[^']*',#\d+,'([^']*)',\$,\(([^)]*)\)\)$/.exec(set)
    if (!named || named[1] !== 'Grid_Properties') continue
    const values = named[2]!.split(',').map((ref) => {
      const value = /^IFCPROPERTYSINGLEVALUE\('([^']*)',\$,(.*),\$\)$/.exec(lines.get(ref.slice(1))!)!
      return [value[1]!, value[2]!] as [string, string]
    })
    out.set(rel[1]!, values)
  }
  return out
}

/** The DXF's facts, read back: every TEXT on `GRID-FACTS`, as `[id] name: value`. */
export function dxfFacts(dxf: string): { id: string; name: string; value: string }[] {
  const pairs = dxf.split('\n').map((l) => l.trim())
  const out: { id: string; name: string; value: string }[] = []
  for (let i = 0; i + 1 < pairs.length; i += 2) {
    if (pairs[i] !== '0' || pairs[i + 1] !== 'TEXT') continue
    let layer = ''
    let words = ''
    for (let k = i + 2; k + 1 < pairs.length && pairs[k] !== '0'; k += 2) {
      if (pairs[k] === '8') layer = pairs[k + 1]!
      if (pairs[k] === '1') words = pairs[k + 1]!
    }
    if (layer !== 'GRID-FACTS') continue
    const m = /^\[(.+?)\] (.+?): (.*)$/.exec(words)
    if (m) out.push({ id: m[1]!, name: m[2]!, value: m[3]! })
  }
  return out
}

describe('the facts in the IFC (CNT-9)', () => {
  it('writes every one of the 59 facts as a single value in a Grid_Properties set', () => {
    const ifc = text(exportPlan(office(), 'ifc', OPTIONS).data)
    const sets = ifcFacts(ifc)
    const values = [...sets.values()].flat()
    expect(values).toHaveLength(factCount(office()))
    expect(values).toHaveLength(59)
    expect(values).toContainEqual(['fire rating', "IFCLABEL('EI 30')"])
    expect(values).toContainEqual(['head count', 'IFCINTEGER(8)'])
    expect(values).toContainEqual(['U-value', 'IFCREAL(0.18)'])
    expect(values).toContainEqual(['self-closing', 'IFCBOOLEAN(.F.)'])
    expect(values).toContainEqual(['room number', "IFCLABEL('G.02')"])
  })

  it('names a numbered room\'s space by its number, its name the long name', () => {
    const ifc = text(exportPlan(office(), 'ifc', OPTIONS).data)
    expect(ifc).toMatch(/IFCSPACE\('[^']*',#\d+,'G\.02',\$,(?:\$|'[^']*'),#\d+,#\d+,'Open office',/)
  })

  it('gives HND-2\'s Reference and Grid_Space Number the number the room states, as text', () => {
    const ifc = text(exportPlan(office(), 'ifc', OPTIONS).data)
    expect(ifc).toContain("IFCPROPERTYSINGLEVALUE('Reference',$,IFCIDENTIFIER('G.02'),$)")
    expect(ifc).toContain("IFCPROPERTYSINGLEVALUE('Number',$,IFCLABEL('G.02'),$)")
  })

  it('puts each set on its own part: doors, windows, walls, spaces and storeys', () => {
    const ifc = text(exportPlan(office(), 'ifc', OPTIONS).data)
    const lines = new Map(ifc.split('\n').flatMap((l) => {
      const m = /^#(\d+)=([A-Z0-9]+)\(/.exec(l)
      return m ? [[m[1]!, m[2]!] as const] : []
    }))
    const kinds = [...ifcFacts(ifc).keys()].map((id) => lines.get(id))
    expect(new Set(kinds)).toEqual(new Set(['IFCDOOR', 'IFCWINDOW', 'IFCWALLSTANDARDCASE', 'IFCSPACE', 'IFCBUILDINGSTOREY']))
  })

  it('stays byte-identical for the same plan and whatever order it lists its parts in', () => {
    const one = text(exportPlan(office(), 'ifc', OPTIONS).data)
    expect(text(exportPlan(office(), 'ifc', OPTIONS).data)).toBe(one)
    expect(text(exportPlan(reversed(office()), 'ifc', OPTIONS).data)).toBe(one)
  })

  it('writes no set for a plan with no facts', () => {
    expect(text(exportPlan(withoutFacts(office()), 'ifc', OPTIONS).data)).not.toContain('Grid_Properties')
  })
})

describe('the facts in the DXF (CNT-9)', () => {
  const allFloors = (plan: FloorPlan) => planFloors(plan).flatMap((floor) => dxfFacts(text(exportPlan(plan, 'dxf', { ...OPTIONS, floorId: floor.id }).data)))

  it('writes every one of the 59 facts, one line each on GRID-FACTS, that reads back by id', () => {
    const facts = allFloors(office())
    expect(facts).toHaveLength(59)
    expect(facts).toContainEqual({ id: 'd-entry', name: 'fire rating', value: 'EI 30' })
    expect(facts).toContainEqual({ id: 'g-office', name: 'room number', value: 'G.02' })
    expect(facts).toContainEqual({ id: 'first', name: 'fire compartment', value: 'FC-2' })
    expect(facts).toContainEqual({ id: 'w-g2', name: 'openable', value: 'no' })
  })

  it('stays byte-identical whatever order the plan lists its parts in, and adds no layer to a plan with no facts', () => {
    const one = text(exportPlan(office(), 'dxf', { ...OPTIONS, floorId: 'ground' }).data)
    expect(text(exportPlan(reversed(office()), 'dxf', { ...OPTIONS, floorId: 'ground' }).data)).toBe(one)
    expect(one).toContain('GRID-FACTS')
    expect(text(exportPlan(withoutFacts(office()), 'dxf', { ...OPTIONS, floorId: 'ground' }).data)).not.toContain('GRID-FACTS')
  })
})
