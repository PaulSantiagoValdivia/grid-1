# HND-12: read a phone room scan in from its faces, and keep the scan as evidence

Card: "Grid reads a phone room scan (Apple's room model first) into a plan by pairing each
wall's two faces, returns a list of what it assumed, and keeps the scan beside the plan as
evidence, keyed by the scan's own ids." Lab evidence AE-2. No AE-2 material is in this
repository: `scoreboard/data` (the gzipped files searched too), `reviews/` and the fixtures hold
nothing under AE-2, so the done-when is held by invented scans (below).

## What existed, and what was reused

- **WRT-6 (on main): reused.** The source marks (C8, `marks` with `scanned` and `assumed`) mark
  every part the scan draws and each assumed value; `grid check` lists the assumed ones under "To
  confirm" (`plan/value-assumed`) and the drawing dashes them. Squaring is not run on import: the
  answer points to `grid_square_scan` / `grid edit square`, which works on the walls marked
  `scanned`, as its own step.
- **HND-11 (face-placed walls): not on main while this was built** (`git log main | grep HND-11`
  was empty; it lived on `claude/hnd-11`), so nothing of it is used. It landed on main at 90a933b
  and was merged in last: a plan's `taped` lengths stay through a scan written over it, and the
  scan's answer gives them against the new walls, as rooms text's does. It was not needed either: a wall made from two
  scanned faces has its centre line and thickness from them, and a one-sided wall is written on
  its centre line, half the assumed thickness out from its face. When HND-11 lands, a one-sided
  wall could be written by its face (`face: "left"`), so a later thickness grows away from the
  room by itself; see "For the owner".
- **WRT-2 (rooms first): reused for the walls.** The rooms are written as rooms text polygons of
  their inside faces and `compileRoomsText` works out the walls: which faces are one wall's two
  faces (its own face pairing, within `roomsWallWidest`), the kinds, the joints, the boundaries,
  the names. Its one change: an option, `places`, for how finely the walls are written (4, a tenth
  of a millimetre, unchanged for rooms text; 6 for a scan).
- **CNT-9's `carryFacts`**: the person's facts and room numbers stay with their parts by id
  across a re-scan.

## What changed

### The reader (`packages/floorplan/src/scan/`, pure)

- `roomModel.ts` reads the capture: `walls`, `doors`, `windows`, `openings`, `floors`, `objects`
  and `sections`; each surface's `identifier`, `dimensions`, `transform` (sixteen numbers column
  by column, or four columns of four), `category` and `confidence` (a word, or an object with
  one key), `parentIdentifier`, `story` and `polygonCorners`. Its header describes the shape in
  Grid's words. Every id is held to the plan's id rule (MSG-9 `textProblem`), every list to
  `PARTS_MAX`, corners to `BOUNDARY_MAX`, numbers to `largest`; two surfaces with one id and a
  scan with no wall are refused. A refusal names the part and the limit, never the text.
- `toPlan.ts` (`planFromScan`): faces seen from above (the scan's x, -z, C4), turned by the least
  turn that sets the longest face across the drawing and moved to 0,0; each room's sides are the
  faces along its floor outline's edges (`scanFaceTurn`, `scanFaceReach`), or, with no floor
  outline, the faces joined end to end into one room (`scanCornerGap`); corners where the faces'
  lines cross. Faces of two rooms facing each other a little out of parallel are turned onto one
  direction about their middles (and said). Then rooms text, `compileRoomsText(…, { places: 6 })`,
  and: each wall's faces, its height (its tallest face), its id; doors, windows and openings on
  the wall the scan names (`parentIdentifier`), else the nearest, at their place along it, a door
  given twice drawn once; toilets and baths as fixtures; the marks; the area of every room on the
  plan beside the scan's.
- `evidence.ts`: the scan kept beside the plan, and reading it back for a re-scan.
- `test-support/roomScan.ts`: invented scans, built from Grid's own numbers in the published
  shape. No Apple sample file, sample code or documentation text was used; the flat, its sizes
  and its ids (`5CA1AB1E-…`) are made up, so the fixtures hold no one's home.
- Four tolerances in the table and `docs/tolerances.md` (`scanFaceTurn` 0.0872 sine,
  `scanFaceReach` 0.05 m, `scanCornerGap` 0.15 m, `scanOnFloor` 0.05 m), and one arithmetic
  entry, `scanWritten` (1e-6 m). The tolerance test now scans `src/scan/` for literals too.

### The command and the tool (`packages/cli/src/command/scan.ts`)

- **Entry point: `grid write --scan <scan.json>`, and `scan` on `grid_write_rooms`** in place of
  `rooms` (one of the two). No new tool: the tool count stays 30, so tools.test.ts, server.test.ts,
  AGENTS.md and the docs keep their counts. Writing a plan from a scan is writing a plan, and it
  shares that tool's protection (a plan changed since is refused unless `replace`), its brief
  lines and its answer's fields; `grid_square_scan` was the other candidate, but it changes a plan
  already there.
- The scan file is read through `projectFiles.ts` (`readText`, the plan file's 64 MB cap, the
  one decoder); a file that is not JSON is refused without quoting it. The evidence is written
  through the project's atomic writer.
- `grid write`'s options gain `--scan` (strict: with a rooms file too it is refused by name).

## Done when, with evidence

1. **A scan shaped like Apple's room model converts with 0 issues, room areas within 0.001%, and
   a list of assumptions.** The invented flat (`INVENTED_FLAT`: four rooms, two inside walls of
   0.1 and 0.12 m, four doors, two windows, a toilet, a bath, a bed and a sofa, the phone's frame
   turned 31.7° and moved) converts with `validatePlan` giving no issue, and `inspectPlan`
   giving 0 refused, left-out, worth-a-look, finding and not-checked lines: the only six lines are
   `to-confirm`, the four outside walls' thickness and the two fixtures' turn, the values assumed.
   The areas compared are **the scan's own floor polygon areas** (it gives floor outlines):
   16, 12.8, 3.552 and 7.0744 m², each within 3e-16 to 2.3e-15 of the plan's (relative), that
   is about 1e-13 %. A scan with no floor outline is compared with **the area its wall faces
   enclose** (`from: 'wall faces'`), within the same rounding. Tests:
   `packages/floorplan/src/scan/__tests__/scan.test.ts` "converts with no problem in the drawing,
   every room within 0.001% of the scan's floor outline", "is one room, its walls joined end to
   end, within 0.001% of the area its wall faces enclose", "lists what it assumed, …";
   `packages/cli/src/command/__tests__/scan.test.ts` "writes the plan with no issue but the values
   to confirm, …" (the answer says `"Living room" 16.00 m² (the scan's floor outline 16.00 m²,
   0.0000% apart)`).

   The assumptions list, as the answer gives it for the flat:

   ```text
   Assumed, to confirm with the person (5):
     - A scan has no north: the plan is the scan turned 31.70° clockwise so its longest wall runs across the drawing, and moved so its walls start at 0,0. The scan's own frame is kept beside the plan.
     - Room "room-1" has no room type in the scan: named "Room 1", with no use stated. Ask what it is for.
     - 4 walls were scanned from one side only, so each one's thickness is not in the scan: taken as an outside wall 0.2 m thick, Grid's usual wall, grown away from the room from its scanned face ("ext-south", "ext-west", "ext-east", "ext-north"). Confirm the thickness, and that each is an outside wall.
     - A scan does not say which side a door is hinged on or which way it opens: 4 doors are left undecided, drawn with no swing ("door-1", "door-2", "door-3", "door-4").
     - A scan's box does not say which side of a fixture is its front: 2 fixtures are turned as their boxes lie, and may face the other way ("toilet-1", "bath-1").
   ```

   Others appear when they apply: a wall along a floor outline with no face (height not stated),
   faces of one wall scanned at different heights, two faces out of parallel (by how much), an
   opening that names no wall, one moved to fit its wall, storeys' floor levels.
2. **The scan is kept beside the plan, keyed by its own ids, and a re-scan matches to it.**
   `<plan>.scan.json`, written through `projectFiles.ts` and the atomic writer (shape under "For
   the owner"). A re-scan reads it: a part whose scan id reappears keeps its plan id (all 19 parts
   on the same scan, and the file is byte for byte the same; ids Grid would name otherwise, such as
   a room kept as `lounge` and a wall as `front-wall`, stay); **a new scan id** gives a new plan
   id, never one a gone part had (so a gone part's facts never pass to it); **a missing scan id**
   takes its part out of the plan, and the answer names it (`gone`, with the scan id, the part and
   its plan id). The person's facts and room numbers are carried by id (`carryFacts`). A plan
   changed by hand since it was written from the scan, or not written from a scan, is refused with
   the difference unless `--replace`. Tests: `scan.test.ts` (floorplan) "keeps every plan id when
   every scan id reappears", "keeps the plan's own ids …", "gives a part with a new scan id a new
   plan id, and names what is gone …"; `scan.test.ts` (cli) "matches a re-scan …", "refuses a plan
   changed since …, and with --replace keeps the person's facts by id", "refuses to write a scan
   over a plan not written from one".

## Gates

Run on the shared laptop with two workers, while about ten other sessions ran theirs.

- `npm run build`: the built file is 574,019 bytes before merging main, 574,675 after merging
  main at 4fe29ed (LVL-9, CNT-17, COD-8), under the 600 kB cap.
- `npm run typecheck`, `npm run lint`: clean, before and after both merges.
- `npm run scoreboard`: "Same as the stored figures" before merging (197 wrong of 16,542 lab and
  generated rooms compared, 735 not measured, 95 sound plans with a warning; 791.9 s), and again
  after merging main at 4fe29ed (the same counts; 645.6 s). `scoreboard/current.json` is unchanged: the lab
  plans carry no scan.
- The full suite (`timeout 1500 npx vitest run --exclude '.claude/**' --maxWorkers=2
  --minWorkers=1`), after merging main at 26e928e…e486ccb: the 1,500 s timeout ended it with 155
  test files done (4,427 tests, 4 skipped) and one failure, the speed test ("answers grid check on
  the sample flat in under 500 ms (median of 7)", 6.8 s under the load; it measures the machine,
  not this change). The 162 files it had not reached were then run on their own: 162 files,
  1,112 tests, all passed. After merging COD-8, the affected tests were rerun: the scan tests, rooms, tolerances and contract (7 files, 87
  tests) pass; everyPath, tools, server, write, writeRooms, fileAccess and grid.e2e (7 files, 175
  tests) pass but for the same speed test (5.0 s), with the load average at about 280. Timed by
  hand then, `grid check` on the sample flat took 0.54 to 1.25 s; it reads the scan code only to
  load it.
- After merging main at 90a933b (HND-11): build 576,955 bytes; typecheck and lint clean; the
  affected tests (36 files, 504 tests: the scan, rooms, types, taped, result, every-path, tools,
  server, write, writeRooms, fileAccess and grid.e2e tests) pass but for the same speed test
  (3.9 s); the scoreboard says "Same as the stored figures" (451.7 s).

## Tests added and changed, and why

- Added `packages/floorplan/src/scan/__tests__/scan.test.ts` (17) and
  `packages/cli/src/command/__tests__/scan.test.ts` (5).
- `everyPath.e2e.test.ts`: two slots, `grid write --scan` and `grid_write_rooms scan`, and `scan`
  joins the path arguments.
- `grid.e2e.test.ts`: the bundle cap's comment says what this step adds (the cap, 600 kB, is the
  one CNT-17 set on main; this step had raised it the same way before the merge).
- `tolerances.test.ts`: the literal check covers `src/scan/` too.
- No golden, snapshot or lab fixture changed. `compileRoomsText` writes exactly as before unless
  asked for more places.

## For the owner

- **The entry point is `grid write --scan` and `scan` on `grid_write_rooms`**, not a new tool:
  30 tools still. Reversible: a `grid_read_scan` tool could take the same function.
- **The evidence file is `<plan>.scan.json`** beside the plan, like `.brief.json` and
  `.seen.json`. Its shape: `kind: "grid-scan-evidence"`, `version: 1`, `format:
  "apple-room-model"`, `plan` (the plan's revision as written, `planRevision`), `capture`
  (`identifier`, `version`), `frame` (`turn` degrees counter-clockwise, then `shift` metres),
  `surfaces` (by scan id: `list`, `category`, `confidence`, `dimensions`, `transform`, `parent`,
  `story`, `corners`, `open`, and `drawnAs`, the plan part, or null), `sections`, `assumed` (the
  sentences), and `captureRooms` for a room drawn from the capture's own id.
- **How much of the scan it keeps: every field Grid reads, of every surface, drawn or not**
  (furniture too), and nothing else: fields Grid does not read (edges, curves, attributes of
  objects, whatever newer versions add) are dropped. The alternative was the whole file as given.
  A scan holds a home's layout: the file stays in the person's project and Grid sends it nowhere;
  whether it should be git-ignored by default is yours.
- **Only the last scan is kept.** A re-scan replaces the evidence; a history of scans is not kept.
- **The plan's revision covers walls, rooms, openings and floors** (`planRevision`, as rooms text
  uses): a hand edit of only a fixture or a mark is not seen as a change, and a re-scan writes over
  it.
- **An outside wall's assumed thickness is `WALL_DEFAULTS.solid.thickness`, 0.2 m**, grown away
  from the room. Only its thickness is marked `assumed`; that it is an outside wall at all is said
  in the list, not marked (a mark on `kind` would double the to-confirm lines). A thickness the
  person later gives is not carried into a re-scan: the wall is re-derived from the scan.
- **No tolerance is written on the marks.** The scan's own confidence (high, medium, low) is kept
  in the evidence, but Grid gives it no metres, so `grid_areas` says "how sure is not stated". A
  table from confidence to metres would be a figure to decide.
- **Room types**: bedroom, bathroom, kitchen, living and dining rooms become those uses and names;
  anything else (a hall, "unidentified") is "Room n" with no use, listed to ask.
- **Fixtures**: only `toilet` and `bathtub` (as `bath`) are drawn; a `sink` could be a basin or a
  kitchen sink, so it is left with the furniture and stairs, kept in the evidence.
- **A door's hinge and swing are left undecided**; a door is drawn on the floor when its bottom is
  within 0.05 m of it.
- **The walls are written to a micrometre** (`scanWritten`), not the tenth of a millimetre rooms
  text uses, so the areas hold to the 0.001% the card asks; at 0.1 mm a 12 m² room could be off by
  about 0.006%. The cost: these files hold longer numbers.
- **A scan has no north**, so the plan is turned by the least turn that sets its longest wall
  across the drawing. Which way is up is then one of four; `grid_mirror turn` turns it.
- **The bundle cap is 600 kB.** Before merging main this step raised it from 550 kB (574,019
  bytes); CNT-17 on main raised it to the same 600 kB, so the cap is main's. Merged, the built file
  is 576,955 bytes (after merging main with LVL-9, CNT-17, COD-8 and HND-11), about 34,000 of them this step's (the reader 4.4 kB, the face pairing 19.5 kB, the evidence 1.3 kB, the
  command 5.8 kB), with no new dependency.
- **Refusal codes** (`scan/not-read`, `scan/no-walls`, `scan/same-id`, `scan/not-closed`,
  `scan/outline`, `scan/plan-changed`, `scan/same-file`, and rooms-writing codes as `scan/gap`)
  are refusals of the write, like `rooms/…`, not result lines, so they are not in the result
  catalogue; the agents' changelog lists them.

## Not done or not verified

- **No real scan was run.** The reader follows the published shape of the format; whether every
  version of Apple's encoder writes the transform as sixteen numbers (both forms are read), the
  category as a one-key object, and floors' corners in the floor's own frame was not checked
  against a device. Captures merged across rooms (a structure with `rooms` inside) are read by
  their top-level lists only.
- A scan with no floor outline is read as one room; several rooms without outlines are refused
  when their walls do not join into one loop.
- Storeys are read (one floor per `story`, at its floor level), but only the one-storey flat is
  tested.
- Curved walls are drawn straight, end to end.
