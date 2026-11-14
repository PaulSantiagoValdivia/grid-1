// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pulseAt } from '../pulse'
import { useReducedMotion } from '../useReducedMotion'

const point = { x: 2, y: 3 }

describe('pulseAt: where the "still working" pulse shows', () => {
  it('shows at the last part drawn once the drawing has caught up', () => {
    expect(pulseAt({ idle: true, lastPoint: point }, false)).toEqual(point)
  })

  it('hides while a build is playing', () => {
    expect(pulseAt({ idle: false, lastPoint: point }, false)).toBeNull()
  })

  it('hides before the run has drawn anything, and after it ended', () => {
    expect(pulseAt({ idle: true, lastPoint: null }, false)).toBeNull()
  })

  it('hides outside a live run', () => {
    expect(pulseAt(null, false)).toBeNull()
  })

  it('hides under reduce motion', () => {
    expect(pulseAt({ idle: true, lastPoint: point }, true)).toBeNull()
  })
})

describe('useReducedMotion', () => {
  const original = window.matchMedia
  afterEach(() => {
    window.matchMedia = original
  })

  function mockMedia(initial: boolean) {
    let listener: ((event: MediaQueryListEvent) => void) | null = null
    const query = {
      matches: initial,
      addEventListener: vi.fn((_: string, l: (event: MediaQueryListEvent) => void) => {
        listener = l
      }),
      removeEventListener: vi.fn()
    }
    window.matchMedia = vi.fn(() => query) as unknown as typeof window.matchMedia
    return {
      flip(value: boolean) {
        query.matches = value
        listener?.({ matches: value } as MediaQueryListEvent)
      }
    }
  }

  it('follows the system setting as it changes', () => {
    const media = mockMedia(false)
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)
    act(() => media.flip(true))
    expect(result.current).toBe(true)
  })

  it('reads as off where the setting can’t be read', () => {
    // @ts-expect-error: a browser without matchMedia
    window.matchMedia = undefined
    expect(renderHook(() => useReducedMotion()).result.current).toBe(false)
  })
})
