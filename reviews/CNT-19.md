# CNT-19: parking bays and ramps

Branch `claude/cnt-19-ca1e2c`. Convention C29 (given by the coordinator). Changelog fragment
`changes/CNT-19.md`. Docs: `docs/plan-file.md` "Parking bays and ramps" (new section, its row in the
code index and the text limits), two rows of `docs/tolerances.md`, and one bullet in `AGENTS.md`.

## What changed

**Plan format (C29, `types/floorplan.ts`).** Two new top-level lists, optional and never defaulted,
version 1:

- `bays`: `{ id, number?, at, width, length, turn?, floor? }`. `width` is across, `length` along
  (the way a car drives in); unturned the length runs along the plan's y. `number` is text, as
  marked (`"12"`, `"B1-07"`); a blank one is refused.
- `ramps`: `{ id, name?, from, to, width, run, slope? }`, stated once across the two floors it joins
  as a stair is (`start` and `end` read as a two-point `run`, at most 64 points). `slope` is in
  percent.

**Geometry (`geometry/parking.ts`).** `bayFootprint`, `soundBays`, `baysOnFloor`, `planBayCounts`
(per floor: count, numbers in number order, unnumbered). `planRamps` lays each ramp out from the
whole plan: its lower and upper end with their floors' levels in metres (`floorElevations`), its
length along its middle line, its rise, its slope in percent and as "1 in n", the stated slope kept
apart, and its pieces on plan (a band per stretch, a square at each turn). `parkingIssues` holds the
checks. A floor's slice keeps its own floor's bays and every ramp, as it does stairs. A ramp opens
its upper floor's slab (`envelope.ts`, new `SlabOpeningKind` `ramp`), so the slab area, the 3D view
and the IFC's slab leave the hole; the IFC names the opening "Ramp".

**Drawing (both looks, `planScene`).** `PlanDrawing.bays` and `.ramps` (left out when the plan
states none). A bay is its outline at the stair's pen with its number in the middle; a ramp, on
both floors it joins, its outline, its middle line ending in an arrow head (the stair's
`arrowHead`, now exported) and its slope halfway along, in the drawing's language and decimal mark.
Key entries "Parking bay" and "Ramp, its arrow pointing up".

**CLI.** `grid_takeoff` adds `bays` and `ramps` (data, text and CSV) with the rule
`takeoff.rule.parking`, only on a plan that states either; its description gained one sentence
saying so. `grid describe` says each floor's bays (numbers in runs: "1 to 16") and ramps, for a
person and for an agent (`BAYS`, `RAMP`). The sheet's coverage places both as drawn; `planText.ts`
limits their ids, numbers and names; `nearOrigin` moves them; `inIdOrder` sorts them. The take-off's
slab line says "a ramp" for a ramp's opening.

**Codes.** Errors (left out): `plan/bay-too-large`, `plan/bay-duplicate-id`,
`plan/bay-unknown-floor`, `plan/ramp-too-large`, `plan/ramp-duplicate-id`,
`plan/ramp-unknown-floor`, `plan/ramp-same-floor`, `plan/ramp-no-rise`, `plan/ramp-no-run`.
Warnings: `plan/bay-number-repeated`, `plan/bays-overlap`, `plan/ramp-slope-differs`. Catalogue
entries, en/es `issue.*` and `line.*` keys, rows in the fragment. New tolerances `bayOverlap`
(0.01 m²) and `rampSlopeDiffers` (0.5 percentage points), with a new unit `%`.

One trap found on the way: `floorElevations` runs the drawing's checks without spaces, and laying a
ramp out reads `floorElevations`, so the ramp checks run only with the space checks (as the stairs'
do); the bays' run always.

## Done when

"The basement's 16 bays are counted by number, and the ramp's slope is stored and returned as a
number": `packages/floorplan/src/test-support/parking.ts` rebuilds the lab's EL-11 basement (the
block's B1, 26 × 18 m, 3 m below the ground floor) with one car park room, 16 bays numbered 1 to 16,
seven columns and the ramp stated with `slope: 16.7`.

- `packages/floorplan/src/geometry/__tests__/parking.test.ts`: "counts the 16 bays on the basement,
  numbered 1 to 16" and "works the slope out from the levels it joins and its run, and keeps the one
  it states" (16.67 %, 1 in 6, stated 16.7, levels −3 and 0 m).
- `packages/cli/src/quantities/__tests__/parking.test.ts`: "counts the basement's 16 bays by number
  and returns the ramp's slope as a number (EL-11)", through `grid_takeoff`'s figures, and the
  description's lines.
- `packages/viewer/src/picture/__tests__/parking.test.ts`: the 16 bays with their numbers and the
  ramp with its arrow and "16.7 %" in both looks; "16,7 %" in Spanish.
- The lab's own drawing of that ramp (a 9 m room, 3 m up) gives 33.3 %, not the 1 in 6 its name
  said: the test "says when the stated slope is not what the levels and the run give" holds that.

## Tests whose expected values changed

- `packages/cli/src/mcp/__tests__/access.test.ts`: the "not looked at" line about ramps. It said
  the plan cannot state one; it now says a ramp between floors is for vehicles and is not measured
  there, and one within a floor cannot be stated.

- `packages/rules/src/result/__tests__/result.test.ts`: the list of the plan's fields in a
  `plan/unknown-field` line gains `bays, ramps` (after CNT-16's `columns, grids`).
- `packages/cli/src/__tests__/ownWords.test.ts`: `mcp/readTools.ts` 316 → 317 (`tools`: the
  sentence in `grid_takeoff`'s description) and `geometry/tolerances.ts` 255 → 259 (`developer`:
  what the two new entries decide), each with a comment naming CNT-19. The schema's two new
  refusals are in the message files (`read.bay.blankNumber`, `read.ramp.tooManyPoints`).
- `packages/cli/src/command/__tests__/grid.e2e.test.ts`: the built file's size cap 700 kB → 750 kB.
  Merged with main at 739066d0 the file is 700,870 bytes, with no new dependency; the comment says
  so, as each earlier raise did.

## Scoreboard

CHECKS_PLACEHOLDER

## For the owner

- Bays and ramps are lists of their own (`bays`, `ramps`), not rooms, fixtures or a kind of stair.
- A ramp's slope is in percent, the way car park ramps are usually written; Grid also gives it as
  "1 in n". A stated `slope` is kept beside the worked one and never replaces it; the warning
  threshold is 0.5 percentage points.
- A ramp joins two floors and takes their levels; it does not take the rooms' floor offsets
  (LVL-7) as a stair does. A slope within one floor (an entrance ramp, lab H-7) is not covered and
  is refused as `plan/ramp-same-floor`; CNT-17's access answer still measures no ramp.
- A ramp does not join floors for the way-out check (`floorJoins`): it is for vehicles. Easy to add
  if the owner wants a ramp to count as a route.
- A bay takes nothing off a room's area. Areas do not take the slab opening over a ramp off the
  room above it (the stair opening's rule for areas was not extended).
- Not exported yet: no bay or ramp in the DXF, the IFC (beyond the slab's opening), the OBJ or the
  GLB, and no ramp solid in the 3D view. The diff does not compare them. No edit tool writes them;
  agents write them in the plan file.
- A ramp's id may not be another part's (walls, rooms, openings, fixtures, columns, stairs, bays),
  and the same for a bay. Two bays with one number on different floors are fine.
- No check says a bay is large enough or a ramp not too steep: that would apply a code's figure
  (`packages/rules`), and nothing here reads one. The swept-path check is not made.
- C29 is used.
