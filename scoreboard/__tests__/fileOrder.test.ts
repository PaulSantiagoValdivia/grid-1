/**
 * QAR-5 (lab MS-21, L-12): walls written in another order give byte-identical IFC, GLB, OBJ
 * and DXF.
 *
 * These are the plans of the lab's experiment that this folder can rebuild from their seeds:
 * the bench's two-bedroom flat, the 40 seeded buildings, the bench's L room, and the flat with
 * an opening listed twice and with a wall id used twice. The lab's other 20 plans (L, T, U, Z
 * and cross shapes) come from a generator that lives only in the lab; `reviews/QAR-5.md`
 * records the run over all 64.
 */
import { describe, expect, it } from 'vitest'
import { EXPORT_FORMATS, exportPlan } from '@ongrid/floorplan/export'
import { planFloors } from '@ongrid/floorplan/geometry'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import * as data from '../src/data'
import { clone, randomBuilding, rng, type Raw } from '../src/gen'

function plans(): { name: string; plan: Raw }[] {
  const flat = data.benchExamples().twoBedFlat
  const out: { name: string; plan: Raw }[] = [{ name: 'two-bed-flat', plan: clone(flat) }]
  for (let seed = 1; seed <= 40; seed++) {
    const made = randomBuilding({ seed: 7000 + seed, rooms: 1 + ((seed * 7) % 25), floors: 1 + (seed % 3), mode: seed % 2 ? 'lines' : 'pieces' })
    out.push({ name: `b${7000 + seed}`, plan: made.plan })
  }
  const side = (id: string, start: [number, number], end: [number, number]) => ({ id, start, end, thickness: 0.2, height: 2.7, kind: 'exterior' as const })
  out.push({
    name: 'L 6 x 6 m with a 3 x 3 m corner cut out',
    plan: {
      version: '1',
      units: 'm',
      walls: [side('a', [0, 0], [6, 0]), side('b', [6, 0], [6, 3]), side('c', [6, 3], [3, 3]), side('d', [3, 3], [3, 6]), side('e', [3, 6], [0, 6]), side('f', [0, 6], [0, 0])],
      rooms: [{ id: 'room', name: 'L room', use: 'living', boundary: ['a', 'b', 'c', 'd', 'e', 'f'] }],
      openings: [],
    },
  })
  const twin = clone(flat)
  twin.openings.push({ ...twin.openings[0]!, id: 'twin-of-first' })
  out.push({ name: 'two openings in the same place', plan: twin })
  const dup = clone(flat)
  dup.walls.push({ ...dup.walls[0]!, start: [20, 20], end: [25, 20] })
  out.push({ name: 'one wall id used twice', plan: dup })
  return out
}

const now = new Date('2026-01-01T00:00:00Z')

function exportsOf(raw: Raw): Record<string, string> {
  const plan = parseFloorPlan(raw)
  const out: Record<string, string> = {}
  for (const format of EXPORT_FORMATS) {
    const floors = format === 'ifc' ? [null] : planFloors(plan).map((floor) => floor.id)
    for (const floorId of floors) {
      const { data: bytes } = exportPlan(plan, format, { projectId: 'same', projectName: 'same', floorId, now })
      out[`${format}:${floorId}`] = typeof bytes === 'string' ? bytes : Buffer.from(bytes).toString('base64')
    }
  }
  return out
}

describe('the plans of lab entry MS-21, walls shuffled (QAR-5)', () => {
  const list = plans()

  it('are the 44 that can be rebuilt here', () => {
    expect(list).toHaveLength(44)
  })

  it('give byte-identical exports in every format, eight shuffles each', () => {
    const r = rng(555)
    const differ: string[] = []
    for (const { name, plan } of list) {
      const base = exportsOf(plan)
      for (let n = 0; n < 8; n++) {
        const moved = clone(plan)
        moved.walls = r.shuffle(moved.walls)
        const after = exportsOf(moved)
        for (const key of Object.keys(base)) if (after[key] !== base[key]) differ.push(`${name} ${key}`)
      }
    }
    expect([...new Set(differ)]).toEqual([])
  }, 120_000)
})
