# HND-2 review: an IFC with room data, areas, quantities and materials

For the owner. What HND-2 adds, how each done-when item is met, every expectation that changed,
the choices made without you, and what is left for later items (HND-5, HND-16, CNT-4, CNT-14,
CNT-15, LVL-4).

## What HND-2 adds

The IFC exporter (`packages/floorplan/src/geometry/export/ifc.ts`) now writes facts the plan
already holds into fields IFC2x3 already has. Nothing new goes into the plan format.

| Element | What it carries now |
|---|---|
| Room (`IfcSpace`) | `Name` = its number, `LongName` = its name, `ObjectType` = its use (when stated). `Pset_SpaceCommon`: `Reference` (number), `Category` (use, when stated). `Grid_Space`: `Id`, `Number`, `Use` (`not said` when none), `Area`, `AreaMeasure` (`Net area`) and `AreaRule` (ARE-9's rule, from `MEASURES.net`). `Qto_SpaceBaseQuantities`: `Height`, `GrossPerimeter`, `GrossFloorArea` (the footprint), `NetFloorArea` (ARE-9's net, the rule in its description), `GrossVolume` |
| Wall | `Qto_WallBaseQuantities`: `Length`, `Width`, `Height`, `GrossFootprintArea` (corners joined), `GrossSideArea`, `NetSideArea`, `GrossVolume`, `NetVolume`. An `IfcWallType` per stated kind and thickness (`Exterior wall 0.3 m`, tag `wall:exterior:0.3`) carrying its `IfcMaterialLayerSet`; the wall carries the set's usage, as before. One `IfcMaterial` per kind |
| Slab and roof | `Qto_SlabBaseQuantities`: `Width` (thickness), `Perimeter`, `GrossArea`, `GrossVolume`. `Grid_Slab`: `Assumed` = true and a `Note` saying the plan holds no slab or roof |
| Stair landing | `Qto_SlabBaseQuantities` (not marked assumed: the stair is stated) |
| Door, window | `Qto_DoorBaseQuantities` / `Qto_WindowBaseQuantities`: `Width`, `Height`, `Area`. An `IfcDoorStyle` per size and handing, an `IfcWindowStyle` per size (tags `door:0.9x2.1`, `window:1.2x1.2`) |
| Doorless opening | `Qto_OpeningElementBaseQuantities` on its `IfcOpeningElement`: `Width`, `Height`, `Depth`, `Area` |
| Site | Its placement holds the move of a plan drawn far from the origin (below) |

**Room numbers** moved into the library: `roomNumbers(plan, floors?)` in
`packages/floorplan/src/geometry/roomNumbers.ts` (floors by level, then by id; rooms by
`compareIds`; 1, 2, 3… across floors). `roomSchedule` in `packages/cli/src/quantities/schedule.ts`
now takes its numbers from it, so the schedule and the IFC give every room the same number.

**Near the origin**: a plan whose walls reach more than `farFromOrigin` (500 m) from the origin is
moved by whole steps of 500 m so the middle of its walls lies within 250 m of the origin; the
move is the `IfcSite` placement, so every element keeps its world position and its own
coordinates stay small. A plan near the origin is written exactly as before (no golden moved for
it). A plan holding a coordinate past `largest` is not moved, so the move cannot bring back a
part validation refuses.

**Storey**: one is always written; this was already true (`planFloors` always gives at least the
ground floor) and is now asserted for every plan in the structural test.

HND-6's `Grid_LeftOut`, LVL-3's stairs, CNT-12's fixtures and MSG-3's label are unchanged.

## The done-when items

1. **Rooms carry a number, a use and an area with the rule named; walls, slabs, spaces and
   openings have base quantity sets.** In the bench's two-bed flat (lab EX-2: name only, 0
   quantity sets), Bedroom 1 is space `2`, use `bedroom`, 13.64 m² net with `AreaMeasure`
   `Net area` and the rule's sentence; the six rooms are numbered 1 to 6 and add up to the
   flat's 62.65 m². The flat's file has 40 quantity sets (was 0). **Flats are zones**: the plan
   format holds no flats (CNT-4), so no `IfcZone` is written, and a test says so.
2. **Walls carry a material per type**: every wall in every file has exactly one layer set usage
   and one `IfcWallType`, whose layer set is the usage's set and whose layer names a material.
   **Every lab IFC passes an IFC check**: the lab's checker (`lab/K/tools/check_ifc.py`) is
   IfcOpenShell, which is not in the repository and not installed here, so a structural test
   stands in for it (`ifc.structure.test.ts`, below). As a second reader, every fixture's IFC
   (22 files) was opened with the lab's own copy of web-ifc 0.0.79 (`lab/K/tools/node`): all
   opened, all built meshes, every quantity set read back with its quantities, every file had a
   storey. That run is not part of the repository.

### The structural test

`packages/floorplan/src/geometry/export/__tests__/ifc.structure.test.ts` writes the IFC of 27
plans: every `packages/floorplan/fixtures/*.json` (8), `packages/cli/fixtures/*.json` (5),
`packages/floorplan/fixtures/rooms/*.plan.json` (9), four test-support plans (a stair, a genkan,
a stage, a fixture) and the two-bed flat moved to survey coordinates. Each file is read with the
strict STEP reader, then:

- every `#n` points at a defined entity; every GlobalId is unique and well formed;
- `IfcRelAggregates` joins project-site, site-building, building-storey, storey-space and
  stair-flight/landing only; `IfcRelContainedInSpatialStructure` puts walls, doors, windows,
  slabs, fixtures and stairs in storeys only; `IfcRelDefinesByProperties` joins objects to
  property sets (single values only) or `Qto_…BaseQuantities` sets (method `BaseQuantities`,
  quantities of length, area or volume, each finite and not negative); `IfcRelDefinesByType`
  joins wall types to walls, door styles to doors and window styles to windows;
  `IfcRelAssociatesMaterial` joins usages to walls and layer sets to wall types; voids join walls
  to openings and fills openings to doors or windows;
- at least one storey, each in the building; every element in exactly one storey (a landing in
  its stair instead);
- each space: `Pset_SpaceCommon`, `Grid_Space` and `Qto_SpaceBaseQuantities`; its `Name`, its
  `Reference` and `Grid_Space.Number` are `roomNumbers` for that room; its area equals ARE-9's
  `planAreaFigures` net for that room (to 1e-6 m²) and `NetFloorArea`;
- each wall: `Pset_WallCommon`, its base quantities (net volume not above gross), one usage, one
  type, the type's layer set is the usage's, the layer names a material;
- each slab its quantities and, when it is not a landing, `Grid_Slab.Assumed`; each door and
  window its quantities (equal to its overall size) and its style; each doorless opening its
  quantities.

Plus: the far plan's site holds the move, in whole steps of 500 m, and no other point is 500 m
out; its quantities, numbers and names equal the flat's at the origin. And five tests on the
two-bed flat, line by line.

## Expectations changed

- **The four IFC golden files** (`geometry/export/__tests__/golden/*.ifc`) were written again on
  purpose. Compared entity by entity with references blanked, against `main`: no geometry entity
  (point, placement, profile, solid, shape) and no wall, opening, door, window, slab or storey
  changed; what changed is each `IfcSpace` (Name now the number), the material and layer set
  (named after the kind) and the material association (keyed by type); what was added is the
  quantity sets, property sets, wall type, door and window styles and their relations. Entity
  numbers move because of the additions.
- `ifc.test.ts`: the STEP reader moved, unchanged, to `step-reader.ts` (the structural test
  uses it too). Space helpers (`spaceByName`, `spaceStoreys`, a new `roomNamesOf`) read the
  room's name from `LongName`. `exports each room as a space named after it` is now `…numbered
  and named after it` and expects `Name` `1`; the two name-safety tests expect the name in
  `LongName`. `Pset_WallCommon`'s helper picks that set among the wall's sets. Material tests:
  usages are read from wall relations only; one material `Interior wall` instead of `Wall`; layer
  sets `Interior wall 0.2 m` / `0.3 m` instead of `Wall 0.2 m` / `0.3 m`; `writes nothing when
  there is no wall` also expects no wall type. Door tests: the style helper skips wall types;
  `leaves an undecided door untyped and unturned` is now `HND-2 types an undecided door by its
  size with no handing, and leaves it unturned`; `writes no door style for a plan with no stated
  swing` is now `HND-2 writes one door style with no handing…`; style names are `Door 0.9 x 2.1
  m, single swing, left` instead of `Single swing, left`. New: wall types and materials; doors of
  another size and windows by size.
- `packages/floorplan/src/test-support/pinned-tests.md` records the above.
- No other expectation changed. `grid_schedule`'s rows are identical (tested against
  `roomNumbers` and the IFC for the flat and the tiny house, and with the file reversed).

No tool's answer changed (`grid_export` answers as before; only the file it writes holds more),
so there is no entry in the agents' changelog; `CHANGELOG.md` has a line under "Unreleased", and
`docs/commands.md` a section "What the IFC holds (HND-2)".

## For the owner

1. **A space's `Name` is its number and `LongName` its name**, the way BIM tools read a room's
   number and name. Before, both were the name. A reader that took `Name` as the room's name now
   sees `1`, `2`…
2. **Use**: `ObjectType` and `Pset_SpaceCommon.Category` only when the plan states one;
   `Grid_Space.Use` is always there, `not said` when the plan has none (the areas' words).
3. **Area**: ARE-9's net, through `roomFloorArea`, the one function `planAreaFigures` uses for a
   room's net, rather than calling `planAreaFigures` (which also works out the gross areas of
   every floor, with polygon joins). The test holds the two equal on all 27 plans.
   `GrossFloorArea` is the space's footprint (outline less holes), the IFC field's meaning, not
   ARE-9's gross internal or external, and its description says so.
4. **Numbers with a floor filter**: `grid_schedule` with `floors` still numbers the floors asked
   for from 1, as before, while the IFC numbers the whole plan. So the schedule of the first floor
   alone can say `1` where the IFC says `5`. Numbering always over the whole plan would make them
   agree; that changes a tool's answer, so I left it.
5. **No zones**: the format holds no flats. `fixtures/rooms/four-flats` names its flats only in
   room names ("Flat A Bathroom"); nothing is inferred from names. Zones wait for CNT-4.
6. **IFC2x3 has `IfcDoorStyle`/`IfcWindowStyle`**, not `IfcDoorType`/`IfcWindowType` (IFC4), so
   the styles are the types. Grouped by kind, size (hole width × height) and, for doors, handing,
   because IFC2x3 keeps a door's operation on its style. A door with no stated swing is now typed
   by size (`swing not stated`, operation `NOTDEFINED`); before it was untyped. Door style
   GlobalIds changed (their key now holds the size), so an earlier export's styles are not
   recognised as the same.
7. **Wall types by stated kind and thickness**, the grouping ARE-13's estimate prices
   (`wall:exterior:0.35`); the tag is that key. The material is a placeholder named after the
   kind (`Exterior wall`, `Interior wall`, `Partition`), one layer, and the type's description
   says the plan holds no build-up. `IsExternal` stays the worked-out exposure (MSG-13), so a wall
   stated `interior` that faces outside is an `Interior wall` type with `IsExternal` true.
8. **Slabs stay per room** (superseded by the LVL-4 merge: item 14), under each room's footprint, as the views draw them; I did not
   switch them to `planShell`'s floor outline, which would put slab under the walls and make the
   IFC differ from the 3D view. So the IFC's slab areas add up to the rooms' footprints, while
   the estimate's slab line (`planShell`, gross external) includes the walls. Both say assumed.
9. **Wall side area** is the axis length times the height, one side; openings are taken off at
   their full size, as the estimate does. The footprint is the body's, corners joined (SHT-2).
10. **Doorless openings** carry `Qto_OpeningElementBaseQuantities`, a name IFC4 defines; IFC2x3
    has no base quantity set for an opening element. A checker that knows only 2x3's sets may not
    recognise it (it is still a valid property set). Door and window voids carry none: their
    door or window does.
11. **The origin move** uses `farFromOrigin` as both the trigger and the step, so no new figure
    was added to the tolerance table. Whether Revit or Archicad read the site placement as the
    shared position is for the person opening the files (HND-5).
12. **Found on the way (lab MS-12)**: at survey coordinates (about 4,000 km from the origin)
    ARE-9's net area of a 4.8 m² room comes out 4.8003 m²: the arithmetic runs out of digits.
    The IFC, written near the origin, gives 4.8. Not fixed here.
13. The structural test lives in `packages/floorplan` and reads `packages/cli/fixtures` by path,
    so the CLI's plans are checked by the exporter's own test. No dependency was added.
14. **Slabs after LVL-4**: the file now has LVL-4's slabs only (one per floor over its outline,
    pieces for rooms set above or below their storey, the roof's slab), each with HND-2's
    `Qto_SlabBaseQuantities` from LVL-4's geometry. The plan still states no slab or roof
    outline, so I kept `Grid_Slab.Assumed` true on every one, as the take-off marks every slab
    and roof line assumed, and added `ThicknessStated` (true where the floor states `slab`, and
    for a raised room's fill, whose thickness is its stated offset). If a stated thickness should
    clear `Assumed`, that is a one-line change. The `IfcRoof` carries no quantities (IFC2x3 has
    no roof set; its slab does), and a ceiling's set has its area only, since its 0.02 m depth is
    drawn, not the plan's.

## What's left

- Zones for flats (CNT-4), real door and window types (CNT-14), materials and wall build-ups
  (CNT-15), stated slabs and roofs (LVL-4): each will replace the placeholder written here.
- The rebuild file and script (HND-16), after a person has opened the files (HND-5).
- Running the lab's IfcOpenShell checker on these files, which needs IfcOpenShell installed.

## Checks run

On `main` at ef88ec9 plus this branch:

- `npm run build`, `npm run typecheck`, `npm run lint`: clean.
- `npx vitest run --exclude '.claude/**' --maxWorkers=2 --minWorkers=1`: 4,803 passed, 4 skipped
  (timing guards), of 4,807 in 246 files (499 s). No failure.
- `npm run scoreboard`: 197, 278, 16, 5, 11, 735, 95. Same as stored.

After merging `main` at 0b8b641 (SHT-4), with no conflict: build, typecheck and lint clean; the
affected tests (`packages/floorplan/src/geometry/export`, `src/export`, `roomNumbers`,
`tolerances`, `areas`, the CLI's `schedules`, `exportTool`, `grid.e2e` and the sheet tests)
passed, 654 of 654 in 23 files.

After merging `main` at 25747b7 (CNT-3, CNT-5, SHT-11, CNT-13): conflicts in `ifc.ts`,
`docs/commands.md` and the four IFC goldens. In `ifc.ts` the header keeps CNT-3's y-down note and
HND-2's paragraph, and the site placement combines the two: the elements are written moved by
`nearOrigin`'s step, the site sits at the plan's stated `site.origin` (CNT-3) or, with none, at
the step, and the building's placement is the step less the site's point, so site plus building
is the step and every element is where the plan puts it. With no step it is CNT-3's placement,
with no site HND-2's; the latitude, longitude, elevation and true north are CNT-3's. A new test
in `ifc.structure.test.ts` holds a stated site at survey coordinates to that. `commands.md` keeps
HND-2's IFC section, with one line on the stated site, before MSG-10's `grid check` section.
The goldens were regenerated from the merged code: against `main` they differ only by HND-2's
additions, with the net area rule's wording now SHT-11's. Build, typecheck and lint clean; the
affected tests (the floorplan geometry, export, types and rooms tests, the CLI's MCP, quantities,
sheet, draw, `everyPath`, `exportName`, `grid.e2e` and `coverage`, the rules' result tests and
the scoreboard's) passed, 3,515 with 4 skipped, of 3,519 in 145 files. `npm run scoreboard`:
197, 278, 16, 5, 14, 735, 95, the same as stored.

After merging `main` at b58930a (LVL-4): conflicts in `ifc.ts` (`writeSlab`) and the four IFC
goldens. LVL-4's slabs, roof, parapet, slab openings and ceilings are kept as main writes them, and
HND-2's per-room slabs are gone, so no floor has two slabs. HND-2's slab quantities are taken from
LVL-4's slab bodies (net area and volume where a stair, lift or void opens the slab), landings
keep theirs, and `Grid_Slab` says each slab is assumed, whether its thickness is stated, and what
Grid took (item 14). Slab openings, ceilings and parapets gained base quantities. Everything goes
through `nearOrigin`, since `writeSlabs` reads the moved plan. `ifc.structure.test.ts` now
admits and checks the roof, its slab, the parapet, ceilings with the spaces they cover and slab
voids, one floor slab per storey, and a new plan with a parapet, ceilings, a void and a sunken
room. Regenerated goldens against `main`, entity numbers and GlobalIds stripped and lines
compared as multisets: only HND-2's additions (space names, materials, quantity sets, types and
styles, `Grid_Space`, `Grid_Slab`) and one material relation's GlobalId (HND-2's); no slab, roof
or geometry line differs. Build, typecheck and lint clean; the export tests, `schedules`, the
envelope tests and `roomNumbers` passed, 422 of 422 in 13 files. The full suite and the
scoreboard were not run.
