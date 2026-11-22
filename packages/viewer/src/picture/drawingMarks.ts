/**
 * LVL-9: the marks a plan carries for its other drawings, as the core places them
 * (`drawingMarks`): a section's cut line with the way it looks, an elevation mark outside each
 * main side of the building, and the level of each room's floor. Each symbol is drawn in pixels
 * round the point the core gives, so it reads the same at any zoom.
 *
 * Pure: no DOM, no React.
 */
import type { CompassPoint, DrawingMarks, Vec2 } from '@ongrid/floorplan/geometry'
import { levelText } from '@ongrid/floorplan/geometry'
import type { Look } from './look'
import { TEXT_PX, lengthText, lineMetres } from './look'
import type { Attrs, SvgNode } from './svgNode'
import { el } from './svgNode'

const n = (value: number): string => lengthText(value)
const pixelGroup = (at: Vec2, mpp: number): string => `translate(${n(at.x)} ${n(-at.y)}) scale(${n(mpp)})`

/** The heavy stroke at each end of a cut line, and the arrow and name beyond it, in pixels. */
const END_PX = 16
const ARROW_PX = 14
const NAME_PX = 28
/** An elevation mark's disc, in pixels. */
const DISC_PX = 12
/** How far under a room's label point its level stands, in pixels: below the name and the area. */
const LEVEL_DY_PX = 32

const SHORT: Readonly<Record<CompassPoint, string>> = {
  north: 'N',
  'north-east': 'NE',
  east: 'E',
  'south-east': 'SE',
  south: 'S',
  'south-west': 'SW',
  west: 'W',
  'north-west': 'NW'
}

/** A triangle pointing along `dir` (on the plan, y up), from `from` px out to `to` px, in a pixel group. */
function arrow(dir: Vec2, from: number, to: number, half: number): string {
  const d = { x: dir.x, y: -dir.y }
  const side = { x: -d.y, y: d.x }
  const p = (along: number, across: number): string => `${n(d.x * along + side.x * across)},${n(d.y * along + side.y * across)}`
  return `M${p(to, 0)}L${p(from, half)}L${p(from, -half)}Z`
}

/** The marks' elements, over the drawing and under the north arrow. `mpp` is metres per pixel. */
export function drawingMarkNodes(marks: DrawingMarks, look: Look, mpp: number, paperScale?: number): SvgNode[] {
  const lines = lineMetres(look, mpp, paperScale)
  const ink = look.ink
  const nodes: SvgNode[] = []
  const name: Attrs = { 'text-anchor': 'middle', fill: look.colors.label, 'font-family': look.colors.font, 'font-size': TEXT_PX.note, 'font-weight': 'bold' }

  const cut = marks.section
  if (cut !== null) {
    const heavy = Math.max(lines.width('elevationGround'), lines.width('mark'))
    const span = { x: cut.to.x - cut.from.x, y: cut.to.y - cut.from.y }
    const length = Math.hypot(span.x, span.y)
    const along = length === 0 ? { x: 1, y: 0 } : { x: span.x / length, y: span.y / length }
    const endBit = (at: Vec2, inward: Vec2): SvgNode => {
      const end = { x: at.x + inward.x * END_PX * mpp, y: at.y + inward.y * END_PX * mpp }
      return el('path', { 'data-part': 'section-mark-end', d: `M${n(at.x)},${n(-at.y)}L${n(end.x)},${n(-end.y)}`, fill: 'none', stroke: ink, 'stroke-width': n(heavy) })
    }
    const head = (at: Vec2): SvgNode =>
      el('g', { 'data-part': 'section-mark-head', transform: pixelGroup(at, mpp) }, [
        el('path', { d: arrow(cut.look, 2, ARROW_PX + 2, 6), fill: ink }),
        el('text', { x: n(cut.look.x * NAME_PX), y: n(-cut.look.y * NAME_PX + 5), ...name }, [cut.label])
      ])
    nodes.push(
      el('g', { 'data-part': 'section-mark', 'data-label': cut.label }, [
        el('path', { 'data-part': 'section-mark-line', d: `M${n(cut.from.x)},${n(-cut.from.y)}L${n(cut.to.x)},${n(-cut.to.y)}`, fill: 'none', stroke: ink, 'stroke-width': n(lines.width('mark')), 'stroke-dasharray': lines.dash('chain').map(n).join(' ') }),
        endBit(cut.from, along),
        endBit(cut.to, { x: -along.x, y: -along.y }),
        head(cut.from),
        head(cut.to)
      ])
    )
  }

  for (const mark of marks.elevations) {
    nodes.push(
      el('g', { 'data-part': 'elevation-mark', 'data-faces': mark.faces, 'data-facade': mark.facade, transform: pixelGroup(mark.at, mpp) }, [
        el('path', { d: arrow(mark.look, DISC_PX - 2, DISC_PX + 9, 7), fill: ink }),
        el('circle', { r: DISC_PX, fill: look.colors.paper, stroke: ink, 'stroke-width': n(lines.width('mark') / mpp) }),
        el('text', { y: '4', ...name, 'font-size': TEXT_PX.dimension }, [SHORT[mark.faces]])
      ])
    )
  }

  const level: Attrs = { fill: look.colors.labelSoft, 'font-family': look.colors.font, 'font-size': TEXT_PX.dimension }
  for (const mark of marks.levels) {
    nodes.push(
      el('g', { 'data-part': 'level-mark', 'data-id': mark.room, 'data-level': n(mark.level), 'data-stated': String(mark.stated), transform: pixelGroup(mark.at, mpp) }, [
        el('path', { d: `M-22,${LEVEL_DY_PX - 8}L-14,${LEVEL_DY_PX - 8}L-18,${LEVEL_DY_PX - 2}Z`, fill: look.colors.labelSoft }),
        el('text', { x: -10, y: LEVEL_DY_PX, ...level }, [levelText(mark.level)])
      ])
    )
  }
  return nodes
}
