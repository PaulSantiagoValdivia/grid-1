# LVL-6: sloped ceilings and roofs

Card: "Sloped ceilings and roofs". Lab evidence VE-5 (every wall a rectangle and every roof a
flat slab: the attic's gables are 3.6 m rectangles, a window where the roof is about 1.26 to
1.95 m high is accepted, the 21.66 m² attic bedroom has by hand 18.42 m² with 1.5 m of headroom
and 12.28 m² with 2.2 m and Grid gives neither, one attic is 49% too large in the IFC, a hip roof
is a flat box, and rooflights and dormers were refused three ways). Builds on LVL-4's roofs and
outline cutting (`planEnvelope`, `cutOutline`), LVL-1's stated levels, ARE-9's measures and
ARE-10's room height.

## Before: the findings reproduced

On the branch's base (b58930a), before any change, with the lab's plans as the scoreboard stores
them (`labPlan` by name; no lab path is committed). The lab's plans state no roof (the format had
no field for one), so each test states the roof the walls show.

- **The converted loft** (`A/scenarios/loft-sloped.json`): validation gave no error at all, and
  `w-bed-gable-corner` (west gable, sill 2.0 m, top 3.2 m, where the roof is 1.26 to 1.95 m) was
  drawn. The bedroom (`bed`) measured 21.66 m², with no figure by headroom. Its `IfcSpace` was the
  room extruded to the storey's 3.6 m: 77.98 m³, 52% over the hand volume of 51.23 m³.
- **The attic with knee walls** (`H/scenarios/h17-attic-knee-wall.json`): its attic bedroom's
  `IfcSpace` was 37.335 m² × 3.9 m = 145.61 m³, 49% over the hand volume of 97.72 m³: the lab's
  "49% too large".
- **The rooflight tries** (`H/scenarios/h15-rooflight-dormer-tries.json`): an opening on wall
  `"roof"`, one on the room `"t-bed"`, and a top-level `roofs` list with `rooflights` and
  `dormers`. The first two were refused as `opening/missing-wall` with nothing about roofs; the
  list was read as an unknown field.

The volumes were read from the IFC file itself by `packages/floorplan/src/test-support/ifcVolume.ts`,
which parses the file and integrates each body over vertical lines 1 cm apart (an extrusion, with
any half-spaces a clipping takes off it). It reads the file, not the exporter's geometry. The test
"wrote a 3.9 m box before the roof was stated, 49% over the hand volume" still holds the "before".

### The hand figures

The loft is 8 × 6 m on its walls' lines. The gable's underside rises from 1.0 m on the knee walls'
lines (y = 0 and y = 6) to 3.6 m at the ridge (y = 3): at d metres from a knee wall's line the
headroom is 1.0 + 2.6 d / 3. The bedroom is 3.8 × 5.7 m inside its walls (x 0.15 to 3.95, y 0.15
to 5.85), 21.66 m².

- At least 1.5 m: d ≥ 0.5 × 3 / 2.6 = 0.5769 m, a band 6 − 1.1538 = 4.8462 m deep: 3.8 × 4.8462 =
  **18.42 m²**.
- At least 2.2 m: d ≥ 1.2 × 3 / 2.6 = 1.3846 m, a band 3.2308 m deep: 3.8 × 3.2308 = **12.28 m²**.
- Volume: 3.8 × 2 × ∫ from 0.15 to 3 of (1 + 2.6 d / 3) dd = 3.8 × 2 × (2.85 + 1.3 / 3 × 8.9775) =
  **51.23 m³**.
- The h17 attic bedroom, 1.2 m at the knee walls and 3.9 m at the ridge, 6.55 × 5.7 m inside:
  6.55 × 2 × (2.85 × 1.2 + 0.45 × 8.9775) = **97.72 m³**.

The lab's figures only come out with the eaves on the knee walls' *lines* (their centre lines,
C1): measured from their inner faces they would be 17.49 m² and less. So a roof's eaves stand on
the outside walls' lines (see the decisions).

## Done when

| Item | Where it is shown |
|---|---|
| The attic bedroom reports 18.42 m² with at least 1.5 m headroom and 12.28 m² with at least 2.2 m (VE-5) | `packages/floorplan/src/geometry/__tests__/roofs-lab.test.ts` "reports 18.42 m² with at least 1.5 m of headroom and 12.28 m² with at least 2.2 m" (`roomHeadroom`, also lowest 1.13 m, highest 3.60 m); through the tool server, `packages/cli/src/quantities/__tests__/roofs.test.ts` "grid_areas says the bedroom's bands, and the rule they follow": `"Attic bedroom" (bedroom): 3.80 m × 5.70 m, 21.66 m²; at least 1.50 m 18.42 m², at least 2.20 m 12.28 m², headroom 1.13 m to 3.60 m` |
| A window above the roof plane is refused | `roofs-lab.test.ts` "refuses the window in the west gable that lies above the roof, and keeps the others": `opening/above-roof`, an error, "Opening "w-bed-gable-corner" reaches 3.20 m on wall "gable-w", where the roof over floor "Attic (converted loft)" cuts the wall to 1.26 to 1.95 m: it lies wholly above the roof"; "accepted that window before the roof was stated"; `grid_check` in the CLI test |
| … and the IFC volume is within 2% of the hand volume | `roofs-lab.test.ts` "writes the bedroom into the IFC with the volume under the roof, within 2% of 51.23 m³" and "writes the attic bedroom into the IFC within 2% of its 97.72 m³ by hand, not 49% over". The clipped space is exact; the 1 cm integration puts both within 0.1% |

The coordinator's other asks:

| Ask | Where |
|---|---|
| Flat, mono-pitch, gable or hip, an eaves height and a pitch or ridge height | `floors[].roof` (`RoofSchema` in `types/floorplan.ts`); its planes in `geometry/roofs.ts` (`floorRoofShape`); where it stands in `types/roofFrame.ts`. `roofs.test.ts` "the roof a floor states" |
| Walls trimmed to it; every consumer of a rectangular wall | `wallTopProfile` (`roofs.ts`). The meshes: `wallElevation` takes the cut top (`scene3d.ts`), `wallMesh` and the viewer extrude any outline; the IFC wall: an `IfcBooleanClippingResult` per roof plane over its extrusion, `Clipping` (`writeWall`); the opening check: `opening/above-roof` (`validate.ts`); the storey height: `tallestDrawnWall` (`elevations.ts`) and the IFC's `deriveLevels` read `wallPeak`. Also the wall's revision (the viewer's mesh cache) and the take-off's wall faces. Tests: `roofs.test.ts` "the walls under it", `roofs-lab.test.ts` "draws its gables as gables" |
| Room heights trimmed to it | a room's ceiling is the roof's underside (`roomHeadroom`); `grid_measure`'s room height comes `from: "roof"`, lowest to highest; a stated flat ceiling and its lowered zones are cut to where the roof is higher (`roomCeiling`) |
| Floor area by headroom band, one more area with its rule stated | `MEASURES.headroom` (`geometry/areas.ts`) and its row in `docs/areas.md` (the test that holds them together reads the new row); `grid_areas` gives it per room, per floor and in all |
| Headroom bands as Grid's own figures in `tolerances.ts` | `headroomLow` 1.5 m and `headroomFull` 2.2 m, `limit`s, each saying "Grid's own size, not a code figure", in `docs/tolerances.md`. No document cited, no check on them |
| Rooflights and dormers as openings in the roof | Rooflights are built (below). Dormers are not: `floor/dormers-not-drawn` says they are not supported yet, and see "For the owner" |
| New codes in the catalogue, the contract's table and changelog | `opening/above-roof`, `floor/rooflight-misplaced`, `floor/dormers-not-drawn` in `packages/rules/src/result/catalogue.ts` and `docs/result-contract.md`, with a changelog entry at the top |

## What changed

- **The schema** (`types/floorplan.ts`): `floors[].roof`, optional and never defaulted, version
  still 1: `shape`, `eaves`, `pitch` or `ridge` (one, for a sloped roof; none for a flat one),
  `ridgeRuns` (gable only; unstated, along the longer sides), `highSide` (mono-pitch only, and
  needed there), `rooflights` (`id`, `at`, `width`, `length`, on the slope) and `dormers`
  (accepted, not drawn). Each wrong combination is refused by name. `COMPASS_SIDES` moved above
  the floor schema (unchanged). A solid wall that states no height, on a floor that states its
  roof, takes the roof's top in `withFloorHeights`, so it rises to the roof and is cut to it.
- **`geometry/roofs.ts`** (new, pure): the roof as planes (the underside over a point is the lowest
  sloped plane, never above the top); `roofFacets` (the plan cut into each plane's convex region),
  `regionAtLeast`, `wallTopProfile`/`topAt`/`topBetween`/`faceUnderTop`/`wallPeak`,
  `rooflightPlace`, `roomHeadroom`. `types/roofFrame.ts` (new, pure): the rectangle and its axes,
  shared with the schema.
- **Validation**: `opening/above-roof` (error, with the height that fits as its fix, MSG-7);
  `floor/rooflight-misplaced` (error; the rooflight is left out); `floor/dormers-not-drawn`
  (warning). `opening/missing-wall` on an opening whose wall names the roof, a room or a floor adds
  that a window in the roof is a rooflight in its floor's roof, and that dormers are not supported
  yet. `wall/above-storey` leaves out floors that state their roof (the roof bounds them, and its
  message's "the roof stays where the floor puts them" would be false).
- **The envelope**: `FloorRoof` gains `shape`, `pitch`, `facets` (its pieces per plane, with plan
  and slope area), `slopeArea` and `rooflights`; a stated roof's `bottom` is the floor level plus
  its eaves. A parapet stands on a flat roof only. Rooflights are cut out of their facet.
- **The 3D scene and meshes**: `ScenePiece.rise` raises a piece onto its plane; `shellMesh` and the
  viewer's `Shell3D` draw it so. `wallElevation` takes the cut top.
- **The IFC**: walls and spaces under the roof are `Clipping` bodies (half-spaces whose normal
  points into what is taken away, `AgreementFlag` false); a sloped roof is an `IfcRoof` of its type
  (`SHED_ROOF`, `GABLE_ROOF`, `HIP_ROOF`; `FLAT_ROOF` as before) over one `IfcSlab` `ROOF` of
  clipped pieces; each rooflight an `IfcOpeningElement` (`Rooflight`) voiding the roof slab, filled
  by an `IfcWindow` lying in the slope.
- **The command**: `grid_areas` (headroom, with the rule and `data.headroom`, in the output schema),
  `grid_takeoff` (a stated roof's shape, pitch, slope area, rooflights; wall faces under the cut
  top), `grid_measure` (height under a roof), the text limits (rooflight ids).
- **Rooms text**: a floor's `roof` and `parapet` are written back on a `raw floor` line and read by
  `compileRoomsText`; the read-back compares them, so a reading no longer drops them in silence
  (LVL-4's `parapet` was dropped before).
- **The scoreboard**: the `roof` capability probes LVL-6's field, `floors[0].roof`.

## Decisions

- **Where the roof stands.** On the smallest rectangle holding the outside walls' lines, turned to
  the longest of them, eaves on its sides. This is what gives the lab's 18.42 and 12.28. A plan
  turned off the drawing's axes gets the same roof (tested at 30°).
- **Heights are to the underside**, above the floor's level: the ceiling under the roof. The roof
  slab sits on the planes, as thick as LVL-4's (0.25 m), measured upright.
- **A wall is cut along its line**, level across its thickness, in the views and the IFC alike, so
  the two agree (tested: the IFC wall's volume within 1% of the 3D wall's). A wall standing outside
  the roof's rectangle is not cut.
- **A room's ceiling under a stated roof** is the roof (its top, not the storey's height, is the
  most it can be); under its own `height` when it states one, and under any lowered zone.
- **The opening check** compares the opening's top with the lowest point of the cut top over its
  width (the top is never higher in the middle of a span than the higher end, so the ends decide).

## For the owner

Each is the reversible choice, taken and recorded rather than stopped on.

- **Dormers are not built.** A dormer is a raised piece of roof with its own walls, roof and a
  window in its face: new geometry in every consumer. `dormers` is accepted on a roof and warned
  about (`floor/dormers-not-drawn`, "not supported yet"); the roof and the headroom are as if it
  were not there. A window in a dormer's face can be drawn in an outside wall raised to it.
- **The loft's bedroom door is refused too.** `d-bed` (2.0 m, y 4.9 to 5.7 on the partition at
  x = 4) stands in the same strip by the north knee wall as the lab's window, where the roof is
  1.26 to 1.95 m. Grid refuses it with the height that fits (1.26 m); the lab named only the
  window. The bedroom then has no door in the drawing, and says so.
- **A wall that states no height rises to the roof** on a floor that states one (it takes the
  ridge, then is cut). Before, it took the floor's height or 2.7 m, which would leave an open
  triangle over a gable. A floor's stated `height` is still its storey's clear height for stacking.
- **`wall/above-storey` is not asked on a floor that states its roof.**
- **One roof over L and T plans.** The planes cover the whole rectangle, so an L gets one gable
  over its bounding rectangle, cut to its outline: closed and consistent (walls meet the roof
  everywhere), but no valleys and no hip over each wing.
- **The roof's third try in h15**, a top-level `roofs` list, is still read as an unknown field
  (`plan/unknown-field`), which names the fields Grid does have but not `floors[].roof`. Pointing
  that note at the floor's roof is a small follow-up in MSG-4's wording.
- **Headroom is reported, not judged.** The bands are Grid's own figures and no check says a room
  is high enough; a headroom rule would be a figure from a building code, in `packages/rules`, with
  a source someone was allowed to read.
- **`grid_areas` gives the bands only on floors that state their roof**: a floor with level
  ceilings would give the whole room twice, so the line is left out there.
- **Codes are named by their part**: `floor/rooflight-misplaced` and `floor/dormers-not-drawn`, as
  every other code is named by the entity it is about (the brief left the names open).
- **The 3D still of a single floor has no roof**, as LVL-4 decided for one floor alone; a plan of
  several floors shows it. The loft (one floor) is drawn open from above with its gables.

## Not built

- Dormers (above); a roof's **overhang** and a flat roof's **fall** (a fall is a mono-pitch roof
  with a small pitch); **valleys** over L and T plans; a ceiling plane separate from the roof (a
  room's sloped ceiling under a different roof); a parapet on a sloped roof.
- **Rooflights in the checks**: no check counts a rooflight as a room's window (daylight, escape),
  so an attic room lit only by rooflights still has no window to the checks.
- **ARE-13's estimate** (`for=estimate`) keeps its own `planShell`, whose outside face is length ×
  height and whose roof is flat; making it read the envelope is LVL-4's open follow-up.
- `grid_describe` does not say the roof yet; the DXF is a plan and has no roof.
- A rooflight in a flat roof the floor states is cut from the slab's body and also voids it in the
  IFC (the void passes through the hole): harmless, but not the IFC habit of an uncut body.

## Expected figures, golden files and snapshots changed

No IFC golden file changed: no golden plan states a roof, and a plan without one writes the same
entities as before (the wall extrusion, the space height and the flat roof slab take the same
paths). No snapshot changed.

Existing tests changed, and why:

- `geometry/__tests__/tolerances.test.ts`, "holds the size a person passes through as Grid's own …":
  the list of entries that carry "Grid's own size, not a code figure" gains `headroomLow` (1.5)
  and `headroomFull` (2.2); the title names the headroom bands.
- `geometry/__tests__/areas.test.ts`: the measures-table test reads the new "Area by headroom" row
  (its line filter gains the name); the per-floor sum test indexes the three area totals directly,
  since `Measure` now includes `headroom`.

New tests: `geometry/__tests__/roofs-lab.test.ts` (8), `geometry/__tests__/roofs.test.ts` (18),
`packages/cli/src/quantities/__tests__/roofs.test.ts` (7), and the IFC reader
`test-support/ifcVolume.ts`.

A bug found on the way and fixed before the commit: where two roof planes and the top meet at the
ridge, rounding put their crossings a hair apart (3 ± 4e-16 m along the wall), each looked in line
with its twin, and all were dropped, so h17's gables came out as 1.2 m strips. Crossings closer
than `joint` are now one, and each point is checked against the last one kept;
"draws its gables as gables" holds it.

## Pictures

Rendered with `drawStill` (the 3D still), before and after stating the roof: the loft (its gables
and partitions cut to the gable, open from above as one floor), the h17 house (gables, and its
gable roof over the attic in place of a flat box) and h13 (one floor, its hip roof cuts no wall,
so it looks as before). Kept beside the session, not committed.

## The scoreboard

One count moved, stored in `scoreboard/current.json` in its own commit: **checks the plan can
feed, 15 → 16**. The capability `roof` ("holds a roof") is now `yes`: its probe asks for LVL-6's
field, a floor's `roof` with a shape, eaves and pitch, in place of the lab's top-level `roof`,
which the schema has never had. That feeds check 6, "height under a sloping roof or a beam". Fed
means the plan can hold what the check needs, not that Grid judges it: no headroom is checked.
Check 39 (building height and storeys) still waits on `site`. Every other count is unchanged:
rooms measured wrong 197, damage silent 278, turns 16, mistakes named 5, rooms not measured 735,
sound plans with a warning 95.

## The checks run

Each once, at the end, in this order:

| Check | Result |
|---|---|
| `npm run build` | passed, exit 0 |
| `npm run typecheck` | passed, exit 0, every workspace, `scripts` and `scoreboard` |
| `npm run lint` | passed, exit 0, no problems |
| `npm run check:licenses` | "Checked 363 licences in package-lock.json: none is GPL, LGPL, AGPL, MPL, EPL." |
| `timeout 1500 npx vitest run --exclude '.claude/**' --maxWorkers=2 --minWorkers=1` | 264 files; 4,993 passed, 4 skipped, 1 failed (1,097 s): the scoreboard test, on checks fed 15 → 16 not yet stored |
| `npm run scoreboard` | "Better than the stored figures": checks the plan can feed 15 → 16, the rest the same; stored with `--write-current` |
| `scoreboard/__tests__/scoreboard.test.ts` alone, after storing | 1 file, 19 tests passed |
