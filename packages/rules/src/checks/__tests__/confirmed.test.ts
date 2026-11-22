/**
 * CNT-17: a figure from a code is used in a comparison only once a named person has confirmed it
 * against its source. `ai-found` is never confirmed, and neither is a check an AI made.
 */
import { describe, expect, it } from 'vitest'
import { confirmedFigure, FIGURES, isConfirmed, type FigureKey, type FigureSpec } from '..'

/** The table with one figure's provenance changed, as a person's check would change it. */
function withProvenance(key: FigureKey, change: Partial<FigureSpec['provenance']>): Record<FigureKey, FigureSpec> {
  return { ...FIGURES, [key]: { ...FIGURES[key], provenance: { ...FIGURES[key].provenance, ...change } } }
}

const PERSON = [{ by: 'A. Reviewer', on: '2026-12-01' }]

describe('a confirmed figure (CNT-17)', () => {
  it('is checked once or twice, with each check by a named person', () => {
    expect(isConfirmed({ status: 'ai-found', verifiedBy: [] })).toBe(false)
    expect(isConfirmed({ status: 'ai-found', verifiedBy: PERSON })).toBe(false)
    expect(isConfirmed({ status: 'human-entered', verifiedBy: PERSON })).toBe(false)
    expect(isConfirmed({ status: 'disputed', verifiedBy: PERSON })).toBe(false)
    expect(isConfirmed({ status: 'checked-once', verifiedBy: [] })).toBe(false)
    expect(isConfirmed({ status: 'checked-once', verifiedBy: [{ by: 'AI research', on: '2026-12-01' }] })).toBe(false)
    expect(isConfirmed({ status: 'checked-once', verifiedBy: [{ by: ' ', on: '2026-12-01' }] })).toBe(false)
    expect(isConfirmed({ status: 'checked-once', verifiedBy: PERSON })).toBe(true)
    expect(isConfirmed({ status: 'checked-twice', verifiedBy: [...PERSON, { by: 'B. Second', on: '2026-12-02' }] })).toBe(true)
  })

  it('is none of the figures Grid holds today: every one is ai-found, so none is given for a comparison', () => {
    for (const key of Object.keys(FIGURES) as FigureKey[]) {
      expect(FIGURES[key].provenance.status, key).toBe('ai-found')
      expect(confirmedFigure(key, { country: 'US', building: 'home' }), key).toBeNull()
      expect(confirmedFigure(key, { country: 'US' }), key).toBeNull()
    }
  })

  it('is given once a named person has checked it, with its source and who checked it', () => {
    const table = withProvenance('exitDoorClearWidth', { status: 'checked-once', verifiedBy: PERSON })
    expect(confirmedFigure('exitDoorClearWidth', { country: 'US' }, table)).toEqual({
      key: 'exitDoorClearWidth',
      value: 0.813,
      unit: 'm',
      status: 'checked-once',
      jurisdiction: 'US model codes',
      readFor: 'homes',
      citations: [
        { document: 'IBC', edition: '2024', clause: '1010.1.1' },
        { document: 'IRC', edition: '2024', clause: 'R318.2' },
      ],
      verifiedBy: PERSON,
    })
  })

  it('is not given with no place stated, for another place, or for a building it was not read for', () => {
    const table = withProvenance('routeMinWidth', { status: 'checked-twice', verifiedBy: [...PERSON, { by: 'B. Second', on: '2026-12-02' }] })
    expect(confirmedFigure('routeMinWidth', {}, table)).toBeNull()
    expect(confirmedFigure('routeMinWidth', { country: ' ' }, table)).toBeNull()
    expect(confirmedFigure('routeMinWidth', { country: 'United Kingdom' }, table)).toBeNull()
    expect(confirmedFigure('routeMinWidth', { country: 'US', building: 'office' }, table)).toBeNull()
    expect(confirmedFigure('routeMinWidth', { country: 'usa', building: 'home' }, table)?.value).toBe(0.914)
  })
})
