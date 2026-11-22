/**
 * CNT-3: north, front and where the building is. The plan states its north, which way its y
 * runs, its front and its site; the drawing, the IFC file and the answer to "which rooms face
 * east" read them, and a plan that states none reads as before.
 */
import { describe, expect, it } from 'vitest'
import { FloorPlanSchema, parseFloorPlan } from '../../types/floorplan'
import type { FloorPlan } from '../plan'
import { bearingOf, compassPoint, directionOfTurn, planFacing, planOrientation, wrapDegrees } from '../orientation'
import { buildFloorPlan } from '../floorplan'
import { planForFloor } from '../floors'
import { toIfc } from '../export/ifc'

/**
 * A 6 × 4 m house of two rooms: the living room to the west, the kitchen to the east, a window
 * in each room's outside wall and a front door in the living room's south wall.
 */
function house(extra: Record<string, unknown> = {}): FloorPlan {
  const wall = (id: string, start: number[], end: number[]) => ({ id, start, end, thickness: 0.2, height: 2.7 })
  return parseFloorPlan({
    walls: [
      wall('s1', [0, 0], [3, 0]),
      wall('s2', [3, 0], [6, 0]),
      wall('e', [6, 0], [6, 4]),
      wall('n2', [6, 4], [3, 4]),
      wall('n1', [3, 4], [0, 4]),
      wall('w', [0, 4], [0, 0]),
      wall('mid', [3, 0], [3, 4]),
    ],
    rooms: [
      { id: 'living', name: 'Living', boundary: ['s1', 'mid', 'n1', 'w'] },
      { id: 'kitchen', name: 'Kitchen', boundary: ['s2', 'e', 'n2', 'mid'] },
    ],
    openings: [
      { id: 'entry', wall: 's1', type: 'door', offset: 1, width: 0.9, height: 2.1 },
      { id: 'kw', wall: 'e', type: 'window', offset: 1.5, width: 1.2, sill: 0.9, height: 1.2 },
      { id: 'lw', wall: 'n1', type: 'window', offset: 1, width: 1.2, sill: 0.9, height: 1.2 },
      { id: 'between', wall: 'mid', type: 'door', offset: 1.5, width: 0.8, height: 2.1 },
    ],
    ...extra,
  })
}

const ways = (plan: FloorPlan, room: string): string[] => planFacing(plan).rooms.find((r) => r.room === room)!.walls.map((w) => w.faces)

describe('the plan format', () => {
  it('reads a plan that states none of the four as before: no key is added', () => {
    const plan = house()
    for (const key of ['north', 'yAxis', 'front', 'site']) expect(Object.hasOwn(plan, key), key).toBe(false)
    expect(planOrientation(plan)).toEqual({ north: null, yAxis: 'up', yAxisStated: false })
  })

  it('reads north, the y direction, the front and the site', () => {
    const plan = house({ north: -30, yAxis: 'down', front: { opening: 'entry' }, site: { origin: [1, 2], latitude: 40.5, longitude: -3.25, elevation: 650 } })
    expect(plan.north).toBe(-30)
    expect(planOrientation(plan)).toEqual({ north: 330, yAxis: 'down', yAxisStated: true })
    expect(plan.front).toEqual({ opening: 'entry' })
    expect(plan.site).toEqual({ origin: [1, 2], latitude: 40.5, longitude: -3.25, elevation: 650 })
  })

  it('refuses a front that names no part or two, a latitude with no longitude, and a y that runs sideways', () => {
    const fails = (extra: Record<string, unknown>): boolean => !FloorPlanSchema.safeParse({ walls: [], rooms: [], openings: [], ...extra }).success
    expect(fails({ front: {} })).toBe(true)
    expect(fails({ front: { wall: 's1', opening: 'entry' } })).toBe(true)
    expect(fails({ site: { origin: [0, 0], latitude: 40 } })).toBe(true)
    // A site with no origin reads, with what Grid does not hold named (lab G/s01b): it places nothing.
    expect(fails({ site: { latitude: 40, longitude: 3 } })).toBe(false)
    // BRF-3: the plot's boundary is read now; one of two corners is no plot, and is refused.
    expect(fails({ site: { boundary: [[0, 0], [15, 0], [15, 30], [0, 30]], street: 'south' } })).toBe(false)
    expect(fails({ site: { boundary: [[0, 0], [15, 0]] } })).toBe(true)
    expect(fails({ site: { origin: [0, 0], latitude: 91, longitude: 3 } })).toBe(true)
    expect(fails({ yAxis: 'left' })).toBe(true)
    expect(fails({ north: Number.POSITIVE_INFINITY })).toBe(true)
    expect(fails({ front: { wall: 's1' }, site: { origin: [0, 0] }, yAxis: 'up', north: 0 })).toBe(false)
  })
})

describe('a direction on the plan as a bearing', () => {
  const up = planOrientation({ north: 0 })
  it('reads +x as east and +y as north when north is up the drawing', () => {
    expect(bearingOf({ x: 1, y: 0 }, up)).toBe(90)
    expect(bearingOf({ x: 0, y: 1 }, up)).toBe(0)
    expect(bearingOf({ x: 0, y: -1 }, up)).toBe(180)
    expect(bearingOf({ x: -1, y: 0 }, up)).toBe(270)
  })

  it('turns with the stated north: north to the left of the drawing makes +x south', () => {
    const left = planOrientation({ north: 90 })
    expect(bearingOf({ x: 1, y: 0 }, left)).toBe(180)
    expect(bearingOf({ x: -1, y: 0 }, left)).toBe(0)
    expect(bearingOf({ x: 0, y: -1 }, left)).toBe(270)
  })

  it('reads a plan whose y runs down as the mirror image: +x is west when +y is north', () => {
    const down = planOrientation({ north: 0, yAxis: 'down' })
    expect(bearingOf({ x: 1, y: 0 }, down)).toBe(270)
    expect(bearingOf({ x: 0, y: 1 }, down)).toBe(0)
  })

  it('gives no bearing for a plan that states no north, unless told the north to take', () => {
    const none = planOrientation({})
    expect(bearingOf({ x: 1, y: 0 }, none)).toBeNull()
    expect(bearingOf({ x: 1, y: 0 }, none, 0)).toBe(90)
  })

  it('names the nearest of eight points, and turns exactly at each quarter', () => {
    expect([0, 22, 23, 90, 157, 200, 292.5, 340, 359].map(compassPoint)).toEqual(['north', 'north', 'north-east', 'east', 'south-east', 'south', 'north-west', 'north', 'north'])
    expect(directionOfTurn(90)).toEqual({ x: -1, y: 0 })
    expect(directionOfTurn(-90)).toEqual({ x: 1, y: 0 })
    expect(directionOfTurn(540)).toEqual({ x: 0, y: -1 })
    expect(wrapDegrees(-0)).toBe(0)
    expect(Object.is(wrapDegrees(-360), 0)).toBe(true)
  })
})

describe('which way the rooms face', () => {
  it('answers which rooms face east from each outside wall, with north up the drawing', () => {
    const facing = planFacing(house({ north: 0 }))
    expect(facing.northStated).toBe(true)
    expect(ways(house({ north: 0 }), 'kitchen')).toEqual(['east', 'north', 'south'])
    expect(ways(house({ north: 0 }), 'living')).toEqual(['west', 'north', 'south'])
    const east = facing.rooms.filter((r) => r.walls.some((w) => w.faces === 'east')).map((r) => r.room)
    expect(east).toEqual(['kitchen'])
    // The wall between the two rooms faces nowhere.
    expect(facing.walls.some((w) => w.wall === 'mid')).toBe(false)
  })

  it('gives each opening in an outside wall the way its wall faces, and none to a door between rooms', () => {
    const facing = planFacing(house({ north: 0 }))
    expect(facing.openings.map((o) => [o.opening, o.faces, o.rooms])).toEqual([
      ['entry', 'south', ['living']],
      ['kw', 'east', ['kitchen']],
      ['lw', 'north', ['living']],
    ])
    expect(facing.rooms.find((r) => r.room === 'kitchen')!.windows).toEqual(['east'])
  })

  it('turns every way with the stated north, and the front with them', () => {
    const plan = house({ north: 90, front: { opening: 'entry' } })
    expect(ways(plan, 'kitchen')).toEqual(['south', 'east', 'west'])
    expect(planFacing(plan).front).toMatchObject({ part: 'opening', id: 'entry', wall: 's1', faces: 'west', bearing: 270 })
  })

  it('takes the top of the drawing as north when the plan states none, and says so', () => {
    const facing = planFacing(house())
    expect(facing.northStated).toBe(false)
    expect(facing.northUsed).toBe(0)
    expect(ways(house(), 'kitchen')).toEqual(['east', 'north', 'south'])
    // With y down and no north, the top of the page it was drawn on is -y.
    const down = planFacing(house({ yAxis: 'down' }))
    expect(down.northUsed).toBe(180)
    // The kitchen's +y wall is at the foot of that page: it faces south.
    expect(down.walls.filter((w) => w.wall === 'n2' || w.wall === 'e').map((w) => [w.wall, w.faces])).toEqual([['e', 'east'], ['n2', 'south']])
  })

  it('reads a mirrored drawing the right way round: the same building drawn with y down faces the same ways', () => {
    // The house drawn as a screen holds it: every y negated, so its y runs down, and north
    // (up the true page) is -y on the file, a half turn.
    const asBuilt = house({ north: 30 })
    const flipped = parseFloorPlan({
      ...asBuilt,
      walls: asBuilt.walls.map((w) => ({ ...w, start: [w.start[0], -w.start[1]], end: [w.end[0], -w.end[1]] })),
      rooms: asBuilt.rooms.map((r) => ({ ...r, boundary: [...r.boundary].reverse() })),
      north: 150,
      yAxis: 'down',
    })
    for (const room of ['living', 'kitchen']) expect(ways(flipped, room).sort()).toEqual(ways(asBuilt, room).sort())
  })

  it('says why the front cannot be said', () => {
    expect(planFacing(house({ front: { wall: 'mid' } })).front).toEqual({ part: 'wall', id: 'mid', wall: 'mid', missing: 'not-outside' })
    expect(planFacing(house({ front: { wall: 'gone' } })).front).toEqual({ part: 'wall', id: 'gone', wall: null, missing: 'no-such-part' })
    expect(planFacing(house({ front: { opening: 'between' } })).front).toMatchObject({ missing: 'not-outside' })
    expect(planFacing(house({ front: { wall: 'e' } })).front).toMatchObject({ faces: 'east' })
  })
})

describe('the drawing', () => {
  it('carries the stated north for the arrow, and nothing for a plan that states none', () => {
    expect(buildFloorPlan(house()).north).toBeNull()
    expect(buildFloorPlan(house({ north: 90 })).north).toEqual({ turn: Math.PI / 2 })
    expect(buildFloorPlan(planForFloor(house({ north: 90 }), 'ground')).north).toEqual({ turn: Math.PI / 2 })
  })

  it('points an unturned north symbol to the stated north, and draws no second arrow beside it', () => {
    const symbol = { id: 'n', kind: 'symbol', symbol: 'north', at: [8, 5] }
    const drawing = buildFloorPlan(house({ north: 45, annotations: [symbol, { ...symbol, id: 'turned', turn: 10 }] }))
    expect(drawing.north).toBeNull()
    const [unturned, turned] = drawing.notes.map((n) => n.turn)
    expect(unturned).toBeCloseTo(Math.PI / 4, 12)
    expect(turned).toBeCloseTo(Math.PI / 18, 12)
    expect(buildFloorPlan(house({ annotations: [symbol] })).notes[0]!.turn).toBe(0)
  })
})

describe('the IFC file', () => {
  const context = (ifc: string): string => ifc.split('\n').find((line) => line.includes('IFCGEOMETRICREPRESENTATIONCONTEXT('))!
  const entity = (ifc: string, id: string): string => ifc.split('\n').find((line) => line.startsWith(`${id}=`))!

  it('states no north for a plan that states none (lab EL-14)', () => {
    const ifc = toIfc(house())
    expect(context(ifc)).toMatch(/,\$\);$/)
    expect(ifc).not.toContain('IFCDIRECTION((0.,1.))')
  })

  it('states the plan\'s north as a direction in its x and y', () => {
    for (const [north, written] of [[0, '(0.,1.)'], [90, '(-1.,0.)'], [-90, '(1.,0.)'], [30, '(-0.5,0.8660254038)']] as const) {
      const ifc = toIfc(house({ north }))
      const ref = /,(#\d+)\);$/.exec(context(ifc))![1]!
      expect(entity(ifc, ref), String(north)).toBe(`${ref}=IFCDIRECTION(${written});`)
    }
  })

  it('puts the site on its origin, with its latitude, longitude and elevation, and keeps the building where it was', () => {
    const plain = toIfc(house())
    const placed = toIfc(house({ site: { origin: [2, 3], latitude: 40.5, longitude: -3.25, elevation: 650 } }))
    const site = placed.split('\n').find((line) => line.includes('IFCSITE('))!
    expect(site).toContain(",.ELEMENT.,(40,30,0,0),(-3,-15,0,0),650.,$,$);")
    expect(plain.split('\n').find((line) => line.includes('IFCSITE('))).toContain('.ELEMENT.,$,$,$,$,$);')
    // The site's point and the building's, against it, cancel out.
    const points = (ifc: string): string[] => ifc.split('\n').filter((line) => line.includes('IFCCARTESIANPOINT((2.,3.,0.))') || line.includes('IFCCARTESIANPOINT((-2.,-3.,0.))'))
    expect(points(placed)).toHaveLength(2)
    expect(points(plain)).toHaveLength(0)
    // With no origin, nothing is placed on the earth.
    expect(toIfc(house({ site: { latitude: 40.5, longitude: -3.25 } }))).toBe(plain)
  })
})
