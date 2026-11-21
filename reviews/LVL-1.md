# LVL-1: stated floor levels and heights in metres

Card: "Stated floor levels and heights in metres: no misspelt floors, no door to outside in
mid-air". Lab evidence VE-2, VE-3, VE-8, MS-10, R-12, AB-6, S-2, AU3-2, AU3-6.

## Owner check needed: the version rule (CNT-1)

CNT-1, the rule for how the plan format changes, is not built: the file's version is still the
fixed text `"1"` and there is no reader for another version. As the brief asks, the new fields
are **optional and never defaulted**, and the file stays version 1. A plan that states none of
them reads exactly as before, with no key added (tested in `levels.test.ts`, "adds no key to a
plan that states none"). When CNT-1 lands, the owner should decide whether these fields make a
version 2, and add them to its new-field checklist.

## The schema change

On a floor in `floors` (`packages/floorplan/src/types/floorplan.ts`, convention C5 reopened):

| Field | Type | Meaning |
|---|---|---|
| `level` | finite number, default 0 | Unchanged meaning (the order), but **no longer has to be whole**: 0.5 is a half level |
| `elevation` | finite number, optional | Metres from the ground floor's floor level (0) to the top of this floor's slab |
| `height` | positive number, optional | The floor's clear height. A solid wall on it that states no height takes it |
| `slab` | number ≥ 0, optional | The thickness of the slab this floor stands on |

`FloorPlanSchema` is now `z.preprocess(withFloorHeights, FloorPlanFieldsSchema)`: before the
wall's own 2.7 m default, a solid wall with no `height` takes its floor's stated `height` (lab
AU3-6: after reading, a stated 2.7 could not be told from none). The object is exported as
`FloorPlanFieldsSchema`, because a preprocess has no `.shape`; the sheet's coverage test reads it.

## Decisions

- **`height` is the clear height, not floor to floor.** The card says "a level or floor-to-floor
  height". A clear height is what a wall takes when it states none, and what "raise the ceiling
  20 cm" changes in one edit (VE-3). Floor to floor is then `height` plus the next floor's
  `slab`, or stated directly by giving each floor its `elevation`.
- **The stacking rule** (`stackFloors` in `elevations.ts`, used by `floorElevations` and by the
  IFC export, which had its own copy keyed by level and now keys by floor id). A floor's clear
  height is its stated `height`, else the tallest wall on its level, else 2.7 m. A floor with an
  `elevation` stands there; one without stands on the highest storey top below it plus its own
  slab, and basements hang under the slab above them. With nothing stated this is exactly the
  old rule: `stackLevels` is now built on `stackFloors`, and a test compares the two on six sets
  of levels. The three pinned stacking tests are unchanged.
- **The roof** lies on the highest storey top of the building, not on the top level's storey. For
  any plan that states nothing these are the same (each level stands above the one below). With a
  loft stated low inside a taller storey, the roof stays on the taller walls (AU3 on VE-2).
- **The tiny house's 4.00 m.** Lab A-8's tiny house has 3.6 m main walls and a loft with 1.2 m knee
  walls. Stated as nothing, the loft stands at 3.85 m and the house is 5.30 m, as before. With the
  loft's `elevation` 2.55 m its walls end at 3.75 m and the 0.25 m roof at 4.00 m. A loft stated
  lower than that (2.0 m) leaves the roof on the 3.6 m main walls, at 3.85 m.
- **A floor id the plan does not know is an error, and the part is left out.** Grid's `error`
  means "left out": `grid check`, `grid_check` and the sheet print it that way. An error that was
  still drawn would say something untrue, so the wall or room is added to `broken`. With a floor
  list, an id named outright that the list does not hold is the error, with the nearest listed id
  by letter edits. A part that names no floor sits on the ground floor, which C5 makes implicit,
  so a list without `ground` keeps its old warning. With no list, an id is unknown only when it is
  spelt within one letter edit (two for ids of eight letters or more) of a floor id more parts
  use; ids of three letters or fewer (`b1`, `g1`), and ids that differ only in their digits
  (`f1`, `f2`, `level-1`, `level-2`), are never slips. *Owner:* if leaving the parts out is too
  strong, the alternative is an error that is still drawn, and the "left out" wording would need
  to read `broken` rather than the severity.
- **"Above the ground"** for a door to the outside is a floor whose floor level, as stacked,
  stands more than 2 m above 0 (`outsideDoorAboveGround`, a new limit, Grid's own). Below it a
  raised ground floor or a half level can reach the ground by a few steps outside. The finding is
  `door_to_outside_above_ground` under the existing rule `door-leads-somewhere` (no new rule, so
  the report's rule list is unchanged). Only doors and doorless openings count, not the open side
  of a virtual wall, which edges a terrace or a stand. A floor above the ground is never the
  ground floor for the routes, even when it is the only floor (VE-8). A lone floor at level 3 that
  states no elevation still stands at 0 and still counts as the ground: the gap warning tells the
  agent to state its elevation (R-12).
- **The checks that set floors against each other skip a floor's slice.** `planForFloor` keeps
  the whole floor list with one floor's parts, so in a slice every other floor looks empty and the
  empty-top check would fire. Slices are now remembered in a `WeakSet` (`isFloorSlice`), and the
  gap, same-level and empty-top checks run on the whole plan only. Nothing about a slice's data
  changed.
- **Two floors at one level** are asked about only when their walls' boxes share more than half
  the smaller box (`sameLevelOverlap`), so a pair of houses side by side on level 0 says nothing.
- **Not built: the local floor-naming convention (R-12).** The card's "how" suggests storing it so
  names and numbers agree. Nothing in Grid reads floor names as numbers yet, so a field would have
  no reader. Left for a later step; R-12's measurable half (a flat stands at its level in the IFC)
  is done with `elevation`.
- **Not built: a wall that rises through two floors (VE-9),** part floors and double-height rooms.
  A loft states its own elevation inside a taller storey; its walls still stand on its own floor.

## New messages (all warnings unless said)

| Code | When |
|---|---|
| `wall/unknown-floor`, `room/unknown-floor` | Now an **error** with the nearest id when a part names a floor the plan does not know (see above) |
| `plan/level-gap` | Whole levels missing between the ground and a floor that states no elevation |
| `plan/same-level` | Floors at one level, with the same or no elevation, one over the other |
| `floor/empty-top` | The top floor has nothing drawn but still counts as a storey |
| `wall/above-storey` | A wall higher than the height its floor states (S-2); the storey keeps its height |
| `floor/size-question` | A stated floor height outside `wallLowest`–`wallHighest` |
| `door_to_outside_above_ground` (plan check finding) | A door or doorless opening to the outside on a floor more than 2 m up |

`wall/size-question` no longer says "Grid stands a storey on its tallest wall" on a floor that
states its height: it says the floor's stated height holds. The partition typed 27 for 2.7 was
already questioned by MSG-15; `levels.test.ts` pins it.

New table entries in `geometry/tolerances.ts` and the README: `wallAboveStorey` (0.001 m),
`sameLevelOverlap` (0.5 ratio), `outsideDoorAboveGround` (2 m).

The comparison (`diff/props.ts`, `diff/summary.ts`) and the revision key now include a floor's
`elevation`, `height` and `slab`.

## Tests changed on purpose

No expected figure (area, height, elevation) changed. These expectations changed with the
behaviour the card asks for:

- `rejects a non-integer level` (floorplan.test.ts, pinned) is now `accepts a half level`.
- "a floor nobody declared" (validation.test.ts): the wall naming `attic`, which the list does not
  hold, is an error and left out, where it was a warning and drawn.
- `MS-10 a misspelt floor is reported when the plan lists no floors` was `it.fails`; it passes and
  moved to "lab failures fixed by LVL-1".
- The two-floor test house (rules fixtures) has a balcony door upstairs with nothing drawn outside
  it. It now gets `door_to_outside_above_ground`: in `rules-check.test.ts` and
  `rules-report.test.ts` (both packages) and `routes.test.ts` the expected finding lists gain that
  line. The route findings and notices are unchanged.
- The Madrid and Berlin flats (room-rows-flats.test.ts) are lone floors on levels 4 and 3 with no
  elevation: each now gets `plan/level-gap` first. Their areas are unchanged.
- `coverage.test.ts` (cli) reads `FloorPlanFieldsSchema.shape`.
- `says a floor with no findings found nothing …` (cli `pages.test.ts`) uses the same two-floor
  house; it now takes the house without its balcony door, so it still has no finding.

## done_when

1. The tiny house's loft sits at its stated level and the house is 4.00 m tall, not 5.30 m;
   a third-floor flat stands at its level in the IFC: `levels.test.ts` ("VE-2 …", "R-12 …") and
   `ifc.test.ts` ("R-12 stands a third-floor flat at its stated elevation").
2. A floor name the plan does not know is an error with the nearest known id, with or without a
   floor list: `levels.test.ts` ("LVL-1 floor ids the plan does not know") and the MS-10 test.
3. A door to outside at 9.85 m gets a warning and is not a way out; a partition typed 27 for 2.7
   is questioned: `levels.test.ts` ("LVL-1 a door to the outside above the ground", "VE-2
   questions a partition typed 27 for 2.7").
4. Every lab plan without levels reads and measures as before, and the roof follows the stated
   levels: the stacking equivalence test, the unchanged pinned tests, and the scoreboard below.

## Scoreboard

Run on the base commit (`c5d9902`) and on this branch:

| Count | Stored | Base | LVL-1 |
|---|---|---|---|
| Rooms measured wrong | 197 | 197 | 197 |
| Damage that passes in silence | 387 | 387 | 387 |
| Turns answered | 15 | 15 | 15 |
| Design mistakes named | 2 | 2 | 2 |
| Checks the plan can feed | 5 | 5 | 5 |
| Guard: rooms Grid does not measure | 724 | 724 | **727** |
| Guard: sound plans with a warning | 70 | 70 | 70 |

The guard rose by 3 for the reason the card asks for: in the lab's planted MS-10 plans
(`v-floor-1-trigger-similar`, a wall list on `First` against a listed `first`, and
`v-floor-3-silent-punctuation-no-list`, `first floor` against `first-floor`, each in three
copies), the room on the misspelt floor is now an error that names the right id, and is left
out. Two plans that use half levels (`tiny-house-half-level`, `s10a-split-half-level`) now read,
so 3 more rooms are compared. The new figures are stored in `scoreboard/current.json`.

Lab plans Grid cannot read: 25 on the base commit (the stored detail said 20; it was stale and
held no count), 23 now. In the damage set, 9 more damaged plans have the damaged part named
(1907 → 1916), 4 fewer are refused by the schema (a half level now reads) and 4 fewer are named
vaguely; the silent count is unchanged.

The first run found 5 damaged plans that threw: a floor level set to 1e9 made the gap check list
every missing level. The check now walks only the levels the plan has, and names a long run as a
range (`levels.test.ts`, "names a long run of missing levels as a range").
