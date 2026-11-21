import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { indexPlan } from '../plan'
import { roomArea } from '../room'
import { validatePlan } from '../validate'
import { enclosedArea, type Point } from '../../test-support/referee'

/**
 * Lab R-7: two of the most common city flats in Europe are built with walls in a row that
 * change thickness, and Grid could not draw their main rooms until ARE-1.
 *
 * - The Madrid flat (`madrid-flat.json`): the light well's 0.2 m walls carry on as the 0.1 m
 *   partitions of the salón and of Dormitorio 2. Before, both rooms were dropped, the flat
 *   totalled 45.04 m², and the bedroom whose door opens into the salón was said to have none.
 * - The Berlin flat (`berlin-flat.json`): the Berliner Zimmer's court side is a 0.51 m wall
 *   that carries on as a 0.25 m one. Before, the room was dropped.
 *
 * The only way round it was to give both walls the same thickness, which is untrue.
 */
const fixture = (name: string): FloorPlan =>
  parseFloorPlan(JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures', name), 'utf8')))

function areas(plan: FloorPlan, said: [string, string][] = []): Map<string, number> {
  const index = indexPlan(plan)
  expect(validatePlan(plan, index).issues.map((i) => [i.code, i.id])).toEqual(said)
  return new Map(plan.rooms.map((room) => [room.id, Math.abs(roomArea(room, index))]))
}

const total = (byRoom: Map<string, number>): number => [...byRoom.values()].reduce((sum, a) => sum + a, 0)

/** The referee's figure for the room around `seed`, from the wall footprints alone. */
const referee = (plan: FloorPlan, seed: Point): number =>
  enclosedArea(plan.walls.map((w) => ({ start: w.start, end: w.end, thickness: w.thickness })), seed)

describe('R-7 the Madrid flat: a light well whose walls carry on as partitions', () => {
  const plan = fixture('madrid-flat.json')
  // MSG-13: the light well is drawn as a room, so rooms lie on both sides of its three walls,
  // which say they are exterior. They are kept as outside walls, as stated, and each gets one
  // line saying so (lab R-9). The fourth side is the façade.
  // LVL-1 (lab R-12): the flat is on "Planta 4ª", level 4, drawn alone and with no elevation,
  // so it stands on the ground until it states one, and the plan says so first.
  const lightWell: [string, string][] = [
    ['plan/level-gap', 'plan'],
    ['wall/kind-differs', 'patio-s'],
    ['wall/kind-differs', 'patio-e'],
    ['wall/kind-differs', 'patio-n']
  ]
  const byRoom = areas(plan, lightWell)

  it('measures every room', () => {
    expect([...byRoom.keys()]).toEqual(plan.rooms.map((r) => r.id))
  })

  // Worked by hand. The salón runs from the party wall's face (x 0.125) to the partition's
  // (x 6.35) and from the façade's face (y 0.15) to the partition's (y 3.95); the light-well
  // wall stands 0.05 m further in along its 2.275 m, so a strip of 2.275 × 0.05 is not floor.
  // Dormitorio 2 is the same on the other side of the light well.
  it('steps each room at the end of the light-well wall', () => {
    expect(byRoom.get('salon')).toBeCloseTo(6.225 * 3.8 - 2.275 * 0.05, 9) // 23.54125
    expect(byRoom.get('dorm2')).toBeCloseTo(5.025 * 2.425 - 2.275 * 0.05, 9) // 12.071875
    expect(byRoom.get('patio')).toBeCloseTo(2.175 * 2.2, 9) // 4.785
  })

  // 81.10 m² is the total of the lab's workaround, where the light-well walls were drawn
  // 0.1 m thick to make the rooms drawable. With the walls as built the three strips of
  // 0.05 m the thicker walls take (0.114 + 0.114 + 0.218 m²) are not floor.
  it('totals 80.66 m² as built, and 81.10 m² with the light-well walls drawn 0.1 m thick', () => {
    expect(total(byRoom)).toBeCloseTo(81.10125 - 2 * 2.275 * 0.05 - 2.175 * 0.1, 9) // 80.65625
    const thinned = parseFloorPlan({
      ...plan,
      walls: plan.walls.map((w) => (w.id === 'patio-s' || w.id === 'patio-n' ? { ...w, thickness: 0.1 } : w))
    })
    expect(total(areas(thinned, lightWell))).toBeCloseTo(81.10125, 9)
  })

  // The referee fills the corner square where the light well's east wall meets the row:
  // 0.05 × 0.1 m in the salón and in Dormitorio 2 (lab V-10).
  it.each([
    ['salon', [2.96, 2.67], 0.005],
    ['dorm1', [8.16, 2.05], 0],
    ['patio', [1.21, 5.2], 0],
    ['cocina', [3.83, 5.2], 0],
    ['dorm2', [2.56, 7.27], 0.005],
    ['pasillo', [5.8, 6.46], 0],
    ['bano', [8.16, 5.0], 0],
    ['aseo', [8.16, 6.75], 0],
    ['despensa', [8.16, 8.21], 0]
  ] as const)('agrees with the referee on %s, but for a corner square', (id, seed, corner) => {
    expect(byRoom.get(id)! - referee(plan, seed)).toBeCloseTo(corner, 9)
  })
})

describe('R-7 the Berlin flat: a Berliner Zimmer whose court wall carries on thinner', () => {
  const plan = fixture('berlin-flat.json')
  // MSG-13: the balcony is drawn as a room against the court wall, which says it is exterior:
  // kept as an outside wall, as stated, with one line saying so.
  // LVL-1 (lab R-12): "3. Obergeschoss", level 3, drawn alone, with no elevation.
  const byRoom = areas(plan, [['plan/level-gap', 'plan'], ['wall/kind-differs', 'sw']])

  it('measures every room', () => {
    expect([...byRoom.keys()]).toEqual(plan.rooms.map((r) => r.id))
  })

  // Worked by hand: x from the cross wall's face (5.125) to the fire wall's (9.81), y from the
  // middle wall's face (6.69) to the thinner wall's (10.875). The court wall stands 0.13 m
  // further in along its 0.875 m.
  it('measures the Berliner Zimmer with a step at the end of the court wall', () => {
    expect(byRoom.get('berliner')).toBeCloseTo(4.685 * 4.185 - 0.875 * 0.13, 9) // 19.492975
  })

  // The referee fills the corner of the 0.51 m side-wing wall that ends at the step, down to
  // the court wall's face: 0.255 × 0.13 m (lab V-10, a decision on corners still open).
  it('agrees with the referee on the Berliner Zimmer, but for a corner square', () => {
    expect(byRoom.get('berliner')! - referee(plan, [6.98, 9.44])).toBeCloseTo(0.255 * 0.13, 9)
  })

  it.each([
    ['wohn', [2.81, 3.31]],
    ['schlaf', [7.68, 3.31]],
    ['flur', [2.53, 7.32]],
    ['bad', [1.27, 9.4]],
    ['kammer1', [3.67, 9.4]],
    ['kueche', [8.03, 13.03]],
    ['maedchen', [8.03, 16.47]],
    ['balkon', [5.16, 13.25]]
  ] as const)('agrees with the referee on %s', (id, seed) => {
    expect(byRoom.get(id)).toBeCloseTo(referee(plan, seed), 9)
  })
})
