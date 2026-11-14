import { describe, expect, it } from 'vitest'
import { area, indexPlan, roomPolygon, type FloorPlan, type Room, type Wall } from '@ongrid/core/geometry'
import type { RoomUse } from '@ongrid/core/types/floorplan'
import { FIGURES, HABITABLE_USES, RULES, checkLocalRules } from '..'
import { messages } from '../messages'
import { edit, flat, twoFloorHouse } from './fixtures'

/**
 * A free-standing rectangular room whose inner faces measure `w` × `h`: four exterior walls
 * 0.2 m thick, their axes 0.1 m outside the inner face (C1), listed counter-clockwise (C3).
 */
function box(
  id: string,
  name: string,
  at: [number, number],
  w: number,
  h: number,
  use?: RoomUse | string,
  floor?: string
): { walls: Wall[]; room: Room } {
  const [x0, y0] = [at[0] - 0.1, at[1] - 0.1]
  const [x1, y1] = [at[0] + w + 0.1, at[1] + h + 0.1]
  const corners: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
  const walls = corners.map((start, i): Wall => ({
    id: `${id}-w${i}`,
    start,
    end: corners[(i + 1) % 4]!,
    thickness: 0.2,
    height: 2.7,
    kind: 'exterior',
    ...(floor === undefined ? {} : { floor })
  }))
  const room = {
    id,
    name,
    boundary: walls.map((wall) => wall.id),
    ...(floor === undefined ? {} : { floor }),
    ...(use === undefined ? {} : { use })
  } as Room
  return { walls, room }
}

function plan(...boxes: { walls: Wall[]; room: Room }[]): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: boxes.flatMap((b) => b.walls),
    rooms: boxes.map((b) => b.room),
    openings: []
  }
}

const sizeFindings = (p: FloorPlan) => checkLocalRules(p).findings.filter((f) => f.code === 'room_too_small')
const noUse = (p: FloorPlan) => checkLocalRules(p).notChecked.filter((n) => n.reason === 'no_use')

describe('the room-area rule', () => {
  it('is in the catalogue as a rule from US model codes, with the clauses its figure was read in', () => {
    const rule = RULES.find((r) => r.id === 'habitable-room-area')
    expect(rule).toEqual({
      id: 'habitable-room-area',
      title: 'Rooms people live or sleep in have a minimum floor area',
      source: {
        kind: 'building-code',
        label: 'US model codes: IBC 2024 and IRC 2024',
        citations: [
          { document: 'IBC', edition: '2024', clause: '1208.4' },
          { document: 'IRC', edition: '2024', clause: 'R312.1' }
        ]
      }
    })
    expect(FIGURES.habitableRoomMinArea.baseline).toBe(6.5)
    expect([...HABITABLE_USES]).toEqual(['bedroom', 'living', 'dining'])
  })
})

describe('the room-size messages', () => {
  it('name the room and the figure', () => {
    expect(messages.roomTooSmall('Bedroom 2', 6.5)).toBe('Bedroom 2 is under 6.5 m²')
    expect(messages.roomTooSmall('Bedroom 2', 9)).toBe('Bedroom 2 is under 9 m²')
  })

  it('count the rooms without a use, naming the floor only when asked', () => {
    expect(messages.noUse(null, 3)).toBe("Room sizes weren't checked for 3 rooms that don't say what they're for")
    expect(messages.noUse(null, 1)).toBe("Room sizes weren't checked for 1 room that doesn't say what it's for")
    expect(messages.noUse('First floor', 2)).toBe(
      "On First floor, room sizes weren't checked for 2 rooms that don't say what they're for"
    )
  })
})

describe('small rooms people live or sleep in', () => {
  it('report a 5.8 m² bedroom, with its area and the minimum', () => {
    const findings = sizeFindings(plan(box('b2', 'Bedroom 2', [0, 0], 2.0, 2.9, 'bedroom')))
    expect(findings).toEqual([
      {
        code: 'room_too_small',
        ruleId: 'habitable-room-area',
        floor: 'ground',
        rooms: ['b2'],
        openings: [],
        message: 'Bedroom 2 is under 6.5 m²',
        area: 5.8,
        minimum: 6.5,
        figures: [
          {
            key: 'habitableRoomMinArea',
            value: 6.5,
            unit: 'm²',
            origin: 'baseline',
            status: 'ai-found',
            jurisdiction: 'US model codes',
            citations: [
              { document: 'IBC', edition: '2024', clause: '1208.4' },
              { document: 'IRC', edition: '2024', clause: 'R312.1' }
            ],
            readOn: '2026-11-14'
          }
        ]
      }
    ])
  })

  it.each(['living', 'dining'])('report a small %s room too', (use) => {
    expect(sizeFindings(plan(box('r', 'Room', [0, 0], 2, 2, use)))).toHaveLength(1)
  })

  it('leave a bedroom exactly at the minimum alone', () => {
    expect(sizeFindings(plan(box('b', 'Bedroom', [0, 0], 2.5, 2.6, 'bedroom')))).toEqual([])
  })

  it('leave an area that rounds up to 6.50 m² alone', () => {
    // 2.5 × 2.5984 = 6.496 m²
    expect(sizeFindings(plan(box('l', 'Living', [0, 0], 2.5, 2.5984, 'living')))).toEqual([])
    // …but 6.494 m² rounds to 6.49 and is reported.
    expect(sizeFindings(plan(box('l', 'Living', [0, 0], 2.5, 2.5976, 'living')))).toMatchObject([{ area: 6.49 }])
  })

  it('never check kitchens, bathrooms, storage, corridors, stairs or other rooms', () => {
    const uses = ['kitchen', 'bathroom', 'storage', 'corridor', 'stair', 'other']
    const rooms = uses.map((use, i) => box(use, use, [i * 5, 0], 2, 2, use))
    expect(sizeFindings(plan(...rooms))).toEqual([])
  })

  it('never guess a use from the name', () => {
    expect(sizeFindings(plan(box('b', 'Bedroom', [0, 0], 2, 2)))).toEqual([])
    expect(sizeFindings(plan(box('b', 'Bedroom', [0, 0], 2, 2, 'bedrom')))).toEqual([])
  })

  it('check upper floors too, which still get their "no stairs" notice', () => {
    const p = edit(twoFloorHouse(), (copy) => {
      const small = box('attic', 'Attic bedroom', [20, 0], 2, 2.5, 'bedroom', 'first')
      copy.walls.push(...small.walls)
      copy.rooms.push(small.room)
    })
    const report = checkLocalRules(p)
    expect(report.findings.filter((f) => f.code === 'room_too_small')).toMatchObject([
      { floor: 'first', rooms: ['attic'], area: 5 }
    ])
    expect(report.notChecked.some((n) => n.reason === 'no_stairs' && n.floor === 'first')).toBe(true)
  })

  it('leave out a bedroom that does not close, naming it as not checked', () => {
    const p = edit(plan(box('b', 'Bedroom', [0, 0], 2, 2, 'bedroom')), (copy) => {
      copy.walls[1]!.thickness = 0
    })
    const report = checkLocalRules(p)
    expect(report.findings.filter((f) => f.code === 'room_too_small')).toEqual([])
    expect(report.notChecked).toMatchObject([{ reason: 'cannot_be_drawn', rooms: ['b'] }])
  })
})

describe('the area invariant', () => {
  const allBedrooms = (p: FloorPlan): FloorPlan =>
    edit(p, (copy) => {
      for (const r of copy.rooms) r.use = 'bedroom'
    })

  it('is the room polygon’s own area rounded to 0.01 m², for every room of the shared fixtures', () => {
    for (const source of [flat(), twoFloorHouse()]) {
      const p = allBedrooms(source)
      const index = indexPlan(p)
      const found = new Map(sizeFindings(p).map((f) => [f.rooms[0], f] as const))
      for (const room of p.rooms) {
        const rounded = Math.round(area(roomPolygon(room, index)) * 100) / 100
        if (rounded < 6.5) expect(found.get(room.id)?.area).toBe(rounded)
        else expect(found.has(room.id)).toBe(false)
      }
    }
  })

  it('does not depend on which wall the boundary starts from', () => {
    const base = plan(box('b', 'Bedroom', [0, 0], 2.0, 2.9, 'bedroom'))
    for (let shift = 1; shift < 4; shift++) {
      const rotated = edit(base, (copy) => {
        const ids = copy.rooms[0]!.boundary
        copy.rooms[0]!.boundary = [...ids.slice(shift), ...ids.slice(0, shift)]
      })
      expect(sizeFindings(rotated)).toEqual(sizeFindings(base))
    }
  })
})

describe('rooms without a use', () => {
  it('are named once per floor as not checked for size, never as a finding', () => {
    const p = plan(
      box('a', 'Bedroom 1', [0, 0], 3, 3, 'bedroom'),
      box('b', 'Bedroom 2', [5, 0], 3, 3),
      box('c', 'Hall', [10, 0], 3, 3, 'bedrom'),
      box('d', 'Store', [15, 0], 1, 1)
    )
    expect(noUse(p)).toEqual([
      {
        reason: 'no_use',
        floor: 'ground',
        rooms: ['b', 'c', 'd'],
        openings: [],
        message: "Room sizes weren't checked for 3 rooms that don't say what they're for"
      }
    ])
    expect(sizeFindings(p)).toEqual([])
  })

  it('are not mentioned when every room states its use', () => {
    expect(noUse(plan(box('a', 'Bedroom', [0, 0], 3, 3, 'bedroom'), box('k', 'Kitchen', [5, 0], 2, 2, 'kitchen')))).toEqual([])
  })

  it('name the floor in a plan with more than one', () => {
    const p = edit(twoFloorHouse(), (copy) => {
      for (const r of copy.rooms) r.use = 'other'
      copy.rooms.find((r) => (r.floor ?? 'ground') === 'first')!.use = undefined
    })
    expect(noUse(p)).toMatchObject([
      { floor: 'first', message: "On First floor, room sizes weren't checked for 1 room that doesn't say what it's for" }
    ])
  })

  it('leave out rooms that cannot be drawn, which are already named', () => {
    const p = edit(plan(box('a', 'Bedroom', [0, 0], 2, 2), box('b', 'Study', [5, 0], 3, 3)), (copy) => {
      copy.walls[1]!.thickness = 0
    })
    expect(noUse(p)).toMatchObject([{ rooms: ['b'] }])
  })
})

describe('the order of findings', () => {
  it('puts every exit finding before every size finding, whatever the floor', () => {
    const p = edit(twoFloorHouse(), (copy) => {
      const small = box('tiny', 'Tiny bedroom', [20, 0], 2, 2, 'bedroom')
      copy.walls.push(...small.walls)
      copy.rooms.push(small.room)
      // A first-floor room with no door at all.
      const upstairs = box('loft', 'Loft', [30, 0], 3, 3, 'other', 'first')
      copy.walls.push(...upstairs.walls)
      copy.rooms.push(upstairs.room)
    })
    const codes = checkLocalRules(p).findings.map((f) => f.code)
    expect(codes).toContain('room_too_small')
    expect(codes.lastIndexOf('room_without_door')).toBeLessThan(codes.indexOf('room_too_small'))
  })

  it('is the same whatever order the plan lists its entities in', () => {
    const p = plan(
      box('a', 'Bedroom 1', [0, 0], 2, 2, 'bedroom'),
      box('b', 'Dining', [5, 0], 2, 2.5, 'dining'),
      box('c', 'Hall', [10, 0], 3, 3)
    )
    const shuffled = { ...p, walls: [...p.walls].reverse(), rooms: [...p.rooms].reverse() }
    expect(JSON.stringify(checkLocalRules(shuffled))).toBe(JSON.stringify(checkLocalRules(p)))
  })
})
