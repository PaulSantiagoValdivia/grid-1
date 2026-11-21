/**
 * The 2D plan as SVG elements: the one place its markup is written.
 *
 * The app's 2D view (`Canvas2D`) renders this tree through React, and `planToSvg` writes the
 * same tree out as text, so for the same plan, size and look the two give the same markup,
 * byte for byte. The geometry comes from `@ongrid/floorplan/geometry`; nothing here computes
 * any of its own.
 *
 * Each element carries its structure (`data-part`, `data-id`, …) and its final paint as SVG
 * presentation attributes (`fill`, `stroke`, `stroke-width`, `font-family`, …), so the markup
 * draws correctly on its own. In the app the stylesheets still win: CSS overrides
 * presentation attributes, which is how the dark theme, selection and the review tints keep
 * working. Every attribute written here is one `plan.css` also sets for that element. The
 * review's ghosts of an earlier version carry none: only the app draws them.
 *
 * Line widths are written in metres for the zoom being drawn (pixels times metres per pixel),
 * not with `vector-effect: non-scaling-stroke`, which only browsers honour.
 *
 * Pure: no DOM, no React.
 */
import type { Dimension, Ghosts, PlanDrawing, PlanOpening, PlanRoom, PlanWall, Vec2 } from '@ongrid/floorplan/geometry'
import { areaText as areaFigure, boundsWithDimensions, poleOfInaccessibility, traceWall } from '@ongrid/floorplan/geometry'
import type { DoorHanding } from '../canvas2d/doorHanding'
import { doorSymbolOf } from '../canvas2d/doorSymbol'
import { openingAt, stripAcross } from '../canvas2d/strip'
import type { Box, LabelStyle } from '../canvas2d/labelPlacement'
import {
  DIMENSION_DY,
  ROOM_AREA_DY,
  dimensionText,
  dimensionTextBox,
  doorSwingBox,
  formatArea,
  labelName,
  lineBox,
  placeDimensionLabel,
  placeRoomLabels
} from '../canvas2d/labelPlacement'
import { FRAME_MARGIN, pathOf } from '../canvas2d/viewport'
import type { PlanLook } from './look'
import { LINE_PX, TEXT_PX, lengthText } from './look'
import type { Attrs, SvgNode } from './svgNode'
import { el } from './svgNode'

/** The door-sweep warning mark's size on screen, whatever the zoom. */
export const WARNING_RADIUS_PX = 5

/** The pulse's size on screen, whatever the zoom. */
export const PULSE_RADIUS_PX = 6

/** The presentation attributes this module writes. Nothing else in the markup uses them. */
export const PAINT_ATTRIBUTES = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'paint-order',
  'font-family',
  'font-size',
  'text-anchor'
] as const

/**
 * What the app shows on top of a plain drawing: a live build, a review against an earlier
 * version, selection and hover. A picture uses none of it (`STILL`).
 */
export interface SceneLive {
  /** Parts being removed by a live build, drawn from the plan before and fading out. */
  readonly leaving: { readonly drawing: PlanDrawing; readonly ids: ReadonlySet<string>; readonly progress: number } | null
  /** The earlier version's removed and changed parts. */
  readonly ghosts: Ghosts | null
  /** Ghost rooms that were removed: they get a label saying so. */
  readonly removedRooms: readonly PlanRoom[]
  readonly selectedId: string | null
  /** What a current element says about itself in a review (`data-diff`, `data-focus`). */
  readonly marks: (id: string) => Attrs
  /** What a ghost says about itself. */
  readonly ghostAttrs: (id: string) => Attrs
  /** `data-hit` while the user hovers the warning of a door that runs into this. */
  readonly hit: (id: string) => Attrs
  /** A room's fill, 0 to 1, while it fades in. */
  readonly roomFill: (id: string) => number | null
  /** How much of a wall has been traced, 0 to 1. */
  readonly wallTrace: (id: string) => number | null
  /** How far a sliding wall still has to go, in plan metres. */
  readonly wallOffset: (id: string) => Vec2 | null
  /** How far an opening has opened, 0 to 1. */
  readonly openingOpen: (id: string) => number | null
  /** How far a dimension has faded in, 0 to 1. At 0 it is not drawn. */
  readonly dimensionShown: (dim: Dimension) => number
  readonly labelOpacity: (id: string) => number | undefined
  /** A room's area before and after, shown in place of its area. */
  readonly areaChange: (id: string) => { readonly before: number; readonly after: number } | undefined
  /** The door whose warning is hovered: its message shows. */
  readonly hoveredWarning: string | null
  /** Where the "still working" pulse sits, in plan coordinates. */
  readonly pulse: Vec2 | null
}

const none = (): Attrs => ({})
const nothing = (): null => null

/** A plain drawing: nothing in flight, nothing reviewed, nothing selected. */
export const STILL: SceneLive = {
  leaving: null,
  ghosts: null,
  removedRooms: [],
  selectedId: null,
  marks: none,
  ghostAttrs: none,
  hit: none,
  roomFill: nothing,
  wallTrace: nothing,
  wallOffset: nothing,
  openingOpen: nothing,
  dimensionShown: () => 1,
  labelOpacity: () => undefined,
  areaChange: () => undefined,
  hoveredWarning: null,
  pulse: null
}

export interface SceneInput {
  /** One floor's drawing (`buildFloorPlan` of `planForFloor`). */
  readonly drawing: PlanDrawing
  /** Which way each door opens, by opening id. A door without one draws as a plain gap. */
  readonly handings: ReadonlyMap<string, DoorHanding>
  /** What each door whose swing runs into something says, by opening id. */
  readonly doorWarnings: ReadonlyMap<string, string>
  readonly dimensions: readonly Dimension[]
  /** How many metres one pixel of the picture measures: the zoom. */
  readonly metersPerPixel: number
  readonly look: PlanLook
  /** How the room tags read: capitals, numbers, how the area is rounded. */
  readonly labels?: LabelStyle
  readonly live?: Partial<SceneLive>
}

/** The paint for each part, for one zoom. */
function paints(look: PlanLook, mpp: number) {
  const px = (value: number): string => lengthText(value * mpp)
  const dashes = (values: readonly number[]): string => values.map(px).join(' ')
  const text = (fill: string, size: number): Attrs => ({
    fill,
    'font-family': look.font,
    'font-size': size,
    'text-anchor': 'middle'
  })
  return {
    room: { fill: look.room } as Attrs,
    wall: (exposure: PlanWall['exposure'] | undefined): Attrs => ({
      fill: exposure === 'exterior' ? look.wallExterior : look.wall
    }),
    virtual: {
      fill: 'none',
      stroke: look.virtual,
      'stroke-width': px(LINE_PX.virtual),
      'stroke-dasharray': dashes(LINE_PX.virtualDash)
    } as Attrs,
    opening: (type: PlanOpening['type'], swing: boolean): Attrs => ({
      fill: type === 'window' ? look.window : look.paper,
      ...(type === 'opening' || swing
        ? { stroke: 'none' }
        : { stroke: look.wall, 'stroke-width': px(LINE_PX.opening) })
    }),
    jamb: { stroke: look.wall, 'stroke-width': px(LINE_PX.jamb) } as Attrs,
    step: { stroke: look.wall, 'stroke-width': px(LINE_PX.step), 'stroke-linecap': 'butt' } as Attrs,
    doorLeaf: { stroke: look.wall, 'stroke-width': px(LINE_PX.doorLeaf), 'stroke-linecap': 'square' } as Attrs,
    doorArc: { fill: 'none', stroke: look.wall, 'stroke-width': px(LINE_PX.doorArc) } as Attrs,
    extension: { stroke: look.dimension, 'stroke-width': px(LINE_PX.extension) } as Attrs,
    dimensionLine: (room: boolean): Attrs =>
      room
        ? {
            stroke: look.dimensionSoft,
            'stroke-width': px(LINE_PX.dimension),
            'stroke-dasharray': dashes(LINE_PX.roomDimensionDash)
          }
        : { stroke: look.dimension, 'stroke-width': px(LINE_PX.dimension) },
    dimensionText: (room: boolean): Attrs =>
      room
        ? text(look.dimensionSoftText, TEXT_PX.roomDimension)
        : text(look.dimensionText, TEXT_PX.dimension),
    label: text(look.label, TEXT_PX.roomName),
    leader: { stroke: look.labelSoft, 'stroke-width': px(LINE_PX.leader) } as Attrs,
    area: text(look.labelSoft, TEXT_PX.roomArea),
    // In a group scaled to pixels, so these widths are pixels.
    warningDot: { fill: look.warning, stroke: look.paper, 'stroke-width': LINE_PX.warningRing } as Attrs,
    warningText: {
      fill: look.warning,
      'font-family': look.font,
      'font-size': TEXT_PX.warning,
      'paint-order': 'stroke',
      stroke: look.paper,
      'stroke-width': LINE_PX.warningHalo,
      'stroke-linejoin': 'round'
    } as Attrs,
    pulse: { fill: look.wallExterior } as Attrs
  }
}

type Paints = ReturnType<typeof paints>

const virtualPath = (points: readonly Vec2[]): string => `M${points.map((p) => `${p.x},${-p.y}`).join('L')}`

/** A label group: placed in metres, then scaled so its contents are in pixels. */
/** How far an opening's id sits off its wall's face, in screen pixels. */
const OPENING_ID_PX = 12

const labelTransform = (at: Vec2, mpp: number): string => `translate(${at.x} ${-at.y}) scale(${mpp})`

/**
 * A ghost of the earlier version's room, wall or opening. Ghosts carry no paint: they belong
 * to the review, which only the app shows, and its stylesheets alone decide their look.
 */
function roomShape(room: PlanRoom, attrs: Attrs, key?: string): SvgNode {
  return el('path', { d: pathOf(room.polygon), 'data-part': 'room', ...attrs }, [], key)
}

/** A solid wall is one path per run between its openings; a virtual wall is a line. */
function wallShape(wall: PlanWall, attrs: Attrs, key?: string): SvgNode {
  if (wall.virtual) {
    return el('path', { d: virtualPath(wall.centerline), 'data-part': 'virtual', ...attrs }, [], key)
  }
  return el(
    'g',
    {},
    wall.slices.map((slice) =>
      el('path', {
        d: pathOf(slice),
        'data-part': 'wall',
        'data-exposure': wall.exposure,
        ...attrs
      })
    ),
    key
  )
}

function openingShape(opening: PlanOpening, attrs: Attrs, key?: string): SvgNode {
  return el(
    'path',
    {
      d: pathOf(stripAcross(opening.from, opening.to, opening.normal, opening.thickness)),
      'data-part': 'opening',
      'data-type': opening.type,
      ...attrs
    },
    [],
    key
  )
}

/**
 * One dimension: the dimension line, the two extension lines that tie it to what it
 * measures, and the number. Where it goes comes from the geometry core.
 */
function dimensionMark(
  dim: Dimension,
  mpp: number,
  labelAt: Vec2 | null,
  opacity: number | undefined,
  paint: Paints
): SvgNode {
  const room = dim.kind === 'room'
  const shift = { x: dim.normal.x * dim.offset, y: dim.normal.y * dim.offset }
  const a = { x: dim.from.x + shift.x, y: dim.from.y + shift.y }
  const b = { x: dim.to.x + shift.x, y: dim.to.y + shift.y }

  // Extension lines overshoot the dimension line a little, as on a drawing.
  const overshoot = 0.08
  const tipA = { x: a.x + dim.normal.x * overshoot, y: a.y + dim.normal.y * overshoot }
  const tipB = { x: b.x + dim.normal.x * overshoot, y: b.y + dim.normal.y * overshoot }

  const children: SvgNode[] = []
  if (dim.offset !== 0) {
    children.push(
      el('line', { 'data-part': 'extension', x1: dim.from.x, y1: -dim.from.y, x2: tipA.x, y2: -tipA.y, ...paint.extension }),
      el('line', { 'data-part': 'extension', x1: dim.to.x, y1: -dim.to.y, x2: tipB.x, y2: -tipB.y, ...paint.extension })
    )
  }
  children.push(el('line', { 'data-part': 'dimension-line', x1: a.x, y1: -a.y, x2: b.x, y2: -b.y, ...paint.dimensionLine(room) }))
  if (labelAt) {
    children.push(
      el('g', { transform: labelTransform(labelAt, mpp) }, [
        el('text', { 'data-part': 'dimension-text', dy: String(DIMENSION_DY), ...paint.dimensionText(room) }, [
          dimensionText(dim.value)
        ])
      ])
    )
  }
  return el('g', { 'data-part': 'dimension', 'data-kind': dim.kind, 'data-id': dim.id, opacity }, children, dim.id)
}

/** The label boxes a dimension's number could meet anywhere along its line. */
function blocksNear(dim: Dimension, blocks: readonly Box[], mpp: number): Box[] {
  const shift = { x: dim.normal.x * dim.offset, y: dim.normal.y * dim.offset }
  const line = lineBox({ x: dim.from.x + shift.x, y: dim.from.y + shift.y }, { x: dim.to.x + shift.x, y: dim.to.y + shift.y }, mpp)
  const text = dimensionTextBox({ x: 0, y: 0 }, dim, mpp)
  const reach: Box = {
    minX: line.minX + text.minX,
    maxX: line.maxX + text.maxX,
    minY: line.minY + text.minY,
    maxY: line.maxY + text.maxY
  }
  return blocks.filter((block) => block.minX < reach.maxX && reach.minX < block.maxX && block.minY < reach.maxY && reach.minY < block.maxY)
}

/** The plan's elements, back to front: what goes inside the `<svg>`. */
export function planScene(input: SceneInput): SvgNode[] {
  const { drawing, handings, doorWarnings, dimensions, metersPerPixel: mpp, look } = input
  const style = input.labels ?? {}
  const decimals = style.areaDecimals ?? 2
  const live: SceneLive = { ...STILL, ...input.live }
  const paint = paints(look, mpp)
  const out: SvgNode[] = []

  const selected = (id: string): boolean => id === live.selectedId

  if (live.leaving) {
    // Removed parts, drawn from the plan before, fading out. Not clickable: they are
    // already gone from the plan.
    const { drawing: before, ids, progress } = live.leaving
    const children: SvgNode[] = []
    for (const room of before.rooms) {
      if (!ids.has(room.id)) continue
      children.push(el('path', { d: pathOf(room.polygon), 'data-part': 'room', 'data-id': room.id, ...paint.room }, [], room.id))
    }
    for (const wall of before.walls) {
      if (!ids.has(wall.id)) continue
      if (wall.virtual) {
        children.push(
          el('path', { d: virtualPath(wall.centerline), 'data-part': 'virtual', 'data-id': wall.id, ...paint.virtual }, [], wall.id)
        )
        continue
      }
      wall.slices.forEach((slice, index) =>
        children.push(
          el(
            'path',
            {
              d: pathOf(slice),
              'data-part': 'wall',
              'data-id': wall.id,
              'data-exposure': wall.exposure,
              ...paint.wall(wall.exposure)
            },
            [],
            `${wall.id}:${index}`
          )
        )
      )
    }
    for (const opening of before.openings) {
      if (!ids.has(opening.id)) continue
      children.push(
        el(
          'path',
          {
            d: pathOf(stripAcross(opening.from, opening.to, opening.normal, opening.thickness)),
            'data-part': 'opening',
            'data-type': opening.type,
            'data-id': opening.id,
            ...paint.opening(opening.type, false)
          },
          [],
          opening.id
        )
      )
    }
    out.push(el('g', { 'data-leaving': 'true', opacity: 1 - progress, 'pointer-events': 'none' }, children, 'leaving'))
  }

  // A ghost room lies under the current rooms, like a floor that used to be there.
  for (const room of live.ghosts?.rooms ?? []) {
    out.push(roomShape(room, live.ghostAttrs(room.id), `ghost-room-${room.id}`))
  }

  for (const room of drawing.rooms) {
    out.push(
      el(
        'path',
        {
          d: pathOf(room.polygon),
          'data-part': 'room',
          'data-id': room.id,
          'data-selectable': 'true',
          'data-selected': selected(room.id),
          opacity: live.roomFill(room.id) ?? undefined,
          ...live.marks(room.id),
          ...paint.room
        },
        [],
        room.id
      )
    )
  }

  // Ghost walls and openings go over the room fills, which are opaque: a removed partition
  // or a wall that moved outward lies inside a current room. They stay under the current
  // walls, so a wall that kept its place covers its own ghost.
  for (const wall of live.ghosts?.walls ?? []) {
    out.push(wallShape(wall, live.ghostAttrs(wall.id), `ghost-wall-${wall.id}`))
  }
  for (const opening of live.ghosts?.openings ?? []) {
    out.push(openingShape(opening, live.ghostAttrs(opening.id), `ghost-opening-${opening.id}`))
  }

  for (const wall of drawing.walls) {
    const tracing = live.wallTrace(wall.id)
    const offset = live.wallOffset(wall.id)
    const transform = offset ? `translate(${offset.x} ${-offset.y})` : undefined

    if (wall.virtual) {
      const [start, end] = wall.centerline
      const reach =
        tracing === null
          ? end
          : { x: start.x + (end.x - start.x) * tracing, y: start.y + (end.y - start.y) * tracing }
      out.push(
        el(
          'path',
          {
            d: virtualPath([start, reach]),
            'data-part': 'virtual',
            'data-id': wall.id,
            'data-moving': offset ? wall.id : undefined,
            transform,
            ...live.marks(wall.id),
            ...paint.virtual
          },
          [],
          wall.id
        )
      )
      continue
    }

    const slices = tracing === null ? wall.slices : traceWall(wall, tracing)
    out.push(
      el(
        'g',
        { 'data-moving': offset ? wall.id : undefined, transform },
        slices.map((slice, index) =>
          el(
            'path',
            {
              d: pathOf(slice),
              'data-part': 'wall',
              'data-id': wall.id,
              'data-exposure': wall.exposure,
              'data-selectable': 'true',
              'data-selected': selected(wall.id),
              ...live.marks(wall.id),
              ...live.hit(wall.id),
              ...paint.wall(wall.exposure)
            },
            [],
            String(index)
          )
        ),
        wall.id
      )
    )
  }

  for (const opening of drawing.openings) {
    const opened = live.openingOpen(opening.id)
    const span = opened === null ? opening : openingAt(opening, opened)
    const exposure = drawing.walls.find((wall) => wall.id === opening.wallId)?.exposure
    const door = doorSymbolOf(opening, handings.get(opening.id))

    if (opened !== null) {
      // The part of the gap not yet open is still wall, so the wall parts from the
      // opening's centre outwards.
      ;[
        [opening.from, span.from],
        [span.to, opening.to]
      ].forEach(([a, b], index) =>
        out.push(
          el(
            'path',
            {
              d: pathOf(stripAcross(a, b, opening.normal, opening.thickness)),
              'data-part': 'wall',
              'data-exposure': exposure,
              'data-closing': 'true',
              'pointer-events': 'none',
              ...paint.wall(exposure)
            },
            [],
            `${opening.id}:closing:${index}`
          )
        )
      )
    }
    out.push(
      el(
        'path',
        {
          d: pathOf(stripAcross(span.from, span.to, opening.normal, opening.thickness)),
          'data-part': 'opening',
          'data-type': opening.type,
          'data-id': opening.id,
          'data-selectable': 'true',
          'data-selected': selected(opening.id),
          ...live.marks(opening.id),
          'data-swing': door ? 'true' : undefined,
          ...live.hit(opening.id),
          ...paint.opening(opening.type, door !== null)
        },
        [],
        opening.id
      )
    )
    if (door) {
      // Drawing, not a target: clicks reach the gap or room underneath.
      out.push(
        el(
          'g',
          {
            'data-part': 'door-symbol',
            'data-opening': opening.id,
            'pointer-events': 'none',
            'aria-hidden': 'true',
            opacity: opened ?? undefined
          },
          [
            ...door.jambs.map(([a, b]) => el('line', { 'data-part': 'jamb', x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...paint.jamb })),
            el('line', {
              'data-part': 'door-leaf',
              x1: door.leaf[0].x,
              y1: door.leaf[0].y,
              x2: door.leaf[1].x,
              y2: door.leaf[1].y,
              ...paint.doorLeaf
            }),
            el('path', { 'data-part': 'door-arc', d: door.arc, ...paint.doorArc })
          ],
          `${opening.id}:door`
        )
      )
    }
  }

  // A step between rooms at different levels (LVL-7): a solid line in the wall's ink across the
  // opening, on top of the gap, or over a dividing line, which then reads as an edge. Drawing,
  // not a target: clicks reach the gap or room underneath.
  for (const step of drawing.steps) {
    out.push(
      el(
        'line',
        {
          'data-part': 'step',
          'data-wall': step.wallId,
          'data-opening': step.openingId ?? undefined,
          'data-upper': step.upper,
          'data-lower': step.lower,
          'pointer-events': 'none',
          x1: step.from.x,
          y1: -step.from.y,
          x2: step.to.x,
          y2: -step.to.y,
          ...paint.step
        },
        [],
        `step:${step.wallId}:${step.openingId ?? ''}:${step.from.x},${step.from.y}`
      )
    )
  }

  // Each label goes to a spot in its room clear of door swings, walls and the other labels,
  // or out of the room with a leader. Measured from the text actually drawn, so a wider
  // "before → after" area still gets the room it needs.
  const areaText = (room: PlanRoom): string => {
    const change = live.areaChange(room.id)
    return change
      ? `${areaFigure(change.before, decimals)} → ${areaFigure(change.after, decimals)} m²`
      : formatArea(room.area, decimals)
  }
  // The same text in the pieces the app has always drawn it in, one text node each.
  const areaPieces = (room: PlanRoom): string[] => {
    const change = live.areaChange(room.id)
    return change
      ? [areaFigure(change.before, decimals), ' → ', areaFigure(change.after, decimals), ' m²']
      : [areaFigure(room.area, decimals), ' m²']
  }
  const names = drawing.rooms.map((room, index) => {
    const name = labelName(room.name, index, style)
    return style.ids ? `${name} [${room.id}]` : name
  })
  const swings: Box[] = []
  for (const opening of drawing.openings) {
    const box = doorSwingBox(opening, handings.get(opening.id), mpp)
    if (box) swings.push(box)
  }
  // The dimension lines, and the numbers that never move: a label keeps off them when it can.
  const dimensionBlocks: Box[] = []
  for (const dim of dimensions) {
    const shift = { x: dim.normal.x * dim.offset, y: dim.normal.y * dim.offset }
    dimensionBlocks.push(lineBox({ x: dim.from.x + shift.x, y: dim.from.y + shift.y }, { x: dim.to.x + shift.x, y: dim.to.y + shift.y }, mpp))
    if (dim.kind !== 'room') dimensionBlocks.push(dimensionTextBox(dim.labelAt, dim, mpp))
  }
  // A label moved out of its room stays where a framed view of the plan, or a picture of it,
  // always shows: the drawing and its dimensions, and the margin `fitTo` leaves round them.
  const framed = boundsWithDimensions(drawing, dimensions)
  const padX = Math.max(framed.width, 0.001) * FRAME_MARGIN
  const padY = Math.max(framed.height, 0.001) * FRAME_MARGIN
  const labels = placeRoomLabels(
    drawing.rooms.map((room, index) => ({ id: room.id, polygon: room.polygon, name: names[index]!, areaText: areaText(room) })),
    { swings, walls: drawing.walls.filter((wall) => !wall.virtual).flatMap((wall) => wall.slices), dimensions: dimensionBlocks },
    mpp,
    { minX: framed.min.x - padX, maxX: framed.max.x + padX, minY: framed.min.y - padY, maxY: framed.max.y + padY }
  )
  const labelBlocks = labels.flatMap((label) => (label ? [label.box] : []))

  for (const dim of dimensions) {
    const shown = live.dimensionShown(dim)
    if (shown <= 0) continue
    const labelAt = dim.kind === 'room' ? placeDimensionLabel(dim, blocksNear(dim, labelBlocks, mpp), mpp) : dim.labelAt
    out.push(dimensionMark(dim, mpp, labelAt, shown < 1 ? shown : undefined, paint))
  }

  drawing.rooms.forEach((room, index) => {
    const label = labels[index]
    // No clear spot at this zoom: the label waits for the user to zoom in.
    if (!label) return
    const opacity = live.labelOpacity(room.id)
    if (label.leader) {
      const [a, b] = label.leader
      out.push(
        el(
          'line',
          { 'data-part': 'label-leader', 'data-room': room.id, x1: a.x, y1: -a.y, x2: b.x, y2: -b.y, opacity, ...paint.leader },
          [],
          `leader:${room.id}`
        )
      )
    }
    out.push(
      el(
        'g',
        { transform: labelTransform(label.at, mpp), opacity },
        [
          el('text', { 'data-part': 'label', ...paint.label }, [names[index]!]),
          el('text', { 'data-part': 'area', dy: String(ROOM_AREA_DY), ...paint.area }, areaPieces(room))
        ],
        `label:${room.id}`
      )
    )
  })

  // After the current labels, so the plan's own fills never cover it. A ghost, so no paint.
  for (const room of live.removedRooms) {
    out.push(
      el(
        'g',
        { transform: labelTransform(poleOfInaccessibility(room.polygon).point, mpp), ...live.ghostAttrs(room.id) },
        [el('text', { 'data-part': 'label' }, [`${room.name} · ${formatArea(room.area, decimals)} · removed`])],
        `ghost-label-${room.id}`
      )
    )
  }

  // The check view: each opening's id just off the middle of its wall, on the side its normal
  // points to, upright and sized in screen pixels like the labels.
  if (style.ids) {
    for (const opening of drawing.openings) {
      const reach = opening.thickness / 2
      const at = {
        x: (opening.from.x + opening.to.x) / 2 + opening.normal.x * reach,
        y: (opening.from.y + opening.to.y) / 2 + opening.normal.y * reach
      }
      out.push(
        el(
          'g',
          { 'data-part': 'opening-id', 'data-opening': opening.id, transform: labelTransform(at, mpp) },
          [el('text', { x: opening.normal.x * OPENING_ID_PX, y: -opening.normal.y * OPENING_ID_PX + 4, ...paint.area }, [opening.id])],
          `opening-id:${opening.id}`
        )
      )
    }
  }

  for (const opening of drawing.openings) {
    const message = doorWarnings.get(opening.id)
    if (message === undefined) continue
    const at = { x: (opening.from.x + opening.to.x) / 2, y: (opening.from.y + opening.to.y) / 2 }
    // Sized in screen pixels like the labels.
    const children: SvgNode[] = [el('circle', { 'data-part': 'door-warning-dot', r: WARNING_RADIUS_PX, ...paint.warningDot })]
    if (live.hoveredWarning === opening.id) {
      children.push(
        el('text', { 'data-part': 'door-warning-text', x: WARNING_RADIUS_PX + 6, dy: '4', ...paint.warningText }, [message])
      )
    }
    out.push(
      el(
        'g',
        {
          'data-part': 'door-warning',
          'data-opening': opening.id,
          role: 'img',
          'aria-label': message,
          transform: labelTransform(at, mpp)
        },
        children,
        `warning:${opening.id}`
      )
    )
  }

  if (live.pulse) {
    // Presentation only: not part of the plan, its bounds or selection.
    out.push(
      el(
        'circle',
        {
          'data-part': 'pulse',
          class: 'animate-grid-pulse',
          cx: live.pulse.x,
          cy: -live.pulse.y,
          r: PULSE_RADIUS_PX * mpp,
          'pointer-events': 'none',
          'aria-hidden': 'true',
          ...paint.pulse
        },
        [],
        'pulse'
      )
    )
  }

  return out
}
