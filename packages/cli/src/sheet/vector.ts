/**
 * SHT-6: a drawing's SVG elements drawn onto a canvas as paths and text, so Skia's PDF writer
 * keeps them vector. Skia draws an SVG handed to it as an image at a fixed resolution, so the
 * sheet at a true scale walks its own elements instead: the same tree its SVG file is written
 * from (`toSvg`), drawn once onto a PDF page and once onto the PNG's canvas.
 *
 * It draws what Grid's pictures and sheets write, and nothing more: `VECTOR_TAGS`, with their
 * colours, line widths, dashes and transforms written on each element, as `planScene` writes
 * them. Colours and widths are inherited from a group, as in SVG. Text is drawn in the sheet's
 * own sans face (`SANS`) whatever family an element names, so a sheet reads the same on every
 * machine. A test draws the lab's buildings and fails on a tag or attribute not handled here.
 */
import type { Path2D, SKRSContext2D } from '@napi-rs/canvas'
import type { SvgChild, SvgNode } from '@ongrid/viewer/src/picture/svgNode'
import { SANS, sheetFont } from './fonts'

type Ctx = SKRSContext2D
type Canvas = typeof import('@napi-rs/canvas')

/** The elements drawn. Any other is left out (a test holds the pictures to this list). */
export const VECTOR_TAGS = ['svg', 'g', 'path', 'line', 'rect', 'circle', 'polygon', 'polyline', 'text'] as const

/**
 * The attributes read, besides each tag's own geometry. Anything else (`data-*`, `aria-*`,
 * `role`, `pointer-events`, `class`, `xmlns`) says what a part is, never how it looks.
 */
export const VECTOR_STYLE = [
  'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'fill-opacity', 'stroke-opacity', 'opacity',
  'fill-rule', 'transform', 'font-size', 'font-weight', 'font-family', 'text-anchor', 'dy',
] as const

const GEOMETRY: Readonly<Record<string, readonly string[]>> = {
  svg: ['x', 'y', 'width', 'height', 'viewBox', 'preserveAspectRatio'],
  path: ['d'],
  line: ['x1', 'y1', 'x2', 'y2'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  circle: ['cx', 'cy', 'r'],
  polygon: ['points'],
  polyline: ['points'],
  text: ['x', 'y'],
}

/** Whether an attribute only says what a part is, never how it looks: `data-*`, `aria-*`, `role` and the like. */
export function vectorIgnores(name: string): boolean {
  return name.startsWith('data-') || name.startsWith('aria-') || ['role', 'pointer-events', 'xmlns', 'class', 'key'].includes(name)
}

/** Whether the walker reads an attribute of a tag: a style or the tag's geometry. */
export function vectorAttribute(tag: string, name: string): boolean {
  return (VECTOR_STYLE as readonly string[]).includes(name) || (GEOMETRY[tag] ?? []).includes(name)
}

interface Style {
  readonly fill: string
  readonly stroke: string
  readonly strokeWidth: number
  readonly dash: readonly number[]
  readonly cap: CanvasLineCap
  readonly join: CanvasLineJoin
  readonly fillOpacity: number
  readonly strokeOpacity: number
  readonly fillRule: CanvasFillRule
  readonly fontSize: number
  readonly bold: boolean
  readonly anchor: CanvasTextAlign
}

const INITIAL: Style = {
  fill: '#000000', stroke: 'none', strokeWidth: 1, dash: [], cap: 'butt', join: 'miter',
  fillOpacity: 1, strokeOpacity: 1, fillRule: 'nonzero', fontSize: 16, bold: false, anchor: 'start',
}

const num = (value: unknown, otherwise = 0): number => {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  return Number.isFinite(n) ? n : otherwise
}

const numbers = (text: string): number[] => (text.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number)

function styleOf(node: SvgNode, parent: Style): Style {
  const a = node.attrs
  const has = (name: string): boolean => a[name] !== undefined
  const text = (name: string): string => String(a[name])
  const dash = has('stroke-dasharray') ? (text('stroke-dasharray') === 'none' ? [] : numbers(text('stroke-dasharray'))) : parent.dash
  const anchor = has('text-anchor') ? ({ middle: 'center', end: 'right', start: 'left' } as const)[text('text-anchor') as 'middle' | 'end' | 'start'] ?? 'left' : parent.anchor
  const weight = has('font-weight') ? text('font-weight') : null
  return {
    fill: has('fill') ? text('fill') : parent.fill,
    stroke: has('stroke') ? text('stroke') : parent.stroke,
    strokeWidth: has('stroke-width') ? num(a['stroke-width'], 1) : parent.strokeWidth,
    dash: dash.some((d) => d > 0) ? dash : [],
    cap: has('stroke-linecap') ? (text('stroke-linecap') as CanvasLineCap) : parent.cap,
    join: has('stroke-linejoin') ? (text('stroke-linejoin') as CanvasLineJoin) : parent.join,
    fillOpacity: has('fill-opacity') ? num(a['fill-opacity'], 1) : parent.fillOpacity,
    strokeOpacity: has('stroke-opacity') ? num(a['stroke-opacity'], 1) : parent.strokeOpacity,
    fillRule: has('fill-rule') ? (text('fill-rule') === 'evenodd' ? 'evenodd' : 'nonzero') : parent.fillRule,
    fontSize: has('font-size') ? num(a['font-size'], parent.fontSize) : parent.fontSize,
    bold: weight === null ? parent.bold : weight === 'bold' || num(weight) >= 600,
    anchor,
  }
}

/** Applies an SVG `transform` list: translate, scale, rotate (about a point too) and matrix. */
function applyTransform(ctx: Ctx, transform: string): void {
  for (const [, name, args] of transform.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const v = numbers(args ?? '')
    switch (name) {
      case 'translate': ctx.translate(v[0] ?? 0, v[1] ?? 0); break
      case 'scale': ctx.scale(v[0] ?? 1, v[1] ?? v[0] ?? 1); break
      case 'rotate': {
        const angle = ((v[0] ?? 0) * Math.PI) / 180
        if (v.length >= 3) { ctx.translate(v[1]!, v[2]!); ctx.rotate(angle); ctx.translate(-v[1]!, -v[2]!) } else ctx.rotate(angle)
        break
      }
      case 'matrix': if (v.length === 6) ctx.transform(v[0]!, v[1]!, v[2]!, v[3]!, v[4]!, v[5]!); break
    }
  }
}

function paint(ctx: Ctx, path: Path2D, style: Style, opacity: number, closed: boolean): void {
  if (closed && style.fill !== 'none') {
    ctx.globalAlpha = opacity * style.fillOpacity
    ctx.fillStyle = style.fill
    ctx.fill(path, style.fillRule)
  }
  if (style.stroke !== 'none' && style.strokeWidth > 0) {
    ctx.globalAlpha = opacity * style.strokeOpacity
    ctx.strokeStyle = style.stroke
    ctx.lineWidth = style.strokeWidth
    ctx.lineCap = style.cap
    ctx.lineJoin = style.join
    ctx.setLineDash([...style.dash])
    ctx.stroke(path)
    ctx.setLineDash([])
  }
  ctx.globalAlpha = 1
}

function pointsPath(canvas: Canvas, text: string, close: boolean): Path2D {
  const v = numbers(text)
  const path = new canvas.Path2D()
  for (let i = 0; i + 1 < v.length; i += 2) {
    if (i === 0) path.moveTo(v[i]!, v[i + 1]!)
    else path.lineTo(v[i]!, v[i + 1]!)
  }
  if (close) path.closePath()
  return path
}

/** Text is set at this size and scaled to the element's, so a size under a point stays exact. */
const TEXT_SET = 100

function drawText(ctx: Ctx, node: SvgNode, style: Style, opacity: number): void {
  const words = node.children.filter((child): child is string => typeof child === 'string').join('')
  if (words.length === 0 || style.fill === 'none' || style.fontSize <= 0) return
  const k = style.fontSize / TEXT_SET
  ctx.save()
  ctx.translate(num(node.attrs['x']), num(node.attrs['y']) + num(node.attrs['dy']))
  ctx.scale(k, k)
  ctx.font = sheetFont(SANS, TEXT_SET, style.bold ? 600 : 400)
  // No ligatures, so every letter has its own text in the PDF (as `pdf.ts` sets).
  ctx.textRendering = 'optimizeSpeed'
  ctx.textAlign = style.anchor
  ctx.textBaseline = 'alphabetic'
  ctx.globalAlpha = opacity * style.fillOpacity
  ctx.fillStyle = style.fill
  ctx.fillText(words, 0, 0)
  ctx.restore()
}

/** A nested `<svg>`: its box on the parent, and its `viewBox` fitted into it, centred, aspect kept. */
function enterSvg(ctx: Ctx, canvas: Canvas, node: SvgNode): void {
  const a = node.attrs
  const x = num(a['x'])
  const y = num(a['y'])
  ctx.translate(x, y)
  const box = a['viewBox'] === undefined ? null : numbers(String(a['viewBox']))
  if (box === null || box.length !== 4 || a['width'] === undefined || a['height'] === undefined) return
  const width = num(a['width'])
  const height = num(a['height'])
  const clip = new canvas.Path2D()
  clip.rect(0, 0, width, height)
  ctx.clip(clip)
  const [bx, by, bw, bh] = box as [number, number, number, number]
  if (!(bw > 0 && bh > 0)) return
  const s = Math.min(width / bw, height / bh)
  ctx.translate((width - bw * s) / 2, (height - bh * s) / 2)
  ctx.scale(s, s)
  ctx.translate(-bx, -by)
}

function drawNode(ctx: Ctx, canvas: Canvas, node: SvgNode, parent: Style, parentOpacity: number): void {
  if (!(VECTOR_TAGS as readonly string[]).includes(node.tag)) return
  const style = styleOf(node, parent)
  const opacity = parentOpacity * num(node.attrs['opacity'], 1)
  const a = node.attrs
  ctx.save()
  if (a['transform'] !== undefined) applyTransform(ctx, String(a['transform']))
  switch (node.tag) {
    case 'svg': enterSvg(ctx, canvas, node); drawNodes(ctx, canvas, node.children, style, opacity); break
    case 'g': drawNodes(ctx, canvas, node.children, style, opacity); break
    case 'path': paint(ctx, new canvas.Path2D(String(a['d'] ?? '')), style, opacity, true); break
    case 'line': {
      const path = new canvas.Path2D()
      path.moveTo(num(a['x1']), num(a['y1']))
      path.lineTo(num(a['x2']), num(a['y2']))
      paint(ctx, path, style, opacity, false)
      break
    }
    case 'rect': {
      const path = new canvas.Path2D()
      const r = num(a['rx'] ?? a['ry'])
      if (r > 0) path.roundRect(num(a['x']), num(a['y']), num(a['width']), num(a['height']), r)
      else path.rect(num(a['x']), num(a['y']), num(a['width']), num(a['height']))
      paint(ctx, path, style, opacity, true)
      break
    }
    case 'circle': {
      const path = new canvas.Path2D()
      path.arc(num(a['cx']), num(a['cy']), num(a['r']), 0, 2 * Math.PI)
      path.closePath()
      paint(ctx, path, style, opacity, true)
      break
    }
    case 'polygon': paint(ctx, pointsPath(canvas, String(a['points'] ?? ''), true), style, opacity, true); break
    case 'polyline': paint(ctx, pointsPath(canvas, String(a['points'] ?? ''), false), style, opacity, true); break
    case 'text': drawText(ctx, node, style, opacity); break
  }
  ctx.restore()
}

function drawNodes(ctx: Ctx, canvas: Canvas, nodes: readonly SvgChild[], style: Style, opacity: number): void {
  for (const node of nodes) if (typeof node !== 'string') drawNode(ctx, canvas, node, style, opacity)
}

/**
 * Draws elements onto a canvas, in the canvas's current units: on a sheet, millimetres, scaled
 * to the page by the caller. The sheet's fonts must be registered first (`registerSheetFonts`).
 */
export function drawVector(ctx: Ctx, canvas: Canvas, nodes: readonly SvgChild[]): void {
  drawNodes(ctx, canvas, nodes, INITIAL, 1)
}
