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
  // CNT-5: what kind of building it is decides which figure checks run; the check lines say
  // which did not, and why. A floor's own kind travels with `floors`.
  building: { shown: 'not shown', why: 'It decides which checks run (CNT-5); the check lines say which did not, and why.' },
  display: { shown: 'not shown', why: 'It says how a person reads lengths; the sheet prints metres (WRT-7).' },
  projectId: { shown: 'not shown', why: 'It names the project to other programs (QAR-5), not the building.' },
  walls: { shown: 'drawn' },
  openings: { shown: 'drawn' },
  rooms: { shown: 'drawn and tabled' },
  floors: { shown: 'a page each' },
  stairs: { shown: 'drawn' },
  referenceImage: { shown: 'not shown', why: 'A tracing aid, not part of the building.' },
  // CNT-12: the fixtures are drawn on each floor's plan by `drawPlan`, to scale. The 3D still
  // does not show them yet, and the room table measures the rooms, which they add nothing to.
  items: { shown: 'drawn' },
  // SHT-7: the notes, tags, symbols and the sketch are drawn on each floor's plan by `drawPlan`.
  // The plan's title and key are not: each page has its own title, and the band under the
  // drawing that holds them would not fit the page's box.
  title: { shown: 'not shown', why: 'Each page has its own title, from the sheet words.' },
  annotations: { shown: 'drawn' },
  sketch: { shown: 'drawn' },
  // CNT-3: the north arrow is drawn on each floor's plan by `drawPlan`, in the corner of its view.
  north: { shown: 'drawn' },
  yAxis: { shown: 'not shown', why: 'It says how the file\'s coordinates run (CNT-3); every page draws them as the file holds them, with y up.' },
  front: { shown: 'not shown', why: 'The front is said by grid describe and the tool server; the drawing marks no front yet.' },
  site: { shown: 'not shown', why: 'Where the building is on the earth goes into the IFC file; the sheet prints no location. The check page names the place the figures were for (site.country).' },
  written: { shown: 'not shown', why: 'It records how the plan was written (WRT-2), not the building.' },
} as const satisfies Record<keyof FloorPlan, Coverage>
