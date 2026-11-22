# QAR-7 review: the door-swing check on very large floors

For the owner. The door-swing check now tries each door only against the walls and doors near it,
and the 2D view runs it only for the floor it shows, on the drawing it has already built. The
findings are the same as before, in the same order.

## What changed

1. **A spatial index of boxes** (`packages/floorplan/src/geometry/boxIndex.ts`). `boxIndex(boxes)`
   files a fixed list of boxes, and `near(box)` returns the place in the list of every box that
   touches the one given, edges and corners included, in ascending order. It is a packed R-tree
   (sort-tile-recursive, 16 boxes a node), built once and never changed. Two helpers come with
   it: `boxOfPoints` and `widenBox`. It uses the `Box` type and the `overlaps` test that
   `polygons.ts` already had, so the later wall-against-wall checks can use it as it is. It is
   not exported from `@ongrid/floorplan/geometry`'s index: nothing outside the package needs it.
2. **The door-swing check uses it** (`sweep.ts`). The work for one floor is now its own exported
   function, `validateFloorDoorSweeps(slice, drawing, swingOf)`. `validateDoorSweeps(plan,
   swingOf)` keeps its signature and behaviour: it slices each floor, builds it and calls the
   new function. On each floor:
   - each door is tried only against the walls whose standing parts' box meets the box of the
     door's reach (the hinge ± the leaf's width). The exact test (`reachesInto`) is unchanged;
   - each pair of doors is tried only when the boxes of their reaches meet. The disc test and
     the clip are unchanged;
   - the openings are grouped by wall once. Before, every wall went through every opening of
     the floor to find its own, which was quadratic too.
3. **The corners use it too** (`joints.ts`). Looking for a wall that carries on through a joint
   went through every wall of the floor for every joint. Now it asks the index which axes pass
   within twice `joint` of the joint, then makes the same tests in the same order. The check calls
   `wallJoints`, and so does `buildFloorPlan`, so the drawing gets faster as well.
4. **The view checks only the floor it shows** (`packages/viewer`). `doorWarningsOf(slice,
   drawing)` calls `validateFloorDoorSweeps` with the slice and the drawing that `Canvas2D`
   (and `planPicture`) already have. Before, it called `validateDoorSweeps` on the slice. That
   rebuilt the floor's whole drawing (`buildFloorPlan`, with `validatePlan`) a second time, and
   it also sliced and built every other floor of the slice's floor list (empty, but still built).

`grid check`, `grid_check` and the scoreboard still call `validateDoorSweeps` on the whole plan,
so they speed up through (2) and (3) without any change on their side.

The change to where a door leaf hangs from, which the card mentions, had already landed with
SHT-2 (`0dfab8c`, "door leaves hung from the wall face"), so nothing about it is built here.

## Timings

All figures were taken on the 12-core laptop with about ten other sessions running (load average
200 to 250), so they are slower than on a quiet machine. The ratios are what to read.

SC-2's floor is the lab's own `AU4/L-rerun/scenarios/size/grid-5000-pieces.json` (5,000 rooms,
10,150 walls, 9,851 doors), run with `GRID_TIMING=1`:

| What | Before | After |
| --- | --- | --- |
| The door-swing check, given the floor's drawing, doors as written | 123.4 s | **0.64 s** |
| The same, with every door given a hinge and a swing | (not run) | 0.44 s |
| `buildFloorPlan` on the floor (untimed by the check, needed to draw it) | (not run) | 9.3 s |
| `validateDoorSweeps(plan)`, which builds the floor itself | (not run) | 9.1 s |

The lab measured 75.9 s on the same floor. The 123.4 s here is the old code, kept in the test, on
the same drawing and on this busy machine.

I also profiled a harder floor, from the scoreboard's seeded generator (`randomBuilding`, seed 7,
5,000 rooms, `pieces`: 14,941 walls of random lengths, 4,489 doors), on the code as it was. There,
`buildFloorPlan` took 170.6 s, and the old `wallJoints` alone took 65.0 s of that. The joint search
was quadratic in the walls of the floor; it now uses the index ("What changed", item 3).

## Tests

- `scoreboard/__tests__/doorSweeps.test.ts` holds the new code to the old code, which is kept word
  for word in `scoreboard/__tests__/allPairs/` (`sweep.ts` and `joints.ts` as they were at
  `e7cf925`; only the imports changed, and the old floor loop takes the drawing the test built).
  - By default: every lab plan and every generated plan the scoreboard stores, up to 500 rooms.
    That is 3,390 plans and 3,743 floors, and it includes the lab's generated 500-room floor.
    Each floor is checked twice: once with the doors as written, and once with every door given
    a hinge and a swing so that every door is checked. Between the two runs there are 909
    blocked doors and 497 colliding pairs. The test also compares `wallJoints` with the old
    corners on every plan. It takes 25 s on a busy machine.
  - With `GRID_TIMING=1`: the same comparison on the lab's twelve plans of 529 to 5,000 rooms
    (121 floors, all the same as before; 14 minutes on the busy machine),
    then the timing on SC-2's 5,000-room floor (`AU4/L-rerun/scenarios/size/grid-5000-pieces.json`),
    which fails at 2 s.
- `packages/floorplan/src/geometry/__tests__/boxIndex.test.ts` tests the index against trying
  every box, on lists of 0 to 3,000 boxes, including boxes that only touch at an edge or a corner,
  boxes that are not numbers, and an empty box.
- Full run: `vitest run --exclude '.claude/**' --maxWorkers=2`: 206 files and 4,355 tests
  pass, with the 2 opt-in tests skipped. The type check, lint, build and scoreboard pass, and the
  scoreboard prints "Same as the stored figures".
- No test was changed or removed. `pinned-tests.md` now names the door-swing timing guard.

## For the owner

1. **What "the check takes under 2 s" measures.** The 2 s figure is
   `validateFloorDoorSweeps` given the floor's drawing. That is what the view pays on top of
   drawing the floor, and it took 0.64 s. `buildFloorPlan` on the same floor takes 9.3 s, so
   `validateDoorSweeps(plan)`, which builds the floor itself, took 9.1 s. That call is not under
   2 s, and this card cannot make it so. What remains slow is `validatePlan` inside
   `buildFloorPlan`: the space comparison (`planSpaces` / `compare`), the plausibility questions
   and the wall faults. They show up in the profile of the generated floor above. This card
   does not cover them. They are the next card if the 2D view must open a 5,000-room floor
   quickly. I took the narrower reading because it is the one the card's "how" describes (an
   index, and the check for the floor shown), and it can be widened later.
2. **The corners changed too.** The card names only the door-swing check. The check calls
   `wallJoints`, and the old joint search was the larger cost on irregular floors (65 s of 170 s
   above), so I moved it onto the same index. It gives the same corners on every plan the
   comparison runs. Reverting it is one hunk of `joints.ts`.
3. **The index is an R-tree, not a grid.** `exposure.ts` has a private grid of 4 m cells for
   point queries. A grid needs a cell size, and long walls fill many cells. The packed R-tree has
   no size to choose and gives the same answers for any fan-out. I left `exposure.ts` alone; it
   could move onto `boxIndex` later.
4. **The old code is kept as test code** (`scoreboard/__tests__/allPairs/`, about 600 lines), so
   the comparison can run again on any future plan. It can be deleted once the owner is satisfied.
5. **`doorWarningsOf` changed its signature** to `(slice, drawing)`. It is the viewer's own
   helper and has no other callers.
