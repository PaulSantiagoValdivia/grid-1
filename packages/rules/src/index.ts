/**
 * Grid rules: the plan checks that apply a figure from a building code.
 *
 * `checkLocalRules` here is the full check. It runs the plan checks of `@ongrid/floorplan` and
 * adds the figure checks, in one report of the same shape. The store, which reads and
 * writes files, is a separate entry (`@ongrid/rules/store`), so this one stays free of Node.
 */

export * from './checks'
export { planNotes } from './notes/notes'
export type { NoteText, PlanNote, PlanNotesView } from './notes/notes'
export * from './sheet/rulesSheet'
export { buildLookupPrompt } from './lookup/prompt'
