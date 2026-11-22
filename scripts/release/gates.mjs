// @ts-check
/**
 * QAR-10: the gates a release passes, in the order the release step runs them. The first that
 * fails stops the release, by name, before anything is packed. The release workflow runs the
 * release step, so it runs these; `scripts/__tests__/release.test.ts` holds both to this list.
 *
 * Each gate is a script of the root package.json or a run of the tests, so a person can run any
 * one of them alone.
 */

/** @typedef {{ name: string, what: string, npm?: string, vitest?: string[] }} Gate */

/** @type {readonly Gate[]} */
export const GATES = [
  { name: 'build', what: 'the command is bundled', npm: 'build' },
  { name: 'typecheck', what: 'the type check', npm: 'typecheck' },
  { name: 'lint', what: 'the lint', npm: 'lint' },
  {
    name: 'label',
    what: 'the label test: every report keeps "General guidance, not your local rules" and no line reads as approval',
    vitest: ['packages/cli/src/__tests__/label.test.ts'],
  },
  { name: 'licences', what: 'the licence check: no dependency under a GPL, LGPL, AGPL, MPL or EPL licence', npm: 'check:licenses' },
  { name: 'data', what: 'the lab data holds no machine paths and no personal data', npm: 'check:data' },
  { name: 'tests', what: 'the full test suite', vitest: [] },
  { name: 'scoreboard', what: 'the scoreboard gate: no count worse than scoreboard/current.json', npm: 'scoreboard' },
]
