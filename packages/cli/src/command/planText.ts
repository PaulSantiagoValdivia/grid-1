/**
 * MSG-9: the text a plan file may hold, checked when the file is read, before the schema.
 *
 * A plan from someone else can hold anything in its names and ids. Grid quotes them, but a
 * name of fifty million characters, a line break that starts a line of its own in a report, a
 * direction character that shows a name backwards, or a control character that makes the 2D
 * drawing unreadable are refused here, naming the part and the limit, never the text itself.
 * Only the strings the schema keeps are looked at; everything else is the schema's to refuse.
 */

/** The most characters a name may have. */
export const NAME_MAX = 120
/** The most characters an id may have: the same as the tool server takes. */
export const ID_MAX = 64
/** The most characters the trace image's path may have. */
export const IMAGE_PATH_MAX = 1024
/** The most walls, rooms, openings, floors, items or stairs a plan may have, each. */
export const PARTS_MAX = 50_000
/** The most walls a room's boundary may list. */
export const BOUNDARY_MAX = 2_000
/** The largest plan file Grid reads, in bytes. */
export const PLAN_FILE_MAX_BYTES = 64 * 1024 * 1024

/** Line breaks of every kind: one would start a line of its own in a report. */
const LINE_BREAK = /[\n\r\u0085\u2028\u2029]/
/** Control characters (C0, DEL, C1), which a standalone SVG may not hold. */
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/
/** Characters that change the direction text is shown in, so a name can read backwards. */
const DIRECTION = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/
/** Half of a UTF-16 pair with no other half: no character at all. */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/

/** Every character the tool server refuses in an argument, too. */
export const UNSAFE_TEXT = new RegExp(`${LINE_BREAK.source}|${CONTROL.source}|${DIRECTION.source}|${LONE_SURROGATE.source}`)

function codePoint(text: string, pattern: RegExp): string {
  const found = pattern.exec(text)![0]
  return `U+${found.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`
}

/** What is wrong with one piece of text, or null. Never quotes the text. */
export function textProblem(text: string, kind: 'name' | 'id' | 'path'): string | null {
  if (LINE_BREAK.test(text)) return `holds a line break (${codePoint(text, LINE_BREAK)}); it must be one line`
  if (CONTROL.test(text)) return `holds a control character (${codePoint(text, CONTROL)})`
  if (DIRECTION.test(text)) return `holds a direction character (${codePoint(text, DIRECTION)}), which can show text backwards`
  if (LONE_SURROGATE.test(text)) return 'holds half of a character pair, which is no character'
  const max = kind === 'name' ? NAME_MAX : kind === 'id' ? ID_MAX : IMAGE_PATH_MAX
  if (text.length > max) return `is ${text.length.toLocaleString('en-US')} characters long; ${kind === 'id' ? 'an id' : `a ${kind}`} may have at most ${max}`
  return null
}

type Kind = 'name' | 'id' | 'path'

/** The strings of each part the schema keeps, and what each is. */
const FIELDS: Readonly<Record<string, Readonly<Record<string, Kind>>>> = {
  walls: { id: 'id', floor: 'id' },
  rooms: { id: 'id', name: 'name', floor: 'id' },
  openings: { id: 'id', wall: 'id' },
  floors: { id: 'id', name: 'name' },
  // LVL-3: a stair names the two floors it joins.
  stairs: { id: 'id', name: 'name', from: 'id', to: 'id' },
  // CNT-12: a fixture's kind is held to an id's limit, its label to a name's.
  items: { id: 'id', kind: 'id', label: 'name', floor: 'id' },
  // SHT-7: writing on the drawing and the sketch layer.
  annotations: { id: 'id', text: 'name', room: 'id', floor: 'id' },
  sketch: { id: 'id', category: 'id', text: 'name', floor: 'id' },
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The first text in a plan, as parsed from JSON, that passes a limit, as `rooms[3].name is …`,
 * or null. Types are left to the schema: a name that is not a string is not looked at here.
 */
export function planTextProblem(raw: Record<string, unknown>): string | null {
  for (const [list, fields] of Object.entries(FIELDS)) {
    const parts = raw[list]
    if (!Array.isArray(parts)) continue
    if (parts.length > PARTS_MAX) {
      return `${list} has ${parts.length.toLocaleString('en-US')} entries; a plan may have at most ${PARTS_MAX.toLocaleString('en-US')} ${list}`
    }
    for (let i = 0; i < parts.length; i++) {
      const part: unknown = parts[i]
      if (!isObject(part)) continue
      for (const [field, kind] of Object.entries(fields)) {
        const value = part[field]
        if (typeof value !== 'string') continue
        const problem = textProblem(value, kind)
        if (problem) return `${list}[${i}].${field} ${problem}`
      }
      if (list === 'rooms') {
        // The room's own walls, then each of its holes' (ARE-6).
        const lists: [string, unknown][] = [[`rooms[${i}].boundary`, part['boundary']]]
        const holes = part['holes']
        if (Array.isArray(holes)) {
          if (holes.length > PARTS_MAX) {
            return `rooms[${i}].holes has ${holes.length.toLocaleString('en-US')} entries; a plan may have at most ${PARTS_MAX.toLocaleString('en-US')} holes in one room`
          }
          holes.forEach((hole, h) => lists.push([`rooms[${i}].holes[${h}]`, hole]))
        }
        for (const [where, walls] of lists) {
          if (!Array.isArray(walls)) continue
          if (walls.length > BOUNDARY_MAX) {
            return `${where} lists ${walls.length.toLocaleString('en-US')} walls; a room may list at most ${BOUNDARY_MAX.toLocaleString('en-US')}`
          }
          for (let k = 0; k < walls.length; k++) {
            const id: unknown = walls[k]
            const problem = typeof id === 'string' ? textProblem(id, 'id') : null
            if (problem) return `${where}[${k}] ${problem}`
          }
        }
      }
    }
  }
  const projectId = raw['projectId']
  if (typeof projectId === 'string') {
    const problem = textProblem(projectId, 'id')
    if (problem) return `projectId ${problem}`
  }
  const title = raw['title']
  if (typeof title === 'string') {
    const problem = textProblem(title, 'name')
    if (problem) return `title ${problem}`
  }
  const image = raw['referenceImage']

  if (isObject(image) && typeof image['path'] === 'string') {
    const problem = textProblem(image['path'], 'path')
    if (problem) return `referenceImage.path ${problem}`
  }
  return null
}
