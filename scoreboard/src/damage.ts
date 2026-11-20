/* eslint-disable @typescript-eslint/no-explicit-any -- the mutators write wrong types into plans on purpose */
// The damage set: 3,000 plans, each one sound plan with one random change. Ported from the Grid
// lab's cluster L, experiment 3 (the mutators and the order they are drawn in are unchanged), so
// the same seed rebuilds the same 3,000 changes. `damageSet()` checks every change against the
// fingerprint the lab stored and throws on the first one that differs.
import { randomBuilding, rng, clone, type Raw, type Rng } from './gen'

export interface Mutation {
  kind: string
  detail: string
  /** The id of the thing that was damaged (wall, room or opening), when there is one. */
  target: string
  /** Where in the file: "walls.3.thickness". */
  path: string
}

type Mutator = (plan: any, r: Rng) => Mutation | null

const BAD_NUMBERS: [string, unknown][] = [
  ['0', 0],
  ['negative', -1],
  ['huge 1e9', 1e9],
  ['huge 1e308', 1e308],
  ['text', '2.5'],
  ['null', null],
  ['tiny 1e-9', 1e-9]
]

const wallLen = (w: any): number => Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1])

export const MUTATORS: Record<string, Mutator> = {
  'delete a wall': (plan, r) => {
    const i = r.int(0, plan.walls.length - 1)
    const [wall] = plan.walls.splice(i, 1)
    return { kind: 'delete a wall', detail: `${wall.kind} wall`, target: wall.id, path: `walls.${i}` }
  },
  'swap two boundary entries': (plan, r) => {
    const rooms = plan.rooms.filter((room: any) => room.boundary.length >= 4)
    if (rooms.length === 0) return null
    const room = r.pick(rooms) as any
    const i = r.int(0, room.boundary.length - 1)
    const adjacent = r.chance(0.5)
    const j = (i + (adjacent ? 1 : r.int(2, room.boundary.length - 2))) % room.boundary.length
    if (room.boundary[i] === room.boundary[j]) return null
    ;[room.boundary[i], room.boundary[j]] = [room.boundary[j], room.boundary[i]]
    return { kind: 'swap two boundary entries', detail: adjacent ? 'neighbours' : 'not neighbours', target: room.id, path: `rooms.${plan.rooms.indexOf(room)}.boundary` }
  },
  'scale one coordinate': (plan, r) => {
    const i = r.int(0, plan.walls.length - 1)
    const wall = plan.walls[i]
    const end = r.pick(['start', 'end'])
    const axis = r.int(0, 1)
    const factor = r.pick([10, 0.1, 1000, -1, 0.001, 1.1])
    const before = wall[end][axis]
    const after = before === 0 ? (factor === -1 ? -3 : factor) : before * factor
    if (after === before) return null
    wall[end][axis] = after
    return { kind: 'scale one coordinate', detail: `${end}[${axis}] ${before} -> ${after} (x${factor})`, target: wall.id, path: `walls.${i}.${end}.${axis}` }
  },
  'change an id reference': (plan, r) => {
    const which = r.pick(['boundary-missing', 'boundary-other', 'opening-missing', 'opening-other', 'wall-floor', 'room-floor'])
    if (which.startsWith('boundary')) {
      const ri = r.int(0, plan.rooms.length - 1)
      const room = plan.rooms[ri]
      const bi = r.int(0, room.boundary.length - 1)
      const old = room.boundary[bi]
      if (which === 'boundary-missing') room.boundary[bi] = `${old}-typo`
      else {
        const others = plan.walls.filter((w: any) => !room.boundary.includes(w.id))
        if (others.length === 0) return null
        room.boundary[bi] = (r.pick(others) as any).id
      }
      return { kind: 'change an id reference', detail: `room boundary entry ${old} -> ${room.boundary[bi]} (${which === 'boundary-missing' ? 'no such wall' : 'another wall'})`, target: room.id, path: `rooms.${ri}.boundary.${bi}` }
    }
    if (which.startsWith('opening')) {
      if (plan.openings.length === 0) return null
      const oi = r.int(0, plan.openings.length - 1)
      const opening = plan.openings[oi]
      const old = opening.wall
      if (which === 'opening-missing') opening.wall = `${old}-typo`
      else {
        const others = plan.walls.filter((w: any) => w.id !== old)
        if (others.length === 0) return null
        opening.wall = (r.pick(others) as any).id
      }
      return { kind: 'change an id reference', detail: `opening wall ${old} -> ${opening.wall} (${which === 'opening-missing' ? 'no such wall' : 'another wall'})`, target: opening.id, path: `openings.${oi}.wall` }
    }
    if (which === 'wall-floor') {
      const i = r.int(0, plan.walls.length - 1)
      const old = plan.walls[i].floor
      plan.walls[i].floor = r.chance(0.5) ? 'no-such-floor' : old === 'first' ? 'ground' : 'first'
      return { kind: 'change an id reference', detail: `wall floor ${old} -> ${plan.walls[i].floor}`, target: plan.walls[i].id, path: `walls.${i}.floor` }
    }
    const i = r.int(0, plan.rooms.length - 1)
    const old = plan.rooms[i].floor
    plan.rooms[i].floor = r.chance(0.5) ? 'no-such-floor' : old === 'first' ? 'ground' : 'first'
    return { kind: 'change an id reference', detail: `room floor ${old} -> ${plan.rooms[i].floor}`, target: plan.rooms[i].id, path: `rooms.${i}.floor` }
  },
  'move an opening': (plan, r) => {
    if (plan.openings.length === 0) return null
    const oi = r.int(0, plan.openings.length - 1)
    const opening = plan.openings[oi]
    const wall = plan.walls.find((w: any) => w.id === opening.wall)
    const len = wallLen(wall)
    const how = r.pick(['anywhere on the wall', 'past the end', 'onto a neighbour', 'to the very start', 'flush to the end'])
    const before = opening.offset
    if (how === 'anywhere on the wall') opening.offset = Math.round(r.range(0, Math.max(0, len - opening.width)) * 100) / 100
    else if (how === 'past the end') opening.offset = Math.round((len - opening.width * r.range(0, 0.9)) * 100) / 100
    else if (how === 'to the very start') opening.offset = 0
    else if (how === 'flush to the end') opening.offset = len - opening.width
    else {
      const other = plan.openings.find((o: any) => o.wall === opening.wall && o.id !== opening.id)
      if (!other) return null
      opening.offset = other.offset + other.width * 0.5
    }
    if (opening.offset === before) return null
    return { kind: 'move an opening', detail: `${opening.type} ${how}: offset ${before} -> ${opening.offset} on a ${len.toFixed(2)} m wall`, target: opening.id, path: `openings.${oi}.offset` }
  },
  'set a number': (plan, r) => {
    const [label, value] = r.pick(BAD_NUMBERS)
    const field = r.pick(['wall.thickness', 'wall.height', 'wall.start.0', 'wall.end.1', 'opening.offset', 'opening.width', 'opening.height', 'opening.sill', 'floor.level'])
    if (field.startsWith('wall')) {
      const i = r.int(0, plan.walls.length - 1)
      const wall = plan.walls[i]
      const parts = field.split('.').slice(1)
      if (parts.length === 1) wall[parts[0]!] = value
      else wall[parts[0]!][Number(parts[1])] = value
      return { kind: 'set a number', detail: `${field} = ${label}`, target: wall.id, path: `walls.${i}.${parts.join('.')}` }
    }
    if (field.startsWith('opening')) {
      if (plan.openings.length === 0) return null
      const i = r.int(0, plan.openings.length - 1)
      const name = field.split('.')[1]!
      plan.openings[i][name] = value
      return { kind: 'set a number', detail: `${field} = ${label}`, target: plan.openings[i].id, path: `openings.${i}.${name}` }
    }
    if (!plan.floors) return null
    const i = r.int(0, plan.floors.length - 1)
    plan.floors[i].level = value
    return { kind: 'set a number', detail: `${field} = ${label}`, target: plan.floors[i].id, path: `floors.${i}.level` }
  },
  // Extras, beyond the six kinds asked for.
  'extra: repeat an id': (plan, r) => {
    const how = r.pick(['wall=wall', 'room=wall', 'opening=opening', 'opening=wall', 'room=room'])
    const [a, b] = how.split('=') as [string, string]
    const listA = plan[`${a}s`]
    const listB = plan[`${b}s`]
    if (listA.length === 0 || listB.length < (a === b ? 2 : 1)) return null
    const i = r.int(0, listA.length - 1)
    let other = r.pick(listB) as any
    if (other === listA[i]) other = listB[(listB.indexOf(other) + 1) % listB.length]
    const old = listA[i].id
    listA[i].id = other.id
    return { kind: 'extra: repeat an id', detail: `${a} ${old} renamed to the id of ${b} ${other.id}`, target: other.id, path: `${a}s.${i}.id` }
  },
  'extra: remove a required field': (plan, r) => {
    const [list, field] = r.pick([
      ['walls', 'start'],
      ['walls', 'id'],
      ['rooms', 'boundary'],
      ['rooms', 'name'],
      ['openings', 'width'],
      ['openings', 'type'],
      ['openings', 'wall']
    ] as const)
    if (plan[list].length === 0) return null
    const i = r.int(0, plan[list].length - 1)
    const id = plan[list][i].id
    delete plan[list][i][field]
    return { kind: 'extra: remove a required field', detail: `${list}.${field}`, target: id ?? '', path: `${list}.${i}.${field}` }
  },
  'extra: wrong word': (plan, r) => {
    const which = r.pick(['kind', 'type', 'units', 'hinge', 'virtual'])
    if (which === 'kind') {
      const i = r.int(0, plan.walls.length - 1)
      plan.walls[i].kind = r.pick(['external', 'Exterior', 'outer', ''])
      return { kind: 'extra: wrong word', detail: `wall kind "${plan.walls[i].kind}"`, target: plan.walls[i].id, path: `walls.${i}.kind` }
    }
    if (which === 'units') {
      plan.units = r.pick(['mm', 'cm', 'ft', 'M'])
      return { kind: 'extra: wrong word', detail: `units "${plan.units}"`, target: '', path: 'units' }
    }
    if (which === 'virtual') {
      const i = r.int(0, plan.walls.length - 1)
      plan.walls[i].virtual = r.pick(['true', 1, 'yes'])
      return { kind: 'extra: wrong word', detail: `wall virtual = ${JSON.stringify(plan.walls[i].virtual)}`, target: plan.walls[i].id, path: `walls.${i}.virtual` }
    }
    if (plan.openings.length === 0) return null
    const i = r.int(0, plan.openings.length - 1)
    if (which === 'type') plan.openings[i].type = r.pick(['Door', 'gate', 'french-door', 'windows'])
    else plan.openings[i].hinge = r.pick(['left', 'Start', 'none'])
    return { kind: 'extra: wrong word', detail: `opening ${which} "${plan.openings[i][which]}"`, target: plan.openings[i].id, path: `openings.${i}.${which}` }
  },
  'extra: damage a boundary list': (plan, r) => {
    const i = r.int(0, plan.rooms.length - 1)
    const room = plan.rooms[i]
    const how = r.pick(['empty', 'two walls', 'same wall twice', 'one entry dropped', 'reversed'])
    if (how === 'empty') room.boundary = []
    else if (how === 'two walls') room.boundary = room.boundary.slice(0, 2)
    else if (how === 'same wall twice') room.boundary.splice(r.int(0, room.boundary.length - 1), 0, r.pick(room.boundary))
    else if (how === 'one entry dropped') room.boundary.splice(r.int(0, room.boundary.length - 1), 1)
    else room.boundary.reverse()
    return { kind: 'extra: damage a boundary list', detail: how, target: room.id, path: `rooms.${i}.boundary` }
  },
  'extra: wall of no length': (plan, r) => {
    const i = r.int(0, plan.walls.length - 1)
    plan.walls[i].end = [...plan.walls[i].start]
    return { kind: 'extra: wall of no length', detail: 'end = start', target: plan.walls[i].id, path: `walls.${i}.end` }
  },
  'extra: delete an opening or a room': (plan, r) => {
    const list = r.chance(0.5) && plan.openings.length > 0 ? 'openings' : 'rooms'
    const i = r.int(0, plan[list].length - 1)
    const [gone] = plan[list].splice(i, 1)
    return { kind: 'extra: delete an opening or a room', detail: list === 'rooms' ? 'room' : gone.type, target: gone.id, path: `${list}.${i}` }
  }
}

export const mentions = (text: string, id: string): boolean => {
  if (!id) return false
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^A-Za-z0-9._-])${escaped}($|[^A-Za-z0-9_-])`).test(text)
}

export interface BasePlan {
  readonly name: string
  readonly plan: Raw
  readonly size: number
}

/**
 * The 42 sound plans the damage is done to: the lab bench's two example plans, then 40 seeded
 * buildings (1 to 20 rooms, one or two floors, both ways of writing walls) whose every inside
 * wall line got a door, so their own report is quiet.
 */
export function basePlans(twoBedFlat: Raw, minimal: Raw): BasePlan[] {
  const out: { name: string; plan: Raw; size: number }[] = [
    { name: 'two-bed-flat', plan: clone(twoBedFlat), size: 0 },
    { name: 'minimal', plan: clone(minimal), size: 0 },
  ]
  let seed = 500
  for (const rooms of [1, 2, 2, 3, 4, 4, 6, 8, 12, 20]) {
    for (const mode of ['lines', 'pieces'] as const) {
      for (const floors of [1, 2]) {
        for (let tries = 0; tries < 50; tries++) {
          const gen = randomBuilding({ seed: ++seed, rooms, floors, mode })
          if (gen.meta.doorsMissing === 0) {
            out.push({ name: `b${seed}(${rooms}r,${floors}f,${mode})`, plan: gen.plan, size: 0 })
            break
          }
        }
      }
    }
  }
  for (const b of out) b.size = b.plan.walls.length + b.plan.rooms.length + b.plan.openings.length
  return out
}

export interface Damaged {
  readonly n: number
  readonly base: BasePlan
  readonly plan: unknown
  readonly mutation: Mutation
}

/** The seed and size of the lab's experiment 3. */
export const DAMAGE_SEED = 31337
export const DAMAGE_COUNT = 3000

/** One line per damaged plan, to compare a rebuild with the lab's own rows. */
export const fingerprint = (d: { n: number; base: string; mutation: Mutation }): string =>
  `${d.n}|${d.base}|${d.mutation.kind}|${d.mutation.path}|${d.mutation.detail}|${d.mutation.target}`

/** Rebuilds the damaged plans in order. Two in three are the six kinds the lab was asked for. */
export function* damageSet(bases: readonly BasePlan[], count = DAMAGE_COUNT): Generator<Damaged> {
  const r = rng(DAMAGE_SEED)
  const kinds = Object.keys(MUTATORS)
  const main = kinds.filter((k) => !k.startsWith('extra'))
  const extra = kinds.filter((k) => k.startsWith('extra'))
  for (let n = 0; n < count; n++) {
    const kind = n % 3 === 2 ? extra[Math.floor(n / 3) % extra.length]! : main[(n - Math.floor(n / 3)) % main.length]!
    let base = r.pick(bases)
    let plan: any = null
    let mutation: Mutation | null = null
    for (let tries = 0; tries < 30 && !mutation; tries++) {
      base = r.pick(bases)
      plan = clone(base.plan)
      mutation = MUTATORS[kind]!(plan, r)
    }
    if (!mutation) continue
    yield { n, base, plan, mutation }
  }
}

/** The 442 sound plans: the 42 bases and 400 more seeded buildings. */
export function soundPlans(bases: readonly BasePlan[]): { name: string; plan: Raw; truth?: ReadonlyMap<string, number> }[] {
  const plans: { name: string; plan: Raw; truth?: ReadonlyMap<string, number> }[] = bases.map((b) => ({ name: `base ${b.name}`, plan: b.plan }))
  const roomCounts = [1, 2, 3, 4, 6, 8, 12, 20, 40]
  for (let seed = 1; seed <= 400; seed++) {
    const gen = randomBuilding({ seed, rooms: roomCounts[seed % roomCounts.length]!, floors: 1 + (seed % 3 === 0 ? 1 : 0), mode: seed % 2 ? 'lines' : 'pieces' })
    plans.push({ name: `random ${seed}`, plan: gen.plan, truth: new Map(gen.truth.map((t) => [`${t.floor}|${t.id}`, t.area])) })
  }
  return plans
}
