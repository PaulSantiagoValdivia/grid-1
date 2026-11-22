/**
 * `grid_save_view` (VEW-3, lab SE-7): a camera record `grid_view` returned, saved by name with the
 * plan (`views`, C10), or a saved view taken out. Called up again with `grid_view view=…` (or
 * `grid draw --view`, or the app's 3D view), it gives the same record, digit for digit.
 *
 * It goes through `writeChange` as every change does: worked out on Grid's reading of the plan,
 * and written back with only the plan's `views` changed in the file's own JSON.
 */
import { cameraRecord, findView, storedView, type CameraSetting } from '@ongrid/floorplan/geometry'
import { NAME_MAX, textProblem } from '../command/planText'
import { emptyPatch, type Patch } from '../edit/edits'
import { lensProblem } from '../draw/cameraAsk'
import { CAMERA_ARG, CAMERA_SCHEMA, cameraLines } from './readTools'
import { BOOLEAN, floorArg, listSchema, objectSchema, PLAN_ARG, roomArg, STRING, ToolRefusal, type GridTool } from './toolkit'
import { EDIT_OUTPUT, OUT_ARG, writeChange } from './writeTools'

const q = (text: string): string => JSON.stringify(text)

export const SAVE_VIEW_TOOL_NAME = 'grid_save_view'

export const saveViewTool: GridTool = {
  name: SAVE_VIEW_TOOL_NAME,
  title: 'Save a view by name',
  hint: 'change-plan',
  description:
    'Use this when the person asks to keep a 3D view to come back to, or to hand on: "save this as the garden view", "keep that angle". '
    + 'Pass the camera record grid_view returned (camera) and a name: the view is saved with the plan, in its views, as Grid\'s setting (target, bearing, tilt, distance, lens, cut) and as the camera the open BCF format writes (position, direction, up, field of view), so other programs can open it. '
    + 'grid_view view=<name> calls it up again with the same record, digit for digit. A name already saved is refused unless replace is true; remove=true takes a view out. '
    + 'Do not use to take a picture (grid_view) or to change the building. It replaces the plan file unless out is given. Units are metres.',
  args: {
    plan: PLAN_ARG,
    name: { type: 'string', maxLength: NAME_MAX, required: true, description: 'The view\'s name, one line, as the person calls it. Never a person\'s name: it goes wherever the plan goes.', examples: ['Garden corner', 'Street front'] },
    camera: { ...CAMERA_ARG, description: 'The camera record grid_view returned, as it returned it. Needed unless remove is true.' },
    replace: { type: 'boolean', description: 'true to save over a view of the same name. false when left out.', examples: [true] },
    remove: { type: 'boolean', description: 'true to take the view of that name out of the plan. false when left out.', examples: [true] },
    out: OUT_ARG,
  },
  outputSchema: objectSchema({
    ...(EDIT_OUTPUT['properties'] as Record<string, unknown>),
    view: STRING,
    removed: BOOLEAN,
    camera: { ...CAMERA_SCHEMA, type: ['object', 'null'] },
    views: listSchema(STRING),
  }),
  run(args, context) {
    const name = (args['name'] as string).trim()
    const problem = textProblem(name, 'name')
    if (problem !== null || name === '') throw new ToolRefusal(`name ${problem ?? 'is blank'}.`)
    const remove = args['remove'] === true
    if (remove && args['camera'] !== undefined) throw new ToolRefusal('Pass camera to save a view, or remove=true to take one out, not both.')
    if (!remove && args['camera'] === undefined) throw new ToolRefusal('Pass camera: the camera record grid_view returned, to save under that name.')
    return writeChange(context, args, (survey): Patch => {
      const plan = survey.plan
      const views = [...(plan.views ?? [])]
      const same = findView(views, name)
      if (remove) {
        if (same === null) {
          const names = views.slice(0, 20).map((v) => q(v.name))
          throw new ToolRefusal(`The plan has no view saved under that name, so nothing was written. ${names.length === 0 ? 'It has no saved views.' : `Its views: ${names.join(', ')}.`}`)
        }
        const left = views.filter((v) => v !== same)
        return {
          ...emptyPatch([`Took the view ${q(same.name)} out of the plan.`]),
          plan: { views: left.length === 0 ? null : left },
          extra: { view: same.name, removed: true, camera: null, views: left.map((v) => v.name) },
        }
      }
      if (same !== null && args['replace'] !== true) throw new ToolRefusal(`The plan already has a view saved as ${q(same.name)}, so nothing was written: pass replace=true to save over it, or another name.`)
      const setting = args['camera'] as CameraSetting
      // The record's own room and floor are checked against the plan, and named as it names them.
      if (setting.target.room !== null) roomArg(plan, setting.target.room, 'camera.target.room')
      if (setting.cut !== null) floorArg(plan, setting.cut)
      const lens = lensProblem(setting.focalLength)
      if (lens !== null) throw new ToolRefusal(`camera.lens.focalLength ${lens}.`)
      const record = cameraRecord(plan, setting)
      const saved = storedView(name, record)
      const next = same === null ? [...views, saved] : views.map((v) => (v === same ? saved : v))
      return {
        ...emptyPatch([`${same === null ? 'Saved' : 'Saved over'} the view ${q(name)} with the plan: grid_view view=${q(name)} calls it up.`, ...cameraLines(plan, record).slice(0, 2)]),
        plan: { views: next },
        extra: { view: name, removed: false, camera: record, views: next.map((v) => v.name) },
      }
    })
  },
}
