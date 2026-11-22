# CNT-15 review: named wall, door and window types, materials and room finishes

For the owner. What CNT-15 adds, how each done-when item is met, every expectation that changed,
the choices made without you, and the checks run. Lab evidence: AC-5 (party and core walls priced
as partitions), AU3-4 and EL-12 (one material called after the kind for every wall), AC-4 (a
kitchen's tiled floor turned to oak after a knock-through), RT-22 and CP2-3 (one edit per wall to
change every partition or raise every ceiling).

## What changed

1. **The plan format (C24, `packages/floorplan/src/types/floorplan.ts`).** `types` holds `walls`,
   `doors` and `windows` (each type an `id`, a `name` and optional values) and `defaults` (`walls`
   by kind, `door`, `window`). A wall states `wallType`, a door `doorType`, a window `windowType`.
   A room or zone states `finishes` (`floor`, `walls`, `ceiling`, `skirting`), each a name of the
   person's own. C22 stays unused, C23 is CNT-6's.
2. **Read-time filling (`withTypes`).** Before anything else reads the plan, each wall, door,
   window and opening pattern takes from its type what it leaves out: a wall its thickness,
   height (metres; the word `floor` leaves the floor's) and kind; a door or window its width,
   height, sill, kind and the part that opens. The part's own value wins. A default fills the
   type's id too. What was filled is listed in the part's `typed` (reading only: a file's own is
   named as a field Grid does not read), and `statedWall` and the new `statedOpening` leave it out
   of the file. So every reader (drawing, checks, areas, exports, sheet) reads the part, and a
   change to the type reaches every part of it. `readPlanParts` fills before reading a part on
   its own, and `planInMetres` converts the types' lengths with the rest.
3. **The drawing's check (`geometry/partTypes.ts`).** Three codes, each worth a look:
   `type/unknown` (a part or default names a type the plan does not hold, with the one most
   likely meant), `type/duplicate-id`, `type/wrong-part` (a dividing line with a wall type, a
   window with a door type). Words in `en.ts` and `es.ts` (draft), lines in the catalogue, rows in
   `changes/CNT-15.md`.
4. **The IFC (`geometry/export/ifc.ts`).** A wall of a named type is typed by it (its name, tag
   `wall-type:<id>:<thickness>`, element type `…, glazed` when glazed) and its layer is the
   type's material. Every layer whose material the plan does not state is of one material named
   `Not stated` (was one per kind, `Exterior wall`, `Interior wall`). A door or window of a named
   type is typed by it (`door-type:<id>`) and carries its material, or `Not stated`.
5. **Quantities (`packages/cli/src/quantities/finishes.ts`).** `finishShares`: each room's and
   zone's part of each surface, by finish; a room's finish covers it less its zones that name
   their own. `planFinishes` (room by room and totals) and `wallTypeRuns` (each named wall type's
   count, gross and net length, face, material).
   - `grid_schedule of=finishes`: the finishes plan, text or CSV.
   - `grid_schedule of=doors|windows`: a named type is a row of its own, first, `basis: 'named'`
     with `typeId`, `name`, `material`, `glazed`; the CSV adds `name` and `material` columns only
     when a row is named, so a plan with no types gives the same CSV as before.
   - `grid_takeoff`: `wallTypes` and `finishes`, on a plan that names any (keys absent otherwise).
   - The estimate (ARE-13): `wall-type:<id>:<thickness>`, `door-type:<id>`, `window-type:<id>`,
     `floor:finish:<name>`, `wall_finish:finish:<name>`, `ceiling:finish:<name>`,
     `skirting:finish:<name>`; the by-use and by-kind lines keep what is left.
6. **The change (`packages/cli/src/edit/types.ts`).** New tool `grid_change_type` (after
   `grid_change_opening`, 32 tools) and verb `grid edit type`: set or `clear` a type's values,
   add a type (with a name), give it to `parts` (taking out their own values for what the type
   states, and saying so), make it the `default`. Its answer lists every part of the type.
   `readingAfter` reads the plan again from what each part states when the plan has types, so
   the checks and the verdict measure what the file will read as.
7. **Finishes on rooms and the knock-through.** `grid_rename_room` takes `floor_finish`,
   `wall_finish`, `ceiling_finish`, `skirting_finish` (`none` takes one out). `grid_merge_rooms`
   refuses to merge two rooms that name different finishes for one surface unless `zones: true`
   (each zone keeps its own; the merged room names the ones they share); without zones a finish
   only the second room names is the merged room's.
8. **Rooms text.** Writing a plan again from rooms text keeps each part's type and each room's
   finishes by id (`carryFacts`), and a value the text writes that the type gives the same is
   left to the type. A `raw` line keeps the values a type gave, so it reads the same anywhere.
9. **`grid edit` lists.** A list option (`--parts`) is given once with its items split at commas.
10. **Docs.** `docs/plan-file.md` (new section "Named wall, door and window types, and
    finishes", the text limits table), `docs/areas.md` (the schedules, a new "Finishes and wall
    types" section, the estimate's keys), `docs/commands.md` (the IFC section, `grid edit type`,
    32 tools), `docs/tool-server.md` (rows for `grid_change_type`, `grid_schedule`,
    `grid_takeoff`, `grid_rename_room`), `AGENTS.md` (32 tools, a line on where CNT-15 lives).
    README untouched. `changes/CNT-15.md` holds the changelog lines and the three code rows.

## The done-when items, each with its test

In `packages/cli/src/mcp/__tests__/namedTypes.test.ts` (13 tests) and
`packages/floorplan/src/geometry/__tests__/partTypes.test.ts` (12 tests).

1. **Changing one partition type changes every partition that uses it, in one edit.** The
   two-bed flat's five inside walls are given `stud-100` by `grid_change_type` (their own
   thickness taken out); then one call, `thickness: 0.12`, writes only the type (the walls in the
   file are byte for byte the same), and every one of the five reads 0.12 m, the outside walls
   stay 0.3 m and the living room measures smaller. Also through `grid edit type`, after a write
   from rooms text, and in the core (a wall's own thickness still wins).
2. **The IFC writes each type's material, and "Not stated" when none is given (AU3-4).** The
   exported flat has `IFCMATERIAL('Plasterboard on timber studs')`, `'Oak'` for the door type and
   `'Not stated'` for the outside walls; no material is named after a kind. The core test checks
   each wall type's name, tag and element type, the glazed type, the door style's name and its
   material relation, and a type with no material.
3. **A kitchen's tiled floor survives a knock-through (AC-4).** Merging the tiled kitchen into the
   oak living room is refused with the two finishes and the way out (`zones: true`); with zones,
   the kitchen keeps `Porcelain tile`, the finishes schedule gives it the kitchen zone's own
   area, the oak goes to the living zone, and the estimate prices `floor:finish:Porcelain tile`
   by that area.

## Expectations changed

- `packages/floorplan/src/geometry/export/__tests__/ifc.test.ts` (2) and `ifc.structure.test.ts`
  (1): the walls' material is `Not stated`, one for all kinds, not `Interior wall` and `Exterior
  wall` (AU3-4: the plan states no material).
- `packages/floorplan/src/geometry/export/__tests__/golden/*.ifc` (4 files, regenerated): per file
  two lines, `IFCMATERIAL('Not stated')` for `'Exterior wall'` and the wall type's description
  (`The plan holds no type, material or build-up for these walls: …, with one layer whose
  material is not stated.`). Nothing else moved.
- `packages/floorplan/src/types/__tests__/reading.test.ts` and
  `packages/rules/src/result/__tests__/result.test.ts` (2): the fields of a wall gain `wallType`,
  the plan's fields gain `types`.
- `packages/cli/src/mcp/__tests__/tools.test.ts`: the order gains `grid_change_type` after
  `grid_change_opening`; it is a change to the plan; the most tools 31 → 32 (with its reason); a
  sample call for it. `server.test.ts`: 32 tools listed.
- `packages/cli/src/command/__tests__/everyPath.e2e.test.ts`: the new tool's `plan` and `out`
  path slots.
- `packages/cli/src/sheet/__tests__/coverage.test.ts`: an opening's fields are read from
  `OpeningFieldsSchema` (the opening schema is now wrapped to record `typed`); same fields.
- `packages/rules/src/result/__tests__/contract.test.ts`: the code row pattern takes the new kind
  `type/` (as CNT-4 added `flat/`).
- `packages/cli/src/__tests__/ownWords.test.ts`: counts for the files that gained English
  (`readTools` 309 → 315, `writeTools` 103 → 120 and `editTools` 69 → 73, tool descriptions,
  English by design; `edit/types.ts` 14 and `edit/merge.ts` 23 → 25, edit receipts;
  `estimate.ts` 27 → 33 and `finishes.ts` 2, rules and lines; `ifc.ts` 36 → 38, the two type
  notes; `floorplan.ts` 55 → 58, the blank-name refusals), and the not-moved ratchet 1510 →
  1539 with the list of what.

## For the owner

1. **Types are filled at read time, not stored on the parts.** A part names its type and the file
   keeps only what the part states, so one change to a type reaches every part. The reading lists
   what it filled in `typed`, as WRT-6's `unstated`. The other way, copying the type's values onto
   every part and rewriting them on each type change, was rejected: every edit would have had to
   know about types.
2. **A part's own value wins, and giving a part a type takes its own values out.** Plans written
   from rooms text state every wall's thickness, so `grid_change_type parts` removes a wall's own
   thickness, height and kind where the type states them, and says which. A write from rooms text
   afterwards leaves a value equal to the type's to the type. Say if a stated value should stay
   the part's own even when it equals the type's.
3. **The tool count goes to 32.** `grid_change_type` is a tool of its own: no existing change fits
   "every part of a type at once". Finishes went on `grid_rename_room` instead of a new tool.
4. **`Not stated` for every unstated wall material,** not only for walls of a type, because a
   material named after the kind (`Interior wall`) said what the plan does not hold (AU3-4). It
   changes every IFC Grid writes by two lines (the golden files). The layer set and type names
   (`Exterior wall 0.3 m`) stay. A door or window of no type still carries no material.
5. **Lined up with CNT-6.** A wall type's kind is the wall kinds' own list (`WallKindSchema`),
   so CNT-6's `separating` is a kind a type may state, with no second kind added: a party wall
   type gives its walls `separating`, which CNT-6's route and beyond checks read, and the IFC
   types them by the type, element type `Separating wall` (tested in `partTypes.test.ts`). The
   tool's kind list and description are built from that schema. Merging `main` at c7ae5613
   (CNT-6) conflicted only on adjacent additions (both features' plan fields, issue calls,
   catalogue groups, sheet coverage, conventions C23 then C24, the known-field lists in two tests
   and the words ratchet, which now adds both: 1511 + 29 = 1540).
6. **Defaults by wall kind.** A wall that states no kind is read as `interior` for its default.
   A default fills the type's id too, which is not written back.
7. **Two rooms with different finishes merge only as zones,** as two uses already do (CNT-8).
   Refusing is the reversible choice: nothing is lost in silence.
8. **A named door type of another size is a type apart** in the door schedule
   (`door-type:D90:1x2.1`), because a supplier orders by size; the estimate counts it with its type.
9. **Layered build-ups are out of scope**, as the card says: one material per type, one IFC layer.
10. **Not done:** rooms text has no words for types or finishes (they travel in `raw` lines and
    by id); the sheet has no finishes page and the drawing no finishes plan (`grid_schedule
    of=finishes` is the finishes plan, as text and CSV); the 3D view does not draw a glazed wall
    as glass; a wall placed by its face (HND-11) that takes its thickness from its type is moved
    by an edit by the default thickness in `wallWithEnds`, which reads the file's wall alone;
    `grid tidy --apply` reads the file's walls without their types.

## Checks run

See the report at the end of the session: the full suite, `npm run typecheck`, `npm run lint`
and `npm run scoreboard`, after merging `main`.
