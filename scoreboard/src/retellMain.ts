// `npm run retell`: the MSG-3 retelling set. Each prompt gives a model Grid's tool-server
// instructions and a real report, with a person's question; the scorer holds the answer to the
// label, the forbidden words and the figures' sources. Sending the prompts costs money, so the
// owner runs it (reviews/MSG-3.md); nothing here runs in the tests.
//
//   --model <id>        send every prompt to this model through the Anthropic Messages API,
//                       with the key in ANTHROPIC_API_KEY, and print the scores
//   --prompts <dir>     write each prompt to <dir>/<id>.txt and send nothing
//   --from <dir>        score the answers saved in <dir>/<id>.txt and send nothing
//   --out <file>        also write the answers and scores, as JSON, to this file
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { retellPrompts, retellSummary, runRetellings, scoreRetelling, type RetellPrompt, type RetellScore, type SendPrompt } from './retell'

const API = 'https://api.anthropic.com/v1/messages'

function argument(argv: readonly string[], name: string): string | undefined {
  const at = argv.indexOf(name)
  if (at < 0) return undefined
  const value = argv[at + 1]
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} needs a value`)
  return value
}

/** The Messages API, called with fetch: no SDK and no dependency. */
function messagesApi(model: string, key: string): SendPrompt {
  return async (prompt: RetellPrompt): Promise<string> => {
    const response = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 1024, system: prompt.system, messages: [{ role: 'user', content: prompt.user }] }),
    })
    if (!response.ok) throw new Error(`The model answered ${response.status} for ${prompt.id}: ${await response.text()}`)
    const body = (await response.json()) as { content?: { type: string; text?: string }[] }
    return (body.content ?? []).filter((part) => part.type === 'text').map((part) => part.text ?? '').join('')
  }
}

function print(scores: readonly RetellScore[]): void {
  for (const score of scores) {
    const unsourced = score.figures.filter((f) => f.given && !(f.basis && f.status)).map((f) => f.key)
    const why = [
      score.labelFirst ? '' : 'label not first',
      score.forbidden.length === 0 ? '' : `says ${score.forbidden.join(', ')}`,
      unsourced.length === 0 ? '' : `figures without basis or status: ${unsourced.join(', ')}`,
    ].filter((part) => part.length > 0)
    console.log(`${score.ok ? 'ok  ' : 'FAIL'} ${score.id}${why.length === 0 ? '' : `: ${why.join('; ')}`}`)
  }
  const s = retellSummary(scores)
  console.log(`\n${s.ok} of ${s.total} retellings held every point. Label first: ${s.labelFirst}. No forbidden word: ${s.noForbidden}. Figures with their sources: ${s.figuresSourced}.`)
}

async function main(argv: readonly string[]): Promise<number> {
  const model = argument(argv, '--model')
  const promptsDir = argument(argv, '--prompts')
  const from = argument(argv, '--from')
  const out = argument(argv, '--out')
  const prompts = retellPrompts()

  if (promptsDir !== undefined) {
    mkdirSync(promptsDir, { recursive: true })
    for (const prompt of prompts) writeFileSync(join(promptsDir, `${prompt.id}.txt`), `${prompt.system}\n\n=====\n\n${prompt.user}\n`)
    console.log(`Wrote ${prompts.length} prompts to ${promptsDir}. Nothing was sent.`)
    return 0
  }

  let scores: RetellScore[]
  let answers: Record<string, string>
  if (from !== undefined) {
    answers = {}
    scores = []
    for (const prompt of prompts) {
      const file = join(from, `${prompt.id}.txt`)
      if (!existsSync(file)) continue
      answers[prompt.id] = readFileSync(file, 'utf8')
      scores.push(scoreRetelling(prompt, answers[prompt.id]!))
    }
  } else if (model !== undefined) {
    const key = process.env['ANTHROPIC_API_KEY']
    if (!key) throw new Error('Set ANTHROPIC_API_KEY to send the prompts; --prompts or --from send nothing.')
    ;({ scores, answers } = await runRetellings(prompts, messagesApi(model, key)))
  } else {
    console.log('Pass --model <id> to send the prompts (it costs money), --prompts <dir> to write them, or --from <dir> to score saved answers.')
    return 2
  }

  print(scores)
  if (out !== undefined) writeFileSync(out, `${JSON.stringify({ model: model ?? null, answers, scores }, null, 2)}\n`)
  return scores.every((s) => s.ok) ? 0 : 1
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(2)
  },
)
