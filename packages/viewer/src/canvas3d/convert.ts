import * as THREE from 'three'
import type { Vec3, WallExposure } from '@ongrid/core/geometry'
import type { StoreyLook } from './building'

/**
 * The model is Z-up (plan on XY, height on Z, the CAD convention) and Three is
 * Y-up. This is convention C4, and this is the only place it happens.
 *
 *   model (x, y, z)  →  Three (x, z, −y)
 *
 * The sign on Y is not cosmetic: without it the transform mirrors the scene
 * and everything comes out flipped left to right.
 */
export function toThree(v: Vec3): THREE.Vector3 {
  return new THREE.Vector3(v.x, v.z, -v.y)
}

/** The same conversion as a matrix, for transforming whole geometries. */
export const MODEL_TO_THREE = new THREE.Matrix4().makeBasis(
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(0, 1, 0)
)

/** The subset of PlanColors3D that wallExposureColor needs. */
export interface WallExposurePalette {
  wallExterior: string
  wallInterior: string
  wallDetached: string
}

/**
 * Wall material color by structural exposure, so exterior and interior
 * walls read as visually distinct in the 3D view.
 *
 * Colors differ in hue, not just lightness — three shades of the same
 * beige (the first attempt) turned out indistinguishable once the scene's
 * lighting/shadows are on top of them. `interior` keeps the original
 * neutral beige so existing plans don't change look; `exterior` and
 * `detached` are a distinct cool and warm tone respectively. The palette
 * itself is theme-resolved by usePlanColors, so the same hue per exposure
 * carries across light and dark, only its lightness/saturation changes.
 */
export function wallExposureColor(exposure: WallExposure, palette: WallExposurePalette): string {
  switch (exposure) {
    case 'exterior':
      return palette.wallExterior
    case 'interior':
      return palette.wallInterior
    case 'detached':
      return palette.wallDetached
  }
}

/** How far a muted storey's colours go toward the background: context, not the subject. */
const MUTED_MIX = 0.6
/** How far a hovered storey's colours go toward the note colour: a tint, still itself. */
const HOVER_MIX = 0.2

/** `#rgb`, `#rrggbb` or `#rrggbbaa` as its red, green and blue, or null for anything else. */
function parseHex(color: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(color.trim())
  if (!match) return null
  let digits = match[1]!
  if (digits.length === 3) digits = [...digits].map((d) => d + d).join('')
  const n = parseInt(digits.slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * `color` moved `amount` of the way toward `toward`, as `#rrggbb`. A colour it
 * cannot read comes back unchanged, so a theme token it doesn't expect never
 * breaks the scene.
 */
function mix(color: string, toward: string, amount: number): string {
  const from = parseHex(color)
  const to = parseHex(toward)
  if (!from || !to) return color
  return (
    '#' +
    from
      .map((c, i) => Math.round(c + (to[i]! - c) * amount))
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
  )
}

/** A storey below the focused one: its colours toward the background, still opaque. */
export function mutedColor(color: string, background: string): string {
  return mix(color, background, MUTED_MIX)
}

/**
 * How much a storey's own colour lights it, on top of the scene's lights. Only a muted storey
 * glows, by the theme's wash: light walls sit close to the light background, so mixing them
 * toward it barely shows once the lighting darkens them back. Dark theme's wash is 0.
 */
export function mutedGlow(look: StoreyLook, wash: number): number {
  return look === 'muted' ? wash : 0
}

/** The storey under the pointer: its colours tinted toward the plan-note colour. */
export function hoverColor(color: string, note: string): string {
  return mix(color, note, HOVER_MIX)
}
