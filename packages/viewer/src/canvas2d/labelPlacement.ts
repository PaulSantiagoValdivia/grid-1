/**
 * Where room labels go, and keeps dimension numbers off them.
 *
 * Each room's name and area sit at a spot inside the room where the whole label fits, clear
 * of door swings, walls, other labels and, when there is room, dimension lines. The spots come
 * from the geometry core (`spotsInside`): the room's pole of inaccessibility first, then the
 * rest of the room, deepest first. A label that fits nowhere in its room moves out, to the
 * nearest clear spot, and a leader line ties it to the room's pole (`placeRoomLabels`).
 *
 * Dimension lines live in metres, but every label is drawn at a fixed size in screen pixels,
 * so whether a number lands on a room's name or area depends on the zoom. This works it out
 * for the current zoom, in plan metres (y up): text boxes are estimated from the font sizes
 * in plan.css (`estimateTextWidth`), the number slides along its own dimension line to the clear spot
 * nearest the middle, and with no clear spot it is hidden (the line stays).
 *
 * Pure: no DOM measuring, so it runs in tests and on every render without layout reads.
 */
import type { Dimension, PlanOpening, Rect, Vec2 } from '@ongrid/floorplan/geometry'
import { areaText, doorSwing, metresText, poleOfInaccessibility, rectOf, rectTouchesPolygon, spotsInside, tolerance } from '@ongrid/floorplan/geometry'
import { TEXT_PX } from '../picture/look'
import type { DoorHanding } from './doorHanding'

export interface Box {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

// Font sizes and offsets, in screen pixels.
const ROOM_NAME_PX = TEXT_PX.roomName
const ROOM_AREA_PX = TEXT_PX.roomArea
export const ROOM_AREA_DY = 16
const DIMENSION_PX = { room: TEXT_PX.roomDimension, other: TEXT_PX.dimension }
export const DIMENSION_DY = -5
// A generous average glyph width and the usual ascent/descent split, plus breathing room.
const CHAR_WIDTH = 0.62
const ASCENT = 0.75
const DESCENT = 0.25
const PADDING_PX = 2
const SEARCH_STEPS = 48

/**
 * How wide a line of text is, in pixels, without measuring it: every character counts as
 * 0.62 of the font size. That is a little wider than the average letter of a sans-serif face,
 * so a box built on it errs on the side of keeping text apart. The same in a browser, a test
 * and a picture, whatever fonts the machine has.
 */
export function estimateTextWidth(text: string, fontPx: number): number {
  return text.length * fontPx * CHAR_WIDTH
}

/** How a room's tag reads. Everything is off by default: the name as written, two decimals. */
export interface LabelStyle {
  /** The name in capitals. */
  readonly upperCase?: boolean
  /** A number before each name, 1, 2, 3… in the floor's room order. */
  readonly numbered?: boolean
  /** How many decimals the area keeps: 0, 1 or 2 (the default). */
  readonly areaDecimals?: 0 | 1 | 2
  /**
   * The check view (VEW-2): each room's id after its name, in brackets, and each door's and
   * window's id beside it, as the plan file holds them, so a picture and the text that comes
   * with it name the parts the same way. All of it upright.
   */
  readonly ids?: boolean
}

/** A room's area as its tag prints it, rounded the core's one way (ARE-7). */
export function formatArea(area: number, decimals: 0 | 1 | 2 = 2): string {
  return `${areaText(area, decimals)} m²`
}

/** A dimension's number as it is drawn: metres to the millimetre, then to the centimetre (ARE-7). */
export function dimensionText(value: number): string {
  return metresText(value)
}

/** The first line of a room's tag, as `style` asks. `index` is the room's place on its floor. */
export function labelName(name: string, index: number, style: LabelStyle = {}): string {
  const shown = style.upperCase ? name.toUpperCase() : name
  return style.numbered ? `${index + 1} ${shown}` : shown
}

/** Name and area as drawn at `labelAt`: name on the baseline, area 16 px below. */
export function roomLabelBox(
  room: { name: string; area: number; labelAt: Vec2; /** The area line as drawn, when it isn't the plain area. */ areaText?: string },
  metersPerPixel: number
): Box {
  const area = room.areaText ?? formatArea(room.area)
  const width = Math.max(estimateTextWidth(room.name, ROOM_NAME_PX), estimateTextWidth(area, ROOM_AREA_PX))
  const top = ASCENT * ROOM_NAME_PX + PADDING_PX
  const bottom = ROOM_AREA_DY + DESCENT * ROOM_AREA_PX + PADDING_PX
  const half = width / 2 + PADDING_PX
  return {
    minX: room.labelAt.x - half * metersPerPixel,
    maxX: room.labelAt.x + half * metersPerPixel,
    minY: room.labelAt.y - bottom * metersPerPixel,
    maxY: room.labelAt.y + top * metersPerPixel,
  }
}

/** A dimension's number anchored at `at`, drawn 5 px above it and centred. */
export function dimensionTextBox(at: Vec2, dim: Pick<Dimension, 'kind' | 'value'>, metersPerPixel: number): Box {
  const px = dim.kind === 'room' ? DIMENSION_PX.room : DIMENSION_PX.other
  const half = estimateTextWidth(dimensionText(dim.value), px) / 2 + PADDING_PX
  // Screen y grows down and plan y up: 5 px above the line is +5 px in the plan.
  const baseline = -DIMENSION_DY
  return {
    minX: at.x - half * metersPerPixel,
    maxX: at.x + half * metersPerPixel,
    minY: at.y + (baseline - DESCENT * px - PADDING_PX) * metersPerPixel,
    maxY: at.y + (baseline + ASCENT * px + PADDING_PX) * metersPerPixel,
  }
}

export function overlaps(a: Box, b: Box): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY
}

/**
 * Where to draw the number: `dim.labelAt` when it is clear, else the clear point on the
 * dimension line nearest its middle, else `null` (hide the number). A point is usable only
 * when the whole number stays within the line's two ends.
 */
export function placeDimensionLabel(dim: Dimension, blocks: readonly Box[], metersPerPixel: number): Vec2 | null {
  const clear = (at: Vec2): boolean => {
    const box = dimensionTextBox(at, dim, metersPerPixel)
    return !blocks.some((block) => overlaps(box, block))
  }
  if (clear(dim.labelAt)) return dim.labelAt

  const a = { x: dim.from.x + dim.normal.x * dim.offset, y: dim.from.y + dim.normal.y * dim.offset }
  const b = { x: dim.to.x + dim.normal.x * dim.offset, y: dim.to.y + dim.normal.y * dim.offset }
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  if (length === 0) return null
  const dir = { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
  const box = dimensionTextBox({ x: 0, y: 0 }, dim, metersPerPixel)
  // Half the number's extent along the line: it must not run past either end.
  const reach = Math.abs(dir.x) * (box.maxX - box.minX) / 2 + Math.abs(dir.y) * (box.maxY - box.minY) / 2
  const lo = reach / length
  const hi = 1 - lo
  if (lo > hi) return null

  for (let step = 1; step <= SEARCH_STEPS; step++) {
    const delta = (step / SEARCH_STEPS) * 0.5
    for (const t of [0.5 - delta, 0.5 + delta]) {
      if (t < lo || t > hi) continue
      const at = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      if (clear(at)) return at
    }
  }
  return null
}

/** The box a door's leaf sweeps, hinge to open leaf. `null` for a door with no swing drawn. */
export function doorSwingBox(opening: PlanOpening, handing: DoorHanding | undefined, metersPerPixel: number): Box | null {
  if (opening.type !== 'door') return null
  const swing = doorSwing(opening, handing?.hinge, handing?.swing)
  if (!swing) return null
  const { center, radius, from } = swing.arc
  const closed = { x: Math.cos(from), y: Math.sin(from) }
  const open = { x: Math.cos(swing.arc.to), y: Math.sin(swing.arc.to) }
  const points: Vec2[] = [center, swing.leaf[1], { x: center.x + closed.x * radius, y: center.y + closed.y * radius }]
  // The swing is a quarter of a circle: it reaches farthest along an axis that lies inside it.
  const noTurn = tolerance('noArea')
  for (const axis of [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }]) {
    if (axis.x * closed.x + axis.y * closed.y >= -noTurn && axis.x * open.x + axis.y * open.y >= -noTurn) {
      points.push({ x: center.x + axis.x * radius, y: center.y + axis.y * radius })
    }
  }
  return grow(rectOf(points), PADDING_PX * metersPerPixel)
}

/** A line as a thin box: the dimension lines a label keeps off. */
export function lineBox(a: Vec2, b: Vec2, metersPerPixel: number): Box {
  return grow(rectOf([a, b]), PADDING_PX * metersPerPixel)
}

const grow = (box: Rect, by: number): Box => ({
  minX: box.minX - by,
  minY: box.minY - by,
  maxX: box.maxX + by,
  maxY: box.maxY + by
})

/** A room to label: its outline and the two lines of its tag, as drawn. */
export interface LabelRoom {
  readonly id: string
  readonly polygon: readonly Vec2[]
  /** The room's holes (ARE-6): a label never sits in one. */
  readonly holes?: readonly (readonly Vec2[])[]
  readonly name: string
  readonly areaText: string
}

/** What a label keeps off, in plan metres. */
export interface LabelObstacles {
  /** Door swings. A label never covers one. */
  readonly swings: readonly Box[]
  /** The solid walls, one outline per piece. */
  readonly walls: readonly (readonly Vec2[])[]
  /** Dimension lines and the numbers that stay put. Kept clear when there is room. */
  readonly dimensions: readonly Box[]
}

export interface PlacedLabel {
  readonly id: string
  /** The point of the room the label names: inside the room, where the text or its leader starts. */
  readonly anchor: Vec2
  /** Where the text goes: the centre of the name's baseline. */
  readonly at: Vec2
  /** The text's box, for keeping dimension numbers off it. */
  readonly box: Box
  /** From the anchor to the moved label's edge, when the label did not fit in its room. */
  readonly leader: readonly [Vec2, Vec2] | null
}

/** How much air a label keeps round it, from other labels and door swings, in pixels. */
const CLEARANCE_PX = 1
/** How far a moved label keeps from its room, in pixels. */
const LEADER_GAP_PX = 10
/** How many rings of spots round a room a moved label tries, at most. */
const MAX_RINGS = 48
/** How many spots each ring has, at most. */
const RING_SPOTS = 64

/**
 * Where every room's label goes, in the order of `rooms`: `null` for a room whose label has
 * nowhere clear to go at this zoom, which is then not drawn, like a dimension number with no
 * clear spot. Zooming in gives it room.
 *
 * Labels that fit in their room are placed first, each clear of the ones before it. The rest
 * then move out, nearest spot first and never past `within`, preferring in turn: clear of every room and dimension,
 * clear of every room, clear of the walls, and clear of door swings and labels only. No label
 * is ever put on a door swing or on another label.
 */
export function placeRoomLabels(
  rooms: readonly LabelRoom[],
  obstacles: LabelObstacles,
  metersPerPixel: number,
  /** Where a moved label must stay: the part of the plan a framed view always shows. */
  within?: Box
): (PlacedLabel | null)[] {
  const mpp = metersPerPixel
  const sizes = rooms.map((room) => labelSize(room.name, room.areaText, mpp))
  const extent = rectOf(rooms.flatMap((room) => room.polygon))
  const cell = Math.max(
    (extent.maxX - extent.minX) / 128,
    (extent.maxY - extent.minY) / 128,
    ...sizes.map((size) => 2 * size.halfHeight),
    tolerance('joint')
  )

  const taken = new BoxIndex<Box>(cell)
  const swings = new BoxIndex<Box>(cell)
  obstacles.swings.forEach((box) => swings.add(box, box))
  const dimensions = new BoxIndex<Box>(cell)
  obstacles.dimensions.forEach((box) => dimensions.add(box, box))
  const walls = new BoxIndex<readonly Vec2[]>(cell)
  obstacles.walls.forEach((outline) => walls.add(rectOf(outline), outline))
  const outlines = new BoxIndex<readonly Vec2[]>(cell)
  rooms.forEach((room) => outlines.add(rectOf(room.polygon), room.polygon))

  const boxHit = (box: Box) => (other: Box) => overlaps(box, other)
  const shapeHit = (box: Box) => (outline: readonly Vec2[]) => rectTouchesPolygon(box, outline)
  // A pixel of air round each label, so two never touch and rounding cannot make them meet.
  const air = CLEARANCE_PX * mpp
  const free = (box: Box): boolean => {
    const wide = grow(box, air)
    return !taken.some(wide, boxHit(wide)) && !swings.some(wide, boxHit(wide))
  }
  const offWalls = (box: Box): boolean => !walls.some(box, shapeHit(box))
  const offRooms = (box: Box): boolean => !outlines.some(box, shapeHit(box))
  const offDimensions = (box: Box): boolean => !dimensions.some(box, boxHit(box))

  const placed: (PlacedLabel | null)[] = rooms.map(() => null)
  const late: number[] = []

  rooms.forEach((room, i) => {
    const size = sizes[i]!
    const spots = spotsInside(room.polygon, size.halfWidth, size.halfHeight, room.holes)
    for (const ok of [(box: Box) => free(box) && offWalls(box) && offDimensions(box), (box: Box) => free(box) && offWalls(box)]) {
      const centre = spots.find((spot) => ok(size.boxAt(spot)))
      if (!centre) continue
      const box = size.boxAt(centre)
      placed[i] = { id: room.id, anchor: size.atOf(centre), at: size.atOf(centre), box, leader: null }
      taken.add(box, box)
      return
    }
    late.push(i)
  })

  for (const i of late) {
    const room = rooms[i]!
    const size = sizes[i]!
    const anchor = poleOfInaccessibility(room.polygon, undefined, room.holes).point
    const spots = spotsAround(rectOf(room.polygon), extent, anchor, size, LEADER_GAP_PX * mpp, 2 * air).filter(
      (spot) => !within || contains(within, size.boxAt(spot))
    )
    let centre: Vec2 | undefined
    for (const ok of [
      (box: Box) => free(box) && offRooms(box) && offWalls(box) && offDimensions(box),
      (box: Box) => free(box) && offRooms(box) && offWalls(box),
      (box: Box) => free(box) && offWalls(box),
      free
    ]) {
      centre = spots.find((spot) => ok(size.boxAt(spot)))
      if (centre) break
    }
    if (!centre) continue
    const box = size.boxAt(centre)
    placed[i] = { id: room.id, anchor, at: size.atOf(centre), box, leader: [anchor, nearestOnBox(anchor, box)] }
    taken.add(box, box)
  }

  return placed
}

/**
 * Boxes filed by the square cells of a grid they cover, so asking what is near a box looks at
 * a few cells instead of everything. A box that would cover too many cells goes in a list
 * that every question checks.
 */
class BoxIndex<T> {
  private readonly cells = new Map<string, { box: Rect; item: T }[]>()
  private readonly big: { box: Rect; item: T }[] = []
  constructor(private readonly size: number) {}

  private range(box: Rect): [number, number, number, number] {
    const s = this.size
    return [Math.floor(box.minX / s), Math.floor(box.minY / s), Math.floor(box.maxX / s), Math.floor(box.maxY / s)]
  }

  add(box: Rect, item: T): void {
    const [x0, y0, x1, y1] = this.range(box)
    const entry = { box, item }
    if (!Number.isFinite(x0 + y0 + x1 + y1) || (x1 - x0 + 1) * (y1 - y0 + 1) > 1024) {
      this.big.push(entry)
      return
    }
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const key = `${x},${y}`
        const list = this.cells.get(key)
        if (list) list.push(entry)
        else this.cells.set(key, [entry])
      }
    }
  }

  /** Whether any item whose box overlaps `box` passes `test`. */
  some(box: Rect, test: (item: T) => boolean): boolean {
    const near = (entry: { box: Rect; item: T }): boolean => overlaps(box, entry.box) && test(entry.item)
    if (this.big.some(near)) return true
    const [x0, y0, x1, y1] = this.range(box)
    if (!Number.isFinite(x0 + y0 + x1 + y1) || (x1 - x0 + 1) * (y1 - y0 + 1) > 4096) {
      for (const list of this.cells.values()) if (list.some(near)) return true
      return false
    }
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const list = this.cells.get(`${x},${y}`)
        if (list?.some(near)) return true
      }
    }
    return false
  }
}

/** A label's size in metres, and the way between its box's centre and where its text goes. */
function labelSize(name: string, areaText: string, mpp: number) {
  const box = roomLabelBox({ name, area: 0, areaText, labelAt: { x: 0, y: 0 } }, mpp)
  const halfWidth = (box.maxX - box.minX) / 2
  const halfHeight = (box.maxY - box.minY) / 2
  // The text's baseline sits this far below the box's centre.
  const lift = (box.maxY + box.minY) / 2
  return {
    halfWidth,
    halfHeight,
    atOf: (centre: Vec2): Vec2 => ({ x: centre.x, y: centre.y - lift }),
    boxAt: (centre: Vec2): Box => ({
      minX: centre.x - halfWidth,
      maxX: centre.x + halfWidth,
      minY: centre.y - halfHeight,
      maxY: centre.y + halfHeight
    })
  }
}

/**
 * Spots for a label's centre on rings round the room's box, the nearest to `anchor` first.
 * The first rings are one label height apart and later ones farther, until they clear the
 * whole drawing (`extent`) or `MAX_RINGS` is reached.
 */
function spotsAround(
  room: Rect,
  extent: Rect,
  anchor: Vec2,
  size: { halfWidth: number; halfHeight: number },
  gap: number,
  air: number
): Vec2[] {
  const step = Math.max(2 * size.halfHeight + air, gap)
  if (!(step > 0) || !Number.isFinite(step)) return []
  // How far out a ring must go to leave the drawing on every side.
  const clear = Math.max(room.minX - extent.minX, extent.maxX - room.maxX, room.minY - extent.minY, extent.maxY - room.maxY, 0)
  const spots: { at: Vec2; far: number }[] = []
  let out = gap
  for (let k = 0; k < MAX_RINGS; k++) {
    const minX = room.minX - size.halfWidth - out
    const maxX = room.maxX + size.halfWidth + out
    const minY = room.minY - size.halfHeight - out
    const maxY = room.maxY + size.halfHeight + out
    const w = maxX - minX
    const h = maxY - minY
    const perimeter = 2 * (w + h)
    const count = Math.max(8, Math.min(RING_SPOTS, Math.ceil(perimeter / step)))
    for (let n = 0; n < count; n++) {
      // Walk the ring from its bottom-left corner, anticlockwise.
      let d = (perimeter * n) / count
      let at: Vec2
      if (d < w) at = { x: minX + d, y: minY }
      else if ((d -= w) < h) at = { x: maxX, y: minY + d }
      else if ((d -= h) < w) at = { x: maxX - d, y: maxY }
      else at = { x: minX, y: maxY - (d - w) }
      spots.push({ at, far: Math.hypot(at.x - anchor.x, at.y - anchor.y) })
    }
    if (out > clear + step) break
    out += step * (1 + Math.floor(k / 8))
  }
  spots.sort((a, b) => a.far - b.far)
  return spots.map((spot) => spot.at)
}

const contains = (outer: Box, inner: Box): boolean =>
  inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY

function nearestOnBox(p: Vec2, box: Box): Vec2 {
  return { x: Math.min(Math.max(p.x, box.minX), box.maxX), y: Math.min(Math.max(p.y, box.minY), box.maxY) }
}
