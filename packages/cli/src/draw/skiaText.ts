/**
 * VEW-7: a picture's text as Skia needs it to draw it where a browser does. Applied to the
 * PNG only, just before Skia rasterises the SVG: the SVG file a person keeps is the picture
 * as it is.
 *
 * - Skia moves a centred text (`text-anchor="middle"`) by only half its `dy`, so a room's
 *   area, 16 px under its name in the app and the SVG, ran into the name in a PNG, and the
 *   dimension figures sat closer to their lines. A `y` it places in full, so `dy` becomes `y`.
 * - Skia draws a whole text in one font, so runs in other scripts get one that has them
 *   (`withScriptFonts`).
 */
import type { SvgChild, SvgNode } from '@ongrid/viewer/src/picture/svgNode'
import { withScriptFonts } from './scriptFonts'

function offsetOf(value: SvgNode['attrs'][string]): number | null {
  if (value === undefined) return 0
  if (typeof value === 'boolean' || String(value).trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

/** The nodes with every `<text>`'s `dy`, when a plain number, added to its `y`. */
export function dyAsY(nodes: readonly SvgNode[]): SvgNode[] {
  const rewrite = (node: SvgNode): SvgNode => {
    const children = node.children.map((child): SvgChild => (typeof child === 'string' ? child : rewrite(child)))
    if (node.tag !== 'text' || node.attrs.dy === undefined) return { ...node, children }
    const dy = offsetOf(node.attrs.dy)
    const y = offsetOf(node.attrs.y)
    if (dy === null || y === null) return { ...node, children }
    return { ...node, attrs: { ...node.attrs, dy: undefined, y: y + dy }, children }
  }
  return nodes.map(rewrite)
}

/** A picture's nodes ready for Skia: offsets it places in full, and fonts for every script. */
export function forSkia(nodes: readonly SvgNode[], installed: (family: string) => boolean): SvgNode[] {
  return withScriptFonts(dyAsY(nodes), installed)
}
