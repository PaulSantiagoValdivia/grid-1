/**
 * IFC export — the open BIM interchange format Revit reads.
 *
 * IFC2x3 with the Coordination View 2.0 on purpose: it is Revit's own default
 * IFC export and the variant every BIM tool imports. Walls are extruded solids
 * and openings are separate elements that void them, which is exactly the split
 * this exporter needs; IFC4's Reference View has no boolean voids, so walls
 * would have to ship pre-cut and a door would lose the opening it sits in.
 *
 * Input is the whole `FloorPlan`, not a resolved drawing: `PlanDrawing` has the
 * openings already cut out of the walls and is flat, `Scene3D` keeps a wall
 * only as an elevation with anonymous holes. IFC wants the uncut wall plus each
 * opening as its own typed element, on a named storey. The export still cannot
 * disagree with the views, because each floor goes through the same validation
 * (`validatePlan`) and an element is written exactly when the views draw it.
 *
 * Coordinates are the model's own: metres, X and Y as on the plan, Z up (C4).
 * That is already a right-handed basis with Z up, so nothing is flipped. A plan
 * whose y runs down (CNT-3, C7) is written as it is, so its model is the
 * building's mirror image; `grid check` says so (`plan/y-down`).
 */

import type { Floor, FloorPlan, Opening, PlanIndex, Room, Wall } from '../plan'
import { planFloors, planForFloor } from '../floors'
import { inIdOrder } from '../order'
import { indexPlan, openingsOf } from '../plan'
import {
  isDrawnWall,
  isFiniteWall,
  roofOver,
  SLAB_THICKNESS,
  stackFloors,
  type StoreyLevel
} from '../elevations'
import type { MultiPolygon } from 'polygon-clipping'
import { planEnvelope, roomCeiling } from '../envelope'
import { piecesAsRings, ringOf } from '../polygons'
import { tolerance } from '../tolerances'
import { tryRoomShape } from '../room'
import { roomZones } from '../zones'
import { roomFloorOffset } from '../steps'
import { wallExposure } from '../exposure'
import { brokenOnFloor, validatePlan } from '../validate'
import type { StairLayout } from '../stairs'
import { planStairs } from '../stairs'
import { stairBlocks } from '../scene3d'
import type { WallEnds } from '../wall'
import { wallAxis } from '../wall'
import { wallJoints } from '../joints'
import { ITEM_KIND_WORDS, isItemKind, itemRoom, roomShapes } from '../items'
import { GENERAL_GUIDANCE_LABEL } from '../rules/types'
import { leftOutByKind, leftOutSummary, partNames, type LeftOutKind, type LeftOutPart } from './leftOut'
import { directionOfTurn, planOrientation } from '../orientation'

export interface IfcOptions {
  /**
   * Seeds every element's GlobalId, so a BIM tool can recognise an updated
   * export of the same project. Plan ids such as `w1` repeat across projects:
   * without a seed, two Grid models linked in one Revit session would share
   * element ids. The id the plan stores (`FloorPlan.projectId`, QAR-5) wins over
   * this one; when neither is there, `IFC_DEFAULT_PROJECT_ID` is used.
   */
  readonly projectId?: string
  readonly projectName?: string
  /**
   * Written into the header and the owner history. The exporter never reads the
   * clock (it must stay pure and deterministic), so the caller supplies it;
   * without one, `IFC_DEFAULT_TIMESTAMP` is used.
   */
  readonly timestamp?: Date
  /**
   * HND-6: the parts of the plan this file leaves out, written as the building's property set
   * `Grid_LeftOut`. None, and the file is as it was.
   */
  readonly leftOut?: readonly LeftOutPart[]
}

/** The project identity used when the caller supplies none. */
export const IFC_DEFAULT_PROJECT_ID = 'grid-project'

/** The Unix epoch: a fixed instant that honestly reads "not supplied". */
export const IFC_DEFAULT_TIMESTAMP: Date = new Date(0)

const DEFAULT_PROJECT_NAME = 'Grid plan'

// ---------------------------------------------------------------------------
// STEP attribute encoding
// ---------------------------------------------------------------------------

const NULL = '$'
const DERIVED = '*'

const ref = (id: number): string => `#${id}`
const refs = (ids: readonly number[]): string => `(${ids.map(ref).join(',')})`
const en = (name: string): string => `.${name}.`

/**
 * A STEP real: it must contain a point (`3.`, never `3`), and `-0` is noise
 * that some readers parse and nobody wants to read. Ten decimals keep the unit
 * direction of a rotated wall exact to well below a micrometre.
 */
function real(value: number): string {
  if (!Number.isFinite(value)) return '0.'
  const trimmed = value.toFixed(10).replace(/0+$/, '')
  return trimmed === '-0.' ? '0.' : trimmed
}

const int = (value: number): string => String(Math.trunc(value))
const reals = (values: readonly number[]): string => `(${values.map(real).join(',')})`

/**
 * A STEP string, quoted and escaped.
 *
 * Names come from the plan file, which the assistant writes, so a value must
 * not be able to end early or start a forged entity. A `'` is doubled and a `\`
 * is doubled (it is the escape character). Anything outside printable ASCII is
 * written as `\X2\HHHH\X0\`, the UTF-16 code units in uppercase hex, so the
 * file stays ASCII whatever encoding the caller saves it with and a reader
 * decodes the name as typed; a character outside the BMP is its surrogate pair.
 * Control characters (a newline would end the entity's line) are dropped.
 */
export function ifcString(value: string): string {
  const clean = value.replace(/\p{Cc}/gu, '')
  let out = ''
  let block = ''

  const flush = (): void => {
    if (block.length > 0) out += `\\X2\\${block}\\X0\\`
    block = ''
  }

  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i)
    if (code >= 0x20 && code <= 0x7e) {
      flush()
      out += code === 0x27 ? "''" : code === 0x5c ? '\\\\' : clean[i]
    } else {
      block += code.toString(16).toUpperCase().padStart(4, '0')
    }
  }
  flush()

  return `'${out}'`
}

const str = ifcString

// ---------------------------------------------------------------------------
// GlobalId
// ---------------------------------------------------------------------------

/** IFC's 64-character alphabet for a GlobalId, in value order. */
const GUID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'

/**
 * A 128-bit hash of the text, as four 32-bit words.
 *
 * cyrb128 (public domain): four lanes cross-mixed with `Math.imul`, so it needs
 * no `crypto` and no `Buffer` (this module also compiles for the browser) and
 * gives the same words on every engine. It is not cryptographic and does not
 * need to be: an identity only has to be stable and, over a file's few
 * thousand elements, collision-free, which `GuidIssuer` then makes certain.
 */
function hash128(text: string): [number, number, number, number] {
  let h1 = 1779033703
  let h2 = 3144134277
  let h3 = 1013904242
  let h4 = 2773480762

  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }

  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)

  const mix = h2 ^ h3 ^ h4
  h1 ^= mix
  return [h1 >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0]
}

/**
 * An IfcGloballyUniqueId: 128 bits as 22 characters. The first character
 * carries the top 2 bits (so it is `0`-`3`), the other 21 carry 6 bits each.
 *
 * Deterministic on purpose: a random GUID would give a different identity on
 * every export, so a BIM tool could never recognise an updated model.
 */
export function ifcGuid(seed: string): string {
  const words = hash128(seed)
  const bit = (n: number): number => (words[n >> 5]! >>> (31 - (n & 31))) & 1

  let out = ''
  let position = 0
  for (let group = 0; group < 22; group++) {
    let value = 0
    for (let b = group === 0 ? 2 : 6; b > 0; b--) value = (value << 1) | bit(position++)
    out += GUID_ALPHABET[value]
  }
  return out
}

export interface GuidIssuer {
  /**
   * The GlobalId of one element of the plan, unique among all this issuer gave.
   * `floor` is the floor the element is on, or null for what the whole building
   * shares (the project, the site, a storey, a door style).
   */
  issue(kind: string, id: string, floor?: string | null): string
}

/**
 * Issues GlobalIds for one document, from the project id, the element's kind,
 * its floor and its id (QAR-5), written as one JSON array so that no two of
 * them read as the same text, whatever the ids hold.
 *
 * Seeded by the project because plan ids such as `w1` repeat across projects,
 * and by the floor so that identities stay apart if ids ever become per floor.
 * An id already issued gets a counter appended and is hashed again: the hash
 * makes a collision astronomically unlikely, and this makes it impossible.
 */
export function createGuidIssuer(projectId: string): GuidIssuer {
  const used = new Set<string>()

  return {
    issue(kind, id, floor = null) {
      const seed = JSON.stringify([projectId, kind, floor, id])
      let guid = ifcGuid(seed)
      for (let n = 1; used.has(guid); n++) guid = ifcGuid(`${seed}#${n}`)
      used.add(guid)
      return guid
    }
  }
}

class StepWriter {
  private readonly rows: string[] = []

  add(type: string, ...attributes: readonly string[]): number {
    const id = this.rows.length + 1
    this.rows.push(`#${id}=${type}(${attributes.join(',')});`)
    return id
  }

  toString(header: readonly string[]): string {
    return [
      'ISO-10303-21;',
      'HEADER;',
      ...header,
      'ENDSEC;',
      'DATA;',
      ...this.rows,
      'ENDSEC;',
      'END-ISO-10303-21;',
      ''
    ].join('\n')
  }
}

// ---------------------------------------------------------------------------
// Building the document
// ---------------------------------------------------------------------------

/** Entities every element shares, written once. */
interface Shared {
  /** The views of the 3D `Model` context that a shape names. */
  readonly bodyContext: number
  readonly axisContext: number
  /** A placement at the origin with the default axes: the foot of every extrusion. */
  readonly identity: number
  /** Z up, and the extrusion direction of every solid here. */
  readonly up: number
  readonly east2: number
}

/** Wall material, shared by every wall of one thickness. */
interface WallMaterials {
  material: number | null
  /** Insertion order is first use, so the output stays deterministic. */
  readonly byThickness: Map<string, { usage: number; walls: number[] }>
}

interface Context {
  readonly w: StepWriter
  readonly owner: number
  readonly shared: Shared
  readonly materials: WallMaterials
  /** Doors typed by their swing, by operation type, in the order they were written. */
  readonly doorsByOperation: Map<DoorOperation, number[]>
  /** The GlobalId of an element of this context's floor, or of the building's. */
  guid(kind: string, id: string): string
  readonly issuer: GuidIssuer
}

/** The same context, issuing the identities of one floor's elements. */
function onFloor(c: Context, floorId: string): Context {
  return { ...c, guid: (kind, id) => c.issuer.issue(kind, id, floorId) }
}

function isoSeconds(date: Date): string {
  return date.toISOString().slice(0, 19)
}

/** A caller-supplied `Date` can be invalid, and `toISOString` throws on one. */
function usableTimestamp(date: Date | undefined): Date {
  return date && Number.isFinite(date.getTime()) ? date : IFC_DEFAULT_TIMESTAMP
}

function writeOwnerHistory(w: StepWriter, timestamp: Date): number {
  // No personal data goes into the file: the person is anonymous. IfcPerson
  // WR1 requires a FamilyName or a GivenName to exist, so FamilyName is the
  // empty string: present, and carrying nothing.
  const person = w.add('IFCPERSON', str('anonymous'), str(''), NULL, NULL, NULL, NULL, NULL, NULL)
  const organisation = w.add('IFCORGANIZATION', NULL, str('Grid'), NULL, NULL, NULL)
  const personAndOrganisation = w.add(
    'IFCPERSONANDORGANIZATION',
    ref(person),
    ref(organisation),
    NULL
  )
  const application = w.add(
    'IFCAPPLICATION',
    ref(organisation),
    str('1'),
    str('Grid'),
    str('Grid')
  )

  return w.add(
    'IFCOWNERHISTORY',
    ref(personAndOrganisation),
    ref(application),
    NULL,
    en('NOCHANGE'),
    NULL,
    NULL,
    NULL,
    int(Math.floor(timestamp.getTime() / 1000))
  )
}

function writeUnits(w: StepWriter): number {
  const unit = (type: string, name: string): number =>
    w.add('IFCSIUNIT', DERIVED, en(type), NULL, en(name))

  return w.add(
    'IFCUNITASSIGNMENT',
    refs([
      unit('LENGTHUNIT', 'METRE'),
      unit('AREAUNIT', 'SQUARE_METRE'),
      unit('VOLUMEUNIT', 'CUBIC_METRE'),
      unit('PLANEANGLEUNIT', 'RADIAN')
    ])
  )
}

/**
 * The model's context. Its `TrueNorth` is the north the plan states (CNT-3, C7), as a direction
 * in the plan's X and Y; a plan that states none gets none (`$`), where Grid once wrote +Y for
 * every plan (lab EL-14). IFC reads an absent `TrueNorth` as +Y, but the file no longer claims it.
 */
function writeModelContext(w: StepWriter, stated: number | null): { model: number; shared: Shared } {
  const origin = w.add('IFCCARTESIANPOINT', reals([0, 0, 0]))
  const up = w.add('IFCDIRECTION', reals([0, 0, 1]))
  const east = w.add('IFCDIRECTION', reals([1, 0, 0]))
  const world = w.add('IFCAXIS2PLACEMENT3D', ref(origin), ref(up), ref(east))
  const toward = stated === null ? null : directionOfTurn(stated)
  const north = toward === null ? NULL : ref(w.add('IFCDIRECTION', reals([toward.x, toward.y])))

  const model = w.add(
    'IFCGEOMETRICREPRESENTATIONCONTEXT',
    NULL,
    str('Model'),
    int(3),
    '1.E-05',
    ref(world),
    north
  )

  // The views a shape names. Their dimension, precision and axes are derived
  // from the parent context, which is what `*` says.
  const subContext = (identifier: string, view: string): number =>
    w.add(
      'IFCGEOMETRICREPRESENTATIONSUBCONTEXT',
      str(identifier),
      str('Model'),
      DERIVED,
      DERIVED,
      DERIVED,
      DERIVED,
      ref(model),
      NULL,
      en(view),
      NULL
    )

  const bodyContext = subContext('Body', 'MODEL_VIEW')
  const axisContext = subContext('Axis', 'GRAPH_VIEW')
  const identity = w.add('IFCAXIS2PLACEMENT3D', ref(origin), NULL, NULL)
  const east2 = w.add('IFCDIRECTION', reals([1, 0]))

  return { model, shared: { bodyContext, axisContext, identity, up, east2 } }
}

type Triple = readonly [number, number, number]

/**
 * A placement at `at`, relative to another one (or to the world when `rel` is
 * null). With `along`, local X points that way and Z stays up, which makes Y the
 * left normal (a right-handed basis, so nothing here is ever mirrored).
 */
function placement(w: StepWriter, rel: number | null, at: Triple, along?: Triple): number {
  const point = w.add('IFCCARTESIANPOINT', reals(at))
  const axes = along
    ? w.add(
        'IFCAXIS2PLACEMENT3D',
        ref(point),
        ref(w.add('IFCDIRECTION', reals([0, 0, 1]))),
        ref(w.add('IFCDIRECTION', reals(along)))
      )
    : w.add('IFCAXIS2PLACEMENT3D', ref(point), NULL, NULL)
  return w.add('IFCLOCALPLACEMENT', rel === null ? NULL : ref(rel), ref(axes))
}

function aggregate(c: Context, key: string, parent: number, children: readonly number[]): void {
  // IFC's RelatedObjects is SET [1:?]: an empty relationship is invalid.
  if (children.length === 0) return
  c.w.add(
    'IFCRELAGGREGATES',
    str(c.guid('aggregates', key)),
    ref(c.owner),
    NULL,
    NULL,
    ref(parent),
    refs(children)
  )
}

/**
 * One floor, sliced and validated the way the views do it (`buildScene` and
 * `buildFloorPlan`): an element is exported exactly when the views draw it.
 */
interface FloorModel {
  readonly floor: Floor
  readonly index: PlanIndex
  readonly broken: ReadonlySet<string>
  /** The walls that become wall elements: not virtual, not broken. */
  readonly walls: readonly Wall[]
}

const isSoundOpening = (opening: Opening): boolean =>
  Number.isFinite(opening.offset) &&
  Number.isFinite(opening.width) &&
  Number.isFinite(opening.sill) &&
  Number.isFinite(opening.height)

function analyseFloor(plan: FloorPlan, floor: Floor): FloorModel {
  try {
    const slice = planForFloor(plan, floor.id)
    const index = indexPlan(slice)
    const broken = new Set(validatePlan(slice, index, { spaces: false }).broken)

    // Validation judges shape, not whether a number is a number: a NaN passes
    // every comparison it is put through. Such an element would be written as
    // zeros, which is worse than leaving it out, so it counts as broken here and
    // takes down what hangs on it, exactly as a broken wall does there.
    for (const wall of slice.walls) if (!isFiniteWall(wall)) broken.add(wall.id)
    for (const opening of slice.openings) {
      if (!isSoundOpening(opening) || broken.has(opening.wall)) broken.add(opening.id)
    }
    for (const room of slice.rooms) {
      if (room.boundary.some((wallId) => broken.has(wallId))) broken.add(room.id)
    }

    const walls = slice.walls.filter((wall) => isDrawnWall(wall, broken))
    return { floor, index, broken, walls }
  } catch {
    // Validation is total, but the export must be even if it is not: a floor
    // that cannot be analysed is a floor with nothing sound on it.
    const empty: FloorPlan = { ...plan, walls: [], rooms: [], openings: [], items: [] }
    return { floor, index: indexPlan(empty), broken: new Set(), walls: [] }
  }
}

/**
 * Storey elevations, by floor id, from what each floor states and the tallest exported wall on
 * it, stacked on `SLAB_THICKNESS` slabs where a floor states none (see `stackFloors`): the same
 * rule the 3D view uses through `floorElevations`.
 */
function deriveLevels(models: readonly FloorModel[]): Map<string, StoreyLevel> {
  return stackFloors(
    models.map(({ floor, walls }) => {
      let tallest = 0
      for (const wall of walls) {
        if (Number.isFinite(wall.height) && wall.height > tallest) tallest = wall.height
      }
      return { floor, tallest }
    }),
    SLAB_THICKNESS
  )
}

interface Storey {
  readonly id: number
  readonly placement: number
  readonly model: FloorModel
  readonly elevation: number
  /** The height of its level: what spaces are extruded to. */
  readonly height: number
  /** Its rooms' spaces, by room id, as they are written. */
  readonly spaces: Map<string, number>
}

function writeStorey(
  c: Context,
  parentPlacement: number,
  model: FloorModel,
  level: StoreyLevel
): Storey {
  const placementId = placement(c.w, parentPlacement, [0, 0, level.floorLevel])
  const id = c.w.add(
    'IFCBUILDINGSTOREY',
    str(c.guid('storey', model.floor.id)),
    ref(c.owner),
    str(model.floor.name),
    NULL,
    NULL,
    ref(placementId),
    NULL,
    NULL,
    en('ELEMENT'),
    real(level.floorLevel)
  )
  return {
    id,
    placement: placementId,
    model,
    elevation: level.floorLevel,
    height: level.clearHeight,
    spaces: new Map()
  }
}

/** A rectangle on its own centre line, `width` along X and `depth` across it. */
function rectangleProfile(c: Context, width: number, depth: number, centreX: number): number {
  const centre = c.w.add('IFCCARTESIANPOINT', reals([centreX, 0]))
  const position = c.w.add('IFCAXIS2PLACEMENT2D', ref(centre), ref(c.shared.east2))
  return c.w.add(
    'IFCRECTANGLEPROFILEDEF',
    en('AREA'),
    NULL,
    ref(position),
    real(width),
    real(depth)
  )
}

/** The profile swept `height` along +Z, from the origin of the element's own frame. */
function extrusion(c: Context, profile: number, height: number): number {
  return c.w.add(
    'IFCEXTRUDEDAREASOLID',
    ref(profile),
    ref(c.shared.identity),
    ref(c.shared.up),
    real(height)
  )
}

function bodyRepresentation(c: Context, solid: number): number {
  return c.w.add(
    'IFCSHAPEREPRESENTATION',
    ref(c.shared.bodyContext),
    str('Body'),
    str('SweptSolid'),
    refs([solid])
  )
}

const productShape = (c: Context, representations: readonly number[]): number =>
  c.w.add('IFCPRODUCTDEFINITIONSHAPE', NULL, NULL, refs(representations))

/**
 * A relationship needs a GlobalId of its own. They are keyed by what they
 * relate, so they stay as stable as the elements do.
 */
function relate(c: Context, type: string, key: string, ...rest: readonly string[]): number {
  return c.w.add(type, str(c.guid(type, key)), ref(c.owner), NULL, NULL, ...rest)
}

interface WallElement {
  readonly id: number
  readonly placement: number
  readonly wall: Wall
  readonly length: number
}

/**
 * A wall as IfcWallStandardCase: placed at `wall.start` with local X along the
 * axis, an `Axis` polyline from 0 to the length, and a `Body` that is the
 * rectangle (length x thickness) extruded `height`. The rectangle is centred on
 * the axis, which is C1: thickness grows symmetrically from the reference line.
 * Where the wall meets others its corners are joined as in the 2D and 3D views
 * (SHT-2): the body is then the outline with each face running to the joint, an
 * IfcArbitraryClosedProfileDef whose two long sides stay parallel to the axis.
 *
 * Everything that can throw (`wallAxis` on a zero-length wall) is computed
 * before the first entity is written, so a failure leaves no dangling entity.
 */
function writeWall(c: Context, storey: Storey, wall: Wall, ends: WallEnds | undefined): WallElement {
  const axis = wallAxis(wall)
  const { w } = c

  const wallPlacement = placement(
    w,
    storey.placement,
    [axis.start.x, axis.start.y, 0],
    [axis.dir.x, axis.dir.y, 0]
  )

  const from = w.add('IFCCARTESIANPOINT', reals([0, 0]))
  const to = w.add('IFCCARTESIANPOINT', reals([axis.length, 0]))
  const line = w.add('IFCPOLYLINE', refs([from, to]))
  const axisRepresentation = w.add(
    'IFCSHAPEREPRESENTATION',
    ref(c.shared.axisContext),
    str('Axis'),
    str('Curve2D'),
    refs([line])
  )

  const half = wall.thickness / 2
  // Local Y is the wall's normal, its left face.
  const profile =
    ends === undefined
      ? rectangleProfile(c, axis.length, wall.thickness, axis.length / 2)
      : footprintProfile(c, {
          outline: [
            { x: -ends.start.right, y: -half },
            { x: axis.length + ends.end.right, y: -half },
            { x: axis.length + ends.end.left, y: half },
            { x: -ends.start.left, y: half }
          ],
          holes: []
        })
  const body = bodyRepresentation(c, extrusion(c, profile, wall.height))
  const shape = productShape(c, [axisRepresentation, body])

  const id = w.add(
    'IFCWALLSTANDARDCASE',
    str(c.guid('wall', wall.id)),
    ref(c.owner),
    str(wall.id),
    NULL,
    NULL,
    ref(wallPlacement),
    ref(shape),
    NULL
  )

  writeWallProperties(c, wall, id, wallExposure(storey.model.index, wall.id) === 'exterior')
  associateWallMaterial(c, wall, id)
  return { id, placement: wallPlacement, wall, length: axis.length }
}

/**
 * IFC2x3 requires every IfcWallStandardCase to be associated with exactly one
 * IfcMaterialLayerSetUsage (its WR1), so each wall gets one: a single layer as
 * thick as the wall, in a set named after that thickness. The usage runs along
 * local Y (across the wall) with an offset of -thickness/2, which centres the
 * layer on the axis, the same band the Body profile covers (C1).
 *
 * One material, and one layer set and usage per distinct thickness, shared by
 * the walls that have it. They are created on first use and the association
 * relations are written once at the end, so nothing is written for a plan with
 * no walls.
 */
function associateWallMaterial(c: Context, wall: Wall, element: number): void {
  const { w, materials } = c
  const key = real(wall.thickness)

  let entry = materials.byThickness.get(key)
  if (!entry) {
    materials.material ??= w.add('IFCMATERIAL', str('Wall'))
    const layer = w.add(
      'IFCMATERIALLAYER',
      ref(materials.material),
      real(wall.thickness),
      NULL
    )
    const set = w.add(
      'IFCMATERIALLAYERSET',
      refs([layer]),
      str(`Wall ${key.replace(/\.$/, '')} m`)
    )
    const usage = w.add(
      'IFCMATERIALLAYERSETUSAGE',
      ref(set),
      en('AXIS2'),
      en('POSITIVE'),
      real(-wall.thickness / 2)
    )
    entry = { usage, walls: [] }
    materials.byThickness.set(key, entry)
  }
  entry.walls.push(element)
}

function writeWallMaterialAssociations(c: Context): void {
  for (const [key, { usage, walls }] of c.materials.byThickness) {
    relate(c, 'IFCRELASSOCIATESMATERIAL', key, refs(walls), ref(usage))
  }
}

/**
 * `IsExternal` is the answer the drawing and the DXF give (`wallExposure`, MSG-13): worked out
 * from the rooms on the wall's sides, and true for any wall stated `exterior`. A wall that faces
 * outside for part of its length is external. Thickness decides nothing.
 */
function writeWallProperties(c: Context, wall: Wall, element: number, outside: boolean): void {
  const external = c.w.add(
    'IFCPROPERTYSINGLEVALUE',
    str('IsExternal'),
    NULL,
    `IFCBOOLEAN(${en(outside ? 'T' : 'F')})`,
    NULL
  )
  const set = c.w.add(
    'IFCPROPERTYSET',
    str(c.guid('pset', wall.id)),
    ref(c.owner),
    str('Pset_WallCommon'),
    NULL,
    refs([external])
  )
  relate(c, 'IFCRELDEFINESBYPROPERTIES', wall.id, refs([element]), ref(set))
}

/**
 * How far the void overshoots each face of its wall. Cutting exactly to the
 * faces leaves coincident surfaces, which a boolean leaves as a zero-thickness
 * skin; 1 cm each side makes the cut clean through both faces.
 */
const VOID_CLEARANCE = 0.01

/**
 * Depth of a door or window leaf. IFC has no "frame and glazing" without a
 * library of profiles; a thin box centred in the wall is enough for a viewer
 * that draws only filled geometry to show that something sits in the cut.
 */
const LEAF_DEPTH = 0.05

type DoorOperation = 'SINGLE_SWING_LEFT' | 'SINGLE_SWING_RIGHT'

/**
 * IFC's handing for a door that states both values, or null.
 *
 * IFC names the hinge side as seen looking the way the door opens (its local +y). Unturned,
 * local x runs from `wall.start`, so `start` is on the left; a door opening to the right face
 * is turned, which puts `start` on its right.
 */
function doorOperation(opening: Opening): DoorOperation | null {
  if (opening.hinge === undefined || opening.swing === undefined) return null
  const hingeOnLeft = (opening.hinge === 'start') === (opening.swing === 'left')
  return hingeOnLeft ? 'SINGLE_SWING_LEFT' : 'SINGLE_SWING_RIGHT'
}

const DOOR_STYLE_NAMES: Record<DoorOperation, string> = {
  SINGLE_SWING_LEFT: 'Single swing, left',
  SINGLE_SWING_RIGHT: 'Single swing, right'
}

/**
 * One shared IfcDoorStyle per handing, with the doors it types. Shared, because a BIM tool
 * makes one door type per style; a door that doesn't state its swing stays untyped.
 */
function writeDoorStyles(c: Context): void {
  for (const operation of ['SINGLE_SWING_LEFT', 'SINGLE_SWING_RIGHT'] as const) {
    const doors = c.doorsByOperation.get(operation)
    if (!doors || doors.length === 0) continue
    // IfcDoorStyle: GlobalId, OwnerHistory, Name, Description, ApplicableOccurrence,
    // HasPropertySets, RepresentationMaps, Tag, OperationType, ConstructionType,
    // ParameterTakesPrecedence, Sizeable.
    const style = c.w.add(
      'IFCDOORSTYLE',
      str(c.guid('door-style', operation)),
      ref(c.owner),
      str(DOOR_STYLE_NAMES[operation]),
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      en(operation),
      en('NOTDEFINED'),
      '.F.',
      '.T.'
    )
    relate(c, 'IFCRELDEFINESBYTYPE', operation, refs(doors), ref(style))
  }
}

/**
 * An opening as a void in its wall, plus, for a door or a window, the element
 * that fills it. Returns the filler (to be contained in the storey), if any.
 *
 * The void is placed relative to its wall at (offset, 0, sill): C2 makes
 * `offset` the near edge along the axis, so its rectangle (width x thickness)
 * starts at the placement and is centred on the axis across it. The filler is
 * placed relative to the void, so moving one moves the other.
 */
function writeOpening(c: Context, element: WallElement, opening: Opening): number | null {
  const { w } = c
  const { wall } = element

  const voidPlacement = w.add(
    'IFCLOCALPLACEMENT',
    ref(element.placement),
    ref(
      w.add(
        'IFCAXIS2PLACEMENT3D',
        ref(w.add('IFCCARTESIANPOINT', reals([opening.offset, 0, opening.sill]))),
        NULL,
        NULL
      )
    )
  )

  const cut = rectangleProfile(
    c,
    opening.width,
    wall.thickness + 2 * VOID_CLEARANCE,
    opening.width / 2
  )
  const voidShape = productShape(c, [
    bodyRepresentation(c, extrusion(c, cut, opening.height))
  ])

  const hole = w.add(
    'IFCOPENINGELEMENT',
    str(c.guid('opening', opening.id)),
    ref(c.owner),
    str(opening.id),
    NULL,
    NULL,
    ref(voidPlacement),
    ref(voidShape),
    NULL
  )
  relate(c, 'IFCRELVOIDSELEMENT', opening.id, ref(element.id), ref(hole))

  // A plain opening only cuts the wall.
  if (opening.type === 'opening') return null

  // IFC opens a door toward its own +y, with a LEFT door's hinge at local x = 0. A door
  // that opens to the wall's right face is turned half a turn about z, from its far end, so
  // it opens that way and still fills the same span.
  const operation = opening.type === 'door' ? doorOperation(opening) : null
  const turned = operation !== null && opening.swing === 'right'
  const fillerPlacement = turned
    ? placement(w, voidPlacement, [opening.width, 0, 0], [-1, 0, 0])
    : placement(w, voidPlacement, [0, 0, 0])
  const leaf = rectangleProfile(c, opening.width, LEAF_DEPTH, opening.width / 2)
  const fillerShape = productShape(c, [bodyRepresentation(c, extrusion(c, leaf, opening.height))])

  const filler = w.add(
    opening.type === 'door' ? 'IFCDOOR' : 'IFCWINDOW',
    str(c.guid(opening.type, opening.id)),
    ref(c.owner),
    str(opening.id),
    NULL,
    NULL,
    ref(fillerPlacement),
    ref(fillerShape),
    NULL,
    real(opening.height),
    real(opening.width)
  )
  relate(c, 'IFCRELFILLSELEMENT', opening.id, ref(hole), ref(filler))
  if (operation !== null) {
    const doors = c.doorsByOperation.get(operation)
    if (doors) doors.push(filler)
    else c.doorsByOperation.set(operation, [filler])
  }
  return filler
}

/**
 * A room as an IfcSpace: its footprint is the polygon from the inner faces of
 * its walls (C3), counter-clockwise, less its holes (ARE-6), extruded to the
 * storey height. Virtual walls still close the outline through their faces, so
 * an open-plan room keeps its area although no wall element stands there.
 * Returns null for a room whose boundary does not close.
 *
 * A room set off its storey (LVL-7) stands at its `floorOffset` and still reaches the storey's
 * ceiling, so a genkan or a stage is a space at its own level, not at the storey's.
 */
function writeSpace(c: Context, storey: Storey, room: Room): number | null {
  const footprint = roomFootprint(storey, room)
  if (!footprint) return null
  const { w } = c

  const offset = roomFloorOffset(room)
  // A room raised to the ceiling or past it (asked about by the checks) keeps the storey's height.
  const height = storey.height - offset > 0 ? storey.height - offset : storey.height
  const spacePlacement = placement(w, storey.placement, [0, 0, offset])
  const profile = footprintProfile(c, footprint)
  const shape = productShape(c, [
    bodyRepresentation(c, extrusion(c, profile, height))
  ])

  return w.add(
    'IFCSPACE',
    str(c.guid('space', room.id)),
    ref(c.owner),
    str(room.name),
    NULL,
    NULL,
    ref(spacePlacement),
    ref(shape),
    str(room.name),
    en('ELEMENT'),
    en('INTERNAL'),
    NULL
  )
}

type Ring = readonly { readonly x: number; readonly y: number }[]

/** A room's outline, counter-clockwise, and its holes (ARE-6), clockwise. */
interface Footprint {
  readonly outline: Ring
  readonly holes: readonly Ring[]
}

/**
 * A room's footprint: the polygon from the inner faces of its walls (C3),
 * counter-clockwise, with its holes, the ones the 3D view's slab has too. Null
 * when the boundary does not close or a corner is not a number.
 */
function roomFootprint(storey: Storey, room: Room): Footprint | null {
  const shape = tryRoomShape(room, storey.model.index)
  if (!shape) return null
  const finite = (ring: Ring): boolean => ring.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
  if (!finite(shape.polygon) || !shape.holes.every(finite)) return null
  return { outline: shape.polygon, holes: shape.holes }
}

/**
 * A footprint as a closed profile: with its holes as voids when it has any. A closed polyline
 * repeats its first point.
 */
function footprintProfile(c: Context, footprint: Footprint): number {
  const curve = (ring: Ring): number =>
    c.w.add('IFCPOLYLINE', refs([...ring, ring[0]!].map((p) => c.w.add('IFCCARTESIANPOINT', reals([p.x, p.y])))))
  const outer = curve(footprint.outline)
  if (footprint.holes.length === 0) return c.w.add('IFCARBITRARYCLOSEDPROFILEDEF', en('AREA'), NULL, ref(outer))
  const inner = footprint.holes.map(curve)
  return c.w.add('IFCARBITRARYPROFILEDEFWITHVOIDS', en('AREA'), NULL, ref(outer), refs(inner))
}

type SlabKind = 'FLOOR' | 'BASESLAB' | 'ROOF'

/**
 * How thick a ceiling is drawn. IFC has no ceiling without a body; a thin board over the room,
 * its underside at the ceiling's height, is enough for a viewer to show it. Not a figure of the
 * building: the plan states no ceiling build-up.
 */
const CEILING_DEPTH = 0.02

/** An outline's pieces, each extruded `thickness` up from the element's placement, as one body. */
function piecesShape(c: Context, pieces: MultiPolygon, thickness: number): number | null {
  const solids = piecesAsRings(pieces)
    .filter((piece) => piece.outline.length >= 3)
    .map((piece) => extrusion(c, footprintProfile(c, piece), thickness))
  if (solids.length === 0) return null
  return productShape(c, [
    c.w.add('IFCSHAPEREPRESENTATION', ref(c.shared.bodyContext), str('Body'), str('SweptSolid'), refs(solids))
  ])
}

/** An IfcSlab over `pieces`, extruded `thickness` up from `bottom` (relative to its storey). */
function writeSlab(
  c: Context,
  storey: Storey,
  key: readonly [string, string],
  name: string,
  pieces: MultiPolygon,
  kind: SlabKind,
  bottom: number,
  thickness: number,
  parent: number = storey.placement
): { id: number; placement: number } | null {
  if (!(thickness > 0) || pieces.length === 0) return null
  const slabPlacement = placement(c.w, parent, [0, 0, bottom])
  const shape = piecesShape(c, pieces, thickness)
  if (shape === null) return null
  const id = c.w.add('IFCSLAB', str(c.guid(key[0], key[1])), ref(c.owner), str(name), NULL, NULL, ref(slabPlacement), ref(shape), NULL, en(kind))
  return { id, placement: slabPlacement }
}

const footprintPieces = (footprint: Footprint): MultiPolygon => [[ringOf(footprint.outline), ...footprint.holes.map(ringOf)]]

/**
 * Every storey's slab, its openings, the roof over its parts with nothing above, its parapet and
 * its rooms' ceilings (LVL-4), from the floor's outline (`planEnvelope`):
 *
 * - one IfcSlab per floor, the one it stands on, over the whole outline, walls and all: a base
 *   slab on the lowest level. Each stair, lift shaft and void that opens it is an
 *   IfcOpeningElement voiding it, as a door voids a wall. A room set below its storey (LVL-7) is
 *   cut out of it and gets a slab of its own, lower down; a room set above it gets a slab from the
 *   storey's floor up to its own.
 * - an IfcRoof (a flat roof) aggregating an IfcSlab `ROOF` over every part with nothing above, on
 *   the floor's walls, and, with a parapet stated, an IfcWall `Parapet` along its edge.
 * - an IfcCovering `CEILING` for each room that states a ceiling, and one for each lowered zone.
 *
 * Written after everything else, in a containment relation of their own per storey, so the walls,
 * openings and spaces keep the entities they always had.
 */
function writeSlabs(building: Context, plan: FloorPlan, storeys: readonly Storey[]): void {
  if (storeys.length === 0) return
  const floors = new Map(storeys.map((storey) => [storey.model.floor.id, { floorLevel: storey.elevation, clearHeight: storey.height }] as const))
  let envelope: ReturnType<typeof planEnvelope>
  try {
    envelope = planEnvelope(plan, { elevations: { floors, roof: roofOver(floors) } })
  } catch {
    return
  }
  const byFloor = new Map(envelope.floors.map((f) => [f.floor, f] as const))

  for (const storey of storeys) {
    const { index, broken, floor } = storey.model
    const c = onFloor(building, floor.id)
    const contained: number[] = []
    const env = byFloor.get(floor.id)
    const roomNames = new Map(index.plan.rooms.map((room) => [room.id, room.name || room.id] as const))

    try {
      const slab = env?.slab ?? null
      if (slab !== null) {
        const kind: SlabKind = slab.kind === 'base' ? 'BASESLAB' : 'FLOOR'
        const written = writeSlab(c, storey, ['floor-slab', floor.id], `${floor.name} slab`, slab.body, kind, -slab.thickness, slab.thickness)
        if (written !== null) {
          contained.push(written.id)
          for (const opening of slab.openings) {
            const shape = piecesShape(c, opening.pieces, slab.thickness + 2 * VOID_CLEARANCE)
            if (shape === null) continue
            const over = opening.room === null ? opening.via : roomNames.get(opening.room) ?? opening.room
            const hole = c.w.add(
              'IFCOPENINGELEMENT',
              str(c.guid('slab-opening', `${opening.kind}:${opening.via}`)),
              ref(c.owner),
              str(`Opening over ${over}`),
              NULL,
              str(opening.kind === 'void' ? 'Void' : opening.kind === 'lift' ? 'Lift shaft' : 'Stair'),
              ref(placement(c.w, written.placement, [0, 0, -VOID_CLEARANCE])),
              ref(shape),
              NULL
            )
            relate(c, 'IFCRELVOIDSELEMENT', `slab:${floor.id}:${opening.kind}:${opening.via}`, ref(written.id), ref(hole))
          }
        }
        // LVL-7: a room set below its storey stands on a slab of its own, lower down.
        for (const sunk of slab.sunken) {
          const piece = writeSlab(c, storey, ['slab', sunk.room], `${roomNames.get(sunk.room) ?? sunk.room} floor slab`, sunk.pieces, kind, sunk.offset - slab.thickness, slab.thickness)
          if (piece !== null) contained.push(piece.id)
        }
      }
    } catch {
      // A slab that cannot be built is left out; the rest still exports.
    }

    // LVL-7: a room set above its storey stands on a slab from the storey's floor up to its own.
    for (const room of index.plan.rooms) {
      // A zone's floor is its room's slab (CNT-8).
      if (broken.has(room.id) || roomZones(index).zoneOf.has(room.id)) continue
      const offset = roomFloorOffset(room)
      if (!(offset > tolerance('sameFloorLevel'))) continue
      try {
        const footprint = roomFootprint(storey, room)
        if (!footprint) continue
        const raised = writeSlab(c, storey, ['slab', room.id], `${room.name} floor slab`, footprintPieces(footprint), 'FLOOR', 0, offset)
        if (raised !== null) contained.push(raised.id)
      } catch {
        // A room that cannot be built is left out.
      }
    }

    try {
      const roof = env?.roof ?? null
      if (roof !== null) {
        const bottom = roof.bottom - storey.elevation
        const element = c.w.add(
          'IFCROOF',
          str(c.guid('roof-element', floor.id)),
          ref(c.owner),
          str(`${floor.name} roof`),
          NULL,
          NULL,
          ref(placement(c.w, storey.placement, [0, 0, 0])),
          NULL,
          NULL,
          en('FLAT_ROOF')
        )
        const slab = writeSlab(c, storey, ['roof-slab', floor.id], `${floor.name} roof slab`, roof.pieces, 'ROOF', bottom, roof.thickness)
        if (slab !== null) aggregate(c, `roof:${floor.id}`, element, [slab.id])
        contained.push(element)
        if (roof.parapet !== null) {
          const shape = piecesShape(c, roof.parapet.pieces, roof.parapet.height)
          if (shape !== null) {
            contained.push(
              c.w.add(
                'IFCWALL',
                str(c.guid('parapet', floor.id)),
                ref(c.owner),
                str(`${floor.name} parapet`),
                NULL,
                str('Parapet'),
                ref(placement(c.w, storey.placement, [0, 0, bottom + roof.thickness])),
                ref(shape),
                NULL
              )
            )
          }
        }
      }
    } catch {
      // A roof that cannot be built is left out.
    }

    // The rooms' ceilings, each covering its space. A zone has none of its own (CNT-8, `roomCeiling`).
    for (const room of index.plan.rooms) {
      if (broken.has(room.id) || room.ceiling === undefined) continue
      try {
        const pieces = roomCeiling(room, index, storey.height) ?? []
        const coverings: number[] = []
        const offset = roomFloorOffset(room)
        for (const piece of pieces) {
          const shape = piecesShape(c, piece.pieces, CEILING_DEPTH)
          if (shape === null) continue
          coverings.push(
            c.w.add(
              'IFCCOVERING',
              str(c.guid('ceiling', `${room.id}:${piece.zone ?? ''}`)),
              ref(c.owner),
              str(piece.zone === null ? `${room.name} ceiling` : `${room.name} ceiling, lowered zone ${piece.zone}`),
              NULL,
              NULL,
              ref(placement(c.w, storey.placement, [0, 0, offset + piece.height])),
              ref(shape),
              NULL,
              en('CEILING')
            )
          )
        }
        if (coverings.length === 0) continue
        contained.push(...coverings)
        const space = storey.spaces.get(room.id)
        if (space !== undefined) relate(c, 'IFCRELCOVERSSPACES', `ceiling:${room.id}`, ref(space), refs(coverings))
      } catch {
        // A ceiling that cannot be built is left out.
      }
    }

    if (contained.length > 0) {
      relate(c, 'IFCRELCONTAINEDINSPATIALSTRUCTURE', `slabs:${floor.id}`, refs(contained), ref(storey.id))
    }
  }
}

/**
 * The stairs the plan states (LVL-3), each as an IfcStair in the storey it rises from, made of
 * an IfcStairFlight per flight, with its number of risers and treads, the riser height and the
 * tread length Grid worked out, and a landing slab per turn. Each part is the block the 3D view
 * draws (`stairBlocks`): solid from the stair's foot to the riser it tops.
 *
 * Written last, after the slabs, so a plan that states no stairs gets the file it always did.
 */
function writeStairs(building: Context, plan: FloorPlan, storeys: readonly Storey[]): void {
  if ((plan.stairs ?? []).length === 0) return
  const byFloor = new Map(storeys.map((storey) => [storey.model.floor.id, storey] as const))
  const contained = new Map<string, number[]>()
  for (const stair of planStairs(plan, brokenOnFloor).stairs) {
    const storey = byFloor.get(stair.lower.floor)
    if (storey === undefined) continue
    try {
      const id = writeStair(onFloor(building, stair.lower.floor), storey, stair)
      contained.set(stair.lower.floor, [...(contained.get(stair.lower.floor) ?? []), id])
    } catch {
      // A stair that cannot be built is left out.
    }
  }
  for (const [floor, ids] of contained) {
    relate(onFloor(building, floor), 'IFCRELCONTAINEDINSPATIALSTRUCTURE', `stairs:${floor}`, refs(ids), ref(byFloor.get(floor)!.id))
  }
}

function writeStair(c: Context, storey: Storey, stair: StairLayout): number {
  // The blocks stand on the stair's foot, measured from the storey's level, as in 3D.
  const blocks = stairBlocks(stair, storey.elevation).blocks
  const base = blocks[0]?.bottom ?? 0
  const at = placement(c.w, storey.placement, [0, 0, base])
  const body = (outlines: readonly { readonly outline: Footprint['outline']; readonly height: number }[]): number =>
    productShape(c, [
      c.w.add(
        'IFCSHAPEREPRESENTATION',
        ref(c.shared.bodyContext),
        str('Body'),
        str('SweptSolid'),
        refs(outlines.map(({ outline, height }) => extrusion(c, footprintProfile(c, { outline, holes: [] }), height)))
      )
    ])
  const element = c.w.add(
    'IFCSTAIR',
    str(c.guid('stair', stair.id)),
    ref(c.owner),
    str(stair.name),
    NULL,
    NULL,
    ref(at),
    NULL,
    NULL,
    en(stair.flights.length === 1 ? 'STRAIGHT_RUN_STAIR' : 'NOTDEFINED')
  )
  const parts: number[] = []
  let block = 0
  stair.flights.forEach((flight, i) => {
    const treads = flight.risers - 1
    const steps = blocks.slice(block, block + treads).map((b) => ({ outline: b.outline, height: b.top - b.bottom }))
    block += treads
    parts.push(
      c.w.add(
        'IFCSTAIRFLIGHT',
        str(c.guid('stair-flight', `${stair.id}:${i}`)),
        ref(c.owner),
        str(`${stair.name} flight ${i + 1}`),
        NULL,
        NULL,
        ref(placement(c.w, at, [0, 0, 0])),
        ref(body(steps)),
        NULL,
        int(flight.risers),
        int(treads),
        real(stair.riserHeight),
        real(flight.going)
      )
    )
  })
  stair.landings.forEach((_, i) => {
    const landing = blocks[block + i]!
    parts.push(
      c.w.add(
        'IFCSLAB',
        str(c.guid('stair-landing', `${stair.id}:${i}`)),
        ref(c.owner),
        str(`${stair.name} landing ${i + 1}`),
        NULL,
        NULL,
        ref(placement(c.w, at, [0, 0, 0])),
        ref(body([{ outline: landing.outline, height: landing.top - landing.bottom }])),
        NULL,
        en('LANDING')
      )
    )
  })
  aggregate(c, `stair:${stair.id}`, element, parts)
  return element
}

/** Writes everything a floor holds, and links it to its storey. */
function writeStoreyContents(building: Context, storey: Storey): void {
  const { index, broken } = storey.model
  const c = onFloor(building, storey.model.floor.id)
  const contained: number[] = []
  const joints = wallJoints(storey.model.walls)

  for (const wall of storey.model.walls) {
    let element: WallElement
    try {
      element = writeWall(c, storey, wall, joints.get(wall.id))
    } catch {
      // A wall that cannot be built is left out; the rest still exports.
      continue
    }
    contained.push(element.id)

    for (const opening of openingsOf(index, wall.id)) {
      if (broken.has(opening.id)) continue
      try {
        const filler = writeOpening(c, element, opening)
        if (filler !== null) contained.push(filler)
      } catch {
        // Likewise: one bad opening does not cost the wall its others.
      }
    }
  }

  if (contained.length > 0) {
    relate(
      c,
      'IFCRELCONTAINEDINSPATIALSTRUCTURE',
      storey.model.floor.id,
      refs(contained),
      ref(storey.id)
    )
  }

  const spaces: number[] = []
  for (const room of index.plan.rooms) {
    // A zone (CNT-8) is no space of its own: its floor is in its room's space, counted once.
    if (broken.has(room.id) || roomZones(index).zoneOf.has(room.id)) continue
    try {
      const space = writeSpace(c, storey, room)
      if (space !== null) {
        spaces.push(space)
        storey.spaces.set(room.id, space)
      }
    } catch {
      // A room that cannot be built is left out.
    }
  }
  // Spaces are aggregated under their storey, not contained in it.
  aggregate(c, `spaces:${storey.model.floor.id}`, storey.id, spaces)
}

/**
 * CNT-12: every storey's fixtures, each an IfcFurnishingElement and never a wall: placed at its
 * middle, turned as the plan turns it, and its footprint extruded to its height from the floor of
 * the room it stands in. `ObjectType` is its kind and `Tag` its id. Written after everything else,
 * in a containment relation of their own per storey, so a plan with no fixtures writes the same
 * file as before.
 */
function writeItems(building: Context, storeys: readonly Storey[]): void {
  for (const storey of storeys) {
    const { index, broken, floor } = storey.model
    const items = (index.plan.items ?? []).filter((item) => !broken.has(item.id) && isItemKind(item.kind))
    if (items.length === 0) continue
    const c = onFloor(building, floor.id)
    const rooms = roomShapes(index, broken)
    const written: number[] = []
    for (const item of items) {
      try {
        const room = itemRoom(item, rooms)
        const turn = ((item.turn ?? 0) * Math.PI) / 180
        const along: Triple = [Math.cos(turn), Math.sin(turn), 0]
        const itemPlacement = placement(c.w, storey.placement, [item.at[0], item.at[1], room === null ? 0 : roomFloorOffset(room)], along)
        const body = bodyRepresentation(c, extrusion(c, rectangleProfile(c, item.size[0], item.size[1], 0), item.height))
        const kind = isItemKind(item.kind) ? ITEM_KIND_WORDS[item.kind] : item.kind
        written.push(
          c.w.add(
            'IFCFURNISHINGELEMENT',
            str(c.guid('item', item.id)),
            ref(c.owner),
            str(item.label ?? kind),
            NULL,
            str(item.kind),
            ref(itemPlacement),
            ref(productShape(c, [body])),
            str(item.id)
          )
        )
      } catch {
        // A fixture that cannot be built is left out.
      }
    }
    if (written.length > 0) {
      relate(c, 'IFCRELCONTAINEDINSPATIALSTRUCTURE', `items:${floor.id}`, refs(written), ref(storey.id))
    }
  }
}

/** The property names of `Grid_LeftOut`, by kind: a count and the names. */
const LEFT_OUT_PROPERTIES: Readonly<Record<LeftOutKind, readonly [string, string]>> = {
  wall: ['Walls', 'WallIds'],
  room: ['Rooms', 'RoomIds'],
  opening: ['Openings', 'OpeningIds'],
  item: ['Fixtures', 'FixtureIds'],
  stair: ['Stairs', 'StairIds'],
  floor: ['Floors', 'FloorIds']
}

/**
 * HND-6: what the file leaves out of the plan, as a property set on the building, the place a BIM
 * tool shows for the whole model. `Parts` is how many, `Note` says so in words, and each kind
 * has its count and its ids (JSON strings, then a STEP string like every other text here). The
 * set's name is Grid's own: `Pset_` names are the standard's. Written last, so that a file that
 * leaves nothing out is as it was.
 */
function writeLeftOut(c: Context, building: number, leftOut: readonly LeftOutPart[]): void {
  if (leftOut.length === 0) return
  const value = (name: string, nominal: string): number => c.w.add('IFCPROPERTYSINGLEVALUE', str(name), NULL, nominal, NULL)
  const properties = [
    value('Parts', `IFCINTEGER(${int(leftOut.length)})`),
    value('Note', `IFCTEXT(${str(leftOutSummary(leftOut))})`)
  ]
  for (const { kind, parts } of leftOutByKind(leftOut)) {
    const [count, ids] = LEFT_OUT_PROPERTIES[kind]
    properties.push(value(count, `IFCINTEGER(${int(parts.length)})`), value(ids, `IFCTEXT(${str(partNames(parts).join(', '))})`))
  }
  const set = c.w.add(
    'IFCPROPERTYSET',
    str(c.guid('left-out', 'set')),
    ref(c.owner),
    str('Grid_LeftOut'),
    str('Parts of the plan Grid left out of this file'),
    refs(properties)
  )
  c.w.add('IFCRELDEFINESBYPROPERTIES', str(c.guid('left-out', 'relation')), ref(c.owner), NULL, NULL, refs([building]), ref(set))
}

/** CNT-3: where the plan says it sits: only with an origin, and when every number of it can be written. */
function siteOf(plan: FloorPlan): (NonNullable<FloorPlan['site']> & { readonly origin: readonly [number, number] }) | null {
  const site = plan.site
  if (site === undefined || site.origin === undefined) return null
  const numbers = [...site.origin, site.latitude ?? 0, site.longitude ?? 0, site.elevation ?? 0]
  return numbers.every(Number.isFinite) ? { ...site, origin: site.origin } : null
}

/**
 * Degrees as IFC2x3's compound plane angle: degrees, minutes, seconds and millionths of a
 * second, each with the angle's sign.
 */
function compoundAngle(degrees: number): string {
  const sign = degrees < 0 ? -1 : 1
  const micro = Math.round(Math.abs(degrees) * 3600 * 1_000_000)
  const parts = [Math.floor(micro / 3_600_000_000), Math.floor(micro / 60_000_000) % 60, Math.floor(micro / 1_000_000) % 60, micro % 1_000_000]
  return `(${parts.map((part) => int(sign * part + 0)).join(',')})`
}

/** The id the plan stores (QAR-5), else the caller's, else the default. */
function projectIdOf(plan: FloorPlan, options: IfcOptions): string {
  const stored: unknown = plan.projectId
  if (typeof stored === 'string' && stored !== '') return stored
  return options.projectId ?? IFC_DEFAULT_PROJECT_ID
}

function buildDocument(given: FloorPlan, options: IfcOptions): string {
  const timestamp = usableTimestamp(options.timestamp)
  const projectName = options.projectName ?? DEFAULT_PROJECT_NAME
  // QAR-5: the parts in id order, so the file does not hang on the order they are listed in.
  const plan = inIdOrder(given)

  const w = new StepWriter()
  const issuer = createGuidIssuer(projectIdOf(plan, options))
  const owner = writeOwnerHistory(w, timestamp)
  const units = writeUnits(w)
  const { model: context, shared } = writeModelContext(w, planOrientation(plan).north)
  const c: Context = {
    w,
    owner,
    shared,
    materials: { material: null, byThickness: new Map() },
    doorsByOperation: new Map(),
    guid: (kind, id) => issuer.issue(kind, id),
    issuer
  }

  // The fixed entities (project, site, building) use their own kind as the id.
  const rooted = (
    type: string,
    kind: string,
    id: string,
    name: string,
    ...rest: readonly string[]
  ): number => w.add(type, str(c.guid(kind, id)), ref(owner), str(name), ...rest)

  const project = rooted(
    'IFCPROJECT',
    'project',
    'project',
    projectName,
    // MSG-3: the label as the project's description, which a viewer shows with its name.
    str(GENERAL_GUIDANCE_LABEL),
    NULL,
    NULL,
    NULL,
    refs([context]),
    ref(units)
  )

  // CNT-3: a plan that says where it sits puts the site's origin on that point of the plan, with
  // its latitude, longitude and elevation; the building stays in the plan's own coordinates.
  const where = siteOf(plan)
  const sitePlacement = placement(w, null, where === null ? [0, 0, 0] : [where.origin[0], where.origin[1], 0])
  const site = rooted(
    'IFCSITE',
    'site',
    'site',
    'Site',
    NULL,
    NULL,
    ref(sitePlacement),
    NULL,
    NULL,
    en('ELEMENT'),
    where?.latitude === undefined ? NULL : compoundAngle(where.latitude),
    where?.longitude === undefined ? NULL : compoundAngle(where.longitude),
    where?.elevation === undefined ? NULL : real(where.elevation),
    NULL,
    NULL
  )

  const buildingPlacement = placement(w, sitePlacement, where === null ? [0, 0, 0] : [-where.origin[0], -where.origin[1], 0])
  const building = rooted(
    'IFCBUILDING',
    'building',
    'building',
    'Building',
    NULL,
    NULL,
    ref(buildingPlacement),
    NULL,
    NULL,
    en('ELEMENT'),
    NULL,
    NULL,
    NULL
  )

  const models = planFloors(plan).map((floor) => analyseFloor(plan, floor))
  const levels = deriveLevels(models)
  const storeys = models.map((model) =>
    writeStorey(c, buildingPlacement, model, levels.get(model.floor.id)!)
  )
  for (const storey of storeys) writeStoreyContents(c, storey)
  writeWallMaterialAssociations(c)
  writeDoorStyles(c)

  aggregate(c, 'project', project, [site])
  aggregate(c, 'site', site, [building])
  aggregate(
    c,
    'building',
    building,
    storeys.map((storey) => storey.id)
  )
  writeSlabs(c, plan, storeys)
  writeItems(c, storeys)
  writeStairs(c, plan, storeys)
  writeLeftOut(c, building, options.leftOut ?? [])

  return w.toString([
    // MSG-3: the label beside the view definition, in the header every reader parses first.
    `FILE_DESCRIPTION((${str('ViewDefinition [CoordinationView_V2.0]')},${str(GENERAL_GUIDANCE_LABEL)}),${str('2;1')});`,
    // FILE_NAME(name, time_stamp, author, organization, preprocessor, system, authorization)
    // Author and organisation stay empty: no personal data goes into the file.
    `FILE_NAME(${str(projectName)},${str(isoSeconds(timestamp))},(${str('')}),(${str('')}),` +
      `${str('Grid')},${str('Grid')},${str('')});`,
    `FILE_SCHEMA((${str('IFC2X3')}));`
  ])
}

/**
 * The plan as an IFC2x3 document.
 *
 * Pure and total: it never throws, never reads the clock or the filesystem, and
 * the same plan, project identity and timestamp give byte-identical output,
 * whatever order the plan lists its walls, rooms and openings in (QAR-5).
 * Lines end in LF: ISO 10303-21 accepts any line terminator, and LF keeps the
 * bytes identical wherever the string is written.
 */
export function toIfc(plan: FloorPlan, options: IfcOptions = {}): string {
  try {
    return buildDocument(plan, options)
  } catch {
    // Whatever the plan did to the exporter, the caller still gets a valid
    // document: the empty one, under the project's own identity when it can be read.
    let projectId = options.projectId
    try {
      projectId = projectIdOf(plan, options)
    } catch {
      // Left as the caller's.
    }
    return buildDocument({ version: '1', units: 'm', walls: [], rooms: [], openings: [] }, { ...options, projectId })
  }
}
