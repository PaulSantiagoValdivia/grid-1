/**
 * `grid_report_problem` (CMD-13): a failure the agent met, as a draft issue for the person to
 * file or not. It reads the plan and writes nothing; it sends nothing anywhere. The draft is made
 * in `report/draft.ts`, where it is cut down and cleared of names, addresses and paths.
 *
 * It reads the plan as the command would and, when the command refuses it, as JSON, so a refusal
 * can be reported too. It never follows the plan's trace image: the draft leaves it out.
 */
import path from 'path'
import { inspectPlan, type GridResult } from '@ongrid/rules'
import { version } from '../../package.json'
import { checkPlan } from '../command/check'
import { loadPlan, PlanRefused } from '../command/plan'
import { PLAN_FILE_MAX_BYTES } from '../command/planText'
import { REPOSITORY } from '../distribution/listing'
import { PathRefused } from '../fs/projectFiles'
import { TextNotDecoded } from '../fs/textEncoding'
import { buildDraft, PARTS_MAX } from '../report/draft'
import { PER_REQUEST_VERSIONS, PROTOCOL_VERSIONS } from './protocol'
import { BOOLEAN, listSchema, NULLABLE_STRING, NUMBER, objectSchema, PLAN_ARG, planFileOf, projectOf, STRING, ToolRefusal, type GridTool } from './toolkit'

export const REPORT_TOOL_NAME = 'grid_report_problem'
/** The longest call's arguments a draft takes, as JSON text. */
export const CALL_ARGUMENTS_MAX = 20_000
/** The text an answer may carry into the draft; a longer one is cut, saying so. */
export const ANSWER_MAX = 4000
export const EXPECTED_MAX = 1000
const CODE = /^[a-z]+(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)+$/
/** The answer's text holds the link when it is this short; the data always does. */
const LINK_IN_TEXT_MAX = 1500
const BODY_IN_TEXT_MAX = 3000

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

interface PlanRead {
  readonly raw: unknown
  readonly record: GridResult
  readonly refusal?: string
}

function readForDraft(project: ReturnType<typeof projectOf>, file: string): PlanRead {
  let text: string
  try {
    text = project.readText(file, PLAN_FILE_MAX_BYTES).text
  } catch (error) {
    if (error instanceof PathRefused) throw new ToolRefusal(error.message)
    if (error instanceof TextNotDecoded) return { raw: null, record: inspectPlan(null), refusal: oneLine(error.message) }
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') throw new ToolRefusal(`There is no file ${file}.`)
    if (code === 'EISDIR') throw new ToolRefusal(`${file} is a folder, not a plan file.`)
    if (code === 'EFBIG') throw new ToolRefusal(`${file} is larger than ${PLAN_FILE_MAX_BYTES / 1024 / 1024} MB, the most Grid reads in a plan file.`)
    throw new ToolRefusal(`${file} can't be read: ${oneLine((error as Error).message)}`)
  }
  let raw: unknown = null
  try {
    raw = JSON.parse(text)
  } catch {
    raw = null
  }
  try {
    const loaded = loadPlan(project, file)
    return { raw, record: checkPlan(loaded, {}).result }
  } catch (error) {
    if (error instanceof PathRefused || error instanceof PlanRefused) return { raw, record: inspectPlan(raw), refusal: error.message }
    throw error
  }
}

function protocolText(asked: string | undefined): string {
  if (asked !== undefined) return `${asked}, named by the request`
  return `set at initialize, one of ${PROTOCOL_VERSIONS.join(', ')}: the server keeps nothing between requests, so it cannot say which (a ${PER_REQUEST_VERSIONS.join(', ')} client names its own)`
}

export const reportProblemTool: GridTool = {
  name: REPORT_TOOL_NAME,
  title: 'Draft a problem report',
  hint: 'read',
  description:
    'Use this when a Grid tool gave an answer you believe is wrong, refused what it should take, or failed inside Grid, and the person may want to tell Grid\'s makers. '
    + 'It drafts an issue: Grid\'s version, the protocol version, the call and its answer, what you expected, the line of the plan\'s result record the problem is about (pass its code), and the smallest plan that shows it, cut down to the parts named and what they touch, with room names replaced by their uses, ids by numbers, and names, addresses and paths taken out. Lengths in it are in metres. '
    + 'It returns the draft and a link to the repository\'s issue form. Grid sends nothing and writes nothing: show the person the draft exactly as returned, and they decide whether to open the link and file it. '
    + 'Do not use for what is wrong with the plan itself (grid_check), and never file, post or send the draft yourself.',
  args: {
    plan: PLAN_ARG,
    tool: { type: 'string', id: true, required: true, description: 'The Grid tool whose answer was wrong, as you called it.', examples: ['grid_check', 'grid_measure'] },
    arguments: {
      type: 'object',
      description: 'The arguments of that call, as you sent them. Names and paths in them are cleared in the draft.',
      examples: [{ what: 'room', room: 'kitchen' }],
      // Any of a tool's arguments: the call is checked by its own tool, not here.
      schema: { type: 'object', properties: {}, additionalProperties: true, maxProperties: 40 },
      read(value) {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ToolRefusal('arguments must be an object: the call\'s arguments as you sent them.')
        const text = JSON.stringify(value)
        if (text.length > CALL_ARGUMENTS_MAX) throw new ToolRefusal(`arguments is ${text.length.toLocaleString('en-US')} characters as JSON; a draft takes at most ${CALL_ARGUMENTS_MAX.toLocaleString('en-US')}. Leave out the long parts, such as rooms text.`)
        return value
      },
    },
    answer: { type: 'string', lines: true, maxLength: 20_000, description: `The answer the call gave, as you got it. The first ${ANSWER_MAX.toLocaleString('en-US')} characters go into the draft.`, examples: ['The kitchen is 9.80 m² ...'] },
    expected: { type: 'string', lines: true, required: true, maxLength: EXPECTED_MAX, description: 'What you expected instead, in a sentence or two, and why.', examples: ['The kitchen measures 3 by 3.5 inside, so about 10.5 m², not 9.8.'] },
    code: { type: 'string', maxLength: 80, description: 'The code of the result record\'s line the problem is about, as grid_check gives it. The draft keeps the parts that line names.', examples: ['room/too-small', 'wall/gap'] },
    parts: { type: 'array', description: `Ids of up to ${PARTS_MAX} rooms, walls, doors, windows or fixtures the problem is about, when no code names them.`, examples: [['kitchen', 'w-east']], items: { id: true }, minItems: 1, maxItems: PARTS_MAX },
    client: { type: 'string', maxLength: 60, description: 'Your host or client\'s name and version, as it names itself, when you know it.', examples: ['Claude Code 2.1'] },
  },
  outputSchema: objectSchema({
    sent: BOOLEAN,
    title: STRING,
    body: STRING,
    labels: listSchema(STRING),
    link: STRING,
    linkHasBody: BOOLEAN,
    code: NULLABLE_STRING,
    plan: { type: ['object', 'null'] },
    kept: objectSchema({ walls: listSchema(NUMBER), rooms: listSchema(NUMBER), openings: listSchema(NUMBER), items: listSchema(NUMBER) }),
  }),
  run(args, context) {
    const tool = args['tool'] as string
    if (!tool.startsWith('grid_')) throw new ToolRefusal('tool must be the Grid tool you called, such as grid_check: Grid\'s tools start with grid_.')
    const code = args['code'] as string | undefined
    if (code !== undefined && !CODE.test(code)) throw new ToolRefusal('code must be a code of the result record, such as room/too-small: lowercase words joined by a slash and dashes.')
    const project = projectOf(context)
    const file = planFileOf(project, args['plan'])
    const read = readForDraft(project, file)
    let answer = args['answer'] as string | undefined
    if (answer !== undefined && answer.length > ANSWER_MAX) answer = `${answer.slice(0, ANSWER_MAX)}\n[… ${answer.length - ANSWER_MAX} more characters left out]`
    const real = (() => {
      try {
        return project.resolve(file)
      } catch {
        return file
      }
    })()
    const draft = buildDraft(
      {
        tool,
        expected: args['expected'] as string,
        ...(args['arguments'] !== undefined ? { arguments: args['arguments'] as Record<string, unknown> } : {}),
        ...(answer !== undefined ? { answer } : {}),
        ...(code !== undefined ? { code } : {}),
        ...(args['parts'] !== undefined ? { parts: args['parts'] as string[] } : {}),
        ...(args['client'] !== undefined ? { client: args['client'] as string } : {}),
      },
      {
        gridVersion: version,
        protocol: protocolText(context.protocolVersion),
        raw: read.raw,
        record: read.record,
        ...(read.refusal !== undefined ? { refusal: read.refusal } : {}),
        paths: [real, file, project.folder, path.basename(real), path.basename(file)],
        repository: REPOSITORY,
      },
    )
    const lines = [
      'Nothing was sent. Show the person this draft exactly as it is: they decide whether to file it. Never file, post or send it yourself.',
      `Title: ${draft.title}`,
      draft.link.length <= LINK_IN_TEXT_MAX ? `Link to the issue form: ${draft.link}` : `The link to the issue form is in link${draft.linkHasBody ? ', with the draft filled in' : ''}.`,
    ]
    if (!draft.linkHasBody) lines.push('The draft is too long to fill in through the link: the form opens with the title, and the person pastes the body.')
    lines.push('', draft.body.length <= BODY_IN_TEXT_MAX ? draft.body : `The body is ${draft.body.length.toLocaleString('en-US')} characters: it is in body.`)
    return {
      text: lines.join('\n'),
      data: { sent: false, title: draft.title, body: draft.body, labels: draft.labels, link: draft.link, linkHasBody: draft.linkHasBody, code: draft.line?.code ?? null, plan: draft.plan, kept: draft.kept },
    }
  },
}
