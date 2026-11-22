/**
 * HND-6: every export says what it leaves out, in its answer and in the file, and says when it
 * holds nothing of the plan (lab EX-8: a six-floor block with its ids repeated on every floor had
 * 230 doors and windows in the plan and 20 in the IFC, and nothing said so).
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../../types/floorplan'
import { readPlanParts } from '../../types/readParts'
import { parseGlb, samplePlan } from '../../geometry/export/__tests__/glb-reader'
import { EXPORT_FORMATS, exportPlan, type ExportFormat } from '../planExport'

const ids = { projectId: 'project-1', projectName: 'Block', now: new Date('2026-11-22T12:00:00.000Z') }
const text = (data: string | Uint8Array): string => (typeof data === 'string' ? data : new TextDecoder().decode(data))
const count = (haystack: string, needle: string): number => haystack.split(needle).length - 1

/** Four walls round a 6 x 4 m flat on `floor`, a room in them, a door and a window. */
function storey(floor: string, prefix: string): Pick<FloorPlan, 'walls' | 'rooms' | 'openings'> {
  const wall = (id: string, start: [number, number], end: [number, number]) => ({ id: `${prefix}${id}`, start, end, thickness: 0.2, height: 2.7, kind: 'exterior' as const, floor })
  return {
    walls: [wall('s', [0, 0], [6, 0]), wall('e', [6, 0], [6, 4]), wall('n', [6, 4], [0, 4]), wall('w', [0, 4], [0, 0])],
    rooms: [{ id: `${prefix}flat`, name: 'Flat', boundary: ['s', 'e', 'n', 'w'].map((side) => `${prefix}${side}`), floor }],
    openings: [
      { id: `${prefix}door`, wall: `${prefix}s`, type: 'door', offset: 1, width: 0.9, sill: 0, height: 2.1 },
      { id: `${prefix}window`, wall: `${prefix}n`, type: 'window', offset: 2, width: 1.2, sill: 0.9, height: 1.2 }
    ]
  }
}

const UPPER = ['L1', 'L2', 'L3', 'L4', 'L5']

/**
 * EX-8's block in small: a ground floor with ids of its own and five floors above that all use
 * the same ids, as a file written by copying a floor five times.
 */
function block(): Record<string, unknown> {
  const floors = [storey('ground', 'g-'), ...UPPER.map((floor) => storey(floor, ''))]
  return {
    version: '1',
    units: 'm',
    floors: [{ id: 'ground', name: 'Ground', level: 0 }, ...UPPER.map((id, n) => ({ id, name: `Floor ${n + 1}`, level: n + 1 }))],
    walls: floors.flatMap((f) => f.walls),
    rooms: floors.flatMap((f) => f.rooms),
    openings: floors.flatMap((f) => f.openings)
  }
}

/** The block read as `grid export` reads a file: part by part (MSG-6). */
function readBlock() {
  const parts = readPlanParts(block(), [])
  if (parts.plan === null) throw new Error('the block is not read')
  return { plan: parts.plan, faults: parts.faults }
}

describe('what an export leaves out (HND-6)', () => {
  it('names the openings the IFC of the block leaves out, and the IFC says how many', () => {
    const { plan, faults } = readBlock()
    const made = exportPlan(plan, 'ifc', { ...ids, faults })
    const ifc = text(made.data)
    const inPlan = (block()['openings'] as unknown[]).length
    const inFile = count(ifc, '=IFCOPENINGELEMENT(')
    const openings = made.leftOut.filter((part) => part.kind === 'opening')

    expect(inPlan).toBe(12)
    expect(inFile).toBe(2)
    // Every opening is in the file or named: the reader left out the copies on L2 to L5, and L1's
    // are on walls whose ids are used on five floors, which no floor can hold.
    expect(openings).toHaveLength(inPlan - inFile)
    expect(openings.filter((part) => part.code === 'plan/id-clash')).toHaveLength(8)
    expect(openings.filter((part) => part.code === 'opening/broken-wall').map((part) => [part.id, part.floor])).toEqual([['door', 'L1'], ['window', 'L1']])
    expect(made.leftOut.filter((part) => part.kind === 'room').map((part) => part.place)).toEqual(['rooms[2]', 'rooms[3]', 'rooms[4]', 'rooms[5]'])
    expect(made.empty).toBe(false)

    expect(ifc).toContain("'Grid_LeftOut'")
    expect(ifc).toContain(`IFCPROPERTYSINGLEVALUE('Parts',$,IFCINTEGER(${made.leftOut.length}),$)`)
    expect(ifc).toContain("IFCPROPERTYSINGLEVALUE('Openings',$,IFCINTEGER(10),$)")
    // An id several parts share is named once, with how many.
    expect(ifc).toContain(`IFCPROPERTYSINGLEVALUE('OpeningIds',$,IFCTEXT('"door" 5 times, "window" 5 times'),$)`)
    // The set hangs on the building.
    const building = /#(\d+)=IFCBUILDING\(/.exec(ifc)![1]
    expect(ifc).toMatch(new RegExp(`IFCRELDEFINESBYPROPERTIES\\([^;]*\\(#${building}\\),#\\d+\\);`))
  })

  it('names what one floor leaves out in its DXF, OBJ and GLB', () => {
    const { plan, faults } = readBlock()
    for (const format of ['dxf', 'obj', 'glb'] as const) {
      const made = exportPlan(plan, format, { ...ids, faults, floorId: 'L1' })
      // L1's door and window, and the twelve parts the reader left out, which no floor holds.
      expect(made.leftOut.filter((part) => part.floor === 'L1').map((part) => part.id), format).toEqual(['door', 'window'])
      expect(made.leftOut.filter((part) => part.place !== null), format).toHaveLength(12)
    }
    const ground = exportPlan(plan, 'dxf', { ...ids, faults, floorId: 'ground' })
    expect(ground.leftOut.filter((part) => part.floor !== null)).toEqual([])
  })

  it('writes the note in each format, and only when something is left out', () => {
    const { plan, faults } = readBlock()
    const dxf = text(exportPlan(plan, 'dxf', { ...ids, faults, floorId: 'L1' }).data).split('\r\n')
    const layers = dxf.filter((line, n) => dxf[n - 1] === '  2' || dxf[n - 1] === '2')
    expect(layers).toContain('GRID-LEFT-OUT')
    const notes = dxf.filter((_, n) => dxf[n - 1] === '1' && dxf.slice(Math.max(0, n - 12), n).includes('GRID-LEFT-OUT'))
    expect(notes[0]).toMatch(/^Grid left 14 parts of the plan out of this file \(4 rooms and 10 openings\)/)
    expect(notes).toContain('Openings left out (10): "door" 5 times, "window" 5 times')

    const obj = text(exportPlan(plan, 'obj', { ...ids, faults, floorId: 'L1' }).data)
    expect(obj.split('\n').filter((line) => line.includes('left out')).every((line) => line.startsWith('# '))).toBe(true)
    expect(obj).toContain('# Rooms left out (4): "flat" 4 times')

    const glb = parseGlb(exportPlan(plan, 'glb', { ...ids, faults, floorId: 'L1' }).data as Uint8Array).json as {
      asset: { extras?: { gridLeftOut?: { count: number; note: string[]; parts: { kind: string }[] } } }
    }
    expect(glb.asset.extras?.gridLeftOut?.count).toBe(14)
    expect(glb.asset.extras?.gridLeftOut?.parts).toHaveLength(14)

    for (const format of EXPORT_FORMATS) {
      const made = exportPlan(samplePlan(), format, ids)
      expect(made.leftOut, format).toEqual([])
      expect(made.empty, format).toBe(false)
      expect(text(made.data), format).not.toMatch(/Grid_LeftOut|GRID-LEFT-OUT|gridLeftOut|left out/)
    }
  })

  it('keeps a hostile id inside the note', () => {
    const plan: FloorPlan = {
      ...samplePlan(),
      walls: [...samplePlan().walls, { id: 'x\nf 1 2 3\r\n0\r\nEOF é\'', start: [9, 9], end: [9, 9], thickness: 0.2, height: 2.5, kind: 'interior' }]
    }
    const obj = text(exportPlan(plan, 'obj', ids).data).split('\n')
    expect(obj.filter((line) => line.startsWith('f ')).length).toBe(text(exportPlan(samplePlan(), 'obj', ids).data).split('\n').filter((line) => line.startsWith('f ')).length)
    expect(obj.some((line) => line.startsWith('# Walls left out (1): "x\\nf 1 2 3'))).toBe(true)
    const dxf = text(exportPlan(plan, 'dxf', ids).data).split('\r\n')
    expect(dxf.filter((line) => line === 'EOF')).toHaveLength(1)
    // HND-1: the letter as it is, in UTF-8, and the backslashes of the JSON string as codes.
    expect(dxf.some((line) => line.includes('EOF \u00e9') && line.includes('\\U+005Cn'))).toBe(true)
    const ifc = text(exportPlan(plan, 'ifc', ids).data)
    expect(ifc).toContain("WallIds',$,IFCTEXT('\"x\\\\nf 1 2 3\\\\r\\\\n0\\\\r\\\\nEOF \\X2\\00E9\\X0\\''\"')")
  })

  it('says a plan with nothing to draw is empty, in every format', () => {
    const nothing: FloorPlan = { version: '1', units: 'm', walls: [], rooms: [], openings: [] }
    const roomsOnly: FloorPlan = { ...samplePlan(), walls: [] }
    for (const format of EXPORT_FORMATS as readonly ExportFormat[]) {
      expect(exportPlan(nothing, format, ids)).toMatchObject({ empty: true, leftOut: [] })
      const made = exportPlan(roomsOnly, format, ids)
      expect(made.empty, format).toBe(true)
      expect(made.leftOut.map((part) => `${part.kind} ${part.id} ${part.code}`), format).toEqual([
        'room r1 room/unclosed',
        'opening o1 opening/missing-wall',
        'opening o2 opening/missing-wall',
        'opening o3 opening/missing-wall'
      ])
    }
  })
})
