/**
 * HND-11 (lab WR-14): the lengths taped on site against the drawing, as a table, after every run:
 * `grid check`, `grid_check` and the answer of every change to the plan (the edit tools, `grid
 * edit`, `grid_write_rooms` and `grid write`), as BRF-1's brief lines ride on a change's answer.
 * The rows are `tapedLengths`' from the plan as it now is; their wording is the record's
 * (`tapedWhatText`, `tapedFiguresText`), so the table and the lines say the same.
 */
import { fixedText, tapedLengths, tapedMissingText, tapedWhatText, type FloorPlan, type TapedRow } from '@ongrid/floorplan/geometry'
import { NULLABLE_NUMBER, NULLABLE_STRING, NUMBER, STRING, listSchema, objectSchema } from '../mcp/toolkit'

/** How many rows a change's answer lists, the ones that differ first; `grid check` lists them all. */
export const TAPED_ROWS_IN_AN_EDIT = 12

/** A row as a tool's data gives it. */
export const TAPED_OUTPUT = listSchema(
  objectSchema(
    {
      id: NULLABLE_STRING,
      room: STRING,
      roomName: STRING,
      floor: STRING,
      what: STRING,
      walls: listSchema(STRING),
      taped: NUMBER,
      drawn: NULLABLE_NUMBER,
      off: NULLABLE_NUMBER,
      within: NUMBER,
      state: STRING,
      missing: STRING,
      missingWalls: listSchema(STRING),
    },
    ['id', 'room', 'roomName', 'floor', 'what', 'walls', 'taped', 'drawn', 'off', 'within', 'state']
  )
)

const STATE_WORDS: Readonly<Record<TapedRow['state'], string>> = { agrees: 'agrees', differs: 'differs', 'not-measured': 'not measured' }
const m = (value: number): string => `${fixedText(value, 3)} m`
/** Drawn less taped, to the millimetre, signed unless it is none: `+0.082`, `-0.105`, `0.000`. */
const offText = (off: number): string => {
  const text = fixedText(Math.abs(off), 3)
  return Number(text) === 0 ? text : `${off > 0 ? '+' : '-'}${text}`
}

/** The plan's taped lengths against the drawing; empty for a plan that keeps none. */
export function tapedRows(plan: FloorPlan): TapedRow[] {
  return (plan.taped ?? []).length === 0 ? [] : tapedLengths(plan)
}

/** The heading's count: `5; 1 differs, 1 not measured`. */
function countText(rows: readonly TapedRow[]): string {
  const differ = rows.filter((row) => row.state === 'differs').length
  const missing = rows.filter((row) => row.state === 'not-measured').length
  const parts = [`${differ === 0 ? 'none' : differ} ${differ === 1 ? 'differs' : 'differ'}`, ...(missing === 0 ? [] : [`${missing} not measured`])]
  return `${rows.length}; ${parts.join(', ')}`
}

/**
 * The table, a heading and a row each, the columns lined up, or no line for a plan that keeps no
 * taped length. With `max`, the rows that differ or cannot be measured come first, and the rest
 * are counted after the last row shown.
 */
export function tapedTable(rows: readonly TapedRow[], options: { readonly max?: number } = {}): string[] {
  if (rows.length === 0) return []
  const order = options.max === undefined ? [...rows] : [...rows].sort((a, b) => rank(a) - rank(b) || a.index - b.index)
  const shown = options.max === undefined ? order : order.slice(0, options.max)
  const cells = shown.map((row) => [
    `${row.roomName}, ${tapedWhatText(row)}`,
    m(row.taped),
    row.drawn === null ? '-' : m(row.drawn),
    row.off === null ? '-' : offText(row.off),
    row.state === 'not-measured' ? `not measured: ${tapedMissingText(row) ?? ''}` : `${STATE_WORDS[row.state]} (within ${m(row.within)})`,
  ])
  const head = ['What was taped', 'taped', 'drawn', 'off', '']
  const width = head.map((_, k) => Math.max(head[k]!.length, ...cells.map((cell) => cell[k]!.length)))
  const pad = (cell: readonly string[]): string => `  ${cell.map((text, k) => (k === cell.length - 1 ? text : k === 0 ? text.padEnd(width[k]!) : text.padStart(width[k]!))).join('  ')}`.trimEnd()
  const lines = [`Taped against drawn (${countText(rows)}): each length taped on site, set against the drawing's inside faces.`, pad(head), ...cells.map(pad)]
  const hidden = order.slice(shown.length)
  const hiddenOff = hidden.filter((row) => row.state !== 'agrees').length
  if (hidden.length > 0) lines.push(`  … and ${hidden.length} more${hiddenOff === 0 ? ' that agree' : `, ${hiddenOff} of them not agreeing`}; grid check lists them all.`)
  return lines
}

const rank = (row: TapedRow): number => (row.state === 'differs' ? 0 : row.state === 'not-measured' ? 1 : 2)
