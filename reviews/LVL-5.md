# LVL-5 review: walls and windows through several floors, and floors in one drawing

For the owner. Card: "Walls and openings can state a base and a top that pass through several
floors. A wall can be shared by floors, so one edit moves it on all of them. Grid warns where
stacked outlines, stairs or shafts stop lining up, saying where and by how much, unless the
overhang is marked as meant." Lab findings VE-9 (H-10: "a stair window from 0.9 to 5.4 m … is not
drawn"), WR-9 (D-7: "the stair and lift were moved 1.2 m east on floor 3 only: 0 issues"; E-9: the
ground floor widened 30 cm, the floor above left behind; H-5: a lift shaft moved 0.6 m on one floor)
and A-16 (a refused window called a door). Builds on WRT-4's `through <floor>` in rooms text, LVL-1
(floor levels), LVL-3 (stair rooms and lift shafts that line up), LVL-4 (slabs open over a stair
room) and LVL-9 (sections).

## What changed

1. **The plan format** (`packages/floorplan/src/types/floorplan.ts`, convention C15):
   - a wall's `through`: the highest floor it rises through, the word rooms text already uses
     (WRT-4). It stands on its own floor and on every floor above it up to that one, by `level`.
     Its `height` is how high it stands above the `through` floor's level, as a wall of that floor
     (left out, it takes that floor's `height`, through `withFloorHeights`); `heightByDefault`
     reads the `through` floor.
   - a floor's and a room's `overhang: "meant"` (`OVERHANG_MEANT`, one word): the floor's outline,
     or the stair room or lift shaft, does not line up with the floor below on purpose.
   - No opening field: an opening in a wall through floors states its sill and height from the
     wall's own floor, as C2 always had it, and may reach as high as the wall rises.
   - All optional and never defaulted; version stays 1; no new top-level part, so
     `packages/cli/src/sheet/coverage.ts` is unchanged. `through` is held to an id's limit in
     `packages/cli/src/command/planText.ts`; MSG-4's reading reads the schema, so `through` is in
     the list of a wall's fields with no change to `reading.ts`.
2. **Walls through floors in the core** (`packages/floorplan/src/geometry/through.ts`, new, pure):
   `wallFloorIds`, `wallStandsOn`, `storeyFloorOf`, `wallStretches` (each floor's stretch, from its
   level to the next floor's in the span, the top one to the wall's top), `wallRise`,
   `throughFloorParts` (what a floor's slice holds: the wall's stretch on that floor and the part of
   each of its openings that lies there), `storeyWalls`, `sharedPart`, `isCarriedOpening`,
   `wholeWall` (on the wall's own floor, the whole wall with its openings as stated; on the floors
   above, nothing) and `throughIssues`.
   - `floors.ts`: `planForFloor` slices through `throughFloorParts` when any wall rises through
     floors, and exactly as before otherwise (tested: the slice holds the plan's own objects).
     New `storeySlice` (each such wall on the floor it rises through, without its openings) and
     `wallsOnFloor`. `floorHasGeometry` counts a wall through floors on each floor.
   - `elevations.ts`: `floorElevations` stacks from `storeySlice`, so the storeys stand where they
     would with a wall of each floor (tested on hx3: both floors' levels and heights unchanged).
   - Per-floor readers that filtered walls by `floorOf` now take `wallsOnFloor` or `wallStandsOn`:
     `spaces.ts`, `areas.ts` (`floorWalls`), `shell.ts`, `exposure.ts`, `roofs.ts` (`roofWalls`),
     `patterns.ts`, `levels.ts` (`sameLevel`), `wallFaults.ts`.
3. **Validation** (`validate.ts`, `levels.ts`, `plausible.ts`):
   - `room/cross-floor` is not given for a wall that stands on the room's floor through `through`.
   - `opening/too-tall` compares with `wallRise` for a wall through floors; the roof over its top
     floor is checked on that floor's slice. Two openings one over the other in such a wall are not
     `opening/overlap` (they overlap only where they share a stretch at the same height).
   - New `wall/through-floor` (warning): `through` names a floor the plan does not have or one not
     above the wall's own; the wall then stands on its own floor only.
   - `wall/above-storey` and the wall size questions read such a wall against the floor it rises
     through, and skip its parts in a floor's slice, which run through the slab by design (lab
     AU3-2 asked for exactly this).
   - New `floor/out-of-line` (warning, `stacking.ts`, new): each floor with a room on it, set
     against the floors one level below, by their outlines as the walls draw them (`floorSpaces`):
     where it reaches past them or sits back from them by more than `stackShift` and half the
     thickest wall along that stretch, with the side, how far and the box of each stretch, up to
     three. Not for a floor marked `overhang: "meant"`.
4. **Stairs and shafts** (`floorJoins.ts`, `rules/check.ts`, `rules/messages.ts`, `rules/types.ts`,
   `notes/notes.ts`): stair rooms or lift shafts on neighbouring levels that join (share at least
   half, LVL-3) but whose box is moved, both sides past the other's the same way by more than
   `stackShift`, are a new finding under the check `stairs-line-up`: `stair_shifted` /
   `lift_shifted` (`room/stair-shifted`, `room/lift-shifted` in the record), with `shift` (`east`,
   `north`, `sides`, the two boxes). A lift shaft is the same on every floor, so one whose sides
   stand off the one below's is said even when not moved as a whole (h06b). A room marked
   `overhang: "meant"` is not said. Pairs that do not join stay LVL-3's `stair_out_of_line`.
5. **Drawn once, whole**: `scene3d.ts` (3D view, OBJ and glTF), `export/ifc.ts` (one
   `IfcWallStandardCase` and one `IfcWindow` on the ground floor's storey; its storey heights skip
   a wall's lower stretches) and `section.ts` (LVL-9: the wall cut once from its foot to its top,
   and a slab stops at the opening of a wall that rises past it) draw a wall through floors from its
   own floor's slice with its openings as stated, and nothing on the floors above. The plan picture
   needs no change: it draws each floor's slice, where the window is a window on both floors.
6. **A refused window is called a window** (lab A-16): `floor/not-checked-doors-not-drawn` named
   every refused opening "these doors or windows". `openingWords` (`rules/messages.ts`) words them
   by type: "this window could not be drawn, so it and what rests on it were not checked: …",
   "these doors and windows …"; the notice carries `openingKinds`, and the catalogue's `found`,
   `needed` and `fix` use it ("a window that cannot be drawn", "Correct the lines that leave that
   window out. It is checked once it can be drawn …").
7. **The command**: `grid describe` gives an opening in a wall through floors its sill above the
   floor its foot is on (`describe/facts.ts`), not above the wall's own floor.
8. **Tolerances**: one new entry, `stackShift` (0.05 m), mirrored in `docs/tolerances.md`.
9. **Codes and docs**: four new codes (`wall/through-floor`, `floor/out-of-line`,
   `room/stair-shifted`, `room/lift-shifted`) in `packages/rules/src/result/catalogue.ts` and the
   contract's code table; `room/cross-floor`'s `needed` and `fix` and
   `floor/not-checked-doors-not-drawn`'s wording changed. `docs/plan-file.md` has a section "Walls
   through floors, and floors that line up" and a new "How the format changes" (the change rule,
   which the file did not have); `docs/result-contract.md` a changelog entry; `CHANGELOG.md` a line
   under "Unreleased". No tool changed, so `docs/tool-server.md` is unchanged. No README section.

## Against `done_when`

1. *The stair window from 0.9 to 5.4 m is accepted as one window through two floors, and drawn
   (VE-9).* The plan is the lab's own `H/scenarios/hx3-window-through-two-storeys.json`, read by
   name from `scoreboard/data/lab-plans.ndjson.gz` (`labPlan`), and the same house with its north
   wall written once through both floors (`stairWindowThrough` in
   `packages/floorplan/src/test-support/through.ts`: `g-n` gets `through: "first"`, `f-n` goes,
   the first floor's rooms list `g-n`, and `f-w-n` moves into `g-n` with its sill from the ground
   floor). In `packages/floorplan/src/geometry/__tests__/through.test.ts`:
   - "is refused as the lab found it": as written, exactly one line, `opening/too-tall
     g-w-stair-tall`;
   - "is accepted as one window through two floors": no error, the window not left out, one
     opening with that id, no `room/cross-floor`, the wall on `ground` and `first`, rising 5.65 m;
     "leaves the drawing with nothing to say": no line at all;
   - "stands the storeys where they stood": both floors' level and height equal to the plan as
     written; "counts the rooms of both floors as before": `planAreaFigures` equal floor by floor;
   - "gives each floor its stretch": 2.95 m and 2.70 m parts, the window 0.90 to 2.95 m on the
     ground floor and 0 to 2.45 m on the first, each slice valid;
   - **plan picture**: "is drawn on both floors' plans" (`buildFloorPlan` of each slice holds the
     wall and the window), and in the viewer `packages/viewer/src/picture/__tests__/through.test.ts`
     "is drawn as a window in the wall on each floor's plan" (the SVG's `window-symbol` for
     `g-w-stair-tall` on `ground` and on `first`);
   - **3D, OBJ, glTF**: "is one wall and one window in 3D": the ground floor's scene raises `g-n`
     5.65 m with one hole from 0.90 to 5.40 m; the first floor's scene does not draw it again;
   - **IFC**: "is one wall and one window in the IFC": one `IfcWallStandardCase` `g-n`, one
     `IfcWindow` `g-w-stair-tall`, none as written;
   - **section (LVL-9)**: "is cut once, whole, by a section through the window": one cut part for
     `g-n`, from 0 to 5.65 m, in two pieces (0 to 0.90 and 5.40 to 5.65), nothing cut at 2.80 m
     where the first floor's slab was; and in the viewer "is open from its sill to its head in a
     section through it": two cut shapes, painted as such.
   - In the record, `packages/rules/src/result/__tests__/lineUp.test.ts` "has no line about it once
     its wall rises through both floors" (`inspectPlan`), and the wording item below.
2. *Moving the stair 1.2 m on one floor gives a warning saying where and by how much, unless the
   overhang is marked as meant (WR-9).* The plan is the lab's `D/scenarios/d2-stair-shifted-floor3.json`
   (the stair moved 1.2 m east on floor 3 only, lab D-7). In
   `packages/floorplan/src/geometry/__tests__/lineUp.test.ts`:
   - "is said, with where it stands and by how much": `stair_shifted` on `L3`, rooms `L3-stair`
     and `L2-stair`, `shift.east` 1.2, north 0, the message "The stair "Stair" on "Floor 3" is
     1.20 m east of "Stair" on "Floor 2" below it: it stands from (11.35, 0.18) to (14.10, 7.48),
     the one below from (10.15, 0.18) to (12.90, 7.48)" (as `grid check` prints it, checked on the
     built command);
   - "is not said where the plan marks the moved stair as meant": `L3-stair` and `L4-stair` marked
     `overhang: "meant"`, no finding;
   - "is not said of stairs that line up": only floors 3 and 4 (floor 4's stair is back in place,
     1.20 m west of floor 3's);
   - "says the same of a lift shaft moved on one floor (lab H-5, h06b)": the lab's shafts given the
     `lift` use, the second floor's west side 0.60 m east of the first's;
   - in the record, `lineUp.test.ts` (rules) "is a line on the moved stair room": a `finding` line
     `room/stair-shifted` on `L3-stair`, its `found` "moved 1.20 m east of the one below …", its fix
     naming `overhang "meant"`; and "is no line once the moved stair and the one over it are marked".
   - The stacked outlines of WR-9 and E-9 ("a floor that no longer lies over the floor below"): the
     ground floor widened 30 cm gives `floor/out-of-line` "… it sits back from it by 0.30 m on the
     east, from (8.15, -0.15) to (8.45, 6.15) …"; the floor above reaching 0.50 m past gives "it
     reaches past it by 0.50 m on the east"; marked `overhang: "meant"`, lined up, 3 cm apart, or
     0.50 m walls under 0.30 m ones on one axis: no line.

The card's other asks:

| Ask | Where |
|---|---|
| A wall shared by floors, so one edit moves it on all of them | One wall in the file (`through`), listed by both floors' rooms; every edit works on the file's wall, so it moves on every floor. `through.test.ts` covers the reading; no edit tool changed, and no edit was run on such a plan in a test |
| The cross-floor rule in validation changes with it | `room/cross-floor` not given for a wall through the room's floor (`through.test.ts`), and still given when `through` names no floor above (`wall/through-floor` test there) |
| The per-floor drawings and files change with it | slices (`planForFloor`) and `wholeWall` for 3D, OBJ, glTF, IFC and sections, above |
| A way to say "meant" | `overhang: "meant"` on a floor and on a room, tested for both checks |
| The fixed sentence that calls a refused window a door | `floor/not-checked-doors-not-drawn`: rules `lineUp.test.ts` "is refused as written, and the line calls it a window, not a door" (message, `found`, `needed`, no word "door" in any of them); `causes.test.ts` and `held.test.ts`, below |
| A new field covered by MSG-4's reading, the text limits, the sheet and the change rule | reading: `reading.test.ts` and `result.test.ts` (below); `planText.ts` holds `through` to an id's limit; no new top-level part, so `coverage.ts` needs nothing; `docs/plan-file.md` "How the format changes" |

## Changed expectations and snapshots

No snapshot changed. Four existing expectations changed, each for a reason of this card:

- `packages/floorplan/src/types/__tests__/reading.test.ts` "thick on a wall is named …": the list
  of a wall's fields now holds `through` after `floor` (MSG-4 reads the schema).
- `packages/rules/src/result/__tests__/result.test.ts` "names thick on a wall …": the same list in
  the line's `needed`.
- `packages/floorplan/src/geometry/__tests__/held.test.ts` "is named as not drawn …": the notice
  for the misspelt front door read "these doors or windows could not be drawn, so they …"; it now
  reads "this door could not be drawn, so it and what rests on it were not checked: "front"", and
  the notice carries `openingKinds: ['door']`.
- `packages/rules/src/result/__tests__/causes.test.ts` "is held back on the floor's line, which
  names the window": the window `win_bed` is "this window …"; `found` "a window that cannot be
  drawn; …" (was "doors or windows …"); `needed` and `fix` added to the test.

One fixture changed: `packages/cli/fixtures/tiny-loft.json`, the sleeping loft over half of the
main floor, now states `"overhang": "meant"` on its loft floor. Unmarked, it gets
`floor/out-of-line` ("it sits back from it by 3.26 m on the west, from (0.00, 0.00) to (3.26,
2.59)"), which is right for a half-floor loft and is how the full run found it: six tests in
`shortReport.test.ts` count and number that fixture's notes (seen notes, `--seen 9`,
`grid_mark_seen`), and the extra line shifted them. Marking the loft as meant is what a person
would write for it, and leaves those tests as they were; the other way was to renumber them.

New tests: `floorplan/src/geometry/__tests__/through.test.ts` (12), `lineUp.test.ts` (7),
`rules/src/result/__tests__/lineUp.test.ts` (4), `viewer/src/picture/__tests__/through.test.ts`
(2), `cli/src/describe/__tests__/through.test.ts` (1).

Two test files outside the card's own were changed by what the full run found:
`scoreboard/__tests__/frontDoor.test.ts` ("one wording per code") reads the kind words of
`floor/not-checked-doors-not-drawn` ("this window", "these doors and windows") as one slot, as it
already reads names and figures; and the `tiny-loft.json` fixture above.

## The checks run

On a laptop shared with about ten other sessions, load average 250 to 285 throughout.

| Check | Result |
|---|---|
| `npm run build` | exit 0; `packages/cli/dist/grid.mjs` 529,909 bytes, under the 600 kB cap, which did not move |
| `npm run typecheck` | first run: exit 2, one error in the new `cli/src/describe/__tests__/through.test.ts` (a describe length `full` that does not exist). Fixed in its own commit; rerun: exit 0, every workspace |
| `npm run lint` | exit 0, no problems |
| `npm run check:licenses` | "Checked 363 licences in package-lock.json: none is GPL, LGPL, AGPL, MPL, EPL." |
| `timeout 1500 npx vitest run --exclude '.claude/**' --maxWorkers=2 --minWorkers=1` | **stopped by the timeout** (exit 124) after 25 minutes, with 153 of 320 test files done and no summary printed. Failed among them: `shortReport.test.ts` (6: the loft fixture's new line, fixed as above) and `grid.e2e.test.ts` "speed > answers grid check on the sample flat in under 500 ms" (5,321 ms under the load) |
| The 167 files it did not reach, with `grid.e2e.test.ts`, in one run | Test Files 2 failed, 166 passed (168); Tests 2 failed, 1814 passed, 2 skipped (1818); 1,277 s. Failed: the same speed test (592 ms), and `scoreboard/__tests__/frontDoor.test.ts` "one wording per code" (the window wording, fixed as above) |
| Reruns alone, after the fixes | `shortReport.test.ts`, `schedules.test.ts`, `place.test.ts`, `lineUp.test.ts`: 4 files, 71 passed. `frontDoor.test.ts`: 1 passed. The speed test alone: 1 passed (95 skipped). Timing only |
| `npm run scoreboard` | "Same as the stored figures." (394 s), after the figures were stored in `2bfa1017` |

The scoreboard moved once during the work, and the figures are stored with the reason in
`scoreboard/README.md`: damage that passes in silence 278 to 277 (caught vaguely 139 to 140), every
other count the same. The first run of the outline check raised the guard on sound plans with a
warning from 95 to 218: the generated buildings give each floor's outside walls their own thickness
on the same axes, which a strict 0.05 m check read as out of line. The check now allows half the
thickest wall along each stretch, and the guard is back at 95 (tested: 0.50 m walls under 0.30 m
ones line up).

So every test file has run on this branch, but not in one run: the full run could not finish
inside its timeout on this machine.

## For the owner

Each is the reversible choice, taken and recorded rather than stopped on.

1. **A wall's span is a floor range, not a base and a top in metres.** `through` names the highest
   floor; the base is the wall's own floor and the top its `height` above the `through` floor's
   level. Metres (`base`, `top` above the ground floor's level) were the other reading of the
   card. They would fight the stacking rule: a floor that states no elevation stands on its tallest
   wall, so a wall stated as 5.65 m tall would lift its own floor's storey. A floor range keeps the
   storeys where they were (tested) and reuses WRT-4's word. Partial spans (a wall that stops at a
   mezzanine's mid-height) are the follow-up, and would be a `top` beside `through`.
2. **An opening gains no field.** Its sill and height are measured from its wall's own floor, as
   C2 always said, so the stair window is `sill 0.9, height 4.5`, and a window wholly on the first
   floor of the same wall states its sill from the ground floor (3.85 m). An opening's own
   `through`, or a sill measured from the floor it is on, would read more naturally for that second
   window; `grid describe` already gives it as 0.90 m above the first floor.
3. **Openings one over the other** are allowed only in a wall through floors; in a wall of one
   floor they are still `opening/overlap`, as before. Allowing them everywhere (a fanlight over a
   door) is one condition in `validateOverlaps`, but it changes what the damage set sees.
4. **Each floor's slice holds the part of the wall on it**, its stretch from the floor's level to
   the next floor's (the ground floor's part of hx3's north wall is 2.95 m, through the slab), with
   the part of each opening that lies there. Everything that reads one floor (plan pictures, areas,
   rooms, door checks, the DXF) reads a wall of that floor. The 3D view, the OBJ and glTF, the IFC
   and a section ask `wholeWall` and draw it once from its own floor. A 3D view of the first floor
   alone, with the ground floor cut away, therefore shows no north wall on the first floor: it is
   drawn with the floor it stands on.
5. **`overhang: "meant"` is one word on a floor or a room**, not a boolean and not a WRT-6 mark: the
   card says "marked as meant", and an enum leaves room for another word later. On a floor it
   silences `floor/out-of-line` for that floor against the floors below it; on a room,
   `room/stair-shifted` or `room/lift-shifted` for that room against the one below it. It is read
   per pair, so a stair moved on floor 3 and back on floor 4 needs the mark on both (tested): the
   floor 4 stair does not lie over the floor 3 one either.
6. **Set-backs are said as well as overhangs.** E-9 is a set-back (the ground floor 30 cm wider than
   the floor above), so `floor/out-of-line` says both, and a set-back meant (a penthouse, a
   single-storey extension) needs the mark. Saying only overhangs would miss E-9. Only floors with a
   room on them are compared, so a roof floor of parapets or a lone wall is not.
7. **The outline check is a drawing warning; the stair and shaft check is a plan-check finding**
   beside LVL-3's `stair_out_of_line`, under the same check (`stairs-line-up`), so the list of
   checks is unchanged. "Moved" is both sides of the room's box past the other's the same way, by
   more than `stackShift`, so a top-floor stair room that ends at its landing is not moved. A lift
   shaft is said for any side that stands off, as a shaft is the same on every floor (h06b's 0.6 m).
   A stair room that shares less than half with the one below is still LVL-3's out-of-line finding,
   without a distance.
8. **`stackShift` = 0.05 m, and for outlines half the thickest wall along the stretch.** Walls of
   different thickness on one axis line up (0.50 m under 0.30 m: faces 0.10 m apart); the lab's
   0.30 m widening and 1.20 m move do not. The cost: a real overhang no deeper than half the wall
   it runs along plus 5 cm (0.25 m past a 0.40 m wall) is not said. Comparing outlines on the walls'
   axes instead would catch it, but needs an outline Grid does not draw yet.
9. **Rooms text is unchanged.** WRT-4's `through <floor>` on a room still writes the room and its
   walls on each floor, stacked; `grid write` does not write walls through floors, and
   `describe --as rooms` reads such a wall back as a `raw wall` line (round trip checked by hand on
   hx3). Writing one shared wall from rooms text is the follow-up.
10. **The window wording** names each refused opening by its type (A-16). The code stays
    `floor/not-checked-doors-not-drawn`; renaming it would break agents that read it.
11. **The cross-floor rule** is relaxed only for a wall that states `through`; a plan without one
    is checked as before, and `docs/plan-file.md` now has a change rule saying so.

## Not done or not verified

- **A facade (LVL-8)** still draws each floor's slice: a wall through floors is drawn as its parts,
  floor by floor, and the window as two openings, with the slab edge between them where the facade
  draws one. Drawing it whole, as the 3D view and the section do, means skipping the slab's band
  along such a wall; not built.
- **Schedules, take-offs and counts** (`packages/cli/src/quantities/`) read floor by floor, so an
  opening through two floors may be listed on each floor it passes, at its part there. Not
  checked; `isCarriedOpening` is there for them to tell a part above its wall's own floor.
- **Rooms text** does not write walls through floors (For the owner, 9), and `grid tidy` and the
  edit tools were not run on such a plan.
- **A wall through floors under a stated roof** (LVL-6): the roof of its top floor cuts its part on
  that floor's slice; the whole wall drawn in 3D and the IFC is not cut to it. Not tested.
- **Openings' places** against the walls that meet them (MSG-16, `openingPlaces.ts`) are checked
  on the wall's own floor in the whole plan, and on each floor's slice with its parts.
