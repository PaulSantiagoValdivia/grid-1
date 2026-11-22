import { describe, expect, it } from 'vitest'
import type { FloorPlan, Opening, Room, Wall } from '@ongrid/floorplan/geometry'
import { checkLocalRules, type RuleFigures } from '..'
import { planNotes } from '../../notes/notes'

/**
 * ARE-7 in the figure checks: a value is compared with its figure as it is, a tiny tolerance
 * apart, never rounded first; a note prints it with the digits that keep it on its side of the
 * figure; and a figure the person or a lookup gave is printed as it was given.
 *
 * One free-standing room on one floor at `level`, its inner faces `w` × `h`, four exterior walls
 * 0.2 m thick listed counter-clockwise, its windows on the bottom wall.
 */
function room(w: number, h: number, use: string, windows: Omit<Opening, 'wall' | 'type'>[] = [], level = 0): FloorPlan {
  const corners: [number, number][] = [[-0.1, -0.1], [w + 0.1, -0.1], [w + 0.1, h + 0.1], [-0.1, h + 0.1]]
  const walls = corners.map(
    (start, i): Wall => ({ id: `w${i}`, start, end: corners[(i + 1) % 4]!, thickness: 0.2, height: 2.7, kind: 'exterior', floor: 'f' })
  )
  return {
    version: '1',
    units: 'm',
    floors: [{ id: 'f', name: 'Floor', level }],
    walls,
    rooms: [{ id: 'r', name: 'Bedroom 2', boundary: walls.map((wall) => wall.id), floor: 'f', use } as Room],
    openings: windows.map((o) => ({ ...o, type: 'window', wall: 'w0' }) as Opening)
  }
}

const win = (width: number, height: number, sill: number): Omit<Opening, 'wall' | 'type'> => ({ id: 'o1', offset: 0.3, width, height, sill })

/** Every note's title and detail, as plain text. */
function notes(plan: FloorPlan, figures?: RuleFigures): string[] {
  const view = planNotes(plan, checkLocalRules(plan, figures === undefined ? {} : { figures }))
  return view.notes.filter((n) => n.tag === 'Size' || n.tag === 'Escape').map((n) => [...n.title, ...n.detail].map((t) => t.text).join(''))
}

/** The room has no door, so the exit checks speak too; only the figure checks are looked at. */
const FIGURE_CODES = ['room_too_small', 'no_escape_opening', 'escape_window_too_small', 'escape_window_too_high']
const findings = (plan: FloorPlan, figures?: RuleFigures) =>
  checkLocalRules(plan, figures === undefined ? {} : { figures }).findings.filter((f) => FIGURE_CODES.includes(f.code))
const codes = (plan: FloorPlan, figures?: RuleFigures): string[] => findings(plan, figures).map((f) => f.code)

describe('ARE-7 small shortfalls stay visible', () => {
  it('CH-11 a 6.4951 m² bedroom against 6.5 m² raises its note and prints 6.495', () => {
    // 2.5 × 2.59804 = 6.4951 m²
    const plan = room(2.5, 2.59804, 'bedroom', [win(1, 1.2, 0.9)])
    const [finding] = findings(plan)
    expect(finding).toMatchObject({ rooms: ['r'], area: 6.495, minimum: 6.5 })
    const [note] = notes(plan)
    expect(note).toContain('It measures 6.495 m².')
    expect(note).toContain('is at least 6.5 m²')
  })

  it('CH-11 a 0.4575 m² window on the ground floor, against 0.46 m², is too small', () => {
    // 0.75 × 0.61 = 0.4575 m², wide and tall enough.
    const plan = room(3, 3.5, 'bedroom', [win(0.75, 0.61, 0.9)])
    expect(codes(plan)).toEqual(['escape_window_too_small'])
    const [note] = notes(plan)
    expect(note).toMatch(/It opens 0\.45\d* m² as drawn\./)
    expect(note).toContain('on this floor: at least 0.46 m²')
  })

  it('CH-11 a 0.5252 m² window upstairs, against 0.53 m², is too small', () => {
    // 0.808 × 0.65 = 0.5252 m²
    const plan = room(3, 3.5, 'bedroom', [win(0.808, 0.65, 0.9)], 1)
    expect(codes(plan)).toEqual(['escape_window_too_small'])
    expect(notes(plan)[0]).toContain('It opens 0.525 m² as drawn.')
  })

  it('CH-11 a sill at 1.1184 m, against 1.118 m, is too high and prints 1.1184', () => {
    const plan = room(3, 3.5, 'bedroom', [win(1, 1, 1.1184)])
    const [finding] = findings(plan)
    expect(finding).toMatchObject({ code: 'escape_window_too_high', sill: 1.1184, maximum: 1.118 })
    expect(notes(plan)[0]).toContain('Its sill is 1.1184 m above the floor as drawn. The figure used here is a sill 1.118 m or lower.')
  })

  it('leaves a room drawn at exactly the figure alone, whatever its last digits', () => {
    // 2.6 × 2.5 is 6.500000000000001 in floating point; 2.5 × 2.6 drawn from other corners can land a hair under.
    for (const [w, h] of [[2.5, 2.6], [2.6, 2.5], [1.3, 5], [3.25, 2]] as const) {
      expect(codes(room(w, h, 'bedroom', [win(1, 1.2, 0.9)]))).toEqual([])
    }
    // A window at exactly the width and the sill: 0.508 m wide, its sill at 1.118 m.
    expect(codes(room(3, 3.5, 'bedroom', [win(0.508, 1.05, 1.118)]))).toEqual([])
  })
})

describe('ARE-7 the figures given are echoed as given', () => {
  it('AB-17 a sill limit of 0.775 m is printed as 0.775', () => {
    const plan = room(3, 3.5, 'bedroom', [win(1, 1, 0.8)])
    const [note] = notes(plan, { escapeOpeningMaxSill: { value: 0.775 } })
    expect(note).toContain('The figure used here is a sill 0.775 m or lower.')
    expect(note).toContain('Its sill is 0.80 m above the floor as drawn.')
  })

  it('a window area of 0.4575 m² looked up is printed as 0.4575, not 0.46', () => {
    const plan = room(3, 3.5, 'bedroom', [win(0.7, 0.6, 0.9)], 1)
    const [note] = notes(plan, { escapeOpeningMinArea: { value: 0.4575 } })
    expect(note).toContain('on this floor: at least 0.4575 m²')
  })

  it('a sill a hair under the limit passes, and one a hair over prints the digit that shows it', () => {
    expect(codes(room(3, 3.5, 'bedroom', [win(1, 1, 0.7750000000000001)]), { escapeOpeningMaxSill: { value: 0.775 } })).toEqual([])
    const plan = room(3, 3.5, 'bedroom', [win(1, 1, 0.7752)])
    expect(notes(plan, { escapeOpeningMaxSill: { value: 0.775 } })[0]).toContain('Its sill is 0.7752 m above the floor')
  })
})
