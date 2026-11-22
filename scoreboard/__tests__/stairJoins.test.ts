/**
 * LVL-3, lab AU3-1: stair rooms that lie one over the other on neighbouring floors say where the
 * stair is. The lab read the room outlines of its 74 plans of two floors or more and set the
 * rooms used as a stair on neighbouring levels against each other: of the 120 pairs of
 * neighbouring levels with a stair room on both, 117 share half or more, and the 3 that do not
 * are exactly its planted faults (the townhouse with its stair moved, twice, and h01b). Grid's
 * own join (`floorJoins`) must find the same, on the same plans as the lab stored them.
 */
import { describe, expect, it } from 'vitest'
import { floorJoins, planFloors, roomOutlinesByFloor } from '@ongrid/floorplan/geometry'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { labPlans } from '../src/data'

/** The 74 plans the lab ran AU3-1 on, by their names in the lab. */
const AU3_PLANS = [
  'A/scenarios/basement-flat.json',
  'A/scenarios/duplex-stacked.json',
  'A/scenarios/probes/tiny-house-low-ground.json',
  'A/scenarios/probes/townhouse-ghost-floor.json',
  'A/scenarios/probes/townhouse-level-gap.json',
  'A/scenarios/probes/townhouse-stair-misaligned.json',
  'A/scenarios/probes/townhouse-v1-id-clash.json',
  'A/scenarios/tiny-house.json',
  'A/scenarios/townhouse.json',
  'B/scenarios/s08-double-height.json',
  'B/scenarios/s10b-split-integer-levels.json',
  'C/scenarios/school-2storey.json',
  'C/scenarios/warehouse-columns.json',
  'C/scenarios/warehouse-split.json',
  'C/scenarios/warehouse.json',
  'D/scenarios/d2-block-g+5.json',
  'D/scenarios/d2-door-to-air-floor3.json',
  'D/scenarios/d2-dup-ids.json',
  'D/scenarios/d2-mistake-floor4.json',
  'D/scenarios/d2-stair-shifted-floor3.json',
  'D/scenarios/d5-block-with-basement.json',
  'D/scenarios/scale/g+1.json',
  'D/scenarios/scale/g+10.json',
  'D/scenarios/scale/g+20.json',
  'D/scenarios/scale/g+5.json',
  'F/scenarios/odd-house.json',
  'F/scenarios/two-storey.json',
  'G/scenarios/s03c-roof-terrace.json',
  'G/scenarios/s05b-pool-as-lower-floor.json',
  'G/scenarios/s06a-slope-lower-floor.json',
  'G/scenarios/s06b-slope-window-in-buried-wall.json',
  'G/scenarios/s06c-slope-site-fields.json',
  'H/scenarios/h01-stair-straight.json',
  'H/scenarios/h01a-stair-guessed-keys.json',
  'H/scenarios/h01b-stair-shifted.json',
  'H/scenarios/h02-stair-L-one-room.json',
  'H/scenarios/h02b-stair-L-three-rooms.json',
  'H/scenarios/h03-stair-U.json',
  'H/scenarios/h04-stair-spiral.json',
  'H/scenarios/h05-stair-cupboard.json',
  'H/scenarios/h06-lift-four-floors.json',
  'H/scenarios/h06b-lift-shaft-shifted.json',
  'H/scenarios/h08a-void-gallery-undrawn.json',
  'H/scenarios/h08b-void-gallery-void-as-room.json',
  'H/scenarios/h09a-mezzanine-direct.json',
  'H/scenarios/h09b-mezzanine-split-walls.json',
  'H/scenarios/h09c-mezzanine-split-walls.json',
  'H/scenarios/h10-shop-under-flats.json',
  'H/scenarios/h10b-partitions-left-default.json',
  'H/scenarios/h10c-one-wall-typo-27.json',
  'H/scenarios/h11a-parapet-taller-top-walls.json',
  'H/scenarios/h11b-parapet-on-roof-floor.json',
  'H/scenarios/h11c-empty-roof-floor.json',
  'H/scenarios/h11d-roof-terrace-room.json',
  'H/scenarios/h15-rooflight-dormer-tries.json',
  'H/scenarios/h17-attic-knee-wall.json',
  'H/scenarios/h18-basement-light-well.json',
  'H/scenarios/h19-overhang-setback-terrace.json',
  'H/scenarios/h20-balcony-cantilever.json',
  'H/scenarios/h21-ceiling-raised-20cm.json',
  'H/scenarios/h21b-no-heights-stated.json',
  'H/scenarios/hx1-two-floors-same-level.json',
  'H/scenarios/hx2-no-level-0.json',
  'H/scenarios/hx3-window-through-two-storeys.json',
  'H/scenarios/hx5-low-walls-set-storey-height.json',
  'J/scenarios/2-architect/standin-three-as-floors.json',
  'M/scenarios/esc-high-4-silent-upstairs-door-to-air.json',
  'M/scenarios/undrawn-3-silent-upstairs.json',
  'M/scenarios/v-floor-5-silent-same-level.json',
  'M/scenarios/v-floor-7-silent-floating.json',
  'N/scenarios/d5-block-with-basement.json',
  'N/scenarios/odd-house.json',
  'O/scenarios/odd-house.json',
  'bench/verify/inputs/two-storey.json',
]

describe('stair rooms on neighbouring floors (LVL-3, lab AU3-1)', () => {
  const byName = new Map(labPlans().map((p) => [p.name, p.text] as const))
  const results = AU3_PLANS.map((name) => {
    const plan = parseFloorPlan(JSON.parse(byName.get(name)!))
    const floors = planFloors(plan)
    const levelOf = new Map(floors.map((f) => [f.id, f.level] as const))
    const levels = [...new Set(floors.map((f) => f.level))].sort((a, b) => a - b)
    // As the lab did, only rooms Grid can draw: their outlines are what lie one over the other.
    const outlines = roomOutlinesByFloor(plan)
    const use = new Map(plan.rooms.map((room) => [room.id, room.use] as const))
    const stairsOn = (level: number): boolean =>
      floors.some((f) => f.level === level && [...(outlines.get(f.id)?.keys() ?? [])].some((id) => use.get(id) === 'stair'))
    const joins = floorJoins(plan, outlines)
    const pairs = levels.slice(1).map((upper, i) => {
      const lower = levels[i]!
      const joined = joins.joins.some(
        (j) => j.kind === 'stair-room' && levelOf.get(j.lower.floor) === lower && levelOf.get(j.upper.floor) === upper
      )
      const outOfLine = joins.outOfLine.some((o) => o.kind === 'stair' && levelOf.get(o.upper[0]!.floor) === upper)
      return { lower, upper, both: stairsOn(lower) && stairsOn(upper), joined, outOfLine }
    })
    return { name, pairs }
  })

  it('reads all 74 plans, with 155 pairs of neighbouring levels', () => {
    expect(results).toHaveLength(74)
    expect(results.flatMap((r) => r.pairs)).toHaveLength(155)
  })

  it('joins 117 of the 120 pairs with a stair room on both levels', () => {
    const both = results.flatMap((r) => r.pairs.filter((p) => p.both))
    expect(both).toHaveLength(120)
    expect(both.filter((p) => p.joined)).toHaveLength(117)
  })

  it('names the other 3 as out of line, and they are exactly the planted faults', () => {
    const named = results.flatMap((r) => r.pairs.filter((p) => p.outOfLine).map((p) => [r.name, p.lower, p.upper]))
    expect(named).toEqual([
      ['A/scenarios/probes/townhouse-stair-misaligned.json', 0, 1],
      ['A/scenarios/probes/townhouse-stair-misaligned.json', 1, 2],
      ['H/scenarios/h01b-stair-shifted.json', 0, 1]
    ])
  })
})
