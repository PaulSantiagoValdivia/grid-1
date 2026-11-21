/**
 * Grid rules: the plan checks that apply a figure from a building code, and the front door.
 *
 * `inspectPlan` is the front door (MSG-1): it reads a plan, runs every check and returns one
 * record with one list and one count, and never throws. `docs/result-contract.md` is its
 * contract. `checkLocalRules` here is the full check it runs: the plan checks of
 * `@ongrid/floorplan` (`checkPlanSanity` there) and the figure checks, in one report. Only this
 * package exports a `checkLocalRules`. The store, which reads and writes files, is a separate
 * entry (`@ongrid/rules/store`), so this one stays free of Node.
 */

export * from './checks'
export * from './result'
export { planNotes } from './notes/notes'
export type { NoteText, PlanNote, PlanNotesView } from './notes/notes'
export * from './sheet/rulesSheet'
export { buildLookupPrompt } from './lookup/prompt'
