/**
 * CMD-7 (lab WR-11): the questions every test model asked before its first plan, scripted, with
 * what a right answer must say. `wr11.test.ts` holds the guide to answering each, and holds the
 * answers a fresh agent gave from the guide alone (`wr11-answers.json`) to scoring every one.
 *
 * A right answer is scored by what it says, not its words: each `mustSay` is a pattern a right
 * answer matches, and each `mustNotSay` one a wrong answer would.
 */
export interface Wr11Question {
  readonly id: string
  readonly question: string
  readonly mustSay: readonly RegExp[]
  readonly mustNotSay?: readonly RegExp[]
}

export const WR11_QUESTIONS: readonly Wr11Question[] = [
  {
    id: 'stair',
    question: 'The person\'s house has two floors joined by one stair. What do you draw for the stair in the plan, and on which floors?',
    mustSay: [/\buse[ds]?\b[^.]*\bstair\b|\bstair\b[^.]*\buse\b|`stair`/i, /\b(every|each|both)\b[^.]*\bfloors?\b/i, /same place|over (one another|each other)|line[sd]? up|through/i],
  },
  {
    id: 'office',
    question: 'The person calls one room "my office". Which use do you give it?',
    mustSay: [/\boffice\b/i],
    mustNotSay: [/\bstudy\b[^.]*\buse\b/i],
  },
  {
    id: 'toilet',
    question: 'Downstairs there is a small room with only a WC and a basin, which the person calls "the loo". Which use do you give it?',
    mustSay: [/\btoilet\b/i],
    mustNotSay: [/use[^.]*\bbathroom\b/i],
  },
  {
    id: 'inside-outside',
    question: 'The person says the living room is 4 by 5 metres. Is a room\'s size in rooms text measured inside or outside its walls, and how would you write a size the person measured to the outside faces?',
    mustSay: [/\binside\b/i, /\boutside\b/],
  },
  {
    id: 'dividing-line',
    question: 'The kitchen is open to the living room, with no wall between them, but the person wants each measured. Does the line between them have a thickness, and how do you write it?',
    mustSay: [/\bno thickness\b|\bzero\b|\bthickness (of )?0\b|\b(does not|doesn\'t) have (a )?thickness\b|\bhas no thickness\b/i, /\bopen\b|\bvirtual\b/i],
  },
  {
    id: 'l-shaped',
    question: 'The living room is L-shaped. How do you write it?',
    mustSay: [/\bone room\b|\bsingle room\b|\bas one\b/i, /\bpolygon\b/i],
  },
]

/** The patterns an answer misses or wrongly matches, empty when it is right. */
export function answerFaults(question: Wr11Question, answer: string): string[] {
  return [
    ...question.mustSay.filter((pattern) => !pattern.test(answer)).map((pattern) => `does not say ${pattern}`),
    ...(question.mustNotSay ?? []).filter((pattern) => pattern.test(answer)).map((pattern) => `says ${pattern}`),
  ]
}
