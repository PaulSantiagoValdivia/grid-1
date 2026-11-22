/**
 * The volume of a product's body in an IFC file, worked out from the file alone, for a test.
 *
 * It reads what Grid writes: a body made of `IfcExtrudedAreaSolid`s (a profile, closed or with
 * voids, swept straight up), each clipped or not by `IfcBooleanClippingResult`s that take away an
 * `IfcHalfSpaceSolid` bounded by an `IfcPlane`. The volume is summed over a grid of vertical lines
 * through the profile, `step` apart: each line keeps the stretch of the sweep that no half-space
 * takes away. Volume is the same in every frame, so the product's placement is not followed; the
 * planes are read in the frame the solid is swept in, which is where IFC places them.
 *
 * Independent of the exporter's own geometry on purpose: it reads the file, not the code that
 * wrote it.
 */

type Value =
  | { readonly t: 'ref'; readonly v: number }
  | { readonly t: 'num'; readonly v: number }
  | { readonly t: 'str'; readonly v: string }
  | { readonly t: 'enum'; readonly v: string }
  | { readonly t: 'list'; readonly v: readonly Value[] }
  | { readonly t: 'null' }
  | { readonly t: 'typed'; readonly name: string; readonly v: Value }

export interface IfcEntity {
  readonly id: number
  readonly type: string
  readonly args: readonly Value[]
}

export interface IfcDoc {
  readonly entities: ReadonlyMap<number, IfcEntity>
  readonly order: readonly IfcEntity[]
}

function parseValues(text: string): Value[] {
  let pos = 0
  const value = (): Value => {
    const c = text[pos]
    if (c === '#') {
      const m = /^#(\d+)/.exec(text.slice(pos))!
      pos += m[0].length
      return { t: 'ref', v: Number(m[1]) }
    }
    if (c === "'") {
      let out = ''
      pos++
      for (;;) {
        const ch = text[pos++]
        if (ch === "'") {
          if (text[pos] === "'") {
            out += "'"
            pos++
            continue
          }
          return { t: 'str', v: out }
        }
        out += ch
      }
    }
    if (c === '.') {
      const m = /^\.([A-Z0-9_]+)\./.exec(text.slice(pos))!
      pos += m[0].length
      return { t: 'enum', v: m[1]! }
    }
    if (c === '$' || c === '*') {
      pos++
      return { t: 'null' }
    }
    if (c === '(') {
      pos++
      const items: Value[] = []
      if (text[pos] === ')') {
        pos++
        return { t: 'list', v: items }
      }
      for (;;) {
        items.push(value())
        if (text[pos] === ',') {
          pos++
          continue
        }
        pos++
        return { t: 'list', v: items }
      }
    }
    const typed = /^[A-Z][A-Z0-9_]*\(/.exec(text.slice(pos))
    if (typed) {
      pos += typed[0].length
      const inner = value()
      pos++
      return { t: 'typed', name: typed[0].slice(0, -1), v: inner }
    }
    const m = /^[-+0-9.Ee]+/.exec(text.slice(pos))!
    pos += m[0].length
    return { t: 'num', v: Number(m[0]) }
  }
  const out: Value[] = []
  if (text.length === 0) return out
  for (;;) {
    out.push(value())
    if (text[pos] === ',') {
      pos++
      continue
    }
    return out
  }
}

export function parseIfc(text: string): IfcDoc {
  const entities = new Map<number, IfcEntity>()
  const order: IfcEntity[] = []
  for (const line of text.split('\n')) {
    const m = /^#(\d+)=([A-Z][A-Z0-9_]*)\((.*)\);$/.exec(line)
    if (!m) continue
    const entity = { id: Number(m[1]), type: m[2]!, args: parseValues(m[3]!) }
    entities.set(entity.id, entity)
    order.push(entity)
  }
  return { entities, order }
}

const get = (doc: IfcDoc, v: Value | undefined): IfcEntity => {
  if (v?.t !== 'ref') throw new Error(`expected a reference, got ${JSON.stringify(v)}`)
  const found = doc.entities.get(v.v)
  if (!found) throw new Error(`#${v.v} is not defined`)
  return found
}
const list = (v: Value | undefined): readonly Value[] => {
  if (v?.t !== 'list') throw new Error(`expected a list, got ${JSON.stringify(v)}`)
  return v.v
}
const nums = (v: Value | undefined): number[] => list(v).map((x) => (x.t === 'num' ? x.v : NaN))
const text = (v: Value | undefined): string => (v?.t === 'str' ? v.v : '')

type P2 = readonly [number, number]
type P3 = readonly [number, number, number]

/** A half-space a clipping takes away: the points whose `side · (p − at)` is positive. */
interface Cut {
  readonly at: P3
  readonly side: P3
}

function ring(doc: IfcDoc, curve: IfcEntity): P2[] {
  if (curve.type !== 'IFCPOLYLINE') throw new Error(`a profile curve of type ${curve.type}`)
  const points = list(curve.args[0]).map((p) => {
    const xy = nums(get(doc, p).args[0])
    return [xy[0]!, xy[1]!] as const
  })
  return points.slice(0, -1)
}

function profileRings(doc: IfcDoc, profile: IfcEntity): P2[][] {
  if (profile.type === 'IFCARBITRARYCLOSEDPROFILEDEF') return [ring(doc, get(doc, profile.args[2]))]
  if (profile.type === 'IFCARBITRARYPROFILEDEFWITHVOIDS') return [ring(doc, get(doc, profile.args[2])), ...list(profile.args[3]).map((c) => ring(doc, get(doc, c)))]
  if (profile.type === 'IFCRECTANGLEPROFILEDEF') {
    const position = get(doc, profile.args[2])
    const c = nums(get(doc, position.args[0]).args[0])
    const along = position.args[1]?.t === 'ref' ? nums(get(doc, position.args[1]).args[0]) : [1, 0]
    const hx = (profile.args[3] as { v: number }).v / 2
    const hy = (profile.args[4] as { v: number }).v / 2
    const u = [along[0]!, along[1]!]
    return [
      [
        [-hx, -hy],
        [hx, -hy],
        [hx, hy],
        [-hx, hy]
      ].map(([x, y]) => [c[0]! + u[0]! * x! - u[1]! * y!, c[1]! + u[1]! * x! + u[0]! * y!] as const)
    ]
  }
  throw new Error(`a profile of type ${profile.type}`)
}

/** An extrusion and the half-spaces taken from it, from a solid that is one or the other. */
function solidParts(doc: IfcDoc, solid: IfcEntity, cuts: Cut[] = []): { sweep: IfcEntity; cuts: Cut[] } {
  if (solid.type === 'IFCEXTRUDEDAREASOLID') return { sweep: solid, cuts }
  if (solid.type !== 'IFCBOOLEANCLIPPINGRESULT') throw new Error(`a solid of type ${solid.type}`)
  if (solid.args[0]?.t !== 'enum' || solid.args[0].v !== 'DIFFERENCE') throw new Error('a clipping that is no difference')
  const half = get(doc, solid.args[2])
  if (half.type !== 'IFCHALFSPACESOLID') throw new Error(`a clipping by ${half.type}`)
  const plane = get(doc, half.args[0])
  const placement = get(doc, plane.args[0])
  const at = nums(get(doc, placement.args[0]).args[0])
  const normal = placement.args[1]?.t === 'ref' ? nums(get(doc, placement.args[1]).args[0]) : [0, 0, 1]
  // AgreementFlag false: the normal points into the half-space's material, which is taken away.
  const agrees = half.args[1]?.t === 'enum' && half.args[1].v === 'T'
  const s = agrees ? -1 : 1
  const length = Math.hypot(normal[0]!, normal[1]!, normal[2]!)
  cuts.push({ at: [at[0]!, at[1]!, at[2] ?? 0], side: [(s * normal[0]!) / length, (s * normal[1]!) / length, (s * normal[2]!) / length] })
  return solidParts(doc, get(doc, solid.args[1]), cuts)
}

function inside(rings: readonly P2[][], x: number, y: number): boolean {
  let odd = false
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i]!
      const [xj, yj] = r[j]!
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) odd = !odd
    }
  }
  return odd
}

/** The volume of one solid item, by vertical lines `step` apart. */
export function solidVolume(doc: IfcDoc, solid: IfcEntity, step = 0.01): number {
  const { sweep, cuts } = solidParts(doc, solid)
  const direction = nums(get(doc, sweep.args[2]).args[0])
  if (Math.abs(direction[0]!) > 1e-12 || Math.abs(direction[1]!) > 1e-12 || !(direction[2]! > 0)) throw new Error('a sweep that is not straight up')
  const position = get(doc, sweep.args[1])
  const origin = nums(get(doc, position.args[0]).args[0])
  if (origin.some((v) => v !== 0) || position.args[1]?.t === 'ref' || position.args[2]?.t === 'ref') throw new Error('a sweep placed off its frame')
  const depth = (sweep.args[3] as { v: number }).v
  const rings = profileRings(doc, get(doc, sweep.args[0]))
  const xs = rings.flat().map((p) => p[0])
  const ys = rings.flat().map((p) => p[1])
  let volume = 0
  for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) {
    for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) {
      if (!inside(rings, x, y)) continue
      let lo = 0
      let hi = depth
      for (const { at, side } of cuts) {
        const flat = side[0] * (x - at[0]) + side[1] * (y - at[1])
        if (Math.abs(side[2]) < 1e-12) {
          if (flat > 0) hi = lo
          continue
        }
        const z = at[2] - flat / side[2]
        if (side[2] > 0) hi = Math.min(hi, z)
        else lo = Math.max(lo, z)
      }
      if (hi > lo) volume += (hi - lo) * step * step
    }
  }
  return volume
}

/** The product's Body items: their volumes summed. */
export function productVolume(doc: IfcDoc, product: IfcEntity, step = 0.01): number {
  const shape = get(doc, product.args[6])
  let volume = 0
  for (const r of list(shape.args[2])) {
    const representation = get(doc, r)
    if (text(representation.args[1]) !== 'Body') continue
    for (const item of list(representation.args[3])) volume += solidVolume(doc, get(doc, item), step)
  }
  return volume
}

/** The products of a type with a name. */
export function named(doc: IfcDoc, type: string, name: string): IfcEntity[] {
  return doc.order.filter((e) => e.type === type && text(e.args[2]) === name)
}
