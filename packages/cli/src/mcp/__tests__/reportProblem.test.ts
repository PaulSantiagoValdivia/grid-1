/**
 * CMD-13: `grid_report_problem` drafts an issue from a failure the agent met, and sends nothing.
 * The draft holds Grid's version, the call, its result and a cut-down plan, with room names
 * replaced by uses and no paths. Tried on the lab's T-1 plan (names that talk to the agent) and
 * S-11 plan (`B/scenarios/s11-junctions.json`, walls meeting at odd junctions).
 */
import { readdirSync, readFileSync, realpathSync } from 'fs'
import { resolve } from 'path'
import { gunzipSync } from 'zlib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ROOM_USES } from '@ongrid/floorplan/types/floorplan'
import { REPOSITORY } from '../../distribution/listing'
import { T1_PLAN_TEXT } from '../../fs/__tests__/attackCases'
import { AGENT_LABEL, AGENT_TEMPLATE } from '../../report/draft'
import { handleLine } from '../protocol'
import { version } from '../../../package.json'
import { bench, type Bench, type Reply } from './replay/harness'
import { twoBedFlat } from './replay/plans'

const repo = resolve(__dirname, '../../../../..')

function labPlan(name: string): Record<string, unknown> {
  const lines = gunzipSync(readFileSync(resolve(repo, 'scoreboard/data/lab-plans.ndjson.gz'))).toString('utf8').split('\n')
  for (const line of lines) {
    if (!line) continue
    const row = JSON.parse(line) as { name: string; text: string }
    if (row.name === name) return JSON.parse(row.text) as Record<string, unknown>
  }
  throw new Error(`no lab plan ${name}`)
}

const S11 = labPlan('B/scenarios/s11-junctions.json')
type Room = { id: string; name: string; use?: string }

/** The T-1 plan: the two-bedroom flat with the lab's T-1 texts as its rooms' names. */
function t1Plan(oneLine: boolean): Record<string, unknown> {
  const plan = twoBedFlat() as { rooms: Room[] } & Record<string, unknown>
  const texts = oneLine ? T1_PLAN_TEXT.filter((t) => !t.includes('\n')) : T1_PLAN_TEXT
  return { ...plan, rooms: plan.rooms.map((room, i) => ({ ...room, name: texts[i % texts.length]! })) }
}

/** Words of a text long enough to be found by chance in nothing else, and not a room's use. */
function words(text: string): string[] {
  return text.split(/[^A-Za-z]+/).filter((word) => word.length >= 6 && !(ROOM_USES as readonly string[]).includes(word.toLowerCase()))
}

let b: Bench
let real: string
beforeAll(() => {
  b = bench({ 's11-junctions.json': S11, 'ann-smith-house.json': t1Plan(true), 't1-refused.json': t1Plan(false) })
  real = realpathSync.native(b.folder)
})
afterAll(() => b.close())

async function report(args: Record<string, unknown>): Promise<Reply & { data: Record<string, unknown> }> {
  const reply = await b.call('grid_report_problem', args)
  expect(reply.isError, reply.text).toBe(false)
  return reply as Reply & { data: Record<string, unknown> }
}

describe('a draft from the S-11 plan', () => {
  let draft: Reply & { data: Record<string, unknown> }
  let code: string
  beforeAll(async () => {
    const check = await b.call('grid_check', { plan: 's11-junctions.json' })
    const lines = check.data!['lines'] as Array<{ code: string; thing: { kind: string } }>
    code = lines.find((line) => line.thing.kind === 'wall' || line.thing.kind === 'room')!.code
    draft = await report({
      plan: 's11-junctions.json',
      tool: 'grid_check',
      arguments: { plan: `${real}/s11-junctions.json` },
      // The path first: the draft cuts an answer past ANSWER_MAX, and this plan's grid_check text is longer than that.
      answer: `Read from ${real}/s11-junctions.json\n${check.text}`,
      expected: 'The walls meet at the junctions, so nothing should be named.',
      code,
      client: 'Test host 1.0',
    })
  })

  it('holds the version, the call, its result and the record line', () => {
    const body = draft.data['body'] as string
    expect(body).toContain(`Grid ${version}, result record version 1`)
    expect(body).toContain('Tool: `grid_check`')
    expect(body).toContain('Its answer:')
    expect(body).toContain(`Code \`${code}\``)
    expect(body).toContain('- Client: Test host 1.0')
    expect(draft.data['code']).toBe(code)
  })

  it('cuts the plan down to the parts the line names and what they touch', () => {
    const kept = draft.data['kept'] as Record<string, [number, number]>
    expect(kept['walls']![0]).toBeGreaterThan(0)
    expect(kept['walls']![0] + kept['rooms']![0]).toBeLessThan(kept['walls']![1] + kept['rooms']![1])
    const plan = draft.data['plan'] as { walls: Array<{ id: string }>; rooms: Array<{ boundary: string[] }>; openings: Array<{ wall: string }> }
    const walls = new Set(plan.walls.map((w) => w.id))
    // The cut plan holds together: every wall a room or an opening names is in it.
    for (const room of plan.rooms) for (const id of room.boundary) expect(walls).toContain(id)
    for (const opening of plan.openings) expect(walls).toContain(opening.wall)
  })

  it('replaces room names by their uses and every id, and holds no path', () => {
    const body = draft.data['body'] as string
    for (const room of S11['rooms'] as Room[]) {
      expect(body).not.toContain(room.name)
      expect(body).not.toMatch(new RegExp(`\`${room.id}\``))
    }
    for (const room of (draft.data['plan'] as { rooms: Room[] }).rooms) expect(room.name).toMatch(/^(bedroom|living)( \d+)?$/)
    for (const text of [real, b.folder, 's11-junctions.json']) expect(body).not.toContain(text)
    expect(body).toContain('<path>')
  })

  it('returns a link to the issue form, with the label for agent-drafted reports', () => {
    const link = new URL(draft.data['link'] as string)
    expect(`${link.origin}${link.pathname}`).toBe(`${REPOSITORY}/issues/new`)
    expect(link.searchParams.get('template')).toBe('agent-drafted.md')
    expect(link.searchParams.get('labels')).toBe('agent-drafted')
    expect(link.searchParams.get('title')).toBe(draft.data['title'])
    if (draft.data['linkHasBody'] === true) expect(link.searchParams.get('body')).toBe(draft.data['body'])
    expect(draft.data['sent']).toBe(false)
    expect(draft.text).toContain('Nothing was sent')
  })
})

describe('a draft from the T-1 plan', () => {
  it('carries none of the text that talks to the agent, and none of the file name', async () => {
    const draft = await report({ plan: 'ann-smith-house.json', tool: 'grid_describe', expected: 'The rooms described by their names.', parts: ['bed1'] })
    const body = draft.data['body'] as string
    for (const text of T1_PLAN_TEXT) for (const word of words(text)) expect(body.toLowerCase()).not.toContain(word.toLowerCase())
    expect(body).not.toContain('smith')
    const rooms = (draft.data['plan'] as { rooms: Room[] }).rooms
    expect(rooms).toHaveLength(1)
    // Its use, numbered when the plan has more rooms of that use.
    expect(rooms[0]!.name).toMatch(new RegExp(`^${rooms[0]!.use ?? 'room'}( \\d+)?$`))
  })

  it('drafts from the plan with its broken names, the names still replaced', async () => {
    const draft = await report({ plan: 't1-refused.json', tool: 'grid_check', answer: 'rooms[0].name holds a line break (U+000A); it must be one line.', expected: 'The plan read.' })
    const body = draft.data['body'] as string
    for (const text of T1_PLAN_TEXT) for (const word of words(text)) expect(body.toLowerCase()).not.toContain(word.toLowerCase())
    expect((draft.data['plan'] as { rooms: Room[] }).rooms.length).toBeGreaterThan(0)
  })
})

describe('a plan the command refuses', () => {
  it('is reported with the refusal and the record that says so', async () => {
    b.write('wrong.json', { version: '1', units: 'm', walls: 'none', rooms: [{ id: 'bob', name: 'Bob Jones', boundary: [] }], openings: [] })
    const draft = await report({ plan: 'wrong.json', tool: 'grid_check', expected: 'The plan read.' })
    const body = draft.data['body'] as string
    expect(body).toContain('Read: no, the plan was refused')
    expect(body).toContain('The command refuses the plan')
    expect(body).not.toContain('Bob')
    expect(body).not.toContain('bob')
  })

  it('is reported without a plan when it is not JSON', async () => {
    b.write('broken.json', 'x')
    const fs = await import('fs')
    fs.writeFileSync(resolve(b.folder, 'broken.json'), '{ "rooms": [ Jane Doe')
    const draft = await report({ plan: 'broken.json', tool: 'grid_check', expected: 'The plan read.' })
    expect(draft.data['plan']).toBeNull()
    expect(draft.data['body']).toContain('The plan could not be read as JSON, so none is attached.')
    expect(draft.data['body']).not.toContain('Jane')
  })
})

describe('what the tool may do', () => {
  it('opens the issue template that carries its label', () => {
    const template = readFileSync(resolve(repo, '.github/ISSUE_TEMPLATE', AGENT_TEMPLATE), 'utf8')
    expect(template).toMatch(new RegExp(`^labels: ${AGENT_LABEL}$`, 'm'))
  })

  it('is read-only and writes nothing', async () => {
    const before = readdirSync(b.folder).sort()
    const listed = JSON.parse(handleLine(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }), (await import('../serveTools')).projectTools(new Error() as never)) as string) as { result: { tools: Array<{ name: string; annotations: Record<string, boolean> }> } }
    const tool = listed.result.tools.find((t) => t.name === 'grid_report_problem')!
    expect(tool.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false })
    await report({ plan: 's11-junctions.json', tool: 'grid_check', expected: 'Nothing.' })
    expect(readdirSync(b.folder).sort()).toEqual(before)
  })

  it('names the protocol version a 2026-07-28 request names', async () => {
    const { projectTools } = await import('../serveTools')
    const { openProject } = await import('../../fs/projectFiles')
    const line = JSON.stringify({
      jsonrpc: '2.0', id: 9, method: 'tools/call',
      params: { name: 'grid_report_problem', arguments: { plan: 's11-junctions.json', tool: 'grid_check', expected: 'x' }, _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} } },
    })
    const out = JSON.parse(await handleLine(line, projectTools(openProject(b.folder, b.folder, 'project'))) as string) as { result: { structuredContent: { body: string } } }
    expect(out.result.structuredContent.body).toContain('- Protocol: 2026-07-28, named by the request')
  })

  it('leaves out a trace image, even one outside the project', async () => {
    b.write('traced.json', { ...(twoBedFlat() as object), referenceImage: { path: '../../Users/someone/Desktop/scan.png', opacity: 0.4 } })
    const draft = await report({ plan: 'traced.json', tool: 'grid_view', expected: 'The trace image drawn.' })
    expect(draft.data['body']).not.toContain('someone')
    expect(draft.data['body']).not.toContain('scan.png')
    expect(Object.keys(draft.data['plan'] as object)).not.toContain('referenceImage')
  })
})
