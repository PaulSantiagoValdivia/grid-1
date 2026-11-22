/**
 * CNT-18: a curved wall. A round room drawn as one arc wall measures within 0.1% of its hand
 * area, and a 0.9 m door fits on it; a half-round bay, a stair tower and a dividing line on a
 * curve are one wall each, with the right area.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan, Opening, Wall } from '../plan'
import { indexPlan } from '../plan'
import { validatePlan } from '../validate'
import { buildFloorPlan } from '../floorplan'
import { buildScene, elevationArea } from '../scene3d'
import { roomArea } from '../room'
import { planAreaFigures } from '../areas'
import { wallLength, wallPointAt, wallSegments, wallSlicePolygon } from '../wall'
import { curveFault, wallCurve } from '../arc'
import { area, distance } from '../vec2'
import { parseFloorPlan } from '../../types/floorplan'
import { wallJoints } from '../joints'
import { wallExposure } from '../exposure'
import { floorSpaces, spacesKnown } from '../spaces'
import { wallFaults } from '../wallFaults'
import { wallRevision } from '../revision'
import { diffPlans } from '../diff'
import { planFacing } from '../orientation'
import { doorSwing } from '../door'
import { validateDoorSweeps } from '../sweep'
import { exportPlan } from '../../export/planExport'
import { parseGlb } from '../export/__tests__/glb-reader'
import { readRoomsText } from '../../rooms/read'
import { compileRoomsText } from '../../rooms/compile'
import { readPlanParts } from '../../types/readParts'
import { planEnvelope } from '../envelope'

type Tuple = [number, number]

function wall(id: string, start: Tuple, end: Tuple, extra: Partial<Wall> = {}): Wall {
  return { id, start, end, thickness: 0.2, height: 2.7, kind: 'exterior', ...extra }
}

function door(id: string, wallId: string, offset: number, extra: Partial<Opening> = {}): Opening {
  return { id, wall: wallId, type: 'door', offset, width: 0.9, sill: 0, height: 2.1, ...extra }
}

/** A round room: one wall, a whole circle of radius 3 m on its axis round (5, 5), 0.2 m thick. */
export function roundRoom(openings: Opening[] = [door('d1', 'round', 2)]): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: [wall('round', [8, 5], [8, 5], { arc: { centre: [5, 5], sweep: 360 } })],
    rooms: [{ id: 'drum', name: 'Drum', boundary: ['round'] }],
    openings
  }
}

/** A 4 × 3 m room whose north side is a half-round bay of radius 2 m on its axis. */
function bayRoom(): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: [
      wall('s', [0, 0], [4, 0]),
      wall('e', [4, 0], [4, 3]),
      wall('bay', [4, 3], [0, 3], { arc: { centre: [2, 3], sweep: 180 } }),
      wall('w', [0, 3], [0, 0])
    ],
    rooms: [{ id: 'living', name: 'Living', boundary: ['s', 'e', 'bay', 'w'] }],
    openings: [door('d1', 's', 1.5), { id: 'win', wall: 'bay', type: 'window', offset: 2.5, width: 1.2, sill: 0.9, height: 1.2 }]
  }
}

const HAND_ROUND = Math.PI * 2.9 * 2.9

describe('a curved wall in the plan file (C9)', () => {
  it('reads an arc and keeps it', () => {
    const plan = parseFloorPlan(roundRoom())
    expect(plan.walls[0]!.arc).toEqual({ centre: [5, 5], sweep: 360 })
  })

  it('reads an arc it cannot read as not stated, and says so: the wall is straight', () => {
    // The lab's agents wrote a radius alone (scenario s05b): no centre, no sweep.
    const raw = { ...bayRoom(), walls: bayRoom().walls.map((w) => (w.id === 'bay' ? { ...w, arc: { radius: 3 } } : w)) }
    const read = readPlanParts(raw)
    if (read.plan === null) throw new Error('the plan was refused')
    expect(read.plan.walls.find((w) => w.id === 'bay')!.arc).toBeUndefined()
    expect(read.faults).toContainEqual(expect.objectContaining({ kind: 'value-left-out', part: expect.objectContaining({ list: 'walls', id: 'bay' }) }))
  })

  it('refuses a sweep of nothing or more than a whole turn', () => {
    for (const sweep of [0, 361, -400]) {
      expect(() => parseFloorPlan({ ...roundRoom(), walls: [wall('round', [8, 5], [8, 5], { arc: { centre: [5, 5], sweep } })] })).toThrow()
    }
  })

  it('works out the arc the plan states', () => {
    const curve = wallCurve(roundRoom().walls[0]!)!
    expect(curve.closed).toBe(true)
    expect(curve.radius).toBeCloseTo(3, 12)
    expect(curve.length).toBeCloseTo(6 * Math.PI, 12)
    expect(wallLength(bayRoom().walls[2]!)).toBeCloseTo(2 * Math.PI, 12)
    // Half way round the bay, counter-clockwise from (4, 3): the top of the bay.
    const top = wallPointAt(bayRoom().walls[2]!, Math.PI)
    expect(top.x).toBeCloseTo(2, 12)
    expect(top.y).toBeCloseTo(5, 12)
  })

  it('follows the curve by straight pieces no further than a millimetre off it', () => {
    const w = roundRoom().walls[0]!
    const segments = wallSegments(w)
    expect(segments.length).toBeGreaterThanOrEqual(200)
    for (const segment of segments) {
      const middle = { x: (segment.start.x + segment.end.x) / 2, y: (segment.start.y + segment.end.y) / 2 }
      expect(3 - distance(middle, { x: 5, y: 5 })).toBeLessThanOrEqual(0.001)
    }
  })
})

describe('a round room drawn as one arc wall', () => {
  it('measures within 0.1% of its hand area', () => {
    const plan = roundRoom()
    const measured = roomArea(plan.rooms[0]!, indexPlan(plan))
    const error = Math.abs(measured - HAND_ROUND) / HAND_ROUND
    expect(error).toBeLessThan(0.001)
    // Far within: the pieces are fine enough for a few hundredths of a percent.
    expect(error).toBeLessThan(0.0003)
  })

  it('takes a 0.9 m door with no fault, and draws it straight across its hole', () => {
    const plan = roundRoom()
    const { issues, broken } = validatePlan(plan)
    expect(broken.size).toBe(0)
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
    const drawing = buildFloorPlan(plan)
    expect(drawing.rooms).toHaveLength(1)
    expect(drawing.rooms[0]!.area).toBeCloseTo(roomArea(plan.rooms[0]!, indexPlan(plan)), 9)
    const [opening] = drawing.openings
    // The hole is the chord between the door's edges on the curve: a little under 0.9 m.
    const chord = 2 * 3 * Math.sin(0.9 / 6)
    expect(distance(opening!.from, opening!.to)).toBeCloseTo(chord, 9)
    expect(chord).toBeGreaterThan(0.896)
    // Both edges lie on the curve.
    for (const p of [opening!.from, opening!.to]) expect(distance(p, { x: 5, y: 5 })).toBeCloseTo(3, 9)
  })

  it('draws the wall as one solid run round the circle, open at the door', () => {
    const drawing = buildFloorPlan(roundRoom())
    const [w] = drawing.walls
    expect(w!.slices).toHaveLength(1)
    expect(w!.curve).toBeDefined()
    // Wall area: the ring less the door's stretch, give or take the pieces.
    const ring = Math.PI * (3.1 * 3.1 - 2.9 * 2.9)
    const doorway = 0.9 * 0.2
    expect(area(w!.slices[0]!)).toBeCloseTo(ring - doorway, 2)
  })

  it('raises it in 3D as straight pieces, with a lintel over the door', () => {
    const scene = buildScene(roundRoom())
    const [w] = scene.walls
    expect(w!.pieces!.length).toBeGreaterThan(200)
    const lintels = w!.pieces!.filter((piece) => piece.elevation.outline[0]!.y > 0)
    expect(lintels).toHaveLength(1)
    // Unrolled, the wall's elevation keeps its door.
    expect(elevationArea(w!.elevation)).toBeCloseTo(6 * Math.PI * 2.7 - 0.9 * 2.1, 9)
  })

  it('gives the floor its area', () => {
    const figures = planAreaFigures(roundRoom())
    expect(figures.floors[0]!.net).toBeCloseTo(roomArea(roundRoom().rooms[0]!, indexPlan(roundRoom())), 9)
  })
})

describe('a half-round bay', () => {
  it('measures the rectangle and the half disc', () => {
    const plan = bayRoom()
    const { issues } = validatePlan(plan)
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
    // Inside faces: 3.8 wide, from 0.1 to 3 high, and the half disc of radius 1.9 on top.
    const hand = 3.8 * 2.9 + (Math.PI * 1.9 * 1.9) / 2
    const measured = roomArea(plan.rooms[0]!, indexPlan(plan))
    expect(Math.abs(measured - hand) / hand).toBeLessThan(0.001)
  })

  it('draws the window on the curve', () => {
    const drawing = buildFloorPlan(bayRoom())
    const win = drawing.openings.find((o) => o.id === 'win')!
    for (const p of [win.from, win.to]) expect(distance(p, { x: 2, y: 3 })).toBeCloseTo(2, 9)
    const bay = drawing.walls.find((w) => w.id === 'bay')!
    expect(bay.slices).toHaveLength(2)
    expect(wallSlicePolygon(bayRoom().walls[2]!, 0, 1).length).toBeGreaterThan(4)
  })
})

describe('a curve that cannot be built', () => {
  it('names an end that is not where the sweep takes the start', () => {
    const w = wall('bad', [4, 3], [0, 3.5], { arc: { centre: [2, 3], sweep: 180 } })
    expect(curveFault(w)?.code).toBe('wall/arc-ends-apart')
    const { issues, broken } = validatePlan({ ...bayRoom(), walls: [...bayRoom().walls.filter((x) => x.id !== 'bay'), { ...w, id: 'bay' }] })
    expect(broken.has('bay')).toBe(true)
    expect(issues.find((i) => i.id === 'bay')?.code).toBe('wall/arc-ends-apart')
  })

  it('names a radius no more than half the thickness', () => {
    const w = wall('tight', [0.05, 0], [0.05, 0], { arc: { centre: [0, 0], sweep: 360 } })
    expect(curveFault(w)?.code).toBe('wall/arc-too-tight')
  })
})

describe('the curve in the rest of the geometry', () => {
  it('joins a curved wall to the walls at its ends along its tangent there', () => {
    // The bay leaves each side wall in line with it: their ends meet square, flush.
    expect(wallJoints(bayRoom().walls).has('bay')).toBe(false)
    // So does a quarter circle that carries a wall on round a bend.
    const bend = [wall('a', [0, 0], [4, 0]), wall('q', [4, 0], [6, 2], { arc: { centre: [4, 2], sweep: 90 } })]
    expect(wallJoints(bend).has('q')).toBe(false)
    // One leaving a wall at a right angle is mitred to it, as any corner is.
    const square = [wall('a', [0, 0], [4, 0]), wall('q', [4, 0], [2, 2], { arc: { centre: [2, 0], sweep: 90 } })]
    const turned = wallJoints(square).get('q')!
    expect(Math.abs(turned.start.left)).toBeCloseTo(0.1, 9)
    expect(Math.abs(turned.start.right)).toBeCloseTo(0.1, 9)
  })

  it('reads the curved wall as an outside wall all round, and the floor as one space', () => {
    const plan = roundRoom()
    const index = indexPlan(plan)
    expect(wallExposure(index, 'round')).toBe('exterior')
    const spaces = floorSpaces(plan, 'ground', { index })
    expect(spacesKnown(spaces)).toBe(true)
    if (!spacesKnown(spaces)) return
    expect(spaces.spaces).toHaveLength(1)
    expect(spaces.unclaimedArea).toBeLessThan(0.01)
    expect(spaces.mismatches).toEqual([])
  })

  it('gives the gross areas of a round building', () => {
    const figures = planAreaFigures(roundRoom())
    const floor = figures.floors[0]!
    // Outside the walls: a disc of 3.1 m, give or take the pieces and the doorway.
    expect(floor.grossExternal!).toBeGreaterThan(Math.PI * 3.1 * 3.1 * 0.998)
    expect(floor.grossExternal!).toBeLessThan(Math.PI * 3.1 * 3.1 * 1.002)
    expect(floor.grossInternal!).toBeCloseTo(floor.net, 1)
  })

  it('finds no wall fault on a curved wall, and offers no fix that moves one', () => {
    expect(wallFaults(roundRoom())).toEqual([])
    expect(wallFaults(bayRoom()).flatMap((fault) => fault.walls)).not.toContain('bay')
  })

  it('names a curve that changes, in the revision and in the comparison of two plans', () => {
    const plan = bayRoom()
    const deeper = { ...plan, walls: plan.walls.map((w) => (w.id === 'bay' ? { ...w, arc: { centre: [2, 3] as [number, number], sweep: -180 } } : w)) }
    expect(wallRevision(plan.walls[2]!)).not.toBe(wallRevision(deeper.walls[2]!))
    const diff = diffPlans(plan, deeper)
    const change = diff.changes.find((c) => c.entity.id === 'bay')!
    expect(change.props.map((p) => p.key)).toContain('arc')
    expect(change.summary).toContain('curve changed')
  })

  it('faces a round wall every way, room by room, the length of each compass point', () => {
    const facing = planFacing(roundRoom())
    const ways = new Set(facing.walls.filter((w) => w.wall === 'round').map((w) => w.faces))
    expect(ways.size).toBe(8)
    const room = facing.rooms.find((r) => r.room === 'drum')!
    const total = room.walls.reduce((sum, w) => sum + w.length, 0)
    // The whole curve less the doorway, which is no wall.
    expect(total).toBeGreaterThan(6 * Math.PI - 1)
  })

  it('swings a door from its straight edge, and finds nothing in its way', () => {
    const drawing = buildFloorPlan(roundRoom())
    const opening = drawing.openings[0]!
    const swing = doorSwing(opening, 'start', 'left')!
    expect(swing.arc.radius).toBeCloseTo(2 * 3 * Math.sin(0.15), 9)
    // Left of a counter-clockwise curve is its inside: the door opens into the room.
    expect(distance(swing.leaf[1], { x: 5, y: 5 })).toBeLessThan(3)
    const plan = roundRoom([door('d1', 'round', 2, { hinge: 'start', swing: 'left' })])
    expect(validateDoorSweeps(plan, (o) => o).filter((i) => i.code === 'opening/door-blocked')).toEqual([])
  })

  it('takes a curve that runs clockwise, and a curved dividing line', () => {
    const clockwise: FloorPlan = { ...bayRoom(), walls: bayRoom().walls.map((w) => (w.id === 'bay' ? { ...w, start: [0, 3], end: [4, 3], arc: { centre: [2, 3], sweep: -180 } } : w)) }
    const hand = 3.8 * 2.9 + (Math.PI * 1.9 * 1.9) / 2
    expect(Math.abs(roomArea(clockwise.rooms[0]!, indexPlan(clockwise)) - hand) / hand).toBeLessThan(0.001)
    const line: FloorPlan = { ...bayRoom(), walls: bayRoom().walls.map((w) => (w.id === 'bay' ? { ...w, virtual: true, thickness: 0, height: 0 } : w)), openings: [door('d1', 's', 1.5)] }
    const { broken } = validatePlan(line)
    expect(broken.size).toBe(0)
    const drawn = buildFloorPlan(line).walls.find((w) => w.id === 'bay')!
    expect(drawn.slices).toEqual([])
    expect(drawn.curve!.path.length).toBeGreaterThan(100)
    // Measured to the line itself: the half disc of radius 2 over 3.8 × 2.9.
    const toLine = 3.8 * 2.9 + (Math.PI * 2 * 2) / 2
    expect(Math.abs(roomArea(line.rooms[0]!, indexPlan(line)) - toLine) / toLine).toBeLessThan(0.002)
  })

  it('refuses an opening that runs past the end of the curve', () => {
    const plan = bayRoom()
    plan.openings.push({ id: 'far', wall: 'bay', type: 'window', offset: 5.9, width: 1, sill: 0.9, height: 1.2 })
    expect(validatePlan(plan).issues.find((i) => i.id === 'far')?.code).toBe('opening/out-of-wall')
  })
})

describe('exporting a curved wall', () => {
  const options = { projectId: 'p', projectName: 'Drum', now: new Date(0) }

  it('writes the DXF wall faces as arcs, names only the rooms along it as pieces', () => {
    const made = exportPlan(roundRoom(), 'dxf', options)
    expect(made.approximated).toEqual([{ kind: 'room', id: 'drum', floor: 'ground' }])
    const dxf = made.data as string
    // A bulge on a vertex: the stretch to the next one is an arc.
    const bulges = dxf.split('\n').filter((line, i, lines) => lines[i - 1]?.trim() === '42')
    expect(bulges.length).toBeGreaterThanOrEqual(2)
    expect(dxf).toContain('Rooms along a curved wall, their outlines written as straight pieces (1): "drum"')
    expect(dxf).toContain('GRID-LEFT-OUT')
  })

  it('writes a whole circle with no opening as two half arcs on each face', () => {
    const dxf = exportPlan(roundRoom([]), 'dxf', options).data as string
    const bulges = dxf.split(/\r?\n/).filter((line, i, lines) => lines[i - 1]?.trim() === '42').map(Number)
    expect(bulges).toHaveLength(4)
    for (const bulge of bulges) expect(Math.abs(bulge)).toBeCloseTo(1, 9)
  })

  it('writes a curved dividing line as an arc in the DXF', () => {
    const line: FloorPlan = { ...bayRoom(), walls: bayRoom().walls.map((w) => (w.id === 'bay' ? { ...w, virtual: true, thickness: 0, height: 0 } : w)), openings: [] }
    const dxf = exportPlan(line, 'dxf', options).data as string
    expect(dxf).toMatch(/\r?\n\s*0\r?\n\s*ARC\r?\n\s*8\r?\n\s*GRID-WALLS-VIRTUAL/)
  })

  it('writes the IFC axis as a trimmed circle, and names the wall and the room it writes as pieces', () => {
    const made = exportPlan(roundRoom(), 'ifc', options)
    const ifc = made.data as string
    expect(ifc).toMatch(/IFCCIRCLE\(#\d+,3\.\);/)
    expect(ifc).toContain('IFCTRIMMEDCURVE(')
    expect(ifc).toContain("'Grid_Approximated'")
    expect(made.approximated).toEqual([
      { kind: 'wall', id: 'round', floor: 'ground' },
      { kind: 'room', id: 'drum', floor: 'ground' }
    ])
    // The door is a void and a filler, as on a straight wall.
    expect(ifc).toContain("IFCOPENINGELEMENT(")
    expect(ifc).toContain("IFCDOOR(")
  })

  it('writes the OBJ and GLB walls as facets, and says so', () => {
    const obj = exportPlan(roundRoom(), 'obj', options).data as string
    expect(obj).toContain('# Curved walls written as straight pieces (1): "round"')
    expect(obj.split('\n').filter((line) => line.startsWith('o wall_')).length).toBe(1)
    const glb = parseGlb(exportPlan(roundRoom(), 'glb', options).data as Uint8Array)
    const extras = (glb.json.asset as { extras?: { gridApproximated?: { count: number } } }).extras
    expect(extras?.gridApproximated?.count).toBe(2)
  })

  it('writes a plan with no curved wall as before, with nothing approximated', () => {
    const straight = { ...bayRoom(), walls: [wall('s', [0, 0], [4, 0]), wall('e', [4, 0], [4, 3]), wall('n', [4, 3], [0, 3]), wall('w', [0, 3], [0, 0])], rooms: [{ id: 'r', name: 'R', boundary: ['s', 'e', 'n', 'w'] }], openings: [] }
    for (const format of ['dxf', 'ifc', 'obj', 'glb'] as const) {
      const made = exportPlan(straight, format, options)
      expect(made.approximated).toEqual([])
      if (typeof made.data === 'string') expect(made.data).not.toContain('Approximated')
    }
  })
})

describe('rooms text and a curved wall', () => {
  it('reads a floor with a curved wall back in Grid\'s own terms, and writing it again loses nothing', () => {
    const plan = parseFloorPlan(bayRoom())
    const reading = readRoomsText(plan)
    expect(reading.rawFloors).toEqual([{ floor: 'ground', why: 'wall "bay" is curved, and rooms text writes straight walls only' }])
    const written = compileRoomsText(reading.text)
    expect(written.plan).not.toBeNull()
    expect(written.plan!.walls.find((w) => w.id === 'bay')!.arc).toEqual({ centre: [2, 3], sweep: 180 })
    const again = parseFloorPlan(written.plan)
    expect(roomArea(again.rooms.find((r) => r.id === 'living')!, indexPlan(again))).toBeCloseTo(roomArea(plan.rooms[0]!, indexPlan(plan)), 9)
  })
})

describe('a curved wall in the parts merged from main (HND-2, LVL-4)', () => {
  it('gives a curved wall\'s IFC base quantities along its curve', () => {
    const ifc = exportPlan(bayRoom(), 'ifc', { projectId: 'p', projectName: 'Bay', now: new Date(0) }).data as string
    // The bay: 2π m along its curve, and its body 2π × 0.2 m² from above, give or take the pieces.
    expect(ifc).toContain("IFCQUANTITYLENGTH('Length','Along its axis, from start to end.',$,6.2831853072);")
    const footprint = /IFCQUANTITYAREA\('GrossFootprintArea','[^']*',\$,([0-9.]+)\);/g
    const areas = [...ifc.matchAll(footprint)].map((m) => Number(m[1]))
    expect(areas.some((a) => Math.abs(a - 2 * Math.PI * 0.2) / (2 * Math.PI * 0.2) < 0.001)).toBe(true)
  })

  it('lays a slab and a roof over a round building, the shape of its curve', () => {
    const envelope = planEnvelope(roundRoom())
    const disc = Math.PI * 3.1 * 3.1
    expect(Math.abs(envelope.slabArea! - disc) / disc).toBeLessThan(0.002)
    expect(Math.abs(envelope.roofArea! - disc) / disc).toBeLessThan(0.002)
  })
})
