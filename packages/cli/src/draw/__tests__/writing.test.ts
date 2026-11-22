import { readFileSync } from 'fs'
import { resolve } from 'path'
import { gunzipSync } from 'zlib'
import { describe, expect, it } from 'vitest'
import { buildFloorPlan, planForFloor, toDxf, validatePlan } from '@ongrid/floorplan/geometry'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { checkLocalRules, inspectPlan } from '@ongrid/rules'
import { planPicture, planToSvg } from '@ongrid/viewer/src/picture'
import { drawShowOf } from '../../command/drawShow'
import { checkDrawRequest } from '../../command/draw'
import { UsageError } from '../../command/options'
import { planAreas } from '../../quantities/areas'
import { surveyPlan } from '../../quantities/survey'
import { twoBedFlat } from './twoBedFlat'

/**
 * SHT-7: writing on the drawing (notes, tags, symbols, a key and a title) and a sketch layer
 * that is drawn and exported, and never measured, checked or taken as a wall.
 */

const DATA = resolve(__dirname, '../../../../../scoreboard/data')

function labPlan(name: string): unknown {
  const line = gunzipSync(readFileSync(resolve(DATA, 'lab-plans.ndjson.gz')))
    .toString('utf8')
    .split('\n')
    .find((l) => l.includes(`"name":${JSON.stringify(name)}`))
  if (!line) throw new Error(`no lab plan ${name}`)
  return JSON.parse((JSON.parse(line) as { text: string }).text)
}

const withSketch = (plan: FloorPlan, sketch: unknown[]): FloorPlan => parseFloorPlan({ ...plan, sketch })
const RECT = { id: 'garden', kind: 'rect', category: 'garden', from: [0, -1], to: [10, -6] }

describe('a sketch rectangle changes no number', () => {
  const before = twoBedFlat()
  const after = withSketch(twoBedFlat(), [RECT])

  it('leaves every area, check, wall and room as it was', () => {
    expect(planAreas(surveyPlan(after))).toEqual(planAreas(surveyPlan(before)))
    expect(checkLocalRules(after)).toEqual(checkLocalRules(before))
    expect(validatePlan(after)).toEqual(validatePlan(before))
    const [a, b] = [buildFloorPlan(planForFloor(after, 'ground')), buildFloorPlan(planForFloor(before, 'ground'))]
    expect(a.walls).toEqual(b.walls)
    expect(a.rooms).toEqual(b.rooms)
    expect(a.openings).toEqual(b.openings)
    expect(a.bounds).toEqual(b.bounds)
  })

  it('adds one line to the record, saying it is drawn only, and changes no other', () => {
    const [a, b] = [inspectPlan(after), inspectPlan(before)]
    const added = a.lines.filter((line) => line.code === 'floor/sketch-drawn-only')
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({ kind: 'not-checked', thing: { kind: 'floor', id: 'ground' }, also: ['garden'] })
    expect(added[0]!.message).toContain('drawn only')
    expect(a.lines.filter((line) => line.code !== 'floor/sketch-drawn-only')).toEqual(b.lines)
    expect(a.checks).toEqual(b.checks)
  })

  it('goes on a DXF layer of its own, and leaves the rest of the file as it was', () => {
    const [a, b] = [toDxf(buildFloorPlan(planForFloor(after, 'ground'))), toDxf(buildFloorPlan(planForFloor(before, 'ground')))]
    expect(a).toContain('GRID-SKETCH-GARDEN')
    expect(b).not.toContain('GRID-SKETCH')
    // The rest: the same entities on the same layers.
    const entities = (dxf: string): string[] => {
      const lines = dxf.slice(dxf.indexOf('ENTITIES')).split(/\r?\n/).map((line) => line.trim())
      return lines.filter((line) => line.startsWith('GRID-') && !line.startsWith('GRID-SKETCH'))
    }
    expect(entities(a).length).toBeGreaterThan(10)
    expect(entities(a)).toEqual(entities(b))
    expect(a.slice(a.indexOf('ENTITIES')).split(/\r?\n/).filter((line) => line.trim() === 'GRID-SKETCH-GARDEN').length).toBeGreaterThan(0)
  })

  it('is drawn, framed with the plan, under its category', () => {
    const svg = planToSvg(after)
    expect(svg).toContain('data-part="sketch" data-kind="rect" data-category="garden" data-id="garden"')
    expect(planPicture(after).view.height).toBeGreaterThan(planPicture(before).view.height)
  })

  it('draws each kind, and only on its own floor', () => {
    const plan = withSketch(twoBedFlat(), [
      { id: 'l', kind: 'line', category: 'street', points: [[0, 9], [10, 9]] },
      { id: 'a', kind: 'arc', category: 'garden', at: [3, -3], radius: 1, start: 0, end: 270 },
      { id: 's', kind: 'shape', category: 'garden', points: [[0, -1], [2, -1], [1, -2]] },
      { id: 't', kind: 'text', category: 'garden', at: [5, -3], text: 'Lawn' },
      { id: 'up', kind: 'rect', category: 'roof', floor: 'first', from: [0, 0], to: [1, 1] }
    ])
    const sketch = buildFloorPlan(planForFloor(plan, 'ground')).sketch
    expect(sketch.map((item) => item.id)).toEqual(['l', 'a', 's', 't'])
    expect(sketch.find((item) => item.id === 'a')!.arc).toMatchObject({ radius: 1, from: 0, to: (270 * Math.PI) / 180, counterClockwise: true })
    expect(planToSvg(plan)).toContain('>Lawn</text>')
  })

  it('refuses a sketch item that lacks what its kind needs, naming it', () => {
    expect(() => withSketch(twoBedFlat(), [{ id: 'x', kind: 'rect', category: 'garden', from: [0, 0] }])).toThrow(/a sketch rect needs to, the opposite corner/)
  })
})

describe('notes, tags, symbols, a key and a title', () => {
  const plan = (): FloorPlan => {
    const base = twoBedFlat()
    return parseFloorPlan({
      ...base,
      title: 'Option A',
      annotations: [
        { id: 'n1', kind: 'note', text: 'Garden', at: [5, -3] },
        { id: 't1', kind: 'tag', text: 'New wall', room: 'bed1' },
        { id: 'north', kind: 'symbol', symbol: 'north', at: [11, 8] },
        { id: 'k', kind: 'key' }
      ]
    })
  }

  it('are stored and drawn', () => {
    const svg = planToSvg(plan())
    expect(svg).toContain('data-part="note-note" data-id="n1"')
    expect(svg).toContain('>Garden</text>')
    expect(svg).toContain('data-part="note-tag" data-id="t1"')
    expect(svg).toContain('>New wall</text>')
    expect(svg).toContain('data-part="note-symbol" data-id="north"')
    expect(svg).toContain('data-part="title"')
    expect(svg).toContain('>Option A</text>')
    expect(svg).toContain('>Outside wall</text>')
    expect(svg).toContain('data-part="key-title"')
  })

  it('go on the DXF notes layer, and change no number', () => {
    const drawing = buildFloorPlan(planForFloor(plan(), 'ground'))
    expect(toDxf(drawing)).toContain('GRID-NOTES')
    expect(planAreas(surveyPlan(plan()))).toEqual(planAreas(surveyPlan(twoBedFlat())))
    expect(checkLocalRules(plan())).toEqual(checkLocalRules(twoBedFlat()))
  })

  it('DR-6: the title the lab wrote now changes the picture', () => {
    const raw = labPlan('AU2/scenarios/J-3-estate-agent--t4-made-up-title-logo-fixtures/plan.json') as Record<string, unknown>
    const titled = parseFloorPlan(raw)
    const untitled = parseFloorPlan({ ...raw, title: undefined })
    expect(titled.title).toBe('Flat 4, 12 Example Road')
    const svg = planToSvg(titled)
    expect(svg).not.toBe(planToSvg(untitled))
    expect(svg).toContain('>Flat 4, 12 Example Road</text>')
    // The fields Grid still does not read are named, and the title is no longer among them.
    const unknown = inspectPlan(raw).lines.filter((line) => line.code === 'plan/unknown-field').map((line) => line.message)
    expect(unknown.some((m) => m.includes('"title"'))).toBe(false)
    expect(unknown.some((m) => m.includes('"logo"'))).toBe(true)
  })

  it('names an annotation field Grid does not know', () => {
    const raw = { ...twoBedFlat(), annotations: [{ id: 'n1', kind: 'note', text: 'Garden', at: [5, -3], colour: 'red' }] }
    const line = inspectPlan(raw).lines.find((l) => l.code === 'plan/unknown-field')!
    expect(line.message).toContain('"colour"')
    expect(line.needed).toContain('annotations[0]')
  })

  it('says when a note names a room the plan does not have', () => {
    const raw = { ...twoBedFlat(), annotations: [{ id: 'n1', kind: 'note', text: 'Here', room: 'attic' }] }
    const line = inspectPlan(raw).lines.find((l) => l.code === 'plan/note-no-place')!
    expect(line).toMatchObject({ kind: 'worth-a-look', also: ['n1', 'attic'] })
    expect(planToSvg(parseFloorPlan(raw))).not.toContain('data-part="note-note"')
  })
})

describe('display options', () => {
  it('leave off what --hide names, and colour rooms by use', () => {
    const plan = parseFloorPlan({ ...twoBedFlat(), title: 'T', annotations: [{ id: 'n', kind: 'note', text: 'Garden', at: [5, -3] }], sketch: [RECT] })
    plan.rooms[0]!.use = 'bedroom'
    const shown = drawShowOf({ hide: 'title,notes,sketch,areas,swings', colour: 'use' })
    expect(shown.showDimensions).toBe(true)
    const svg = planToSvg(plan, { show: shown.show })
    for (const part of ['title', 'note-note', 'sketch', 'area', 'door-symbol']) expect(svg).not.toContain(`data-part="${part}"`)
    expect(svg).toContain('fill="#dfe8f3"')
    expect(drawShowOf({ hide: 'dimensions' }).showDimensions).toBe(false)
  })

  it('leave off the outline of the floor above with --hide above (SHT-11)', () => {
    expect(drawShowOf({ hide: 'above' }).show).toEqual({ above: false })
    // The flat with a first floor 2 m deeper to the north: its outline shows dashed on the ground floor.
    const flat = twoBedFlat()
    const wall = (id: string, start: [number, number], end: [number, number]) => ({ id, start, end, thickness: 0.25, height: 2.6, kind: 'exterior' as const, floor: 'first' })
    const up = [wall('up-s', [0, 0], [10, 0]), wall('up-e', [10, 0], [10, 9.5]), wall('up-n', [10, 9.5], [0, 9.5]), wall('up-w', [0, 9.5], [0, 0])]
    const plan = parseFloorPlan({ ...flat, floors: [{ id: 'ground', name: 'Ground floor', level: 0 }, { id: 'first', name: 'First floor', level: 1 }], walls: [...flat.walls, ...up] })
    expect(planToSvg(plan, { floor: 'ground' })).toContain('data-part="above"')
    expect(planToSvg(plan, { floor: 'ground', show: drawShowOf({ hide: 'above' }).show })).not.toContain('data-part="above"')
  })

  it('refuse a part Grid does not know, and a part for the 3D model', () => {
    expect(() => drawShowOf({ hide: 'trees' })).toThrow(UsageError)
    expect(() => drawShowOf({ hide: 'trees' })).toThrow(/"trees" is not a part Grid can leave off/)
    expect(() => drawShowOf({ colour: 'red' })).toThrow(/is not a way Grid colours rooms/)
    expect(() => checkDrawRequest({ png: false, threeD: true, hide: 'areas' })).toThrow(/--hide is for a floor plan/)
  })
})
