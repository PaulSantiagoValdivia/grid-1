# HND-11: surveys in, taped sizes kept beside drawn ones, survey coordinates at a stored origin

What changed, how each done-when is held, every test whose expected value changed and why, what
the scoreboard did, and the choices that were yours.

## What changed

- **A wall placed by its face** (C1 reopened, `packages/floorplan/src/types/floorplan.ts`). A
  wall may state `face`, `left` or `right` as you walk from `start` to `end`: its line is then
  that face, and its body, of the thickness stated or left out, lies on the other side. The
  reading (`withWallDefaults`) moves the wall half its thickness onto its centre line
  (`centreFromFace`) and records the face in `placedBy`, a reading-only field like WRT-6's
  `unstated` (named as not read when a file writes it, `READING_ONLY` in `reading.ts`). So every
  drawing, measure, check and export reads C1 as before. `statedWall` gives the wall back by its
  face, the line to 15 significant digits so a face read and written again is the text it was
  (3.6925 stays 3.6925). A thickness left out stays not stated (WRT-6) and is drawn 0.2 m.
  - **Edits keep the face.** One helper, `wallWithEnds`, takes a wall as a file states it or as
    Grid reads it and moves its centre line's ends; a file's face wall is written back on its
    face, and `mirrored` turns it to its other face. `applyPatch` (every edit tool and `grid
    edit`), `cutWall` (merge, add-room) and `applyWallEdits` (`grid tidy`'s `move-end`) go
    through it, so no centre point lands in a file as a face. `mirrorPlan` marks its walls
    `mirrored`.
  - A `face` that is neither word leaves the wall out (`STATED_SIZES` in `readParts.ts`), as an
    unreadable thickness does: read as a centre line, the wall would stand half its thickness off.
    `Left` is read as meant.
  - Rooms text read back (`describe --as rooms`) gives such a floor in Grid's own terms (raw
    lines, with `face`), so writing it again loses nothing.
- **Lengths taped on site** (C12, `taped` in the plan, `TapedSchema`). Each is a room's side along
  one of its walls (`wall`) or the distance between two of its corners (`from`, `to`, each the
  two walls that meet there), with `length` and an optional `tolerance` and `id`.
  `packages/floorplan/src/geometry/taped.ts` (`tapedLengths`) measures both on the room's outline
  along its inside faces, the outline its area is measured on: a side is every edge on that
  wall's room face, a corner the outline's vertex where the two faces cross. A row agrees within
  its tolerance, else `tapedAgree` (0.01 m, new in the tolerance table and `docs/tolerances.md`).
  - **The record** (`packages/rules/src/result/inspect.ts`) gains `taped`, only on a plan that
    keeps some, and two codes, both `worth-a-look`: `room/taped-differs` and
    `plan/taped-not-measured` (`catalogue.ts`, the contract's code table, a new section "Taped
    against drawn" and an entry at the top of the agents' changelog).
  - **After every run**: `grid check` and `grid_check` print the table after the notes
    (`packages/cli/src/taped/table.ts`), and every change (`writeChange`: the edit tools and
    `grid edit`; `writeRoomsIntoProject`: `grid write` and `grid_write_rooms`) adds it to its text,
    at most 12 rows, those that differ first, and `taped` to its data, as BRF-1's brief lines do.
    `grid check --json` holds it in `result.taped`. On one floor, the floor's rows.
- **Survey coordinates at a stored origin.** The stored origin is CNT-3's `site.origin`, a point
  of the plan: a plan kept at survey coordinates states a point near the building there.
  - `plan/far-from-origin` (`validateOrigin`) measures from it where it is stated, and its message
    names it; its `needed` and `fix` now say to keep survey coordinates with a stated origin.
  - `packages/floorplan/src/geometry/export/origin.ts` (`exportOrigin`, `nearOrigin`, moved out of
    `ifc.ts`) decides where an export writes the plan from: a plan within `farFromOrigin` of
    (0, 0) as it is; one further out from `site.origin` where stated, else HND-2's whole steps of
    500 m. The IFC uses it as before (its building now stands on a stated site origin). The GLB
    (`export/planExport.ts`) builds the floor's scene near zero and `toGlb` holds every part in
    one node, `origin`, whose translation is the offset, with `asset.extras.gridOrigin` saying
    so. DXF and OBJ write their numbers as text to the micrometre and keep the survey coordinates.
- **The sheet** places `taped` in `coverage.ts` as not shown, with why: its checks page lists a
  row that differs with the other lines.
- **Docs**: `docs/plan-file.md` (three new sections: a wall placed by its face, lengths taped on
  site, survey coordinates at a stored origin; the limits and fault tables; the `site` row),
  `docs/result-contract.md`, `docs/tolerances.md`, `docs/commands.md` and `docs/tool-server.md`
  (the table after every run), `CHANGELOG.md` under Unreleased, `AGENTS.md` (where the pieces
  live).

## How each done-when is held

| Done when | Test |
|---|---|
| 1a. A wall can be placed by its face with the thickness unknown | `packages/floorplan/src/geometry/__tests__/survey.test.ts`, "a wall placed by its face (HND-11)": "is read on its centre line, half its thickness away from the face, into its body", "keeps a thickness left out as not stated, drawing it 0.2 m thick away from its face", "is written back by its face, with no value the reading filled in", "keeps its face when an edit moves an end, in the file and in the reading, and turns it over in a mirror", "leaves out a wall whose face cannot be read…"; "rooms text reads a plan whose walls are placed by their faces > in Grid's own terms…". Through the tools, `packages/cli/src/taped/__tests__/taped.test.ts`: "every change answers with the table; moving a wall placed by its face moves the face, and keeps its thickness unstated", "cuts a wall placed by its face into pieces on the same face when two rooms are knocked into one", "mirrors a wall placed by its face onto its other face, so the inside faces stay inside" |
| 1b. A taped-against-drawn table prints after every run | `taped.test.ts`: "grid_check gives the table: every length agrees with the walls by their faces and their thickness unknown", "every change answers with the table…" (`grid_move_room_side`), "cuts a wall…" (`grid_merge_rooms`), "grid check on the command line > prints the taped-against-drawn table after the notes" (through `runGrid`, as the built file runs it) |
| 1c. Guessing walls 8 cm thicker no longer changes inside sizes (lab WR-14) | `survey.test.ts`, "lab WR-14: the tape survey, with the walls guessed 8 cm thicker": "on centre lines, as the lab drew it, the thicker guess changed every room and every taped side" (the lab's own probe: every room's area moves more than 0.1 m², over 10 taped lengths differ), "placed by the faces taped, with the thickness unknown, gives the inside sizes as taped", "guessing the outside walls 8 cm thicker (0.40 m for 0.32) no longer changes an inside size" (every room's outline the same to 1e-9 m with the thickness 0.32, 0.40 or left out; every taped length agrees; the outside walls' centre lines move 4 cm out instead). `taped.test.ts`, "names each taped length the lab's thicker guess on centre lines moved, and none when the outside walls are by their faces" holds it through `grid_check` |
| 2a. A plan at survey coordinates with a stored origin raises no unit error (lab MS-12) | `survey.test.ts`, "lab MS-12: a plan at survey coordinates with a stored origin": "is far from the origin with none stated", "raises no unit error once it states an origin near the building, and is measured from it" (no `plan/far-from-origin`, no `plan/units-question`; an origin stated far off is still asked about, from it); `taped.test.ts`, "lab MS-12 … > raises no unit error in grid_check once it states a point near the building as site.origin" |
| 2b. The GLB is within 1 mm of the plan | `survey.test.ts`, "lab MS-12: the GLB of a plan at survey coordinates": "is within 1 mm of the plan: built from the site's origin, the offset in the node that holds it" (every GLB point, its 32-bit value plus the node's translation, within 1 mm of the nearest corner of the exact OBJ model), "was half a metre out with its points written as they are, and is within 1 mm with no origin stated", "writes a plan near the origin as before, with no node to move it", "keeps the survey coordinates exactly in the OBJ, the DXF and the IFC" |

### How faithful the lab cases are

The ids WR-14 and MS-12 are not in this repository's data by those names, except MS-12, which
names lab folders (`AU1/scenarios/MS-12/…` in `scoreboard/data/lab-plans.ndjson.gz`):

- **MS-12** is the lab's own plan, `AU1/scenarios/MS-12/f16-survey-coordinates.json`: the bench's
  two-bed flat at (432000, 4580000), as HND-2 used it. The test adds the stored origin.
- **WR-14** was found by what it describes: the lab's tape survey, `I/scenarios/s3-tape-survey/`,
  whose `probe-thicker-walls` is `attempt-3-as-taped-fixed` with every wall 8 cm thicker (0.32 to
  0.40 outside, 0.12 to 0.20 inside), on the same centre lines, so every inside face moved. The
  lab stores no list of the tape's figures, so the taped lengths in the tests are what the
  as-taped drawing gives, to the millimetre (each room's sides along its outside walls and both
  diagonals). The face-placed version moves the outside walls to the inside faces the tape ran
  along and leaves their thickness out; the inside walls keep their centre lines and measured
  thickness. With faces, the outside walls' guess no longer changes a room. The inside walls'
  8 cm in the lab's probe would still take 4 cm from each room beside them: a wall between two
  taped rooms has its thickness fixed by the tapes, and rooms text (which writes rooms by their
  inside sizes and moves them apart) is the way to write that (For the owner, 6).

## Tests whose expected value changed

- `packages/floorplan/src/types/__tests__/reading.test.ts` ("thick on a wall is named…") and
  `packages/rules/src/result/__tests__/result.test.ts` ("names thick on a wall…", "gives each
  field and each use one line…"): the wall's known fields gain `face`, the plan's gain `taped`.
  `placedBy` is reading-only and not listed.
- `packages/floorplan/src/geometry/export/__tests__/ifc.structure.test.ts`, "keeps a stated site
  on its point, with its data and the north, and writes the elements from it (CNT-3, HND-11)"
  (was "… and the building holds the rest of the move"): a plan far from (0, 0) that states a
  site origin now has its elements written from that origin, so the building's placement against
  the site is (0, 0); before, the elements were moved by whole steps of 500 m and the building
  held the difference. The site's point, latitude, longitude, elevation and north are as before.
- `packages/floorplan/src/geometry/export/__tests__/glb-reader.ts` (the tests' own GLB reader):
  `readMeshes` now follows a node's `children` and adds its `translation`, from the glTF spec, so
  it reads the `origin` node. For every GLB written before (no children, no translation) it reads
  the same points.
- No snapshot and no golden file changed.

## Checks run

Before merging `main` (the work as committed in da9be3e to 7db7126): `npm run build`, `npm run typecheck`, `npm run lint`
and `npm run check:licenses` (363 licences, none GPL, LGPL, AGPL, MPL or EPL) exit 0.
`npx vitest run packages/floorplan packages/rules packages/viewer scoreboard/__tests__ scripts
--maxWorkers=2 --minWorkers=1`: 4,129 passed, 3 skipped, in 210 of 210 files.
`npx vitest run packages/cli --maxWorkers=2 --minWorkers=1`: 1,129 passed, 2 failed, 1 skipped,
in 79 files, run before the fix below went into 9fa8850. The two failures:

- `mcp/__tests__/tools.test.ts`, "answers every tool with text and data that fit its output
  schema": `grid_check` gave `taped` only on a plan that keeps some, and its schema requires every
  key. Fixed (it now always gives the list); `tools.test.ts` and `taped.test.ts` then passed, 25
  of 25.
- `versions/__tests__/diff.test.ts`, "names the door that now joins other rooms, and reads a split
  merged back as no change": `grid edit merge` of a bedroom and a store is refused by CNT-8's
  rule that two uses need `--use`. Not HND-11's: `main` fixed the test after d058d4d (56ad5ac,
  "WRT-8's split-and-merge-back states the use, as CNT-8 now asks"), and it comes in with the
  merge below.

`npm run scoreboard`: "Same as the stored figures" (197, 278, 18, 5, 15; guards 735 and 95). The
lab plans place no wall by its face, keep no taped length and state no site origin, so no count
moves and `scoreboard/current.json` is unchanged.

### After merging `main` at c05d051 (BRF-5, LVL-6, VEW-3)

Merge commit b2294be. Seven files conflicted; both sides were kept in each:

- `packages/floorplan/src/types/floorplan.ts`: VEW-3's saved views took convention C11, so taped
  lengths are C12; `views` then `taped` in the plan's fields. LVL-6 added its own `isPair`, so
  HND-11's is `isEndPair`.
- `packages/rules/src/result/__tests__/result.test.ts`: the plan's fields hold VEW-3's `views`
  and HND-11's `taped`.
- `packages/cli/src/edit/edits.ts`: VEW-3's imports with `wallWithEnds`.
- `CHANGELOG.md`, `docs/result-contract.md`: every section, HND-11's first. `docs/tolerances.md`:
  HND-11's `farFromOrigin` row with VEW-3's camera rows. `docs/plan-file.md`: the limits row names
  saved views and taped lengths.

One change past the conflicts: LVL-6 frames a floor's roof from the walls as its file writes them,
before the reading, so a wall placed by its face now frames it on its centre line (`centreFromFace`
in `withFloorHeights`), as every other reader sees it.

After the merge: `npm run build`, `npm run typecheck`, `npm run lint` and `npm run
check:licenses` (363 licences) exit 0. `npx vitest run packages/cli --maxWorkers=2
--minWorkers=1`: 1,157 passed, 1 skipped, in 82 of 82 files (WRT-8's diff test passes with
`main`'s fix). `npx vitest run packages/floorplan packages/rules packages/viewer
scoreboard/__tests__ scripts --maxWorkers=2 --minWorkers=1`: 4,172 passed, 3 skipped, in 214 of
214 files. Nothing was rerun alone. `npm run scoreboard`: "Same as the stored figures" (197, 278,
18, 5, 16; guards 735 and 95; `main`'s LVL-6 stored 16 for the checks the plan can feed).

### After merging `main` at e486ccb (LVL-8, HND-1, BRF-3, WRT-4, LVL-9, CNT-17)

Merge commit 531515f. Eleven files conflicted; both sides were kept in each:

- `packages/floorplan/src/types/floorplan.ts`: `main` took C12 (LVL-8's opening patterns), C13
  (BRF-3's plot) and C14 (CNT-17's accessible), so taped lengths are C15; the plan's fields run
  `views`, `accessible`, `taped`. `TapedSchema` sits beside the accessible schemas.
- `packages/rules/src/result/__tests__/result.test.ts`: the plan's fields as the schema orders
  them, `…, marks, views, accessible, taped, display, written`.
- `packages/rules/src/result/inspect.ts`: both sets of imports; the taped stage, then CNT-17's
  accessible stage.
- `packages/rules/src/result/catalogue.ts`: HND-11's two codes, then CNT-17's
  `plan/not-checked-access`.
- `packages/floorplan/src/geometry/tolerances.ts`, `docs/tolerances.md`: `tapedAgree`, then
  BRF-3's `setbackShort` and `pastBoundary`.
- `packages/floorplan/src/export/planExport.ts`: `main`'s `exportPlan` (LVL-8's patterns
  expanded first, HND-1's DXF room numbers and profile) with HND-11's GLB near zero.
- `packages/cli/src/command/write.ts`: one import line, `expandPatterns` and `TapedRow`.
- `CHANGELOG.md`, `docs/result-contract.md`: every section, HND-11's on top.
- `docs/plan-file.md`: the limits row and the `site` row are `main`'s with HND-11's additions;
  "Survey coordinates at a stored origin" sits before BRF-3's "The plot".

WRT-4's `grid_mirror turn=…` turns walls without `mirrored`, so a wall placed by its face keeps
its face through a turn, as a rotation should. HND-11 adds no tool; the count stays `main`'s 30.

After the merge: `npm run build`, `npm run typecheck`, `npm run lint` and `npm run
check:licenses` (363 licences) exit 0. `npx vitest run packages/cli --maxWorkers=2
--minWorkers=1`: 1,228 passed, 1 skipped, in 89 of 89 files. `npx vitest run packages/floorplan
packages/rules packages/viewer scoreboard/__tests__ scripts --maxWorkers=2 --minWorkers=1`: 4,312
passed, 3 skipped, in 228 of 228 files. Nothing was rerun alone. `npm run scoreboard`: "Same as
the stored figures" (197, 278, 19, 5, 20; guards 735 and 95).

## For the owner

The owner is away, so each choice took the reversible option; each is a small change.

1. **`face` is `left` or `right` by the wall's direction**, not `inside` or `outside`: which side
   is inside is worked out from the rooms, which are traced from the walls, so a face named by it
   would go round in a circle. Walls listed counter-clockwise round a building, as rooms list
   them, have the inside on the left. An `inside` word could be added later as a reading of the
   rooms.
2. **`placedBy` is kept when a plan Grid read is read again**, so reading twice never moves a wall
   twice. A file that writes it is told it is not a field of the format (as with `unstated`).
3. **Taped lengths are one top-level list, `taped`**, of a side along a wall or two corners each
   named by two walls. No "between two parallel walls" form: in a room that is not square the
   width is not one number, and the side along a wall is what a tape runs along. Easy to add.
4. **`tapedAgree` is 0.01 m**, Grid's own, citing nothing; each taped length may state its own.
5. **The GLB keeps the offset in a node's translation** (one node, `origin`, holding every part),
   rather than leaving it out: the file then places the model where the plan does, to the
   millimetre, and a viewer that wants it at zero can drop the one node. The offset is said in
   `asset.extras.gridOrigin` too. Only a plan reaching further than 500 m from (0, 0) is moved, so
   every other GLB is byte for byte as before.
6. **Rooms text is unchanged.** It already writes rooms by their inside sizes, and a thicker wall
   there moves the rooms apart; it has no word for a thickness left unknown (`walls outside ?`),
   because it needs a thickness to place the next room. A face-placed plan reads back raw.
7. **The stored origin is CNT-3's `site.origin`**, the point of the plan, not a new field. Checks
   and measures still run on the plan's own numbers, so at survey coordinates an area can still
   come out a few tenths of a square centimetre off (HND-2's 4.8003 m²); running the checks near
   zero would change every point a message names, so it was left.
8. **An IFC with a stated site origin is written from it** (the building at the site's point),
   rather than from HND-2's 500 m steps with the building holding the difference.
9. **The two new codes are worth a look**, not findings: a taped length is the person's
   measurement against the drawing, no rule. A row that agrees is no line, so a plan whose tapes
   all agree gets the table and no count.
10. **`grid tidy` and the sheet do not print the table**, as they print no brief lines; the
    sheet's checks page lists the rows that differ, as lines.
