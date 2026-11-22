/**
 * CNT-10: the phase is kept in the hand-over files. The DXF puts each wall on its phase's layer
 * (`GRID-WALLS-EXISTING`, `-NEW`, `-DEMOLISHED`, a new wall's fill on `GRID-WALLS-FILL-NEW`) and
 * draws each opening to be demolished as a dashed outline on `GRID-OPENINGS-DEMOLISHED`; the IFC
 * gives each element a `Grid_Phase` set. Both stay byte-identical whatever order the plan lists
 * its parts in (QAR-5), and a plan with no phases writes neither.
 */
import { describe, expect, it } from 'vitest'
import { type FloorPlan } from '../../types/floorplan'
import { exportPlan } from '../planExport'
import { refurbishment } from '../../test-support/phases'
import { readDxf, valueOf } from '../../geometry/export/__tests__/dxf-reader'

const NOW = new Date('2026-11-21T12:00:00.000Z')
const OPTIONS = { projectId: 'refurb', projectName: 'Refurbishment', now: NOW }

const reversed = (plan: FloorPlan): FloorPlan => ({
  ...plan,
  walls: [...plan.walls].reverse(),
  rooms: [...plan.rooms].reverse(),
  openings: [...plan.openings].reverse(),
})

const text = (data: string | Uint8Array): string => (typeof data === 'string' ? data : new TextDecoder().decode(data))

/** Each element's phase in the IFC, by the element's name or tag line, as `kind:phase` counts. */
function ifcPhases(ifc: string): Map<string, number> {
  const lines = new Map<string, string>()
  for (const line of ifc.split('\n')) {
    const at = /^#(\d+)=(.*);$/.exec(line)
    if (at) lines.set(`#${at[1]}`, at[2]!)
  }
  const counts = new Map<string, number>()
  for (const body of lines.values()) {
    if (!body.startsWith('IFCRELDEFINESBYPROPERTIES(')) continue
    const [, elements, set] = /\(([^()]*)\),(#\d+)\)$/.exec(body) ?? []
    const setBody = lines.get(set!) ?? ''
    if (!setBody.includes("'Grid_Phase'")) continue
    const value = lines.get(/\((#\d+)\)\)$/.exec(setBody)![1]!)!
    const phase = /IFCLABEL\('(\w+)'\)/.exec(value)![1]!
    for (const element of elements!.split(',')) {
      const type = /^(\w+)\(/.exec(lines.get(element)!)![1]!
      const key = `${type}:${phase}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return counts
}

describe('the phase in the hand-over files (CNT-10)', () => {
  it('puts each wall on its phase\'s layer in the DXF, and the openings to be demolished dashed', () => {
    const dxf = text(exportPlan(refurbishment(), 'dxf', OPTIONS).data)
    const read = readDxf(dxf)
    const on = (layer: string) => read.entities.filter((e) => e.layer === layer)
    expect(on('GRID-WALLS-DEMOLISHED').length).toBeGreaterThan(0)
    expect(on('GRID-WALLS-NEW').length).toBeGreaterThan(0)
    expect(on('GRID-WALLS-EXISTING').length).toBeGreaterThan(0)
    expect(on('GRID-WALLS-FILL-NEW').map((e) => e.type)).toContain('HATCH')
    // The old bath door, the blocked window and the kitchen door, each as one closed outline.
    expect(on('GRID-OPENINGS-DEMOLISHED').map((e) => e.type)).toEqual(['LWPOLYLINE', 'LWPOLYLINE', 'LWPOLYLINE'])
    // No wall of a plan with phases is left on the plain layers.
    expect(on('GRID-WALLS-EXTERIOR')).toEqual([])
    expect(on('GRID-WALLS-INTERIOR')).toEqual([])
    const layer = read.tables.get('LAYER')!.records.find((r) => valueOf(r, 2) === 'GRID-WALLS-DEMOLISHED')!
    expect(valueOf(layer, 6)).toBe('DASHED')
  })

  it('gives each IFC element its phase, and writes the spaces after the work', () => {
    const ifc = text(exportPlan(refurbishment(), 'ifc', OPTIONS).data)
    const counts = Object.fromEntries(ifcPhases(ifc))
    expect(counts).toEqual({
      'IFCWALLSTANDARDCASE:existing': 6,
      'IFCWALLSTANDARDCASE:demolished': 1,
      'IFCWALLSTANDARDCASE:new': 1,
      'IFCDOOR:existing': 2,
      'IFCDOOR:demolished': 2,
      'IFCDOOR:new': 2,
      'IFCWINDOW:existing': 3,
      'IFCWINDOW:demolished': 1,
      'IFCWINDOW:new': 1,
      'IFCSPACE:existing': 1,
      'IFCSPACE:new': 3,
    })
  })

  it('writes the same bytes whatever order the plan lists its parts in', () => {
    for (const format of ['dxf', 'ifc'] as const) {
      expect(text(exportPlan(reversed(refurbishment()), format, OPTIONS).data)).toBe(text(exportPlan(refurbishment(), format, OPTIONS).data))
    }
  })
})
