import type { PlanColors3D } from '../canvas3d/usePlanColors'

/**
 * The 3D view's colours as final values, for a still, which has no stylesheet to read them
 * from. The app reads the same `--plan-*-3d` tokens from `plan-tokens.css` (`usePlanColors`);
 * a test reads the sheet and checks every value here against it.
 */

/** The light theme, from `plan-tokens.css`. */
export const LIGHT_COLORS_3D: PlanColors3D = Object.freeze({
  background: '#f1eee8',
  grid: '#e6e2d6',
  gridSection: '#cfc9b8',
  wallExterior: '#e6e1d7',
  wallInterior: '#f4f1eb',
  wallDetached: '#9f5138',
  floor: '#fbfaf7',
  mutedWash: 0.5,
  note: '#c2410c'
})

/** The dark theme, from `plan-tokens.css`. */
export const DARK_COLORS_3D: PlanColors3D = Object.freeze({
  background: '#15150f',
  grid: '#3d3a2e',
  gridSection: '#57533f',
  wallExterior: '#cbc6bb',
  wallInterior: '#e6e2da',
  wallDetached: '#b3654a',
  floor: '#b9ae95',
  mutedWash: 0,
  note: '#fb923c'
})
