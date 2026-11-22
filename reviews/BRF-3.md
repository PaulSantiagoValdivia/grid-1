# BRF-3 review: the site, plot outline, street edge and distances to the boundary

For the owner. A plan's `site` now holds the plot: its `boundary`, which edges are `streets`, the
`setbacks` the person asked for, and its own `things` (fence, gate, path, paving, tree, pool). Grid
answers with the distance from each edge and each face of the building to the boundary, with the
set-back beside it, and with the plot coverage. `site` is extended; no parallel part, version 1.

## Findings reproduced first (main at 26729c9, before any change)

Run in a copy of 26729c9 (`git archive`) with its own `@ongrid` links, so nothing of this branch
was loaded. The house is the lab's G series house (`G/scenarios/s01b-site-fields.json`, lab EL-16's
own plan): outside walls 0.30 m thick on centre lines from (3.15, 10.15) to (11.85, 19.85), so its
outside face runs x 3 to 12, y 10 to 20, 90 m². The plot 15 × 30 m, 450 m², edge 1 on the street,
3 m asked from every edge. Slid 2 m east, the east face is at x 14: 1.00 m from the east edge.

- **EL-16, the slide.** `inspectPlan` gave the same lines where the house stood and slid 2 m: three
  `plan/unknown-field` lines for `boundary`, `streets` and `setbacks`, and nothing else. No line
  named a distance or a set-back.
- **Coverage and the stand-ins.** Nothing in Grid gave a plot coverage. With the lab's stand-ins
  (`s01g`, `s05a`): the fence and three trees drawn as walls took the IFC from 9 walls to 37 (+28:
  4 fence walls, 24 tree walls) and the roof top from 2.95 m to 4.25 m; the pool drawn as a room
  was 32.00 m² of floor (the lab wrote 31.99 m²) and took the net area from 76.34 to 115.01 m²
  with the shed.

## Done when

1. **"The house slid to 1 m from a boundary where 3 m was asked reports '1.00 m from the east
   boundary; you asked for 3.00 m'."**
   - `packages/rules/src/result/__tests__/site.test.ts`, "reports the house slid to 1 m from the
     east boundary where 3 m was asked": one `plan/setback-short` finding, message
     `The building is 1.00 m from the east boundary; you asked for 3.00 m`, `found` naming edge 2
     facing east, `needed` "3.00 m from it, the set-back the person asked for from every edge: their
     own figure, not a code's"; one problem. Where the house stood: no line at all.
   - `packages/floorplan/src/geometry/__tests__/site.test.ts`, "slid 2 m east…": the core finding
     with its `boundary` data (edge 2, distance 1, asked 3 from `all`, `given`).
   - `packages/cli/src/mcp/__tests__/site.test.ts`, "reports the house slid…": `grid_measure
     what=site` prints `Edge 2: 1.00 m from the east boundary; you asked for 3.00 m: 2.00 m short.`
2. **"Plot coverage reads 20% for 90 m² on 450 m²; the fence, trees and pool add 0 walls and 0 m²
   and leave the roof height alone."**
   - `packages/floorplan/src/geometry/__tests__/site.test.ts`, "reads 20% for 90 m² on 450 m²" and
     "the fence, the trees and the pool add 0 walls and 0 m², and leave the roof height alone": the
     house with eight things (fence, gate, path, paving, three trees at 4 m, pool) has the same
     wall count, the same IFC wall count, the same net, gross internal and gross external area, the
     same `floorElevations(...).roof` and the same findings as without them; coverage 0.2.
   - `packages/cli/src/mcp/__tests__/site.test.ts`, "reads 20% for 90 m² on 450 m²…": the text
     `Plot coverage: 20%, the building's 90.00 m² on the 450.00 m² plot.`, and `grid_areas`
     answers the same with and without the things.

## What changed

1. **The plan format** (`types/floorplan.ts`, new convention C11). `SiteSchema` gains `boundary`
   (3 to 2,000 points, either way round; a last point on the first closes it), `streets` (edge
   numbers), `setbacks` (`{ from: 'all' | 'street' | n, distance, source?: 'given' | 'assumed' }`)
   and `things` (`SiteThingSchema`, kinds `SITE_THING_KINDS`). Cross-field checks: an edge the
   boundary does not have, a street named twice, a second set-back from one target, a street
   set-back with no street, two things with one id. All optional, never defaulted.
2. **Reading** (`types/readParts.ts`): a fault in one street, set-back or thing leaves that one
   out alone; any other site field alone (generalising COD-3's `country`). The command's text
   limits (`command/planText.ts`) cover things' ids and labels, their count and point counts.
3. **The core.** `geometry/plot.ts`: the boundary's edges, numbered, named by the way they face
   (by the plan's north, else the top of the drawing), with their street flag and the set-back
   each takes (edge, else street, else all); the things as a view draws them. `geometry/site.ts`:
   the footprint (LVL-4's `slabOutline` per floor, joined), each edge's least distance, how far
   past it the building reaches, each face's distance square to it, the coverage.
   `PlanDrawing` gains `site` and `siteBounds`, on the ground floor only. Tolerances
   `setbackShort` and `pastBoundary` (0.005 m each), in the table and `docs/tolerances.md`.
4. **Checks and the record.** A seventh plan check, `site-boundary` (plan-sanity, cites nothing),
   with findings `setback_short` and `over_boundary` → `plan/setback-short` and
   `plan/over-boundary`; notice `boundary_not_measured` → `plan/not-checked-boundary`; drawing
   check `plan/boundary-crosses`; and `plan/site-things-drawn-only`. Coverage `looksAt: 'edge'`
   with skip reasons `no_building_outline` and `boundary_not_closed`. One new limit line. Each
   code has its catalogue entry, a row in the contract's table and the changelog entry. The
   rules package now passes the core's plan-wide notices through (before, only per-floor ones).
   `floor/sketch-drawn-only`'s fix now offers the site's things.
5. **Tools and commands.** `grid_measure what=site` (`quantities/site.ts`, no new tool);
   `grid describe` adds the plot line; `grid_mirror` mirrors the boundary and things;
   `grid check` prints "edges of the boundary" for the new check.
6. **The picture** (`viewer/src/picture/site.ts`, `look.ts`, `scene.ts`): the site under the
   building, in each look's own `site` colours and its `boundary`, `street` and `site` lines
   (the technical look by its pens: boundary medium, street cut, things finest).
7. **Sheet**: `coverage.ts` says the site is drawn (on the ground floor's plan, by `drawPlan`).
8. **Docs**: `plan-file.md` (a section "The plot: its boundary, set-backs and what is on it", the
   limits table, the `site` row, the mirror and sketch paragraphs), `tool-server.md` (the
   `grid_measure` row and "The plot: distances to the boundary, and the coverage"),
   `commands.md` (describe), `areas.md` (coverage is not an area figure; things are in none),
   `result-contract.md`, `CHANGELOG.md`.

## Changed test expectations

- `floorplan/.../orientation.test.ts`: the lab's site with a two-point `boundary` used to read
  (the field was unknown); it is now refused as no plot, so the test reads the lab's four-point
  boundary and asserts the two-point one is refused.
- `floorplan/.../rules-catalogue.test.ts`: six plan checks → seven, `site-boundary` last.
- `rules/.../rules-lookup-figures.test.ts`: the plans there state no plot, so `site-boundary` is
  not listed as run; four checks are not listed instead of three.
- `cli/.../shortReport.test.ts`, `grid.e2e.test.ts`: "never looked at (10)" → (11), one more
  limit line in every report; the full report's "What each check looked at (8)" → (9) and
  `grid_check`'s `coverage` 8 → 9 entries. The short report keeps (8) and its byte counts.
- `cli/.../coverage.test.ts`: the list of checks gains `site-boundary`.
- `cli/.../grid.e2e.test.ts`, the built file's cap: 500 kB → 550 kB. Main at 26729c9 already
  built 503,303 bytes (past the old cap: the test fails on main); BRF-3 makes it 509,915. No new
  dependency.
- No golden file changed: the IFC writes nothing of the site that was not there before.

## Checks

Run once each, in order, on a laptop shared with other sessions, `--maxWorkers=2 --minWorkers=1`.

| Gate | Result |
| --- | --- |
| `npm run build` | passes; `packages/cli/dist/grid.mjs` is **509,915 bytes** (main at 26729c9: 503,303) |
| `npm run typecheck` | passes |
| `npm run lint` | passes |
| `npm run check:licenses` | passes: 363 licences, none GPL, LGPL, AGPL, MPL or EPL |
| Full suite (`vitest run --exclude '.claude/**'`) | 296 files, **5,294 passed, 5 failed, 4 skipped**, in 628 s. The 5: four in `shortReport.test.ts`, where the plot check added a "Nothing was checked" line to every short report (fixed in 9c87597: the short report leaves the plot check out on a plan with no plot; the file rerun alone, 40 passed, with `coverage.test.ts`, `grid.e2e.test.ts` and the tool test, 117 passed), and `scoreboard.test.ts`, which fails on a count better than stored until it is stored (98f1b57; rerun alone after storing: 19 passed) |
| `npm run scoreboard` | **Checks the plan can feed 16 → 20, better**; every other count the same: rooms measured wrong 197 (lab 194 of 16,542, 735 not measured), damage silent 278 of 3,000, turns 18 of 67, mistakes 5 of 9, sound plans with a warning 95 of 442. Stored with `--write-current` in 98f1b57: the capability `site` is now yes, which feeds checks 36, 37, 38 and 39 |

## For the owner

1. **Set-backs as a list of records in `site.setbacks`**, `{ from, distance, source? }`, `from`
   being `all`, `street` or an edge number, like BRF-1's wishes (`source` in WRT-6's words). The
   lab's agents wrote `"setbacks": {"all": 3.0}`; that form is refused by name, not read. Reading
   it too is a small change in the schema if wanted. No quote of the person's words is stored
   in the plan (BRF-1 keeps quotes in the brief file).
2. **Edges by number** (edge 1 from the first point to the second), not by compass word: a street
   is a fact of the plot, and naming it "south" would move it when north is stated. Lines name an
   edge by the way it faces ("the east boundary"), adding the number only when two edges face
   one way.
3. **The footprint is every floor at or above the ground floor, seen from above**; basements are
   left out, an upper floor that oversails counts where it reaches. The alternative is the
   ground floor alone. Nothing outside the walls (eaves, steps, balconies not drawn as walls) is
   measured, and the limits line says so.
4. **An edge's distance is the least distance** (tape between nearest points), which is what a
   set-back is set against; **a face's distance is square to it**, to the edge in front. With
   least distance for faces, a house's north face read 3.00 m to the east edge, from its corner.
5. **Coverage is the footprint's part inside the boundary over the plot's area**, printed whole
   when it is (20%), else to one decimal (BRF-5 always prints one decimal).
6. **A new plan check in the core**, `site-boundary`, labelled "Plan sanity check, not a code
   citation" like the other six; its title says the set-backs are the person's. So the record
   lists nine checks and one more limit line on every plan. On a plan with no plot the short
   report leaves the plot check out (it looked at nothing and could not have), so the flat's
   short report keeps its MSG-10 byte counts; the full report and the record still list it.
7. **The line codes start `plan/`** (the line is about the plan as a whole; the contract test
   reads only the existing thing prefixes). A `site` thing kind would touch every consumer of
   `ThingKind`.
8. **The site is drawn on the ground floor's plan only** (the lowest floor when none stands at
   the ground), and its frame grows to the plot there, so that floor's picture is at a smaller
   scale than the others. There is no `--hide site` yet.
9. **The bundle cap** raised to 550 kB (see above): main was already past 500 kB.
10. **Colours** of the site in each look are Grid's own choice (`LIGHT_SITE`, `DARK_SITE`,
    `TECHNICAL_SITE`), not in the app's `plan-tokens.css`, so the CSS test does not hold them.

## Not built

- The site in the 3D views, the IFC (no `IfcSite` footprint or geographic elements), the DXF,
  the OBJ and the glTF. The IFC's left-out note (HND-6) is for parts that cannot be drawn, so it
  does not list the site's things either.
- A ground level per edge or a slope; a plot with holes; a set-back to a line other than the
  boundary (a building line).
- A key entry for the site's things, and `--hide site`.
- A plan-wide line's mark sits in the drawing's top-left corner over the label (existing MSG-8
  layout); seen on the site picture, not changed here.
