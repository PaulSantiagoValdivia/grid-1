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
  or by a warning. MSG-15 settled it with a warning (`wall/size-question`), so the pinned test
  is as it was.
- **MS-1.** The probe `MS-1 a misspelt field is not dropped in silence` (floorplan.test.ts)
  asks that an unknown field is reported. The pinned room-use test reads an unknown *value* as
  not stated, on purpose, so that one bad value does not stop the preview. The two can live
  together if the fix reports the unknown field without refusing the plan.
- **MS-9.** `catches a collision between two different kinds of entity` (validation.test.ts)
  pins that `validatePlan` skips a room and a wall that share an id, both of them, because it
  marks what it skips in one set of ids. MSG-6 settled MS-9 in the reader instead
  (`types/readParts.ts`): a plan read from a file has the clash left out before `validatePlan`
  sees it, so only the room is left out and the rooms on the wall are measured. The pinned test
  still holds for a plan built in code, and is as it was.
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
| MS-8 | `geometry/__tests__/validation.test.ts` |
| MS-1 | `types/__tests__/floorplan.test.ts` |
| EX-4 (two cases) | `export/__tests__/planExport.test.ts` |
| CH-3 | `packages/rules/src/checks/__tests__/rules-escape.test.ts` |

Paths without a package are under `packages/floorplan/src/`.

## Expected failures that have been fixed

| Lab entry | Fixed by | Now a normal test in |
| --- | --- | --- |
| AR-1, AR-14, AR-2 (measuring) | ARE-1 | `geometry/__tests__/conventions.test.ts` |
| AR-1, AR-14, MS-7 (29 hand-worked cases) | ARE-1 | `geometry/__tests__/room-areas.test.ts`; `GRID_DISAGREES` is empty |
| AR-12, AR-13, MS-7 | ARE-1 | `geometry/__tests__/validation.test.ts`, "lab failures fixed by ARE-1" |
| AR-2 (schema), Z-5 | ARE-2 | `types/__tests__/floorplan.test.ts`, "a virtual wall"; Z-5 also in `types/__tests__/every-plan-parses.test.ts` |
| MS-2, MS-17 | ARE-4 | `geometry/__tests__/validation.test.ts`, "lab failures fixed by ARE-4" |
| AR-4 | ARE-5 | `geometry/__tests__/validation.test.ts`, "lab failures fixed by ARE-5" |
| MS-3, MS-16 | MSG-15 | `geometry/__tests__/validation.test.ts`, "lab failures fixed by MSG-15" |
| VE-2 | MSG-15 | `geometry/__tests__/elevations.test.ts`, "lab failures fixed by MSG-15" |
| MS-9 (ids that differ only by a trailing space) | MSG-6 | `geometry/__tests__/validation.test.ts`, "lab failures fixed by MSG-6" |
| MS-15 | MSG-12 | `geometry/__tests__/validation.test.ts`, "lab failures fixed by MSG-12"; the plans behind MS-2, MS-15, MS-17, W-10 and L-6 in `geometry/__tests__/wallFaults.test.ts` |
| MS-10 | LVL-1 | `geometry/__tests__/validation.test.ts`, "lab failures fixed by LVL-1"; the other LVL-1 cases in `geometry/__tests__/levels.test.ts` |
| CH-6 (the size half) | MSG-18 | `packages/rules/src/checks/__tests__/rules-check.test.ts`, "lab failures fixed by MSG-18"; the lab's three cases in `geometry/__tests__/passable.test.ts` |

ARE-1 also changed one expected figure on purpose: `exports a room bounded by a virtual wall`
in `geometry/export/__tests__/ifc.test.ts` now expects the room to run to the dividing line,
4.10 m by 3.0 m instead of 4.05 m, because a virtual wall has no width.

ARE-4 made two expected failures pass by accident, and they were tightened so that they still
ask for their own fix. `MS-8 a door on a virtual wall is reported` now asks for a line about
the door; its dividing line also splits the room, which ARE-4 reports. `VE-2 one partition
typed 27 instead of 2.7 …` (elevations.test.ts) now asks for a line about the height; its
partition also stands inside the room without being in the wall list, which ARE-4 reports.
Both are still expected failures.

ARE-5 fixed `AR-4 a room listed twice is reported` and moved it to a block named "lab
failures fixed by ARE-5", asserting the code (`room/overlap`), the room it is on and the whole
message instead of "some issue". No expected figure changed.

MSG-15 fixed `MS-3 a wall 27 m high in a house is worth a warning`, `MS-16 a door flush with the
end of an angled wall is accepted` and `VE-2 one partition typed 27 instead of 2.7 …`, and moved
them to blocks named "lab failures fixed by MSG-15". MS-3 now asserts the code
(`wall/size-question`) and the whole question. Two figures in `spaces.test.ts` changed with the
table, both recorded in `reviews/MSG-15.md`: the strip of unclaimed floor in `two rooms side by
side in one space` follows the `gap` (every wall is lengthened by 2 cm, not 1 mm), and `says so
when the walls lie too far out to join` asks the spaces check directly, because validation now
refuses walls past `largest` before the spaces are worked out.

MSG-12 fixed `MS-15 a copy of a wall under a new id is reported` and moved it to a block named
"lab failures fixed by MSG-12", asserting the code (`wall/duplicate`), the wall it is on and the
whole message. Two tests in "lab failures fixed by ARE-4" pin the exact list of issues and gained
a line on purpose: `MS-2 a 1.5 m gap in a room outline is reported` now also expects
`wall/short` on the wall that stops short, and `MS-17 a wall that cuts a room in two without
being listed is reported` now also expects `wall/crosses-room` on the partition. The room-level
lines they asserted are unchanged. No expected figure changed.

MSG-13 changed what four tests ask, on purpose, because the stated `kind` is no longer the
answer to "is this an outside wall" (lab MS-11). `follows the declared kind, not how exposed the
wall turns out to be` (ifc.test.ts) is now `follows how exposed the wall is, as the drawing and
the DXF do, when no kind says exterior`. In "a flat drawn on its own" (rules-check.test.ts) a
front door on a wall that says `interior` with nothing behind it is now a way out; the landing
behind it is drawn as walls with no room, which keeps the "space not drawn" finding and notice
those tests pin. `windows only onto the hall` (rules-escape.test.ts) now draws the hall. The
Madrid and Berlin flats (room-rows-flats.test.ts) now expect one `wall/kind-differs` line for
each wall stated exterior that a light well or a balcony drawn as a room lies against. No
expected figure changed.

QAR-5 fixed no expected failure: the lab's file-order entries (MS-21, L-12, K-13) had none. It
changed two pins on purpose, both recorded in `reviews/QAR-5.md`. The four IFC golden files
(`geometry/export/__tests__/golden/`) were written again: every GlobalId changed, because an
identity is now made from the project id, the element's kind, its floor and its id, as one JSON
array; no other line changed or moved. `stays unique inside one document even when the seed
repeats` (ifc.test.ts) now expects that seed. `is pinned: re-exports only stay recognisable
while this value never changes` is as it was: the hash itself did not change.

LVL-1 fixed `MS-10 a misspelt floor is reported when the plan lists no floors` and moved it to a
block named "lab failures fixed by LVL-1", asserting the code, the wall and the severity. Two
pinned tests changed on purpose. `rejects a non-integer level` (floorplan.test.ts) is now
`accepts a half level`: a level orders the floors and need not be whole (VE-3), and it left the
pinned list. In "a floor nobody declared" (validation.test.ts) a wall that names a floor the
list does not hold is now an error, and the wall is left out, where it was a warning and drawn.
The three pinned stacking tests in elevations.test.ts, and the IFC's `ignores gaps in the level
numbering`, are unchanged: a floor that states no level still stacks by order, as they pin. No
expected figure changed. See `reviews/LVL-1.md`.

ARE-6 fixed no expected failure: the lab's AR-5 (a room with a hole) had no `it.fails`. It
changed no pin, golden file or snapshot: every plan without `holes` gives the same areas and
export bytes, and the same issues but one. A room whose one wall list goes round its outline and
then round a hole, as the lab wrote AR-5, is refused as before, and the refusal now ends with how
to list the hole (`reviews/ARE-6.md`). Four test literals gained the new required `holes: []` field and nothing
else: a `PlanRoom` in `dimensions.test.ts`, and a `SceneSlab` in `gltf-large.test.ts`,
`Slab3D.test.ts` and `RoomMarker3D.test.ts`. The new pins are in `geometry/__tests__/holes.test.ts`,
`viewer/src/picture/__tests__/holes.test.ts`, "a room with a hole (ARE-6)" in `ifc.test.ts` and
the AR-5 case in `scoreboard/__tests__/scoreboard.test.ts`.

MSG-18 fixed `CH-6 a 5 cm hole in the outside wall is not a way out` and moved it to a block
named "lab failures fixed by MSG-18", asserting every finding (`no_exit`, `room_without_door`
and the new `opening_too_small_to_pass` on the hole) instead of only that `no_exit` is there. The other
half of CH-6, what lies beyond an opening (a window into the next room, a door into a walled
courtyard), is MSG-17's and has no `it.fails`. No other expected figure changed (`reviews/MSG-18.md`).

## Kinds of test the suite does not have yet

From the lab's entry Z-7. None of these is built here.

- **An independent area referee.** Started here: `test-support/referee.ts`, the table in
  `room-areas.test.ts` and the generated rooms in `room-shapes.test.ts`. It does not yet
  measure virtual walls, angled rooms or whole plans.
- **Generated room plans.** `room-shapes.test.ts` builds 300 rooms shaped L, T, U, Z and
  cross from a fixed seed and checks their areas. There are none yet for validation or for
  whole plans (MS-20).
- **Timing guards.** The plan comparison has one. The door-swing check has one that runs only
  when asked (QAR-7, SC-2): `GRID_TIMING=1` runs `scoreboard/__tests__/doorSweeps.test.ts` on a
  5,000-room floor, whose drawing takes minutes to build. Nothing times `buildFloorPlan` itself.
- **Pictures and real readers.** Nothing compares what the 2D or 3D view draws, and exported
  files are compared with Grid's own output and four golden IFC files, never opened by the
  programs people use (SE-8, SE-9, DR-3, EX-1).
- **An agent or a person in the loop.** Six entries can only be checked by watching someone
  use Grid (MS-13, WR-2, WR-10, WR-11, PE-1, PE-2).
