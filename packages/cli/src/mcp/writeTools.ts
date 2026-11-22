/**
 * The tools of `grid serve` that write: an export file beside the plan, the live preview, the
 * plan written from rooms text (WRT-2, the main way to write one), and the three changes to the
 * plan itself (an opening, one side of a room, a mirror).
 *
 * A change to the plan reads the file, works out the change on Grid's reading of it, and
 * writes the file's own JSON back with only that change in it. It is refused, and nothing is
 * written, when it would leave the drawing with a problem it did not have.
 */
import { planFloors, validatePlan, type FloorPlan } from '@ongrid/floorplan/geometry'
import { keptDerived } from '@ongrid/floorplan/rooms'
import { doorsThatChangedRooms } from '@ongrid/floorplan/geometry/rules/doors'
import { EXPORT_FORMATS, isExportFormat } from '@ongrid/floorplan/export'
import { inspectPlan } from '@ongrid/rules'
import { checkExportRequest, ExportWriteFailed, exportIntoProject, leftOutText } from '../command/export'
import { UsageError } from '../command/options'
import { PlanRefused } from '../command/plan'
import { changeOpening, DIRECTIONS, EditRefused, FROMS, insideAcross, KEEPS, MIRRORS, mirrorPlan, moveRoomSide, applyPatch, type Direction, type From, type Mirror, type Patch } from '../edit/edits'
import { parseSheetWords, SheetWordsRefused, sheetWordsJsonSchema, sheetWordsProblem } from '@ongrid/floorplan/types/sheet'
import { checkSheetRequest, readSheetWords, sheetIntoProject } from '../sheet/sheetFile'
import { RoomsRefused, writeRoomsIntoProject } from '../command/write'
import type { SheetLayout } from '../sheet/pages'
import { PATH_MAX, PathRefused, quoted } from '../fs/projectFiles'
import { ROOM_NAMES_TRAVEL } from './protocol'
import { comparePlans } from '../quantities/compare'
import { surveyPlan, type Survey } from '../quantities/survey'
import { openingBetween } from './readTools'
import {
  asRefusal,
  FLOOR_ARG,
  floorArg,
  listSchema,
  NULLABLE_STRING,
  objectSchema,
  openingArg,
  PLAN_ARG,
  planFileOf,
  projectOf,
  readPlan,
  roomArg,
  STRING,
  ToolRefusal,
  type GridTool,
  type ToolContext,
} from './toolkit'

export const EXPORT_TOOL_NAME = 'grid_export'
export const PREVIEW_TOOL_NAME = 'grid_preview'
export const PREVIEW_NOTE_MAX = 120

const q = (text: string): string => JSON.stringify(text)

// ---------------------------------------------------------------------------------------------
// grid_export

/** The command's messages name its options; a tool names its arguments. */
function asArguments(message: string): string {
  return message.replace(/--(format|floor|layout|sheet)\b/g, '$1')
}

/** What a written file leaves out of the plan, for the agent. */
function leftOutLine(count: number): string {
  return `Left out ${count} part${count === 1 ? '' : 's'} that can't be drawn: grid check says which and why.`
}

const exportTool: GridTool = {
  name: EXPORT_TOOL_NAME,
  title: 'Export the plan',
  hint: 'write-file',
  description:
    'Use this when the person wants the plan as a file to open in another program: dxf for AutoCAD and other 2D CAD programs (the nearest to DWG), ifc for BIM programs such as Revit, glb or obj for 3D. '
    + 'It writes the file into the exports folder beside the plan, replacing an earlier copy of the same export, and answers with the path it wrote and every part of the plan the file leaves out (the file says so too). It never changes the plan, and refuses a file that would hold nothing of it. '
    + `${ROOM_NAMES_TRAVEL} `
    + 'Do not use for a picture to look at (grid_view). For a PDF to read or print, use grid_sheet; JPG is not made. The plan must be a file inside the project folder: any other path is refused.',
  args: {
    plan: { type: 'string', maxLength: PATH_MAX, required: true, description: 'The plan file, as a path inside the project folder.', examples: ['floor-plan.json', 'plan.json'] },
    format: { type: 'string', required: true, enum: EXPORT_FORMATS, description: 'The file format.', examples: ['dxf', 'ifc'] },
    floor: { ...FLOOR_ARG, description: 'dxf, obj and glb only: a floor id from the plan\'s "floors". The lowest floor when left out.' },
  },
  outputSchema: objectSchema({
    written: STRING,
    format: STRING,
    leftOut: { type: 'number' },
    leftOutParts: listSchema(
      objectSchema({ kind: STRING, id: NULLABLE_STRING, place: NULLABLE_STRING, floor: NULLABLE_STRING, code: NULLABLE_STRING }, ['kind', 'id', 'place', 'floor', 'code'])
    ),
    note: { type: ['string', 'null'] },
  }),
  run(args, context) {
    const project = projectOf(context)
    const plan = args['plan'] as string
    const format = args['format'] as string
    const floor = args['floor'] as string | undefined
    if (!isExportFormat(format)) throw new ToolRefusal(`Pass format: one of ${EXPORT_FORMATS.join(', ')}.`)
    // The floor is checked against the plan first, so an unknown one is not repeated back (MS-19).
    if (floor !== undefined) floorArg(readPlan(context, plan).loaded.plan, floor)
    try {
      checkExportRequest({ format, floor })
      const done = exportIntoProject(project, plan, format, { floor })
      const written = project.relative(done.written)
      const lines = [`Wrote ${quoted(written)} in the project folder.`]
      if (done.note) lines.push(done.note)
      // HND-6: what this file leaves out, which the file says too.
      const left = leftOutText(done.leftOut)
      if (left !== null) lines.push(left)
      return { text: lines.join('\n'), data: { written, format, leftOut: done.leftOut.length, leftOutParts: done.leftOut, note: done.note ?? null } }
    } catch (error) {
      if (error instanceof PathRefused || error instanceof PlanRefused || error instanceof ExportWriteFailed) throw new ToolRefusal(error.message)
      if (error instanceof UsageError) throw new ToolRefusal(asArguments(error.message))
      throw error
    }
  },
}

// ---------------------------------------------------------------------------------------------
// grid_preview

const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200e\u200f\u202a-\u202e\u2066-\u2069]/g

const previewTool: GridTool = {
  name: PREVIEW_TOOL_NAME,
  title: 'Show in preview',
  hint: 'read',
  description:
    'Use this when you have changed the plan, once, to point the person at the change in Grid\'s live preview, or when they ask to see a floor or a room there: the floor you changed, the view that shows it best (3d for heights and volumes, 2d for layout), and a short note in your own words saying what to look at. '
    + 'It only moves the preview; it changes nothing in the plan. The floor and room are checked against the plan. Do not use to get a picture back (grid_view).',
  args: {
    plan: PLAN_ARG,
    floor: { ...FLOOR_ARG, description: 'A floor id from the plan\'s "floors".' },
    room: { type: 'string', id: true, description: 'A room id. The preview shows the floor that room is on.', examples: ['kitchen', 'f1-r2'] },
    view: { type: 'string', enum: ['2d', '3d'], description: '2d for the plan view, 3d for the model.', examples: ['2d', '3d'] },
    note: { type: 'string', maxLength: 500, description: `One short sentence for the person, in your own words, saying what to look at. Cut to ${PREVIEW_NOTE_MAX} characters.`, examples: ['The new bathroom is behind the kitchen.'] },
  },
  outputSchema: objectSchema({ floor: STRING, view: { type: ['string', 'null'] }, room: { type: ['string', 'null'] }, note: { type: ['string', 'null'] } }),
  run(args, context) {
    if (args['floor'] === undefined && args['room'] === undefined && args['view'] === undefined) {
      throw new ToolRefusal('Pass a floor id, a room id or a view ("2d" or "3d"), and a short note.')
    }
    const { loaded } = readPlan(context, args['plan'])
    const plan: FloorPlan = loaded.plan
    let floor = floorArg(plan, args['floor'])
    const room = args['room'] === undefined ? undefined : roomArg(plan, args['room'])
    if (room !== undefined) {
      const of = plan.rooms.find((r) => r.id === room)!.floor ?? 'ground'
      if (floor !== undefined && floor !== of) throw new ToolRefusal(`That room is on floor ${q(of)}, not the floor named.`)
      floor = of
    }
    const shown = floor ?? surveyPlan(plan).facts.floors[0]?.id ?? 'ground'
    const view = (args['view'] as string | undefined) ?? null
    const note = (args['note'] as string | undefined)?.replace(CONTROL, '').trim().slice(0, PREVIEW_NOTE_MAX) || null
    const text = `Showing floor ${q(shown)}${room ? `, room ${q(room)}` : ''}${view ? ` in ${view}` : ''}${note ? `, with your note` : ''}.`
    return { text, data: { floor: shown, view, room: room ?? null, note } }
  },
}

// ---------------------------------------------------------------------------------------------
// grid_sheet

export const SHEET_TOOL_NAME = 'grid_sheet'

/** The layout, checked as the command checks it, with the command's refusal in a tool's words. */
function sheetLayoutOf(layout: unknown, withWords: boolean): SheetLayout {
  try {
    return checkSheetRequest({ layout: layout as string | undefined, sheet: withWords ? 'sheet' : undefined })
  } catch (error) {
    if (error instanceof UsageError) throw new ToolRefusal(asArguments(error.message))
    throw error
  }
}

const sheetTool: GridTool = {
  name: SHEET_TOOL_NAME,
  title: 'Make a PDF sheet',
  hint: 'write-file',
  description:
    'Use this when the person wants the plan as a PDF to read, print or send: layout client for the person the house is for (a cover with the 3D model and key figures, then a page per floor with its drawing and room areas), or layout check for whoever checks the plan (every id, every room\'s use, and what grid check finds on each floor). '
    + 'The words of a client sheet (name, headline, intro, a few paragraphs per floor) are yours to write: pass them as sheet, or Grid reads sheet.json beside the plan. Grid draws only what the plan holds: no furniture or landscape. Every page carries "General guidance, not your local rules". '
    + 'It writes the PDF into the exports folder beside the plan, replacing an earlier sheet of the same name and layout, and answers with the path and what is on each page. It never changes the plan. '
    + `${ROOM_NAMES_TRAVEL} `
    + 'Do not use for a single picture (grid_view) or a file for another program (grid_export).',
  args: {
    plan: { type: 'string', maxLength: PATH_MAX, required: true, description: 'The plan file, as a path inside the project folder.', examples: ['plan.json'] },
    layout: { type: 'string', required: true, enum: ['client', 'check'], description: 'client or check.', examples: ['client', 'check'] },
    sheet: {
      type: 'object',
      description: 'Client only: the words, as sheet.json holds them. sheet.json beside the plan is read when left out.',
      examples: [{ version: '1', name: 'Solace House', headline: 'A private retreat for one', intro: ['A two-storey home for work and rest.'], floors: { ground: ['The study sits beside the entry.'] } }],
      schema: sheetWordsJsonSchema(),
      // The shape and limits here; the plan's floor ids in run(), where the plan is known.
      read: (value, earlier) => {
        // A check sheet takes no words: that refusal comes before any about the words.
        sheetLayoutOf(earlier['layout'], true)
        const problem = sheetWordsProblem(value, null)
        if (problem !== null) throw new ToolRefusal(`The sheet words: ${problem}.`)
        return value
      },
    },
  },
  outputSchema: objectSchema({ written: STRING, layout: STRING, pages: { type: 'array', items: objectSchema({ kind: STRING, title: NULLABLE_STRING, floor: STRING }, ['kind', 'title']) }, leftOut: { type: 'number' }, note: { type: ['string', 'null'] } }),
  async run(args, context) {
    // Already read: layout is one of the two, and words with a check sheet were refused there.
    const layout = args['layout'] as SheetLayout
    const given = args['sheet'] as Record<string, unknown> | undefined
    try {
      const { project, file, loaded } = readPlan(context, args['plan'])
      const words = layout === 'check'
        ? null
        : given !== undefined
          ? parseSheetWords(given, planFloors(loaded.plan).map((floor) => floor.id))
          : readSheetWords(project, file, loaded, undefined)
      const done = await sheetIntoProject(project, file, layout, words)
      const written = project.relative(done.written)
      const lines = [`Wrote ${quoted(written)} in the project folder: ${done.pages.length} pages.`]
      if (done.note) lines.push(done.note)
      const leftOut = done.loaded.broken.size
      if (leftOut > 0) lines.push(leftOutLine(leftOut))
      return { text: lines.join('\n'), data: { written, layout, pages: done.pages, leftOut, note: done.note ?? null } }
    } catch (error) {
      if (error instanceof SheetWordsRefused) throw new ToolRefusal(`The sheet words: ${error.message}.`)
      if (error instanceof ExportWriteFailed) throw new ToolRefusal(error.message)
      throw asRefusal(error)
    }
  },
}

// ---------------------------------------------------------------------------------------------
// The changes to the plan

export const OUT_ARG = {
  type: 'string' as const,
  maxLength: PATH_MAX,
  description: 'Write the changed plan to this file, inside the project folder, ending in .json, and leave plan as it is. The plan itself is replaced when left out.',
  examples: ['option-b2.json', 'plan.json'],
}

export const EDIT_OUTPUT = objectSchema({
  written: STRING,
  changed: listSchema(STRING),
  verdict: STRING,
  drawingProblems: objectSchema({ before: { type: 'number' }, after: { type: 'number' } }),
  // MSG-1: the result record's one count, before and after, as grid_check gives it.
  toLookAt: objectSchema({ before: { type: 'number' }, after: { type: 'number' } }),
  // MSG-14: each door or doorless opening that joins other rooms after the change, in words.
  doors: listSchema(STRING),
  // WRT-3: what the request left open and Grid chose, and what the change could not keep.
  guessed: listSchema(STRING),
  couldNotKeep: listSchema(STRING),
})

function errorsOf(plan: FloorPlan): Array<{ id: string; message: string }> {
  return validatePlan(plan).issues.filter((i) => i.severity === 'error').map((i) => ({ id: i.id, message: i.message }))
}

/** Applies a patch to the plan file, or refuses it with nothing written. */
export function writeChange(context: ToolContext, args: Record<string, unknown>, make: (survey: Survey) => Patch): { text: string; data: Record<string, unknown> } {
  const { project, file, loaded } = readPlan(context, args['plan'], { whole: true })
  const out = (args['out'] as string | undefined) ?? file
  if (!out.toLowerCase().endsWith('.json')) throw new ToolRefusal('out must name a .json file.')
  const before = surveyPlan(loaded.plan)
  let patch: Patch
  try {
    patch = make(before)
  } catch (error) {
    if (error instanceof EditRefused) throw new ToolRefusal(`${error.message} Nothing was written.`)
    throw error
  }
  // A plan written rooms first keeps its derived boundaries derived through Grid's own edits (WRT-2).
  const after = keptDerived(loaded.plan.rooms, applyPatch(loaded.plan as unknown as Record<string, unknown>, patch)) as unknown as FloorPlan
  const oldErrors = errorsOf(loaded.plan)
  const newErrors = errorsOf(after)
  const known = new Set(oldErrors.map((e) => `${e.id}|${e.message}`))
  const fresh = newErrors.filter((e) => !known.has(`${e.id}|${e.message}`))
  if (fresh.length > 0) {
    throw new ToolRefusal(`That change would break the drawing, so nothing was written: ${q(fresh[0]!.id)}: ${fresh[0]!.message}${fresh.length > 1 ? ` (and ${fresh.length - 1} more)` : ''}`)
  }
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(project.readText(file).text) as Record<string, unknown>
  } catch (error) {
    if (error instanceof PathRefused) throw new ToolRefusal(error.message)
    throw new ToolRefusal(`${file} could not be read again to write the change; nothing was written.`)
  }
  let written: string
  let next: unknown
  try {
    next = keptDerived(loaded.plan.rooms, applyPatch(raw, patch))
    written = project.relative(project.writeFile(out, `${JSON.stringify(next, null, 2)}\n`))
  } catch (error) {
    if (error instanceof PathRefused) throw new ToolRefusal(error.message)
    throw new ToolRefusal(`Can't write ${quoted(out)}: ${String((error as Error).message).replace(/\s+/g, ' ')}`)
  }
  const verdict = comparePlans(before, surveyPlan(after), ['the plan before', 'the plan now']).verdict
  // A door that joined a room now part of another (a merge) joins the same space: not a change.
  const become = patch.roomsBecome ?? new Map<string, string>()
  const key = (sides: readonly object[]): string => sides.map((side) => ('room' in side ? `r${become.get((side as { room: string }).room) ?? (side as { room: string }).room}` : JSON.stringify(side))).sort().join('|')
  const doors = doorsThatChangedRooms(loaded.plan, after)
    .filter((change) => become.size === 0 || key(change.before) !== key(change.after))
    .map((change) => `${change.message}.`)
  const drawingProblems = { before: validatePlan(loaded.plan).issues.length, after: validatePlan(after).issues.length }
  // The files as written, before and after (MSG-4): a field Grid does not read is kept by the change, and counted.
  const toLookAt = { before: inspectPlan(raw).count, after: inspectPlan(next).count }
  const guessed = [...(patch.guessed ?? [])]
  const couldNotKeep = [...(patch.notKept ?? [])]
  const text = [
    ...patch.said,
    ...guessed.map((line) => `Guessed: ${line}`),
    ...couldNotKeep.map((line) => `Could not keep: ${line}`),
    verdict,
    ...doors,
    `To look at: ${toLookAt.before} → ${toLookAt.after}, of them problems in the drawing ${drawingProblems.before} → ${drawingProblems.after}. grid_check lists them.`,
    `Wrote ${quoted(written)}.`,
  ].join('\n')
  return { text, data: { written, changed: [...patch.said], verdict, drawingProblems, toLookAt, doors, guessed, couldNotKeep, ...(patch.extra ?? {}) } }
}

const changeOpeningTool: GridTool = {
  name: 'grid_change_opening',
  title: 'Change or remove a door or window',
  hint: 'change-plan',
  description:
    'Use this when the person asks to make a door or window wider or narrower, change which room a door opens into, raise or lower a sill, turn a window into a door, or take a door or window out: "bathroom door to 90 cm, opening outwards", "block the kitchen door", "a 4 m opening to the garden". '
    + 'It changes one opening in place and answers with what changed and the area verdict. A width that does not fit is refused with the free stretches of the wall, and nothing is written. '
    + 'To move it to another wall, pass room and side ("the bathroom door to its north wall"); to place it, from and distance, as rooms text does ("0.25 from west"): from a side of room, or without room from an end of its wall. Given from, it keeps that distance when walls move later (its anchor). '
    + 'Do not use to move a wall (grid_move_room_side). Grid has doors, windows and doorless openings only: no bifold, sliding or roof windows. It replaces the plan file unless out is given. Units are metres.',
  args: {
    plan: PLAN_ARG,
    opening: { type: 'string', id: true, required: true, description: 'The id of the door, window or opening to change (grid_describe with for=agent lists them).', examples: ['door-bath', 'win-kitchen'] },
    width: { type: 'number', description: 'The new width of the hole in the wall, in metres.', examples: [0.9, 4], minimum: 0.3, maximum: 20 },
    keep: { type: 'string', enum: KEEPS, description: 'Which point stays put when the width changes: start (the end nearer the wall\'s start), centre or end. centre when left out.', examples: ['centre', 'start'] },
    height: { type: 'number', description: 'The new height of the opening, in metres.', examples: [2.1, 1.2], minimum: 0.2, maximum: 10 },
    sill: { type: 'number', description: 'Windows: the new sill above the floor, in metres.', examples: [0.9, 0.6], minimum: 0, maximum: 5 },
    type: { type: 'string', enum: ['door', 'window', 'opening'], description: 'Make it a door, a window or a doorless opening.', examples: ['door', 'opening'] },
    opens_into: { type: 'string', id: true, description: 'Doors: the room id it opens into, or "outside".', examples: ['hall', 'outside'] },
    hinge: { type: 'string', enum: ['start', 'end'], description: 'Doors: the end of the opening it hangs from, start being nearer the wall\'s start.', examples: ['start', 'end'] },
    remove: { type: 'boolean', description: 'true to take the opening out and leave the wall solid. Takes nothing else.', examples: [true] },
    room: { type: 'string', id: true, description: 'A room: with side, the opening moves to that side of it; with from, it is measured from that room\'s side.', examples: ['bath', 'hall'] },
    side: { type: 'string', enum: DIRECTIONS, description: 'With room: the side of that room whose wall it moves to.', examples: ['north'] },
    from: { type: 'string', enum: FROMS, description: 'What its place is measured and kept from: with room, a side of that room (its inside face); without, an end of its wall: start, end, or the end toward north, east, south or west.', examples: ['west', 'start'] },
    distance: { type: 'number', description: 'Metres from that side or end to the opening\'s nearer edge. Left out with from, the distance it has now is kept.', examples: [0.25, 0.1], minimum: 0, maximum: 100 },
    out: OUT_ARG,
  },
  outputSchema: EDIT_OUTPUT,
  run(args, context) {
    return writeChange(context, args, (survey) => {
      const id = openingArg(survey.plan, args['opening'])
      if (args['room'] !== undefined) roomArg(survey.plan, args['room'])
      if (args['opens_into'] !== undefined && args['opens_into'] !== 'outside') roomArg(survey.plan, args['opens_into'], 'opens_into room')
      const patch = changeOpening(survey, id, {
        ...(args['width'] !== undefined ? { width: args['width'] as number } : {}),
        ...(args['keep'] !== undefined ? { keep: args['keep'] as (typeof KEEPS)[number] } : {}),
        ...(args['height'] !== undefined ? { height: args['height'] as number } : {}),
        ...(args['sill'] !== undefined ? { sill: args['sill'] as number } : {}),
        ...(args['type'] !== undefined ? { type: args['type'] as 'door' | 'window' | 'opening' } : {}),
        ...(args['opens_into'] !== undefined ? { opensInto: args['opens_into'] as string } : {}),
        ...(args['hinge'] !== undefined ? { hinge: args['hinge'] as 'start' | 'end' } : {}),
        ...(args['remove'] === true ? { remove: true } : {}),
        ...(args['room'] !== undefined ? { room: args['room'] as string } : {}),
        ...(args['side'] !== undefined ? { side: args['side'] as Direction } : {}),
        ...(args['from'] !== undefined ? { from: args['from'] as From } : {}),
        ...(args['distance'] !== undefined ? { distance: args['distance'] as number } : {}),
      })
      const between = openingBetween(survey, id)
      return between ? { ...patch, said: [...patch.said, `It is between ${between}.`] } : patch
    })
  },
}

const moveSideTool: GridTool = {
  name: 'grid_move_room_side',
  title: 'Move one side of a room',
  hint: 'change-plan',
  description:
    'Use this when the person asks to make a room deeper or wider by moving one of its walls, or to build out: "go out 3 m at the back, full width", "make the kitchen 1 m longer", "bring the bedroom wall in 0.5 m". '
    + 'It moves the wall on the named side of the room straight out (a positive distance) or in (negative), or to give the room an inside size (to: "the kitchen 4 m deep"); walls that end on it follow, and its doors and windows move with it. Doors and windows on the walls that grow keep their anchor or their place in the building, and a door that would end up between other rooms follows the wall where it can. It answers with every room whose area changed, what it guessed and what it could not keep. '
    + 'Only a side square to the drawing moves: north is the top of the drawing. Do not use to add a separate room or to split one. It replaces the plan file unless out is given. Units are metres.',
  args: {
    plan: PLAN_ARG,
    room: { type: 'string', id: true, required: true, description: 'The room whose side moves.', examples: ['kitchen', 'bed1'] },
    side: { type: 'string', enum: DIRECTIONS, required: true, description: 'Which side of the room: north (the top of the drawing), east, south or west.', examples: ['north', 'east'] },
    by: { type: 'number', description: 'Metres to move it: positive makes the room bigger, negative smaller. Pass by or to.', examples: [3, -0.5], minimum: -50, maximum: 50 },
    to: { type: 'number', description: 'The room\'s inside size across that side after the move, in metres: its depth for north or south, its width for east or west. Pass by or to.', examples: [4, 3.2], minimum: 0.3, maximum: 100 },
    out: OUT_ARG,
  },
  outputSchema: EDIT_OUTPUT,
  run(args, context) {
    if (args['by'] === undefined && args['to'] === undefined) throw new ToolRefusal('Pass by (metres to move it) or to (the inside size it should have).')
    if (args['by'] !== undefined && args['to'] !== undefined) throw new ToolRefusal('Pass by or to, not both.')
    if (args['by'] === 0) throw new ToolRefusal('by is 0: nothing would move.')
    return writeChange(context, args, (survey) => {
      const id = roomArg(survey.plan, args['room'])
      const room = survey.byId.get(id)
      if (!room || room.polygon.length < 3) throw new EditRefused('That room has no outline Grid can measure; grid_check says why.')
      const side = args['side'] as Direction
      if (args['to'] === undefined) return moveRoomSide(survey, id, side, args['by'] as number)
      const now = insideAcross(survey, id, side)
      const by = (args['to'] as number) - now
      const across = side === 'north' || side === 'south' ? 'depth (north-south)' : 'width (east-west)'
      if (Math.abs(by) < 0.0005) throw new EditRefused(`${JSON.stringify(room.facts.name)} is ${now.toFixed(2)} m inside already, its ${across}.`)
      const patch = moveRoomSide(survey, id, side, by)
      return { ...patch, said: [`${JSON.stringify(room.facts.name)}: inside ${across} ${now.toFixed(2)} → ${(args['to'] as number).toFixed(2)} m.`, ...patch.said] }
    })
  },
}

const mirrorTool: GridTool = {
  name: 'grid_mirror',
  title: 'Mirror the plan',
  hint: 'change-plan',
  description:
    'Use this when the person asks to flip the plan, mirror it, or have it the other way round: "the lounge is on the right as you come in, flip it". '
    + 'left-right swaps east and west, top-bottom swaps north and south. Every room keeps its size and every door keeps opening into the same room. '
    + 'Do not use to turn the drawing for a picture (grid_view). It replaces the plan file unless out is given.',
  args: {
    plan: PLAN_ARG,
    how: { type: 'string', enum: MIRRORS, required: true, description: 'left-right or top-bottom.', examples: ['left-right'] },
    out: OUT_ARG,
  },
  outputSchema: EDIT_OUTPUT,
  run(args, context) {
    return writeChange(context, args, (survey) => mirrorPlan(survey, args['how'] as Mirror))
  },
}

// ---------------------------------------------------------------------------------------------
// grid_write_rooms

/** The rooms text a tool call may pass, at most. */
export const ROOMS_TEXT_MAX = 200_000

const ROOMS_EXAMPLE = [
  'walls outside 0.3 inside 0.1 height 2.6',
  'room living "Living room" living 4.4 x 4.2',
  'room kitchen "Kitchen" kitchen 4.4 x 3.0 north of living',
  'room hall "Hall" corridor 1.3 x * east of living until kitchen',
  'door d1 between hall and living, 0.1 from south, 0.8 wide, opens into living',
  'door front in hall north, centred, 0.9 wide, opens in, hinged east',
  'window w1 in living south, centred, 1.8 wide, sill 0.6, height 1.5',
].join('\n')

const writeRoomsTool: GridTool = {
  name: 'grid_write_rooms',
  title: 'Write the plan rooms first',
  hint: 'change-plan',
  description:
    'Use this when you write a plan, or change more than one door or wall of it: the main way to write a plan. Name each room with its inside size, east-west by north-south, and where it goes (at x,y for the first, then "north of living"; * x 1.6 with until <room> stretches it); name each door and window by the two rooms it joins or the room side it is in, with its distance from a corner. '
    + 'Grid works out the walls, their kinds, each room\'s boundary and each opening\'s place, and writes them into the plan file, which stays the source of truth: its walls stay there and stay editable. '
    + 'To change a plan, read it back with grid_describe as=rooms, change that text and pass it here: rooms text read from an older plan, or written over a plan changed some other way, is refused with the difference, and nothing is written (replace=true writes over it). Overlapping rooms and gaps that are neither wall nor room are refused, naming both rooms. '
    + 'A size may say centre or outside (8 x 10 outside: to the outside faces); inside is the default. What rooms cannot say (a free-standing wall, a room with a hole) is written raw, as one line of Grid\'s own JSON: raw wall {...}. '
    + `${ROOM_NAMES_TRAVEL} `
    + 'Do not use for one door or window (grid_change_opening) or one wall moved (grid_move_room_side). It replaces the plan file. Units are metres.',
  args: {
    plan: { ...PLAN_ARG, description: 'The plan file to write, inside the project folder, ending in .json. The project\'s own plan.json when left out.' },
    rooms: {
      type: 'string',
      lines: true,
      required: true,
      maxLength: ROOMS_TEXT_MAX,
      description: 'The rooms text, one statement a line. A room: room <id> "<name>" <use or -> <width> x <depth> [inside|centre|outside] <at x,y | north|south|east|west of <room> [align ...] [until <room>]>. An opening: door|window|opening <id> between <room> and <room> | in <room> <side>, <m> from <side> | centred, <m> wide [, sill <m>, height <m>, opens into <room>|in|out, hinged <direction>]. The first line sets the walls: walls outside <t> inside <t> height <h>.',
      examples: [ROOMS_EXAMPLE],
    },
    replace: { type: 'boolean', description: 'true to write over a plan that was not written from this text, or was changed since. Refused with the difference when left out.', examples: [true] },
  },
  outputSchema: objectSchema({
    written: STRING,
    rooms: listSchema(objectSchema({ id: STRING, name: STRING, floor: STRING, width: { type: 'number' }, depth: { type: 'number' }, area: { type: 'number' }, basis: { type: ['string', 'null'] } })),
    walls: { type: 'number' },
    openings: { type: 'number' },
    guesses: listSchema(STRING),
    warnings: listSchema(STRING),
    verdict: { type: ['string', 'null'] },
    drawingProblems: objectSchema({ before: { type: 'number' }, after: { type: 'number' } }),
  }),
  run(args, context) {
    const project = projectOf(context)
    try {
      const file = planFileOf(project, args['plan'])
      const done = writeRoomsIntoProject(project, args['rooms'] as string, file, { replace: args['replace'] === true, brief: true })
      const r = done.result
      return {
        text: done.lines.join('\n'),
        data: {
          written: done.written,
          rooms: r.rooms.map((x) => ({ id: x.id, name: x.name, floor: x.floor, width: x.width, depth: x.depth, area: x.area, basis: x.basis })),
          walls: r.walls.length,
          openings: r.openings.length,
          guesses: [...r.guesses],
          warnings: r.warnings.map((w) => `${w.code}: ${w.message}`),
          verdict: done.verdict,
          drawingProblems: done.drawingProblems,
        },
      }
    } catch (error) {
      if (error instanceof RoomsRefused) throw new ToolRefusal(error.problems.length > 1 ? `The rooms text was not written, and the plan is as it was. ${error.problems.length} problems:\n${error.problems.map((p) => `  ${p}`).join('\n')}` : error.message.replace(/--replace/g, 'replace=true').replace(/grid describe --as rooms/g, 'grid_describe as=rooms'))
      throw asRefusal(error)
    }
  },
}

export const WRITE_TOOLS: readonly GridTool[] = [exportTool, sheetTool, previewTool, writeRoomsTool, changeOpeningTool, moveSideTool, mirrorTool]
