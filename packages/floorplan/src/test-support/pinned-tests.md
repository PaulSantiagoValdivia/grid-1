# Tests that pin today's behaviour on purpose

These tests assert what Grid does today, and each one was a decision with a comment, not an
oversight. A fix on the roadmap may turn one of them red. When it does, change the test on
purpose, in the same commit as the fix, and say so in the commit message. Where the old
behaviour must survive for files already written, keep the test and add the new case beside
it. The list comes from the lab's entry Z-6. Each line names the test, its file and the lab
entry whose fix may change it.

| Test | File | Changes with |
| --- | --- | --- |
| stands each storey on the tallest wall below it, and sinks basements by their own | `packages/floorplan/src/geometry/__tests__/elevations.test.ts` | VE-2 |
| lets floors that share a level share one storey, as tall as the taller walls | `packages/floorplan/src/geometry/__tests__/elevations.test.ts` | VE-2 |
| ignores gaps in the level numbering | `packages/floorplan/src/geometry/__tests__/elevations.test.ts` | VE-3 |
| counts a declared floor with no walls as 2.7 m | `packages/floorplan/src/geometry/__tests__/elevations.test.ts` | VE-3 |
| rejects a non-integer level | `packages/floorplan/src/types/__tests__/floorplan.test.ts` | VE-3 (half levels) |
| reads %s as not stated and keeps the rest of the room (a room's `use`) | `packages/floorplan/src/types/__tests__/floorplan.test.ts` | MS-1 |
| catches a collision between two different kinds of entity | `packages/floorplan/src/geometry/__tests__/validation.test.ts` | MS-9 |
| agrees with the area: width × depth is the room area | `packages/floorplan/src/geometry/__tests__/dimensions.test.ts` | DR-2 (true only for rectangles) |
| escapes an accented letter as \U+XXXX, which CAD tools decode | `packages/floorplan/src/geometry/export/__tests__/dxf.test.ts` | EX-1 |
| exports one floor for the 2D and 3D formats, the one the user is looking at | `packages/floorplan/src/export/__tests__/planExport.test.ts` | EX-4 |
| is false for any other country | `packages/rules/src/checks/__tests__/rules-figures.test.ts` | CH-3 |

The IFC export pins the same level rule as elevations: `ignores gaps in the level numbering:
levels are an order, not positions` in `packages/floorplan/src/geometry/export/__tests__/ifc.test.ts`
(VE-3).

## Where an expected failure meets a pinned test

None of the expected failures added with this list contradicts a pinned test outright, so
nothing had to be left out. These pairs pull in different directions, and the fix has to
settle them:

- **VE-2.** The probe `VE-2 one partition typed 27 instead of 2.7 does not make a 27 m storey
  in silence` (elevations.test.ts) questions the tallest-wall rule that `stands each storey on
  the tallest wall below it` pins. The probe is satisfied either by a different storey height
  or by a warning, so a fix that only warns leaves the pinned test as it is.
- **MS-1.** The probe `MS-1 a misspelt field is not dropped in silence` (floorplan.test.ts)
  asks that an unknown field is reported. The pinned room-use test reads an unknown *value* as
  not stated, on purpose, so that one bad value does not stop the preview. The two can live
  together if the fix reports the unknown field without refusing the plan.
- **CH-3.** The probe `CH-3 "USA" is read as the same place as "US", or refused`
  (rules-escape.test.ts) and `is false for any other country` agree today, because the pinned
  test lists ES, GB, DE, IT and Spain and never USA. A fix that reads more spellings of the US
  must keep those five false.
- **EX-4.** The probes `EX-4 floors named "Level 1" and "level-1" get different file names` and
  `EX-4 a project named in a non-Latin script keeps a name of its own` (planExport.test.ts)
  need a different way of turning names into file names. `uses the project name, and the floor
  only when the plan has several` in the same file pins today's names (`my-house-first-floor.obj`,
  `casa-nandu-2o.ifc`, `floor-plan.glb`); a fix that changes those is changing a pinned figure.
- **AR-1 and DR-2.** `agrees with the area` in dimensions.test.ts reads the shared fixture,
  whose three rooms are four-sided. The inside-corner fix (ARE-1) left it green; it is the
  first test to break if a room with an inside corner is added to that fixture.

## Expected failures in the suite today

Each is an `it.fails` test whose title starts with its lab entry ID. When a fix lands the
test fails, and `it.fails` becomes `it`.

| Lab entry | Where |
| --- | --- |
| AR-4, MS-2, MS-3, MS-8, MS-9, MS-10, MS-15, MS-16, MS-17 | `geometry/__tests__/validation.test.ts` |
| AR-2 (schema), Z-5, MS-1 | `types/__tests__/floorplan.test.ts` |
| VE-2 | `geometry/__tests__/elevations.test.ts` |
| EX-4 (two cases) | `export/__tests__/planExport.test.ts` |
| CH-3 | `packages/rules/src/checks/__tests__/rules-escape.test.ts` |
| CH-6 | `packages/rules/src/checks/__tests__/rules-check.test.ts` |

Paths without a package are under `packages/floorplan/src/`.

## Expected failures that have been fixed

| Lab entry | Fixed by | Now a normal test in |
| --- | --- | --- |
| AR-1, AR-14, AR-2 (measuring) | ARE-1 | `geometry/__tests__/conventions.test.ts` |
| AR-1, AR-14, MS-7 (29 hand-worked cases) | ARE-1 | `geometry/__tests__/room-areas.test.ts`; `GRID_DISAGREES` is empty |
| AR-12, AR-13, MS-7 | ARE-1 | `geometry/__tests__/validation.test.ts`, "lab failures fixed by ARE-1" |

ARE-1 also changed one expected figure on purpose: `exports a room bounded by a virtual wall`
in `geometry/export/__tests__/ifc.test.ts` now expects the room to run to the dividing line,
4.10 m by 3.0 m instead of 4.05 m, because a virtual wall has no width.

## Kinds of test the suite does not have yet

From the lab's entry Z-7. None of these is built here.

- **An independent area referee.** Started here: `test-support/referee.ts` and the table in
  `room-areas.test.ts`. It does not yet measure virtual walls, angled rooms or whole plans.
- **Generated room plans.** Randomised tests exist for triangulation, storey stacks and the
  plan comparison, but none for rooms, areas or validation (MS-20).
- **Timing guards.** Only the plan comparison has one. The door-swing check needs one (SC-2,
  SC-3); its lab probe ran 400 rooms in about a third of a second, so it is not a failure today.
- **Pictures and real readers.** Nothing compares what the 2D or 3D view draws, and exported
  files are compared with Grid's own output and four golden IFC files, never opened by the
  programs people use (SE-8, SE-9, DR-3, EX-1).
- **An agent or a person in the loop.** Six entries can only be checked by watching someone
  use Grid (MS-13, WR-2, WR-10, WR-11, PE-1, PE-2).
