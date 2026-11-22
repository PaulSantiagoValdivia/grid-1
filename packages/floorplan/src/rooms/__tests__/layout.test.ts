/**
 * BRF-6: the packing of a first layout (`layOut`) and the alignment offered for a door between
 * two rooms that share no wall (lab AB-11). The estate agent's rooms through the tool server are
 * in `packages/cli/src/brief/__tests__/layout.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '../compile'
import { layOut, LayoutRefused, type LayoutRoom } from '../layout'

const room = (name: string, inside: readonly [number, number] | null, area: number | null = null, use: string | null = null): LayoutRoom => ({ name, use, inside, area })

const LISTING: LayoutRoom[] = [
  room('Bedroom 1', [4.1, 3.2], null, 'bedroom'),
  room('Kitchen', [2.4, 3.0], null, 'kitchen'),
  room('Bathroom', [1.7, 2.0], null, 'bathroom'),
  room('Lounge', [4.5, 3.6], null, 'living'),
  room('Bedroom 2', [2.7, 3.1], null, 'bedroom'),
]

function written(text: string): ReturnType<typeof compileRoomsText> {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  return result
}

describe('a first layout', () => {
  it('is the same text, byte for byte, for the same list', () => {
    const a = layOut({ rooms: LISTING, touch: [], hall: null, shape: 'tidy' })
    const b = layOut({ rooms: LISTING.map((r) => ({ ...r })), touch: [], hall: null, shape: 'tidy' })
    expect(b.text).toBe(a.text)
  })

  it('tidy: a rectangle, four outside walls, and the sizes that do not fit it named', () => {
    const layout = layOut({ rooms: LISTING, touch: [], hall: null, shape: 'tidy' })
    const result = written(layout.text)
    expect(result.walls.filter((w) => w.kind === 'exterior')).toHaveLength(4)
    expect(layout.added?.name).toBe('Hall')
    expect(layout.rooms.filter((r) => !r.kept).map((r) => r.name)).toEqual(['Kitchen', 'Bathroom', 'Bedroom 1'])
    // What is drawn is what the text writes.
    for (const placed of layout.rooms) {
      const drawn = result.rooms.find((r) => r.id === placed.id)!
      expect(drawn.width).toBeCloseTo(placed.width, 4)
      expect(drawn.depth).toBeCloseTo(placed.depth, 4)
    }
  })

  it('sizes: every size kept, the outline stepping', () => {
    const layout = layOut({ rooms: LISTING, touch: [], hall: null, shape: 'sizes' })
    const result = written(layout.text)
    expect(layout.rooms.every((r) => r.kept)).toBe(true)
    expect(result.walls.filter((w) => w.kind === 'exterior').length).toBeGreaterThan(4)
  })

  it('puts two rooms that must touch side by side', () => {
    const layout = layOut({ rooms: LISTING, touch: [{ rooms: ['Kitchen', 'Lounge'], level: 'must' }], hall: null, shape: 'tidy' })
    expect(layout.touch).toEqual({ wished: 1, held: 1 })
    const result = written(layout.text)
    expect(result.walls.some((w) => w.rooms.includes('kitchen') && w.rooms.includes('lounge'))).toBe(true)
  })

  it('keeps the area of a room given only an area, at its row\'s depth', () => {
    const layout = layOut({ rooms: [...LISTING.slice(0, 3), room('Study', null, 7.2)], touch: [], hall: null, shape: 'sizes' })
    const study = layout.rooms.find((r) => r.name === 'Study')!
    expect(study.kept).toBe(true)
    expect(Math.round(study.width * study.depth * 100) / 100).toBe(7.2)
    written(layout.text)
  })

  it('stands two rooms in one row with no hall, and the brief\'s corridor as the hall', () => {
    const two = layOut({ rooms: LISTING.slice(0, 2), touch: [], hall: null, shape: 'tidy' })
    expect(two.added).toBeNull()
    expect(two.rooms.map((r) => r.row)).toEqual(['south', 'south'])
    written(two.text)
    const own = layOut({ rooms: LISTING, touch: [], hall: room('Landing', [1.3, 6], null, 'corridor'), shape: 'tidy' })
    expect(own.added).toBeNull()
    expect(own.rooms[0]).toMatchObject({ name: 'Landing', row: 'hall', depth: 1.3 })
    written(own.text)
  })

  it('refuses a list with no room, and one longer than it tries', () => {
    expect(() => layOut({ rooms: [], touch: [], hall: null, shape: 'tidy' })).toThrow(LayoutRefused)
    const many = Array.from({ length: 11 }, (_, i) => room(`Room ${i + 1}`, [3, 3]))
    expect(() => layOut({ rooms: many, touch: [], hall: null, shape: 'tidy' })).toThrow(/at most 10/)
  })
})

describe('AB-11: a door between two rooms that share no wall', () => {
  const text = [
    'room corridor "Corridor" corridor 1.2 x 7',
    'room bed1 "Bedroom 1" bedroom 3.5 x 3.4 west of corridor',
    'room bed2 "Bedroom 2" bedroom 2.0 x 3.5 north of bed1',
    'door d2 between bed2 and corridor, centred, 0.8 wide',
  ]

  it('is refused with the other alignment of the room written last, as data, and that line writes the plan', () => {
    const result = compileRoomsText(text.join('\n'))
    expect(result.plan).toBeNull()
    const [problem] = result.problems
    expect(problem).toMatchObject({ code: 'rooms/no-shared-wall', line: 4, fixes: [{ line: 3, text: 'room bed2 "Bedroom 2" bedroom 2.0 x 3.5 north of bed1 align east' }] })
    expect(problem!.message).toContain('With line 3 written \'room bed2 "Bedroom 2" bedroom 2.0 x 3.5 north of bed1 align east\', they share a wall.')
    const lines = [...text]
    lines[problem!.fixes![0]!.line - 1] = problem!.fixes![0]!.text
    expect(compileRoomsText(lines.join('\n')).problems).toEqual([])
  })

  it('offers nothing when no alignment would do', () => {
    const far = [...text.slice(0, 3), 'room den "Den" - 2 x 2 west of bed1', 'door d3 between den and corridor, centred, 0.8 wide']
    const result = compileRoomsText(far.join('\n'))
    const problem = result.problems.find((p) => p.line === 5)!
    expect(problem.code).toBe('rooms/no-shared-wall')
    expect(problem.fixes).toBeUndefined()
  })
})
