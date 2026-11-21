/**
 * LVL-3: stairs that join two floors, decided in LVL-2 as designed objects. A stair states its
 * floors, its width and its walking line; Grid works out the rise, the risers, the going and
 * the rooms it joins, and the way-out check follows routes down it (lab VE-1). Rooms used as a
 * stair on neighbouring floors that lie one over the other are a stair too (lab AU3-1), and
 * stair rooms or lift shafts out of line are named.
 */
import { describe, expect, it } from 'vitest'
import { FloorPlanSchema, parseFloorPlan, ROOM_USES } from '../../types/floorplan'
import type { FloorPlan, Stair } from '../plan'
import { planStairs } from '../stairs'
import { brokenOnFloor, validatePlan } from '../validate'
import { floorJoins } from '../floorJoins'
import { checkLocalRules } from '../rules'
import { buildFloorPlan } from '../floorplan'
import { buildScene } from '../scene3d'
import { planForFloor } from '../floors'
import { toObj } from '../export/obj'
import { toIfc } from '../export/ifc'
import { planNotes } from '../../notes/notes'
import { edit, stairHouse, stairRoomHouse, twoFloorHouse, withoutOpening } from '../../test-support/plans'

const withStair = (source: FloorPlan, stair: Partial<Stair>): FloorPlan =>
  edit(source, (copy) => {
    copy.stairs = [{ ...copy.stairs![0]!, ...stair }]
  })
const laidOut = (plan: FloorPlan) => planStairs(plan, brokenOnFloor)
const codes = (plan: FloorPlan): string[] => validatePlan(plan).issues.filter((i) => i.entity === 'stair').map((i) => i.code)

describe('the stair in the plan file (LVL-2)', () => {
  it('reads a stair with its floors, width, walking line and risers', () => {
    const stair = { id: 's1', from: 'ground', to: 'first', width: 0.9, run: [[1, 1], [1, 4.5]], risers: 16 }
    const plan = parseFloorPlan({ walls: [], stairs: [stair] })
    expect(plan.stairs).toEqual([stair])
  })

  it('adds no key to a plan that states no stairs', () => {
    expect('stairs' in parseFloorPlan({ walls: [] })).toBe(false)
  })

  it('reads a straight stair said by its two ends as its walking line (lab h01a)', () => {
    const plan = parseFloorPlan({
      walls: [],
      stairs: [{ id: 'st1', from: 'ground', to: 'first', type: 'straight', start: [0.6, 2.6], end: [0.6, 5.8], width: 0.9, risers: 16 }]
    })
    expect(plan.stairs).toEqual([{ id: 'st1', from: 'ground', to: 'first', run: [[0.6, 2.6], [0.6, 5.8]], width: 0.9, risers: 16 }])
  })

  it('refuses a walking line of one point, a width of 0 and a riser count that is not whole', () => {
    const base = { id: 's1', from: 'ground', to: 'first', width: 0.9, run: [[0, 0], [0, 3]] }
    for (const bad of [{ run: [[0, 0]] }, { width: 0 }, { risers: 15.5 }]) {
      const result = FloorPlanSchema.safeParse({ walls: [], stairs: [{ ...base, ...bad }] })
      expect(result.success, JSON.stringify(bad)).toBe(false)
    }
  })

  it('knows a lift as a room use', () => {
    expect(ROOM_USES).toContain('lift')
  })
})

describe('what Grid works out from a stair', () => {
  const [stair] = laidOut(stairHouse()).stairs

  it('climbs from the hall to the landing, the 2.95 m between the floors', () => {
    expect(stair!.lower).toMatchObject({ floor: 'ground', room: 'hall' })
    expect(stair!.upper).toMatchObject({ floor: 'first', room: 'landing' })
    expect(stair!.rise).toBeCloseTo(2.95, 9)
  })

  it('works out 14 risers of 0.21 m and treads of 0.215 m, stride nearest 0.63 m', () => {
    expect(stair!.risersStated).toBe(false)
    expect(stair!.risers).toBe(14)
    expect(stair!.riserHeight).toBeCloseTo(2.95 / 14, 9)
    expect(stair!.going).toBeCloseTo(2.8 / 13, 9)
    expect(2 * stair!.riserHeight + stair!.going).toBeCloseTo(0.6368, 4)
    expect(stair!.pitch).toBeCloseTo((Math.atan2(2.95 / 14, 2.8 / 13) * 180) / Math.PI, 9)
  })

  it('draws a line across the flight at every riser, the first at the foot and the last at the head', () => {
    const [flight] = stair!.flights
    expect(flight!.riserLines).toHaveLength(14)
    const [left, right] = flight!.riserLines[0]!
    expect([left.x, left.y, right.x, right.y].map((v) => Number(v.toFixed(9)))).toEqual([0.15, 0.6, 1.05, 0.6])
    expect(flight!.riserLines[13]![0].y).toBeCloseTo(3.4, 9)
  })

  it('counts its footprint once: the flight, 0.9 × 2.8 m', () => {
    expect(stair!.footprint).toBeCloseTo(2.52, 9)
  })

  it('takes the number of risers the plan states', () => {
    const [stated] = laidOut(withStair(stairHouse(), { risers: 16 })).stairs
    expect(stated!.risersStated).toBe(true)
    expect(stated!.risers).toBe(16)
    expect(stated!.going).toBeCloseTo(2.8 / 15, 9)
  })

  it('lays out the same stair stated from the top down', () => {
    const [down] = laidOut(withStair(stairHouse(), { from: 'first', to: 'ground', run: [[0.6, 3.4], [0.6, 0.6]] })).stairs
    expect(down!.lower.floor).toBe('ground')
    expect(down!.line).toEqual(stair!.line)
    expect(down!.risers).toBe(stair!.risers)
  })

  it('climbs from a raised genkan less far (LVL-7)', () => {
    const raised = edit(stairHouse(), (copy) => {
      copy.rooms.find((r) => r.id === 'hall')!.floorOffset = 0.2
    })
    expect(laidOut(raised).stairs[0]!.rise).toBeCloseTo(2.75, 9)
  })

  it('turns on a square landing as wide as the flight, and shares the treads between the flights', () => {
    const l = withStair(stairHouse(), { run: [[0.6, 0.6], [0.6, 3.2], [3.2, 3.2]] })
    const [turned] = laidOut(l).stairs
    expect(turned!.flights).toHaveLength(2)
    expect(turned!.landings).toHaveLength(1)
    // Flights of 2.6 − 0.45 m each, 2.15 m: 17 risers, shared 8 and 9.
    expect(turned!.flights.map((f) => f.risers)).toEqual([8, 9])
    expect(turned!.flights.reduce((n, f) => n + f.risers, 0)).toBe(turned!.risers)
    expect(turned!.landings[0]!.risersBelow).toBe(turned!.flights[0]!.risers)
    // Counter-clockwise, centred on the turn at (0.6, 3.2).
    expect(turned!.landings[0]!.outline.map((p) => [Number(p.x.toFixed(9)), Number(p.y.toFixed(9))])).toEqual([
      [1.05, 2.75],
      [1.05, 3.65],
      [0.15, 3.65],
      [0.15, 2.75]
    ])
    expect(turned!.footprint).toBeCloseTo(2 * 0.9 * 2.15 + 0.81, 9)
  })
})

describe('a stair that cannot be laid out, or joins nothing', () => {
  it('is left out, with its problem said by code', () => {
    expect(codes(withStair(stairHouse(), { to: 'frist' }))).toEqual(['stair/unknown-floor'])
    expect(codes(withStair(stairHouse(), { to: 'ground' }))).toEqual(['stair/same-floor'])
    expect(codes(withStair(stairHouse(), { run: [[0.6, 0.6], [0.6, 0.62]] }))).toEqual(['stair/run-too-short'])
    expect(codes(withStair(stairHouse(), { run: [[0.6, 0.6], [0.6, 1], [2, 1]] }))).toEqual(['stair/run-too-short'])
    expect(codes(withStair(stairHouse(), { risers: 1 }))).toEqual(['stair/too-few-risers'])
    const level = edit(stairHouse(), (copy) => {
      copy.floors = copy.floors!.map((f) => ({ ...f, elevation: 0 }))
    })
    expect(codes(level)).toContain('stair/no-rise')
    for (const plan of [withStair(stairHouse(), { to: 'frist' }), level]) expect(laidOut(plan).stairs).toEqual([])
  })

  it('says a second stair with the id of the first, and leaves it out', () => {
    const twice = edit(stairHouse(), (copy) => {
      copy.stairs = [copy.stairs![0]!, { ...copy.stairs![0]!, run: [[2, 1], [2, 3]] }]
    })
    expect(codes(twice)).toEqual(['stair/duplicate-id'])
    expect(laidOut(twice).stairs).toHaveLength(1)
  })

  it('warns when an end is in no room, and then joins nothing', () => {
    const outside = withStair(stairHouse(), { run: [[0.6, -2], [0.6, 0.6]] })
    const issues = validatePlan(outside).issues.filter((i) => i.entity === 'stair')
    expect(issues).toMatchObject([{ code: 'stair/end-in-no-room', id: 's1', severity: 'warning' }])
    expect(issues[0]!.message).toContain('starts on "Ground floor" in no room')
    expect(floorJoins(outside).joins).toEqual([])
    expect(checkLocalRules(outside).notChecked).toMatchObject([{ reason: 'no_stairs', floor: 'first' }])
  })

  it('is said on the slice of each floor it joins, and on no other', () => {
    const plan = withStair(stairHouse(), { risers: 1 })
    expect(validatePlan(planForFloor(plan, 'ground')).issues.map((i) => i.code)).toContain('stair/too-few-risers')
    expect(validatePlan(planForFloor(plan, 'first')).issues.map((i) => i.code)).toContain('stair/too-few-risers')
  })
})

describe('the way out, down the stair (lab VE-1)', () => {
  it('checks the first floor of the two-floor house through its stair', () => {
    expect(checkLocalRules(twoFloorHouse()).notChecked.map((n) => n.reason)).toEqual(['no_stairs'])
    const report = checkLocalRules(stairHouse())
    expect(report.notChecked).toEqual([])
    // The balcony door is still no way out; nothing else is said.
    expect(report.findings.map((f) => f.code)).toEqual(['door_to_outside_above_ground'])
  })

  it('names a room upstairs that the stair does not reach, with its ways through', () => {
    const report = checkLocalRules(withoutOpening(stairHouse(), 'd_up'))
    // Its balcony door leads outside in mid-air: a way through, but no way out.
    expect(report.findings.filter((f) => f.floor === 'first').map((f) => [f.code, f.rooms, f.through])).toEqual([
      ['door_to_outside_above_ground', ['study'], undefined],
      ['no_route_to_exit', ['study'], []]
    ])
    // The hall shut off from the rest of the ground floor, whose way out is now the kitchen's.
    const shut = edit(stairHouse(), (copy) => {
      copy.openings = copy.openings.filter((o) => !['front', 'd_hb', 'd_hk'].includes(o.id))
      copy.openings.push({ id: 'back', wall: 's2', type: 'door', offset: 4, width: 0.9, sill: 0, height: 2.1 })
    })
    const cut = checkLocalRules(shut)
    // The bedroom and bathroom were reached through the hall, and are cut off with it.
    expect(cut.findings.filter((f) => f.code === 'no_route_to_exit').map((f) => [f.floor, f.rooms[0]])).toEqual([
      ['ground', 'bathroom'],
      ['ground', 'bedroom'],
      ['ground', 'hall'],
      ['first', 'landing'],
      ['first', 'study']
    ])
    const landing = cut.findings.find((f) => f.code === 'no_route_to_exit' && f.rooms[0] === 'landing')
    expect(landing?.through).toEqual([
      { room: 'hall', via: 's1' },
      { room: 'study', via: 'd_up' }
    ])
  })

  it('joins stair rooms that lie one over the other, floor to floor, to the front door', () => {
    const report = checkLocalRules(stairRoomHouse())
    expect(report.findings).toEqual([])
    expect(report.notChecked).toEqual([])
    expect(floorJoins(stairRoomHouse()).joins.map((j) => [j.kind, j.lower.room, j.upper.room])).toEqual([
      ['stair-room', 'ground-stair', 'first-stair'],
      ['stair-room', 'first-stair', 'second-stair']
    ])
  })

  it('follows a room cut off upstairs down nothing, and says so', () => {
    const report = checkLocalRules(withoutOpening(stairRoomHouse(), 'second-d'))
    expect(report.findings.map((f) => [f.code, f.floor, f.rooms])).toEqual([['room_without_door', 'second', ['second-main']]])
  })

  it('reads a room id that repeats from floor to floor as two rooms', () => {
    const repeated = edit(stairRoomHouse(), (copy) => {
      for (const room of copy.rooms) if (room.floor !== 'ground') room.id = room.id.replace(/^(first|second)-/, '')
      copy.openings = copy.openings.filter((o) => o.id !== 'second-d')
    })
    expect(checkLocalRules(repeated).findings.map((f) => [f.code, f.floor, f.rooms])).toEqual([['room_without_door', 'second', ['main']]])
  })

  it('names a stair room out of line, and checks nothing above it (lab AU2)', () => {
    const report = checkLocalRules(stairRoomHouse({ shifted: true }))
    expect(report.findings.map((f) => [f.code, f.floor, f.rooms])).toEqual([
      ['stair_out_of_line', 'first', ['first-stair', 'ground-stair']],
      ['stair_out_of_line', 'second', ['second-stair', 'first-stair']]
    ])
    expect(report.findings[0]!.message).toBe(
      'The stair "Stair" on "First floor" does not lie over "Stair" on "Ground floor", so it does not join the two floors'
    )
    expect(report.notChecked.map((n) => n.message)).toEqual([
      'The way out of "First floor" was not checked: no stair joins it to the ground floor',
      'The way out of "Second floor" was not checked: no stair joins it to the ground floor'
    ])
    expect(report.rules.map((r) => r.id)).toContain('stairs-line-up')
  })

  it('names a lift shaft out of line, and never takes a lift as a way out', () => {
    const lifts = checkLocalRules(stairRoomHouse({ use: 'lift' }))
    expect(lifts.notChecked.map((n) => n.floor)).toEqual(['first', 'second'])
    expect(lifts.findings).toEqual([])
    const shifted = checkLocalRules(stairRoomHouse({ use: 'lift', shifted: true }))
    expect(shifted.findings.map((f) => f.code)).toEqual(['lift_out_of_line', 'lift_out_of_line'])
    expect(shifted.findings[0]!.message).toBe(
      'The lift shaft "Stair" on "First floor" does not lie over "Stair" on "Ground floor", so the shaft is out of line'
    )
  })

  it('gives each out-of-line finding a note', () => {
    const plan = stairRoomHouse({ shifted: true })
    const notes = planNotes(plan, checkLocalRules(plan)).notes
    expect(notes[0]!.title.map((t) => t.text).join('')).toBe('The stair Stair does not line up with the floor below')
  })
})

describe('the stair drawn', () => {
  it('on both floors it joins, its lower floor ending the arrow', () => {
    const ground = buildFloorPlan(planForFloor(stairHouse(), 'ground')).stairs
    const first = buildFloorPlan(planForFloor(stairHouse(), 'first')).stairs
    expect(ground.map((s) => [s.id, s.end, s.risers])).toEqual([['s1', 'lower', 14]])
    expect(first.map((s) => [s.id, s.end])).toEqual([['s1', 'upper']])
    expect(ground[0]!.flights[0]!.riserLines).toHaveLength(14)
    expect(buildFloorPlan(twoFloorHouse()).stairs).toEqual([])
  })

  it('in 3D on the floor it rises from: a block per tread, the last one riser short of the floor above', () => {
    const ground = buildScene(planForFloor(stairHouse(), 'ground'))
    expect(ground.stairs).toHaveLength(1)
    const blocks = ground.stairs[0]!.blocks
    expect(blocks).toHaveLength(13)
    expect(blocks.every((b) => b.bottom === 0)).toBe(true)
    expect(blocks[12]!.top).toBeCloseTo(2.95 - 2.95 / 14, 9)
    expect(buildScene(planForFloor(stairHouse(), 'first')).stairs).toEqual([])
  })

  it('in the OBJ file and the IFC file, as a stair with its figures', () => {
    expect(toObj(buildScene(planForFloor(stairHouse(), 'ground')))).toContain('o stair_s1')
    const ifc = toIfc(stairHouse())
    expect(ifc).toMatch(/IFCSTAIR\('[^']+',#\d+,'Main stair',\$,\$,#\d+,\$,\$,\.STRAIGHT_RUN_STAIR\.\)/)
    expect(ifc).toMatch(/IFCSTAIRFLIGHT\('[^']+',#\d+,'Main stair flight 1',\$,\$,#\d+,#\d+,\$,14,13,0\.2107142857,0\.2153846154\)/)
    expect(toIfc(twoFloorHouse())).not.toContain('IFCSTAIR')
  })
})
