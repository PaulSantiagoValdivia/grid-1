// The scoreboard's printout, and the stored figures it is compared with.
import { readFileSync } from 'node:fs'
import { COUNTS, compareCounts, type Counts, type Scoreboard } from './counts'

export interface Stored {
  readonly what: string
  readonly counts: Counts
  readonly detail?: Scoreboard['detail']
}

export const STORED = (name: string): URL => new URL(`../${name}`, import.meta.url)

export function readStored(name: string): Stored {
  try {
    return JSON.parse(readFileSync(STORED(name), 'utf8')) as Stored
  } catch {
    return { what: 'missing', counts: {} as Counts }
  }
}

const pad = (text: string | number, width: number): string => String(text).padStart(width)

export function report(result: Scoreboard, baseline: Stored, current: Stored, partial: boolean): { text: string; worse: boolean } {
  const out: string[] = []
  const changes = compareCounts(current.counts, result.counts)
  out.push('Grid scoreboard: the lab plans, the damage set and the sound plans', '')
  out.push(`${'Count'.padEnd(40)}${pad('baseline', 10)}${pad('stored', 10)}${pad('now', 10)}`)
  for (const change of changes) {
    const meta = COUNTS[change.id]
    const mark = change.verdict === 'worse' ? '  WORSE' : change.verdict === 'better' ? '  better' : ''
    out.push(`${meta.title.padEnd(40)}${pad(baseline.counts[change.id] ?? '-', 10)}${pad(change.stored, 10)}${pad(change.now, 10)}${mark}`)
  }
  const d = result.detail
  const area = (set: string): string => {
    const t = d[`areas:${set}`]!
    return `${t.wrong} wrong of ${t.compared} compared, ${t.notMeasured} not measured, ${t.plansGridCannotRead} of ${t.plans} plans unreadable`
  }
  out.push(
    '',
    `Rooms, against the referee: lab plans ${area('lab')}; generated plans ${area('generated')}.`,
    `Rooms, against the construction: sound plans ${area('sound')}.`,
    `Damage: ${Object.entries(d.damage!).map(([k, v]) => `${k} ${v}`).join(', ')}.`,
    `Sound plans: ${d.sound!.plansWithAWarning} of ${d.sound!.plans} get a warning (${d.sound!.warnings} lines).`,
    `Turns: ${d.turns!.answered} of ${d.turns!.turns}. Checks: ${d.checks!.fed} of ${d.checks!.checks}. Mistakes: ${d.mistakes!.named} of ${d.mistakes!.mistakes}.`,
    `Plans with no referee figure: ${result.noRefereeFigure.length} (listed in scoreboard/README.md).`,
  )
  const worse = changes.filter((c) => c.verdict === 'worse')
  const better = changes.filter((c) => c.verdict === 'better')
  out.push('')
  if (partial) out.push('Partial run (--every): the counts cover a subset and are not compared with the stored figures.')
  else if (worse.length > 0) out.push(`Worse than the stored figures: ${worse.map((c) => COUNTS[c.id].title).join(', ')}.`)
  else if (better.length > 0) out.push('Better than the stored figures. Store them: npm run scoreboard -- --write-current')
  else out.push('Same as the stored figures.')
  return { text: out.join('\n'), worse: !partial && worse.length > 0 }
}

