/**
 * Strips across a wall, for openings: pure geometry in plan metres, no DOM. Kept apart from
 * `buildFrame.ts` so the picture (`picture/scene.ts`) can use it without the live build's
 * modules, which need a browser.
 */

import type { PlanOpening, Vec2 } from '@ongrid/floorplan/geometry'

const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t
})

/** The opening `t` of the way open, from its centre outwards. */
export function openingAt(opening: PlanOpening, t: number): { from: Vec2; to: Vec2 } {
  const centre = lerp(opening.from, opening.to, 0.5)
  return { from: lerp(centre, opening.from, t), to: lerp(centre, opening.to, t) }
}

/** A strip across the wall between two points of its axis. */
export function stripAcross(from: Vec2, to: Vec2, normal: Vec2, thickness: number): Vec2[] {
  const nx = (normal.x * thickness) / 2
  const ny = (normal.y * thickness) / 2
  return [
    { x: from.x + nx, y: from.y + ny },
    { x: to.x + nx, y: to.y + ny },
    { x: to.x - nx, y: to.y - ny },
    { x: from.x - nx, y: from.y - ny }
  ]
}
