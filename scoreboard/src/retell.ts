/**
 * MSG-3: the retelling prompt set and its scorer. An agent is given Grid's tool-server
 * instructions and a real report (what `grid check` prints for a lab plan or a fixture) and
 * asked a person's question about it. The scorer holds its answer to three things:
 *
 * - the label, "General guidance, not your local rules", is its first line;
 * - it holds none of the forbidden words outside quoted text (`approvalWords`): pass, complies,
 *   compliant, approved, meets code and their kin;
 * - every figure of the report it gives is given with its basis (the clause, or where it was
 *   looked up) and its status, in the same paragraph.
 *
 * Building the prompts and scoring are offline and tested against fixed sample retellings
 * (`scoreboard/retell/samples.json`). Running the prompts against a model is `npm run retell`
 * (`retellMain.ts`), which costs money and is the owner's to run.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { figureText, validatePlan } from '@ongrid/floorplan/geometry'
import { FloorPlanSchema, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { approvalWords, FIGURE_STATUS_WORDS, GENERAL_GUIDANCE_LABEL, type AppliedFigure } from '@ongrid/rules'
import { checkPlan, checkText } from '../../packages/cli/src/command/check'
import { INSTRUCTIONS } from '../../packages/cli/src/mcp/protocol'
import { labPlans } from './data'

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

export interface RetellCase {
  readonly id: string
  /** A lab plan by its name, or `fixture:<file>`. */
  readonly plan: string
  readonly country?: string
  readonly ask: string
}

export interface RetellPrompt {
  readonly id: string
  /** What the model is told first: Grid's tool-server instructions, the retelling rule among them. */
  readonly system: string
  /** The person's question and the report. */
  readonly user: string
  /** The report as Grid printed it. */
  readonly report: string
  /** The figures the report used: what a retelling has to give with their sources. */
  readonly figures: readonly AppliedFigure[]
  /** The plan's names and ids: the user's text, not held to the forbidden words. */
  readonly userText: readonly string[]
}

export interface FigureScore {
  readonly key: string
  readonly value: string
  /** Whether the retelling gives this figure at all. */
  readonly given: boolean
  /** Given with its basis in the same paragraph. */
  readonly basis: boolean
  /** Given with its status in the same paragraph. */
  readonly status: boolean
}

export interface RetellScore {
  readonly id: string
  /** The label is the first line that holds any text. */
  readonly labelFirst: boolean
  readonly forbidden: readonly string[]
  readonly figures: readonly FigureScore[]
  /** Every point held: the label first, no forbidden word, every figure given with basis and status. */
  readonly ok: boolean
}

/** The cases in `scoreboard/retell/cases.json`. */
export function retellCases(): readonly RetellCase[] {
  const file = JSON.parse(readFileSync(here('../retell/cases.json'), 'utf8')) as { cases: RetellCase[] }
  return file.cases
}

function planOf(name: string): FloorPlan {
  if (name.startsWith('fixture:')) {
    const file = here(`../../packages/floorplan/fixtures/${name.slice('fixture:'.length)}`)
    return FloorPlanSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
  }
  const stored = labPlans().find((p) => p.name === name)
  if (stored === undefined) throw new Error(`No lab plan is called ${name}`)
  return FloorPlanSchema.parse(JSON.parse(stored.text))
}

function userTextOf(plan: FloorPlan): string[] {
  const parts: { id?: string; name?: string }[] = [...plan.walls, ...plan.rooms, ...plan.openings, ...(plan.floors ?? []), ...(plan.items ?? [])]
  return parts.flatMap((part) => [part.id ?? '', part.name ?? '']).filter((text) => text.length > 0)
}

/** The prompt for one case, from the plan's real report. */
export function retellPrompt(one: RetellCase): RetellPrompt {
  const plan = planOf(one.plan)
  const { issues, broken } = validatePlan(plan)
  const result = checkPlan({ file: one.plan, plan, issues, broken }, one.country === undefined ? {} : { country: one.country })
  // MSG-10: the whole report, with every figure, so each case holds a model to sourcing them.
  const report = checkText(result, 1, { full: true })
  const user = [
    one.ask,
    '',
    'You ran grid_check on my plan. Here is everything Grid said, between the lines:',
    '-----',
    report.trimEnd(),
    '-----',
  ].join('\n')
  return { id: one.id, system: INSTRUCTIONS, user, report, figures: result.report.figures, userText: userTextOf(plan) }
}

/** Every case's prompt. */
export function retellPrompts(cases: readonly RetellCase[] = retellCases()): RetellPrompt[] {
  return cases.map(retellPrompt)
}

/** Straight quotes, one space, lower case: how a retelling is compared. */
const plain = (text: string): string => text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').toLowerCase()

/** A figure's value as a number is written, with no trailing zeros: "6.5", "0.508". */
function valuePattern(value: number): RegExp {
  const digits = figureText(value).replace('.', '\\.')
  return new RegExp(`(?<![\\d.])${digits}(?![\\d])`)
}

/** What a paragraph has to hold for a figure's basis: a clause it cites, or where it was looked up. */
function hasBasis(paragraph: string, figure: AppliedFigure): boolean {
  if (figure.origin === 'lookup') return /looked up|found online/.test(paragraph) || (figure.source !== undefined && paragraph.includes(plain(figure.source.url)))
  return figure.citations.some((c) => paragraph.includes(plain(c.clause)))
}

/** What a paragraph has to hold for a figure's status: its name, or the words Grid uses for it. */
function hasStatus(paragraph: string, figure: AppliedFigure): boolean {
  return paragraph.includes(figure.status) || paragraph.includes(plain(FIGURE_STATUS_WORDS[figure.status])) || (figure.status === 'ai-found' && /not (yet )?(been )?checked by a person|found by an ai/.test(paragraph))
}

/** Scores one retelling of a prompt's report. */
export function scoreRetelling(prompt: RetellPrompt, retelling: string): RetellScore {
  const firstLine = retelling.split('\n').map((line) => line.trim()).find((line) => line.length > 0) ?? ''
  const labelFirst = plain(firstLine).replace(/[*_#>"`]/g, '').includes(plain(GENERAL_GUIDANCE_LABEL))
  const forbidden = approvalWords(retelling, prompt.userText)
  const paragraphs = retelling.split(/\n\s*\n/).map(plain)
  const figures = prompt.figures.map((figure): FigureScore => {
    const pattern = valuePattern(figure.value)
    const where = paragraphs.filter((p) => pattern.test(p))
    const given = where.length > 0
    return {
      key: figure.key,
      value: `${figureText(figure.value)} ${figure.unit}`,
      given,
      basis: given && where.every((p) => hasBasis(p, figure)),
      status: given && where.every((p) => hasStatus(p, figure)),
    }
  })
  const ok = labelFirst && forbidden.length === 0 && figures.every((f) => !f.given || (f.basis && f.status))
  return { id: prompt.id, labelFirst, forbidden, figures, ok }
}

/** What a run of the set prints: how many retellings held each point, and all of them. */
export function retellSummary(scores: readonly RetellScore[]): { readonly total: number; readonly ok: number; readonly labelFirst: number; readonly noForbidden: number; readonly figuresSourced: number } {
  return {
    total: scores.length,
    ok: scores.filter((s) => s.ok).length,
    labelFirst: scores.filter((s) => s.labelFirst).length,
    noForbidden: scores.filter((s) => s.forbidden.length === 0).length,
    figuresSourced: scores.filter((s) => s.figures.every((f) => !f.given || (f.basis && f.status))).length,
  }
}

/** Sends one prompt to a model and gives back its answer: the network, for `npm run retell`. */
export type SendPrompt = (prompt: RetellPrompt) => Promise<string>

/** Runs every prompt through `send` and scores each answer. */
export async function runRetellings(prompts: readonly RetellPrompt[], send: SendPrompt): Promise<{ scores: RetellScore[]; answers: Record<string, string> }> {
  const scores: RetellScore[] = []
  const answers: Record<string, string> = {}
  for (const prompt of prompts) {
    const answer = await send(prompt)
    answers[prompt.id] = answer
    scores.push(scoreRetelling(prompt, answer))
  }
  return { scores, answers }
}
