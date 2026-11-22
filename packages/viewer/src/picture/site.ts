/**
 * BRF-3: the site on the ground floor's plan: the plot's boundary, a long dash and a dot, its street
 * edges heavier, and the site's things in their own style: paving and paths a pale fill, a pool
 * its water, a tree its crown and trunk, a fence a fine line and a gate its posts. Never drawn as a
 * wall or a room. Under the rooms, so the building covers what it stands on.
 *
 * Where each thing is comes from the geometry core (`PlanDrawing.site`); nothing here computes
 * geometry of its own. Colours come from the look (`Look.site`), line widths from its lines
 * (`boundary`, `street`, `site`), so the technical look draws it with its pens.
 *
 * Pure: no DOM, no React.
 */
import type { PlanSite, PlanSiteThing, Vec2 } from '@ongrid/floorplan/geometry'
import type { LineMetres, Look } from './look'
import { lengthText } from './look'
import type { Attrs, SvgNode } from './svgNode'
import { el } from './svgNode'

const n = (value: number): string => lengthText(value)
const open = (points: readonly Vec2[]): string => `M${points.map((p) => `${n(p.x)},${n(-p.y)}`).join('L')}`
const closed = (points: readonly Vec2[]): string => `${open(points)}Z`

/** A tree's trunk, and the crown of one whose canopy is not stated, in screen pixels. */
const TRUNK_PX = 2.5
const CROWN_PX = 9

/** The site's paints, for one look and zoom. */
export function sitePaints(look: Look, line: LineMetres) {
  const c = look.site
  const w = (part: 'boundary' | 'street' | 'site'): string => n(line.width(part))
  return {
    boundary: { fill: 'none', stroke: c.boundary, 'stroke-width': w('boundary'), 'stroke-dasharray': line.dash('boundary').map(n).join(' '), 'stroke-linejoin': 'miter' } as Attrs,
    street: { fill: 'none', stroke: c.street, 'stroke-width': w('street'), 'stroke-linecap': 'butt' } as Attrs,
    fence: { fill: 'none', stroke: c.fence, 'stroke-width': w('site'), 'stroke-linejoin': 'round' } as Attrs,
    gate: { fill: 'none', stroke: c.gate, 'stroke-width': w('boundary'), 'stroke-linecap': 'butt' } as Attrs,
    post: { fill: c.gate, stroke: 'none' } as Attrs,
    path: { fill: c.pathFill, stroke: c.pathEdge, 'stroke-width': w('site'), 'stroke-linejoin': 'round' } as Attrs,
    paving: { fill: c.pavingFill, stroke: c.pavingEdge, 'stroke-width': w('site'), 'stroke-linejoin': 'round' } as Attrs,
    pool: { fill: c.poolFill, stroke: c.poolEdge, 'stroke-width': w('boundary'), 'stroke-linejoin': 'round' } as Attrs,
    tree: { fill: c.treeFill, stroke: c.treeEdge, 'stroke-width': w('site') } as Attrs,
    trunk: { fill: c.treeEdge, stroke: 'none' } as Attrs,
  }
}

export type SitePaints = ReturnType<typeof sitePaints>

/** The order things are drawn in: the ground first, then what stands on it. */
const ORDER: Readonly<Record<PlanSiteThing['kind'], number>> = { paving: 0, path: 1, pool: 2, tree: 3, fence: 4, gate: 5 }

function thingNode(thing: PlanSiteThing, paint: SitePaints, mpp: number, index: number): SvgNode {
  const attrs = { 'data-part': 'site-thing', 'data-kind': thing.kind, 'data-id': thing.id, 'pointer-events': 'none' }
  const key = `site:${thing.id}:${index}`
  const children: SvgNode[] = []
  switch (thing.kind) {
    case 'paving':
    case 'path':
    case 'pool':
      thing.rings.forEach((ring, i) => children.push(el('path', { d: closed(ring), ...paint[thing.kind] }, [], String(i))))
      break
    case 'fence':
      thing.lines.forEach((line, i) => children.push(el('path', { d: open(line), ...paint.fence }, [], String(i))))
      break
    case 'gate':
      thing.lines.forEach((line, i) => {
        children.push(el('path', { d: open(line), ...paint.gate }, [], `g${i}`))
        for (const [j, post] of [line[0]!, line.at(-1)!].entries()) children.push(el('circle', { cx: n(post.x), cy: n(-post.y), r: n(TRUNK_PX * mpp), ...paint.post }, [], `p${i}:${j}`))
      })
      break
    case 'tree': {
      const tree = thing.tree!
      children.push(el('circle', { cx: n(tree.at.x), cy: n(-tree.at.y), r: n(tree.radius ?? CROWN_PX * mpp), ...paint.tree }, [], 'crown'))
      children.push(el('circle', { cx: n(tree.at.x), cy: n(-tree.at.y), r: n(TRUNK_PX * mpp), ...paint.trunk }, [], 'trunk'))
      break
    }
  }
  return el('g', attrs, children, key)
}

/** The site, as one group: the things, then the street edges and the boundary over them. */
export function siteNodes(site: PlanSite, paint: SitePaints, mpp: number): SvgNode[] {
  const things = site.things.map((thing, index) => ({ thing, index })).sort((a, b) => ORDER[a.thing.kind] - ORDER[b.thing.kind] || a.index - b.index)
  const children = things.map(({ thing, index }) => thingNode(thing, paint, mpp, index))
  site.streets.forEach((edge, i) => children.push(el('path', { 'data-part': 'site-street', d: open(edge), ...paint.street }, [], `street:${i}`)))
  if (site.boundary !== null) children.push(el('path', { 'data-part': 'site-boundary', d: closed(site.boundary), ...paint.boundary }, [], 'boundary'))
  return [el('g', { 'data-part': 'site', 'pointer-events': 'none', 'aria-hidden': 'true' }, children, 'site')]
}
