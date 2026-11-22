# WRT-4: repeat, mirror and rotate, and recognise a mirrored plan

Card: "A plan can say 'this room type, placed many times', 'this floor, copied' and 'these walls
rise through several floors'. Mirror and rotate are single edits. Grid recognises a mirrored or
turned plan and says so in one line." Lab evidence WR-6 (the hotel floor, ids that stay the
same), Y-5 (a flipped flat compared as a flipped flat), WR-16 (a flat entered with y down).

## What existed

- Rooms text (WRT-2) already had `unit … end`, `place`, `repeat <unit> <n> <dir> of <room> as
  <label>`, `mirror east-west|north-south` and `copy <floor> [with openings]`. The hotel floor
  was written with one unit placed twelve times, but in six placing lines and 23 lines in all,
  because a `repeat` could not say where its first placement goes or give the end rooms their own
  settings.
- `grid_mirror` (CNT-3) mirrored left to right or top to bottom, with the stated north.
- `grid_compare` (`quantities/compare.ts`) already tried a second plan as the first one moved,
  mirrored or turned. `grid_diff` (WRT-8, `compareBuildings`) did not: a mirrored plan read as
  every wall moved.

## What changed

### Rooms text (`packages/floorplan/src/rooms/compile.ts`, language in its header)

- `repeat <unit> <n> <direction> as <first label> <where the first goes> [mirror …] [gap <t>]
  [setting=value …] [first setting=value …] [last setting=value …]`: one line places a room type
  n times, the first where the line says (`at x,y`, or `<side> of <room>` with `align`/`shift`),
  each next one on the given side of the one before. `first` and `last` settings hold for the
  two end placements only. The WRT-2 form (`… of <room> as <label>`) is unchanged. A count that
  is not a whole number from 1 to 500 (`REPEAT_MAX`, a plain constant) is refused.
- `floor <id> "<name>" … copy <floor> [with openings]`: the floor and its copy on one line,
  the same plan as a `copy` line after it.
- `through <floor>` on a room line (not inside a unit): the room, and so its walls, stands on
  every floor written after its own up to that floor, in the same place, with what the text said
  about the walls between such rooms and their outside walls. A floor copied from a floor they
  rise through holds them once. A room that rises through a floor not written after its own is
  refused with `rooms/unknown-floor`, naming the floors that are.
- `packages/floorplan/fixtures/rooms/hotel.rooms` is rewritten with the new `repeat`: 17 lines
  (23 before). The plan it writes is byte for byte the plan the old text wrote (checked by
  compiling both), so `buildings.test.ts` still holds it to the original.

### The comparison (`packages/floorplan/src/geometry/diff/`, pure)

- `turn.ts` (new): `turnPlan` lays a plan on itself mirrored or turned about the middle of its
  walls' box (as `grid_mirror` mirrors): mirrored left to right, top to bottom, turned 90, 180,
  270 degrees, or mirrored across either diagonal. A mirror swaps door swings and lists room
  walls the other way round; an anchor kept from a side of the drawing turns with it.
  `findTurn` takes the turn that stands more walls in their place than the plain way, and at
  least half the later plan's walls; a plan the same either way (a square room) is not turned.
- `place.ts`: the origin choice is `placeWalls`, shared by `alignPlans` and the new
  `wallsInPlace`.
- `building.ts`: `compareBuildings` tries the turn before it pairs anything, compares the turned
  earlier plan, and starts the verdict with the turn line, before the issue count: "The plan is
  mirrored left to right (east and west swap), and every room keeps its size." (the size clause
  only when every room is in both versions at its size). New fields `turn` and `turnLine`; a
  turned plan has `sameBuilding` false. `BUILDING_COMPARISON_VERSION` stays 1: the fields are
  added.

### The tool server and the command

- `grid_mirror` takes `turn` (90, 180, 270 or -90) in place of `how`, now optional; one of the
  two, never both. `turnPlanBy` (`packages/cli/src/edit/edits.ts`) turns the walls, fixtures, an
  anchor's side and the site's origin, and keeps the stated north and `yAxis`. `grid edit mirror
  --turn 90` comes from the tool's own arguments. No new tool: still 29.
- `grid diff` and `grid_diff`: the turn line is the line after "Compared with"; the data has
  `turn` (`id`, `mirrored`, `degrees`, `text`). No picture when the plan is only mirrored or
  turned, since nothing is marked.

### Docs and records

`docs/rooms-first.md` (new section "Many of one room, floors copied, and walls through floors"
and the bullet), `docs/plan-file.md` (the turn, after the mirror), `docs/tool-server.md`
(`grid_mirror` row, `grid_diff` section), `docs/commands.md` (`grid edit mirror --turn`, the
diff's turn), `CHANGELOG.md` (Unreleased) and the agents' changelog in
`docs/result-contract.md`. No message code was added (`rooms/unknown-floor` exists), so
`catalogue.ts` and the contract's code table are unchanged. No tolerance was added.

### The plan format

No field was added and the version stays `1`: a repeat, a floor copy and a room through several
floors are ways of writing, and the plan file holds every room, wall and opening written out,
floor by floor. `docs/plan-file.md` has no written change rule beyond "optional and never
defaulted (version 1)", which a new field would follow. No new top-level part, so
`packages/cli/src/sheet/coverage.ts` is unchanged.

## Done when, with evidence

1. **The twelve-room hotel floor, one room type placed twelve times, is at most 20 lines and
   compiles to the same areas as the 103-part version (WR-6).** The 103-part version is the
   lab's own hotel floor, `packages/floorplan/fixtures/rooms/hotel.plan.json` (40 walls, 25
   rooms, 38 openings); nothing stands in for it. `hotel.rooms` is 17 lines: one `unit guest`
   and two `repeat guest 6 …` lines, one per side of the corridor. Tests in
   `packages/floorplan/src/rooms/__tests__/repeat.test.ts`: "writes the twelve-room hotel floor
   in at most 20 lines, one room type placed twelve times" (line count, one unit, the two
   placing lines add to 12, twelve "Room 3xx" rooms) and "compiles to the same areas as the
   103-part original, room by room and in total" (the original's 103 parts; every room's area
   by name to 1e-6 m²; net, gross internal, gross external and net by use from
   `planAreaFigures`). `buildings.test.ts` "hotel is the same building as its original" still
   passes unchanged (walls, outside walls, heights, openings, areas, checks).
2. **After `mirror`, the comparison's first line says the plan is mirrored and every room keeps
   its size (Y-5), and a flat entered with y down is reported as mirrored (WR-16).**
   `packages/cli/src/versions/__tests__/diff.test.ts` "says first, after grid_mirror, that the
   plan is mirrored and every room keeps its size": `grid_mark_start`, `grid_mirror how
   left-right`, `grid_diff`; the line after "Compared with" is `The plan is mirrored left to
   right (east and west swap), and every room keeps its size.`, the verdict adds `Nothing else
   changed.`, `Changes: none.`, data `turn.id` `mirror-left-right`. "says a quarter turn is a
   quarter turn, from grid edit mirror --turn, either way" does the same through the command
   for 90 and -90. `packages/floorplan/src/geometry/__tests__/diff-turn.test.ts` "reads a flat
   entered with y running down the page as the flat mirrored top to bottom, every room its size
   (WR-16)": the two-bedroom flat with every y taken from 7.6 and its swings on the other face,
   which is byte for byte the lab's WR-16 file (`d-y-down-as-given`, checked locally, not
   committed): first sentence `The plan is mirrored top to bottom (north and south swap), and
   every room keeps its size`, no change lines. The same file holds the quarter turns, the half
   turn and a diagonal, what else changed after a mirror, a square room not called turned, and a
   rooms-first flat mirrored.
3. **Ids generated for repeated parts are identical across two compiles of the same file.**
   `repeat.test.ts` "gives the repeated parts the same ids on every writing of the same file"
   (the hotel compiled twice: every id in order, and the whole JSON, equal; `room-301`,
   `bath-312`, `door-301`, `win-312` among them) and "keeps the ids of the rooms already placed
   when the row grows by one" (4 then 5 cells: the first four rooms' and openings' ids are the
   same).

### The lab files, run locally

`compareBuildings` on the lab's own files (from `scoreboard/data/lab-plans.ndjson.gz`, not
committed as fixtures):

| Pair | Before (main at 26729c9) | Now |
|---|---|---|
| WR-16: I's flat against `d-y-down-as-given` | 2 issues, 20 changes, beginning `"Kitchen" renamed "Living room"` | `The plan is mirrored top to bottom (north and south swap), and every room keeps its size. Nothing else changed.` |
| Y-5: Y's `flat.json` against `flat-mirrored.json` | 2 issues, 19 changes, beginning `"Bedroom 2" renamed "Kitchen"` | mirrored left to right, every room its size; nothing else changed; 5 ids renamed; the drawing sits 3.80 m west, which is no change |
| J's `t1` against `t2-mirrored` | 4 issues, 19 changes, beginning `"Bedroom 1" renamed "Lounge"` | mirrored left to right, every room its size, nothing else changed |
| I's flat against `d-y-flipped-fixed` | same building | same building (not called turned) |

### Gates

Run on a laptop shared with about ten other sessions, with `--maxWorkers=2 --minWorkers=1`.

| Gate | Result |
| --- | --- |
| `npm run build` | passes; `packages/cli/dist/grid.mjs` is **509,048 bytes**, under the new 550 kB cap |
| `npm run typecheck` | passes (every workspace, `scripts`, `scoreboard`) |
| `npm run lint` | passes |
| `npm run scoreboard` | first run "Better than the stored figures": turns answered 18 → 19, every other count the same (197, 278, 5, 16, 735, 95). Stored with `--write-current`, the reason in `scoreboard/README.md`. The full suite's `scoreboard.test.ts` runs the scoreboard against the stored figures: "Same as the stored figures" |
| Full suite (`timeout 1500 npx vitest run --exclude '.claude/**'`) | 294 files, **5,295 passed, 4 skipped, 0 failed**, in 856 s |

### Tests added and changed, and why

- New: `packages/floorplan/src/rooms/__tests__/repeat.test.ts` (10),
  `packages/floorplan/src/geometry/__tests__/diff-turn.test.ts` (6); in
  `packages/cli/src/versions/__tests__/diff.test.ts` 2 (the diff after a mirror and after quarter
  turns) and in `packages/cli/src/mcp/__tests__/facing.test.ts` 3 (the turn keeps the stated
  north and turns every way two of eight points back; half and clockwise turns keep the areas and
  turn the site; refusals).
- Changed: `packages/cli/src/command/__tests__/grid.e2e.test.ts`, the bundle cap 500 → 550 kB
  with the reason in its comment. `hotel.rooms` rewritten (same plan out).
- Unchanged and still passing: `tools.test.ts` (order, 29 tools, `grid_mirror` still in
  `CHANGES_PLAN`, its call table entry with `how`), `server.test.ts`, `everyPath.e2e.test.ts`
  (no new path argument), `buildings.test.ts`, every WRT-8 diff test.


## For the owner

1. **Rotate is a `turn` argument on `grid_mirror`, not a new tool.** The tool count stays 29
   and the order is unchanged; the title is "Mirror or turn the plan" and the description says
   "rotate it 90 degrees". `grid edit mirror --turn 90` comes from the arguments. The other way is
   a sibling `grid_rotate` right after `grid_mirror` (30 tools, `grid edit rotate`), clearer by
   name for an agent that picks tools by name.
2. **Which way is positive.** `turn` is degrees counter-clockwise on the drawing as Grid draws it,
   y up: the way `north` and `grid_square_scan`'s `turned` are measured. In a plan with `yAxis:
   down` the file's coordinates turn the same way, which on that plan's own page looks clockwise,
   and the answer says so. The alternative is positive counter-clockwise on the plan's own page.
   Quarter turns only (90, 180, 270, -90); anything else is refused.
3. **A turn keeps the stated north**: the building turns on its site, so what faced south faces
   east after a quarter counter-clockwise, as the mirror is a new design too. The other reading,
   "the drawing came in turned", would turn the north with the walls and leave every facing as
   it was.
4. **Repeats, floor copies and rooms through floors live in rooms text only.** The plan file
   gains no field (version stays 1, no new top-level part, `coverage.ts` unchanged) and holds
   every part written out, so every reader, edit and export works as before. Not built: plan-file
   fields such as a floor's `copyOf` or a wall's `through` (VE-9's single wall over two storeys in
   the IFC); each floor holds its own walls, stacked.
5. **The ends of a row are `first` and `last` settings.** The other way would measure the unit on
   wall centre lines (`sizes centre`) so the end rooms come out narrower on their own; that needs
   openings placed from centre lines too, which rooms text does not have.
6. **`hotel.rooms` is rewritten in place** rather than kept beside a second file: its plan is the
   same to the byte, and `buildings.test.ts` holds it to the original. The old 23-line text is in
   git.
7. **What counts as turned**: one of seven mirrors and turns about the middle of the earlier
   plan's walls that stands more walls in their place than the plain way and at least half of
   the later plan's walls; ties keep the plain way. A turned plan has `sameBuilding` false and gets
   no picture when nothing else changed. The turn line comes before the issue count.
8. **Ids on copied floors and risen rooms** take the floor's id in front (`l4-room-301`) by
   WRT-2's rule, with its `rooms/id-changed` warning. Room names are not renumbered on a copied
   floor ("Room 301" on the fourth floor stays "Room 301"); a renumbering copy is not built.
9. **`REPEAT_MAX` = 500** placements per line, a plain constant like `MARKERS_MAX` (a count, not a
   length).
10. **The bundle cap is 550 kB** (was 500 kB): `packages/cli/dist/grid.mjs` is 509,048 bytes, from
   about 499,600 on main (the coordinator's figure; main was not rebuilt here), no new dependency.
11. **The scoreboard's turns answered moved 18 → 19**: `repeat-floor` got its probe (copying a
   floor in rooms text was there since WRT-2; WRT-4 adds the floor-line form and the probe), so
   the developer's "times six floors" counts. Stored in `current.json`, the reason in
   `scoreboard/README.md`.
12. **A y-down flat is reported as mirrored, not told to say `yAxis: down`.** After a real
   `grid_mirror top-bottom` such a hint would mislead, so the line says only what it sees.
13. **Opening patterns (LVL-8) stay out of rooms text, in a unit too** (after merging main at
   8a43380). A `pattern` or `raw pattern` line is refused (`rooms/syntax`) with where a pattern
   goes: the plan file's `patterns`, which `grid write` keeps. A unit cannot carry one, since a
   pattern names one wall by id; openings written in a unit already go with every copy. The other
   way, a `pattern` statement in rooms text (in a unit, one pattern per placement), is LVL-8's
   "later step" and waits on a decision about its ids.
14. **A pattern counts from its wall's start.** So the ids it gives hold when a row grows only if
   the row grows toward that wall's end. Rooms text winds outside walls counter-clockwise, so on a
   row growing east the south wall works as written and the north wall needs `reversed` (shown in
   `docs/rooms-first.md`). Nothing is renumbered or turned for you. The other way, numbering a
   pattern's openings from the end nearer the row's first room, would change LVL-8's ids.
15. **The bundle cap stays at 550 kB.** The merged `packages/cli/dist/grid.mjs` is 532,807 bytes,
   under it, with no new dependency. The test's comment records the figure.

## Not done or not verified

- The turn, like the mirror before it, leaves stairs, annotations and the sketch where they are
  (CNT-3 recorded the same for the mirror).
- `grid_compare`'s own likeness test (`quantities/compare.ts`) is unchanged: it still says
  "turned a quarter" without which way.
- Main's bundle size was not measured on this machine.


## After merging main at c05d051

VEW-3 (a camera and saved views), with BRF-1, CNT-8 and others, conflicted in `CHANGELOG.md`, the agents' changelog, `edits.ts` and the bundle cap. Each was kept whole: `turnPlanBy` beside VEW-3's `mirroredViews`, WRT-4's entries first, and the cap at the 550 kB both sides had chosen, its comment naming both.

**Not done:** a turn does not turn the saved views VEW-3 brings, though `grid_mirror`'s mirror now does; nor, as before, stairs, annotations or the sketch. A plan with saved views keeps them pointed as before a turn.

## After merging main at 8a43380

Main brought LVL-8 (facades and opening patterns) and HND-1 (the DXF a drafter can keep working
in). Git stopped on two conflicts, `CHANGELOG.md` and the agents' changelog in
`docs/result-contract.md`. Both are resolved with every entry kept and WRT-4's first.
`writeTools.ts` merged cleanly and keeps both `turn` and HND-1's `dxfProfile`.

**How ids stay stable with LVL-8's patterns.** The two schemes stay apart by shape. A repeat
names a part `<id>-<label>`, with its floor in front on a plan of written floors (`g-win-1`,
`f1-win-1` on the copied floor). A pattern names its openings `<pattern>-<floor>-<n>`
(`north-row-f1-1`). Patterns are expanded after every written part, so a coincidental match is
left out and named (`pattern/id-clash`), never given twice. A pattern names its wall by id, and
rooms text's wall ids hold across two compiles and when a row grows by one (`g-ext-south`,
`g-w-room-1-room-2`). So a pattern on a repeated row places the same openings with the same ids.
Its `floors` reach a floor copied from the row's by the wall in line. The test is in
`packages/floorplan/src/rooms/__tests__/repeat.test.ts`: "gives a patterned row the same ids on
every writing, none shared, and keeps them when the row grows by one". It covers four cells, then
five, a floor copied with its openings, and two patterns repeated on the copy: ids are equal across
compiles and unique, every earlier id and place is kept, and there are no pattern issues. A second
test, "refuses a pattern line, in a unit or out of one, and says where a pattern goes", covers the
case the two cannot combine (items 13 and 14 under "For the owner").

**Mirror, turn and the comparison.** A pattern is expanded before the comparison, which is now in
the core: `compareBuildings` calls `withPatterns`, so a pattern's openings are paired, mirrored and
turned as plain ones. A pattern in the file is kept, not expanded, by `turnPlanBy` and `mirrorPlan`.
They keep each wall's id, start and end, so a pattern's margins, its places along the wall and its
floors hold. A mirror also swings a pattern's door the other way, as every plain door's swings, by
a new `swingPatterns` in the patch (`applyPatch`). A turn changes nothing in a pattern. Both
answers add one sentence when the plan has patterns. `grid write` now counts its "after" drawing
problems with the kept patterns, as "before" already did. It also says in one line when the walls
just written leave a kept pattern without its wall. Tests: `diff.test.ts` "mirrors and turns a plan
with an opening pattern…" (it fails without the swing), `diff-turn.test.ts` "reads a plan's opening
patterns as the openings they place…", and `facadeView.test.ts` (the write line). Docs:
`docs/rooms-first.md`, both changelogs.


**Gates after the merge** (with `--maxWorkers=2 --minWorkers=1`):
- `npm run build`, `npm run typecheck` and `npm run lint` pass. The bundle is 532,807 bytes.
- The scoped vitest run passed 176 files: 3,913 tests passed, 2 skipped, none failed. It covered
  floorplan, cli edit, versions, mcp and command, and rules result.
- `npm run scoreboard` says "Same as the stored figures", so nothing is stored.

**Not run:** the full suite, including viewer and the rest of cli.
