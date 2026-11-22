# QAR-3 review: known failures as failing tests, measured against outside figures

For the owner. Most of QAR-3 was already on `main` before this branch: earlier features had put
23 of the lab's Z-4 probes into the suite as they fixed them, and commit 861f679 had added the
independent area referee, the hand-worked table and the list of pinned tests. This branch adds
the five probes that were left out because they passed in the lab, turns the hand-worked plans
about a point away from the origin, and completes the pinned list. No production code changed.

## The done-when items

1. **Z-4's 28 probes are in the suite**, each saying its status in its test name or block:

   | # | Probe | Where (under `packages/floorplan/src/` unless named) | Status |
   |---|---|---|---|
   | 1 | Control: a rectangle measures between its inner faces | `geometry/__tests__/conventions.test.ts` | passes; never failed (added here) |
   | 2 | AR-1, an L with a deep cut | `conventions.test.ts` | passes, fixed by ARE-1 |
   | 3 | AR-1, the L from the glTF test | `conventions.test.ts` | passes, fixed by ARE-1 |
   | 4 | AR-14, the deep L turned 1, 45 and 180 degrees | `conventions.test.ts` | passes; never failed (added here) |
   | 5 | AR-14, the deep L with two walls reversed | `conventions.test.ts` | passes; never failed (added here) |
   | 6 | AR-14, a 6 × 6 m L with a 3 × 3 m cut, 24.64 m² at every turn | `conventions.test.ts` | passes, fixed by ARE-1 |
   | 7 | AR-2, a dividing line takes no floor | `conventions.test.ts` | passes, fixed by ARE-1 |
   | 8 | AR-2, a dividing line may state thickness 0 | `types/__tests__/floorplan.test.ts` | passes, fixed by ARE-2 |
   | 9 | AR-4, a room listed twice is reported | `geometry/__tests__/validation.test.ts` | passes, fixed by ARE-5 |
   | 10 | AR-12, a room narrower than its walls | `validation.test.ts` | passes, fixed by ARE-1 |
   | 11 | AR-13, swapped boundary entries 3 cm out of square | `validation.test.ts` | passes, fixed by ARE-1 |
   | 12 | MS-1, a misspelt field is not dropped in silence | `types/__tests__/floorplan.test.ts` | expected failure (`it.fails`) until MS-1's fix |
   | 13 | MS-2, a 1.5 m gap in an outline | `validation.test.ts` | passes, fixed by ARE-4 |
   | 14 | MS-3, a 27 m wall in a house | `validation.test.ts` | passes, fixed by MSG-15 |
   | 15 | MS-7, two walls in a row of different thickness | `validation.test.ts` | passes, fixed by ARE-1 |
   | 16 | MS-8, a door in a dividing line | `validation.test.ts` | expected failure until MS-8's fix |
   | 17 | MS-9, ids that differ by a trailing space | `validation.test.ts` | passes, fixed by MSG-6 |
   | 18 | MS-10, a misspelt floor when the plan lists its floors | `validation.test.ts` | passes; never failed (added here) |
   | 19 | MS-10, a misspelt floor with no floors list | `validation.test.ts` | passes, fixed by LVL-1 |
   | 20 | MS-15, a copy of a wall under a new id | `validation.test.ts`, `wallFaults.test.ts` | passes, fixed by MSG-12 |
   | 21 | MS-16, a door flush with the end of an angled wall | `validation.test.ts` | passes, fixed by MSG-15 |
   | 22 | MS-17, an unlisted wall cuts a room in two | `validation.test.ts` | passes, fixed by ARE-4 |
   | 23 | VE-2, a partition typed 27 for 2.7 | `geometry/__tests__/elevations.test.ts` | passes, fixed by MSG-15 |
   | 24 | CH-3, "USA" read as US, or refused | `packages/rules/.../rules-escape.test.ts` | expected failure until CH-3's fix |
   | 25 | CH-6, a 5 cm hole is not a way out | `packages/rules/.../rules-check.test.ts` | passes, fixed by MSG-18 |
   | 26 | EX-4, "Level 1" and "level-1" get different file names | `export/__tests__/planExport.test.ts` | expected failure until EX-4's fix |
   | 27 | EX-4, a non-Latin project name keeps a name of its own | `planExport.test.ts` | expected failure until EX-4's fix |
   | 28 | SC-2, the door-swing check on 400 rooms in under a second | `geometry/__tests__/sweep.test.ts` | never failed in the lab (added here); skipped on a machine under load (below) |

   Five expected failures remain (MS-1, MS-8, CH-3 and the two EX-4); each was run and fails
   today. `GRID_DISAGREES` in `room-areas.test.ts` stays empty.
2. **The independent area helper** is `packages/floorplan/src/test-support/referee.ts`
   (861f679): the lab referee's first three steps rewritten in TypeScript. Walls are solid strips
   with square ends, corner gaps are filled, and the floor round a seed point is measured exactly
   by cutting the plane into vertical slabs. The file has no `import` at all, so nothing from the
   geometry and not `polygon-clipping`; its test fails if one appears. The hand-worked table in
   `room-areas.test.ts` (L 24.64, T 15.84, U 21.24, Z 19.84 m², a courtyard house, thick walls,
   mixed thicknesses, a cross, an H, steps and the lab's nine-sided-hall flat) is checked with
   `roomArea` and with the referee at 0, 1, 45 and 180 degrees, now about the point (3.7, −2.3)
   so that turning also moves the plan. Grid and the referee agree with every hand figure.
3. **The pinned tests** are listed in `packages/floorplan/src/test-support/pinned-tests.md`: ten
   tests that hold today's behaviour on purpose (VE-2 twice, VE-3 twice, MS-1, MS-9, DR-2, EX-1,
   EX-4, CH-3), plus two noted outside the table: the IFC level-gap test and Z-6's "rejects a
   non-integer level", which LVL-1 changed on purpose to "accepts a half level". Each title was
   checked to still exist.

## Expectations changed

- `room-areas.test.ts`: the plans turn about (3.7, −2.3) instead of the origin. The figures are
  unchanged.
- Nothing else changed; every addition is a new test.

## For the owner

1. **SC-2's timing guard** cannot pass on this machine (load average 250 to 270): it took 2.0 to
   2.7 s against the lab's 0.32 s. It is skipped when the load average is above the core count,
   and retried twice. Whether it passes on a quiet machine or in CI is not verified. A profile
   showed most of the time is building the floor, not the sweeps, and the time grows faster than
   the floor (1.4 s at 400 rooms, 8.3 s at 900 under load). The other choices: raise the bound,
   or replace it with a growth guard like `diff-size.test.ts`, an expected failure until SC-2 is
   fixed.
2. **Where the referee lives.** It stays in `packages/floorplan/src/test-support/`, outside the
   geometry, and imports nothing. If "shares no code" should also mean another folder, moving it
   to `scoreboard/` is cheap.
3. **No CHANGELOG line**: only tests changed, which people would not notice.
4. **Nothing was missing in the lab**: Z-4's 28 probes and Z-6's list were both found; the five
   lab passes are confirmed by the lab's own probe log.

## Checks run

CHECKS_LINE
