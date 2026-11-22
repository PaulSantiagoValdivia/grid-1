// What Grid can do, asked of Grid itself. Counts 3 and 5 (turns answered, checks the plan can
// feed) are built on these: a turn or a check counts once everything it needs is here.
//
// There are three kinds of probe:
// - `lib`: Grid's library has the function or produces the result (asked by calling it).
// - `schema`: the plan file can hold a fact: a plan carrying the field is read and the field is
//   still there afterwards (today's reader drops a field it does not know). The field names are
//   the ones the lab's agents reached for when they tried to write the fact.
// - `export`: the export formats include the format.
// A capability Grid does not have, and that no probe can see coming, has no probe (`none`). The
// step that builds it adds the probe, and the count moves in that commit.
import * as geometry from '@ongrid/floorplan/geometry'
import * as exporter from '@ongrid/floorplan/export'
import * as rules from '@ongrid/rules'
import * as rooms from '@ongrid/floorplan/rooms'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'

export type Probe =
  | { readonly kind: 'lib'; readonly test: (sample: unknown) => boolean }
  | { readonly kind: 'schema'; readonly path: string; readonly value: unknown }
  | { readonly kind: 'export'; readonly format: string }
  | { readonly kind: 'none' }

export interface Capability {
  readonly what: string
  readonly probe: Probe
}

const has = (module: object, name: string): boolean => typeof (module as Record<string, unknown>)[name] === 'function'
const lib = (test: (sample: unknown) => boolean): Probe => ({ kind: 'lib', test })
const schema = (path: string, value: unknown): Probe => ({ kind: 'schema', path, value })
const none: Probe = { kind: 'none' }

export const CAPABILITIES = {
  'read-plan': { what: 'reads a plan file', probe: lib((s) => parseFloorPlan(s).walls.length > 0) },
  'room-areas': {
    what: 'gives the area of each room',
    probe: lib((s) => {
      const plan = parseFloorPlan(s)
      const index = geometry.indexPlan(plan)
      return plan.rooms.every((room) => geometry.roomArea(room, index) > 0)
    }),
  },
  'plan-2d': { what: 'draws the plan in 2D', probe: lib(() => has(geometry, 'buildFloorPlan')) },
  'view-3d': { what: 'builds the 3D model', probe: lib(() => has(geometry, 'buildScene')) },
  compare: { what: 'compares two versions of a plan', probe: lib(() => has(geometry, 'diffPlans')) },
  'rules-report': { what: 'reports what the rules checks found', probe: lib(() => has(rules, 'checkLocalRules')) },
  'door-check': { what: 'warns when doors hit walls or each other', probe: lib(() => has(geometry, 'validateDoorSweeps')) },
  'room-use': { what: 'holds what each room is for', probe: schema('rooms.0.use', 'bedroom') },
  floors: { what: 'holds several floors', probe: schema('floors', [{ id: 'ground', name: 'Ground', level: 0 }]) },
  'door-height': { what: 'holds the height of each opening', probe: schema('openings.0.height', 2.1) },
  'export-dxf': { what: 'writes DXF', probe: { kind: 'export', format: 'dxf' } },
  'export-ifc': { what: 'writes IFC', probe: { kind: 'export', format: 'ifc' } },
  'export-pdf': { what: 'writes PDF', probe: { kind: 'export', format: 'pdf' } },
  'export-dwg': { what: 'writes DWG', probe: { kind: 'export', format: 'dwg' } },
  'export-jpg': { what: 'writes JPG', probe: { kind: 'export', format: 'jpg' } },
  'export-table': { what: 'writes a table (CSV or a spreadsheet)', probe: { kind: 'export', format: 'csv' } },
  north: { what: 'holds where north is', probe: schema('north', 0) },
  site: { what: 'holds the plot and what is around it', probe: schema('site', { boundary: [[0, 0], [10, 0], [10, 10], [0, 10]] }) },
  // LVL-3: the lab's names (from, to, width, risers), and the walking line a stair is drawn along.
  stairs: { what: 'holds stairs', probe: schema('stairs', [{ id: 's1', from: 'ground', to: 'first', width: 0.9, run: [[1, 1], [1, 4.5]], risers: 16 }]) },
  ramps: { what: 'holds ramps', probe: schema('ramps', [{ id: 'r1', rise: 0.3, slope: 0.08 }]) },
  // LVL-6: a floor's roof, with its shape, eaves and pitch, which its walls and rooms are cut to.
  roof: { what: 'holds a roof', probe: schema('floors', [{ id: 'ground', name: 'Ground', level: 0, roof: { shape: 'gable', eaves: 2.7, pitch: 35 } }]) },
  fixtures: { what: 'holds fixtures (WC, basin, kitchen units)', probe: schema('rooms.0.fixtures', [{ type: 'wc' }]) },
  furniture: { what: 'holds furniture', probe: schema('furniture', [{ type: 'table', at: [1, 1], size: [1.8, 0.9] }]) },
  // CNT-14: a door's kind (`folding`, `double`) says how many leaves it has; the lab's agents wrote `leaves`.
  'door-leaves': { what: 'holds doors with several leaves (bifold, double)', probe: schema('openings.0.kind', 'folding') },
  // CNT-13: the clear width a doorway leaves, worked out from its hole, an open leaf and the fixtures in front of it.
  'clear-width': {
    what: 'gives the clear width a door leaves',
    probe: lib((s) => {
      const plan = parseFloorPlan(s)
      const door = plan.openings.find((o) => o.type === 'door')!
      const wall = plan.walls.find((w) => w.id === door.wall)!
      return geometry.doorwayClearance(wall, door, []).clear < door.width
    }),
  },
  threshold: { what: 'holds a step or threshold at a door', probe: schema('openings.0.threshold', 0.02) },
  'fire-rating': { what: 'holds fire ratings of walls and doors', probe: schema('openings.0.fireRating', 'EI30') },
  occupancy: { what: 'holds how many people a room or home is for', probe: schema('rooms.0.occupancy', 2) },
  'existing-new': { what: 'holds which parts are existing, new or removed', probe: schema('walls.0.status', 'existing') },
  'outdoor-space': { what: 'holds outdoor spaces (garden, courtyard, balcony)', probe: schema('rooms.0.outdoor', true) },
  flats: { what: 'groups rooms into homes or flats', probe: schema('flats', [{ id: 'a', rooms: ['r1'] }]) },
  // LVL-4: a room's ceiling, at the room's height (ARE-10), with the zones lowered under it at theirs.
  'ceiling-height': { what: 'holds ceiling heights', probe: schema('rooms.0.ceiling', { lowered: [{ points: [[0, 0], [1, 0], [1, 1]], height: 2.3 }] }) },
  'gross-area': {
    what: 'gives gross areas (to the outside of the walls)',
    // ARE-9: gross external, and gross internal, each with the rule it follows.
    probe: lib((s) => {
      const areas = geometry.planAreaFigures(parseFloorPlan(s))
      return (areas.grossExternal.area ?? 0) > (areas.net.area ?? 0) && areas.grossExternal.rule.measures.length > 0
    }),
  },
  'area-table': {
    what: 'gives a table of areas by home, use or floor',
    // ARE-9: net by use and every area by floor (by home is ARE-14).
    probe: lib((s) => {
      const areas = geometry.planAreaFigures(parseFloorPlan(s))
      return areas.floors.length > 0 && Object.keys(areas.byUse).length > 0
    }),
  },
  'room-width': { what: 'measures the narrowest width of a room or corridor', probe: none },
  'route-length': { what: 'measures a walking route (to an exit, along a corridor)', probe: none },
  'take-offs': { what: 'measures lengths and surfaces of walls, skirting and plaster', probe: none },
  'opening-schedule': { what: 'lists doors and windows by size', probe: none },
  // CNT-13: the floor round a fixture, and the way through a room clear of the fixtures.
  'clearance': { what: 'measures the free space between things', probe: lib(() => has(geometry, 'fixtureSpace') && has(geometry, 'passageWidth')) },
  // CNT-13: the widest circle a room's free floor holds, clear of its fixtures.
  'turning-space': {
    what: 'tests a turning circle in a room',
    probe: lib((s) => {
      const [first] = geometry.roomShapes(geometry.indexPlan(parseFloorPlan(s)))
      return first !== undefined && geometry.turningSpace(first.shape.polygon, first.shape.holes, []).diameter > 0
    }),
  },
  'inside-view': { what: 'shows a view from inside a room', probe: none },
  'drawing-key': { what: 'explains the drawing (key, which side is which)', probe: none },
  'drawing-style': { what: 'chooses what a drawing shows and its colours', probe: none },
  sheet: { what: 'lays out a sheet (title, scale bar, several plans)', probe: none },
  'imperial-units': { what: 'shows sizes in feet and inches', probe: none },
  'marks-on-plan': { what: 'marks notes and changes on the drawing', probe: none },
  'note-reasons': { what: 'says why each note was given and what to change', probe: none },
  'compare-notes': {
    what: 'compares the notes of two versions',
    // WRT-8: the comparison says which notes of the drawing check came and went.
    probe: lib((s) => {
      const plan = parseFloorPlan(s)
      const note = { code: 'plan/probe', thing: { kind: 'plan', id: 'plan' }, also: [], message: 'A note' }
      return geometry.compareBuildings(plan, plan, { notes: { before: [], after: [note] } }).issues.some((issue) => issue.code === 'note_added')
    }),
  },
  'layout-help': { what: 'works out a layout (how many flats fit)', probe: none },
  'repeat-floor': {
    what: 'repeats a floor',
    // WRT-4: rooms text copies a floor from its floor line ('floor f2 ... copy f1'), each floor
    // standing in the plan with its own walls, rooms and ids.
    probe: lib(() => {
      const written = rooms.compileRoomsText('walls outside 0.3 inside 0.1 height 2.7\nfloor f1 "First" level 1\nroom a "Flat" living 6 x 4 at 0,0\nfloor f2 "Second" level 2 copy f1\n')
      const plan = written.plan === null ? null : parseFloorPlan(written.plan)
      return plan !== null && plan.floors?.length === 2 && plan.rooms.filter((room) => room.floor === 'f2').length === 1 && plan.walls.some((wall) => wall.floor === 'f2')
    }),
  },
  'local-rules': { what: 'checks the rules of the place named', probe: none },
  permission: { what: 'says whether a design is allowed (never: Grid gives general guidance only)', probe: none },
  // CNT-14: the part of a door or window that opens (`opens`); its glass is drawn in 3D.
  'openable-part': { what: 'holds the part of a window that opens, and its glass', probe: schema('openings.0.opens', { width: 0.6, height: 1 }) },
  services: { what: 'holds services (fans, ducts)', probe: none },
  'exit-side': { what: 'knows which side of an exit door is out', probe: none },
  // LVL-3: a lift shaft is a room used as a lift on each floor it serves.
  lift: { what: 'holds lifts', probe: schema('rooms.0.use', 'lift') },
  parking: { what: 'holds parking spaces', probe: none },
  materials: { what: 'holds wall, roof and floor build-ups', probe: none },
  shading: { what: 'holds sun shading', probe: none },
  // CNT-17: the rooms and routes that need to be accessible (C14). A fitting is not marked yet.
  'accessible-mark': { what: 'marks a room or fitting as accessible', probe: schema('accessible', { rooms: ['r1'], routes: [{ to: 'r1' }] }) },
} as const satisfies Record<string, Capability>

export type CapabilityId = keyof typeof CAPABILITIES

/** Sets `value` at a dotted path ("rooms.0.use") in a copy of the plan. */
function withField(sample: unknown, path: string, value: unknown): unknown {
  const copy = JSON.parse(JSON.stringify(sample)) as Record<string, unknown>
  const parts = path.split('.')
  let at: Record<string, unknown> = copy
  for (const part of parts.slice(0, -1)) at = at[part] as Record<string, unknown>
  at[parts[parts.length - 1]!] = value
  return copy
}

function fieldAt(value: unknown, path: string): unknown {
  let at = value
  for (const part of path.split('.')) at = at === null || typeof at !== 'object' ? undefined : (at as Record<string, unknown>)[part]
  return at
}

/** Asks Grid whether it has the capability, on a sample plan. A probe that throws is a no. */
export function available(probe: Probe, sample: unknown): boolean {
  try {
    if (probe.kind === 'none') return false
    if (probe.kind === 'lib') return probe.test(sample)
    if (probe.kind === 'export') return (exporter.EXPORT_FORMATS as readonly string[]).includes(probe.format)
    const read = parseFloorPlan(withField(sample, probe.path, probe.value))
    return JSON.stringify(fieldAt(read, probe.path)) === JSON.stringify(probe.value)
  } catch {
    return false
  }
}

/** Every capability, asked once. */
export function capabilityTable(sample: unknown): ReadonlyMap<CapabilityId, boolean> {
  return new Map(Object.entries(CAPABILITIES).map(([id, c]) => [id as CapabilityId, available(c.probe, sample)]))
}
