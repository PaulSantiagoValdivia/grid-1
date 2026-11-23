/**
 * CMD-7 (lab WR-11): the guide alone answers what every test model asked before its first plan.
 * Each question has its own section of the guide, which must say what a right answer says; and
 * the answers a fresh agent gave with nothing but the guide to read (`wr11-answers.json`, how it
 * was run is in its `run`) must each be right.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { agentGuide } from '../guide'
import { FIRST_QUESTIONS } from '../paragraphs'
import { answerFaults, WR11_QUESTIONS } from './wr11'

/** The guide's section that answers each question, by its heading. */
const SECTION: Readonly<Record<string, string>> = {
  'stair': 'What do I draw for a stair?',
  'office': 'Which word is the use for an office, a toilet or a stair?',
  'toilet': 'Which word is the use for an office, a toilet or a stair?',
  'inside-outside': 'Is a size inside or outside?',
  'dividing-line': 'Does a dividing line have a thickness?',
  'l-shaped': 'What about an L-shaped room?',
}

function section(heading: string): string {
  const guide = agentGuide()
  const start = guide.indexOf(`### ${heading}\n`)
  expect(start, heading).toBeGreaterThan(-1)
  const end = guide.indexOf('\n#', start + 4)
  return guide.slice(start, end === -1 ? undefined : end)
}

const recorded = JSON.parse(readFileSync(join(__dirname, 'wr11-answers.json'), 'utf8')) as {
  run: Record<string, string>
  answers: Record<string, string>
}

describe('the WR-11 questions', () => {
  for (const question of WR11_QUESTIONS) {
    it(`${question.id}: the guide's own section answers it`, () => {
      const missed = question.mustSay.filter((pattern) => !pattern.test(section(SECTION[question.id] as string)))
      expect(missed).toEqual([])
    })

    it(`${question.id}: the fresh agent, reading the guide alone, answered it right`, () => {
      const answer = recorded.answers[question.id]
      expect(answer, question.id).toBeTypeOf('string')
      expect(answerFaults(question, answer as string)).toEqual([])
    })
  }

  it('are each answered in short by the paragraph every place carries', () => {
    for (const word of ['inside faces', 'stair', 'office', 'toilet', 'no thickness', 'polygon']) expect(FIRST_QUESTIONS).toContain(word)
  })

  it('were put to an agent given the guide as it is now', () => {
    expect(recorded.run['guide']).toBe('docs/agent-guide.md')
    expect(Object.keys(recorded.answers).sort()).toEqual(WR11_QUESTIONS.map((q) => q.id).sort())
  })
})
