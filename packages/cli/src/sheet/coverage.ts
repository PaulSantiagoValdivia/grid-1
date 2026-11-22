/**
 * VEW-7: what the sheet does with each top-level part of a plan.
 *
 * The sheet draws nothing of its own: a part is drawn by `drawPlan` and `planStill`, and
 * measured by `planAreas`. When the plan schema gains a part (furniture, say), this table no
 * longer has an entry for every key of `FloorPlan` and the type check fails, until someone
 * decides what the sheet does with it. `coverage.test.ts` checks the same against the schema
 * itself, so `npm test` fails too.
 */
import type { FactField, FloorPlan } from '@ongrid/floorplan/types/floorplan'

export type Coverage =
  | { readonly shown: 'drawn' }
  | { readonly shown: 'drawn and tabled' }
  | { readonly shown: 'a page each' }
  | { readonly shown: 'tabled' }
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
  // LVL-8: an opening pattern is drawn as the plain openings it expands into, on every page that
  // draws its walls, as every other picture and export draws them.
  patterns: { shown: 'drawn' },
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
  // CNT-3 and LVL-4: where the building is goes into the IFC file; the ground level (`site.ground`)
  // feeds the checks, whose findings the sheet lists. COD-3: the check page names the place the
  // figures were for (`site.country`). BRF-3: the plot's boundary, its street edges and the
  // site's things are drawn on the ground floor's plan by `drawPlan`; the distances to the
  // boundary and the plot coverage are `grid_measure what=site`'s, and the set-back lines are on
  // the check page.
  site: { shown: 'drawn' },
  // WRT-6: what is assumed is drawn in its own style by `drawPlan`, and listed to confirm by
  // `grid check`; the sheet's checks page lists those lines with the others.
  marks: { shown: 'drawn' },
  // HND-11: the lengths taped on site are checks, not parts of the building: `grid check` and
  // every change's answer give the table, and the sheet's checks page lists one that differs.
  taped: { shown: 'not shown', why: 'Lengths taped on site are checks, not parts of the building (HND-11): grid check and every change\'s answer give each one taped against drawn, and the checks page lists one that differs with the other lines.' },
  written: { shown: 'not shown', why: 'It records how the plan was written (WRT-2), not the building.' },
  // VEW-3: a saved view is a camera for grid_view and grid draw --view; the sheet takes its own.
  views: { shown: 'not shown', why: 'A saved view is a camera for grid_view and grid draw --view (VEW-3); the sheet takes its own pictures.' },
  // CNT-17: what needs to be accessible is a mark for the measurements, not part of the drawing.
  accessible: { shown: 'not shown', why: 'It marks the rooms and routes that need to be accessible (CNT-17), which grid_measure what=access measures; the sheet draws no mark and states no figure for them.' },
  // CNT-4: each flat's outline is drawn on each floor's plan by `drawPlan` (a chain line along the
  // middle of the walls round its rooms), and the check set has the flat schedule and the mix by
  // type as a table, from the same rows as grid_schedule of=flats. A flat type is in that table.
  flats: { shown: 'drawn and tabled' },
  flatTypes: { shown: 'tabled' },
} as const satisfies Record<keyof FloorPlan, Coverage>

/**
 * CNT-9: what the sheet does with each field CNT-9 adds to the parts of a plan: the facts of the
 * person's own and a room's stated number. `FACT_FIELDS` names them; a field added there fails
 * the type check here until it is placed, and `coverage.test.ts` holds the list to the schema.
 */
export const FACT_COVERAGE = {
  'rooms.number': { shown: 'drawn and tabled' },
  'rooms.properties': { shown: 'drawn and tabled' },
  'openings.properties': { shown: 'drawn and tabled' },
  'walls.properties': { shown: 'not shown', why: 'The sheet has no wall schedule; grid_find and the IFC and DXF files give a wall\'s facts.' },
  'floors.properties': { shown: 'not shown', why: 'Each floor page shows its plan and areas; grid_find and the IFC and DXF files give a floor\'s facts.' },
} as const satisfies Record<FactField, Coverage>
