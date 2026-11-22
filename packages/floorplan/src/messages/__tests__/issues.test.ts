/**
 * MSG-11: every drawing check says its sentence by key and values (`Issue.said`), its English is
 * the message it has always written, and its Spanish leaves no placeholder and writes each figure
 * with a decimal comma.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { validatePlan, type Issue } from '../../geometry/validate'
import { validateDoorSweeps } from '../../geometry/sweep'
import { groupedNum, pointSaid } from '../../geometry/issueWords'
import { door, edit, exterior, flat, room, stairHouse, twoFloorHouse, wall, window_ } from '../../test-support/plans'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { es } from '../es'
import { en } from '../en'
import { english, isSaid, placeholders, registerMessages, say, sayValue, type Said, type Value } from '../say'

const FIXTURES = resolve(__dirname, '../../../fixtures')

const fixtures: [string, FloorPlan][] = readdirSync(FIXTURES)
  .filter((file) => file.endsWith('.json'))
  .map((file) => [file, parseFloorPlan(JSON.parse(readFileSync(resolve(FIXTURES, file), 'utf8')))])

/** Plans broken on purpose, so that most of the checks have something to say. */
const broken: [string, FloorPlan][] = [
  [
    'walls and openings',
    edit(flat(), (p) => {
      p.walls.push(wall('dot', [2, 2], [2, 2]), wall('flat', [1, 1], [1, 2], { thickness: 0 }), wall('huge', [0, 0], [1e9, 0]))
      p.openings.push(
        door('far', 's1', 3.5),
        { ...window_('tall', 'e1', 1), height: 3 },
        { ...window_('low', 'e2', 1), sill: -0.5 },
        door('lost', 'nope', 1),
        door('typo', 'hkk', 1),
        { ...door('none', 'n2', 1), width: 0 },
        door('over', 'hk', 1.7),
        { ...door('swung', 'kb2', 2), swing: 'left' }
      )
    })
  ],
  [
    'more walls',
    edit(flat(), (p) => {
      p.walls.push(
        exterior('twin', [0, 0], [4, 0]),
        wall('line', [5, 4], [10, 4], { virtual: true, thickness: 0 }),
        wall('dot', [2, 2], [2, 2]),
        wall('nil', [1, 1], [1, 2], { height: 0 })
      )
      p.openings.push(
        door('on-line', 'line', 1),
        window_('borrowed', 'hb', 2.5),
        { ...door('whole', 'kb1', 0), width: 1 },
        door('hang', 'dot', 0),
        { ...door('vast', 'e1', 1), offset: 1e9 }
      )
      p.rooms.push({ ...room('pod', 'Pod', ['hb', 'kb1', 'bb', 'n2', 'w2']), inside: true }, room('on-dot', 'On dot', ['dot', 's1', 'w1']))
    })
  ],
  [
    'ids',
    edit(flat(), (p) => {
      p.walls.push(wall('hall', [20, 0], [21, 0]), wall('S1', [30, 0], [31, 0]), wall(' ', [40, 0], [41, 0]))
    })
  ],
  [
    'centimetres',
    edit(flat(), (p) => {
      for (const w of p.walls) {
        w.start = [w.start[0] * 100, w.start[1] * 100]
        w.end = [w.end[0] * 100, w.end[1] * 100]
        w.thickness *= 100
        w.height *= 100
      }
      for (const o of p.openings) Object.assign(o, { offset: o.offset * 100, width: o.width * 100, height: o.height * 100, sill: o.sill * 100 })
    })
  ],
  [
    'sizes',
    edit(flat(), (p) => {
      p.walls[0]!.height = 9
      p.walls[1]!.thickness = 0.002
      p.walls[2]!.thickness = 2
      p.openings[0]!.width = 0.05
      p.openings[1]!.height = 0.5
      p.rooms[0]!.use = 'bedroom'
    })
  ],
  [
    'floors',
    edit(twoFloorHouse(), (p) => {
      p.floors = [
        { id: 'ground', name: 'Ground floor', level: 0, height: 2.5 },
        { id: 'ground', name: 'Ground floor', level: 0 },
        { id: 'first', name: 'First floor', level: 3, height: 40 },
        { id: 'roof', name: 'Roof', level: 4 },
        { id: 'Ground', name: 'Ground again', level: 0 }
      ]
      p.walls.push(exterior('stray', [0, 0], [1, 0], { floor: 'attic' }))
      p.rooms[0]!.floorOffset = 3
    })
  ],
  [
    'rooms',
    edit(flat(), (p) => {
      p.rooms.push(room('copy', 'Copy', ['s1', 'hk', 'hb', 'w1']), room('two', 'Two', ['s1', 'hk']), room('again', 'Again', ['kb2', 'e2', 'n1', 'bb', 'bb']))
      p.rooms[2]!.boundary = ['hb', 'bb', 'kb1', 'n2', 'w2']
      p.walls.push(wall('stub', [7, 1], [7, 2]), wall('cross', [5, 4.5], [10, 4.5]))
    })
  ],
  [
    'fixtures',
    edit(flat(), (p) => {
      p.items = [
        { id: 'wc', kind: 'toilet', at: [3.9, 1], size: [0.4, 0.7], height: 0.8 },
        { id: 'tub', kind: 'bath', at: [8, 6], size: [1.7, 0.7], height: 3 },
        { id: 'run', kind: 'kitchen-run', label: 'Worktop', at: [4.4, 1.6], size: [0.6, 0.6], height: 0.9 },
        { id: 'sofa', kind: 'sofa', at: [2, 6], size: [2, 0.9], height: 0.8 },
        { id: 'out', kind: 'basin', at: [20, 20], size: [0.5, 0.4], height: 0.9 },
        { id: 'up', kind: 'shower', at: [8, 6], size: [0.9, 0.9], height: 2, floor: 'nowhere' }
      ]
      p.openings = p.openings.map((o) => (o.type === 'door' ? { ...o, hinge: 'start', swing: 'left' } : o))
    })
  ],
  [
    'stairs',
    edit(stairHouse(), (p) => {
      p.stairs = [
        { ...p.stairs![0]!, risers: 1 },
        { id: 's2', from: 'ground', to: 'loft', width: 0.9, run: [[2, 2], [2, 3]] },
        { id: 's3', from: 'ground', to: 'ground', width: 0.9, run: [[2, 2], [2, 3]] },
        { id: 's4', from: 'ground', to: 'first', width: 0.9, run: [[20, 20], [20, 23]] }
      ]
    })
  ]
]

const plans = [...fixtures, ...broken]

const issuesOf = (plan: FloorPlan): Issue[] => [...validatePlan(plan).issues, ...validateDoorSweeps(plan, (o) => o)]

/** Every figure a sentence holds, at any depth. */
function figures(value: Value | undefined): string[] {
  if (value === undefined || typeof value !== 'object') return []
  if ('num' in value) return [value.num]
  if ('join' in value) return value.join.flatMap(figures)
  if ('key' in value) return Object.values(value.values ?? {}).flatMap(figures)
  return []
}

beforeAll(() => registerMessages('es', es))

describe('the drawing checks say their sentences by key (MSG-11)', () => {
  const all = plans.flatMap(([name, plan]) => issuesOf(plan).map((issue) => [name, issue] as const))

  it('has broken plans that reach most of the checks', () => {
    expect(new Set(all.map(([, i]) => i.code)).size).toBeGreaterThan(50)
  })

  it('gives every issue its sentence, and its English is its message', () => {
    for (const [name, issue] of all) {
      expect(isSaid(issue.said), `${name}: ${issue.code}`).toBe(true)
      expect(english(issue.said), `${name}: ${issue.code}`).toBe(issue.message)
    }
  })

  it('keeps the sentence off the record, so it compares and prints as before', () => {
    const [, issue] = all[0]!
    expect(Object.keys(issue)).not.toContain('said')
    expect(JSON.parse(JSON.stringify(issue))).not.toHaveProperty('said')
  })

  it('says each in Spanish with every placeholder filled and every figure with a decimal comma', () => {
    for (const [name, issue] of all) {
      const text = say('es', issue.said.key, issue.said.values)
      expect(text, `${name}: ${issue.code}`).not.toMatch(/\{[A-Za-z][A-Za-z0-9]*\}/)
      expect(text, `${name}: ${issue.code}`).not.toBe(issue.message)
      for (const figure of figures(issue.said)) expect(text, `${name}: ${issue.code}`).toContain(figure.replace(/(\d)\.(\d)/g, '$1,$2'))
    }
  })
})

describe('the issue messages files', () => {
  it('hold the same keys, with the same placeholders, in English and Spanish', () => {
    const issueKeys = (table: Readonly<Record<string, string>>): string[] => Object.keys(table).filter((key) => key.startsWith('issue.')).sort()
    expect(issueKeys(es)).toEqual(issueKeys(en))
    for (const [key, text] of Object.entries(en).filter(([k]) => k.startsWith('issue.'))) {
      expect(placeholders(es[key as keyof typeof en]).sort(), key).toEqual(placeholders(text).sort())
    }
  })

  it('write a point, and a figure with its thousands grouped, in each language', () => {
    const point: Said = pointSaid('1.50', '2.00')
    expect(sayValue('en', point)).toBe('(1.50, 2.00)')
    expect(sayValue('es', point)).toBe('(1,50; 2,00)')
    expect(sayValue('en', groupedNum('1,234.56'))).toBe('1,234.56')
    expect(sayValue('es', groupedNum('1,234.56'))).toBe('1.234,56')
    expect(sayValue('es', groupedNum('200,000'))).toBe('200.000')
  })
})
