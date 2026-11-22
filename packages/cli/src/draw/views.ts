/**
 * The named views the tool server draws: a floor plan, a sheet of plans side by side at one
 * scale, the 3D model from a side of the drawing, and an eye-level view from inside a room.
 *
 * Every picture is the viewer's own drawing (`planPicture`, `stillScene`): only the camera and
 * the frame are chosen here. "North" is the top of the drawing, +y: a plan holds no north.
 */
import { floorElevations, poleOfInaccessibility, type Bounds, type FloorPlan, type Vec2 } from '@ongrid/floorplan/geometry'
import { LOOKS as PICTURE_LOOKS, fullHeight, pictureToSvg, planPicture, PICTURE_FONT, type FaultLine } from '@ongrid/viewer/src/picture'
import { el, toSvg } from '@ongrid/viewer/src/picture/svgNode'
import { GROUND_GRID } from '@ongrid/viewer/src/canvas3d/BuildingScene'
import { LIGHT_COLORS_3D, rasterise, stillScene } from '@ongrid/viewer/src/still'
import { loadCanvas } from './canvas'
import { drawPlan } from './drawPlan'
import { partBounds, pixelBoxes, type PartBox } from './partBoxes'
import { forSkia } from './skiaText'

import { namedLook, type LookName, type Side } from './viewNames'

function lookOf(look: LookName): 'working' | 'technical' | 'dark' {
  return namedLook(look)
}

export interface PlanView {
  readonly png: Uint8Array
  readonly width: number
  readonly height: number
  readonly pxPerMetre: number
  /** Plan views: where each room, opening and wall is on the picture, in image pixels (VEW-6). */
  readonly boxes?: readonly PartBox[]
  /** Plan views: the doors drawn with the "undecided" mark (`Picture.undecidedDoors`). */
  readonly undecidedDoors?: readonly string[]
}

export async function planView(
  plan: FloorPlan,
  options: { floor?: string; look: LookName; dimensions: boolean; ids?: boolean; frame?: Bounds; faults?: readonly FaultLine[] },
): Promise<PlanView> {
  // VEW-2's check view: every room, door and window carries its id. VEW-6: a frame crops.
  // MSG-8: the result record's lines, marked on the drawing and listed under it.
  const extra = {
    ...(options.ids ? { labels: { ids: true } } : {}),
    ...(options.frame ? { frame: options.frame } : {}),
    ...(options.faults ? { faults: options.faults } : {}),
  }
  const picture = planPicture(plan, { floor: options.floor ?? null, look: lookOf(options.look), showDimensions: options.dimensions, ...extra })
  const png = await drawPlan(plan, { format: 'png', floor: options.floor, look: lookOf(options.look), showDimensions: options.dimensions, ...extra })
  const boxes = pixelBoxes(partBounds(plan, options.floor), picture)
  return { png, width: picture.width, height: fullHeight(picture), pxPerMetre: picture.width / picture.view.width, boxes, undecidedDoors: picture.undecidedDoors }
}

const SHEET_WIDTH = 2400
const GAP = 40
const TITLE = 48

/** Several plans side by side, every one at the same scale, each under its title. */
export async function sheetView(plans: readonly { plan: FloorPlan; title: string; floor?: string }[], look: LookName): Promise<PlanView> {
  const { createCanvas, loadImage, GlobalFonts } = await loadCanvas()
  // The pictures' text is written the way Skia draws it right (`forSkia`, VEW-7).
  const installed = (family: string): boolean => GlobalFonts.has(family)
  const first = plans.map((p) => planPicture(p.plan, { floor: p.floor ?? null, look: lookOf(look) }))
  const metres = first.reduce((sum, picture) => sum + picture.view.width, 0)
  const pxPerMetre = (SHEET_WIDTH - GAP * (plans.length - 1)) / metres
  let x = 0
  let tallest = 0
  const parts: string[] = []
  plans.forEach((p, i) => {
    const view = first[i]!.view
    const width = Math.max(1, Math.round(view.width * pxPerMetre))
    const height = Math.max(1, Math.round(view.height * pxPerMetre))
    const picture = planPicture(p.plan, { floor: p.floor ?? null, look: lookOf(look), width, height })
    const svg = pictureToSvg({ ...picture, nodes: forSkia(picture.nodes, installed) })
    parts.push(svg.replace(/^<svg /, `<svg x="${x}" y="${TITLE}" `))
    const title = el('text', { x: x + width / 2, y: TITLE - 14, 'text-anchor': 'middle', 'font-family': PICTURE_FONT, 'font-size': 28, fill: '#000000' }, [p.title])
    parts.push(toSvg(forSkia([title], installed)))
    x += width + GAP
    tallest = Math.max(tallest, height)
  })
  const width = x - GAP
  const height = tallest + TITLE
  const paper = PICTURE_LOOKS[lookOf(look)].colors.paper
  const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${paper}"/>${parts.join('')}</svg>`
  const image = await loadImage(Buffer.from(sheet))
  const canvas = createCanvas(width, height)
  const context = canvas.getContext('2d')
  context.fillStyle = paper
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)
  return { png: await canvas.encode('png'), width, height, pxPerMetre }
}

const BEARING: Record<Exclude<Side, 'above'>, number> = {
  north: 0, 'north-east': 45, east: 90, 'south-east': 135, south: 180, 'south-west': 225, west: 270, 'north-west': 315,
}

const STILL_W = 1200
const STILL_H = 800
const DEG = Math.PI / 180

async function png(image: { data: Uint8ClampedArray; width: number; height: number }): Promise<Uint8Array> {
  const { createCanvas, ImageData } = await loadCanvas()
  const canvas = createCanvas(image.width, image.height)
  canvas.getContext('2d').putImageData(new ImageData(image.data, image.width, image.height), 0, 0)
  return canvas.encode('png')
}

export interface CameraView {
  readonly png: Uint8Array
  /** Where the camera stands and looks, in plan metres (x, y) and height above the ground. */
  readonly camera: { readonly at: readonly [number, number, number]; readonly heading: number; readonly tilt: number; readonly fov: number }
}

/** The 3D model seen from one side of the drawing, or from above, as a whole or one floor cut away. */
export async function modelView(plan: FloorPlan, options: { from: Side; floor?: string }): Promise<CameraView> {
  const still = stillScene(plan, { focus: options.floor ?? null, colors: LIGHT_COLORS_3D, width: STILL_W, height: STILL_H })
  try {
    const [tx, ty, tz] = still.frame.target
    const bearing = options.from === 'above' ? 180 : BEARING[options.from]
    const tilt = options.from === 'above' ? 80 : 30
    const distance = still.frame.span * 2.2
    const east = Math.sin(bearing * DEG) * Math.cos(tilt * DEG)
    const north = Math.cos(bearing * DEG) * Math.cos(tilt * DEG)
    const camera = still.camera
    camera.position.set(tx + distance * east, ty + distance * Math.sin(tilt * DEG), tz - distance * north)
    camera.lookAt(tx, ty, tz)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    const image = rasterise(still.scene, camera, {
      width: STILL_W,
      height: STILL_H,
      supersample: 2,
      ground: { ...GROUND_GRID, center: [tx, tz], cellColor: LIGHT_COLORS_3D.grid, sectionColor: LIGHT_COLORS_3D.gridSection },
    })
    const p = camera.position
    return { png: await png(image), camera: { at: [p.x, -p.z, p.y], heading: (bearing + 180) % 360, tilt: -tilt, fov: camera.fov } }
  } finally {
    still.close()
  }
}

/** A heading in degrees clockwise from north (the top of the drawing) toward a point. */
function headingTo(from: Vec2, to: Vec2): number {
  return ((Math.atan2(to.x - from.x, to.y - from.y) / DEG) % 360 + 360) % 360
}

/**
 * Standing in a room, eye `height` metres above its floor, looking level toward `toward`. The
 * floor is shown cut away, so nothing above it is drawn. 90 degrees across.
 */
export async function eyeView(
  plan: FloorPlan,
  options: { floor: string; polygon: readonly Vec2[]; height: number; toward: Vec2 | number; stand?: Vec2 },
): Promise<CameraView> {
  const still = stillScene(plan, { focus: options.floor, colors: LIGHT_COLORS_3D, width: STILL_W, height: STILL_H })
  try {
    const base = floorElevations(plan).floors.get(options.floor)?.floorLevel ?? 0
    const centre = poleOfInaccessibility(options.polygon).point
    // Stand back from the middle, away from what is looked at, so more of the room is seen.
    const heading = typeof options.toward === 'number' ? options.toward : headingTo(centre, options.toward)
    const back = options.stand ?? standBack(options.polygon, centre, heading)
    const camera = still.camera
    const aspect = STILL_W / STILL_H
    camera.fov = (2 * Math.atan(Math.tan(45 * DEG) / aspect)) / DEG
    camera.near = 0.05
    const eye = base + options.height
    camera.position.set(back.x, eye, -back.y)
    camera.lookAt(back.x + Math.sin(heading * DEG), eye, -(back.y + Math.cos(heading * DEG)))
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    const image = rasterise(still.scene, camera, { width: STILL_W, height: STILL_H, supersample: 2 })
    return { png: await png(image), camera: { at: [back.x, back.y, eye], heading, tilt: 0, fov: camera.fov } }
  } finally {
    still.close()
  }
}

/** A point behind the room's middle, opposite the heading, still well inside the room. */
function standBack(polygon: readonly Vec2[], centre: Vec2, heading: number): Vec2 {
  const dir = { x: -Math.sin(heading * DEG), y: -Math.cos(heading * DEG) }
  let best = centre
  for (let step = 0.25; step < 20; step += 0.25) {
    const p = { x: centre.x + dir.x * step, y: centre.y + dir.y * step }
    if (!insideBy(polygon, p, 0.4)) break
    best = p
  }
  return best
}

function insideBy(polygon: readonly Vec2[], p: Vec2, margin: number): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!
    const b = polygon[j]!
    if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y)) inside = !inside
  }
  if (!inside) return false
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
    if (Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y) < margin) return false
  }
  return true
}
