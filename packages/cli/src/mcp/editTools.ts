/**
 * The room edits of `grid serve` (WRT-3, lab WR-2): one sentence of request is one call. Merge
 * two rooms, split one, build a room against a side, stretch the whole building, and rename a
 * room or change its use. Each goes through `writeChange` as the other changes do: worked out
 * on Grid's reading of the plan, refused with nothing written when it would break the drawing,
 * and written back with only that change in the file's own JSON. Each answer says what changed,
 * what was guessed and what could not be kept, and names the file as a path in the project.
 */
import { ROOM_USES } from '@ongrid/floorplan/types/floorplan'
import { NAME_MAX } from '../command/planText'
import { addRoom, IN_THE_WAY, SIZE_BASES } from '../edit/addRoom'
import { DIRECTIONS, type Direction } from '../edit/edits'
import { mergeRooms } from '../edit/merge'
import { renameRoom, type UseOrNone } from '../edit/rename'
import { splitRoom } from '../edit/split'
import { stretchPlan } from '../edit/stretch'
import { DECIMAL_IN_ARG, floorArg, listSchema, objectSchema, PLAN_ARG, roomArg, STRING, ToolRefusal, type GridTool } from './toolkit'
import { EDIT_OUTPUT, OUT_ARG, writeChange } from './writeTools'

const NAME = (description: string, example: string, required = false): { type: 'string'; maxLength: number; description: string; examples: string[]; required: boolean } => ({ type: 'string', maxLength: NAME_MAX, description, examples: [example], required })
const USE = (description: string): { type: 'string'; enum: readonly string[]; description: string; examples: string[] } => ({ type: 'string', enum: ROOM_USES, description, examples: ['bathroom'] })

const mergeTool: GridTool = {
  name: 'grid_merge_rooms',
  title: 'Knock two rooms into one',
  hint: 'change-plan',
  description:
    'Use this when the person asks to knock two rooms into one, open them up or take out the wall between them: "knock the kitchen and living room into one". '
    + 'It takes out the stretch of wall the two rooms share, cut where the walls round them meet it, with the doors and windows in that stretch; the first room takes in the second and keeps its id, name and use unless name or use say otherwise. It answers with the area of the room it makes. '
    + 'Do not use to make a room bigger by moving a wall (grid_move_room_side) or for rooms that share more than one wall. It replaces the plan file unless out is given. Units are metres.',
  args: {
    plan: PLAN_ARG,
    room: { type: 'string', id: true, required: true, description: 'The room that takes in the other and keeps its id.', examples: ['living'] },
    with: { type: 'string', id: true, required: true, description: 'The room it takes in, which is gone after.', examples: ['kitchen'] },
    name: NAME('The merged room\'s name. The first room\'s when left out.', 'Kitchen and living'),
    use: USE('The merged room\'s use. The first room\'s when left out.'),
    out: OUT_ARG,
  },
  outputSchema: EDIT_OUTPUT,
  run(args, context) {
    return writeChange(context, args, (survey) => {
      const a = roomArg(survey.plan, args['room'])
      const b = roomArg(survey.plan, args['with'], 'with room')
      return mergeRooms(survey, a, b, { ...(args['name'] !== undefined ? { name: args['name'] as string } : {}), ...(args['use'] !== undefined ? { use: args['use'] as string } : {}) })
    })
  },
}

const splitTool: GridTool = {
  name: 'grid_split_room',
  title: 'Split a room in two',
  hint: 'change-plan',
  description:
    'Use this when the person asks to divide a room, or take part of one for another room: "bedroom 2 into a study and a second bathroom", "a 1.4 m bathroom off the east end". '
    + 'A new wall goes across the room; the new room takes its side, size metres inside from that side\'s face, and the room keeps its id and the rest, with name and use for its own if they change. A door goes in the new wall, centred unless door_from and door_distance place it (door_width 0 for none). It answers with both areas, what it guessed and a room left with no window. '
    + 'Rectangles square to the drawing only. Do not use to add a room outside the walls (grid_add_room). It replaces the plan file unless out is given. Units are metres.',
  args: {
    plan: PLAN_ARG,
    decimal: DECIMAL_IN_ARG,
    room: { type: 'string', id: true, required: true, description: 'The room to split.', examples: ['bed2'] },
    side: { type: 'string', enum: DIRECTIONS, required: true, description: 'The side of the room the new room takes.', examples: ['east'] },
    size: { type: 'number', length: true, required: true, description: 'The new room\'s inside size across from that side, in metres.', examples: [1.4], minimum: 0.3, maximum: 100 },
    new_room: { type: 'string', id: true, required: true, description: 'The new room\'s id.', examples: ['bath2'] },
    new_name: NAME('The new room\'s name.', 'Bathroom 2', true),
    new_use: USE('The new room\'s use.'),
    name: NAME('The room\'s own new name, if it changes.', 'Study'),
    use: USE('The room\'s own new use, if it changes.'),
    wall: { type: 'string', id: true, description: 'An id for the new wall. Made from the new room\'s when left out.', examples: ['study-east'] },
    thickness: { type: 'number', length: true, description: 'The new wall\'s thickness, in metres. 0.1 when left out.', examples: [0.1], minimum: 0.03, maximum: 1 },
    door_width: { type: 'number', length: true, description: 'The door in the new wall, in metres; 0 for none. 0.8 when left out.', examples: [0.7, 0], minimum: 0, maximum: 5 },
    door_from: { type: 'string', enum: DIRECTIONS, description: 'Which end of the new wall the door is measured from: a side of the room.', examples: ['south'] },
    door_distance: { type: 'number', length: true, description: 'Metres from that side\'s inside face to the door\'s nearer edge.', examples: [1.35], minimum: 0, maximum: 100 },
    out: OUT_ARG,
  },
  outputSchema: EDIT_OUTPUT,
  run(args, context) {
    return writeChange(context, args, (survey) => {
      const id = roomArg(survey.plan, args['room'])
      return splitRoom(survey, id, {
        side: args['side'] as Direction,
        size: args['size'] as number,
        newRoom: { id: args['new_room'] as string, name: args['new_name'] as string, ...(args['new_use'] !== undefined ? { use: args['new_use'] as string } : {}) },
        ...(args['name'] !== undefined ? { name: args['name'] as string } : {}),
        ...(args['use'] !== undefined ? { use: args['use'] as string } : {}),
        ...(args['wall'] !== undefined ? { wallId: args['wall'] as string } : {}),
        ...(args['thickness'] !== undefined ? { thickness: args['thickness'] as number } : {}),
        ...(args['door_width'] !== undefined ? { doorWidth: args['door_width'] as number } : {}),
        ...(args['door_from'] !== undefined ? { doorFrom: args['door_from'] as Direction } : {}),
        ...(args['door_distance'] !== undefined ? { doorDistance: args['door_distance'] as number } : {}),
      })
    })
  },
}

const addRoomTool: GridTool = {
  name: 'grid_add_room',
  title: 'Add a room against a side',
  hint: 'change-plan',
  description:
    'Use this when the person asks for an extension or a new room outside the walls, against one side of a room: "a 3 x 4 m extension at the back of the living room, with an opening into it and a door to the garden". '
    + 'It builds the room\'s three walls, as thick as the wall it stands against, cuts that wall where they meet it, and makes the stretch between the rooms an inside wall. A door or window in that stretch is in the way: pass in_the_way remove or keep (kept, it joins the two rooms); left out, the call is refused naming them. opening_width puts a doorless opening between the rooms and door_width a door in the far side, both centred. '
    + 'Sizes are inside sizes unless size is centre (to the walls\' centre lines). Grid has no sliding or folding door: the door is drawn with no swing. Do not use to make an existing room bigger (grid_move_room_side) or to divide one (grid_split_room). It replaces the plan file unless out is given. Units are metres.',
  args: {
    plan: PLAN_ARG,
    decimal: DECIMAL_IN_ARG,
    room: { type: 'string', id: true, required: true, description: 'The new room\'s id.', examples: ['extension'] },
    name: NAME('The new room\'s name.', 'Garden room', true),
    use: USE('The new room\'s use.'),
    against: { type: 'string', id: true, required: true, description: 'The room it is built against.', examples: ['living'] },
    side: { type: 'string', enum: DIRECTIONS, required: true, description: 'Which side of that room: north is the top of the drawing.', examples: ['south'] },
    width: { type: 'number', length: true, required: true, description: 'Its size along that side, in metres.', examples: [3], minimum: 0.5, maximum: 100 },
    depth: { type: 'number', length: true, required: true, description: 'Its size out from that side, in metres.', examples: [4], minimum: 0.5, maximum: 100 },
    size: { type: 'string', enum: SIZE_BASES, description: 'inside (the default) or centre: what width and depth measure to.', examples: ['inside', 'centre'] },
    from: { type: 'string', enum: DIRECTIONS, description: 'Its place along the side: which side of the room it is built against it is measured from. Centred when left out.', examples: ['west'] },
    distance: { type: 'number', length: true, description: 'Metres from that side\'s inside face to the new room\'s inside face.', examples: [0.8], minimum: 0, maximum: 100 },
    in_the_way: { type: 'string', enum: IN_THE_WAY, description: 'What happens to doors and windows in the stretch of wall it covers: remove, or keep them between the two rooms.', examples: ['remove'] },
    opening_width: { type: 'number', length: true, description: 'A doorless opening between the two rooms, centred, in metres.', examples: [2.4], minimum: 0, maximum: 50 },
    door_width: { type: 'number', length: true, description: 'A door in the far side, to the outside, centred, in metres.', examples: [2.2], minimum: 0, maximum: 50 },
    out: OUT_ARG,
  },
  outputSchema: EDIT_OUTPUT,
  run(args, context) {
    return writeChange(context, args, (survey) => {
      const against = roomArg(survey.plan, args['against'], 'against room')
      return addRoom(survey, {
        id: args['room'] as string,
        name: args['name'] as string,
        ...(args['use'] !== undefined ? { use: args['use'] as string } : {}),
        against,
        side: args['side'] as Direction,
        width: args['width'] as number,
        depth: args['depth'] as number,
        ...(args['size'] !== undefined ? { size: args['size'] as (typeof SIZE_BASES)[number] } : {}),
        ...(args['from'] !== undefined ? { from: args['from'] as Direction } : {}),
        ...(args['distance'] !== undefined ? { distance: args['distance'] as number } : {}),
        ...(args['in_the_way'] !== undefined ? { inTheWay: args['in_the_way'] as (typeof IN_THE_WAY)[number] } : {}),
        ...(args['opening_width'] !== undefined ? { openingWidth: args['opening_width'] as number } : {}),
        ...(args['door_width'] !== undefined ? { doorWidth: args['door_width'] as number } : {}),
      })
    })
  },
}

const stretchTool: GridTool = {
  name: 'grid_stretch',
  title: 'Make the building wider or longer',
  hint: 'change-plan',
  description:
    'Use this when the person asks for the whole building, flat or house wider, longer or deeper: "the flat 30 cm wider", "the house 1 m longer to the north, through the kitchen". '
    + 'Everything beyond a line across the building moves out by the distance: the line is just inside the outside wall on that side, or through the middle of a room with through. Walls across the line get longer and the rooms they bound grow; every floor moves together unless floor names one. Doors and windows keep their anchor or their place in the building, so one in a wall that grows at its start does not slide. '
    + 'Do not use for one room (grid_move_room_side). It replaces the plan file unless out is given. Units are metres.',
  args: {
    plan: PLAN_ARG,
    decimal: DECIMAL_IN_ARG,
    side: { type: 'string', enum: DIRECTIONS, required: true, description: 'Which way it grows: north is the top of the drawing.', examples: ['east'] },
    by: { type: 'number', length: true, required: true, description: 'Metres to grow; negative to shrink.', examples: [0.3, -0.2], minimum: -50, maximum: 50 },
    through: { type: 'string', id: true, description: 'A room the line runs through, across its middle: it and the rooms in line with it grow.', examples: ['living'] },
    floor: { type: 'string', id: true, description: 'A floor id from the plan\'s "floors": stretch that floor only. Every floor when left out.', examples: ['ground'] },
    out: OUT_ARG,
  },
  outputSchema: EDIT_OUTPUT,
  run(args, context) {
    if (args['by'] === 0) throw new ToolRefusal('by is 0: nothing would move.')
    return writeChange(context, args, (survey) => {
      const floor = floorArg(survey.plan, args['floor'])
      const through = args['through'] === undefined ? undefined : roomArg(survey.plan, args['through'], 'through room')
      return stretchPlan(survey, { side: args['side'] as Direction, by: args['by'] as number, ...(through !== undefined ? { through } : {}), ...(floor !== undefined ? { floor } : {}) })
    })
  },
}

const renameTool: GridTool = {
  name: 'grid_rename_room',
  title: 'Rename a room or change its use',
  hint: 'change-plan',
  description:
    'Use this when the person asks to call a room something else, or to use it for something else: "the front room is a bedroom now", "the room names in Spanish". '
    + 'It changes the room\'s name, its use (none to leave it unstated), or both, and nothing else, and answers with which of Grid\'s checks now look at the room and which no longer do: they go by its use, never its name. '
    + 'Do not use to change a room\'s size (grid_move_room_side) or its id. It replaces the plan file unless out is given.',
  args: {
    plan: PLAN_ARG,
    room: { type: 'string', id: true, required: true, description: 'The room to rename or give another use.', examples: ['bed2'] },
    name: NAME('Its new name.', 'Dormitorio 2'),
    use: { type: 'string', enum: [...ROOM_USES, 'none'], description: 'Its new use, or none to leave its use unstated.', examples: ['other', 'bedroom'] },
    out: OUT_ARG,
  },
  outputSchema: { ...EDIT_OUTPUT, properties: { ...(EDIT_OUTPUT['properties'] as Record<string, unknown>), checks: objectSchema({ now: listSchema(STRING), noLonger: listSchema(STRING) }) } },
  run(args, context) {
    return writeChange(context, args, (survey) => {
      const id = roomArg(survey.plan, args['room'])
      return renameRoom(survey, id, { ...(args['name'] !== undefined ? { name: args['name'] as string } : {}), ...(args['use'] !== undefined ? { use: args['use'] as UseOrNone } : {}) })
    })
  },
}

/** In the order `tools/list` gives them, after the other changes to the plan. */
export const EDIT_TOOLS: readonly GridTool[] = [mergeTool, splitTool, addRoomTool, stretchTool, renameTool]
