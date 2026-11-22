# LVL-9 review: sections drawn from the model, with section and level marks

For the owner. LVL-9 adds a section along a line with a look direction, cut from the same model
the 3D view, the IFC and the take-off read: cut parts solid under a heavy outline and joined into
connected shapes, a heavier ground line past the building, what lies beyond in a lighter line,
level marks and room heights, and what the plan does not state hatched and listed. A floor plan
can now carry section, elevation and floor level marks. Lab finding SE-5 ("a townhouse front is
twelve unconnected rectangles"; "everything it had to invent (slabs, roof) is hatched and
listed") and the lab's N-section prototype are the evidence.

## What changed

1. **The core** (`packages/floorplan`, pure):
   - `geometry/section.ts` (new): `planSection(plan, { from, to, toward })`. In the section's own
     coordinates, x runs across the picture from its left (a person on the line looking toward
     the chosen side sees the left on the left; `sectionFrame` says how it stands on the plan),
     y is the height from the ground floor's floor level. It cuts:
     - every wall by its parts (`wallParts`: runs, and the sill and lintel round each door and
       window), with corners joined as the plan joins them (`wallJoints`), each at its floor's
       level (`floorElevations`);
     - each floor's slab, its sunken pieces, the roof and any parapet (`planEnvelope`, LVL-4),
       so a slab is open over a stair room, a stated stair, a lift and a void;
     - each stated stair tread by tread and landing by landing, solid from the foot
       (`stairBlocks`, LVL-3);
     - the floor of a raised room (LVL-7), from its storey's floor up.

     Every point is on `shellGrid`, so a wall touches the slab under it and the slab or roof over
     it, and `cut` is their union: connected shapes. `parts` keeps each part as cut, with, for a
     wall, which side across the section is outside (`outside`, from MSG-13's `wallSides`, as
     CNT-3 reads them). `beyond` holds the faces of walls, slab, roof and parapet edges and stair
     blocks that face the person looking, clipped to what lies past the line, with their doors and
     windows open, farthest first; a face seen edge-on is a line (a corner). `ground` gives the
     ground level (`groundLevel`: the site's, or 0, flagged) and the stretches of its line outside
     the floors that meet the ground, run `sectionGroundRun` past the building. `levels` gives each
     floor's level and whether it is `stated`, the `datum` or `worked-out`; `roofs` each roof's top;
     `rooms` each room cut, with its floor level and its own height (ARE-10's `height`, else up to
     the slab or roof over its storey, flagged). `assumed` lists what it takes, each with the cut
     pieces to hatch: slabs whose thickness the floor does not state, every roof, walls whose
     height nothing states (`heightByDefault`) or that the plan marks assumed (WRT-6); and, listed
     only, the ground when the site states none, worked-out levels, room heights from the storey,
     stair rooms with no stated stair and worked-out risers. `levelText` writes `±0.000`, `+2.950`.
   - `geometry/drawingMarks.ts` (new): `drawingMarks(plan, floor, drawing, around, asked)` places a
     section's cut line with the way it looks, an elevation mark outside each of the plan's four
     main sides (`planAxes`, SHT-4) `elevationMarkOffset` beyond what the picture frames, named by
     the compass point that side faces (the stated north, else the drawing's top), and each room's
     floor level (storey plus LVL-7 offset, with whether the floor states its elevation).
   - Two new limits in `tolerances.ts`, mirrored in `docs/tolerances.md`: `sectionGroundRun`
     (1 m) and `elevationMarkOffset` (1.2 m). Both only draw; neither judges anything.
2. **The viewer** (`packages/viewer`, draws only):
   - `picture/section.ts` (new): `sectionPicture(plan, line, options)` paints what the core gives,
     in the plan's looks and pens (SHT-1): faces beyond, farthest first, filled with paper and
     stroked with the `beyond` line (the finest pen, 0.75 px on screen); the cut in the walls' tone
     under the plan's wall outline (twice the `cut` pen, inner half under the fill) in a paper look,
     solid with no outline on screen; a hatch pattern over each hatched assumption; the ground at
     twice its `ground` width (the `cut` pen), none of it under a fill, so it reads twice as heavy
     as the cut; room names and heights where they fit; level marks beside the drawing (floors on
     the left, roofs and the ground on the right); and under it a band with "Section A–A", the
     line, and the list of what was taken, hatched entries with a hatch swatch.
   - `picture/drawingMarks.ts` (new): the section mark (a chain line, heavy ends, an arrow and "A"
     at each end looking the section's way), elevation marks (a disc with the compass letters and
     an arrow at the building) and level marks under each room's label point.
   - `planPicture` takes `marks`; with any, the view frames them too. Without, nothing changes.
   - `look.ts`: line parts `ground`, `beyond`, `hatch`, `mark` and dash part `chain`, each mapped
     to an existing pen (cut, finest, finest, fine): no new weight. `Picture` gains an optional
     `description`, used as the SVG's label ("Section A–A through 9 rooms").
3. **The command** (`packages/cli`):
   - `grid draw --section x1,y1:x2,y2 [--toward left|right]` draws the section (SVG or PNG,
     technical by default, as a plan). `--marks levels,elevations,section` marks a plan; with
     `section` in `--marks`, `--section` marks the plan instead of drawing a section. Strict, by
     name: `--toward` without `--section`; `--section` or `--marks` with `--3d`; `--marks section`
     without `--section`; `--marks` naming another mark, or one twice; `--floor`, `--hide`,
     `--colour`, `--key`, `--ids`, `--units` and `--decimal` with a section; a line it cannot read,
     or of two equal points. Parsing is in `command/section.ts`, shared with the tool server. The
     drawing is `draw/drawSection.ts`, loaded only for a section; it prints one line on standard
     error saying how many parts it hatched and things it listed.
   - `grid_view` takes `kind` `section` with `cut` (`{ "from": [x, y], "to": [x, y] }`), `toward`
     and `look`, and `kind` `plan` takes `marks` (with `cut` and `toward` for `section`). The
     answer's text and `data.section` give the line, levels, roofs, ground, rooms with heights,
     parts cut, how many shapes they join into, and every line of `assumed`
     (`mcp/sectionAnswer.ts`, loaded only for a section). `views.ts` gains `sectionView` and passes
     `marks` to `planView`.
4. **Docs**: `docs/commands.md` ("Sections, and the marks on a plan", and the table row),
   `docs/tool-server.md` (grid_view's row), `docs/result-contract.md` (a changelog entry: no new
   code), `docs/tolerances.md`, and a line under "Unreleased" in `CHANGELOG.md`. The README is
   untouched. No new message code, so the catalogue and the contract's code table do not change.

## The argument shape, and why

- **A line and a side, not a box.** The lab found a line with a look direction easier for an
  agent than Revit's bounding box (MASTER-LIST-WAVE3, the CP2 entry). The side is `left` or
  `right` of the line walking from its first point to its second: exact whatever way the plan is
  turned, unlike a compass word, and the same words in the command and the tool. `left` is the
  default.
- **The command writes the line `x1,y1:x2,y2`**, as the lab's prototype did (`--cut`); the colon
  splits the points, commas the coordinates, and a leading minus reads (`--section -1,5:7,5`).
- **The tool takes `cut` as an object of two `[x, y]` points**, the shape agents write points in
  elsewhere in the plan. `toward` is the existing argument, which now says "For eye: … For
  section: left or right …", as `floor` already means one thing for a plan and another for 3d.

## Against `done_when`

1. *A section through the townhouse stair draws connected cut parts, not twelve separate
   rectangles (SE-5).* The townhouse is `A/scenarios/townhouse.json`, read by name from
   `scoreboard/data/lab-plans.ndjson.gz` (`labPlan`). The cut is down the middle of its stair rooms,
   from (4.9, −2) to (4.9, 13), looking west. In
   `packages/floorplan/src/geometry/__tests__/section.test.ts`, "a section through the townhouse
   stair (lab SE-5)":
   - "cuts twelve walls, three slabs and the roof, one by one": the twelve walls by id, one
     rectangle each, and 16 or more rectangles in all;
   - "joins them into one connected shape, not twelve separate rectangles": `cut` has one shape,
     with 7 holes (three floors of three rooms, less the stairwell open from the ground to the
     roof), and its area equals the parts' to 1e-6;
   - "stands each floor's walls on its slab and under the slab or roof above": 0 to 2.7, the slab
     2.7 to 2.95, the first floor's walls from 2.95, the roof on the top walls.

   The same through the tool: `packages/cli/src/mcp/__tests__/sectionView.test.ts` ("cuts the
   townhouse through its stair into one shape…": `shapes` 1, 12 walls, "the cut parts join into 1
   shape"). A stated stair joins its slabs too: "cuts the flight tread by tread, joined to the slabs
   it stands on and rises to" (`stairHouse`, one shape, each tread one riser up).
2. *Level marks match the stated levels. Anything assumed (slabs, roof) is hatched and listed.*
   - `section.test.ts`, "the levels of a section (LVL-9 done-when 2)": "stands every level mark at
     the level the plan states" (elevations 0 and 3.1 stated: levels 0 and 3.1, `stated`, written
     `±0.000` and `+3.100`; the ground −0.45 as stated); "hatches nothing and lists no level, slab
     or ground the plan states" (only the roof and the room heights are listed; the stated 0.3 m
     slab is cut at its thickness); "works out the levels a plan does not state, and lists each one
     with the slabs and the roof it took" (the townhouse: three slabs and the roof hatched, each
     hatch exactly its part's cut pieces; the two worked-out levels and the ground listed).
   - In the picture, `packages/viewer/src/picture/__tests__/section.test.ts`: "are the levels the
     section marks" (elevations 0.15 and 3.2 stated: the marks read "+0.150 Ground floor" and
     "+3.200 First floor"; only the roof hatched), "marks every floor's level, the roof and the
     ground beside the drawing", and "hatches each slab and the roof the plan does not state, and
     lists them with what else it took" (`url(#section-hatch)` on slab:ground, slab:first,
     slab:second and roof:second; every assumption's words under the drawing).

The card's other asks:

| Ask | Where |
|---|---|
| Cut parts solid under a heavy outline | viewer `section.test.ts` "draws the cut as one solid shape under the heavy outline of the plan's cut walls" (twice the cut pen at 1:100), and the working look solid with no outline |
| A heavier ground line past the building | "runs a heavier ground line past the building, and draws what lies beyond lighter" (0 to 1.85 and 13.15 to 15 across the section); core "says which side of each outside wall cut is outside, and runs the ground past the building" |
| Lines beyond lighter | the same test (finest pen); core "draws what lies beyond the cut farthest first" (the stair room's far wall 0.55 m away) |
| Room heights, the room's own | core "uses the room's own height, not the storey's tallest wall" (a hall stating 2.4 m in a 2.6 m storey), "gives each room cut its own height, from its floor"; picture "names each room cut with its height" |
| Plan section, elevation and level marks | core "the marks on a plan" (3 tests); viewer "the marks on a plan" (none unless asked; all three drawn and framed); e2e "marks a floor plan with --marks" |
| `grid draw --section` and `grid_view` | e2e `grid.e2e.test.ts` "writes a section along a line with --section…" and 12 refusals in the options table; `sectionView.test.ts` (4 tests) |
| Hatch what is assumed: walls with no stated height | core "hatches and lists walls whose height nothing states" |

## Changed expectations and snapshots

None. No existing test's expected value or snapshot changed: a plan picture without `marks` is
drawn byte for byte as before (tested: "are none unless asked for: a plan picture is unchanged"),
the pen table keeps its four weights, and no new result code was added. New tests only:
`floorplan/src/geometry/__tests__/section.test.ts` (19), `viewer/src/picture/__tests__/section.test.ts`
(9), `cli/src/mcp/__tests__/sectionView.test.ts` (4), and 2 cases and 12 refusal rows in
`cli/src/command/__tests__/grid.e2e.test.ts`.

## The checks run

Each once, at the end, on a machine shared with other sessions (load average about 120 to 220):

| Check | Result |
|---|---|
| `npm run build` | passed (`node build.mjs`, exit 0); `grid.mjs` 471,477 bytes, under the 500 kB limit, which is unchanged |
| `npm run typecheck` | passed, exit 0, every workspace |
| `npm run lint` | failed once: an unused binding in the new `section.test.ts` (`_height`). Fixed in its own commit; rerun: no problems, exit 0. The floorplan workspace's type check and that test file (19 passed) were rerun after the fix |
| `npm run check:licenses` | "Checked 363 licences in package-lock.json: none is GPL, LGPL, AGPL, MPL, EPL." |
| `timeout 1500 npx vitest run --exclude '.claude/**' --maxWorkers=2 --minWorkers=1` | Test Files 2 failed, 288 passed (290); Tests 2 failed, 5278 passed, 4 skipped (5284); 1116 s |
| `npm run scoreboard` | "Same as the stored figures." No count moved, nothing stored |

The two failures:

- `grid.e2e.test.ts`, "speed > answers grid check on the sample flat in under 500 ms (median of
  7)": 3,749 ms under the load. A timing test that does not touch sections; rerun alone, it
  passes.
- `versions/__tests__/diff.test.ts`, "names the door that now joins other rooms, and reads a
  split merged back as no change": the merge it runs is refused ("one room has one use … keep
  both uses with zones: true"), CNT-8's rule for merging rooms of two uses. It fails the same way
  on main at d058d4d, run from a clean copy of that commit, so it was there before LVL-9; nothing
  here touches `grid edit merge` or `grid diff`. Left for the owner: the test or the merge rule
  needs a decision after CNT-8 and WRT-8 met on main.

## For the owner

Each is the reversible choice, taken and recorded rather than stopped on.

- **The marks are asked for, not drawn by default.** A plan shows level, elevation and section
  marks only with `--marks` (`marks` in `grid_view`). Drawing them by default in the technical
  look, as a set of drawings would, is one switch in `planPicture`, but it changes every
  technical picture and the sheet. A section is not stored with the plan (lab SE-7: views are not
  saved), so the plan can only mark a section it is told about; it is always named A.
- **The ground line is the cut pen written twice its width**, as the plan's wall outline is, with
  none of it under a fill, so it reads twice as heavy as the cut: 1.0 mm at 1:100. That keeps
  SHT-1's four weights. A fifth pen (one step above `cut`) is the other reading.
- **Hatched or listed.** Hatched: slabs whose thickness the floor does not state, every roof
  (LVL-4's flat roof, which no plan can state yet), walls whose height nothing states or that the
  plan marks assumed. A slab whose thickness is stated is drawn plain, though its outline is still
  Grid's reading of the walls (LVL-4 marks every slab line of the take-off assumed). Listed only:
  the ground when the site states none, levels worked out from the floors below, room heights
  taken from the storey, stair rooms with no stated stair, worked-out risers. Say if you want any
  moved between the two.
- **A room with no stated height** is drawn up to what is over its storey (the storey's clear
  height less the room's offset), and listed. That is the storey's figure, which with no floor
  height stated is still its tallest wall: the room's own height is used whenever the plan gives
  it (ARE-10).
- **What lies beyond is painted, not traced.** Faces are drawn farthest first, each filled with
  paper, so nearer faces hide farther ones; the order is by each face's middle. Faces that cross
  on plan, or a long face behind a short one at a slant, can be ordered wrongly; it has not shown
  on the lab's plans drawn so far. Slab soffits, ceilings, door leaves and glass are not drawn
  beyond. Exact hidden lines are a follow-up.
- **The ground** runs outside the floors that meet it (the lowest level, and any floor whose slab
  reaches the stated ground), where the line crosses them, 1 m past the building. One level for
  the whole site, as LVL-4 left it: no slope, and no earth hatch below it.
- **Level marks on the plan** stand under each room's label point, where the label placement
  usually puts the room's name and area; a label moved out of its room leaves its level behind.
  One mark per room repeats the floor's level; marking only rooms off their storey's level is the
  other reading.
- **Elevation marks are named by the way that side faces** (N, E, S, W…), by the stated north or,
  with none, the drawing's top. They mark where LVL-8's facades are seen from; LVL-8 is built
  apart and shares no code with this, so its drawings are not linked to the marks.
- **Stair rooms with no stated stair** (the townhouse) get no flight: the room and the slab
  opening over it, and a listed line. The lab's prototype drew a red cross there; a listed line
  says the same without inventing a symbol.
- **A section cuts every floor.** `--floor` is refused with it; cutting only some floors is a
  follow-up.
- **The bundle.** `grid.mjs` is 471,477 bytes after this change, under the 500 kB limit, which
  did not move. Main's own `grid.mjs`, built from d058d4d, is 496,425 bytes: esbuild now splits
  the shared core into a chunk of its own because the section is loaded lazily, so the entry file
  shrank while everything loaded at start grew by about 25 kB (2,657,721 to 2,683,217 bytes). The
  section's drawing and its tool answer are loaded only when a section is asked for.
- **Lab paths.** No lab path is committed: the tests read the townhouse by name through
  `labPlan` and `labPlanText`.

## After merging main (c05d051)

Main brought VEW-3 (a camera an agent can set, saved views, `grid_save_view`), LVL-6 (sloped roofs)
and BRF-5 (the sun table). LVL-8 (facades) is not on main yet.

- **Conflicts**, all kept both sides: `CHANGELOG.md` (LVL-9's line first, then VEW-3's, BRF-5's and
  LVL-6's), `docs/commands.md` (both contents lines; one `grid draw` row with `--view` and
  `--section`; VEW-3's `--view` paragraph, then this section), `docs/result-contract.md` (LVL-9's
  entry above VEW-3's, BRF-5's and LVL-6's), `docs/tool-server.md` (BRF-5's `grid_measure` row;
  `grid_view`'s row with the camera and the section), `command/draw.ts` and `command/main.ts`
  (every option of both: `--view`, `--section`, `--toward`, `--marks`), `draw/views.ts` (the
  section's imports beside VEW-3's `planStill`), `mcp/readTools.ts` (`grid_view` keeps `plan`,
  `3d`, `eye` and `section`, VEW-3's camera arguments and `cut`/`marks`, one description naming
  both, the output schema with `view` and `section`), `geometry/index.ts` (both sides' exports),
  `versions/__tests__/diff.test.ts` (main's, which passes `--use bedroom` as 23dc34d did).
- **Refusals between the two**: `grid_view kind=section` refuses VEW-3's camera arguments by name
  (`bearing`, `tilt`, `distance`, `eye_height`, `lens`, `room`, `camera`, `view`, `turn`,
  `tilt_by`), and `kind=3d` refuses `cut`, `toward` and `marks`, through the one list of what each
  kind takes. `grid draw --view` with `--section` or `--marks` is refused naming `--view` (it was
  refused before as `--3d`, which the person did not type). A section's `data` carries `view: null`,
  as VEW-3's output schema asks of every kind. Tested in `sectionView.test.ts` and two rows of the
  e2e options table.
- **Expectation changed**: `sectionView.test.ts`'s refusal of `marks` with `kind=3d` now lists
  VEW-3's 3d arguments.
- **LVL-6's stated roofs.** A section draws every roof flat at `planEnvelope`'s `bottom`, which for
  a roof the floor states is its eaves. Its list said "the plan states no roof" for those too; it
  now says a stated flat roof is the floor's, with Grid's thickness, and that a stated sloped roof
  is drawn flat at its eaves because a section does not draw a slope yet (two tests on the lab's
  converted loft). `docs/commands.md` says the same.

### For the owner

- **A section does not draw a sloped roof yet.** Under a gable, mono-pitch or hip roof (LVL-6) it
  draws the roof flat at the eaves, and walls as rectangles to their height, which on such a floor
  is the ridge when they state none, so a gable wall can rise through the flat roof drawn. It is
  hatched and listed. Cutting walls to `wallTopProfile` and the roof along its `facets`, with the
  faces beyond, is the follow-up; room heights under a sloped roof are likewise the storey's, not
  `roomHeadroom`'s.
- **Elevation marks stay named by compass side** and are not linked to LVL-8's facades, which are
  not on main.
- **`--view` with `--toward` alone** is refused as `--toward` without `--section`, as before.

### Checks run

On a loaded machine shared with other sessions, once each, at the end:

| Check | Result |
|---|---|
| `npm run build` | exit 0; `grid.mjs` 494,058 bytes, under the 550 kB limit main set for VEW-3, which did not move |
| `npm run typecheck` | exit 0, every workspace |
| `npm run lint` | exit 0, no problems |
| `timeout 1500 npx vitest run packages/floorplan/src/geometry packages/viewer packages/cli --maxWorkers=2 --minWorkers=1` | Test Files 231 passed (231); Tests 4491 passed, 2 skipped (4493); 481 s |
| `npm run scoreboard` | "Same as the stored figures." |

## After merging main (8b599e9)

Main brought LVL-8: facades drawn from the model (`planFacade`, `facadePicture`, `grid draw
--facade`, `grid_view kind=facade`) and opening patterns.

- **Conflicts**, all kept both sides: `CHANGELOG.md` (LVL-9's line, then LVL-8's), `docs/commands.md`
  (both contents lines; one `grid draw` row with `--facade` and `--section`; this section, then
  LVL-8's facade section), `docs/result-contract.md` (LVL-9's entry above LVL-8's),
  `docs/tool-server.md` (one `grid_view` row with the facade and the section), `command/draw.ts`
  (LVL-8's facade check and drawing before the section's), `command/main.ts` (one usage line with
  every option), `draw/views.ts` (the header names both), `mcp/readTools.ts` (`grid_view` takes
  `plan`, `facade`, `3d`, `eye` and `section`, with `side`, `cut` and `marks`; LVL-8's
  `facadeAnswer` beside LVL-9's cut and marks helpers; the output schema with `facade` and
  `section`), `geometry/index.ts` (both sides' exports), `picture/look.ts` (both sides' line
  parts) and `picture/planSvg.ts`: LVL-9's `Picture.description` and LVL-8's `Picture.title` were
  the same field, the picture's accessible name, so the section now sets LVL-8's `title`.
- **Refusals between the two**: `grid_view kind=facade` refuses `cut`, `toward` and `marks`, and
  `kind=section` refuses `side`, through the one list of what each kind takes. `grid draw
  --facade` refuses `--section` ("--facade draws one side of the building and --section a cut
  through it: give one of them.") and `--marks` ("--marks is for a floor plan, not a facade").
  Tested in `sectionView.test.ts` and two rows of the e2e options table.

### Line weights shared with LVL-8 (follow-up commit)

- **The ground line** is LVL-8's `elevationGround` (the cut pen on paper, 3 px on screen), drawn
  once, as the facade draws it. LVL-9's own `ground` part is gone. On screen nothing changed (it
  was twice 1.5 px). On paper the section's ground is now the cut pen, 0.5 mm at 1:100, where it
  was twice that: it is as heavy as the visible edge of the cut's outline, not twice it, so
  "heavier than the cut" now holds on screen only. The heavy ends of the section mark on a plan
  follow it (the cut pen on paper, 3 px on screen; they were 1.0 mm on paper).
- **What a section sees beyond** is LVL-8's `elevationBack`, the line of a facade's faces set back
  from its front plane. LVL-9's `beyond` part is gone. Same pen and width as before (finest, 0.75
  px), so no picture changed.
- **The level marks beside a section** use LVL-8's `elevationLevel` (finest; 0.75 px on screen,
  where `dimension` gave 1 px).
- **Left apart**: `hatch` and `mark` stay LVL-9's own; a facade has no hatch and no plan marks.
  A section's cut stays in the plan's wall pen (`wallOutline`), not LVL-8's `elevationOutline`
  (the medium pen of a facade's outline against the sky), since a cut is not an outline seen. The
  level text stays LVL-9's `±0.000` / `+2.950` (`levelText`), and a facade's floor marks keep their
  own `+2.95`, each in its own module; making them one is a small follow-up if wanted.
- Tested: viewer `section.test.ts` "a section and a facade of one plan … draw the ground line and
  the lines seen beyond with the same pens" (the townhouse, technical at 1:100); the two existing
  ground-width expectations were changed to the shared part (on paper from twice the cut pen to
  once; on screen `ELEVATION_PX.ground`, the same 3 px).

### Elevation marks linked to the facades

- Each elevation mark (`drawingMarks.ts`) now carries `facade`: the side of the drawing whose
  facade draws it (`planFacade(plan, side)`, `grid draw --facade <side>`), the drawing's side
  nearest the way the mark looks from, north at the drawing's top. The mark is still named by the
  way its side faces (stated north, else the drawing's top), so with a stated north the letter on
  the disc and the facade's side differ, as LVL-8's own caption says. The SVG carries
  `data-facade`, and `grid_view`'s text for `marks elevations` says kind=facade draws each.
  Tested in the core (`section.test.ts`, the marks name the same facades whatever north is stated,
  and each named facade shows walls) and in the viewer.
- Cheap and safe: data and an attribute only; no mark moved and nothing new is drawn. A plan
  turned near 45° can mark a side whose nearest drawing side differs from where LVL-8 draws most
  of its walls (LVL-8 draws every face turned toward a side).

### For the owner

- **The ground line on paper is half what it was.** LVL-8's weight was shared as asked when
  merging. Keeping a section's ground twice the cut pen (its own reading of SE-5's "heavier ground
  line") would be one multiplier in `picture/section.ts`, at the cost of a section and a facade of
  one plan no longer matching on paper.

### Checks run

On a loaded machine shared with other sessions, once each, at the end:

| Check | Result |
|---|---|
| `npm run build` | exit 0; `grid.mjs` 498,483 bytes, under the 550 kB limit, which did not move |
| `npm run typecheck` | exit 0, every workspace |
| `npm run lint` | exit 0, no problems |
| `timeout 1500 npx vitest run packages/floorplan/src/geometry packages/viewer packages/cli --maxWorkers=2 --minWorkers=1` | Test Files 236 passed (236); Tests 4547 passed, 2 skipped (4549); 460 s |
| `npm run scoreboard` | "Same as the stored figures." |
