/**
 * `grid_mark_seen` (MSG-10): the person sets a note of `grid_check` aside as seen, with their
 * reason and the name they give, or takes the mark off. It writes only the marks file beside
 * the plan (`seen/marks.ts`), never the plan. A seen note stays listed, under Seen, and is new
 * again when one of its parts changes.
 */
import { checkPlan, markNote, type MarkAsk } from '../command/check'
import { UsageError } from '../command/options'
import { BY_MAX, REASON_MAX, SeenRefused } from '../seen/marks'
import { COUNTRY_ARG } from './readTools'
import { asRefusal, BOOLEAN, listSchema, NUMBER, objectSchema, PLAN_ARG, readPlan, STRING, ToolRefusal, type GridTool } from './toolkit'

export const MARK_SEEN_TOOL_NAME = 'grid_mark_seen'

export const markSeenTool: GridTool = {
  name: MARK_SEEN_TOOL_NAME,
  title: 'Mark a note as seen',
  hint: 'write-file',
  description:
    'Use this when the person has read a note of grid_check and asks to set it aside as seen, in their words: why, and the name or role they give for who marks it. Never guess either, and never mark a note the person has not asked about. '
    + 'Name the note by its number and its code as grid_check gave them, with the same country. It writes only the marks file beside the plan (plan.seen.json beside plan.json), never the plan. '
    + 'A seen note is not dealt with: grid_check still lists it, under Seen, with the reason and who marked it, and it is new again as soon as one of its parts changes. unmark=true takes a mark off. '
    + 'Do not use to change the plan (the edit tools), to leave a note out of a report, or to say a plan is allowed.',
  args: {
    plan: PLAN_ARG,
    line: { type: 'number', required: true, minimum: 1, maximum: 1_000_000, description: 'The note\'s number, as grid_check gave it.', examples: [3] },
    code: { type: 'string', required: true, maxLength: 64, description: 'The note\'s code, as grid_check gave it: a number that now names another note is refused.', examples: ['room/too-small', 'opening/doors-collide'] },
    reason: { type: 'string', maxLength: REASON_MAX, description: 'Why the person sets the note aside, in their words, in one line. Needed unless unmark is true.', examples: ['A box room, kept small on purpose'] },
    by: { type: 'string', maxLength: BY_MAX, description: 'Who marks it: the name or role the person gives. Kept only with the seen marks beside the plan, never in an export. Needed unless unmark is true.', examples: ['Owner', 'A. Architect'] },
    unmark: { type: 'boolean', description: 'true to take the note\'s seen mark off. false when left out.', examples: [true] },
    country: { ...COUNTRY_ARG, description: 'The country grid_check was given, so the number names the same note.' },
  },
  outputSchema: objectSchema({
    written: STRING,
    line: NUMBER,
    code: STRING,
    unmarked: BOOLEAN,
    mark: {
      type: ['object', 'null'],
      properties: { reason: STRING, by: STRING, at: STRING, parts: listSchema(objectSchema({ kind: STRING, id: STRING })) },
    },
  }),
  run(args, context) {
    const { loaded, project, file } = readPlan(context, args['plan'])
    const number = args['line'] as number
    const unmark = args['unmark'] === true
    const reason = args['reason'] as string | undefined
    const by = args['by'] as string | undefined
    if (!Number.isInteger(number)) throw new ToolRefusal('line takes the whole number of a note, as grid_check gave it.')
    if (unmark && (reason !== undefined || by !== undefined)) throw new ToolRefusal('unmark takes the mark off and keeps no reason or name: leave out reason and by.')
    if (!unmark && reason === undefined) throw new ToolRefusal('Pass reason: why the person sets the note aside, in their words.')
    if (!unmark && by === undefined) throw new ToolRefusal('Pass by: the name or role the person gives for who marks it. Never guess one.')
    try {
      const whole = checkPlan(loaded, args['country'] ? { country: args['country'] as string } : {})
      const line = whole.result.lines[number - 1]
      // The number and the code must name the same note, so a plan changed since is not marked by mistake.
      if (line !== undefined && line.code !== args['code']) {
        throw new ToolRefusal(`Note ${number} is ${line.code} now, not the code sent: call grid_check again, and mark the note by the number and code it gives.`)
      }
      const ask: MarkAsk = unmark ? { mark: 'unseen', number } : { mark: 'seen', number, reason: reason!, by: by! }
      const done = markNote(project, file, loaded, whole, ask, 'line')
      const mark = done.mark === null ? null : { reason: done.mark.reason, by: done.mark.by, at: done.mark.at, parts: done.mark.parts.map((p) => ({ kind: p.kind, id: p.id })) }
      return { text: done.text, data: { written: done.file, line: number, code: done.code, unmarked: done.unmarked, mark } }
    } catch (error) {
      if (error instanceof SeenRefused || error instanceof UsageError) throw new ToolRefusal(error.message)
      throw asRefusal(error)
    }
  },
}
