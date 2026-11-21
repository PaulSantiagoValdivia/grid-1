/**
 * VEW-7: a sheet drawn as an A3 landscape PDF, with Skia's PDF writer through
 * `@napi-rs/canvas` (MIT). Text stays vector; the floor drawings and the 3D picture are images.
 *
 * This file only places what `pages.ts` decided. Every picture comes from `drawPlan` or
 * `drawStill`, never drawn here.
 */
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import type { SKRSContext2D } from '@napi-rs/canvas'
import { loadCanvas } from '../draw/canvas'
import { drawPlan } from '../draw/drawPlan'
import { drawStill } from '../draw/drawStill'
import { SANS, SERIF, useSheetFonts } from './fonts'
import { PLAN_BOX, type Sheet, type SheetPage } from './pages'

export const A3 = { width: 1191, height: 842 } as const
const MARGIN = 48
const INK = '#2f2f2b'
const QUIET = '#77746c'
const PAPER = '#f8f7f3'
const RULE = '#d9d6ce'
const SIDE_X = MARGIN + PLAN_BOX.width + 40
const SIDE_WIDTH = A3.width - SIDE_X - MARGIN

type Ctx = SKRSContext2D
type Canvas = typeof import('@napi-rs/canvas')

function font(ctx: Ctx, family: string, size: number, weight: 400 | 600 = 400): void {
  ctx.font = `${weight} ${size}px "${family}"`
}

/** Wraps a paragraph to a width, by the font's own measure. Returns the y below it. */
function paragraph(ctx: Ctx, text: string, x: number, y: number, width: number, lineHeight: number): number {
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > width && line) {
      ctx.fillText(line, x, y)
      y += lineHeight
      line = word
    } else {
      line = next
    }
  }
  if (line) { ctx.fillText(line, x, y); y += lineHeight }
  return y
}

function footer(ctx: Ctx, page: SheetPage): void {
  const y = A3.height - MARGIN + 18
  ctx.strokeStyle = RULE
  ctx.beginPath(); ctx.moveTo(MARGIN, y - 18); ctx.lineTo(A3.width - MARGIN, y - 18); ctx.stroke()
  font(ctx, SANS, 9)
  ctx.fillStyle = QUIET
  ctx.textAlign = 'left'
  ctx.fillText(page.footer.label, MARGIN, y)
  ctx.textAlign = 'right'
  ctx.fillText(`${String(page.footer.page).padStart(2, '0')} / ${String(page.footer.pages).padStart(2, '0')}  ·  ${page.footer.date}`, A3.width - MARGIN, y)
  ctx.textAlign = 'left'
}

function header(ctx: Ctx, page: SheetPage): number {
  font(ctx, SANS, 10)
  ctx.fillStyle = QUIET
  ctx.fillText(page.topLine.toUpperCase(), MARGIN, MARGIN)
  let y = MARGIN + 40
  if (page.title) { font(ctx, SERIF, 34); ctx.fillStyle = INK; ctx.fillText(page.title, MARGIN, y); y += 22 }
  if (page.subtitle) { font(ctx, SANS, 13); ctx.fillStyle = QUIET; ctx.fillText(page.subtitle, MARGIN, y); y += 16 }
  return y
}

function side(ctx: Ctx, page: SheetPage, top: number): void {
  let y = top
  if (page.table) {
    font(ctx, SANS, 9); ctx.fillStyle = QUIET; ctx.fillText(page.table.heading.toUpperCase(), SIDE_X, y); y += 20
    for (const row of [...page.table.rows, page.table.total]) {
      font(ctx, SANS, 11, row === page.table.total ? 600 : 400)
      ctx.fillStyle = INK
      ctx.fillText(row.detail ? `${row.name} · ${row.detail}` : row.name, SIDE_X, y)
      ctx.textAlign = 'right'; ctx.fillText(row.area, SIDE_X + SIDE_WIDTH, y); ctx.textAlign = 'left'
      ctx.strokeStyle = RULE; ctx.beginPath(); ctx.moveTo(SIDE_X, y + 8); ctx.lineTo(SIDE_X + SIDE_WIDTH, y + 8); ctx.stroke()
      y += 24
    }
    font(ctx, SANS, 9); ctx.fillStyle = QUIET
    y = paragraph(ctx, page.table.note, SIDE_X, y + 6, SIDE_WIDTH, 12) + 12
  }
  font(ctx, SANS, 12); ctx.fillStyle = INK
  for (const text of page.paragraphs) y = paragraph(ctx, text, SIDE_X, y, SIDE_WIDTH, 17) + 8
  font(ctx, SANS, 9); ctx.fillStyle = QUIET
  for (const note of page.notes) y = paragraph(ctx, note, SIDE_X, y, SIDE_WIDTH, 12) + 6
}

async function drawFloorPage(ctx: Ctx, canvas: Canvas, plan: FloorPlan, page: SheetPage): Promise<void> {
  const top = header(ctx, page) + 10
  if (page.picture?.kind === 'plan') {
    // The frame is in plan metres and the box has one size on every floor: one scale throughout.
    const svg = await drawPlan(plan, {
      format: 'svg', floor: page.picture.floor, frame: page.picture.frame,
      width: PLAN_BOX.width, height: PLAN_BOX.height,
      ...(page.picture.ids ? { labels: { ids: true } } : {}),
    })
    const image = await canvas.loadImage(Buffer.from(svg))
    ctx.drawImage(image, MARGIN, top, PLAN_BOX.width, PLAN_BOX.height)
  }
  side(ctx, page, top + 10)
}

async function drawCover(ctx: Ctx, canvas: Canvas, plan: FloorPlan, page: SheetPage): Promise<void> {
  const top = header(ctx, page) + 16
  const width = A3.width - 2 * MARGIN
  const height = 430
  const still = await drawStill(plan, { width: Math.round(width), height, scale: 2 })
  ctx.drawImage(await canvas.loadImage(Buffer.from(still)), MARGIN, top, width, height)
  let y = top + height + 50
  const column = width / Math.max(1, page.figures.length)
  page.figures.forEach((figure, i) => {
    font(ctx, SERIF, 30); ctx.fillStyle = INK; ctx.fillText(figure.value, MARGIN + i * column, y)
    font(ctx, SANS, 11); ctx.fillStyle = QUIET; ctx.fillText(figure.label, MARGIN + i * column, y + 18)
  })
  y += 50
  font(ctx, SANS, 12); ctx.fillStyle = INK
  for (const text of page.paragraphs) y = paragraph(ctx, text, MARGIN, y, width, 17) + 6
}

function drawSummary(ctx: Ctx, page: SheetPage): void {
  let y = header(ctx, page) + 30
  const width = A3.width - 2 * MARGIN
  page.figures.forEach((figure, i) => {
    font(ctx, SERIF, 26); ctx.fillStyle = INK; ctx.fillText(figure.value, MARGIN + i * 200, y)
    font(ctx, SANS, 10); ctx.fillStyle = QUIET; ctx.fillText(figure.label, MARGIN + i * 200, y + 16)
  })
  y += 60
  font(ctx, SANS, 12); ctx.fillStyle = INK
  for (const text of page.paragraphs) y = paragraph(ctx, text, MARGIN, y, width, 17) + 10
  font(ctx, SANS, 9); ctx.fillStyle = QUIET
  for (const note of page.notes) y = paragraph(ctx, note, MARGIN, y, width, 12) + 6
}

export async function sheetPdf(plan: FloorPlan, sheet: Sheet): Promise<Uint8Array> {
  const canvas = await loadCanvas()
  // Not a React hook: the name only starts with "use".
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useSheetFonts(canvas)
  const doc = new canvas.PDFDocument({ title: sheet.name, creator: 'Grid', producer: 'Grid' })
  for (const page of sheet.pages) {
    const ctx = doc.beginPage(A3.width, A3.height)
    ctx.fillStyle = PAPER
    ctx.fillRect(0, 0, A3.width, A3.height)
    if (page.kind === 'cover') await drawCover(ctx, canvas, plan, page)
    else if (page.kind === 'summary') drawSummary(ctx, page)
    else await drawFloorPage(ctx, canvas, plan, page)
    footer(ctx, page)
    doc.endPage()
  }
  return new Uint8Array(doc.close())
}
