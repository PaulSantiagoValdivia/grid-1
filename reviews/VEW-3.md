# VEW-3 review: a camera an agent can set, saved as a named view

For the owner. What VEW-3 adds, how each done-when item is met, every expectation that changed,
the choices made without you, and the checks run. Lab findings: SE-4 (no camera an agent can
set), SE-7 (a view cannot be saved or handed on), S-16 (lens in millimetres, "outside any room").

## What VEW-3 adds

**One camera record** (`packages/floorplan/src/geometry/camera.ts`, pure). `cameraRecord(plan,
setting)` turns a setting into the record every 3D picture now comes with. The setting, which is
all Grid reads back:

| Field | What it sets |
|---|---|
| `target` | `point` `[x, y, z]` in plan metres, and `room` (or null for the building) |
| `bearing` | Compass bearing from the target to the camera, clockwise; from the plan's stated north (CNT-3), or from the top of the drawing when it states none |
| `north` | The north the bearing is read from (as the plan's `north`), or null |
| `tilt` | Degrees the camera looks down (below 0, up), at most 89 |
| `distance` | Metres from camera to target, at least 0.1 |
| `lens` | `focalLength` in mm, 8 to 800, on `sensor` 36 × 24 mm |
| `cut` | The floor shown cut away, or null |

Worked out: `bearingFrom` (`north` or `plan up`, so the record says what bearing 0 means),
`eyeHeight` above `floor` (the target room's floor, else the cut, else the ground floor), `floors`
drawn, `standingIn` (`room`, `name`, `floor`, `words`: `in "Kitchen"` or `outside any room`), and
BCF's perspective camera: `position`, `direction`, `up` (no roll), `fieldOfView` (vertical,
degrees) and `aspectRatio` (1.5). Every number is rounded to a millionth, so a record sent back
gives itself again, digit for digit. z is up from the ground floor's floor level, as the 3D model
stands its floors.

**The app and the stills share it** (`packages/viewer`). `recordCamera(record)` in
`canvas3d/camera.ts` turns a record into Three's camera settings. `Canvas3D` takes `camera` (a
record) and opens at it, turning round its target; `stillScene` and `planStill` take `camera` and
are taken with the same settings. With no record both open exactly as before.

**The view call** (`grid_view kind=3d`, no new view tool). New arguments: `bearing`, `tilt`,
`distance`, `eye_height` (now also for 3d), `lens`, `room`, `camera` (a record to start from),
`view` (a saved view), `turn` and `tilt_by` (relative moves), beside `floor` and `from`.
`packages/cli/src/draw/cameraAsk.ts` turns a call into the record; `views.ts`'s `cameraView`
takes the picture from it. `kind=eye` is built on the same record (`eyeCamera`), so the eye
view's answer carries it too. The text gives the camera in two lines, where it stands, how to
move it in one call, and the plan's saved views.

**Saved views** (C11 in `types/floorplan.ts`: `views`, `ViewSchema`). Each holds its name, the
setting, `floors` and the BCF camera. A new tool, `grid_save_view` (`packages/cli/src/mcp/viewTool.ts`,
the 29th, last), saves a record by name through `writeChange`, with `replace` and `remove`.
`grid_view view=<name>`, `grid draw --view <name>` and the app (handed the record) call it up.
`grid_mirror` mirrors the saved views with the plan. `coverage.ts`: the sheet does not show them.
`planText.ts` holds a view's name to a name's limit and its cut to an id's.

**Limits** in the one table (`tolerances.ts`, `docs/tolerances.md`): `cameraTilt` (89 degree),
`cameraClosest` (0.1 m), `lensShortest` (8 mm), `lensLongest` (800 mm). Two units are new to the
table, `degree` and `mm`.

**Docs**: `docs/plan-file.md` "Saved views, and the camera record"; `docs/tool-server.md` "A
camera you can set, and saved views" and the two tool rows; `docs/commands.md` `--view` and the
tool count; `docs/tolerances.md`; `CHANGELOG.md` (Unreleased); the agents' changelog in
`docs/result-contract.md`; `AGENTS.md` (29 tools, `viewTool.ts`, where the camera lives).

## The done-when items

1. **A view call with bearing, tilt, eye height and a target room returns the picture and its
   camera record; "lower and more from the left" is one call on three buildings (SE-4).**
   `packages/cli/src/mcp/__tests__/cameraView.test.ts`, "a view call with a bearing, a tilt, an
   eye height and a target room", on the bench's two-bed flat (`packages/cli/fixtures`), the
   two-storey house and the odd house (`packages/floorplan/fixtures/rooms`). Each calls
   `grid_view kind=3d room=… bearing=200 tilt=25 eye_height=6`: a picture, and a record with that
   bearing, tilt and eye height, the distance the camera stood back to reach 6 m, the room's floor
   cut away on the two houses. Then one call, `camera=<that record> turn=20 tilt_by=-10`: bearing
   220, tilt 15, same target and distance, lower, and to the left of where the first camera stood
   as it looked. The same record with `bearing` and `tilt` changed by hand gives the same camera,
   byte for byte. Also: a bearing read from a stated north, a corner of the drawing, the eye
   view's and the default view's records, and six refusals.
2. **A named view saved and called up again gives the same camera record, byte for byte.**
   Same file, "a view saved by name": on each of the three buildings, `grid_save_view` then
   `grid_view view=…` (in other capitals); `JSON.stringify` of the record called up equals the
   one saved, and the file holds the setting and the BCF camera with every other key as it was.
   Replace, remove and mirror are tested there too. In the library, `camera.test.ts` holds a
   record sent back to itself on three plans (one with a stated north), and a view saved before
   the plan's north changed keeping its place. `grid.e2e.test.ts` draws a saved view with
   `grid draw --view`.
3. **A camera outside every room says so (S-16).** `cameraView.test.ts`, "a camera outside every
   room": a 3D camera outside the flat says `outside any room` (data and text); the eye view says
   `in "Living room"`; the eye camera sent back 30 m away says `outside any room`.
   `camera.test.ts` holds `cameraPlace` to it outside the walls, inside a wall, above the storey
   and under the floor.

Also `packages/viewer/src/still/__tests__/sameCamera.dom.test.tsx`: for two records the app's
canvas opens at the record's position, lens and pivot, and the still's camera is the app's, number
for number, looking along the record's direction with its up.

## Expectations changed

- `packages/cli/src/mcp/__tests__/tools.test.ts`: `grid_save_view` added last to `ORDER` and to
  `CHANGES_PLAN`; the tool limit 28 → 29 (26 → 27 before merging WRT-8, 24 before merging CNT-9), with its reason; a call for it in `CALLS`.
- `packages/cli/src/mcp/__tests__/server.test.ts`: 28 → 29 tools (26 → 27 before merging WRT-8).
- `packages/cli/src/mcp/__tests__/checkView.test.ts`: the refusal of `ids` with `kind=3d` now
  lists the 3d arguments (`floor, from, bearing, tilt, distance, eye_height, lens, room, camera,
  view, turn, tilt_by`).
- `packages/cli/src/command/__tests__/everyPath.e2e.test.ts`: slots for `grid_save_view`'s
  `plan` and `out`.
- `packages/rules/src/result/__tests__/result.test.ts`: the plan's fields named to an unknown
  field now include `views`, between `marks` and `display`.
- What `grid_view` answers (agents' changelog): `camera` is the record in place of
  `{ at, heading, tilt, fov }` (the old `tilt` was negative looking down; the new one is positive),
  `view` is new, and `eye_height`'s schema range is 0 to 10,000 (kind=eye still refuses outside
  0.3 to 3). The default 3D view is framed as before (same bearing, tilt, distance and 45° lens);
  its camera's near plane is 0.05 m, as the eye view's was, where it was 0.1.

## For the owner

1. **A new tool for saving, not an argument of `grid_view`.** Saving writes the plan file;
   `grid_view` is read-only, and hosts approve read-only tools without asking. Folding saving in
   would have made every picture call a write. So `grid_save_view` is the 29th tool, last, marked
   as changing the plan. Reversible: it can move into `grid_view` (losing its read-only hint) or
   into `grid_preview` later.
2. **`from` stays a side of the drawing; `bearing` is a compass bearing.** Every Grid argument
   calls the drawing's top north, so `from: 'south-east'` is still the drawing's corner. A numeric
   `bearing` is read from the plan's stated north, and the record's `bearing` always is (with
   `bearingFrom` `plan up` when none is stated). The text names both. Say if `from` should follow
   the stated north instead.
3. **A saved view keeps its target point.** It does not follow its room when the room moves or the
   building is stretched; only `grid_mirror` moves views. Following the room would make a called-up
   view differ from the one saved.
4. **The sensor is fixed at 36 × 24 mm** and the picture at 3 by 2 (1200 × 800); only the focal
   length is an argument. The default lens is 28.970563 mm, the app's 45° opening lens, not a round
   focal length, so the 3D view's framing did not change.
5. **"Lower" is `tilt_by`** (the camera comes down its arc at the same distance) and **"left" is
   `turn`**, positive to the camera's own left. "Lower" could also mean a lower eye height: an
   agent can send `eye_height` with the record.
6. **`eye_height` with a 3D camera**: with a tilt and no distance the camera stands back until it
   is that high; level, or with a distance, the target point moves up or down to meet it.
7. **A room target is the middle of its floor, half way up its storey**, and on a plan of several
   floors that room's floor is cut away unless `floor` says otherwise.
8. **BCF**: the record carries BCF's perspective camera in the plan's coordinates (z from the
   ground floor's floor level; a one-floor plan stands at 0, as the 3D view stands it). No
   `.bcfzip` is written and no BCF reader was run: the record is convertible, not exported.
9. **The app**: `Canvas3D` opens at a record handed to it (initial-only, as its opening camera is).
   Nothing in this repository yet lets a person pick a saved view in the app, and `grid_preview`
   does not take one; a person calls one up with `grid draw --view`.
10. **A view that cannot be read leaves the plan's whole `views` out** (`plan/value-left-out`), as
    MSG-6 does with any top-level value; the rest of the plan is read.
11. **Not done from S-16**: a camera marker with its field of view drawn on the plan.

## Checks run

On `main` at bd2f6a7 plus this branch:

- `npm run build`, `npm run typecheck`, `npm run lint`: clean.
- `vitest run --exclude '.claude/**' --maxWorkers=2 --minWorkers=1`: 5,064 passed, 4 skipped
  (timing guards), 2 failed, of 5,070 in 269 files (1,171 s). The two: the CLI's tolerance test
  found a `1e-12` in `cameraAsk.ts` (now `tolerance('noArea')`, the table's "a cross product
  below this is none"), and the rules' MSG-4 test lists the plan's fields, now with `views`
  (expectation changed, above). Both files rerun alone with `cameraView.test.ts`: 37 of 37.
- `npm run scoreboard`: 197, 278, 16, 5, 15, 735, 95. Same as the stored figures.

After merging `main` at ca2db98 (MSG-5, CNT-9): conflicts in `AGENTS.md`, `CHANGELOG.md`,
`docs/commands.md`, `docs/plan-file.md`, `docs/result-contract.md`, `docs/tool-server.md`,
`readTools.ts`, `floorplan.ts`, `tools.test.ts` and `server.test.ts`, all kept both sides. CNT-9
took C9 in the plan format, so saved views are C10. The tools are 27, `grid_save_view` still last;
`grid_view` keeps CNT-9's `highlight`, `colour` and `painted` beside the camera. Build, typecheck
and lint clean; the affected tests (the CLI's MCP, `src/__tests__`, `grid.e2e`, `everyPath`, the
coverage tests and edits, the floorplan camera, tolerance and types tests, the viewer's still and
3D tests, the rules' result tests) passed, 867 with 1 skipped, of 868 in 67 files.
`npm run scoreboard`: same as the stored figures.

After merging `main` at 5039f12 (COD-3, WRT-8): conflicts in `AGENTS.md`, `CHANGELOG.md`,
`docs/commands.md`, `docs/result-contract.md`, `docs/tool-server.md`, `draw/views.ts`,
`serveTools.ts`, `floorplan.ts`, `tools.test.ts` and `server.test.ts`, all kept both sides, VEW-3's
changelog entries at the top. COD-3 took C10 in the plan format for the place, so saved views are
C11. `grid_diff` and `grid_mark_start` stay where WRT-8 put them; `grid_save_view` stays last, the
29th; `draw/views.ts` keeps the camera record beside WRT-8's comparison picture. Build, typecheck
and lint clean; the affected tests (the CLI's MCP with the replay, draw, sheet, edits, command
tests and WRT-8's versions, the floorplan geometry and types tests, the rules' result tests and
COD-3's place test, the viewer) passed, 3,930 with 2 skipped, of 3,932 in 211 files.
`npm run scoreboard`: same as the stored figures.
