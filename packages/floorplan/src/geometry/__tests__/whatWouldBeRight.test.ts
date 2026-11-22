/**
 * MSG-7 (lab MS-13): the drawing check says what would be right, not only what is wrong: the
 * width or offset that fits, the wall most likely meant, and plain words for a wall with no
 * length. Each change that would clear a problem is also given as data (`fixes`).
 */
import { describe, expect, it } from 'vitest'
import { validatePlan } from '../validate'
import { indexPlan } from '../plan'
import { parseFloorPlan } from '../../types/floorplan'
import { closestId, likelyId, likelyMeant } from '../../types/nearest'

const wall = (id: string, start: number[], end: number[]) => ({ id, start, end, thickness: 0.2, height: 2.7, kind: 'exterior' })
const box = () => [wall('ext-south', [0, 0], [4.3, 0]), wall('ext-east', [4.3, 0], [4.3, 4]), wall('ext-north', [4.3, 4], [0, 4]), wall('ext-west', [0, 4], [0, 0])]

function issues(raw: Record<string, unknown>) {
  const plan = parseFloorPlan({ version: '1', units: 'm', rooms: [], ...raw })
  return validatePlan(plan, indexPlan(plan)).issues
}

describe('an opening that runs off its 4.30 m wall (MS-13)', () => {
  it('states the width that fits at its offset, 3.80 m, and gives it as a fix', () => {
    const [issue] = issues({ walls: box(), openings: [{ id: 'd', wall: 'ext-south', type: 'door', offset: 0.5, width: 5, height: 2.1 }] })
    expect(issue!.code).toBe('opening/out-of-wall')
    expect(issue!.message).toBe(
      'Opening "d" runs from 0.50 to 5.50 m on wall "ext-south", which is 4.30 m long: it runs 1200 mm past the end of ' +
        'the wall, more than the 1 mm Grid allows. It is 700 mm wider than the wall is long; at its offset of 0.50 m, a ' +
        'width up to 3.80 m fits.'
    )
    expect(issue!.fixes).toEqual([{ part: 'opening', id: 'd', width: 3.8 }])
  })

  it('gives both fixes when moving it or narrowing it would do', () => {
    const [issue] = issues({ walls: box(), openings: [{ id: 'd', wall: 'ext-south', type: 'door', offset: 3.9, width: 0.9, height: 2.1 }] })
    expect(issue!.fixes).toEqual([
      { part: 'opening', id: 'd', offset: 3.4 },
      { part: 'opening', id: 'd', width: 0.4 }
    ])
  })
})

describe('a wall the plan does not have', () => {
  it('ext-nort gets "did you mean ext-north", as a message and as data', () => {
    const [issue] = issues({ walls: box(), openings: [{ id: 'w1', wall: 'ext-nort', type: 'window', offset: 1, width: 1.2, height: 1.2, sill: 0.9 }] })
    expect(issue!.message).toBe('Opening "w1" points at wall "ext-nort", which is not in the plan: did you mean "ext-north"?')
    expect(issue!.fixes).toEqual([{ part: 'opening', id: 'w1', wall: 'ext-north' }])
  })

  it('names none when no wall is near', () => {
    const [issue] = issues({ walls: box(), openings: [{ id: 'w1', wall: 'garden', type: 'window', offset: 1, width: 1.2, height: 1.2 }] })
    expect(issue!.message).toBe('Opening "w1" points at wall "garden", which is not in the plan')
    expect(issue!.fixes).toBeUndefined()
  })
})

describe('plain words', () => {
  it('a wall with no length says so, and where, not "start === end"', () => {
    const [issue] = issues({ walls: [wall('dot', [3, 2.5], [3, 2.5])], openings: [] })
    expect(issue!.message).toBe('Wall "dot" starts and ends at the same point, (3.00, 2.50), so it has no length')
    expect(issue!.message).not.toMatch(/===/)
  })

  it('a sill below the floor says what fits, and the fix', () => {
    const openings = [{ id: 'win', wall: 'ext-south', type: 'window', offset: 1, width: 1, height: 1, sill: 0 }]
    const plan = parseFloorPlan({ version: '1', units: 'm', rooms: [], walls: box(), openings })
    const lowered = { ...plan, openings: [{ ...plan.openings[0]!, sill: -0.2 }] }
    const [issue] = validatePlan(lowered, indexPlan(lowered)).issues.filter((i) => i.code === 'opening/negative-sill')
    expect(issue!.message).toBe('Opening "win" has its sill 0.20 m below the floor: a sill of 0.00 m, at the floor, or above fits')
    expect(issue!.fixes).toEqual([{ part: 'opening', id: 'win', sill: 0 }])
  })
})

describe('the one nearest-id helper', () => {
  it('finds an id through a shortening, capitals and joins, or one slip, a replaced letter among them', () => {
    const walls = ['ext-south', 'ext-east', 'ext-north', 'ext-west']
    expect(likelyId('ext-nort', walls)).toBe('ext-north')
    expect(likelyId('EXT_NORTH', walls)).toBe('ext-north')
    expect(likelyId('ext-nrth', walls)).toBe('ext-north')
    expect(likelyId('ext-norht', walls)).toBe('ext-north')
    expect(likelyId('entrence', ['entrance', 'hall'])).toBe('entrance')
    expect(likelyId('garden', walls)).toBeNull()
  })

  it('does not count a replaced letter in a field name or a use', () => {
    expect(likelyMeant('roofs', ['rooms', 'walls'])).toBeNull()
    expect(likelyMeant('thick', ['thickness', 'height'])).toBe('thickness')
  })

  it('always names the closest of a short list of floors', () => {
    expect(closestId('frist', ['ground', 'first'])).toBe('first')
    expect(closestId('attic', ['ground', 'first'])).not.toBeNull()
    expect(closestId('ground', ['ground'])).toBeNull()
  })
})
