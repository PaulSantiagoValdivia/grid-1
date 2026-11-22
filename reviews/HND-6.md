# HND-6: a broken plan does not export clean-looking files

Card: "Every export says what it left out, both in its answer to the agent and inside the file
itself. An empty plan is refused or warned about instead of giving empty files that look valid."
Lab evidence EX-8 (K-1, K-16), AU4.

## What changed

- **What a file leaves out, worked out once**, `exportContents` in
  `packages/floorplan/src/export/leftOut.ts` (pure). From the validation the exporters skip by
  and nothing else: each floor the file holds is sliced (`planForFloor`) and validated
  (`validatePlan`, spaces off: they never change `broken`) as the views and the IFC do, and a
  part is left out exactly when that floor's `broken` set holds its id. Its `code` is the line
  that leaves it out. An opening no floor holds (its wall is not in the plan, or its wall's id is
  used on several floors, which `planForFloor` drops from every slice) is left out too, with the
  whole plan's line for it, the one `grid check` gives. Then the parts the reader left out
  (MSG-6 `plan/part-left-out`, `plan/id-clash`), by their place in the file. `empty` is true when
  the file would hold no wall, room or fixture.
- **`exportPlan`** returns `leftOut` (each part: `kind`, `id`, `place`, `floor`, `code`) and
  `empty`, and takes the reader's `faults`. Additive: every caller keeps working.
- **The note in each file**, worded in `packages/floorplan/src/geometry/export/leftOut.ts`,
  written only when something is left out, so a sound plan's files are byte for byte as before
  (the goldens, QAR-5's file-order tests and the scoreboard's export hashes of sound plans hold):
  - IFC: the property set `Grid_LeftOut` on the `IfcBuilding`, written last: `Parts`, `Note`, and
    per kind a count and its ids (`Openings`, `OpeningIds`, …). Ids are JSON strings inside a STEP
    string (`ifcString`).
  - DXF: the layer `GRID-LEFT-OUT` (listed only then) and TEXT lines under the drawing's lower left
    corner: the summary, then each kind's ids, run over as many lines as R12's 250-character cap
    needs, never cut inside a name (`sanitizeText` escapes as for room names).
  - OBJ: comment lines after the header; every character a line could break at is dropped.
  - GLB: `asset.extras.gridLeftOut` (`count`, `note`, `parts`), JSON-escaped.
  - An id several parts share is named once with how many (`"bath" 4 times`).
- **`grid export`** prints one line on standard error from the file's own list: how many parts,
  of which kinds, the first five names, split into "can't be drawn" and "left out when the plan
  was read". Before, it printed the whole plan's broken ids. `grid draw` and `grid sheet` keep
  their line as it was.
- **`grid_export`**: the receipt adds `leftOutParts`; `leftOut` counts what this file leaves out.
  The text carries the same line as the command. The description says it answers with what the
  file leaves out and refuses a file that would hold nothing.
- **An empty export is refused**, in `exportFile` (both the command, with or without `--out`, and
  the tool): `Nothing to export: <plan> has no wall, room or fixture that can be drawn[ on floor
  "<id>"].[ Left out: …; grid check says why.] No file was written.` Exit 1, or `isError: true`.
  No new record code: it is a refusal of the command and the tool, not a line of the record.
- Docs: `docs/commands.md` (new section "What an export leaves out"), `docs/tool-server.md`, the
  contract's Receipts table and a changelog entry.

## The lab cases, before and after

Measured by exporting the lab's plan files with the built command, before on `main` at 89f1f15
(which reads as MSG-6 does) and after on this branch. Counts of IFC entities by `grep`.

`d-dup-ids`, EX-8's six-floor block (157 walls, 139 rooms, 230 openings in the file; floors above
the ground use the same ids):

| | Before (89f1f15) | After |
|---|---:|---:|
| Openings in the plan file | 230 | 230 |
| Openings the reader leaves out (`plan/id-clash`) | 168 | 168 |
| `IfcOpeningElement` in the IFC (12 doors, 7 windows) | 20 | 20 |
| Openings read but held by no floor (their wall's id is on five floors) | 42, unnamed | 42, `opening/broken-wall` |
| Rooms the reader leaves out | 104 | 104 |
| `IfcWallStandardCase` / `IfcSpace` | 157 / 35 | 157 / 35 |
| What the IFC says it leaves out | nothing | `Grid_LeftOut`: `Parts` 314, `Openings` 210, `Rooms` 104 |
| Standard error and `grid_export`'s `leftOut` | 97 ("Left out 97 parts", the whole plan's broken ids) | 314, listed by kind |

So 230 = 20 in the file + 210 named as left out. MSG-6 did not change the 20: before it the
schema read all 230, and the 210 on the floors above the ground were held by no floor (their
walls' ids are on five floors) and dropped by the export in silence; now the reader takes 168
out first, and the export drops the other 42 and names them.
The old count of 97 named 29 wall ids and 26 rooms the IFC holds (validated floor by floor, the
copies are sound) and missed the 272 parts the reader left out.

The other K-1 and K-16 cases:

| Case | Before | After |
|---|---|---|
| `e-zero-length-wall` (9 walls, 6 rooms, 13 openings) | IFC with 3 of 6 rooms, 11 openings, nothing said in the file | the same IFC with `Grid_LeftOut`: 6 parts (wall `hall-east`, rooms `bath`, `bed2`, `hall`, doors `door-bath`, `door-bed2`) |
| `e-empty-walls` (no walls, 6 rooms, 13 openings) | four valid empty files | refused, exit 1: "has no wall, room or fixture that can be drawn. Left out: 6 rooms and 13 openings (…)" |
| `k-empty` (`{}`) | four valid empty files (998, 1,943, 66 and 92 bytes) | refused, exit 1, no file written |

The test (`packages/floorplan/src/export/__tests__/leftOut.test.ts`) builds the same case in code:
a ground floor and five floors above with one set of ids, read part by part. 12 openings in the
plan, 2 in the IFC, 10 named (8 `plan/id-clash`, 2 `opening/broken-wall` on L1), and
`Grid_LeftOut` says `Parts` 14, `Openings` 10.

## Expected figures and texts changed, and why

No existing test expectation changed. New tests:

- `packages/floorplan/src/export/__tests__/leftOut.test.ts`: the block (IFC counts and property
  set, one-floor exports, the note in DXF, OBJ and GLB, nothing in a sound plan's files), a
  hostile id (line breaks, `EOF`, a quote, `é`) kept inside the note in OBJ, DXF and IFC, and an
  empty plan and a plan with rooms and no walls marked `empty` in every format.
- `packages/cli/src/command/__tests__/grid.e2e.test.ts`, "grid export: what the file leaves out":
  the standard-error line and the note for each format on a flat with a zero-length wall, no
  line and no note for the sound flat, and three empty plans refused in every format, with and
  without `--out`, with nothing written.
- `packages/cli/src/mcp/__tests__/exportTool.test.ts`: `leftOutParts` for a sound and a broken
  plan (a part the reader left out by its place, a zero-length wall by its floor and code), the
  IFC's `Parts`, and the refusal of an empty plan with nothing written. `tools.test.ts` holds the
  new output schema.

## For the owner

- **Refuse, not warn.** An export that would hold no wall, room or fixture is refused by
  `grid export` and `grid_export`, since an empty file that looks valid is the harm the card
  names. The library still writes it and says `empty: true`, so another caller (an app's "Open
  in") can decide for itself. A one-floor export of an empty floor in a plan with others is
  refused the same way, naming the floor.
- **`grid_export`'s `leftOut` now counts what the file leaves out.** Before, it was the size of
  the whole plan's broken set, which counted wall ids a file holds and missed what the reader
  left out. It is still a count of parts that could not be drawn, so `resultVersion` stays 1;
  the changelog says what changed. If the owner reads this as a change of meaning, the version
  rises instead.
- **The views validate each floor on its own** (unchanged). A wall id written on two floors is
  drawn and exported on each, while `grid check`, which validates the whole plan, calls it
  `plan/duplicate-id` and the rooms on it `room/broken-wall` (EX-8: the IFC holds all 157 walls
  and 35 rooms that `grid check` says are left out). An export names what its file leaves out,
  not every line `grid check` gives. Making the exports skip such walls would agree with
  `grid check` and lose 145 sound walls from the block's IFC; I left it.
- **Parts the reader left out are named in every file**, the one-floor DXF, OBJ and GLB included:
  the reader cannot say which floor they were on.
- **The DXF note is visible text** under the drawing, on its own layer that a CAD user can turn
  off. A `999` comment would be invisible, but AutoCAD does not keep comments.
- **SVG is not an export**: it is `grid draw`'s picture, which says on standard error what it
  leaves out, as before. `grid sheet` is unchanged (its `leftOut` still counts the whole plan's
  broken ids).
- **Cost**: one more validation per floor exported (spaces off), and one of the whole plan only
  when an opening is held by no floor. The block exports in about 40 ms.

## Checks run

On `claude/hnd-6` from `main` at 89f1f15, on a machine shared by ten sessions:

- `npm run build`, `npm run typecheck`, `npm run lint`: passed.
- `npm run check:licenses`: 363 licences, none GPL, LGPL, AGPL, MPL or EPL.
- `npx vitest run --exclude '.claude/**' --maxWorkers=2 --minWorkers=1`: 214 files, 4,467 tests,
  all passed (735 s).
- `npm run scoreboard`: the same as the stored figures (rooms measured wrong 197, damage that
  passes in silence 386, turns 16, mistakes 2, checks 5, guards 735 and 95). Nothing stored.
