import { describe, expect, it } from 'vitest'
import type { FloorPlan, Opening, Room, Wall } from '@ongrid/floorplan/geometry'
import { ESCAPE_TOP_LEVEL, FIGURES, RULES, checkLocalRules } from '..'
import { messages } from '../messages'

/**
 * The bedroom escape-opening rule (US model codes: IBC 2024 1031, IRC 2024 R319).
 *
 * A free-standing 3 × 3.5 m room on one floor at `level`. Its walls are exterior unless
 * `interiorBottom`, and listed counter-clockwise (C3). Openings go on the bottom wall
 * (`b-w0`, running +X, so the room is on its left side).
 */
function bedroom(
  openings: Omit<Opening, 'wall'>[],
  { level = 0, use = 'bedroom', interiorBottom = false }: { level?: number; use?: string; interiorBottom?: boolean } = {}
): FloorPlan {
  const corners: [number, number][] = [[-0.1, -0.1], [3.1, -0.1], [3.1, 3.6], [-0.1, 3.6]]
  const walls = corners.map(
    (start, i): Wall => ({
      id: `b-w${i}`,
      start,
      end: corners[(i + 1) % 4]!,
      thickness: 0.2,
      height: 2.7,
      kind: i === 0 && interiorBottom ? 'interior' : 'exterior',
      floor: 'f'
    })
  )
  const room = { id: 'b', name: 'Bedroom 2', boundary: walls.map((w) => w.id), floor: 'f', use } as Room
  return {
    version: '1',
    units: 'm',
    floors: [{ id: 'f', name: 'Floor', level }],
    walls,
    rooms: [room],
    openings: openings.map((o) => ({ ...o, wall: 'b-w0' }) as Opening)
  }
}

const win = (id: string, width: number, height: number, sill: number, offset = 0.5): Omit<Opening, 'wall'> => ({
  id,
  type: 'window',
  offset,
  width,
  height,
  sill
})
const door = (id: string, offset = 2.0): Omit<Opening, 'wall'> => ({ id, type: 'door', offset, width: 0.9, sill: 0, height: 2.1 })

const ESCAPE = ['no_escape_opening', 'escape_window_too_small', 'escape_window_too_high']
const escapes = (p: FloorPlan) => checkLocalRules(p).findings.filter((f) => ESCAPE.includes(f.code))

describe('the escape-opening rule', () => {
  it('is in the catalogue as a rule from US model codes, citing both documents', () => {
    const rule = RULES.find((r) => r.id === 'escape-opening')!
    expect(rule.source.kind).toBe('building-code')
    expect(rule.source.label).toBe('US model codes: IBC 2024 and IRC 2024')
    expect(rule.source.citations).toContainEqual({ document: 'IBC', edition: '2024', clause: '1031.2' })
    expect(rule.source.citations).toContainEqual({ document: 'IRC', edition: '2024', clause: 'R319.2.3' })
  })

  it("uses the sources' own metric figures, one value each", () => {
    expect([
      FIGURES.escapeOpeningMinWidth.baseline,
      FIGURES.escapeOpeningMinHeight.baseline,
      FIGURES.escapeOpeningMinArea.baseline,
      FIGURES.escapeOpeningMinAreaGrade.baseline,
      FIGURES.escapeOpeningMaxSill.baseline,
      ESCAPE_TOP_LEVEL.level
    ]).toEqual([0.508, 0.61, 0.53, 0.46, 1.118, 2])
  })

  it('reads its messages from fixed templates', () => {
    expect(messages.noEscapeOpening('Bedroom 2')).toBe('Bedroom 2 has no window or door to escape through')
    expect(messages.escapeWindowTooSmall('Bedroom 2')).toBe("Bedroom 2's window is too small to escape through")
    expect(messages.escapeWindowTooHigh('Bedroom 2')).toBe("Bedroom 2's window is too high to escape through")
  })
})

describe('which bedrooms pass', () => {
  it('a good window', () => {
    expect(escapes(bedroom([win('o1', 1.0, 1.2, 0.9)]))).toEqual([])
  })

  it('a door to the garden, with no window', () => {
    expect(escapes(bedroom([door('d1')]))).toEqual([])
  })

  it('a small window on level 0 that would fail upstairs', () => {
    expect(escapes(bedroom([win('o1', 0.7, 0.7, 0.9)], { level: 0 }))).toEqual([])
  })
})

describe('which bedrooms are reported', () => {
  it('windows only onto the hall', () => {
    const [finding, ...rest] = escapes(bedroom([win('o1', 1.0, 1.2, 0.9)], { interiorBottom: true }))
    expect(rest).toEqual([])
    expect(finding).toMatchObject({ code: 'no_escape_opening', ruleId: 'escape-opening', floor: 'f', rooms: ['b'], openings: [] })
    expect(finding!.message).toBe('Bedroom 2 has no window or door to escape through')
  })

  it('no window at all, in a basement', () => {
    expect(escapes(bedroom([], { level: -1 })).map((f) => f.code)).toEqual(['no_escape_opening'])
  })

  it('a small window upstairs', () => {
    const [finding] = escapes(bedroom([win('o1', 0.7, 0.7, 0.9)], { level: 1 }))
    expect(finding).toMatchObject({
      code: 'escape_window_too_small',
      openings: ['o1'],
      area: 0.49,
      minimum: 0.53,
      width: 0.7,
      height: 0.7
    })
  })

  it('a narrow window, even though its area is enough', () => {
    expect(escapes(bedroom([win('o1', 0.45, 1.4, 0.9)], { level: 1 })).map((f) => f.code)).toEqual(['escape_window_too_small'])
  })

  it('a high sill', () => {
    const [finding] = escapes(bedroom([win('o1', 1.0, 1.0, 1.2)]))
    expect(finding).toMatchObject({ code: 'escape_window_too_high', openings: ['o1'], sill: 1.2, maximum: 1.118 })
    expect(finding!.figures).toMatchObject([{ key: 'escapeOpeningMaxSill', origin: 'baseline', status: 'ai-found' }])
  })

  it('figures at the limit: width, height and sill pass, the area fails', () => {
    const [finding] = escapes(bedroom([win('o1', 0.508, 0.61, 1.118)]))
    expect(finding).toMatchObject({ code: 'escape_window_too_small', area: 0.31, width: 0.508, height: 0.61 })
    expect(finding!.figures!.map((f) => f.key)).toEqual(['escapeOpeningMinAreaGrade', 'escapeOpeningMinWidth', 'escapeOpeningMinHeight'])
  })

  it('just over the sill, to the millimetre', () => {
    const [finding] = escapes(bedroom([win('o1', 1.0, 1.0, 1.12)]))
    expect(finding).toMatchObject({ code: 'escape_window_too_high', sill: 1.12, maximum: 1.118 })
    expect(escapes(bedroom([win('o1', 1.0, 1.0, 1.118)]))).toEqual([])
  })

  it('just under the width, to the millimetre', () => {
    expect(escapes(bedroom([win('o1', 0.507, 1.4, 0.9)])).map((f) => f.code)).toEqual(['escape_window_too_small'])
    expect(escapes(bedroom([win('o1', 0.508, 1.4, 0.9)]))).toEqual([])
  })

  it('describes the largest window, and the sill only when some window is big enough', () => {
    const tooHigh = escapes(bedroom([win('o1', 0.6, 0.6, 0.9), win('o2', 1.0, 1.0, 1.3, 1.5)]))
    expect(tooHigh).toMatchObject([{ code: 'escape_window_too_high', openings: ['o2'] }])
    const tooSmall = escapes(bedroom([win('o1', 0.4, 0.5, 0.9), win('o2', 0.6, 0.6, 0.9, 1.5)], { level: 1 }))
    expect(tooSmall).toMatchObject([{ code: 'escape_window_too_small', openings: ['o2'], area: 0.36 }])
  })
})

describe('figures looked up for another country', () => {
  const source = { url: 'https://example.org/rules', quote: 'at least 0.33 m2', retrievedAt: '2026-11-14T10:00:00.000Z' }
  const lookedUp = {
    escapeOpeningMinArea: { value: 0.33, source },
    escapeOpeningMinWidth: { value: 0.45, source },
    escapeOpeningMinHeight: { value: 0.45, source },
    escapeOpeningMaxSill: { value: 1.1, source }
  }
  const abroad = (p: FloorPlan, figures: Parameters<typeof checkLocalRules>[1] = { country: 'GB', figures: lookedUp }) =>
    checkLocalRules(p, figures).findings.filter((f) => ESCAPE.includes(f.code))

  it('are what the window is measured against, in place of the carried ones', () => {
    // 0.5 x 0.7 m is under the carried 0.53 m² upstairs, and over the looked-up 0.33 m².
    const small = bedroom([win('o1', 0.5, 0.7, 0.9)], { level: 1 })
    expect(escapes(small).map((f) => f.code)).toEqual(['escape_window_too_small'])
    expect(abroad(small)).toEqual([])
  })

  it('can be stricter too: a sill the carried figure allows is too high for the looked-up one', () => {
    const [finding] = abroad(bedroom([win('o1', 1.0, 1.0, 1.11)]))
    expect(finding).toMatchObject({ code: 'escape_window_too_high', sill: 1.11, maximum: 1.1 })
    expect(finding!.figures).toMatchObject([{ key: 'escapeOpeningMaxSill', origin: 'lookup', status: 'ai-found', source }])
    expect(escapes(bedroom([win('o1', 1.0, 1.0, 1.11)]))).toEqual([])
  })

  it('test only what was found: with a width alone, nothing is said about area, height or sill', () => {
    const only = { country: 'DE', figures: { escapeOpeningMinWidth: { value: 0.9, source } } }
    expect(abroad(bedroom([win('o1', 0.95, 0.3, 1.9)]), only)).toEqual([])
    const [finding] = abroad(bedroom([win('o1', 0.8, 1.4, 0.9)]), only)
    expect(finding).toMatchObject({ code: 'escape_window_too_small', width: 0.8 })
    expect(finding!.minimum).toBeUndefined()
    expect(finding!.figures!.map((f) => f.key)).toEqual(['escapeOpeningMinWidth'])
  })

  it('with none found, the check does not run and the report says so', () => {
    const report = checkLocalRules(bedroom([]), { country: 'ES' })
    expect(report.findings.filter((f) => ESCAPE.includes(f.code))).toEqual([])
    expect(report.notChecked.map((n) => n.message)).toContain(
      'Escape openings were not checked: the figures here are from US model codes, and this plan is for ES'
    )
  })
})

describe('which rooms are not checked', () => {
  it('a bedroom on level 3 gets no finding and no notice', () => {
    const report = checkLocalRules(bedroom([], { level: 3 }))
    expect(report.findings.filter((f) => ESCAPE.includes(f.code))).toEqual([])
    expect(JSON.stringify(report.notChecked)).not.toMatch(/escape/i)
  })

  it.each(['living', 'other'])('a room whose use is %s', (use) => {
    expect(escapes(bedroom([], { use }))).toEqual([])
  })

  it('a room called Bedroom that states no use', () => {
    const p = bedroom([])
    delete (p.rooms[0] as { use?: string }).use
    expect(escapes(p)).toEqual([])
  })
})

describe('invariants', () => {
  const cases: [string, FloorPlan][] = [
    ['good', bedroom([win('o1', 1.0, 1.2, 0.9), door('d1')])],
    ['hall', bedroom([win('o1', 1.0, 1.2, 0.9)], { interiorBottom: true })],
    ['small', bedroom([win('o1', 0.6, 0.6, 0.9), win('o2', 0.5, 0.7, 0.9, 1.5)], { level: 1 })],
    ['high', bedroom([win('o1', 1.0, 1.0, 1.2)])]
  ]

  it.each(cases)('%s: the report is byte-identical when every list is reversed', (_name, p) => {
    const reversed: FloorPlan = {
      ...p,
      walls: [...p.walls].reverse(),
      rooms: p.rooms.map((r) => ({ ...r, boundary: [...r.boundary.slice(1), r.boundary[0]!] })),
      openings: [...p.openings].reverse()
    }
    expect(JSON.stringify(checkLocalRules(reversed))).toBe(JSON.stringify(checkLocalRules(p)))
  })

  // A side test on a mirrored basis would read the room on the wrong face of its wall. The
  // mirror flips X, reverses each wall (so offsets are measured from the other end) and
  // reverses each boundary (so it stays counter-clockwise): the same building, drawn backwards.
  it.each(cases)('%s: mirroring the plan keeps the findings', (_name, p) => {
    const lengths = new Map(p.walls.map((w) => [w.id, Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1])]))
    const mirrored: FloorPlan = {
      ...p,
      walls: p.walls.map((w) => ({ ...w, start: [-w.end[0], w.end[1]], end: [-w.start[0], w.start[1]] })),
      rooms: p.rooms.map((r) => ({ ...r, boundary: [...r.boundary].reverse() })),
      openings: p.openings.map((o) => ({ ...o, offset: lengths.get(o.wall)! - o.offset - o.width }))
    }
    const summary = (q: FloorPlan) => escapes(q).map((f) => [f.code, f.rooms, f.openings])
    expect(summary(mirrored)).toEqual(summary(p))
  })

  it.each([0.3, 0.9, 1.6, 2.1])('a window moved along the wall to %d m keeps its finding', (offset) => {
    const at = (o: number) => escapes(bedroom([win('o1', 0.6, 0.6, 0.9, o)], { level: 1 })).map((f) => f.code)
    expect(at(offset)).toEqual(at(0.5))
  })
})

describe('order in the report', () => {
  it('puts exit findings first, then escape findings, then room sizes', () => {
    // A tiny bedroom on level 0 with no openings: no exit, no door, no escape, too small.
    const p = bedroom([])
    const corners: [number, number][] = [[-0.1, -0.1], [2.1, -0.1], [2.1, 2.1], [-0.1, 2.1]]
    p.walls = p.walls.map((w, i) => ({ ...w, start: corners[i]!, end: corners[(i + 1) % 4]! }))
    const codes = checkLocalRules(p).findings.map((f) => f.code)
    const group = (code: string) => (ESCAPE.includes(code) ? 1 : code === 'room_too_small' ? 2 : 0)
    expect(codes).toContain('no_escape_opening')
    expect(codes).toContain('room_too_small')
    expect(codes.map(group)).toEqual([...codes.map(group)].sort((a, b) => a - b))
  })
})

/**
 * Known failures from the lab (entry Z-4), as expected failures. Each states the right
 * behaviour and fails today; when its fix lands, vitest reports it, and `it.fails` becomes
 * `it`. Each title starts with its lab entry ID.
 */
describe('known failures (expected to fail until fixed)', () => {
  // Lab CH-3: "USA" is read as another country, so the US escape rule is skipped in silence.
  // rules-figures.test.ts 'is false for any other country' lists ES, GB, DE, IT and Spain,
  // never USA, so a fix need not change it.
  it.fails('CH-3 "USA" is read as the same place as "US", or refused', () => {
    const plan = bedroom([])
    const codes = (country: string) => checkLocalRules(plan, { country }).findings.map((f) => f.code)
    expect(codes('USA')).toEqual(codes('US'))
  })
})
