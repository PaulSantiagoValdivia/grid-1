/**
 * VEW-7: what the sheet does with each top-level part of a plan.
 *
 * The sheet draws nothing of its own: a part is drawn by `drawPlan` and `planStill`, and
 * measured by `planAreas`. When the plan schema gains a part (furniture, say), this table no
 * longer has an entry for every key of `FloorPlan` and the type check fails, until someone
 * decides what the sheet does with it. `coverage.test.ts` checks the same against the schema
 * itself, so `npm test` fails too.
 */
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'

export type Coverage =
  | { readonly shown: 'drawn' }
  | { readonly shown: 'drawn and tabled' }
  | { readonly shown: 'a page each' }
  | { readonly shown: 'not shown'; readonly why: string }

export const SHEET_COVERAGE = {
  version: { shown: 'not shown', why: 'It describes the file format, not the building.' },
  units: { shown: 'not shown', why: 'It describes the file format; the sheet prints metres.' },
  projectId: { shown: 'not shown', why: 'It names the project to other programs (QAR-5), not the building.' },
  walls: { shown: 'drawn' },
  openings: { shown: 'drawn' },
  rooms: { shown: 'drawn and tabled' },
  floors: { shown: 'a page each' },
  referenceImage: { shown: 'not shown', why: 'A tracing aid, not part of the building.' },
} as const satisfies Record<keyof FloorPlan, Coverage>
