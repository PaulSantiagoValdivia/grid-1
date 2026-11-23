/**
 * CMD-7 (lab OT-6, Z-11): the plan file's structure as a JSON Schema, worked out from the schema
 * the plan is read with (`FloorPlanSchema`), so the two never drift apart. The command's build
 * writes it beside the bundled command (`plan.schema.json`), the tool server serves it
 * (`grid://schema/plan`), and a test validates the lab's plans against it.
 *
 * It describes the file as written, not the plan as read: a value the reading fills in (a wall's
 * thickness and height, a door's size from its type, a stair's walking line from its two ends) is
 * not required, and what only the reading records (`placedBy`, `unstated`, `typed`) is left out.
 * A field Grid does not know is allowed, as the reading allows it: Grid reads past it and names
 * it in a note (`plan/unknown-field`). A room use Grid does not read is allowed the same way
 * (the reading names it). What JSON Schema cannot say, such as a wall's ends lying on its arc or
 * an id naming a part that exists, is left to the reading and `grid check`.
 *
 * Draft-07, the version most validators read. Pure: no file, no network.
 */
import { z } from 'zod'
import * as plan from './floorplan'

/** The plan file's format version, the one `version` in a plan file holds. */
export const PLAN_FORMAT_VERSION: string = plan.FloorPlanFieldsSchema.shape.version.removeDefault().value

/** A JSON Schema, as plain data. */
export type JsonSchema = { readonly [key: string]: unknown }

type Mutable = Record<string, unknown>

/** Fields only the reading records, never a file (`statedWall`, `statedOpening`). */
const READING_ONLY: ReadonlySet<string> = new Set(['placedBy', 'unstated', 'typed'])

/**
 * Fields the reading fills in when a file leaves them out, by the part's schema: a wall's
 * thickness, height (`withWallDefaults`) and kind; an opening's or a pattern opening's size from
 * its door or window type (`withTypes`, C24); a stair's walking line from its ends (`withRunFromEnds`).
 */
const FILLED = new Map<z.ZodTypeAny, readonly string[]>([
  [plan.WallSchema, ['thickness', 'height']],
  [plan.OpeningSchema, ['width', 'height']],
  [plan.PatternOpeningSchema, ['width', 'height']],
  [plan.StairSchema, ['run']],
])

/** What the file form adds to a part's fields: a straight stair may give its two ends for its walking line. */
const POINT = { type: 'array', items: [{ type: 'number' }, { type: 'number' }], minItems: 2, maxItems: 2, additionalItems: false }
const EXTRA_FIELDS = new Map<z.ZodTypeAny, Readonly<Record<string, JsonSchema>>>([
  [plan.StairSchema, { start: POINT, end: POINT }],
])
const EXTRA_RULES = new Map<z.ZodTypeAny, Readonly<Mutable>>([
  [plan.StairSchema, { anyOf: [{ required: ['run'] }, { required: ['start', 'end'] }] }],
])

/** The schemas the plan's module names, by name, so each is written once and referred to. */
function namedSchemas(): Map<z.ZodTypeAny, string> {
  const named = new Map<z.ZodTypeAny, string>()
  for (const [key, value] of Object.entries(plan)) {
    if (!key.endsWith('Schema') || !(value instanceof z.ZodType)) continue
    if (key === 'FloorPlanSchema' || key === 'FloorPlanFieldsSchema' || key === 'PlanSchemaError') continue
    // The opening's fields and the opening are one part; the opening's name is kept.
    if (key === 'OpeningFieldsSchema') continue
    if (!named.has(value)) named.set(value, key.slice(0, -'Schema'.length))
  }
  return named
}

/** The tightest of two schemas for one value: `inner`'s keys, with what `outer` adds. */
function merged(inner: Mutable, outer: Mutable): Mutable {
  const out: Mutable = { ...outer }
  for (const [key, value] of Object.entries(inner)) out[key] = value
  return out
}

class Writer {
  readonly definitions: Record<string, JsonSchema> = {}
  private readonly names = namedSchemas()

  /** The schema for one zod node, by reference when it is a named one. */
  node(schema: z.ZodTypeAny): Mutable {
    const name = this.names.get(schema)
    if (name === undefined) return this.inline(schema)
    if (!(name in this.definitions)) {
      this.definitions[name] = {}
      this.definitions[name] = this.inline(schema)
    }
    return { $ref: `#/definitions/${name}` }
  }

  private inline(schema: z.ZodTypeAny): Mutable {
    const def = schema._def as { typeName: z.ZodFirstPartyTypeKind } & Record<string, unknown>
    const kind = z.ZodFirstPartyTypeKind
    switch (def.typeName) {
      case kind.ZodString:
        return this.string(schema as z.ZodString)
      case kind.ZodNumber:
        return this.number(schema as z.ZodNumber)
      case kind.ZodBoolean:
        return { type: 'boolean' }
      case kind.ZodNull:
        return { type: 'null' }
      case kind.ZodLiteral: {
        const value = (schema as z.ZodLiteral<unknown>).value
        return { type: typeof value, const: value }
      }
      case kind.ZodEnum:
        return { type: 'string', enum: [...(schema as z.ZodEnum<[string, ...string[]]>).options] }
      case kind.ZodArray: {
        const array = schema as z.ZodArray<z.ZodTypeAny>
        const out: Mutable = { type: 'array', items: this.node(array.element) }
        const d = array._def
        if (d.minLength !== null) out['minItems'] = d.minLength.value
        if (d.maxLength !== null) out['maxItems'] = d.maxLength.value
        if (d.exactLength !== null) Object.assign(out, { minItems: d.exactLength.value, maxItems: d.exactLength.value })
        return out
      }
      case kind.ZodTuple: {
        const tuple = schema as z.ZodTuple
        const items = tuple.items.map((item: z.ZodTypeAny) => this.node(item))
        const rest = tuple._def.rest as z.ZodTypeAny | null
        return {
          type: 'array',
          items,
          minItems: items.length,
          ...(rest === null ? { maxItems: items.length, additionalItems: false } : { additionalItems: this.node(rest) }),
        }
      }
      case kind.ZodObject:
        return this.object(schema as z.AnyZodObject, schema)
      case kind.ZodRecord: {
        const record = schema as z.ZodRecord
        return { type: 'object', additionalProperties: this.node(record.valueSchema) }
      }
      case kind.ZodUnion:
      case kind.ZodDiscriminatedUnion: {
        const options = (def['options'] as readonly z.ZodTypeAny[] | Map<unknown, z.ZodTypeAny>)
        const list = options instanceof Map ? [...options.values()] : options
        return { anyOf: list.map((option) => this.node(option)) }
      }
      case kind.ZodIntersection:
        return { allOf: [this.node(def['left'] as z.ZodTypeAny), this.node(def['right'] as z.ZodTypeAny)] }
      case kind.ZodOptional:
      case kind.ZodNullable:
      case kind.ZodReadonly:
        return this.node((def['innerType'] as z.ZodTypeAny))
      case kind.ZodDefault: {
        const inner = this.node(def['innerType'] as z.ZodTypeAny)
        return { ...inner, default: (def['defaultValue'] as () => unknown)() }
      }
      case kind.ZodCatch:
        // A value the reading cannot read is read as unstated and named: the file may hold it.
        return this.caught(def['innerType'] as z.ZodTypeAny)
      case kind.ZodBranded:
        return this.node(def['type'] as z.ZodTypeAny)
      case kind.ZodLazy:
        return this.node((def['getter'] as () => z.ZodTypeAny)())
      case kind.ZodPipeline:
        return merged(this.node(def['in'] as z.ZodTypeAny), this.node(def['out'] as z.ZodTypeAny))
      case kind.ZodEffects: {
        // A check or a reading step over a part: the part, in its file form when the reading
        // fills or moves some of its fields (`FILLED`).
        let inner = (schema as z.ZodEffects<z.ZodTypeAny>).innerType()
        while (inner instanceof z.ZodEffects) inner = inner.innerType()
        if (inner instanceof z.ZodObject) return this.object(inner, schema)
        return this.node(inner)
      }
      case kind.ZodAny:
      case kind.ZodUnknown:
        return {}
      default:
        throw new Error(`planJsonSchema: no JSON Schema for a ${def.typeName}`)
    }
  }

  private string(schema: z.ZodString): Mutable {
    const out: Mutable = { type: 'string' }
    for (const check of schema._def.checks) {
      if (check.kind === 'min') out['minLength'] = check.value
      else if (check.kind === 'max') out['maxLength'] = check.value
      else if (check.kind === 'length') Object.assign(out, { minLength: check.value, maxLength: check.value })
      else if (check.kind === 'regex') out['pattern'] = check.regex.source
    }
    return out
  }

  private number(schema: z.ZodNumber): Mutable {
    const out: Mutable = { type: 'number' }
    for (const check of schema._def.checks) {
      if (check.kind === 'int') out['type'] = 'integer'
      else if (check.kind === 'min') out[check.inclusive ? 'minimum' : 'exclusiveMinimum'] = check.value
      else if (check.kind === 'max') out[check.inclusive ? 'maximum' : 'exclusiveMaximum'] = check.value
      else if (check.kind === 'multipleOf') out['multipleOf'] = check.value
    }
    return out
  }

  /** A field the reading reads as unstated when it cannot read it: its form, or anything else. */
  private caught(inner: z.ZodTypeAny): Mutable {
    return { anyOf: [this.node(inner), {}] }
  }

  /** An object's fields, in their file form when `part` is a part whose reading fills some in. */
  private object(object: z.AnyZodObject, part: z.ZodTypeAny): Mutable {
    const filled = new Set(FILLED.get(part) ?? [])
    const properties: Mutable = {}
    const required: string[] = []
    for (const [key, field] of Object.entries(object.shape as Record<string, z.ZodTypeAny>)) {
      if (READING_ONLY.has(key)) continue
      properties[key] = key === 'use' && object === plan.RoomSchema ? this.use() : this.node(field)
      if (!field.isOptional() && !filled.has(key)) required.push(key)
    }
    for (const [key, field] of Object.entries(EXTRA_FIELDS.get(part) ?? {})) properties[key] = field
    return {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
      ...(EXTRA_RULES.get(part) ?? {}),
    }
  }

  /**
   * A room's use: one of Grid's uses, or a word that plainly means one (`USE_WORDS`, in any
   * capitals), or any other value, which the reading reads as unstated and names (MSG-4).
   */
  private use(): Mutable {
    return {
      anyOf: [
        { type: 'string', enum: [...plan.ROOM_USES] },
        { type: 'string', enum: Object.keys(plan.USE_WORDS) },
        {},
      ],
    }
  }
}

/**
 * The plan file's structure as a draft-07 JSON Schema, with its format version in `$id` and in
 * `version`. The same object every time for the same code.
 */
export function planJsonSchema(): JsonSchema {
  const writer = new Writer()
  const root = writer.node(plan.FloorPlanSchema)
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: `urn:ongrid:plan:${PLAN_FORMAT_VERSION}`,
    title: `Grid plan file, format version ${PLAN_FORMAT_VERSION}`,
    description: 'A floor plan as Grid stores it: floors, walls, rooms and openings in metres. Generated from the schema Grid reads plans with. A field Grid does not know is allowed and named in a note; what this schema cannot say is checked by grid check.',
    ...root,
    definitions: Object.fromEntries(Object.entries(writer.definitions).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
  }
}
