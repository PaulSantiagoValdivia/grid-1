/**
 * ARE-6: a room with a hole in it. A ring gallery round a courtyard, or a car park round a core,
 * is one room: its `boundary` lists the walls round the outside, and `holes` lists the walls
 * round each hole. Its floor is the outline less each hole, measured to the faces of the hole's
 * walls that look into the room. Lab entry AR-5: as one room it was refused, and drawn as two
 * halves it measured 79.20 m² against 75.60 by hand (+4.8%), with each half's label in the
 * courtyard.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, safeParseFloorPlan } from '../../types/floorplan'
import type { FloorPlan, Opening, Room, Wall } from '../plan'
import { indexPlan } from '../plan'
import { roomArea, roomOutline, roomPolygon, tryRoomShape } from '../room'
import type { Vec2 } from '../vec2'
import { area, signedArea } from '../vec2'
import { validatePlan } from '../validate'
import { buildFloorPlan } from '../floorplan'
import { pointInPolygon } from '../innerPoint'
import { modelEntities, numberOf, valueOf, worldShapes } from '../export/__tests__/dxf-reader'
import { buildScene } from '../scene3d'
import { toDxf } from '../export/dxf'
import { toObj } from '../export/obj'
import { toGlb } from '../export/gltf'
import { parseGlb, readMeshes } from '../export/__tests__/glb-reader'
import { floorGraph, openingSides, roomOutlines } from '../rules/graph'
import { planWallSides } from '../exposure'
import { diffPlans } from '../diff'
import { planRevision } from '../revision'

const fixture = (name: string): FloorPlan =>
  parseFloorPlan(JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures', name), 'utf8')))

const ring = (): FloorPlan => fixture('ring-gallery.json')

const wall = (id: string, start: [number, number], end: [number, number], thickness = 0.3): Wall => ({
  id,
  start,
  end,
  thickness,
  height: 2.7,
  kind: 'exterior'
})

/** A square of walls round the axes from `a` to `b`, counter-clockwise, ids `${id}0`…`${id}3`. */
function square(id: string, a: [number, number], b: [number, number], thickness = 0.3): Wall[] {
  const corners: [number, number][] = [a, [b[0], a[1]], b, [a[0], b[1]]]
  return corners.map((p, i) => wall(`${id}${i}`, p, corners[(i + 1) % 4]!, thickness))
}

const planOf = (walls: Wall[], rooms: Room[], openings: Opening[] = []): FloorPlan => ({
  version: '1',
  units: 'm',
  walls,
  rooms,
  openings
})

const errors = (plan: FloorPlan) => validatePlan(plan).issues.filter((i) => i.severity === 'error')

describe('the plan format (ARE-6)', () => {
  it('reads a room with holes, and adds no key to a room without', () => {
    const plan = ring()
    expect(plan.rooms[0]!.holes).toEqual([['cw', 'cn', 'ce', 'cs']])
    const plain = parseFloorPlan({ walls: [], rooms: [{ id: 'r', name: 'R', boundary: ['a', 'b', 'c'] }] })
    expect('holes' in plain.rooms[0]!).toBe(false)
  })

  it('refuses holes that are not lists of wall ids', () => {
    for (const holes of ['cw', ['cw'], [[1, 2, 3]], [['a', 'b\nc', 'd']]]) {
      expect(safeParseFloorPlan({ rooms: [{ id: 'r', name: 'R', boundary: [], holes }] })).toBeNull()
    }
  })
})

describe('a ring gallery round a courtyard (AR-5)', () => {
  it('is one room whose area is the outline less the hole: 75.60 m², as by hand', () => {
    const plan = ring()
    const index = indexPlan(plan)
    const room = plan.rooms[0]!
    // By hand: inside the outer walls 9.70 × 9.70 = 94.09; the core to its outer faces
    // 4.30 × 4.30 = 18.49; 94.09 − 18.49 = 75.60. Two halves measured 79.20.
    expect(roomArea(room, index)).toBeCloseTo(75.6, 9)
    expect(area(roomPolygon(room, index))).toBeCloseTo(94.09, 9)
    expect(errors(plan)).toEqual([])
  })

  it('traces the hole clockwise along the faces that look into the room', () => {
    const plan = ring()
    const outline = roomOutline(plan.rooms[0]!, indexPlan(plan))
    expect(outline.fault).toBeNull()
    expect(signedArea(outline.polygon)).toBeGreaterThan(0)
    expect(outline.holes).toHaveLength(1)
    const hole = outline.holes[0]!
    expect(signedArea(hole.polygon)).toBeCloseTo(-18.49, 9)
    const xs = hole.polygon.map((p) => p.x)
    expect(Math.min(...xs)).toBeCloseTo(2.85, 9)
    expect(Math.max(...xs)).toBeCloseTo(7.15, 9)
    // The core's walls run counter-clockwise round the core, so the room is on their right.
    expect(hole.sides.map((s) => [s.wallId, s.face])).toEqual([
      ['cw', 'right'],
      ['cn', 'right'],
      ['ce', 'right'],
      ['cs', 'right']
    ])
  })

  it('measures the same whichever way round each list goes, and wherever the plan sits', () => {
    const plan = ring()
    const reversed: FloorPlan = {
      ...plan,
      rooms: [{ ...plan.rooms[0]!, boundary: ['ow', 'on', 'oe', 'os'], holes: [['cs', 'ce', 'cn', 'cw']] }]
    }
    expect(roomArea(reversed.rooms[0]!, indexPlan(reversed))).toBeCloseTo(75.6, 9)
    const turn = 0.6
    const far = 250_000
    const move = ([x, y]: [number, number]): [number, number] => [
      far + x * Math.cos(turn) - y * Math.sin(turn),
      far + x * Math.sin(turn) + y * Math.cos(turn)
    ]
    const turned: FloorPlan = { ...plan, walls: plan.walls.map((w) => ({ ...w, start: move(w.start), end: move(w.end) })) }
    expect(roomArea(turned.rooms[0]!, indexPlan(turned))).toBeCloseTo(75.6, 5)
  })

  it('takes several holes off, each to its own faces', () => {
    const walls = [...square('o', [0, 0], [20, 10]), ...square('a', [3, 3], [7, 7], 0.2), ...square('b', [12, 3], [16, 7], 0.1)]
    const room: Room = { id: 'park', name: 'Car park', boundary: ['o0', 'o1', 'o2', 'o3'], holes: [['a0', 'a1', 'a2', 'a3'], ['b3', 'b2', 'b1', 'b0']] }
    const plan = planOf(walls, [room])
    // 19.70 × 9.70 = 191.09, less 4.20² = 17.64 and 4.10² = 16.81.
    expect(roomArea(room, indexPlan(plan))).toBeCloseTo(191.09 - 17.64 - 16.81, 9)
    expect(errors(plan)).toEqual([])
  })

  it('takes a hole with an inside corner off along its faces', () => {
    // An L-shaped core: its inside corner is a corner of the room that points into the room.
    const core: Wall[] = [
      wall('l0', [3, 3], [7, 3], 0.2),
      wall('l1', [7, 3], [7, 5], 0.2),
      wall('l2', [7, 5], [5, 5], 0.2),
      wall('l3', [5, 5], [5, 7], 0.2),
      wall('l4', [5, 7], [3, 7], 0.2),
      wall('l5', [3, 7], [3, 3], 0.2)
    ]
    const room: Room = { id: 'r', name: 'R', boundary: ['o0', 'o1', 'o2', 'o3'], holes: [core.map((w) => w.id)] }
    const plan = planOf([...square('o', [0, 0], [10, 10]), ...core], [room])
    // The L grown by 0.1 all round: 4.2 × 2.2 + 2.2 × 2.0 = 13.64.
    expect(roomArea(room, indexPlan(plan))).toBeCloseTo(9.7 * 9.7 - 13.64, 9)
  })
})

describe('holes that are not holes', () => {
  it('names a hole that reaches the outline', () => {
    const walls = [...square('o', [0, 0], [10, 10]), ...square('c', [8, 3], [12, 7])]
    const room: Room = { id: 'r', name: 'R', boundary: ['o0', 'o1', 'o2', 'o3'], holes: [['c0', 'c1', 'c2', 'c3']] }
    const plan = planOf(walls, [room])
    expect(tryRoomShape(room, indexPlan(plan))).toBeNull()
    const found = errors(plan)
    expect(found.map((i) => [i.code, i.id])).toEqual([['room/hole-outside', 'r']])
    expect(found[0]!.message).toBe(
      'Hole 1 of room "r" does not lie inside the room: the faces of its walls reach or cross the room\'s ' +
        'outline. A hole must sit inside the room with floor all round it. Check the walls the hole lists, ' +
        'or draw the space as a room of its own.'
    )
  })

  it('names two holes that overlap', () => {
    const walls = [...square('o', [0, 0], [20, 10]), ...square('a', [3, 3], [8, 7]), ...square('b', [7, 3], [12, 7])]
    const room: Room = { id: 'r', name: 'R', boundary: ['o0', 'o1', 'o2', 'o3'], holes: [['a0', 'a1', 'a2', 'a3'], ['b0', 'b1', 'b2', 'b3']] }
    const found = errors(planOf(walls, [room]))
    expect(found.map((i) => i.code)).toEqual(['room/holes-overlap'])
    expect(found[0]!.message).toContain('Holes 1 and 2 of room "r" overlap or touch')
  })

  it('names the hole whose list cannot close, and the wall it lacks', () => {
    const walls = [...square('o', [0, 0], [10, 10]), ...square('c', [3, 3], [7, 7])]
    const missing: Room = { id: 'r', name: 'R', boundary: ['o0', 'o1', 'o2', 'o3'], holes: [['c0', 'c1', 'nope']] }
    expect(errors(planOf(walls, [missing])).map((i) => [i.code, i.message])).toEqual([
      ['room/unclosed', 'Hole 1 of room "r" references wall "nope", which is not in the plan']
    ])
    const outOfOrder: Room = { ...missing, holes: [['c0', 'c2', 'c1', 'c3']] }
    const found = errors(planOf(walls, [outOfOrder]))
    expect(found.map((i) => i.code)).toEqual(['room/unclosed'])
    expect(found[0]!.message).toMatch(/^In hole 1 of room "r", walls "c\d" and "c\d" are parallel and form no corner\. The list of hole 1 may be out of order\.$/)
  })

  it('leaves the room out, as any room whose outline does not close', () => {
    const walls = [...square('o', [0, 0], [10, 10]), ...square('c', [8, 3], [12, 7])]
    const room: Room = { id: 'r', name: 'R', boundary: ['o0', 'o1', 'o2', 'o3'], holes: [['c0', 'c1', 'c2', 'c3']] }
    expect(validatePlan(planOf(walls, [room])).broken.has('r')).toBe(true)
  })
})

/** The courtyard of the fixture, to the faces of its walls: 2.85 to 7.15 both ways. */
const inCourtyard = (p: Vec2): boolean => p.x > 2.85 && p.x < 7.15 && p.y > 2.85 && p.y < 7.15

/** Triangles' total area, and whether any lies in the courtyard (its centre does). */
function floorOf(points: readonly { x: number; y: number }[], triangles: readonly (readonly [number, number, number])[]): { area: number; inHole: number } {
  let total = 0
  let inHole = 0
  for (const [a, b, c] of triangles) {
    const [p, q, r] = [points[a]!, points[b]!, points[c]!]
    total += ((q.x - p.x) * (r.y - p.y) - (r.x - p.x) * (q.y - p.y)) / 2
    if (inCourtyard({ x: (p.x + q.x + r.x) / 3, y: (p.y + q.y + r.y) / 3 })) inHole++
  }
  return { area: total, inHole }
}

describe('what is drawn (ARE-6)', () => {
  it('gives the drawing the room with its hole, its area, and a label on its floor', () => {
    const drawing = buildFloorPlan(ring())
    expect(drawing.rooms).toHaveLength(1)
    const room = drawing.rooms[0]!
    expect(room.area).toBeCloseTo(75.6, 9)
    expect(room.holes).toHaveLength(1)
    expect(signedArea(room.holes[0]!)).toBeCloseTo(-18.49, 9)
    // The middle of the corners is (5, 5), in the courtyard. The label is in the ring.
    expect(inCourtyard(room.labelAt)).toBe(false)
    expect(pointInPolygon(room.labelAt, room.polygon, room.holes)).toBe(true)
  })

  it('places the label of a room with no hole at the middle of its corners, as before', () => {
    const plan = ring()
    const solid: FloorPlan = { ...plan, rooms: [{ id: 'hall', name: 'Hall', boundary: ['os', 'oe', 'on', 'ow'] }] }
    const room = buildFloorPlan(solid).rooms[0]!
    expect(room.labelAt).toEqual({ x: 5, y: 5 })
    expect(room.holes).toEqual([])
    expect(room.area).toBeCloseTo(94.09, 9)
  })

  it('writes the hole into the DXF as a closed outline of its own on the rooms layer', () => {
    // HND-1: light polylines, and the room's name in its tag.
    const dxf = toDxf(buildFloorPlan(ring()))
    const outlines: Vec2[][] = worldShapes(dxf).filter((s) => s.type === 'LWPOLYLINE' && s.layer === 'GRID-ROOMS').map((s) => [...s.points])
    expect(outlines.map((points) => Math.round(area(points) * 1e6) / 1e6)).toEqual([94.09, 18.49])
    // The label goes on the ring's floor, not in the courtyard.
    const name = modelEntities(dxf, 'ATTRIB').find((e) => valueOf(e, 1) === 'Ring gallery')!
    const at = { x: numberOf(name, 10), y: numberOf(name, 20) }
    expect(inCourtyard(at)).toBe(false)
    const labelAt = buildFloorPlan(ring()).rooms[0]!.labelAt
    expect(at.x).toBeCloseTo(labelAt.x, 6)
    expect(at.y).toBeCloseTo(labelAt.y, 6)
  })

  it('leaves the courtyard open in the 3D floor, the OBJ and the GLB', () => {
    const scene = buildScene(ring())
    expect(scene.slabs).toHaveLength(1)
    expect(scene.slabs[0]!.holes).toHaveLength(1)

    const obj = toObj(scene).split('\n')
    const start = obj.indexOf('o floor_ring')
    expect(start).toBeGreaterThan(0)
    const vertices: { x: number; y: number }[] = []
    obj.forEach((line) => {
      if (line.startsWith('v ')) {
        const [, x, y] = line.split(' ')
        vertices.push({ x: Number(x), y: Number(y) })
      }
    })
    // The room's floor alone: up to the next object (LVL-4 writes the floor's slab and roof after it).
    const next = obj.findIndex((line, i) => i > start && line.startsWith('o '))
    const faces = obj
      .slice(start + 1, next === -1 ? undefined : next)
      .filter((line) => line.startsWith('f '))
      .map((line) => line.split(' ').slice(1).map((n) => Number(n) - 1) as [number, number, number])
    const fromObj = floorOf(vertices, faces)
    expect(fromObj.area).toBeCloseTo(75.6, 6)
    expect(fromObj.inHole).toBe(0)

    const floor = readMeshes(parseGlb(toGlb(scene))).find((mesh) => mesh.name === 'floor_ring')!
    // The GLB is in glTF's frame (Y up): the plan's y is its −z.
    const fromGlb = floorOf(floor.points.map((p) => ({ x: p.x, y: -p.z })), floor.triangles)
    expect(Math.abs(fromGlb.area)).toBeCloseTo(75.6, 4)
    expect(fromGlb.inHole).toBe(0)
  })
})

describe('doors and walls round a hole (ARE-6)', () => {
  /** The fixture with a door from the gallery into the courtyard, in the core's south wall. */
  const withYardDoor = (): FloorPlan => {
    const plan = ring()
    return { ...plan, openings: [...plan.openings, { id: 'yard', wall: 'cs', type: 'door', offset: 1.5, width: 1, sill: 0, height: 2.1 }] }
  }

  it('puts the gallery on the face of each core wall that looks into it, and nothing in the courtyard', () => {
    const plan = ring()
    const sides = planWallSides(indexPlan(plan))
    for (const id of ['cs', 'ce', 'cn', 'cw']) {
      const stretches = sides.get(id)!.stretches
      // The core walls run counter-clockwise round the core: the gallery is on their right.
      expect(stretches.map((s) => [s.left, s.right])).toEqual([[[], ['ring']]])
      expect(sides.get(id)!.exposure).toBe('exterior')
    }
  })

  it('reads a door into the courtyard as one with the gallery on one side only', () => {
    const plan = withYardDoor()
    const index = indexPlan(plan)
    const door = plan.openings.find((o) => o.id === 'yard')!
    // `cs` runs west to east along the core's south side: its left face looks into the courtyard.
    expect(openingSides(door, index, roomOutlines(plan, index))).toEqual([null, 'ring'])
    const graph = floorGraph(plan)
    expect(graph.rooms).toEqual(['ring'])
    expect(graph.links).toEqual([])
    // MSG-17: the courtyard is closed in by the core on every side, so its door is no way out.
    expect(graph.exits.map((e) => e.opening)).toEqual(['front'])
    expect(graph.closedCourts).toEqual([{ room: 'ring', opening: 'yard' }])
  })

  it('does not report the core walls as standing in the gallery', () => {
    const codes = validatePlan(ring()).issues.map((i) => i.code)
    expect(codes).not.toContain('wall/stands-in-room')
    expect(codes).not.toContain('room/space-mismatch')
    expect(codes).not.toContain('room/overlap')
  })

  it('reports a wall that stands in the gallery, but not one that stands in the courtyard', () => {
    const plan = ring()
    const stub: Wall = { ...wall('stub', [1, 5], [2, 5], 0.1), kind: 'partition' }
    const fountain: Wall = { ...wall('fountain', [4.5, 5], [5.5, 5], 0.1), kind: 'partition' }
    const found = (extra: Wall): string[] =>
      validatePlan({ ...plan, walls: [...plan.walls, extra] })
        .issues.filter((i) => i.code === 'wall/stands-in-room')
        .map((i) => i.id)
    expect(found(stub)).toEqual(['stub'])
    expect(found(fountain)).toEqual([])
  })

  it('keeps a room drawn in the courtyard apart from the gallery', () => {
    const plan = ring()
    const yard: Room = { id: 'yard', name: 'Courtyard', boundary: ['cs', 'ce', 'cn', 'cw'], use: 'other' }
    const both: FloorPlan = { ...plan, rooms: [...plan.rooms, yard] }
    const index = indexPlan(both)
    expect(roomArea(both.rooms[0]!, index)).toBeCloseTo(75.6, 9)
    expect(roomArea(yard, index)).toBeCloseTo(3.7 * 3.7, 9)
    const codes = validatePlan(both).issues.map((i) => i.code)
    expect(codes).not.toContain('room/overlap')
    expect(codes).not.toContain('floor/unclaimed')
    // The core walls now have a room on both faces, but for the courtyard's corners, where the
    // gallery's face runs on past the courtyard's.
    expect(planWallSides(index).get('cs')!.stretches.map((s) => [s.left, s.right])).toEqual([
      [[], ['ring']],
      [['yard'], ['ring']],
      [[], ['ring']]
    ])
  })
})

describe('comparing and keying plans with holes (ARE-6)', () => {
  it('reports a changed hole as a change to the room', () => {
    const before = ring()
    const after: FloorPlan = {
      ...before,
      walls: [...before.walls, ...square('d', [8, 8], [9, 9], 0.1)],
      rooms: [{ ...before.rooms[0]!, holes: [...before.rooms[0]!.holes!, ['d0', 'd1', 'd2', 'd3']] }]
    }
    const diff = diffPlans(before, after)
    const change = diff.changes.find((c) => c.entity.type === 'room' && c.entity.id === 'ring')!
    expect(change.props.map((p) => p.key)).toEqual(['holes'])
    expect(change.summary).toBe('"Ring gallery" holes changed')
    expect(planRevision(after)).not.toBe(planRevision(before))
  })

  it('keeps the revision of a plan with no holes as it was', () => {
    const plan = ring()
    const solid: FloorPlan = { ...plan, rooms: [{ id: 'hall', name: 'Hall', boundary: ['os', 'oe', 'on', 'ow'] }] }
    const withEmpty: FloorPlan = { ...solid, rooms: [{ ...solid.rooms[0]!, holes: [] }] }
    expect(planRevision(withEmpty)).toBe(planRevision(solid))
    expect(diffPlans(solid, withEmpty).changes).toEqual([])
  })
})

describe('a ring written as one wall list, as the lab wrote it (AR-5)', () => {
  it('is still refused, and the refusal says how to list the hole', () => {
    const plan = ring()
    const lab: FloorPlan = {
      ...plan,
      rooms: [{ id: 'ring', name: 'Ring gallery', boundary: ['os', 'oe', 'on', 'ow', 'cw', 'cn', 'ce', 'cs'], use: 'corridor' }]
    }
    const found = errors(lab)
    expect(found.map((i) => i.code)).toEqual(['room/unclosed'])
    expect(found[0]!.message).toBe(
      'In room "ring", walls "ow" and "cw" are parallel and form no corner. The boundary may be out of order. ' +
        'If walls "cw", "cn", "ce", "cs" go round a hole in the room, list them as one of its holes, as ' +
        '"holes": [["cw", "cn", "ce", "cs"]], and the walls "os", "oe", "on", "ow" as its boundary.'
    )
  })

  it('gives no hint where the list does not fall into a ring round a hole', () => {
    const walls = [...square('a', [0, 0], [4, 4]), ...square('b', [10, 0], [14, 4])]
    const twoRooms: Room = { id: 'r', name: 'R', boundary: ['a0', 'a1', 'a2', 'a3', 'b0', 'b1', 'b2', 'b3'] }
    // Two squares side by side close as two rings, but neither lies inside the other.
    const found = errors(planOf(walls, [twoRooms]))
    expect(found).toHaveLength(1)
    expect(found[0]!.message).not.toContain('holes')
  })
})
