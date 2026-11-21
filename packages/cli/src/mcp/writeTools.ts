/**
 * The tools of `grid serve` that write: an export file beside the plan, the live preview, and
 * the three changes to the plan itself (an opening, one side of a room, a mirror).
 *
 * A change to the plan reads the file, works out the change on Grid's reading of it, and
 * writes the file's own JSON back with only that change in it. It is refused, and nothing is
 * written, when it would leave the drawing with a problem it did not have.
 */
import { planFloors, validatePlan, type FloorPlan } from '@ongrid/floorplan/geometry'
import { doorsThatChangedRooms } from '@ongrid/floorplan/geometry/rules/doors'
import { EXPORT_FORMATS, isExportFormat } from '@ongrid/floorplan/export'
import { checkExportRequest, ExportWriteFailed, exportIntoProject } from '../command/export'
import { UsageError } from '../command/options'
import { PlanRefused } from '../command/plan'
import { changeOpening, DIRECTIONS, EditRefused, KEEPS, MIRRORS, mirrorPlan, moveRoomSide, applyPatch, type Direction, type Mirror, type Patch } from '../edit/edits'
import { NAME_MAX } from '../command/planText'
import { parseSheetWords, SHEET_HEADLINE_MAX, SHEET_PARAGRAPH_MAX, SHEET_PARAGRAPHS_MAX, SheetWordsRefused } from '@ongrid/floorplan/types/sheet'
import { checkSheetRequest, readSheetWords, sheetIntoProject } from '../sheet/sheetFile'
import { PATH_MAX, PathRefused, quoted } from '../fs/projectFiles'
import { comparePlans } from '../quantities/compare'
import { surveyPlan, type Survey } from '../quantities/survey'
import { openingBetween } from './readTools'
import {
  asRefusal,
  FLOOR_ARG,
  floorArg,
  listSchema,
  objectSchema,
  openingArg,
  PLAN_ARG,
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
  return message.replace(/--(format|floor)\b/g, '$1')
}

const exportTool: GridTool = {
  name: EXPORT_TOOL_NAME,
  title: 'Export the plan',
  hint: 'write-file',
  description:
    'Use this when the person wants the plan as a file to open in another program: dxf for AutoCAD and other 2D CAD programs (the nearest to DWG), ifc for BIM programs such as Revit, glb or obj for 3D. '
    + 'It writes the file into the exports folder beside the plan, replacing an earlier copy of the same export, and answers with the path it wrote. It never changes the plan. '
    + 'Do not use for a picture to look at (grid_view). For a PDF to read or print, use grid_sheet; JPG is not made. The plan must be a file inside the project folder: any other path is refused.',
  args: {
    plan: { type: 'string', maxLength: PATH_MAX, required: true, description: 'The plan file, as a path inside the project folder.', examples: ['floor-plan.json', 'plan.json'] },
    format: { type: 'string', required: true, enum: EXPORT_FORMATS, description: 'The file format.', examples: ['dxf', 'ifc'] },
    floor: { ...FLOOR_ARG, description: 'dxf, obj and glb only: a floor id from the plan\'s "floors". The lowest floor when left out.' },
  },
  outputSchema: objectSchema({ written: STRING, format: STRING, leftOut: { type: 'number' }, note: { type: ['string', 'null'] } }),
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
      const leftOut = done.loaded.broken.size
      if (leftOut > 0) lines.push(`Left out ${leftOut} part${leftOut === 1 ? '' : 's'} that can't be drawn: grid check says which and why.`)
      return { text: lines.join('\n'), data: { written, format, leftOut, note: done.note ?? null } }
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

const PARAGRAPHS = { type: 'array', maxItems: SHEET_PARAGRAPHS_MAX, items: { type: 'string', maxLength: SHEET_PARAGRAPH_MAX } }

const sheetTool: GridTool = {
  name: SHEET_TOOL_NAME,
  title: 'Make a PDF sheet',
  hint: 'write-file',
  description:
    'Use this when the person wants the plan as a PDF to read, print or send: layout client for the person the house is for (a cover with the 3D model and key figures, then a page per floor with its drawing and room areas), or layout check for whoever checks the plan (every id, every room\'s use, and what grid check finds on each floor). '
    + 'The words of a client sheet (name, headline, intro, a few paragraphs per floor) are yours to write: pass them as sheet, or Grid reads sheet.json beside the plan. Grid draws only what the plan holds: no furniture or landscape. Every page carries "General guidance, not your local rules". '
    + 'It writes the PDF into the exports folder beside the plan and answers with the path and what is on each page. It never changes the plan. Do not use for a single picture (grid_view) or a file for another program (grid_export).',
  args: {
    plan: { type: 'string', maxLength: PATH_MAX, required: true, description: 'The plan file, as a path inside the project folder.', examples: ['plan.json'] },
    layout: { type: 'string', required: true, enum: ['client', 'check'], description: 'client or check.', examples: ['client', 'check'] },
    sheet: {
      type: 'object',
      description: 'Client only: the words, as sheet.json holds them. sheet.json beside the plan is read when left out.',
      examples: [{ version: '1', name: 'Solace House', headline: 'A private retreat for one', intro: ['A two-storey home for work and rest.'], floors: { ground: ['The study sits beside the entry.'] } }],
      schema: {
        type: 'object',
        properties: {
          version: { const: '1' },
          name: { type: 'string', maxLength: NAME_MAX },
          headline: { type: 'string', maxLength: SHEET_HEADLINE_MAX },
          intro: PARAGRAPHS,
          floors: { type: 'object', additionalProperties: PARAGRAPHS },
        },
        required: ['version'],
        additionalProperties: false,
      },
      // Checked against the plan's floors in run(), where the plan is known.
      read: (value) => value,
    },
  },
  outputSchema: objectSchema({ written: STRING, layout: STRING, pages: { type: 'array', items: { type: 'object' } }, note: { type: ['string', 'null'] } }),
  async run(args, context) {
    const layoutArg = args['layout'] as string
    const given = args['sheet'] as Record<string, unknown> | undefined
    try {
      const layout = checkSheetRequest({ layout: layoutArg, sheet: given === undefined ? undefined : 'sheet' })
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
      return { text: lines.join('\n'), data: { written, layout, pages: done.pages, note: done.note ?? null } }
    } catch (error) {
      if (error instanceof SheetWordsRefused) throw new ToolRefusal(`sheet is not a sheet: ${error.message}.`)
      if (error instanceof UsageError) throw new ToolRefusal(error.message.replace(/--(layout|sheet)\b/g, '$1'))
      throw asRefusal(error)
    }
  },
}

// ---------------------------------------------------------------------------------------------
// The changes to the plan

const OUT_ARG = {
  type: 'string' as const,
  maxLength: PATH_MAX,
  description: 'Write the changed plan to this file, inside the project folder, ending in .json, and leave plan as it is. The plan itself is replaced when left out.',
  examples: ['option-b2.json', 'plan.json'],
}

const EDIT_OUTPUT = objectSchema({
  written: STRING,
  changed: listSchema(STRING),
  verdict: STRING,
  drawingProblems: objectSchema({ before: { type: 'number' }, after: { type: 'number' } }),
  // MSG-14: each door or doorless opening that joins other rooms after the change, in words.
  doors: listSchema(STRING),
})

function errorsOf(plan: FloorPlan): Array<{ id: string; message: string }> {
  return validatePlan(plan).issues.filter((i) => i.severity === 'error').map((i) => ({ id: i.id, message: i.message }))
}

/** Applies a patch to the plan file, or refuses it with nothing written. */
function writeChange(context: ToolContext, args: Record<string, unknown>, make: (survey: Survey) => Patch): { text: string; data: Record<string, unknown> } {
  const { project, file, loaded } = readPlan(context, args['plan'])
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
  const after = applyPatch(loaded.plan as unknown as Record<string, unknown>, patch) as unknown as FloorPlan
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
  try {
    written = project.relative(project.writeFile(out, `${JSON.stringify(applyPatch(raw, patch), null, 2)}\n`))
  } catch (error) {
    if (error instanceof PathRefused) throw new ToolRefusal(error.message)
    throw new ToolRefusal(`Can't write ${quoted(out)}: ${String((error as Error).message).replace(/\s+/g, ' ')}`)
  }
  const verdict = comparePlans(before, surveyPlan(after), ['the plan before', 'the plan now']).verdict
  const doors = doorsThatChangedRooms(loaded.plan, after).map((change) => `${change.message}.`)
  const drawingProblems = { before: validatePlan(loaded.plan).issues.length, after: validatePlan(after).issues.length }
  const text = [
    ...patch.said,
    verdict,
    ...doors,
    `Problems in the drawing: ${drawingProblems.before} → ${drawingProblems.after}. Run grid_check for the notes.`,
    `Wrote ${quoted(written)}.`,
  ].join('\n')
  return { text, data: { written, changed: [...patch.said], verdict, drawingProblems, doors } }
}

const changeOpeningTool: GridTool = {
  name: 'grid_change_opening',
  title: 'Change or remove a door or window',
  hint: 'change-plan',
  description:
    'Use this when the person asks to make a door or window wider or narrower, change which room a door opens into, raise or lower a sill, turn a window into a door, or take a door or window out: "bathroom door to 90 cm, opening outwards", "block the kitchen door", "a 4 m opening to the garden". '
    + 'It changes one opening in place and answers with what changed and the area verdict. A width that does not fit is refused with the free stretches of the wall, and nothing is written. '
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
    out: OUT_ARG,
  },
  outputSchema: EDIT_OUTPUT,
  run(args, context) {
    return writeChange(context, args, (survey) => {
      const id = openingArg(survey.plan, args['opening'])
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
    + 'It moves the wall on the named side of the room straight out (a positive distance) or in (negative); walls that end on it follow, and its doors and windows move with it. It answers with every room whose area changed. '
    + 'Only a side square to the drawing moves: north is the top of the drawing. Do not use to add a separate room or to split one. It replaces the plan file unless out is given. Units are metres.',
  args: {
    plan: PLAN_ARG,
    room: { type: 'string', id: true, required: true, description: 'The room whose side moves.', examples: ['kitchen', 'bed1'] },
    side: { type: 'string', enum: DIRECTIONS, required: true, description: 'Which side of the room: north (the top of the drawing), east, south or west.', examples: ['north', 'east'] },
    by: { type: 'number', required: true, description: 'Metres to move it: positive makes the room bigger, negative smaller.', examples: [3, -0.5], minimum: -50, maximum: 50 },
    out: OUT_ARG,
  },
  outputSchema: EDIT_OUTPUT,
  run(args, context) {
    if (args['by'] === 0) throw new ToolRefusal('by is 0: nothing would move.')
    return writeChange(context, args, (survey) => {
      const id = roomArg(survey.plan, args['room'])
      const room = survey.byId.get(id)
      if (!room || room.polygon.length < 3) throw new EditRefused('That room has no outline Grid can measure; grid_check says why.')
      return moveRoomSide(survey, id, args['side'] as Direction, args['by'] as number)
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

export const WRITE_TOOLS: readonly GridTool[] = [exportTool, sheetTool, previewTool, changeOpeningTool, moveSideTool, mirrorTool]
