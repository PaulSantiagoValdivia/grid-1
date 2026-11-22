/**
 * DXF export — AutoCAD's open interchange format, 2D.
 *
 * R12 (AC1009) on purpose. Its minimal valid form really is this small: a
 * header, a layer table, entities. R2000 and later additionally expect CLASSES,
 * a BLOCK_RECORD table and an OBJECTS dictionary, and a file that skips them is
 * one that happens to open in the readers we tried — not one to hand an
 * architect. Every CAD tool in the target set still reads R12.
 *
 * Input is a `PlanDrawing`, not a `FloorPlan`: by then the openings are already
 * cut out of the walls, broken geometry is already dropped, and the shapes are
 * the same ones the 2D canvas draws, so the export cannot disagree with what
 * the user saw. It also makes the exporter floor-agnostic for free — exporting
 * one storey is `toDxf(buildFloorPlan(planForFloor(plan, floor)))`, with nothing
 * here needing to know floors exist.
 */

import type { Vec2 } from '../vec2'
import type { PlanDrawing } from '../floorplan'
import { doorSwing, type SwingArc } from '../door'
import { TOLERANCES } from '../tolerances'
import { areaText } from '../rounding'
import { kindLabel, leftOutByKind, leftOutSummary, partNames, type LeftOutPart } from './leftOut'

/**
 * Layer names are the only organisation a DXF carries, so they are part of the
 * contract: a downstream tool keys its line weights and colours off them.
 */
export const DXF_LAYERS = {
  wallExterior: 'GRID-WALLS-EXTERIOR',
  wallInterior: 'GRID-WALLS-INTERIOR',
  wallVirtual: 'GRID-WALLS-VIRTUAL',
  rooms: 'GRID-ROOMS',
  openings: 'GRID-OPENINGS',
  labels: 'GRID-LABELS',
  // Last, so no existing layer moves. A door's leaf and arc get their own layer because
  // architects give swings a thinner pen than the walls.
  doorSwings: 'GRID-DOOR-SWINGS',
  // CNT-12: fixtures, on a layer of their own and never with the walls. Listed only in a drawing
  // that has fixtures, so the file of a plan without any is as it was.
  fixtures: 'GRID-FIXTURES',
  // HND-6: the note that says what the file leaves out of the plan. Listed only in a file that
  // leaves something out, so every other file is as it was.
  leftOut: 'GRID-LEFT-OUT'
} as const

export type DxfLayer = (typeof DXF_LAYERS)[keyof typeof DXF_LAYERS]

/** Metres, and the plan's own axes. C4 maps to DXF 1:1 — no scale, no Y flip. */
const TEXT_HEIGHT = 0.2

/**
 * R12 caps a text value at 255 bytes, and a label is not where detail belongs.
 * Counted on what is written, which is ASCII (see `sanitizeText`), so one
 * character is one byte and an escape counts as all of its seven.
 */
const MAX_TEXT = 250

/**
 * R12 is an ASCII format: a byte outside ASCII is read through a code page, so a
 * name written as UTF-8 comes out as mojibake (an n with a tilde as two stray
 * characters). The header
 * names the code page, and anything outside ASCII goes out as `\U+XXXX`, which
 * AutoCAD decodes in every version and which survives any text encoding the
 * caller saves the string with.
 */
const DXF_CODEPAGE = 'ANSI_1252'

const isPlainAscii = (code: number): boolean => code >= 0x20 && code <= 0x7e && code !== 0x5c

/**
 * The format is line-oriented: a value is one line, so anything that can carry
 * a newline can also forge a group code and corrupt every entity after it.
 * Room names come from the plan file, which the assistant writes.
 *
 * The backslash is escaped too: it is the escape character, and a name typed as
 * `\U+0041` would otherwise read back as "A". A character outside the BMP (an
 * emoji) has no `\U+XXXX` form, and a lone surrogate is no character at all, so
 * both become `?`. The cap is applied between characters, never inside an
 * escape.
 */
function sanitizeText(text: string): string {
  let out = ''

  for (const char of text.replace(/\p{Cc}/gu, '')) {
    const code = char.codePointAt(0)!
    const token = isPlainAscii(code)
      ? char
      : code > 0xffff || (code >= 0xd800 && code <= 0xdfff)
        ? '?'
        : `\\U+${code.toString(16).toUpperCase().padStart(4, '0')}`

    if (out.length + token.length > MAX_TEXT) break
    out += token
  }

  return out
}

/** Avoids `-0.000000`, which some readers parse but no one wants to read. */
function num(value: number): string {
  const fixed = value.toFixed(6)
  return fixed === '-0.000000' ? '0.000000' : fixed
}

class DxfWriter {
  private readonly lines: string[] = []

  pair(code: number, value: string | number): void {
    this.lines.push(String(code), String(value))
  }

  point(x: number, y: number, codes: readonly [number, number, number] = [10, 20, 30]): void {
    this.pair(codes[0], num(x))
    this.pair(codes[1], num(y))
    // There is no z in a plan (C4/C5): the drawing lies flat at elevation 0.
    this.pair(codes[2], num(0))
  }

  /** CRLF is what the format is written with, and what every reader expects. */
  toString(): string {
    return `${this.lines.join('\r\n')}\r\n`
  }
}

function writeHeader(w: DxfWriter, drawing: PlanDrawing): void {
  w.pair(0, 'SECTION')
  w.pair(2, 'HEADER')

  w.pair(9, '$ACADVER')
  w.pair(1, 'AC1009')

  w.pair(9, '$DWGCODEPAGE')
  w.pair(3, DXF_CODEPAGE)

  w.pair(9, '$INSBASE')
  w.point(0, 0)

  w.pair(9, '$EXTMIN')
  w.point(drawing.bounds.min.x, drawing.bounds.min.y)

  w.pair(9, '$EXTMAX')
  w.point(drawing.bounds.max.x, drawing.bounds.max.y)

  w.pair(0, 'ENDSEC')
}

/**
 * The line types the layers use. A dividing line (a virtual wall) is a line on the floor,
 * not a wall, and a drawing shows it dashed: 0.2 m dashes with 0.1 m gaps, in metres like
 * everything else. R12 needs every line type a layer names to be declared here, and
 * CONTINUOUS with it once the table exists.
 */
const LINE_TYPES = [
  { name: 'CONTINUOUS', description: 'Solid line', pattern: [] },
  { name: 'DASHED', description: 'Dashed __ __ __', pattern: [0.2, -0.1] }
] as const

/** Which line type each layer draws with. */
const LAYER_LINE_TYPE: Readonly<Record<DxfLayer, (typeof LINE_TYPES)[number]['name']>> = {
  'GRID-WALLS-EXTERIOR': 'CONTINUOUS',
  'GRID-WALLS-INTERIOR': 'CONTINUOUS',
  'GRID-WALLS-VIRTUAL': 'DASHED',
  'GRID-ROOMS': 'CONTINUOUS',
  'GRID-OPENINGS': 'CONTINUOUS',
  'GRID-LABELS': 'CONTINUOUS',
  'GRID-DOOR-SWINGS': 'CONTINUOUS',
  'GRID-FIXTURES': 'CONTINUOUS',
  'GRID-LEFT-OUT': 'CONTINUOUS'
}

function writeLineTypeTable(w: DxfWriter): void {
  w.pair(0, 'TABLE')
  w.pair(2, 'LTYPE')
  w.pair(70, LINE_TYPES.length)

  for (const type of LINE_TYPES) {
    w.pair(0, 'LTYPE')
    w.pair(2, type.name)
    w.pair(70, 0)
    w.pair(3, type.description)
    // 65 is the alignment code, "A", the only one R12 has.
    w.pair(72, 65)
    w.pair(73, type.pattern.length)
    w.pair(40, num(type.pattern.reduce((sum, length) => sum + Math.abs(length), 0)))
    // A positive length is a dash, a negative one a gap.
    for (const length of type.pattern) w.pair(49, num(length))
  }

  w.pair(0, 'ENDTAB')
}

function writeTables(w: DxfWriter, drawing: PlanDrawing, leftOut: readonly LeftOutPart[]): void {
  const names = Object.values(DXF_LAYERS).filter(
    (name) => (name !== DXF_LAYERS.fixtures || drawing.items.length > 0) && (name !== DXF_LAYERS.leftOut || leftOut.length > 0)
  )

  w.pair(0, 'SECTION')
  w.pair(2, 'TABLES')
  // Line types before layers: a layer names its line type, and readers resolve it in order.
  writeLineTypeTable(w)
  w.pair(0, 'TABLE')
  w.pair(2, 'LAYER')
  w.pair(70, names.length)

  for (const name of names) {
    w.pair(0, 'LAYER')
    w.pair(2, name)
    w.pair(70, 0)
    // Colour 7 is "whatever the drawing's foreground is". The geometry core
    // does not pick colours or line weights (see the rendering seam); the code
    // is written only because the format requires one.
    w.pair(62, 7)
    w.pair(6, LAYER_LINE_TYPE[name])
  }

  w.pair(0, 'ENDTAB')
  w.pair(0, 'ENDSEC')
}

/**
 * Whether every number can be written as one. Validation refuses sizes that large before they
 * get here; this is the last guard, so that the file never holds "Infinity" or "NaN".
 */
const writable = (...values: readonly number[]): boolean => values.every(Number.isFinite)
const writablePoints = (points: readonly Vec2[]): boolean => points.every((p) => writable(p.x, p.y))

function writePolygon(w: DxfWriter, layer: string, points: readonly Vec2[]): void {
  if (points.length < 2 || !writablePoints(points)) return

  w.pair(0, 'POLYLINE')
  w.pair(8, layer)
  // 66 = vertices follow. 70 bit 1 = the outline is closed, which is what makes
  // it hatchable and fillable downstream rather than a run of loose segments.
  w.pair(66, 1)
  w.pair(70, 1)
  w.point(0, 0)

  for (const point of points) {
    w.pair(0, 'VERTEX')
    w.pair(8, layer)
    w.point(point.x, point.y)
  }

  w.pair(0, 'SEQEND')
  w.pair(8, layer)
}

function writeLine(w: DxfWriter, layer: string, from: Vec2, to: Vec2): void {
  if (!writablePoints([from, to])) return
  w.pair(0, 'LINE')
  w.pair(8, layer)
  w.point(from.x, from.y)
  w.point(to.x, to.y, [11, 21, 31])
}

/** Degrees in [0, 360), as R12 writes them. */
function degrees(radians: number): number {
  const d = (radians * 180) / Math.PI
  const wrapped = ((d % 360) + 360) % 360
  // Rounding noise must not turn 0° into 359.999999.
  return Math.abs(wrapped - 360) < TOLERANCES.relativeNoise.value ? 0 : wrapped
}

/**
 * R12's ARC always runs counter-clockwise from its start angle to its end angle, so a
 * clockwise swing is written from where it ends to where it starts. Same arc, same floor.
 */
function writeArc(w: DxfWriter, layer: string, arc: SwingArc): void {
  const [start, end] = arc.counterClockwise ? [arc.from, arc.to] : [arc.to, arc.from]
  if (!writable(arc.center.x, arc.center.y, arc.radius, start, end)) return
  w.pair(0, 'ARC')
  w.pair(8, layer)
  w.point(arc.center.x, arc.center.y)
  w.pair(40, num(arc.radius))
  w.pair(50, num(degrees(start)))
  w.pair(51, num(degrees(end)))
}

function writeText(w: DxfWriter, layer: string, at: Vec2, text: string): void {
  const value = sanitizeText(text)
  if (value.length === 0 || !writablePoints([at])) return

  w.pair(0, 'TEXT')
  w.pair(8, layer)
  w.point(at.x, at.y)
  w.pair(40, num(TEXT_HEIGHT))
  w.pair(1, value)
  // Centred on the point, as the 2D plan draws it (text-anchor: middle). Without
  // a horizontal alignment the text starts at the point and runs to the right,
  // across the wall in a narrow room. With one, a reader ignores 10/20 and
  // places the text at 11/21/31, so the point is repeated there.
  w.pair(72, 1)
  w.point(at.x, at.y, [11, 21, 31])
}

/**
 * The lines of the note, each within R12's cap: a kind's names run on over as many lines as they
 * need, and a line never ends inside a name. A name longer than a line is cut by `sanitizeText`.
 */
function noteLines(leftOut: readonly LeftOutPart[]): string[] {
  const lines = [leftOutSummary(leftOut)]
  for (const { kind, parts } of leftOutByKind(leftOut)) {
    let line = kindLabel(kind, parts.length)
    let first = true
    for (const name of partNames(parts)) {
      const next = first ? name : `, ${name}`
      if (!first && sanitizeText(`${line}${next},`).length >= MAX_TEXT) {
        lines.push(`${line},`)
        line = `  ${name}`
      } else {
        line += next
      }
      first = false
    }
    lines.push(line)
  }
  return lines
}

/**
 * HND-6: the note, on its own layer, one TEXT per line, starting a line below the drawing's lower
 * left corner and running to the right. R12 TEXT holds one line; the summary may be cut at
 * `MAX_TEXT`, which keeps its count and the kinds.
 */
function writeLeftOut(w: DxfWriter, drawing: PlanDrawing, leftOut: readonly LeftOutPart[]): void {
  if (leftOut.length === 0) return
  const { min } = drawing.bounds
  const at = writablePoints([min]) ? min : { x: 0, y: 0 }
  for (const [n, line] of noteLines(leftOut).entries()) {
    const value = sanitizeText(line)
    if (value.length === 0) continue
    w.pair(0, 'TEXT')
    w.pair(8, DXF_LAYERS.leftOut)
    w.point(at.x, at.y - TEXT_HEIGHT * 2 * (n + 1))
    w.pair(40, num(TEXT_HEIGHT))
    w.pair(1, value)
  }
}

function writeEntities(w: DxfWriter, drawing: PlanDrawing, leftOut: readonly LeftOutPart[]): void {
  w.pair(0, 'SECTION')
  w.pair(2, 'ENTITIES')

  // Rooms first so their outlines sit under the walls, matching the 2D view. A room's holes
  // (ARE-6) follow its outline on the same layer, each a closed outline of its own: R12 has no
  // hatch entity, and a hatch a reader builds from these boundaries leaves each hole open as an
  // island inside the outline.
  for (const room of drawing.rooms) {
    writePolygon(w, DXF_LAYERS.rooms, room.polygon)
    for (const hole of room.holes) writePolygon(w, DXF_LAYERS.rooms, hole)
    writeText(w, DXF_LAYERS.labels, room.labelAt, room.name)
    if (writable(room.area)) {
      writeText(
        w,
        DXF_LAYERS.labels,
        { x: room.labelAt.x, y: room.labelAt.y - TEXT_HEIGHT * 1.4 },
        `${areaText(room.area)} m2`
      )
    }
  }

  for (const wall of drawing.walls) {
    if (wall.virtual) {
      // No substance to outline: an open-plan divider is a single line (C3).
      writeLine(w, DXF_LAYERS.wallVirtual, wall.centerline[0], wall.centerline[1])
      continue
    }

    // `detached` borders no room, so it has no outside to be on. It goes with
    // the interior walls rather than inventing a layer for a degenerate case.
    const layer =
      wall.exposure === 'exterior' ? DXF_LAYERS.wallExterior : DXF_LAYERS.wallInterior

    for (const slice of wall.slices) writePolygon(w, layer, slice)
  }

  // The gap is already cut out of the wall above; this line marks where it is,
  // so a door or window reads as an opening rather than as a missing wall.
  for (const opening of drawing.openings) {
    writeLine(w, DXF_LAYERS.openings, opening.from, opening.to)
  }

  // The 2D plan's door symbol: the leaf open at 90° and the arc back to the far jamb. Only a
  // door that states both values has one; `doorSwing` returns null for any other.
  for (const opening of drawing.openings) {
    if (opening.type !== 'door') continue
    const swing = doorSwing(opening, opening.hinge, opening.swing)
    if (swing === null) continue
    writeLine(w, DXF_LAYERS.doorSwings, swing.leaf[0], swing.leaf[1])
    writeArc(w, DXF_LAYERS.doorSwings, swing.arc)
  }

  // CNT-12: each fixture's symbol as the 2D plan draws it, its rings closed and its lines open.
  for (const item of drawing.items) {
    for (const ring of item.rings) if (writablePoints(ring)) writePolygon(w, DXF_LAYERS.fixtures, ring)
    for (const line of item.lines) {
      for (let i = 1; i < line.length; i++) {
        const from = line[i - 1]!
        const to = line[i]!
        if (writable(from.x, from.y, to.x, to.y)) writeLine(w, DXF_LAYERS.fixtures, from, to)
      }
    }
  }

  writeLeftOut(w, drawing, leftOut)

  w.pair(0, 'ENDSEC')
}

export interface DxfOptions {
  /** HND-6: the parts of the plan this file leaves out, named on the `GRID-LEFT-OUT` layer. */
  readonly leftOut?: readonly LeftOutPart[]
}

/**
 * The drawing as a DXF document.
 *
 * Pure and total: it never throws and never reads the filesystem. Whatever the
 * drawing could not resolve is already absent from it, so a broken plan exports
 * the part that is sound — the same graceful degradation the canvases apply.
 */
export function toDxf(drawing: PlanDrawing, options: DxfOptions = {}): string {
  const w = new DxfWriter()
  const leftOut = options.leftOut ?? []

  writeHeader(w, drawing)
  writeTables(w, drawing, leftOut)
  writeEntities(w, drawing, leftOut)

  w.pair(0, 'EOF')
  return w.toString()
}
