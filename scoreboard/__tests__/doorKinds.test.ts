/**
 * CNT-14 (lab EL-5): kinds of door, on the lab's own plans (`scoreboard/data/lab-plans.ndjson.gz`).
 *
 * The lab's AU3 scanned the plans of its first groups and counted 176 doors 1.5 or more wide that
 * state a hinge and a swing, in 53 plans: each was drawn as one swinging leaf that wide, a 3.5 m
 * dock door as a 3.5 m arc. Now each is either typed or flagged: a door that states no kind and is
 * at least `wideSingleLeaf` wide gets `opening/wide-single-leaf`, and one that states its kind is
 * drawn and checked as it.
 */
import { describe, expect, it } from 'vitest'
import { inspectPlan } from '@ongrid/rules'
import { buildFloorPlan, openingSymbol, planForFloor, validateDoorSweeps } from '@ongrid/floorplan/geometry'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { labPlans } from '../src/data'

/** The groups AU3's scan read (lab/AU3/tools/scan_plans.py), the first and second waves. */
const GROUPS = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'Q', 'X', 'bench'])

interface RawDoor {
  readonly id: string
  readonly type: unknown
  readonly width: unknown
  readonly hinge?: unknown
  readonly swing?: unknown
}
interface RawPlan {
  readonly walls: unknown[]
  readonly units?: string
  readonly openings?: RawDoor[]
}

/** The plans AU3 scanned, as JSON, with the doors it counted: a number 1.5 or more wide, hinge and swing stated. */
function wideDoors(): { name: string; plan: RawPlan; text: string; doors: string[] }[] {
  const found: { name: string; plan: RawPlan; text: string; doors: string[] }[] = []
  for (const stored of labPlans()) {
    if (!GROUPS.has(stored.name.split('/')[0]!)) continue
    let plan: unknown
    try {
      plan = JSON.parse(stored.text)
    } catch {
      continue
    }
    if (typeof plan !== 'object' || plan === null || !Array.isArray((plan as RawPlan).walls)) continue
    const doors = ((plan as RawPlan).openings ?? [])
      .filter((o) => o !== null && typeof o === 'object' && o.type === 'door' && typeof o.width === 'number' && o.width >= 1.5 && Boolean(o.hinge) && Boolean(o.swing))
      .map((o) => o.id)
    if (doors.length > 0) found.push({ name: stored.name, plan: plan as RawPlan, text: stored.text, doors })
  }
  return found
}

describe('EL-5: the lab\'s doors of 1.5 m or more (done when 1)', () => {
  const plans = wideDoors()

  it('finds the 176 doors in 53 plans that AU3 counted', () => {
    expect(plans.reduce((n, p) => n + p.doors.length, 0)).toBe(176)
    expect(plans).toHaveLength(53)
  })

  it('flags every one that is 1.5 m or more as read, and says the unit of the twelve that are not', () => {
    let flagged = 0
    let notDrawn = 0
    let inUnit = 0
    for (const { name, plan, text, doors } of plans) {
      const result = inspectPlan(text)
      const wide = new Set(result.lines.filter((l) => l.code === 'opening/wide-single-leaf').map((l) => l.thing.id))
      const units = plan.units ?? 'm'
      if (units === 'm') {
        // Every door in a plan in metres is flagged, by id: asked about as one leaf this wide, or,
        // when the drawing cannot place it (wider than its wall, on a wall left out), left out with
        // its own line, and so drawn as no leaf at all.
        const leftOut = new Set(result.lines.filter((l) => l.kind === 'left-out').flatMap((l) => [l.thing.id, ...l.also]))
        for (const id of doors) {
          expect(wide.has(id) || leftOut.has(id), `${name} ${id}`).toBe(true)
          if (wide.has(id)) flagged += 1
          else notDrawn += 1
        }
      } else {
        // A plan in millimetres or feet is read in its unit (WRT-7), one line saying so: its doors are under 1.5 m.
        expect(result.lines.some((l) => l.code === 'plan/read-as-meant'), name).toBe(true)
        expect(wide.size, name).toBe(0)
        inUnit += doors.length
      }
    }
    // 159 asked about; 5 the drawing leaves out with a line of their own; 12 in a plan in mm or ft.
    expect([flagged, notDrawn, inUnit]).toEqual([159, 5, 12])
  })

  it('draws and checks each as its kind once it states one: no arc, no question', () => {
    for (const { name, plan, doors } of plans) {
      if ((plan.units ?? 'm') !== 'm') continue
      const ids = new Set(doors)
      const typed = parseFloorPlan({ ...plan, openings: (plan.openings ?? []).map((o) => (ids.has(o.id) ? { ...o, kind: 'roller' } : o)) })
      const issues = validateDoorSweeps(typed, (o) => o).filter((i) => ids.has(i.id))
      expect(issues.map((i) => i.code), name).toEqual([])
      for (const floor of new Set(typed.walls.map((w) => w.floor ?? 'ground'))) {
        for (const drawn of buildFloorPlan(planForFloor(typed, floor)).openings) {
          if (!ids.has(drawn.id)) continue
          const symbol = openingSymbol(drawn)!
          expect(symbol.kind, `${name} ${drawn.id}`).toBe('roller')
          expect(symbol.pieces.some((p) => p.shape === 'arc'), `${name} ${drawn.id}`).toBe(false)
        }
      }
    }
  })

  it('the warehouse\'s three 3.5 m dock doors: three arcs and three questions as written, three roller doors once typed', () => {
    const warehouse = plans.find((p) => p.name === 'C/scenarios/warehouse.json')!
    expect(warehouse.doors).toHaveLength(3)
    const plan = parseFloorPlan(warehouse.plan)
    const drawn = buildFloorPlan(plan).openings.filter((o) => warehouse.doors.includes(o.id))
    expect(drawn.map((o) => o.width)).toEqual([3.5, 3.5, 3.5])
    expect(drawn.map((o) => openingSymbol(o)!.pieces.filter((p) => p.shape === 'arc').map((p) => p.shape === 'arc' && p.radius))).toEqual([[3.5], [3.5], [3.5]])
    const typed = { ...plan, openings: plan.openings.map((o) => (warehouse.doors.includes(o.id) ? { ...o, kind: 'roller' as const } : o)) }
    const result = inspectPlan(typed)
    expect(result.lines.filter((l) => l.code === 'opening/wide-single-leaf')).toEqual([])
    expect(buildFloorPlan(typed).openings.filter((o) => warehouse.doors.includes(o.id)).map((o) => openingSymbol(o)!.kind)).toEqual(['roller', 'roller', 'roller'])
  })
})
