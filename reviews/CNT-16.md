# CNT-16: columns and a structural grid

Branch `claude/cnt-16`. Convention C25 (given by the coordinator). Changelog fragment
`changes/CNT-16.md`. Docs: `docs/plan-file.md` "Columns and a structural grid" (new section, and
its rows in the code index and the text limits), the net and headroom rows and a paragraph of
`docs/areas.md`, three rows of `docs/tolerances.md`, and one bullet in `AGENTS.md`. Merged with
local `main` at ba740f1e (CNT-15).

## What changed

**Plan format (C25, `types/floorplan.ts`).** Two new top-level lists, optional and never
defaulted, version 1:

- `columns`: `{ id, shape: 'square' | 'round', width, depth?, at, turn?, height?, floor?, through?, label? }`.
  A column is its own list, not a fixture kind (C6) and not a wall. `depth` is for a square column
  only (a round one with a depth is refused by the schema).
- `grids`: `{ id, name?, origin, turn?, floors?, x: { spacing, names? }, y: { spacing, names? } }`.
  Names must match the lines one for one and differ across the grid; at most `gridLinesMost`
  (100) lines a set; refused by the schema otherwise.

**Geometry.** `geometry/columns.ts`: footprints (a round one as `columnRoundPieces` sides, its
area the true circle's), the room a column stands in (smallest room holding its middle, zones
aside, as fixtures), `roomColumnArea` (the column cut to the room's outline, less holes, scaled to
the true circle), `columnFloorIds`/`columnRise` through LVL-5's `through` (`through.ts` now takes any
part with `floor`/`through`), slices (`sliceColumns`, called from `cutFloor`; `columnPart` says
which column of the plan a slice's copy is), and `columnIssues`. `roomFloorArea` (`room.ts`) takes
the columns off, so every reader of a room's area (areas, describe, IFC spaces, size checks, sun,
diff) sees the net figure. `geometry/structuralGrid.ts`: a grid's lines (`planGrid`), their names
(1, 2, 3 / A, B, C, AA), `gridDimensions` (new `DimensionKind` `grid`, added by `buildDimensions`),
`gridIssues`.

**Areas (ARE-9).** `MEASURES.net` now says the floor the columns cover is taken off; its "not taken
off" says a column drawn as a short wall still counts. The headroom row says a column is not taken
off there (it is measured on the room's whole floor). `FloorAreaFigures.columns` and
`RoomAreaFigure.columns` are new; a note says how much floor columns take. The identity is now
gross external = net + columns + over stairs + outside rooms + walls + unclaimed − off its space.

**Drawing (both looks, `planScene`).** `PlanDrawing.columns` and `.grids` (left out when empty).
Columns are drawn after the walls, filled in the outside-wall tone with an ink outline (technical:
the cut pen); grid lines are chain lines under the walls, each name in a circle past both ends;
the spacing comes through `buildDimensions`. Key entries "Column" and "Structural grid".

**Exports.** IFC: `writeColumns`, an `IfcColumn` per column on its own storey (rectangle or circle
profile, swept to its top through floors), `Qto_ColumnBaseQuantities`, after the stairs in its own
containment. DXF: categories `columns` (`GRID-COLUMNS`, hatch and outline, a round one as a true
circle) and `structural-grid` (`GRID-STRUCTURAL-GRID`, dash-dot, circles and names); grid
dimensions with the others. OBJ and GLB: `column_<id>` solids (`columnMesh`). 3D view and the
sheet's still: `Column3D` in `Storey3D`. `nearOrigin` moves columns and grids; `inIdOrder` sorts them.

**CLI.** `grid_takeoff` adds `columns` (by shape and size: count, metres, volume) with a rule, only
on a plan with columns; describe (person and agent) lists each floor's columns; the sheet's
coverage places `columns` (drawn and tabled) and `grids` (drawn); `planText.ts` limits their ids
and names.

**Codes.** `plan/column-too-large`, `plan/column-duplicate-id`, `plan/column-unknown-floor`
(left out), `plan/column-through-floor`, `plan/grid-unknown-floor` (warnings); catalogue entries,
en/es `issue.*` and `line.*` keys, rows in the fragment.

## The four "done when"s

1. **EL-6 open office**: `packages/floorplan/src/geometry/__tests__/columns.test.ts`, "measures the
   open office with three columns at 89.68 m², not 90.09" and "says in the net area's rule that
   columns are taken off": a 10.01 × 9.00 m room (90.09 m²) with three 0.37 m squares (0.4107 m²)
   measures 89.68; `MEASURES.net` and the note say so.
2. **Warehouse IFC**: `packages/floorplan/src/geometry/export/__tests__/columns.test.ts`, "holds 8
   IfcColumn in its IFC …, and no stub wall": eight `IFCCOLUMN`, four `IFCWALLSTANDARDCASE` (the shed).
3. **Grid drawn**: `packages/viewer/src/picture/__tests__/columns.test.ts`, in the `working` and the
   `technical` look: 8 lines, 16 circles with names, 8 grid dimensions; core in
   `columns.test.ts` ("dimensions the grid line to line and in all").
4. **Every format**: IFC, DXF (own layer), OBJ, GLB in the export test; 3D scene in `columns.test.ts`
   ("is raised once in 3D"); take-off, describe and sheet coverage in
   `packages/cli/src/quantities/__tests__/columns.test.ts`.

## Tests whose expected values changed

- `packages/rules/src/result/__tests__/result.test.ts`: the list of the plan's fields in a
  `plan/unknown-field` line gains `columns, grids` (after CNT-15's `types`).
- IFC golden files (`one-floor`, `three-floors`, `basement`, `odd-walls`): only the net area's
  rule text in each space's `AreaRule` and `NetFloorArea` description, which now names columns. No
  number moved.
- `packages/cli/src/__tests__/ownWords.test.ts`: `sheet/coverage.ts` 28 → 29 (the columns' place,
  "drawn and tabled") and `geometry/tolerances.ts` 245 → 250 (what the three new entries decide),
  both `developer`, each with a comment naming CNT-16.

## Scoreboard

`npm run scoreboard` after the merge with main at ba740f1e: "Same as the stored figures". No count moves: turns answered 22, design mistakes named 5, checks the plan can feed 22, rooms Grid does not measure 735, sound plans with a warning 95. No lab plan states columns yet, so no lab room's area moves.

## Checks run

After merging main at ba740f1e: `npm run build` (ok); `timeout 1500 npx vitest run --exclude '.claude/**' --maxWorkers=4 --minWorkers=1`: 371 files, 6102 passed, 4 skipped, none failed; `npm run typecheck` (clean); `npm run lint` (clean); `npm run scoreboard` (same as stored).

## For the owner

- Columns are a list of their own (`columns`), not a fixture kind and not a wall kind, as the card
  recommended. Square or round; a rectangle is a square column with a `depth`.
- The structural grid field is called `grids` (a list, so a plan can hold a turned wing's grid
  too). "Structural grid" in every sentence, so it is not read as the product's name.
- A column's room is the smallest room holding its middle (zones aside); only the part inside that
  room's outline comes off, so a column half in a wall takes half. A column straddling two rooms
  comes off the one holding its middle only.
- Area by headroom does not take columns off (it is measured on the room's whole floor); its rule
  says so. Easy to change if the owner wants the bands net.
- A column's own faults are not added to `broken` (a column sharing a wall's id would take the wall
  out with it); `leftOutColumns`/`soundColumns` leave it out instead. Columns are not in the
  reader's part-by-part refusal (`readParts.ts`): a malformed column refuses the plan as any
  unlisted field does. Exports do not list a left-out column in `leftOut` (no `column` kind yet).
- The IFC writes no `IfcGrid` (kept to columns only, as asked while CNT-15 was building). The grid
  is in the drawing, the sheet and the DXF only.
- Unnamed y lines are lettered A to Z without skipping I and O.
- The take-off's column rule and line appear only on a plan with columns, so every other take-off
  answer is unchanged. The `grid_takeoff` tool's description was not edited; only its run body and
  output schema (`columns`).
- `Scene3D.columns` is optional in the type (tests build scenes by hand); `buildScene` always sets it.
- Diff (`grid diff`) does not compare columns yet.
