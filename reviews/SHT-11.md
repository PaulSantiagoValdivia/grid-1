# SHT-11: stairs, lifts, flats and the floor above drawn as an architect expects

Card: "Stairs are drawn with treads, a break line, an arrow pointing up and dashed above the cut;
lifts get their own symbol; each flat gets an outline or tint; and a plan shows a dashed outline of
what lies above it, such as a loft, a void or an overhang." Lab evidence DR-5 (A-20, D-23, H-2,
H-17), reproduced by AU2: the townhouse's 3.85 m² stair counted on all three floors (11.55 m²), the
four-flat floor's "Stair, 20.07 m²" and "Lift, 6.53 m²" drawn like the bathrooms beside them, no
outline of the tiny house's loft. Style research SB6. Needs LVL-3 (stairs) and ARE-9 (outlines).

## Done when

| Item | Where it is shown |
|---|---|
| Stairs are drawn from the stair object, with treads, a break line and an up arrow | `stairSymbol` (`packages/floorplan/src/geometry/stairSymbol.ts`) from `planStairs`' layout, carried on each floor's `PlanStair.symbol`; drawn by `planScene`. Tests: `geometry/__tests__/symbols.test.ts` "a stair symbol" (5), `viewer/src/picture/__tests__/stairs.test.ts` (3) |
| … and the townhouse's stair area is counted once, not on all three floors (DR-5) | `planAreaFigures` (`geometry/areas.ts`, `stairStacks`): stair rooms one over the other count once, on the floor the stair rises from. Tests: `areas.test.ts` "SHT-11, lab DR-5" (4), `cli/src/quantities/__tests__/stairArea.test.ts`. Before and after below |
| Lifts have their own symbol | `liftSymbol` (`geometry/liftSymbol.ts`), `PlanDrawing.lifts`; a cross in each room used as a `lift`. Tests: "a lift symbol" (3), `viewer/.../symbols.test.ts` (2) |
| The floor above shows as a dashed outline | `floorAbove` (`geometry/above.ts`) from `floorOutline` (`geometry/spaces.ts`, ARE-9's gross external outline). Tests: "the floor above" (5), `viewer/.../symbols.test.ts` (5), `cli/src/draw/__tests__/writing.test.ts` "--hide above" |
| Flats get an outline when the format can say what a flat is | Not built: the format cannot say what a flat is. See "For the owner" |

## What existed

- LVL-3 drew a stated stair on both floors it joins: flight and landing outlines, a line at every
  riser, the walking line and an arrow head. The arrow head was worked out in the viewer
  (`stairArrow` in `scene.ts`, 8 px long), the only stair geometry outside the core. No cut, no
  break line, no dashes: the lower floor looked like the upper.
- A room used as a `lift` (LVL-3) was drawn like any room.
- Nothing drew what lies above a floor. ARE-9 measured each floor's outline (`floorSpaces`'
  `outlineArea`) but did not hand the outline out.
- Areas: every room counted on its own floor. A stair drawn as a room on each floor (what agents
  draw, and what the lab's townhouse holds: it has no `stairs` key) was counted on each. LVL-3's
  "stair area counted once" covered only a stated stair, which adds no floor of its own.
- Nothing in the format marks a flat. `grid describe` says "which rooms make each flat" is a
  thing the plan cannot say; ARE-14 and CNT-4 hold per-flat figures and the flat itself.

## What changed

### The core (`packages/floorplan`, pure)

- `stairSymbol(stair, end)`: the stair's lines as the floor at `end` draws it, each with its kind
  (`outline`, `riser`, `walk`), whether it is a ring (`closed`), and whether it lies above the cut
  (`above`); the break line (`cut`) and the arrow head (`arrow`, a triangle, now in metres).
  - On the lower floor the plan is cut at `planCutHeight`, a new `limit` in the tolerance table,
    1.2 m. The cut falls where the line of the nosings reaches that height, in the flight that
    reaches it (at the start of the next flight when it falls on a landing). The break line is a
    zig-zag diagonal across the flight; the riser lines it crosses are split where it crosses
    them; the flight's edges and the walking line are split at it; flights, risers and landings
    past it are `above`. A landing is seen when its floor is below the cut.
  - On the upper floor, and for a stair that climbs no more than the cut, everything is solid.
  - The break line's slant and zig-zag and the arrow head's size are proportions of the stair's
    width (named constants in the module), so the symbol scales with the drawing.
- `liftSymbol(outline, holes)`: the two diagonals of a shaft with four corners (corners on a
  straight side dropped first) and no hole; otherwise a cross on the pole of inaccessibility, as
  wide as the circle that fits there, so it never leaves the room.
- `buildFloorPlan` gains `lifts` (each room used as a `lift` that could be drawn, with its
  cross), and each `PlanStair` gains `symbol`.
- `floorOutline(plan, floor)` in `spaces.ts`: the outer rings of the walls joined as ARE-9 joins
  them for the gross external area. The join is now one function (`joinWalls`) that
  `floorSpaces` and `floorOutline` share, with the wall filter (`floorWalls`) and the reach;
  `floorSpaces` returns exactly what it did.
- `floorAbove(slice)` in `above.ts`: the floors at the next level up, read from the plan the slice
  was cut from, and the parts of their outlines that do not run along this floor's own outline
  (within `aboveSameEdge`, a new tolerance, 0.02 m). Pieces are joined end to end within that
  tolerance (the join leaves steps of a hair at corners) and straightened (`sameFace`). It is a
  function of its own, not part of `buildFloorPlan`, because `buildFloorPlan` is also run by the
  door-sweep check, the 3D scene and the exports, which do not need it.
- Areas (DR-5): `stairStacks` joins rooms used as a stair on neighbouring floors exactly as
  LVL-3's way-out check does (`floorJoins`, at least `stairRoomOverlap` of the smaller), and
  follows each down to the lowest. A stair room over another gets `countedWith` (that lowest
  room), keeps its `area`, and is in no `net`, `byUse` or note-free total; each floor gains
  `overStairs`. Per floor, `gross external = net + overStairs + outside rooms + walls + unclaimed −
  off its space`, and the same for gross internal. The net rule's sentence (`MEASURES.net`, and
  the table in `docs/areas.md`) adds "a stair drawn as a room on floor after floor counts once, on
  the floor it rises from". A note names the stair and the floors over it.

### The viewer (`packages/viewer`): draws only

- `planScene` draws each stair from `symbol`: `stair-outline`, `stair-riser` and `stair-line`
  paths, those `above` with `data-above="true"` and the look's `above` dashes, a `stair-break`
  path and the `stair-arrow` triangle. Riser lines are now paths, not `line` elements. The viewer's
  `stairArrow` is gone, and with it `LINE_PX.stairArrow`.
- A `lift` group per shaft with two `lift-cross` paths, over the room fill and under the walls,
  in the stair's line.
- An `above` group of `above-line` paths over the floors and under the walls (and under a paper
  look's wall outlines), so a stretch over an inner wall is hidden by the wall. `SceneInput.above`
  takes `floorAbove`'s answer; `planPicture` and the app's `Canvas2D` both pass it, so `grid draw`
  and the app draw the same.
- The looks: a new line part `above` (1 px on screen; the `fine` pen on paper) and dash part
  `above` (4 3 px on screen; 1.5 1 mm on paper), used by the floor above and by a stair past its
  break. `plan.css` says the same for the app (`look.test.ts` holds them together).
- `--hide above` (SHT-7's model): `PictureShow.above`, `SceneShow.above`. The key, when the
  picture has one, gains "Above: the floor over this one" when the outline is drawn.

### The command and the tool server

- `grid draw --hide` and `grid_view`'s `hide` take `above`.
- `grid_areas`: each room counted with the stair below says so in the text; the CSV's `counted`
  column says `with the stair below`; `countedWith` and `overStairs` are in the data. Circulation
  counts the stair once (its rule says so). `grid sheet`'s area table prints "counted below" for
  such a room, so the printed parts still add up to the floor's net.

## DR-5, before and after

The lab's townhouse (`A/scenarios/townhouse.json`, three floors, a 3.85 m² room used as a stair on
each, one over the other; no `stairs` key), through `planAreaFigures`:

| | Before (every room counted, as main 666bb01 does) | After |
|---|---:|---:|
| Stair, by use | 11.55 m² (3.85 on each floor) | 3.85 m² (ground floor) |
| Net, all floors | 159.93 m² | 152.23 m² |
| Net per floor (ground, first, second) | 53.31, 53.31, 53.31 | 53.31, 49.46, 49.46 |
| Over the stair below (first, second) | — | 3.85, 3.85 |
| Gross internal, gross external | 166.92, 196.62 m² | 166.92, 196.62 m² (unchanged) |

The note now reads: "Stair" on "Ground floor" is a stair that rises through 2 stair rooms over it
("First floor", "Second floor"): its floor is counted once, there, so 7.70 m² over it is in no net
figure; the gross figures still hold it.

The townhouse's stair is drawn as rooms only, so it still gets no treads: it has no stair object
to draw them from (see "For the owner"). In the repository the same case is
`stairRoomHouse()` in `packages/floorplan/src/test-support/plans.ts` (three floors, a 1.85 × 3.8 m
stair room on each): stair by use 21.09 → 7.03 m².

## Snapshots and expectations changed

No picture snapshot, golden file or export hash changed: no snapshot plan states a stair, uses a
room as a lift or has a floor whose outline differs from the one below. A plan with no stair, no
lift and one floor is drawn byte for byte as before, and so is a floor whose floor above stands on
its own outer walls (`twoFloorHouse`'s ground floor: tested equal with and without `above`).

Existing expectations changed, and why:

- `packages/viewer/src/picture/__tests__/stairs.test.ts`, the lower floor: 14 riser lines became
  16 pieces (the break line crosses two risers, each drawn in two), 6 solid and 10 dashed; one
  walking line became two (solid to the break, dashed past it); a `stair-break` is drawn. The upper
  floor keeps 14 riser lines, all solid, and no break.
- `packages/floorplan/src/geometry/__tests__/areas.test.ts` and `scoreboard/__tests__/areas.test.ts`:
  the per-floor sum that must give the gross areas adds `overStairs` (stair rooms counted with the
  one below are in no net figure but still in the gross).
- `docs/areas.md`'s measures table: the net rule's sentence (a test holds it to `MEASURES`).

New tests: `geometry/__tests__/symbols.test.ts` (13), four in `areas.test.ts`,
`viewer/src/picture/__tests__/symbols.test.ts` (7), five lines in `look.test.ts` (the CSS of the
new parts), `cli/src/quantities/__tests__/stairArea.test.ts`, and "--hide above" in
`cli/src/draw/__tests__/writing.test.ts`. Two new tolerance entries (`planCutHeight`,
`aboveSameEdge`), with their rows in `docs/tolerances.md`.

No message code was added, so `packages/rules/src/result/catalogue.ts` and the contract's code
table are unchanged; the contract's changelog has an entry for the `grid_areas` fields and
`hide above`. Docs: `docs/commands.md` (a new section, "Stairs, lifts and the floor above on the
drawing", and `--hide above`), `docs/plan-file.md` (the stair's cut and the lift's cross),
`docs/areas.md` (a stair counted once), `docs/tolerances.md`.

The scoreboard did not move: none of its counts reads a net total over stacked stair rooms or a
picture.

## For the owner

- **Flats are not drawn.** Nothing on main marks a flat: no field says which rooms make one
  (`grid describe` says the plan cannot say it), and room names with a prefix ("Flat A – Bedroom")
  are not a format. So no outline or tint is drawn. When CNT-4 (or ARE-14) gives the format a
  flat, the outline is the union of its rooms' outlines (or the spaces they cover), drawn like the
  floor above with its own dash or a tint; nothing here stands in the way.
- **A stair drawn only as rooms gets no treads.** The card says to draw from the stair object; the
  townhouse and most lab plans have only stair rooms. Guessing a flight inside a room (which way
  is up, where the landing is) would be geometry the plan does not hold. The agent or person can
  state the stair in `stairs`; the commands page says so.
- **Which floor counts the stair.** Grid counts a stack of stair rooms on the lowest floor, the one
  the stair rises from, and leaves the rooms above it out of net, by use and circulation, keeping
  them in the gross areas (the gross rule already says stairs are not taken off). The card asked
  for "counted once"; a measuring rule that counts a stair on every floor it serves, or the void
  above it as no floor, would be a figure record with its source. Lift shafts are still counted on
  every floor: the card names only the stair. A floor asked for alone (`grid_areas floor=first`)
  leaves its stair room out too, since it is counted on the floor below.
- **Cut height 1.2 m.** A drawing convention, Grid's own, in the tolerance table as a limit
  (`planCutHeight`), so a survey or a reader could move it. It judges nothing.
- **The floor above is the next level up only**, as its gross external outline, less what lies on
  this floor's outline within 2 cm (`aboveSameEdge`). Stacked floors of one outline draw nothing; a
  thicker wall above shows as a dashed line just outside, which is true. Voids are not told apart
  (LVL-4 has no floor openings yet): a void enclosed by the walls above is inside the outline. A
  basement shows the ground floor's outline past its own walls.
- **Dash and pen.** One dash pattern for everything above the cut (the floor above and a stair past
  its break), the convention for hidden and overhead lines. The floor above takes the fine pen, a
  stair the finest. `--hide above` hides only the floor above; a stair's own dashes stay.
- **The arrow head moved into the core,** sized by the stair's width (a quarter of it), so it is
  drawn to scale: a 0.9 m stair's head is 0.225 m long (about 27 px in a 1200 px picture of a
  10 m house, where LVL-3's was 8 px whatever the zoom).
- **Not built:** the DXF draws no stair, lift or floor above (LVL-3 left the stair layer for this
  step; adding a layer changes every DXF golden file and no done-when needs it). The 3D views are
  unchanged.

## Checks run

Final runs, on this branch from main 666bb01:

- `npm run build`: bundled. `npm run typecheck`: no errors. `npm run lint`: no findings.
  `npm run check:licenses`: 363 licences, none GPL, LGPL, AGPL, MPL or EPL.
- `npx vitest run --exclude '.claude/**' --maxWorkers=2 --minWorkers=1`: 238 files, 4,667 passed,
  3 skipped, none failed (1,359 s). No timing test failed.
- `npm run scoreboard`: 197, 386, 16, 2, 11, 735, 95. Same as the stored figures; nothing written.

## Merged with main (56458e5)

Main had gained SHT-4 (dimension chains), MSG-16, CNT-3 (north and front), MSG-10, MSG-3,
WRT-7, ARE-13 (quantities for a first estimate) and CNT-5 (building types and uses). Merge
commit 6f08549; five files conflicted, each resolved keeping both sides:

- `packages/floorplan/src/geometry/floorplan.ts`: `buildFloorPlan` returns SHT-11's `lifts` and
  CNT-3's `north` together.
- `packages/viewer/src/picture/planSvg.ts`: `planPicture` works out the floor above (SHT-11) and
  passes it to `planScene`, whose result CNT-3 names `scene` and adds the north arrow to.
- `packages/viewer/src/picture/scene.ts` (imports): SHT-11's `PlanAbove` type kept; WRT-7's
  removal of `areaText as areaFigure` kept, since the room labels now use `areaNumber` and
  `areaUnit`.
- `docs/commands.md`: SHT-4's "The sizes on a drawing" and SHT-11's "Stairs, lifts and the floor
  above on the drawing" both kept, in that order, after the `--hide` section.
- `docs/result-contract.md`: SHT-11's changelog entry first, then CNT-5's and the others from main
  as they were; all dated 2026-11-22.

The rest merged on its own (`areas.md`, `tolerances.ts` and `tolerances.md`, `look.ts`,
`spaces.ts`, `index.ts`, `plan.css`, `draw.ts`, `readTools.ts`, `writing.ts`). The type check
passed on the merged tree before the merge was committed, so no signature had moved.

Decisions after the merge:

- **ARE-13's floor finish counts a stacked stair once** (a29d1d5). `floor:<use>` is defined as
  the net area of the rooms of that use, as `grid_areas` measures it, but it summed every room's
  take-off, so `floor:stair` counted a stair on every floor. It now leaves out the rooms with
  `countedWith`, as the net area does; its rule sentence, the table in `areas.md` and the
  changelog for agents say so. Wall faces, skirting and ceilings still count every room, since
  the walls stand on every floor (gross-like, as the gross areas keep those rooms). `upper_floor`
  is unchanged: it takes the gross internal area, which keeps those rooms, less the stated stairs'
  footprints, as ARE-13 defined it. A test in `quantities/__tests__/stairArea.test.ts` holds the
  floor finish to `byUse.stair`; it fails without the fix.
- **CNT-5's use words need nothing here.** `stairs`, `staircase` and `stairwell` read as `stair`,
  and `elevator` as `lift`, when the plan is read (`readUse` in the schema), so the stair stack and
  the lift cross, which look at `room.use`, already take them. `landing` reads as `corridor` and
  stays out of the stair stack. No new use is stair- or lift-like.
- ARE-13's `FloorSpaces.outline` and SHT-11's `floorOutline` both come from the same wall join;
  `floorOutline` keeps the outer rings only and skips the room comparison. Left as two calls; one
  could be built on the other later.
- No line was added to `CHANGELOG.md` under "Unreleased" for SHT-11 before or in this merge.

Checks after the merge, on a29d1d5:

- `npm run build`: bundled. `npm run typecheck`: no errors. `npm run lint`: no findings.
  `npm run check:licenses`: 363 licences, none GPL, LGPL, AGPL, MPL or EPL.
- `vitest run packages/floorplan/src/geometry packages/viewer packages/cli/src/draw
  packages/cli/src/sheet packages/cli/src/quantities packages/cli/src/mcp packages/cli/src/command
  scoreboard/__tests__/areas.test.ts --exclude '.claude/**' --maxWorkers=2 --minWorkers=1`:
  184 files, 3,846 passed, none failed (281 s).
- `npm run scoreboard`: 197, 278, 16, 5, 12, 735, 95. Same as the stored figures (main's);
  nothing written.
