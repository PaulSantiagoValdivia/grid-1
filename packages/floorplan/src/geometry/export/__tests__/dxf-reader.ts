/**
 * HND-1: a reader and a structural check for the DXF files Grid writes, for the tests.
 *
 * No DXF reader is a dependency of this repository, so the tests read the files here: as the
 * (group code, value) pairs a reader consumes, grouped into sections, tables, blocks, entities
 * and objects, and checked the way a CAD program needs them to hold together. `dxfProblems`
 * returns every problem it finds; an empty list is a file that is well formed, whose handles are
 * unique, whose owners and references resolve, and whose layers, line types, text styles,
 * dimension styles and blocks are all declared. `worldShapes` places each block's lines where its
 * insert puts them, so a test can measure what a drafter sees.
 */
import type { Vec2 } from '../../vec2'

export interface Pair {
  readonly code: number
  readonly value: string
}

/** The file as pairs. Throws when it is not pairs of an integer code and a value. */
export function dxfPairs(dxf: string): Pair[] {
  const lines = dxf.split('\r\n')
  if (lines[lines.length - 1] === '') lines.pop()
  if (lines.length % 2 !== 0) throw new Error(`${lines.length} lines: a value without its code`)
  const out: Pair[] = []
  for (let i = 0; i < lines.length; i += 2) {
    const code = Number(lines[i]!.trim())
    if (!Number.isInteger(code) || lines[i]!.trim() === '') throw new Error(`line ${i + 1} is not a group code`)
    if (/[\r\n]/.test(lines[i + 1]!)) throw new Error(`line ${i + 2} holds a line break`)
    out.push({ code, value: lines[i + 1]! })
  }
  return out
}

/** One object of the file: an entity, a table record or an object, from its code 0 to the next. */
export interface DxfObject {
  readonly type: string
  readonly pairs: readonly Pair[]
  readonly handle: string
  /** Its first owner (330), after its reactors. */
  readonly owner: string
  readonly layer: string
  readonly paper: boolean
}

export const valueOf = (o: { readonly pairs: readonly Pair[] }, code: number): string | undefined => o.pairs.find((p) => p.code === code)?.value
export const valuesOf = (o: { readonly pairs: readonly Pair[] }, code: number): string[] => o.pairs.filter((p) => p.code === code).map((p) => p.value)
export const numberOf = (o: { readonly pairs: readonly Pair[] }, code: number): number => Number(valueOf(o, code))

function objectOf(type: string, pairs: Pair[]): DxfObject {
  let owner = ''
  let inReactors = false
  for (const p of pairs) {
    if (p.code === 102) inReactors = p.value.startsWith('{')
    else if (p.code === 330 && !inReactors && owner === '') owner = p.value
  }
  return { type, pairs, handle: valueOf({ pairs }, 5) ?? valueOf({ pairs }, 105) ?? '', owner, layer: valueOf({ pairs }, 8) ?? '', paper: valueOf({ pairs }, 67) === '1' }
}

/** The objects of a run of pairs, split at each code 0. */
function objectsOf(pairs: readonly Pair[]): DxfObject[] {
  const out: DxfObject[] = []
  let current: { type: string; pairs: Pair[] } | null = null
  for (const p of pairs) {
    if (p.code === 0) {
      if (current) out.push(objectOf(current.type, current.pairs))
      current = { type: p.value, pairs: [] }
    } else current?.pairs.push(p)
  }
  if (current) out.push(objectOf(current.type, current.pairs))
  return out
}

export interface DxfTable {
  readonly name: string
  readonly head: DxfObject
  readonly records: readonly DxfObject[]
}

export interface DxfBlock {
  readonly name: string
  readonly begin: DxfObject
  readonly entities: readonly DxfObject[]
  readonly end: DxfObject | null
}

export interface DxfDocument {
  readonly sections: readonly string[]
  readonly header: ReadonlyMap<string, readonly Pair[]>
  readonly classes: readonly DxfObject[]
  readonly tables: ReadonlyMap<string, DxfTable>
  readonly blocks: readonly DxfBlock[]
  readonly entities: readonly DxfObject[]
  readonly objects: readonly DxfObject[]
  /** Whether the last pair is `0 EOF`. */
  readonly ends: boolean
}

/** The file, read into its parts. Throws when it is not pairs. */
export function readDxf(dxf: string): DxfDocument {
  const pairs = dxfPairs(dxf)
  const sections: string[] = []
  const bodies = new Map<string, Pair[]>()
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i]!.code !== 0 || pairs[i]!.value !== 'SECTION') continue
    const name = pairs[i + 1]?.code === 2 ? pairs[i + 1]!.value : '?'
    sections.push(name)
    const end = pairs.findIndex((p, k) => k > i && p.code === 0 && p.value === 'ENDSEC')
    bodies.set(name, pairs.slice(i + 2, end === -1 ? pairs.length : end))
    if (end !== -1) i = end
  }

  const header = new Map<string, Pair[]>()
  let variable = ''
  for (const p of bodies.get('HEADER') ?? []) {
    if (p.code === 9) header.set((variable = p.value), [])
    else header.get(variable)?.push(p)
  }

  const tables = new Map<string, DxfTable>()
  let table: { head: DxfObject; records: DxfObject[] } | null = null
  for (const o of objectsOf(bodies.get('TABLES') ?? [])) {
    if (o.type === 'TABLE') table = { head: o, records: [] }
    else if (o.type === 'ENDTAB' && table) {
      tables.set(valueOf(table.head, 2) ?? '?', { name: valueOf(table.head, 2) ?? '?', ...table })
      table = null
    } else table?.records.push(o)
  }

  const blocks: DxfBlock[] = []
  let block: { begin: DxfObject; entities: DxfObject[] } | null = null
  for (const o of objectsOf(bodies.get('BLOCKS') ?? [])) {
    if (o.type === 'BLOCK') block = { begin: o, entities: [] }
    else if (o.type === 'ENDBLK' && block) {
      blocks.push({ name: valueOf(block.begin, 2) ?? '?', ...block, end: o })
      block = null
    } else block?.entities.push(o)
  }
  if (block) blocks.push({ name: valueOf(block.begin, 2) ?? '?', ...block, end: null })

  const last = pairs[pairs.length - 1]
  return {
    sections,
    header,
    classes: objectsOf(bodies.get('CLASSES') ?? []),
    tables,
    blocks,
    entities: objectsOf(bodies.get('ENTITIES') ?? []),
    objects: objectsOf(bodies.get('OBJECTS') ?? []),
    ends: last?.code === 0 && last.value === 'EOF'
  }
}

const FLOAT = (code: number): boolean => (code >= 10 && code <= 59) || (code >= 110 && code <= 149) || (code >= 210 && code <= 239) || (code >= 1010 && code <= 1059)
const INTEGER = (code: number): boolean =>
  (code >= 60 && code <= 99) || (code >= 170 && code <= 179) || (code >= 270 && code <= 299) || (code >= 370 && code <= 389) || (code >= 400 && code <= 409) || (code >= 1060 && code <= 1071)
const POINTER = (code: number): boolean => code >= 330 && code <= 369
const HEX = /^[0-9A-F]+$/

/** Names a table holds, in capitals: a CAD program reads them so. */
const namesIn = (doc: DxfDocument, table: string): Set<string> => new Set((doc.tables.get(table)?.records ?? []).map((r) => (valueOf(r, 2) ?? '').toUpperCase()))

/**
 * Every structural problem of a file Grid wrote, in words; empty when there is none. `version`
 * is the version the file must claim.
 */
export function dxfProblems(dxf: string, version = 'AC1027'): string[] {
  let doc: DxfDocument
  let pairs: Pair[]
  try {
    pairs = dxfPairs(dxf)
    doc = readDxf(dxf)
  } catch (error) {
    return [(error as Error).message]
  }
  const problems: string[] = []
  const say = (text: string): void => {
    if (problems.length < 50) problems.push(text)
  }

  // Values of the codes that hold numbers are numbers; handles are hexadecimal.
  for (const p of pairs) {
    if (FLOAT(p.code) && (p.value.trim() === '' || !Number.isFinite(Number(p.value)))) say(`code ${p.code} holds ${JSON.stringify(p.value)}, not a number`)
    if (INTEGER(p.code) && !/^-?\d+$/.test(p.value.trim())) say(`code ${p.code} holds ${JSON.stringify(p.value)}, not a whole number`)
    if ((p.code === 5 || p.code === 105 || POINTER(p.code)) && !HEX.test(p.value)) say(`code ${p.code} holds ${JSON.stringify(p.value)}, not a handle`)
  }

  const order = ['HEADER', 'CLASSES', 'TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS']
  if (doc.sections.join(' ') !== order.join(' ')) say(`sections ${doc.sections.join(', ')}, not ${order.join(', ')}`)
  if (!doc.ends) say('the file does not end with EOF')
  const sectionCount = pairs.filter((p) => p.code === 0 && p.value === 'SECTION').length
  if (pairs.filter((p) => p.code === 0 && p.value === 'ENDSEC').length !== sectionCount) say('a section is not closed')

  const headerValue = (name: string): string | undefined => doc.header.get(name)?.[0]?.value
  if (headerValue('$ACADVER') !== version) say(`$ACADVER is ${headerValue('$ACADVER')}, not ${version}`)
  if (headerValue('$INSUNITS') !== '6') say(`$INSUNITS is ${headerValue('$INSUNITS')}, not 6 (metres)`)
  if (headerValue('$MEASUREMENT') !== '1') say('$MEASUREMENT is not metric')

  // Every handle once; the seed past every one of them.
  const all: DxfObject[] = [...doc.classes, ...[...doc.tables.values()].flatMap((t) => [t.head, ...t.records]), ...doc.blocks.flatMap((b) => [b.begin, ...b.entities, ...(b.end ? [b.end] : [])]), ...doc.entities, ...doc.objects]
  const handles = new Map<string, DxfObject>()
  for (const o of all) {
    if (o.type === 'CLASS') continue
    if (o.handle === '') say(`a ${o.type} has no handle`)
    else if (handles.has(o.handle)) say(`handle ${o.handle} is used twice (${handles.get(o.handle)!.type} and ${o.type})`)
    else handles.set(o.handle, o)
  }
  const seed = parseInt(headerValue('$HANDSEED') ?? '0', 16)
  const highest = [...handles.keys()].reduce((top, h) => Math.max(top, parseInt(h, 16)), 0)
  if (!(seed > highest)) say(`$HANDSEED ${headerValue('$HANDSEED')} is not past the highest handle`)
  for (const o of all) for (const p of o.pairs) if (POINTER(p.code) && p.value !== '0' && !handles.has(p.value)) say(`${o.type} ${o.handle} points at ${p.value} (code ${p.code}), which is not in the file`)

  // The tables a CAD program needs, each record owned by its table and counted.
  for (const name of ['VPORT', 'LTYPE', 'LAYER', 'STYLE', 'VIEW', 'UCS', 'APPID', 'DIMSTYLE', 'BLOCK_RECORD']) {
    const table = doc.tables.get(name)
    if (!table) {
      say(`no ${name} table`)
      continue
    }
    if (numberOf(table.head, 70) !== table.records.length) say(`the ${name} table says ${valueOf(table.head, 70)} records and holds ${table.records.length}`)
    for (const r of table.records) {
      if (r.owner !== table.head.handle) say(`${name} record ${valueOf(r, 2)} is not owned by its table`)
      if (!valuesOf(r, 100).includes('AcDbSymbolTableRecord')) say(`${name} record ${valueOf(r, 2)} has no record marker`)
    }
    const names = table.records.map((r) => (valueOf(r, 2) ?? '').toUpperCase())
    if (new Set(names).size !== names.length) say(`the ${name} table names a record twice`)
  }
  const need: [string, string][] = [['LTYPE', 'BYBLOCK'], ['LTYPE', 'BYLAYER'], ['LTYPE', 'CONTINUOUS'], ['LAYER', '0'], ['STYLE', 'STANDARD'], ['APPID', 'ACAD'], ['DIMSTYLE', 'STANDARD'], ['BLOCK_RECORD', '*MODEL_SPACE'], ['BLOCK_RECORD', '*PAPER_SPACE']]
  for (const [table, record] of need) if (!namesIn(doc, table).has(record)) say(`the ${table} table has no ${record}`)

  const layers = namesIn(doc, 'LAYER')
  const types = namesIn(doc, 'LTYPE')
  const styles = namesIn(doc, 'STYLE')
  const dimstyles = namesIn(doc, 'DIMSTYLE')
  const records = new Map((doc.tables.get('BLOCK_RECORD')?.records ?? []).map((r) => [(valueOf(r, 2) ?? '').toUpperCase(), r]))
  const blockNames = new Set(doc.blocks.map((b) => b.name.toUpperCase()))
  for (const r of doc.tables.get('LAYER')?.records ?? []) if (!types.has((valueOf(r, 6) ?? '').toUpperCase())) say(`layer ${valueOf(r, 2)} draws with line type ${valueOf(r, 6)}, which is not declared`)

  const entityRefs = (o: DxfObject): void => {
    if (!valuesOf(o, 100).includes('AcDbEntity')) say(`${o.type} ${o.handle} has no entity marker`)
    if (!layers.has(o.layer.toUpperCase())) say(`${o.type} ${o.handle} is on layer ${o.layer}, which is not declared`)
    const type = valueOf(o, 6)
    if (type !== undefined && !types.has(type.toUpperCase())) say(`${o.type} ${o.handle} names line type ${type}, which is not declared`)
    const style = ['TEXT', 'ATTRIB', 'ATTDEF', 'MTEXT'].includes(o.type) ? valueOf(o, 7) : undefined
    if (style !== undefined && !styles.has(style.toUpperCase())) say(`${o.type} ${o.handle} names text style ${style}, which is not declared`)
    if (o.type === 'INSERT' || o.type === 'DIMENSION') {
      const name = (valueOf(o, 2) ?? '').toUpperCase()
      if (!blockNames.has(name) || !records.has(name)) say(`${o.type} ${o.handle} inserts block ${valueOf(o, 2)}, which is not defined`)
    }
    if (o.type === 'DIMENSION' && !dimstyles.has((valueOf(o, 3) ?? '').toUpperCase())) say(`DIMENSION ${o.handle} names dimension style ${valueOf(o, 3)}, which is not declared`)
    if (o.type === 'LWPOLYLINE' && numberOf(o, 90) !== valuesOf(o, 10).length) say(`LWPOLYLINE ${o.handle} says ${valueOf(o, 90)} vertices and holds ${valuesOf(o, 10).length}`)
    if (o.type === 'HATCH') {
      const loops = valuesOf(o, 92).length
      if (numberOf(o, 91) !== loops) say(`HATCH ${o.handle} says ${valueOf(o, 91)} loops and holds ${loops}`)
      const counted = valuesOf(o, 93).reduce((sum, n) => sum + Number(n), 0)
      // The elevation point is one 10 of its own.
      if (counted !== valuesOf(o, 10).length - 1) say(`HATCH ${o.handle} counts ${counted} vertices and holds ${valuesOf(o, 10).length - 1}`)
    }
    if (o.type === 'TEXT' || o.type === 'ATTRIB') {
      const text = valueOf(o, 1) ?? ''
      if (/\\U\+(?!005C)/.test(text)) say(`${o.type} ${o.handle} holds a code for a letter, not the letter: ${JSON.stringify(text)}`)
    }
  }

  // Each block: its record, its owner, its end; what it draws owned by its record.
  for (const b of doc.blocks) {
    const record = records.get(b.name.toUpperCase())
    if (!record) say(`block ${b.name} has no record`)
    else if (b.begin.owner !== record.handle) say(`block ${b.name} is not owned by its record`)
    if (!b.end) say(`block ${b.name} has no end`)
    else if (b.end.owner !== record?.handle) say(`the end of block ${b.name} is not owned by its record`)
    for (const e of b.entities) {
      if (e.owner !== record?.handle) say(`${e.type} ${e.handle} in block ${b.name} is not owned by it`)
      entityRefs(e)
    }
  }
  for (const name of records.keys()) if (!blockNames.has(name)) say(`block record ${name} has no block`)

  // The entities: in model or paper space, and an insert's attributes owned by it.
  const model = records.get('*MODEL_SPACE')?.handle
  const paper = records.get('*PAPER_SPACE')?.handle
  let insert: DxfObject | null = null
  for (const e of doc.entities) {
    entityRefs(e)
    if (e.type === 'ATTRIB' || e.type === 'SEQEND') {
      if (!insert || e.owner !== insert.handle) say(`${e.type} ${e.handle} does not follow the insert that owns it`)
      if (e.type === 'SEQEND') insert = null
      continue
    }
    if (insert) say(`INSERT ${insert.handle} has attributes and no SEQEND`)
    insert = e.type === 'INSERT' && valueOf(e, 66) === '1' ? e : null
    if (e.owner !== (e.paper ? paper : model)) say(`${e.type} ${e.handle} is not owned by the ${e.paper ? 'paper' : 'model'} space it is drawn in`)
  }

  // The objects: the root dictionary, its groups and layouts, each layout tied to its space.
  const root = doc.objects[0]
  if (!root || root.type !== 'DICTIONARY' || root.owner !== '0') say('the objects do not start with the root dictionary')
  else for (const name of ['ACAD_GROUP', 'ACAD_LAYOUT']) if (!valuesOf(root, 3).includes(name)) say(`the root dictionary has no ${name}`)
  const layouts = doc.objects.filter((o) => o.type === 'LAYOUT')
  if (layouts.length < 2) say('the file has no paper layout')
  for (const layout of layouts) {
    const space = valuesOf(layout, 330).at(-1)
    const record = [...records.values()].find((r) => r.handle === space)
    if (!record || valueOf(record, 340) !== layout.handle) say(`layout ${valueOf(layout, 1)} and its space do not point at each other`)
  }
  return problems
}

/** One line, arc or outline as it lands in model space, on the layer it is drawn on. */
export interface Shape {
  readonly type: 'LINE' | 'ARC' | 'LWPOLYLINE'
  readonly layer: string
  /** Through which insert it came, if any: the block's name. */
  readonly block: string | null
  readonly points: readonly Vec2[]
  /** An arc's centre, radius and angles in degrees, counter-clockwise from `start` to `end`. */
  readonly arc?: { readonly center: Vec2; readonly radius: number; readonly start: number; readonly end: number }
  readonly closed?: boolean
}

/**
 * The model space's lines, arcs and outlines where they land: each insert's block drawn where it
 * puts it, turned as it turns it. A line on layer 0 in a block is drawn on the insert's layer.
 */
export function worldShapes(dxf: string): Shape[] {
  const doc = readDxf(dxf)
  const blocks = new Map(doc.blocks.map((b) => [b.name, b]))
  const out: Shape[] = []
  const shape = (o: DxfObject, place: (p: Vec2) => Vec2, turn: number, layer: string, block: string | null): void => {
    const on = o.layer === '0' ? layer : o.layer
    const point = (code: number): Vec2 => place({ x: numberOf(o, code), y: numberOf(o, code + 10) })
    if (o.type === 'LINE') out.push({ type: 'LINE', layer: on, block, points: [point(10), point(11)] })
    if (o.type === 'ARC') {
      const center = point(10)
      out.push({ type: 'ARC', layer: on, block, points: [], arc: { center, radius: numberOf(o, 40), start: (numberOf(o, 50) + turn) % 360, end: (numberOf(o, 51) + turn) % 360 } })
    }
    if (o.type === 'LWPOLYLINE') {
      const xs = valuesOf(o, 10).map(Number)
      const ys = valuesOf(o, 20).map(Number)
      out.push({ type: 'LWPOLYLINE', layer: on, block, points: xs.map((x, i) => place({ x, y: ys[i]! })), closed: valueOf(o, 70) === '1' })
    }
  }
  for (const e of doc.entities) {
    if (e.paper) continue
    if (e.type !== 'INSERT') {
      shape(e, (p) => p, 0, e.layer, null)
      continue
    }
    const block = blocks.get(valueOf(e, 2) ?? '')
    const at = { x: numberOf(e, 10), y: numberOf(e, 20) }
    const turn = Number(valueOf(e, 50) ?? 0)
    const r = (turn * Math.PI) / 180
    const place = (p: Vec2): Vec2 => ({ x: at.x + p.x * Math.cos(r) - p.y * Math.sin(r), y: at.y + p.x * Math.sin(r) + p.y * Math.cos(r) })
    for (const o of block?.entities ?? []) shape(o, place, turn, e.layer, block!.name)
  }
  return out
}

/** The model space's entities of one type, with their pairs. */
export const modelEntities = (dxf: string, type?: string): DxfObject[] => readDxf(dxf).entities.filter((e) => !e.paper && (type === undefined || e.type === type))

/** Each attribute's value by tag, for every insert of a block in model space. */
export function attributesOf(dxf: string, block: string): Record<string, string>[] {
  const out: Record<string, string>[] = []
  let current: Record<string, string> | null = null
  for (const e of readDxf(dxf).entities) {
    if (e.type === 'INSERT') current = valueOf(e, 2) === block ? {} : null
    if (current && e.type === 'INSERT') out.push(current)
    if (current && e.type === 'ATTRIB') current[valueOf(e, 2) ?? ''] = valueOf(e, 1) ?? ''
  }
  return out
}
