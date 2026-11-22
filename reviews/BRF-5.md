# BRF-5 review: which rooms get the sun, as a table

For the owner. `grid_measure` takes `what=sun` and answers "which rooms get the sun" with a table
per room, as geometry and not a daylight result: each window wall's compass direction (a
bearing and one of the eight points), the window area against the floor area, and how deep the
room runs from each window wall. North is read from the plan as `what=facing` (CNT-3) reads it;
a plan that states none is answered with north as the top of the drawing, said on the line after
MSG-3's label. No new tool.

## What changed

1. **The geometry** (`packages/floorplan/src/geometry/sun.ts`, exported from the geometry index).
   `planSunTable(plan)` gives every room with an outline, in plan order: its floor, net floor
   area (`roomFloorArea`, the same net area `grid_areas` gives), the windows in its window walls
   added up, their ratio to the floor area, and its window walls clockwise from north. It builds
   on `planFacing`: a window wall is a stretch of outside wall `planFacing` found, behind the
   room, with a window whose middle is in it; it faces the stretch's `faces` and `bearing`.
   - A window's area is its hole, `width × height`, as the plan holds it; no frame is taken off.
     Doors and doorless openings are not counted, glazed or not.
   - **Depth from a window wall**: the distance, square to the wall, from its inside face (the
     wall's centre line moved half its thickness into the room) to the farthest point of the
     room's floor. The farthest point of a polygon from a line is a corner, so it is the greatest
     of the outline's corners' distances. An L-shaped room is as deep as its far leg.
   - Pure, no tolerance of its own: no new entry in `tolerances.ts`.
2. **The wording** (`packages/cli/src/quantities/sun.ts`). `sunAnswer` writes the table: the
   north line (`northLine`, shared with `what=facing`), a title line, then for each room one
   line with its floor area, window area and the percentage, and one line per window wall with
   its way, bearing, windows and depth. Every table line starts "Geometry,"; names and ids are
   quoted, so a plan's own words never trip MSG-3's word test. `SUN_RULE` closes the answer and
   says what each figure is, in Grid's own words, and that no sun path, shade, sky, glass or
   reflection is worked out and no rule is checked. Figures follow `units` and `decimal`.
   `facing.ts` gains `northData`, the north and y data both answers share (no change to
   `what=facing`'s answer).
3. **The tool** (`packages/cli/src/mcp/readTools.ts`). `grid_measure`'s `what` gains `sun`, which
   takes `room` only (any other argument is refused by name, as for every `what`); its
   description says when to use it. A room with no outline Grid can measure is refused.
4. **Docs and records.** `docs/tool-server.md`: the tool table's `grid_measure` row, and a new
   section, "Which rooms get the sun: a table of geometry", with the columns, the depth rule, the
   no-north case and the two-bed flat's lines. `docs/plan-file.md`: one sentence after "Which way
   the rooms face" pointing to it. `CHANGELOG.md` (Unreleased) and the agents' changelog at the
   top of `docs/result-contract.md`. No CLI command changed, so `docs/commands.md` is as it was;
   no argument takes a path, so `everyPath.e2e.test.ts` is unchanged.

## Done when

**A table per room gives each window wall's compass direction, the window area against the
floor area and the depth from the window, labelled as geometry and not a daylight result; a test
on the two-bed flat with a stated north checks it, and every line passes MSG-3's word test.**

- `packages/cli/src/mcp/__tests__/sun.test.ts`, "gives the two-bed flat with a stated north a
  table per room: way, window area against floor area, depth": the flat with `"north": 30`
  gives six rooms; the living room 18.48 m² with 4.52 m² of window (0.245), its south window
  wall facing south-west at 210° and 4.20 m deep, its west one north-west at 300° and 4.40 m
  deep; bedroom 2 south-east at 120°, 3.00 m deep; the hall with no window. The label is the
  first line, the stated north the second, every table line starts "Geometry", the rule line
  says it is no daylight or sunlight result, and `approvalWords` finds nothing on any line.
- The same file: "says first that north is the top of the drawing when the plan states none"
  and "answers for one room, in the units asked, and refuses what sun does not take".
- `packages/floorplan/src/geometry/__tests__/sun.test.ts`: the windows grouped by wall and added
  up, the depth on an L-shaped room (5.80 m from the long wall, 2.80 m from the leg), the ways
  turned by a stated north with the depths and areas kept, and a room with no window.

The two-bed flat with `"north": 30` (text after the label, rule line left out):

```text
North, as the plan states it: 30° counter-clockwise from the top of the drawing (north 30).
Geometry, not a daylight result: each room's window walls, the way each faces, the window area against the floor area, and how deep the room runs from each window wall.
Geometry, "Living room" ("living"): floor 18.48 m², windows 4.52 m², 24.5% of the floor area, in 2 window walls.
Geometry, "Living room" ("living"), window wall "ext-south": faces south-west (bearing 210°); windows "win-living-south" 1.80 m wide × 1.50 m high, 2.70 m²; the room runs 4.20 m deep from its inside face.
Geometry, "Living room" ("living"), window wall "ext-west": faces north-west (bearing 300°); windows "win-living-west" 1.40 m wide × 1.30 m high, 1.82 m²; the room runs 4.40 m deep from its inside face.
Geometry, "Kitchen" ("kitchen"): floor 13.20 m², windows 1.32 m², 10.0% of the floor area, in 1 window wall.
Geometry, "Kitchen" ("kitchen"), window wall "ext-west": faces north-west (bearing 300°); windows "win-kitchen" 1.20 m wide × 1.10 m high, 1.32 m²; the room runs 4.40 m deep from its inside face.
Geometry, "Hall" ("hall"): floor 5.33 m², no window in an outside wall.
Geometry, "Bedroom 1" ("bed1"): floor 13.64 m², windows 1.82 m², 13.3% of the floor area, in 1 window wall.
Geometry, "Bedroom 1" ("bed1"), window wall "ext-south": faces south-west (bearing 210°); windows "win-bed1" 1.40 m wide × 1.30 m high, 1.82 m²; the room runs 3.10 m deep from its inside face.
Geometry, "Bathroom" ("bath"): floor 4.80 m², windows 0.42 m², 8.8% of the floor area, in 1 window wall.
Geometry, "Bathroom" ("bath"), window wall "ext-east": faces south-east (bearing 120°); windows "win-bath" 0.60 m wide × 0.70 m high, 0.42 m²; the room runs 3.00 m deep from its inside face.
Geometry, "Bedroom 2" ("bed2"): floor 7.20 m², windows 1.56 m², 21.7% of the floor area, in 1 window wall.
Geometry, "Bedroom 2" ("bed2"), window wall "ext-east": faces south-east (bearing 120°); windows "win-bed2" 1.20 m wide × 1.30 m high, 1.56 m²; the room runs 3.00 m deep from its inside face.
```

## Gates

Run on a laptop shared with about ten other sessions, with `--maxWorkers=2 --minWorkers=1`.

| Gate | Result |
| --- | --- |
| `npm run build` | passes; `packages/cli/dist/grid.mjs` is **443,807 bytes**, under the 500 kB cap of `grid.e2e.test.ts`, which is unchanged |
| `npm run typecheck` | passes (every workspace, `scripts`, `scoreboard`) |
| `npm run lint` | passes |
| `npm run scoreboard` | **Same as the stored figures**: lab plans 194 rooms wrong of 16,542, 735 not measured; damage silent 278 of 3,000; 95 of 442 sound plans with a warning; turns 16 of 67, checks 15 of 42, mistakes 5 of 9. Nothing to store |
| Full suite (`vitest run --exclude '.claude/**'`) | 277 files, **5,123 passed, 4 skipped, 0 failed**, in 1,043 s |

## Tests

- New: `packages/cli/src/mcp/__tests__/sun.test.ts` (3) and
  `packages/floorplan/src/geometry/__tests__/sun.test.ts` (4).
- Changed: none. `what=facing`'s answer is the same, so `facing.test.ts` is untouched.
- Removed: none.

## For the owner

1. **Where the table lives: `grid_measure what=sun`**, not `grid_schedule of=windows` and not a
   new tool. It reads the same outside walls and north as `what=facing` and measures rooms as
   `what=room` does, and a schedule is a list of parts by type and size, not of rooms. The tools
   stay 26 and their order is unchanged. Moving it is a rename of one `what` value.
2. **Eight points, not sixteen.** `faces` is one of the eight points `what=facing` already uses,
   so the two answers never name the same wall two ways; the bearing in degrees is beside it on
   every line for anyone who wants it finer. Sixteen would need a second compass list.
3. **What "depth from the window" is**: square to the window wall, from its inside face to the
   farthest point of the room's floor, one figure per window wall. Alternatives: from the window
   itself rather than the wall's line, or along the room's floor only within the window's width.
   The chosen one needs no tolerance and reads the same for every window in one wall.
4. **What "window area" is**: the hole in the wall, width by height, with no frame taken off,
   counting windows only. Doors and doorless openings are left out because the plan does not say
   which are glazed. A glazed door would need a field in the format first.
5. **The ratio is against the net floor area**, as `grid_areas` gives it, shown as a percentage
   with one decimal, rounded half up on the figure as written (0.42 / 4.80 is 8.8%, not the 8.7%
   a float's 0.08749… would give). The data holds the ratio to three decimals.
6. **A window belongs to the room behind the stretch its middle is in**, as `what=facing` places
   it. A window that straddles two rooms' stretches of one wall counts for one room.
7. **Rooms with no outside window are listed** with their floor area and "no window in an
   outside wall", so the table covers every room. Leaving them out is the alternative.
8. **The wording**: every table line starts "Geometry,", the title says "not a daylight
   result" and the rule line "not a daylight or sunlight result"; no daylight standard, method or
   figure is named anywhere, and nothing says a room has enough light.

## Not done or not verified

- No CLI command answers it: `grid` has no `measure` command, and none was asked for.
