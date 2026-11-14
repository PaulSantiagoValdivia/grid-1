import { useMemo, useSyncExternalStore } from 'react'

/** Scene colors for the 3D view, resolved from the active theme's --plan-* tokens. */
export interface PlanColors3D {
  background: string
  grid: string
  gridSection: string
  wallExterior: string
  wallInterior: string
  wallDetached: string
  floor: string
  /** How much a muted storey glows in its own colour, 0 to 1 (`mutedGlow`). */
  mutedWash: number
  /** A room a plan note points at. */
  note: string
}

const TOKENS: Record<Exclude<keyof PlanColors3D, 'mutedWash'>, string> = {
  background: '--plan-background-3d',
  grid: '--plan-grid',
  gridSection: '--plan-grid-section',
  wallExterior: '--plan-wall-exterior-3d',
  wallInterior: '--plan-wall-interior-3d',
  wallDetached: '--plan-wall-detached-3d',
  floor: '--plan-floor-3d',
  note: '--plan-note'
}

/** A wash token as a number from 0 to 1; anything unreadable is no wash. */
function wash(value: string): number {
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0
}

/**
 * Reads the scene tokens off a computed style. Pulled out of the hook so it's
 * testable without a DOM (this project's Vitest config has no jsdom environment).
 */
export function readPlanColors(
  style: Pick<CSSStyleDeclaration, 'getPropertyValue'>
): PlanColors3D {
  const read = (name: string): string => style.getPropertyValue(name).trim()
  return {
    background: read(TOKENS.background),
    grid: read(TOKENS.grid),
    gridSection: read(TOKENS.gridSection),
    wallExterior: read(TOKENS.wallExterior),
    wallInterior: read(TOKENS.wallInterior),
    wallDetached: read(TOKENS.wallDetached),
    floor: read(TOKENS.floor),
    note: read(TOKENS.note),
    mutedWash: wash(read('--plan-muted-wash-3d'))
  }
}

function subscribeToRootClass(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

function rootClass(): string {
  return document.documentElement.className
}

/**
 * Background, grid, wall-exposure and floor colors for the 3D scene, read from the
 * same --plan-* tokens the 2D canvas uses so both views always match the active theme.
 *
 * Keyed on <html>'s class itself, not on `resolvedTheme`: ThemeProvider flips the
 * `.dark` class in an effect, after this component has rendered, so reading on a
 * `resolvedTheme` change got the previous theme's tokens every time.
 */
export function usePlanColors(): PlanColors3D {
  const themeClass = useSyncExternalStore(subscribeToRootClass, rootClass)
  return useMemo(() => {
    void themeClass
    return readPlanColors(getComputedStyle(document.documentElement))
  }, [themeClass])
}
