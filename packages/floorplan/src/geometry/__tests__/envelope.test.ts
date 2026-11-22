/**
 * LVL-4: slabs, roofs, openings over stairs and lifts, voids, parapets and ceilings, from the
 * floors' outlines (`envelope.ts`), and what the exports make of them.
 */
import { describe, expect, it } from 'vitest'
import { edit, exterior, flat, genkanFlat, room, stairHouse, stairRoomHouse, twoFloorHouse, wall } from '../../test-support/plans'
import { labPlan } from '../../test-support/lab'
import { parseFloorPlan } from '../../types/floorplan'
import { floorEnvelope, planEnvelope, roomCeiling } from '../envelope'
import { indexPlan } from '../plan'
import { planForFloor } from '../floors'
import { inPieces, multiArea } from '../polygons'
import { buildScene } from '../scene3d'
import { shellMesh } from '../export/mesh'
import { toObj } from '../export/obj'
import { toIfc } from '../export/ifc'
import type { FloorPlan } from '../plan'

const slabOf = (plan: FloorPlan, floor: string) => floorEnvelope(plan, floor)!.slab!
const openingsOf = (plan: FloorPlan, floor: string) => slabOf(plan, floor).openings.map((o) => [o.kind, o.via, Number(o.area.toFixed(2))])

/** The volume a closed mesh holds, and whether every edge is shared by two faces, once each way. */
function closedVolume(mesh: NonNullable<ReturnType<typeof shellMesh>>): { volume: number; closed: boolean } {
  let volume = 0
  const edges = new Map<string, number>()
  for (const [a, b, c] of mesh.faces) {
    const [p, q, r] = [mesh.points[a]!, mesh.points[b]!, mesh.points[c]!]
    volume += (p.x * (q.y * r.z - q.z * r.y) - p.y * (q.x * r.z - q.z * r.x) + p.z * (q.x * r.y - q.y * r.x)) / 6
    for (const [u, v] of [[a, b], [b, c], [c, a]] as const) edges.set(`${u}>${v}`, (edges.get(`${u}>${v}`) ?? 0) + 1)
  }
  // Points are written once per face group, so an edge is matched by where it is, not by index.
  const at = (i: number): string => {
    const p = mesh.points[i]!
    return `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`
  }
  const directed = new Map<string, number>()
  for (const [key, count] of edges) {
    const [u, v] = key.split('>').map(Number) as [number, number]
    const k = `${at(u)}>${at(v)}`
    directed.set(k, (directed.get(k) ?? 0) + count)
  }
  const closed = [...directed].every(([key, count]) => {
    const [u, v] = key.split('>')
    return directed.get(`${v}>${u}`) === count
  })
  return { volume, closed }
}

describe('the slab a floor stands on', () => {
  it('covers the floor\'s outline, walls and all, and is a base slab on the lowest level only', () => {
    const plan = twoFloorHouse()
    const ground = slabOf(plan, 'ground')
    const first = slabOf(plan, 'first')
    // 10 × 8 between wall axes, 0.2 m outside walls: 10.2 × 8.2 outside.
    expect(ground.area).toBeCloseTo(10.2 * 8.2, 6)
    expect(ground.kind).toBe('base')
    expect(first.kind).toBe('floor')
    expect(ground.top).toBe(0)
    expect(first.top).toBeCloseTo(2.95, 9)
    expect(ground.thickness).toBe(0.25)
    expect(ground.thicknessStated).toBe(false)
  })

  it('takes the thickness the floor states', () => {
    const plan = edit(twoFloorHouse(), (p) => {
      p.floors![1] = { ...p.floors![1]!, slab: 0.3 }
    })
    expect(slabOf(plan, 'first')).toMatchObject({ thickness: 0.3, thicknessStated: true })
  })

  it('opens the floor a stated stair arrives at over its flights, 2.52 m², and no more', () => {
    const plan = stairHouse()
    expect(openingsOf(plan, 'ground')).toEqual([])
    expect(openingsOf(plan, 'first')).toEqual([['stair', 's1', 2.52]])
    const first = slabOf(plan, 'first')
    expect(first.area).toBeCloseTo(10.2 * 8.2 - 2.52, 6)
    expect(inPieces(first.pieces, { x: 0.6, y: 2 })).toBe(false)
    expect(inPieces(first.pieces, { x: 2, y: 2 })).toBe(true)
  })

  it('opens each floor over the stair room below it that it lies over, where no stair is stated', () => {
    const plan = stairRoomHouse()
    expect(openingsOf(plan, 'ground')).toEqual([])
    // The stair room's floor, x 4.05 to 5.9 and y 0.1 to 3.9: the whole room, as the plan says no more.
    expect(openingsOf(plan, 'first')).toEqual([['stair-room', 'ground-stair|first-stair', 7.03]])
    expect(openingsOf(plan, 'second')).toEqual([['stair-room', 'first-stair|second-stair', 7.03]])
  })

  it('opens each floor over a lift shaft, which stays closed at its foot', () => {
    const plan = stairRoomHouse({ use: 'lift' })
    expect(openingsOf(plan, 'ground')).toEqual([])
    expect(openingsOf(plan, 'first')).toEqual([['lift', 'ground-stair|first-stair', 7.03]])
  })

  it('opens over a stated stair\'s flights, not the whole room, where the stair rooms hold one', () => {
    const plan = { ...stairRoomHouse(), stairs: [{ id: 's', from: 'ground', to: 'first', width: 0.9, run: [[5, 0.6], [5, 3.4]] as [number, number][] }] }
    expect(openingsOf(plan, 'first')).toEqual([['stair', 's', 2.52]])
    expect(openingsOf(plan, 'second')).toEqual([['stair-room', 'first-stair|second-stair', 7.03]])
  })

  it('leaves no floor under a room marked as a void, and it needs no door', () => {
    const plan = edit(twoFloorHouse(), (p) => {
      p.rooms = p.rooms.map((r) => (r.id === 'landing' ? { ...r, void: true } : r))
      p.openings = p.openings.filter((o) => o.id !== 'd_up')
    })
    // The landing's floor: x 0.1 to 4.95, y 0.1 to 7.9.
    expect(openingsOf(plan, 'first')).toEqual([['void', 'landing', Number((4.85 * 7.8).toFixed(2))]])
    // The room below rises through it: its roof is the first floor's, so nothing is roofed below.
    expect(floorEnvelope(plan, 'ground')!.roof).toBeNull()
  })

  it('cuts a sunken room out of the slab and gives it a piece of its own, lower down', () => {
    const plan = genkanFlat(-0.18)
    const slab = slabOf(plan, 'ground')
    expect(slab.sunken.map((s) => [s.room, s.offset])).toEqual([['genkan', -0.18]])
    expect(inPieces(slab.pieces, { x: 0.7, y: 1.5 })).toBe(false)
    expect(inPieces(slab.pieces, { x: 3, y: 1.5 })).toBe(true)
    expect(multiArea(slab.sunken[0]!.pieces) + slab.area).toBeCloseTo(4.2 * 3.2, 6)
  })

  it('has none where the walls close no floor, and says why', () => {
    const plan: FloorPlan = { version: '1', units: 'm', walls: [wall('a', [0, 0], [4, 0]), wall('b', [4, 0], [4, 3])], rooms: [], openings: [] }
    const envelope = floorEnvelope(plan, 'ground')!
    expect(envelope.slab).toBeNull()
    expect(envelope.roof).toBeNull()
    expect(envelope.why).toBe('its walls close no floor, so it has no outline for a slab or a roof')
  })

  it('leaves a garden wall standing apart without a slab', () => {
    const plan = edit(flat(), (p) => {
      p.walls.push(exterior('garden', [14, 0], [20, 0]))
    })
    expect(slabOf(plan, 'ground').area).toBeCloseTo(10.2 * 8.2, 6)
  })
})

describe('the roof', () => {
  it('lies on the top floor\'s walls, over all of it', () => {
    const plan = twoFloorHouse()
    const roof = floorEnvelope(plan, 'first')!.roof!
    expect(roof.area).toBeCloseTo(10.2 * 8.2, 6)
    expect(roof.bottom).toBeCloseTo(2.95 + 2.7, 9)
    expect(roof.thickness).toBe(0.25)
    expect(roof.parapet).toBeNull()
    // The ground floor has the first floor over every part of it.
    expect(floorEnvelope(plan, 'ground')!.roof).toBeNull()
  })

  it('gives a parapet along the outside walls under the roof\'s edge, as high as the floor states', () => {
    const plan = edit(flat(), (p) => {
      p.floors = [{ id: 'ground', name: 'Ground floor', level: 0, parapet: 1.1 }]
    })
    const roof = floorEnvelope(plan, 'ground')!.roof!
    expect(roof.parapet!.height).toBe(1.1)
    // The band the outside walls stand on: 10.2 × 8.2 outside, 9.8 × 7.8 inside.
    expect(multiArea(roof.parapet!.pieces)).toBeCloseTo(10.2 * 8.2 - 9.8 * 7.8, 6)
    const scene = buildScene(plan)
    expect(scene.shell!.parapet).toMatchObject({ bottom: 2.95, top: expect.closeTo(4.05, 9) })
    expect(toObj(scene)).toContain('o parapet_ground')
    expect(toIfc(plan)).toMatch(/IFCWALL\('[^']+',#\d+,'Ground floor parapet',\$,'Parapet'/)
  })

  it('adds up, over every floor, to the gross external area of a house whose upper floors stand inside the lower', () => {
    const odd = planEnvelope(labPlan('F/scenarios/odd-house.json'))
    expect(odd.roofArea).toBeCloseTo(odd.floors[0]!.outlineArea!, 6)
  })
})

describe('the meshes', () => {
  it('make every slab and roof a closed solid, as thick as it is', () => {
    const plan = labPlan('F/scenarios/odd-house.json')
    for (const floor of ['ground', 'first']) {
      const shell = buildScene(planForFloor(plan, floor)).shell!
      const envelope = floorEnvelope(plan, floor)!
      const slab = closedVolume(shellMesh(shell.slab)!)
      expect(slab.closed, floor).toBe(true)
      expect(slab.volume, floor).toBeCloseTo(envelope.slab!.area * 0.25, 4)
      const roof = closedVolume(shellMesh([shell.roof!])!)
      expect(roof.closed, floor).toBe(true)
      expect(roof.volume, floor).toBeCloseTo(envelope.roof!.area * 0.25, 4)
    }
  })

  it('give a plan of several floors that is no slice no shell: its floors would stand in one place', () => {
    expect(buildScene(twoFloorHouse()).shell).toBeNull()
  })
})

describe('ceilings', () => {
  const plan = (): FloorPlan =>
    parseFloorPlan({
      walls: [exterior('s', [0, 0], [6, 0]), exterior('e', [6, 0], [6, 4]), exterior('n', [6, 4], [0, 4]), exterior('w', [0, 4], [0, 0])],
      rooms: [
        {
          ...room('k', 'Kitchen', ['s', 'e', 'n', 'w']),
          height: 2.6,
          ceiling: { lowered: [{ name: 'Bulkhead', points: [[0, 3], [6, 3], [6, 5], [0, 5]], height: 2.3 }, { points: [[10, 10], [11, 10], [11, 11]], height: 2 }] }
        }
      ]
    })

  it('stands at the room\'s height, less its lowered zones, each inside the room at its own height', () => {
    const p = plan()
    const pieces = roomCeiling(p.rooms[0]!, indexPlan(p), 2.7)!
    expect(pieces.map((c) => [c.zone, c.height, Number(c.area.toFixed(2))])).toEqual([
      [null, 2.6, Number((5.8 * 2.9).toFixed(2))],
      ['Bulkhead', 2.3, Number((5.8 * 0.9).toFixed(2))]
    ])
  })

  it('is none in a room that states none', () => {
    const p = flat()
    expect(roomCeiling(p.rooms[0]!, indexPlan(p), 2.7)).toBeNull()
  })

  it('goes into the IFC as a covering of the room\'s space, one for each zone', () => {
    const ifc = toIfc(plan())
    expect(ifc.match(/IFCCOVERING\(/g)).toHaveLength(2)
    expect(ifc).toContain("'Kitchen ceiling, lowered zone Bulkhead'")
    expect(ifc.match(/IFCRELCOVERSSPACES\(/g)).toHaveLength(1)
    expect(toIfc(flat())).not.toContain('IFCCOVERING(')
  })
})

describe('reading the plan', () => {
  it('reads every plan written before LVL-4 with no key added', () => {
    const plan = parseFloorPlan(JSON.parse(JSON.stringify(twoFloorHouse())))
    expect(plan.site).toBeUndefined()
    for (const room of plan.rooms) {
      expect(room.void).toBeUndefined()
      expect(room.ceiling).toBeUndefined()
    }
    for (const floor of plan.floors!) expect(floor.parapet).toBeUndefined()
  })

  it('refuses a lowered zone of fewer than three points and a parapet of no height', () => {
    expect(() => parseFloorPlan({ rooms: [{ id: 'r', name: 'R', boundary: [], ceiling: { lowered: [{ points: [[0, 0], [1, 0]], height: 2 }] } }] })).toThrow()
    expect(() => parseFloorPlan({ floors: [{ id: 'g', name: 'G', level: 0, parapet: 0 }] })).toThrow()
  })
})
