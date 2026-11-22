import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { MEASURES, planAreaFigures, usualGross, type FloorAreaFigures, type Measure } from '../areas'

/**
 * ARE-9: net, gross internal and gross external area from the spaces, each saying what it
 * measures, named as ARE-8 decided (lab AR-6, AR-16, AC-9).
 */
const FIXTURES = resolve(__dirname, '../../../fixtures')
const fixture = (name: string): FloorPlan => parseFloorPlan(JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')))
const fixtureNames = readdirSync(FIXTURES).filter((name) => name.endsWith('.json'))

/** The same plan twice, one floor above the other. */
function twoFloors(plan: FloorPlan): FloorPlan {
  const up = (id: string): string => `${id}-up`
  return parseFloorPlan({
    ...plan,
    floors: [{ id: 'ground', name: 'Ground', level: 0 }, { id: 'first', name: 'First', level: 1 }],
    walls: [...plan.walls.map((w) => ({ ...w, floor: 'ground' })), ...plan.walls.map((w) => ({ ...w, id: up(w.id), floor: 'first' }))],
    rooms: [
      ...plan.rooms.map((r) => ({ ...r, floor: 'ground' })),
      ...plan.rooms.map((r) => ({ ...r, id: up(r.id), floor: 'first', boundary: r.boundary.map(up), ...(r.holes ? { holes: r.holes.map((h) => h.map(up)) } : {}) })),
    ],
    openings: [...plan.openings.map((o) => ({ ...o, floor: 'ground' })), ...plan.openings.map((o) => ({ ...o, id: up(o.id), wall: up(o.wall), floor: 'first' }))],
  })
}

/** Gross external, less what the floor is made of: 0 to the last digits on every floor. */
const externalGap = (f: FloorAreaFigures): number => f.grossExternal! - (f.net + f.outsideRooms + f.walls! + f.unclaimed! - f.offSpace!)
const internalGap = (f: FloorAreaFigures): number => f.grossInternal! + f.outsideRooms - (f.net + f.outsideRooms + (f.walls! - f.outerWalls!) + f.unclaimed! - f.offSpace!)

describe('ARE-9 the lab flat (AR-6): net, gross internal and gross external, each with what it measures', () => {
  const areas = planAreaFigures(fixture('two-bed-flat.json'))

  it('is 62.65 m² net inside 75.05 m² gross external, with a gross internal figure between them', () => {
    expect(areas.net.area).toBeCloseTo(62.65, 6)
    expect(areas.grossExternal.area).toBeCloseTo(75.05, 6)
    // 9.5 × 7.9 m outside, 0.3 m outer walls: 8.9 × 7.3 m inside them.
    expect(areas.grossInternal.area).toBeCloseTo(8.9 * 7.3, 6)
  })

  it('gives every figure its rule: what it measures, what it does not take off, what the plan cannot say', () => {
    for (const figure of [areas.net, areas.grossInternal, areas.grossExternal]) {
      expect(figure.rule).toBe(MEASURES[figure.measure])
      for (const sentence of [figure.rule.measures, figure.rule.notTakenOff, figure.rule.cannotSay]) expect(sentence).toMatch(/^[A-Z].{20,}\.$/)
      expect(figure.why).toBeNull()
    }
    expect(areas.grossInternal.rule.measures).toContain('inside face')
    expect(areas.grossExternal.rule.measures).toContain('outside face')
  })
})

describe('ARE-9 per floor, net plus walls plus unclaimed floor is the gross', () => {
  it.each(fixtureNames)('%s: within 1e-6 m², on every floor, and the rooms match the spaces', (name) => {
    const plan = fixture(name)
    for (const areas of [planAreaFigures(plan), planAreaFigures(twoFloors(plan))]) {
      for (const f of areas.floors) {
        expect(Math.abs(f.offSpace!)).toBeLessThan(1e-6)
        expect(Math.abs(f.grossExternal! - (f.net + f.walls! + f.unclaimed!))).toBeLessThan(1e-6)
        expect(Math.abs(internalGap(f))).toBeLessThan(1e-6)
        expect(f.grossInternal!).toBeGreaterThanOrEqual(f.net)
        expect(f.grossInternal!).toBeLessThanOrEqual(f.grossExternal!)
      }
    }
  })

  it('takes the walls that face outside from the worked-out answer (MSG-13), not from the stated kind', () => {
    const stated = fixture('two-bed-flat.json')
    const unstated = parseFloorPlan({ ...stated, walls: stated.walls.map((w) => ({ ...w, kind: 'interior' })) })
    expect(planAreaFigures(unstated).grossInternal.area).toBeCloseTo(planAreaFigures(stated).grossInternal.area!, 9)
  })

  it('says how much room floor is not enclosed floor counted once, and the sum still holds', () => {
    // Two copies of one room: its floor counted twice.
    const plan = fixture('two-bed-flat.json')
    const twice = parseFloorPlan({ ...plan, rooms: [...plan.rooms, { ...plan.rooms[0]!, id: 'copy' }] })
    const areas = planAreaFigures(twice)
    const f = areas.floors[0]!
    expect(f.offSpace).toBeCloseTo(areas.floors[0]!.rooms.find((r) => r.id === 'copy')!.area, 6)
    expect(Math.abs(externalGap(f))).toBeLessThan(1e-6)
    expect(areas.notes.some((n) => n.includes('counted twice'))).toBe(true)
  })
})

describe('ARE-9 per-use and per-floor figures add up to the totals (AC-9)', () => {
  const plan = twoFloors(fixture('three-bed-house.json'))
  const areas = planAreaFigures(plan)

  it('adds the floors up to each total', () => {
    expect(areas.floors).toHaveLength(2)
    for (const [measure, pick] of [['net', (f: FloorAreaFigures) => f.net], ['grossInternal', (f: FloorAreaFigures) => f.grossInternal!], ['grossExternal', (f: FloorAreaFigures) => f.grossExternal!]] as const) {
      expect(areas[measure as Measure].area).toBeCloseTo(areas.floors.reduce((s, f) => s + pick(f), 0), 9)
    }
  })

  it('adds the uses up to the net, on each floor and in all', () => {
    const total = (byUse: Readonly<Record<string, number>>): number => Object.values(byUse).reduce((a, b) => a + b, 0)
    for (const f of areas.floors) expect(total(f.byUse)).toBeCloseTo(f.net, 9)
    expect(total(areas.byUse)).toBeCloseTo(areas.net.area!, 9)
    expect(Object.keys(areas.byUse).length).toBeGreaterThan(1)
  })

  it('names a room it could not draw as left out of every figure', () => {
    const base = fixture('two-bed-flat.json')
    const ghost = { id: 'ghost', name: 'Box room', boundary: ['no-such-wall-a', 'no-such-wall-b', 'no-such-wall-c'] }
    const broken = planAreaFigures(parseFloorPlan({ ...base, rooms: [...base.rooms, ghost] }))
    expect(broken.leftOut).toEqual([{ id: 'ghost', name: 'Box room', floor: broken.floors[0]!.floor }])
    expect(broken.floors[0]!.rooms.map((r) => r.id)).not.toContain('ghost')
    expect(broken.net.area).toBeCloseTo(62.65, 6)
    expect(broken.notes.find((n) => n.startsWith('Left out of every figure'))).toContain('"Box room"')
  })

  it('lists rooms named outside apart: in no net or gross internal figure, in the gross external one', () => {
    const base = fixture('two-bed-flat.json')
    const room = base.rooms[0]!
    const whole = planAreaFigures(base)
    const apart = planAreaFigures(base, { outside: new Set([room.id]) })
    const area = whole.floors[0]!.rooms.find((r) => r.id === room.id)!.area
    expect(apart.net.area).toBeCloseTo(whole.net.area! - area, 9)
    expect(apart.grossInternal.area).toBeCloseTo(whole.grossInternal.area! - area, 9)
    expect(apart.grossExternal.area).toBeCloseTo(whole.grossExternal.area!, 9)
    expect(Math.abs(externalGap(apart.floors[0]!))).toBeLessThan(1e-6)
  })

  it('gives a floor whose outer walls are not known no gross internal figure, and says why', () => {
    const base = fixture('two-bed-flat.json')
    const empty = planAreaFigures(parseFloorPlan({ ...base, rooms: [], openings: [], walls: base.walls.map((w) => ({ ...w, kind: 'interior' })) }))
    expect(empty.grossInternal.area).toBeNull()
    expect(empty.grossInternal.why).toMatch(/no wall on this floor faces outside/)
    expect(empty.grossExternal.area).toBeCloseTo(75.05, 6)
  })
})

describe('ARE-8 which gross measure comes first', () => {
  it('follows the stated country: the inside face in the UK and most of Europe, the outside face for US homes', () => {
    expect(usualGross('GB')).toBe('grossInternal')
    expect(usualGross('es')).toBe('grossInternal')
    expect(usualGross('US')).toBe('grossExternal')
    expect(usualGross('JP')).toBeNull()
    expect(usualGross(undefined)).toBeNull()
  })

  it('gives both when no country is stated or none is usual there, and either or both when asked', () => {
    const plan = fixture('two-bed-flat.json')
    expect(planAreaFigures(plan).reader).toMatchObject({ gross: ['grossInternal', 'grossExternal'], chosen: 'none', country: null })
    expect(planAreaFigures(plan, { country: 'JP' }).reader).toMatchObject({ gross: ['grossInternal', 'grossExternal'], chosen: 'none', country: 'JP' })
    expect(planAreaFigures(plan, { country: 'gb' }).reader).toMatchObject({ gross: ['grossInternal'], chosen: 'country', country: 'GB' })
    expect(planAreaFigures(plan, { country: 'US' }).reader).toMatchObject({ gross: ['grossExternal'], chosen: 'country' })
    expect(planAreaFigures(plan, { country: 'US', gross: 'grossInternal' }).reader).toMatchObject({ gross: ['grossInternal'], chosen: 'asked' })
    expect(planAreaFigures(plan, { country: 'GB', gross: 'both' }).reader.gross).toEqual(['grossInternal', 'grossExternal'])
  })
})

describe('ARE-8 the measures table', () => {
  const ROOT = resolve(__dirname, '../../../../..')

  it('is in the README in the same words as MEASURES', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')
    const section = readme.slice(readme.indexOf('### Measuring areas'))
    const rows = section
      .split('\n')
      .filter((line) => /^\| (Net|Gross)/.test(line))
      .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    expect(rows).toEqual(Object.values(MEASURES).map((m) => [m.name, m.measures, m.notTakenOff, m.cannotSay]))
  })

  it('names no measuring standard in the code, the messages or the docs, except through a figure record', () => {
    // Built from parts, so that this file does not name them either.
    const names = [['RI', 'CS'], ['IP', 'MS'], ['Z7', '65'], ['BO', 'MA'], ['DIN ', '277'], ['WoF', 'lV'], ['N', 'RM\\b'], ['Code of Measuring', ' Practice'], ['Wohnfl', 'äche']]
    const pattern = new RegExp(`\\b(?:${names.map((n) => n.join('')).join('|')})`)
    const files: string[] = []
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (name === 'node_modules' || name === '__tests__' || name === 'dist') continue
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.(ts|tsx|md)$/.test(name)) files.push(path)
      }
    }
    for (const pkg of readdirSync(join(ROOT, 'packages'))) walk(join(ROOT, 'packages', pkg, 'src'))
    files.push(join(ROOT, 'README.md'), join(ROOT, 'AGENTS.md'), join(ROOT, 'docs', 'result-contract.md'))
    // Figure records carry their document, edition and clause (`packages/rules`).
    const records = join(ROOT, 'packages', 'rules', 'src', 'checks', 'figures.ts')
    const found = files.filter((file) => file !== records && pattern.test(readFileSync(file, 'utf8'))).map((file) => relative(ROOT, file))
    expect(files.length).toBeGreaterThan(100)
    expect(found).toEqual([])
  })
})
