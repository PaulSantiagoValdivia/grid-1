# MSG-16 review: where each opening stands

For the owner. Grid now checks where every opening stands against the walls that meet its wall.
It names five cases, all as warnings: an opening that runs into a wall meeting its wall, a wall
that ends inside an opening, an opening as long as its wall, a door or window on a dividing line,
and a window with rooms on both sides. `grid_split_room` refuses to end a new wall inside a door
or window, and gives the nearest size that is clear.

## What changed

1. **The core check** (`packages/floorplan/src/geometry/openingPlaces.ts`, called by
   `validatePlan` with the other checks of the walls). For each wall, on each floor, it works out
   where the bodies of the walls that meet it stand along its axis:
   - two walls meet as the wall faults have them meet: an end within half the other's thickness
     plus `gap` of its line;
   - another wall's body covers half its thickness divided by the sine of the angle, either side of
     where the two lines cross;
   - meetings sharper than `mitreReach` are left out, as the corners leave them square (SHT-2);
   - parallel walls do not meet.

   QAR-7's `boxIndex` finds the candidate pairs. Every opening and every wall end is then tested
   against those covers, and an overlap of more than `openingOverrun` is named.

   | Code | About | When |
   | --- | --- | --- |
   | `opening/crosses-wall` | the opening | it runs into the body of a wall where its own wall ends at that wall (a corner, a T), or where that wall passes through. The line gives the offsets that keep it clear. |
   | `wall/ends-in-opening` | the wall that ends | it ends on another wall, inside its length, within one of its openings |
   | `opening/fills-wall` | the opening | its span covers the whole axis of its wall. Given instead of `crosses-wall`, so it is said once. |
   | `opening/on-dividing-line` | the opening | a door or window on a virtual wall. A doorless opening there says nothing. |
   | `opening/window-between-rooms` | the window | the stretches of its wall under the window have rooms on both faces (`wallSides`). The line names the wall and both rooms, and says it may be a borrowed light. |

   Every issue carries `hits`, the other ids it names, so the result record lists them in `also`.
2. **The edit command** (`packages/cli/src/edit/split.ts`). Where the new wall meets each wall of
   the room, `wallEndInOpening` (core, exported) checks the new wall's end, as thick as the wall,
   against that wall's openings. A landing in one is refused with one line: the opening, the wall,
   the side, and the nearest size across from the side asked for that is clear. `grid_add_room`
   already refused openings in the way and is unchanged.
3. **Catalogue and contract.** The five codes are in `packages/rules/src/result/catalogue.ts`, in
   the code table of `docs/result-contract.md`, and in a new entry at the top of its changelog for
   agents.
4. **Tolerances.** No new figure. `openingOverrun` and `mitreReach` now also decide part of this
   check, and their text in `tolerances.ts` and `docs/tolerances.md` says so.

**Cutting the opening through its own wall only** was already true: the drawing (`wallParts`),
the 3D model and IFC (one void per opening, related to its own wall) cut nothing else. A test now
holds the drawing to it: a door across a corner leaves the wall it runs into drawn whole.

**F28, door swings in the report.** Since MSG-1 they are in `grid check` and `grid_check`, through
`inspectPlan`, and they are drawn in the view. No other report exists for them to go in. A test now
holds the report to it on the lab's own MS-8 room: a door that swings into a wall gives
`opening/door-blocked` about the door, with the wall in `also`.

## Done when

1. **MS-8:** a door on a dividing line, a door across a junction and a window 0.1 m from a corner
   each give an issue. These are in `geometry/__tests__/openingPlaces.test.ts`; the lab's own MS-8
   plans are in `scoreboard/__tests__/openingPlaces.test.ts`. The `it.fails` test `MS-8 a door on a
   virtual wall is reported` passes and is now a plain test under "lab failures fixed by MSG-16".
   All **141 openings** the damage set pushes to the end of their wall are named; the lab's own run named 54 of them.
2. **CP4-11** (`CP4/scenarios/testfit/option-b.json`): `s-x1`, `s-x2` and `s-x3` are each named
   with `wall/ends-in-opening`, landing in `win-s-2`, `win-s-3` and `win-s-4`. The same plan also
   names `s-y4`, which ends inside door `d-office-2`.
3. **F28** as above. A window with rooms on both sides names both rooms.

## Scoreboard

These figures are stored in `scoreboard/current.json`, with the reason in `scoreboard/README.md`.

| Count | Before | After |
| --- | --- | --- |
| Damage that passes in silence | 386 | **278** |
| Design mistakes named | 2 | **5** (mistakes 2, 4 and 9) |
| Sound plans with a warning | 95 | 95 |

No other count moved.

## Tests

- New: `packages/floorplan/src/geometry/__tests__/openingPlaces.test.ts` (10 tests),
  `scoreboard/__tests__/openingPlaces.test.ts` (4) and test `4b` in
  `packages/cli/src/edit/__tests__/requests.test.ts` (the split refused, with the nearest size).
- Changed: in `validation.test.ts`, MS-8 went from `it.fails` to `it`, in a new "lab failures
  fixed by MSG-16" block. The "known failures" block it leaves is empty, so it was removed.
  `pinned-tests.md` moves MS-8 to the fixed table.
- Removed: none.

## For the owner

1. **Every case is a warning; none drops the opening.** The card says "warns about or refuses".
   I took warnings throughout because they can be undone: the opening is still drawn, cut through
   its own wall, and the exports (which call `validatePlan` with `{ spaces: false }`) still agree
   with the view. If a door across a junction should be refused (left out of the drawing), it is
   one severity in `openingPlaces.ts`. It would then also have to run outside the spaces block,
   so that the exports leave out the same openings.
2. **Who a T-junction line is about.** When a wall ends inside another wall's opening, the line is
   about the wall that ends (`wall/ends-in-opening`, as CP4-11 asks: "each partition named"), with
   the opening in `also`. When an opening runs into a wall at its own wall's end, the line is about
   the opening. Both lines name both, so the scoreboard counts both as named.
3. **Doorless openings on a dividing line say nothing.** That is how an open-plan opening is drawn.
   Doors and windows there are named, as decided.
4. **A borrowed light needs both faces of the stretch under the window to have rooms.** A window
   in a wall with a room on one face only is not named, whatever kind the wall is stated as.
5. **How near a split's nearest clear size looks.** `grid_split_room` gives the nearest size clear
   of the opening at the end it hits first, the west or south end. That size may still land in an
   opening at the other end; the next call then says so.
