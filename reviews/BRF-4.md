# BRF-4 review: massing before walls, and "how much fits on this plot"

For the owner. A floor may now state its `outline`, its outside face, before any wall (convention
C17). With its level, height and kind of building it is massing: Grid gives its gross area, its
storey, its slab and roof, the plot coverage and the distances to the boundary. With walls and
rooms inside it, the outline is joined with what the walls enclose, so it gives the slab, the
roof and the floor no room claims. The person's own site limits (coverage, floor area ratio,
height, parking per home) go in the brief's figures (BRF-1), the set-backs stay in
`site.setbacks` (BRF-3), and `grid_measure what=site` reports each as used, the person's limit,
and met or not, naming how it was measured. Grid brings no figure and optimises nothing. One new
object, no parallel store, version 1.

## The lab case

The lab's id FD-1 is not in this repository's data (BRF-1 found the same for FD-2), so the case
was built from what it describes, as closely as the data allows:

- **FD-1's plot** is the I series plot (`I/scenarios/s5-plot`), the only lab scenario that draws
  a plot: corners (0, 0), (18, 0), (22, 25), (0, 25), 500 m² by hand. Its first attempt drew the
  plot as a room of dividing lines (`mistakes.json` mistake 6); here it is `site.boundary`.
- **The massing outline** is the outside face of the house the second attempt drew in that plot:
  (3, 5), (15.762, 5), (18.482, 22), (3, 22), read from LVL-4's slab outline of
  `attempt-2-house-only.json` and rounded to the millimetre: 240.074 m² a floor by hand. Two
  floors 3 m high, `building: home`, 2 homes each, 3 parking spaces on the ground floor, and 3 m
  asked from every edge. The person's limits are ours: coverage 40%, floor area ratio 1 by gross
  external area, height 9 m, one parking space a home.

### Before (main at e486ccba)

The same plot with two floors and no walls, through the built `grid` on main: `grid check` gave
`plan/empty` ("The plan has nothing in it"), `plan/not-checked-boundary` ("no floor at or above
the ground floor has walls that close a floor") and `plan/not-checked-no-rooms`; `grid describe`
gave "0 rooms, 0.0 m²" on each floor and the plot's 500.00 m². No gross area, no storey count,
no coverage. `floors[].outline` was not in the format, and the brief knew five figures, none of
them a site limit.

## Done when

1. **"FD-1's plot with a massing outline returns the gross area per floor and a storey count
   before any wall exists."**
   - `packages/cli/src/mcp/__tests__/massing.test.ts`, "returns the gross area per floor and a
     storey count (grid_areas)": `Floor "ground": net 0.00 m², gross internal not known, gross
     external 240.07 m².`, the same for the first floor, `Gross external: 480.15 m²`, and
     `Storeys: 2 storeys at or above the ground floor, none below it; …`; the data's floors carry
     `massing: true` and 240.074 m², `storeys` `{ above: 2, below: 0 }`.
   - `packages/floorplan/src/geometry/__tests__/massing.test.ts`, "gives the gross area per floor
     and a storey count with no wall in the plan": `planAreaFigures` per floor 240.074 (by hand),
     gross internal null with why, `planStoreys` 2 and 0. The same file holds the slab and roof
     from the outline, 6.50 m to the top of the roof (3 + 0.25 + 3 + 0.25), coverage 48.0% and
     3.00 m from the west edge, and that a massing floor gives no `floor/unclaimed`, no
     `floor/empty-top` and no `plan/empty`.
2. **"Limits the person supplies are reported as used, allowed, and met or not, with the area
   rule named. Grid supplies no figure."**
   - `massing.test.ts` (cli), "reports each with the area rule named, and Grid supplies no figure":
     the eight lines of "Site limits": coverage used 48.0%, limit at most 40%, not met; floor area
     ratio used 0.96, at most 1, met, "Measured as Gross external area (Gross external area is the
     floor inside the outside face of the walls, every wall counted) … 480.15 m² over 500.00 m²";
     height 6.50 m, at most 9.00 m, met; parking 0.75 a home, at least 1, not met ("3 spaces for
     4 homes"); the four set-backs, each 3.00 m or more, met (the attempt-2 house stood 3 m off
     the slanted east edge at both its corners, by hand). The data's `limits` hold `used`,
     `allowed`, `state`, `rule`; MSG-3's approval words: none.
   - A ratio that names no measure is measured by gross external area and says "Assumed: … ask
     the person which their figure is set by"; one set by gross internal area on massing is "not
     measured, gross internal area is not known on "Ground floor": it is an outline with no walls
     yet". A limit the person did not give is not reported; with none, the answer says where they
     go. The same lines are the brief's in every change's answer (`grid_write_brief` test).

## What changed

1. **The plan format** (`types/floorplan.ts`, convention C17; HND-11 and CNT-10 took C15 and C16 on main). `FloorSchema` gains `outline`
   (3 to 2,000 points, either way round, closed by a last point on the first, refused when it
   crosses itself or encloses no ground: BRF-3's `ringProblem`, moved to `geometry/ring.ts` so
   the schema can read it), and `homes` and `parking` (whole numbers). Optional, never defaulted.
   Read part by part, a faulty one is left out alone and the floor kept.
2. **The core.** `geometry/massing.ts` (`statedOutline`, `isMassing`, `outlinedFloors`). The
   outline is joined in where the walls' outline is worked out: `spaces.ts` (`floorSpaces`, so
   ARE-9's gross areas and the floor no room claims; `floorOutline`, so SHT-11's floor-above
   line) and `outline.ts` (`slabOutline`, so LVL-4's slabs and roofs and BRF-3's footprint).
   `FloorSpaces.pastOutline` is how far the walls reach past it. `areas.ts`: a massing floor
   gives gross external only, with `massing: true`, and a note naming it. `geometry/storeys.ts`:
   `planStoreys` and `buildingHeight`. `floorHasGeometry` and the reader's `plan/empty` note
   count an outline. `PlanDrawing.outline`, drawn on the floor's plan as a solid line.
3. **Checks and the record.** One new worth-a-look line, `floor/past-outline`, with its
   catalogue entry, the contract's row and changelog entry. A massing floor gives no
   `floor/unclaimed`.
4. **The brief** (`brief/brief.ts`). `FIGURES` gains `plot_coverage`, `floor_area_ratio` (with
   `measure`), `building_height` and `parking_per_home`, each with its unit and bounds;
   `brief/lines.ts` measures them through `quantities/limits.ts` (`siteLimits`, one place).
   `grid_write_brief`'s schema describes each.
5. **Tools.** `grid_measure what=site` reads the brief beside the plan and adds the storeys, the
   gross area per floor and "Site limits"; `grid_areas` adds `storeys` and a "Storeys:" line on
   massing. `grid_mirror` mirrors and turns the outlines with the walls. Rooms text keeps the
   outline, homes and parking on a `raw floor` line.
6. **Sheet**: `coverage.ts` gains `OUTLINE_COVERAGE` (outline drawn and tabled, homes and parking
   not shown, with why), held to `FloorSchema` by `coverage.test.ts`.
7. **Docs**: `plan-file.md` ("A floor outline before the walls"), `brief.md` (the four limits),
   `areas.md` (massing), `tool-server.md` ("How much fits"), `result-contract.md`, `CHANGELOG.md`.

## Changed test expectations

- `cli/src/brief/__tests__/brief.test.ts`, "refuses a figure Grid does not know, with the ones it
  knows": the refusal lists the nine figures Grid now knows, not five. The wording around them
  is unchanged.

No other expectation changed. The existing BRF-3 site test reads the first ten lines of the
answer, which are unchanged; the new lines come after the faces.

## Checks

Run on a laptop shared with other sessions (40 to 50 other vitest processes running), with
`--maxWorkers=2 --minWorkers=1`.

| Gate | Result |
| --- | --- |
| `npm run build` | passes; `packages/cli/dist/grid.mjs` 540,475 bytes before merging main, 553,154 after (cap 600 kB) |
| `npm run typecheck`, `npm run lint` | pass, before and after merging main |
| Full suite (`vitest run --exclude '.claude/**'`) | The one run hit its 1,500 s timeout after 155 of 318 files, all passed. The other 163 were run next: 161 reported, one failure, `diff-size.test.ts` "diffs 1,000 entities … well inside a second" (an absolute bound, 16 s under the load). Run alone it passed, 4 of 4. The two files that had not reported (`fixtures-parse.test.ts`, `scoreboard.test.ts`) passed, 22 tests. So every file passed, in three runs, none of them whole |
| `npm run scoreboard` | Same as the stored figures, before and after merging main: rooms measured wrong 194 of 16,542 (735 not measured), damage silent 278 of 3,000, turns 19 of 67, mistakes 5 of 9, checks 20 of 42, sound plans with a warning 95 of 442 |

## After merging main at 90a933b1

Merged 17 commits (HND-11, COD-8 and others) in c3a985d1. Conflicts: both changelogs (every
entry kept, BRF-4's first) and `types/floorplan.ts`'s conventions: HND-11 took C15 for taped
lengths, so the floor outline was C16 (now C17, see below), renamed in every BRF-4 comment and doc. After the
merge: build, typecheck and lint clean; the affected tests (main's 14 changed test files, the
three BRF-4 test files, the brief, site, tools, coverage, edit, rules result, plan types, rooms
text, levels and the end-to-end tests), 48 files, 681 passed; scoreboard "Same as the stored
figures".

## For the owner

1. **The outline is a floor field** (`floors[].outline`), not a new top-level list: a floor
   already holds the level, height and kind of building the roadmap names, and every reader that
   asks "this floor's outline" finds it there. The use is the floor's existing `building`
   (CNT-5), not a new field.
2. **The outline is joined with the walls, never instead of them.** A floor with walls and no
   outline reads exactly as before; one with both covers both. The alternative, the outline
   wins and walls past it are cut off, would make a slab smaller than the building on it.
   Walls past the outline are said (`floor/past-outline`).
3. **Massing has no gross internal area** (null, with why) and gives no `floor/unclaimed`: the
   whole floor would be one note every time. The areas answer names the massing floors instead.
4. **Homes and parking are counts the floors state** (`floors[].homes`, `floors[].parking`), the
   agent's proposal. Grid counts no parking from rooms of use `parking` (a garage room is no
   number of spaces) and no homes from rooms (the plan has no "home" grouping yet).
5. **Limits in the brief's own `figures`**, under their heading, not a new section: coverage as
   a percentage, the ratio as a number with `measure` (`gross_external` or `gross_internal`),
   height in metres, parking per home at least. Coverage, ratio and height are mosts; parking
   a least. A cap on parking is not expressible yet.
6. **A ratio with no measure** uses the gross measure usual for the plan's place (ARE-8's
   `usualGross`), else gross external, and says it was assumed. The floors counted are those at
   or above the ground floor, as BRF-3's footprint takes them: basements are left out.
7. **Building height** is from the ground (`site.ground`, else the ground floor's floor level)
   to the top of the highest roof: level, clear height, the 0.25 m roof slab, a stated ridge and
   parapet. A roof stated by its pitch alone is taken at the floor's clear height. No storey
   limit was added: the roadmap names height; a storey count is reported.
8. **The set-backs are among the limits** in `grid_measure what=site`, edge by edge, but not in
   the brief's lines: they live in the plan, and `grid check` already says a short one
   (`plan/setback-short`).
9. **Shadow pictures are out of scope**, as the roadmap says; recorded in `plan-file.md`.
10. **The 2D plan draws the outline** at the weight of the floor-above line, solid, in every
    look, with no new look value. A plan with walls and an outline exports the joined slab and
    roof through LVL-4's envelope; a plan of massing only is still refused by `grid export`
    ("Nothing to export: … no wall, room or fixture that can be drawn"), as before. Letting it
    through is a change to HND-6's empty-export rule and to all four exporters, left for a card.

## Not built

- A shadow picture, a storey limit, a parking cap, and an optimiser of any kind.
- Exporting a plan of massing only (`grid export` refuses it, as before), and an outline object
  of its own in the IFC or DXF.
- Rooms text words for an outline (kept on a `raw floor` line).
- `grid describe` does not yet say a floor is massing.

## After merging main at fbe5160e

Merged WRT-7, CNT-10, VEW-9 and VEW-4 in 42be4d78. Conflicts, each kept on both sides: both
changelogs, the sheet's `coverage.ts` (CNT-10's `PHASE_COVERAGE`, then BRF-4's
`OUTLINE_COVERAGE`) and its test (both tests, both imports), and `types/floorplan.ts`'s
conventions: CNT-10 took C16 for phases, so the floor outline is **C17**, renamed in every
BRF-4 comment and doc. After the merge: typecheck and lint clean, the built file 583,207 bytes
(cap 600 kB); the affected tests (main's 24 changed test files and the same BRF-4 and nearby
files as before), 58 files, 824 passed and 1 skipped; scoreboard "Same as the stored figures".
