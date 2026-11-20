import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../../plan'
import { buildFloorPlan } from '../../floorplan'
import { DXF_LAYERS, toDxf } from '../dxf'
import { parseFloorPlan } from '../../../types/floorplan'

/**
 * DXF export.
 *
 * A DXF is a flat list of (group code, value) pairs, two lines each. Parsing it
 * back into pairs is both how these assertions read the file and the cheapest
 * proof that it is well formed at all — an odd line count means a value was
 * written without its code, which no reader recovers from.
 */

/** A 4×4 room with a door, one interior partition and one virtual divider. */
function samplePlan(): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: [
      { id: 'w1', start: [0, 0], end: [4, 0], thickness: 0.2, height: 2.5, kind: 'exterior' },
      { id: 'w2', start: [4, 0], end: [4, 3], thickness: 0.2, height: 2.5, kind: 'exterior' },
      { id: 'w3', start: [4, 3], end: [0, 3], thickness: 0.2, height: 2.5, kind: 'exterior' },
      { id: 'w4', start: [0, 3], end: [0, 0], thickness: 0.2, height: 2.5, kind: 'exterior' }
    ],
    rooms: [{ id: 'r1', name: 'Living room', boundary: ['w1', 'w2', 'w3', 'w4'] }],
    openings: [
      { id: 'o1', wall: 'w1', type: 'door', offset: 1.5, width: 0.9, sill: 0, height: 2.1 }
    ]
  }
}

const dxfOf = (plan: FloorPlan): string => toDxf(buildFloorPlan(plan))

interface Pair {
  readonly code: number
  readonly value: string
}

/** The file as the (code, value) pairs a reader consumes. Throws if malformed. */
function pairs(dxf: string): Pair[] {
  const lines = dxf.split('\r\n')
  // A DXF ends with a trailing newline after EOF, so the split leaves one blank.
  if (lines[lines.length - 1] === '') lines.pop()

  expect(lines.length % 2).toBe(0)

  const out: Pair[] = []
  for (let i = 0; i < lines.length; i += 2) {
    const code = Number(lines[i]!.trim())
    expect(Number.isInteger(code)).toBe(true)
    out.push({ code, value: lines[i + 1]! })
  }
  return out
}

const valuesOf = (dxf: string, code: number): string[] =>
  pairs(dxf)
    .filter((p) => p.code === code)
    .map((p) => p.value)

describe('the file a reader actually sees', () => {
  it('is a well-formed sequence of code/value pairs', () => {
    expect(() => pairs(dxfOf(samplePlan()))).not.toThrow()
  })

  it('opens and closes every section, and ends at EOF', () => {
    const structural = pairs(dxfOf(samplePlan()))
      .filter((p) => p.code === 0)
      .map((p) => p.value)

    expect(structural.filter((v) => v === 'SECTION')).toHaveLength(
      structural.filter((v) => v === 'ENDSEC').length
    )
    expect(structural[structural.length - 1]).toBe('EOF')
  })

  it('declares the version it claims to be', () => {
    // R12. Its minimal valid form really is this small; R2000+ additionally
    // wants CLASSES, BLOCK_RECORD and an OBJECTS dictionary, and a file missing
    // those is not something to hand an architect and hope.
    const dxf = dxfOf(samplePlan())
    expect(dxf).toContain('$ACADVER')
    expect(valuesOf(dxf, 1)).toContain('AC1009')
  })

  it('uses CRLF, the line ending the format is written with', () => {
    expect(dxfOf(samplePlan())).toContain('\r\n')
  })
})

describe('layers', () => {
  it('declares every layer any entity puts itself on', () => {
    // The invariant that matters: an entity on an undeclared layer either fails
    // to import or lands somewhere invisible, and the drawing looks empty.
    const dxf = dxfOf(samplePlan())
    const all = pairs(dxf)

    // The last table is the layer table; the line types come before it.
    const tableEnd = all.findLastIndex((p) => p.code === 0 && p.value === 'ENDTAB')
    const declared = new Set(
      all.slice(0, tableEnd).filter((p) => p.code === 2).map((p) => p.value)
    )
    const used = new Set(all.slice(tableEnd).filter((p) => p.code === 8).map((p) => p.value))

    expect(used.size).toBeGreaterThan(0)
    for (const layer of used) expect(declared).toContain(layer)
  })

  it('separates walls, rooms, openings and labels', () => {
    const used = new Set(valuesOf(dxfOf(samplePlan()), 8))

    expect(used).toContain(DXF_LAYERS.wallExterior)
    expect(used).toContain(DXF_LAYERS.rooms)
    expect(used).toContain(DXF_LAYERS.openings)
    expect(used).toContain(DXF_LAYERS.labels)
  })
})

describe('coordinates (C4)', () => {
  const xs = (dxf: string): number[] => valuesOf(dxf, 10).map(Number)
  const ys = (dxf: string): number[] => valuesOf(dxf, 20).map(Number)

  it('writes meters, unscaled', () => {
    const dxf = dxfOf(samplePlan())

    // The plan spans x 0..4. Wall thickness pushes the outer face to 4.1.
    expect(Math.max(...xs(dxf))).toBeCloseTo(4.1, 6)
    expect(Math.min(...xs(dxf))).toBeCloseTo(-0.1, 6)
  })

  it('does not flip Y', () => {
    // A mirrored basis passes every length and area test and still exports the
    // plan upside down. +Y forward in the plan is +Y up in the DXF (C4).
    const dxf = dxfOf(samplePlan())

    expect(Math.max(...ys(dxf))).toBeCloseTo(3.1, 6)
    expect(ys(dxf).every((y) => y >= -0.2)).toBe(true)
  })

  it('reports an extent that matches what it drew', () => {
    const plan = samplePlan()
    const dxf = toDxf(buildFloorPlan(plan))
    const all = pairs(dxf)

    const extMin = all.findIndex((p) => p.code === 9 && p.value === '$EXTMIN')
    const extMax = all.findIndex((p) => p.code === 9 && p.value === '$EXTMAX')

    expect(Number(all[extMin + 1]!.value)).toBeCloseTo(Math.min(...xs(dxf)), 6)
    expect(Number(all[extMax + 1]!.value)).toBeCloseTo(Math.max(...xs(dxf)), 6)
  })
})

describe('shapes', () => {
  it('closes wall and room outlines', () => {
    // An open outline hatches and fills wrong in every CAD tool downstream.
    // Scoped to ENTITIES on purpose: code 70 is also the layer table's flags
    // and its entry count, so reading it across the whole file would compare
    // the wrong thing and pass or fail for reasons unrelated to any outline.
    const all = pairs(dxfOf(samplePlan()))
    const entities = all.slice(all.findIndex((p) => p.code === 2 && p.value === 'ENTITIES'))
    const closed = entities.filter((p) => p.code === 70).map((p) => p.value)

    expect(closed.length).toBeGreaterThan(0)
    expect(closed.every((flag) => flag.trim() === '1')).toBe(true)
  })

  it('draws the room name and its area', () => {
    const texts = valuesOf(dxfOf(samplePlan()), 1)

    expect(texts.some((t) => t.includes('Living room'))).toBe(true)
    expect(texts.some((t) => /\d+\.\d+ m2/.test(t))).toBe(true)
  })

  it('marks the opening left in the wall', () => {
    const withDoor = dxfOf(samplePlan())
    const plan = samplePlan()
    plan.openings = []

    expect(valuesOf(withDoor, 8).filter((l) => l === DXF_LAYERS.openings).length).toBeGreaterThan(
      valuesOf(dxfOf(plan), 8).filter((l) => l === DXF_LAYERS.openings).length
    )
  })
})

/** Each TEXT entity as its own list of pairs, up to the next entity. */
function textEntities(dxf: string): Pair[][] {
  const all = pairs(dxf)
  const out: Pair[][] = []
  for (let i = 0; i < all.length; i++) {
    if (all[i]!.code !== 0 || all[i]!.value !== 'TEXT') continue
    let end = i + 1
    while (end < all.length && all[end]!.code !== 0) end++
    out.push(all.slice(i + 1, end))
  }
  return out
}

const withName = (name: string): FloorPlan => {
  const plan = samplePlan()
  plan.rooms[0]!.name = name
  return plan
}

/** What a CAD reader sees for a room name: the text value of its first label. */
const nameValue = (name: string): string => textEntities(dxfOf(withName(name)))[0]!.find((p) => p.code === 1)!.value

describe('text a CAD tool has to read back', () => {
  // R12 is an ASCII format. Anything outside ASCII is read through a code page,
  // so a name saved as UTF-8 comes out as mojibake (an n with a tilde as two
  // stray characters). Spanish
  // and German names are the normal case here, not the edge.
  it('writes only ASCII, whatever the room is called', () => {
    // Written as escapes, so this file stays ASCII too: Spanish, German, French,
    // Japanese, and an emoji (a surrogate pair).
    const names = [
      'Ba\u00f1o',
      'K\u00fcche',
      'Salle \u00e0 manger',
      '\u5bdd\u5ba4',
      'Cocina \ud83c\udf73'
    ]

    for (const name of names) {
      expect(dxfOf(withName(name))).toMatch(/^[\x00-\x7f]*$/)
    }
  })

  it('escapes an accented letter as \\U+XXXX, which CAD tools decode', () => {
    expect(nameValue('Ba\u00f1o')).toBe('Ba\\U+00F1o')
    expect(nameValue('K\u00fcche')).toBe('K\\U+00FCche')
  })

  it('declares the code page the file is written in', () => {
    const all = pairs(dxfOf(samplePlan()))
    const at = all.findIndex((p) => p.code === 9 && p.value === '$DWGCODEPAGE')

    expect(at).toBeGreaterThan(-1)
    expect(all[at + 1]).toEqual({ code: 3, value: 'ANSI_1252' })
  })

  it('does not let a backslash in a name forge an escape', () => {
    // `\U+0041` typed into a name would otherwise read back as "A".
    const value = nameValue('Sala\\U+0041')

    expect(value).toBe('Sala\\U+005CU+0041')
    expect(value).not.toContain('\\U+0041')
  })

  it('replaces what R12 cannot hold, instead of splitting it', () => {
    // An emoji is one character made of two UTF-16 units; slicing by units can
    // cut it in half and leave a lone surrogate that no encoder can write.
    expect(nameValue('Cocina \ud83c\udf73')).toBe('Cocina ?')
    expect(nameValue('a\ud83cb')).toBe('a?b')
  })

  it('caps a value at 250 bytes of what is written, not 250 characters', () => {
    // An n with a tilde is one character but seven bytes once escaped: a name well under 250
    // characters is still over R12's 255-byte limit.
    const value = nameValue('\u00f1'.repeat(100))

    expect(value.length).toBeLessThanOrEqual(250)
    expect(value.length).toBeGreaterThan(200)
  })

  it('never cuts an escape in half when it hits the cap', () => {
    for (const length of [34, 35, 36, 37, 100]) {
      const value = nameValue(`a${'\u00f1'.repeat(length)}`)

      expect(value).toMatch(/^(?:[ -\[\]-~]|\\U\+[0-9A-F]{4})*$/)
    }
  })
})

describe('labels sit where the 2D plan draws them', () => {
  // The canvas centres each label on the room (text-anchor: middle). A TEXT
  // without a horizontal alignment starts at its point and runs to the right,
  // so in a narrow room the name crosses the wall into the next one.
  it('centres every text on its point', () => {
    const texts = textEntities(dxfOf(samplePlan()))

    expect(texts.length).toBeGreaterThan(0)
    for (const text of texts) {
      expect(text.find((p) => p.code === 72)?.value.trim()).toBe('1')
    }
  })

  it('repeats the point as the alignment point, the one a reader uses', () => {
    // With a non-left alignment a reader ignores 10/20 and places the text at
    // 11/21/31, so the two have to agree.
    for (const text of textEntities(dxfOf(samplePlan()))) {
      const at = (codes: readonly number[]): number[] =>
        codes.map((c) => Number(text.find((p) => p.code === c)?.value))

      expect(at([11, 21, 31])).toEqual(at([10, 20, 30]))
      expect(at([11, 21]).every(Number.isFinite)).toBe(true)
    }
  })
})

describe('what a bad plan does to the file', () => {
  it('cannot be broken by a room name carrying newlines', () => {
    // A value in a DXF is one line. A name straight from the plan file with a
    // newline in it would split into a bogus group code and corrupt everything
    // after it.
    const plan = samplePlan()
    plan.rooms[0]!.name = 'Kitchen\r\n0\r\nSECTION\r\ninjected'

    const dxf = dxfOf(plan)

    expect(() => pairs(dxf)).not.toThrow()
    expect(valuesOf(dxf, 1).some((t) => t.includes('injected'))).toBe(true)
    expect(valuesOf(dxf, 0).filter((v) => v === 'SECTION')).toHaveLength(
      valuesOf(dxfOf(samplePlan()), 0).filter((v) => v === 'SECTION').length
    )
  })

  it('still exports whatever is valid when part of the plan is not', () => {
    const plan = samplePlan()
    plan.walls.push({
      id: 'bad',
      start: [9, 9],
      end: [9, 9],
      thickness: 0.2,
      height: 2.5,
      kind: 'interior'
    })

    const dxf = dxfOf(plan)

    expect(() => pairs(dxf)).not.toThrow()
    expect(valuesOf(dxf, 1).some((t) => t.includes('Living room'))).toBe(true)
  })

  it('produces a valid, empty drawing for an empty plan', () => {
    const empty: FloorPlan = { version: '1', units: 'm', walls: [], rooms: [], openings: [] }
    const dxf = dxfOf(empty)

    expect(() => pairs(dxf)).not.toThrow()
    expect(valuesOf(dxf, 0)).toContain('EOF')
  })

  it('never throws, whatever the plan holds', () => {
    const plan = samplePlan()
    plan.rooms[0]!.boundary = ['nope']

    expect(() => dxfOf(plan)).not.toThrow()
  })
})

/** The ENTITIES section as one list of pairs per entity, keyed by its type. */
function entitiesOf(dxf: string): { type: string; layer: string; pairs: Pair[] }[] {
  const all = pairs(dxf)
  const start = all.findIndex((p) => p.code === 2 && p.value === 'ENTITIES')
  const out: { type: string; layer: string; pairs: Pair[] }[] = []
  for (let i = start + 1; i < all.length; i++) {
    const p = all[i]!
    if (p.code !== 0) {
      out[out.length - 1]?.pairs.push(p)
      continue
    }
    if (p.value === 'ENDSEC') break
    out.push({ type: p.value, layer: '', pairs: [] })
  }
  for (const e of out) e.layer = e.pairs.find((p) => p.code === 8)?.value ?? ''
  return out
}

const num = (e: { pairs: Pair[] }, code: number): number => Number(e.pairs.find((p) => p.code === code)!.value)

/** One wall from the origin at angle `theta`, with a 0.9 m door at offset 1.0 that states `handing`. */
function swingPlan(handing: Record<string, string>, theta = 0, type: 'door' | 'window' | 'opening' = 'door'): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: [
      { id: 'w1', start: [0, 0], end: [4 * Math.cos(theta), 4 * Math.sin(theta)], thickness: 0.2, height: 2.5, kind: 'interior' }
    ],
    rooms: [],
    openings: [
      { id: 'o1', wall: 'w1', type, offset: 1.0, width: 0.9, sill: type === 'window' ? 0.9 : 0, height: 1.2, ...handing } as FloorPlan['openings'][number]
    ]
  }
}

describe('door swings (door-swing-export)', () => {
  it('lists the door-swing layer in the layer table', () => {
    expect(DXF_LAYERS.doorSwings).toBe('GRID-DOOR-SWINGS')
    expect(valuesOf(dxfOf(samplePlan()), 2)).toContain('GRID-DOOR-SWINGS')
  })

  it('draws the open leaf and a quarter arc for a door hung from its start jamb opening left', () => {
    const swing = entitiesOf(dxfOf(swingPlan({ hinge: 'start', swing: 'left' }))).filter(
      (e) => e.layer === DXF_LAYERS.doorSwings
    )
    expect(swing.map((e) => e.type)).toEqual(['LINE', 'ARC'])
    const [leaf, arc] = swing as [(typeof swing)[number], (typeof swing)[number]]

    expect([num(leaf, 10), num(leaf, 20), num(leaf, 11), num(leaf, 21)]).toEqual([1, 0, 1, 0.9])
    expect([num(arc, 10), num(arc, 20), num(arc, 40), num(arc, 50), num(arc, 51)]).toEqual([1, 0, 0.9, 0, 90])
  })

  it('still marks the opening line across the gap', () => {
    const lines = entitiesOf(dxfOf(swingPlan({ hinge: 'start', swing: 'left' }))).filter(
      (e) => e.layer === DXF_LAYERS.openings
    )
    expect(lines).toHaveLength(1)
  })

  it.each([
    ['a door that states only its hinge', swingPlan({ hinge: 'start' })],
    ['a door that states only its swing', swingPlan({ swing: 'left' })],
    ['a window that states both', swingPlan({ hinge: 'start', swing: 'left' }, 0, 'window')],
    ['a doorless opening that states both', swingPlan({ hinge: 'end', swing: 'right' }, 0, 'opening')]
  ])('exports %s exactly as before', (_label, plan) => {
    const stripped: FloorPlan = {
      ...plan,
      openings: plan.openings.map((o) => {
        const rest = { ...o }
        delete rest.hinge
        delete rest.swing
        return rest
      })
    }
    const dxf = dxfOf(plan)
    expect(entitiesOf(dxf).some((e) => e.layer === DXF_LAYERS.doorSwings)).toBe(false)
    expect(dxf).toBe(dxfOf(stripped))
  })

  // A mirrored basis passes every value test on an axis-aligned wall and still draws the
  // door into the wrong room, so the side is checked against the wall normal at many angles.
  const angles = [0, 37, 90, 180, 233, 300]
  const cases = angles.flatMap((deg) =>
    (['start', 'end'] as const).flatMap((hinge) => (['left', 'right'] as const).map((side) => [deg, hinge, side] as const))
  )
  it.each(cases)('at %d°, hinge %s, swing %s: the arc and the leaf are on the face the swing names', (deg, hinge, side) => {
    const theta = (deg * Math.PI) / 180
    const swing = entitiesOf(dxfOf(swingPlan({ hinge, swing: side }, theta))).filter(
      (e) => e.layer === DXF_LAYERS.doorSwings
    )
    const leaf = swing.find((e) => e.type === 'LINE')!
    const arc = swing.find((e) => e.type === 'ARC')!
    const normal = { x: -Math.sin(theta), y: Math.cos(theta) }
    const facing = side === 'left' ? 1 : -1

    const sweep = (((num(arc, 51) - num(arc, 50)) % 360) + 360) % 360
    expect(sweep).toBeCloseTo(90, 6)
    expect(num(arc, 40)).toBeCloseTo(0.9, 6)

    const mid = ((num(arc, 50) + 45) * Math.PI) / 180
    const midDir = { x: Math.cos(mid), y: Math.sin(mid) }
    expect(Math.sign(midDir.x * normal.x + midDir.y * normal.y)).toBe(facing)

    const tip = { x: num(leaf, 11) - num(leaf, 10), y: num(leaf, 21) - num(leaf, 20) }
    expect(Math.sign(tip.x * normal.x + tip.y * normal.y)).toBe(facing)
    // The leaf starts at the hinge jamb, which is the arc's centre.
    expect(num(leaf, 10)).toBeCloseTo(num(arc, 10), 6)
    expect(num(leaf, 20)).toBeCloseTo(num(arc, 20), 6)
    const hingeAt = hinge === 'start' ? 1.0 : 1.9
    expect(num(arc, 10)).toBeCloseTo(hingeAt * Math.cos(theta), 6)
    expect(num(arc, 20)).toBeCloseTo(hingeAt * Math.sin(theta), 6)
  })
})

/** ARE-2: an 8 × 4 room split at x = 4 by a dividing line that states no thickness or height. */
function openPlan(): FloorPlan {
  const solid = (id: string, start: [number, number], end: [number, number]) => ({ id, start, end, thickness: 0.2, kind: 'exterior' })
  return parseFloorPlan({
    walls: [
      solid('s1', [0, 0], [4, 0]),
      solid('s2', [4, 0], [8, 0]),
      solid('e', [8, 0], [8, 4]),
      solid('n2', [8, 4], [4, 4]),
      solid('n1', [4, 4], [0, 4]),
      solid('w', [0, 4], [0, 0]),
      { id: 'line', start: [4, 0], end: [4, 4], virtual: true }
    ],
    rooms: [
      { id: 'kitchen', name: 'Kitchen', boundary: ['s1', 'line', 'n1', 'w'] },
      { id: 'living', name: 'Living', boundary: ['s2', 'e', 'n2', 'line'] }
    ]
  })
}

describe('a dividing line (ARE-2)', () => {
  const dxf = dxfOf(openPlan())
  const all = pairs(dxf)
  const tables = all.slice(
    all.findIndex((p) => p.code === 2 && p.value === 'TABLES'),
    all.findIndex((p, i) => i > 0 && p.code === 0 && p.value === 'ENDSEC' && all.slice(0, i).some((q) => q.value === 'TABLES'))
  )

  it('is one dashed line on its own layer, over the two room outlines that meet on it', () => {
    const entities = entitiesOf(dxf)
    const line = entities.filter((e) => e.layer === DXF_LAYERS.wallVirtual)
    const rooms = entities.filter((e) => e.layer === DXF_LAYERS.rooms)
    const vertices = (start: number): string[] => {
      const out: string[] = []
      for (let i = start + 1; i < entities.length && entities[i]!.type === 'VERTEX'; i++) {
        out.push(`${num(entities[i]!, 10)},${num(entities[i]!, 20)}`)
      }
      return out
    }
    expect({
      line: line.map((e) => ({ type: e.type, from: [num(e, 10), num(e, 20)], to: [num(e, 11), num(e, 21)] })),
      rooms: rooms.filter((e) => e.type === 'POLYLINE').map((e) => vertices(entities.indexOf(e))),
      tables: tables.map((p) => `${p.code} ${p.value}`)
    }).toMatchSnapshot()
  })

  it('declares the dashed line type before the layer that uses it', () => {
    const ltype = tables.findIndex((p) => p.code === 2 && p.value === 'DASHED')
    const layer = tables.findIndex((p) => p.code === 2 && p.value === DXF_LAYERS.wallVirtual)
    expect(ltype).toBeGreaterThan(-1)
    expect(layer).toBeGreaterThan(ltype)
    expect(tables[layer + 3]).toEqual({ code: 6, value: 'DASHED' })
  })

  it('declares every line type a layer names', () => {
    const declared = new Set<string>()
    const named = new Set<string>()
    for (let i = 0; i < tables.length; i++) {
      if (tables[i]!.code === 0 && tables[i]!.value === 'LTYPE') declared.add(tables[i + 1]!.value)
      if (tables[i]!.code === 6) named.add(tables[i]!.value)
    }
    expect([...named].sort()).toEqual(['CONTINUOUS', 'DASHED'])
    for (const type of named) expect(declared).toContain(type)
  })

  it('keeps solid walls and their outlines on continuous layers', () => {
    const layerType = (name: string): string | undefined => tables[tables.findIndex((p) => p.code === 2 && p.value === name) + 3]?.value
    expect(layerType(DXF_LAYERS.wallExterior)).toBe('CONTINUOUS')
    expect(layerType(DXF_LAYERS.rooms)).toBe('CONTINUOUS')
  })
})
