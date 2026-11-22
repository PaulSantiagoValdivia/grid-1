# WRT-8: compare two versions by what stands where, as a command and a tool from a start marker

Card: "`grid diff` and a diff tool compare two versions of a plan by what stands where in the
building, not by ids": a short verdict first, room by room; the changes one line each; the
issues; a scope check against the rooms the agent meant to edit; a three-colour picture. The
earlier version is the last one in git or a start marker the agent set. Lab evidence WR-8, WR-21,
Y-4, RT-8, U-4 (and U-5 for the issues), CP1 for the picture.

## Done when

| Item | Where it is shown |
|---|---|
| 1. The same building under new ids compares as 0 changes, with one line saying how many ids were renamed | `compareBuildings` (`packages/floorplan/src/geometry/diff/building.ts`) on `alignPlans` (`place.ts`). Test: `geometry/__tests__/diff-building.test.ts` "the same building under new ids" (the two-bedroom flat with every id new, every wall the other way round, the lists reversed, the origin 0.15 m away and points slipped 4 mm: id diff 56, by place 0, "Same building, 28 ids renamed (9 walls, 13 openings, 6 rooms)"). Lab numbers below |
| 2. After a one-number edit on a rooms-first flat, at most two change lines, and the kitchen door stayed where it was | Rooms-first plans (both with `written`) are compared by rooms and openings. Tests: `diff-building.test.ts` "a one-number edit…" (id diff 23 with "moved 4.40 m"; by place exactly two lines, `door-kitchen` "stayed where it was, in "Hall" and "Kitchen", on the wall that replaced its own"), and `cli/src/versions/__tests__/diff.test.ts` through `grid write`, `grid mark`, `grid write --replace`, `grid diff --json` |
| 3. Splitting a room and merging it back compares as 0 changes (U-4), and a door that now joins other rooms is named in the summary | A room's wall list compares as a ring (`sameRing`, `props.ts`); `doorsThatChangedRooms` (MSG-14) on the aligned plans leads the issues. Tests: `cli/src/versions/__tests__/diff.test.ts` "names the door that now joins other rooms, and reads a split merged back as no change" (`grid edit split`, `grid diff`, `grid edit merge`, `grid diff`), `diff-building.test.ts` "a room list read as a ring", `diff-rooms-floors.test.ts` |
| 4. With no `.git`: `grid mark start`, an edit, `grid diff --since start` works, and the tool returns the summary and a three-colour picture | `versions/markers.ts`, `command/diff.ts`, `mcp/diffTools.ts`. Tests: `diff.test.ts` (the folder is checked to have no `.git`), "answers through the tools with the summary and a three-colour picture" (`grid_mark_start`, `grid_split_room`, `grid_diff` with an image); the picture: `viewer/src/picture/__tests__/comparison.test.ts` |

## What existed

- `diffPlans` (`packages/floorplan/src/geometry/diff/`): pure, matched by id only ("the only
  matching the diff does", `match.ts`), with derived opening moves, area deltas, a
  `suspected_id_churn` issue for a removed and an added part in one place, a scope check
  (`changesOutsideScope`) and `revertChanges`. Nothing in the command or the tool server called it.
  A room's wall list was compared in file order, so the same ring from another wall was a change.
- `comparePlans` (`packages/cli/src/quantities/compare.ts`), behind `grid_compare` and the
  verdicts of `grid write` and the edit receipts: separate plans side by side by room name,
  with a likeness test (moved, mirrored, turned) and walls by place. It stays as it is: it
  compares options; `grid_diff` compares versions.
- `doorsThatChangedRooms` (MSG-14), used by the edit receipts.
- The CLI reads no git and runs no `git`; the only child process in `packages/cli` is the
  Windows registry lookup in `apps/systemLookup.ts`.

## What changed

### The core (`packages/floorplan`, pure)

- `alignPlans` (`diff/place.ts`): lays the earlier plan on the later one. The origin moves to
  the later plan's low corner when that pairs more walls. Walls pair by place (both ends within
  the new tolerance `diffPlace`, 0.05 m, either way round; same floor, solid or dividing line),
  cheapest first and one to one, then by id. A wall one version draws as one and the other as
  several pieces end to end (same kind, thickness and height, on one line, no gap) is
  `redrawn`, not changed. Openings pair by place (same type, middles within `diffPlace` plus half
  a width difference), then by id; rooms by the same walls or the same floor in the same place
  (`diffRoomAreaShare`, `diffRoomCentre`), then by id. Rooms first (`written` on both), rooms and
  openings pair by id first. The aligned plan is the earlier one moved and under the later ids,
  walls drawn the other way round flipped with their openings' offsets, hinges and swings; a
  point that slipped less than `diffMovement` (1 cm) takes the later value.
- `compareBuildings` (`diff/building.ts`): `diffPlans` on the aligned plan, then the answer:
  issues (`door_joins_other_rooms` from MSG-14, `opening_crossed` for an added or moved wall
  ending inside an opening of another wall, the diff's own issues, the notes that came and went
  from the caller's `inspectPlan` lines, followed through renamed ids), a verdict room by room,
  room verdicts (`changed`, `moved`, `added`, `removed`, `unchanged`), change lines, the openings
  that kept their place, the scope check and the picture's marks. Raw plans list walls one line
  each, walls changed the same way as one line. Rooms first, only rooms and openings: a room
  that kept its size and moved is "moved", rooms that moved together are one line, and an opening
  stayed when its move along its wall matches the move of one of its rooms (its sides read by
  `openingFaces`, MSG-14's door sides now also for windows).
- `roomProps` compares the boundary as a ring (`sameRing`), either way round.
- `diffPlace` added to the tolerance table and to `docs/tolerances.md`.

### The viewer (`packages/viewer`): draws only

- `comparisonPicture` (`src/picture/comparison.ts`): the later plan through `planPicture` in the
  comparison look (the working look's lines in pale colours, no sizes, areas or notes), framed on
  both versions; then each plan's own `buildFloorPlan` drawing of the parts the core's marks
  name: removed from the aligned earlier plan, added and changed from the later; a label on each
  changed room with its old and new area ("to", not an arrow: the PNG's fonts lack it), and a key.

### The command and the tool server

- `grid mark [<name>] [--plan] [--remove]` and the tool `grid_mark_start` (`write-file`): the
  plan file's text kept in `plan.markers.json` beside it (`versions/markers.ts`), at most
  `MARKERS_MAX` = 5, through `projectFiles.ts` and its atomic writer.
- `grid diff [<plan>] [--since <name>|git] [--rooms] [--show] [--picture <file.png>] [--floor]
  [--json]` and the tool `grid_diff` (`read`), sharing `versions/diff.ts`. `--picture` is a new
  path slot, listed in `everyPath.e2e.test.ts`; it is checked before anything is read.
- `versions/git.ts`: the last committed version read from the project's own `.git` (HEAD, loose
  or packed refs, loose objects and packs with deltas, through two new resolver methods,
  `readBytes` and `folderNames`, in `projectFiles.ts`). It spawns nothing.
- `loadPlanText` in `command/plan.ts`: the earlier version read as a plan file is read.
- `pictureToPng` in `draw/drawPlan.ts` (out of `drawPlan`), `comparisonView` in `draw/views.ts`.
- The plugin's skill says to mark before a change and call `grid_diff` after every save.

## The lab cases, before and after

"Before" is `diffPlans` alone on main 6ba4fb9 (what the lab's bench ran, same counts as the lab
recorded); "after" is `compareBuildings` on this branch. Plans from the lab's folders, run
locally and not committed. Rooms text was compiled and stamped with `stampFor`, as `grid write`
does.

| Case | Before | After |
|---|---|---|
| WR-8: the flat against its DXF rebuild (the I lab's flat and its DXF rebuild) | 56 changes, 12 area changes, 28 issues | 13 lines, 0 issues, "28 ids renamed (9 walls, 13 openings, 6 rooms)". The 13 are what the DXF really lost: 6 room uses, "9 walls height 2.60 → 2.70 m" (one line), 6 window heights or sills |
| Y-4: architect's option A against its read-back (`option-a.json`, `a-roundtrip.json`) | 41 changes, 10 issues | 1 line, "10 walls height 2.60 → 2.70 m", 10 ids renamed: the read-back really changed the height |
| Y-4: J's flat against the estate agent's (`j-t1.json`, `flat.json`), origin 0.15 m away | 35 changes | 2 lines, the drawing's shift said once and no change; 9 ids renamed. The 2 are real: window `w-bath` 0.10 m and `w-lounge` 0.05 m further along their walls |
| RT-8: living room 30 cm wider, rooms first | 23 changes, kitchen door "moved to another wall; moved 4.40 m" | 2 lines (the living room 18.48 → 19.74 m², 4.40 × 4.20 → 4.70 × 4.20 m; four rooms moved 0.30 m east as they were); `door-kitchen` "stayed where it was, in "Hall" and "Kitchen", on the wall that replaced its own" |
| RT-8: bed1 given the short name study | 10 changes, 4 issues | 0 lines, "4 ids renamed (1 wall, 2 openings, 1 room)" |
| RT-8: the same flat with one wall per stretch (`base-split.json`) | 42 changes | 0 lines, "7 walls drawn as 17 pieces standing where they stood"; 0 the other way round too |
| RT-8: door lines reordered | 0 | 0 |
| U-4: mixed chain, start against the end of cycle 1 (`step-00`, `step-06`) | 1 change, "Bedroom 2 walls changed" | 0 |
| U-5: the split step (`step-00`, `step-02`) | 14 changes, no issue | 11 lines, 2 issues first: `door-bed2` now joins "closet" and "hall"; wall `bed2-split` now meets `ext-east` inside window `win-bed2` |

In the repository the same cases are the tests named in "Done when", on `two-bed-flat.json` and
`rooms/flat.rooms` (the lab's flat), with no lab path.

## Expectations changed, and why

- `geometry/__tests__/diff-rooms-floors.test.ts`, "reads the same boundary in another order as a
  change": its new order was a rotation of the ring, which is now no change (U-4). It now swaps two
  walls (a real change), and a new test holds that a rotation and a reversal are no change.
- `mcp/__tests__/tools.test.ts`: the order gains `grid_diff` (second) and `grid_mark_start`
  (before `grid_mark_seen`), `grid_diff` is read-only, the cap is 24 tools,
  `grid_mark_start` is among the tools that take no length; its bench holds a start marker so
  `grid_diff` answers. `mcp/__tests__/server.test.ts`: 24 tools listed.
- `command/__tests__/everyPath.e2e.test.ts`: the `mark` and `diff` command slots (`--plan`, the
  plan, `--picture`), both in the plan readers, and the tool slots of `grid_diff` and
  `grid_mark_start`.
- New: `diff-building.test.ts` (12), `cli/src/versions/__tests__/diff.test.ts` (7, two of them
  with a real git repository made by the test, skipped where git is missing),
  `viewer/src/picture/__tests__/comparison.test.ts` (2).

No message code was added: the comparison's issue codes are its own, not lines of the result
record, so `catalogue.ts` and the contract's code table are unchanged. The agents' changelog has
an entry; `docs/commands.md` and `docs/tool-server.md` a section each; `CHANGELOG.md` a line.

## For the owner

- **Tool names.** `grid_diff` (the card's `plan_diff`, in the `grid_` pattern), second in the
  list, right after `grid_compare`, which it is told apart from; `grid_mark_start` sets and removes
  markers, among the tools that write a file of their own, before `grid_mark_seen`. Commands
  `grid diff` and `grid mark`.
- **Markers.** In `plan.markers.json` beside the plan (the plan's name with `.markers.json`), as
  the seen marks are kept: the plan file's own text per marker, with its name and time. At most 5
  (`MARKERS_MAX` in `versions/markers.ts`, a plain constant: the tolerance table's units are
  lengths, areas and ratios, not counts). A sixth name is refused with the names there are;
  marking a name again replaces it. `git` is reserved. The plan never refers to it, and no export
  reads it.
- **Git.** `--since git` / `since: "git"` reads the last commit from the project's own `.git`,
  through the project folder resolver, without running `git` (a repository's settings can make
  `git` run programs). Read: HEAD on a branch or detached, loose and packed refs, loose objects,
  pack index v2 with OFS and REF deltas, a `.git` file naming a folder inside the project. Not
  read, and said so: a `.git` above the project folder, a worktree whose objects are elsewhere
  (outside the project), SHA-256 repositories. Uncommitted staged changes are not looked at.
  With no `since`, the marker `start` wins over git.
- **The picture** comes with every `grid_diff` answer that has a change, unless `picture: false`
  (the card asks for it from the same call; it is the costly part of the answer). Colours:
  removed `#c0392b` red, added `#1e8449` green, changed rooms `#b9770e` amber with a pale fill,
  the rest in pale greys (`COMPARISON_COLORS`, `UNCHANGED_COLORS`). A moved wall is drawn as its
  old place in red and its new in green.
- **`diffPlace` = 0.05 m**: two walls' ends this close are the same place, and an opening that
  moved along its wall less than this beyond its room has stayed. A slip under 1 cm
  (`diffMovement`) is no change; between 1 and 5 cm a wall is the same wall, moved.
- **Room direction words** use the sides of the drawing as rooms text does ("east on the
  drawing"), not a compass.
- **Not built:** floors that no longer line up (WR-21 lists it; WR-9 is its own card), undo and
  revert from the command (the core's `revertChanges` is there), "one frame per change".
  A rooms-first plan compared with a raw one (one side without `written`) is compared as raw
  plans.

## The scoreboard

"Turns answered" moved 16 → 18: the capability `compare-notes` ("compares the notes of two
versions") now has a probe (`scoreboard/src/capabilities.ts`, a call of `compareBuildings` with
notes on each side), and two of the lab's turns needed only it. The new figures are stored in
`scoreboard/current.json` (`--write-current`). The probe went in with the feature commit and the
figures in the commit with this review, after the full run showed the move; no other count moved.

## Merged with main (25747b7, CNT-13)

Conflicts in `CHANGELOG.md` (both "Unreleased" lines kept), `docs/result-contract.md` (both
changelog entries, WRT-8's first) and `docs/tool-server.md` (both new sections: "What a change
did", then "Use indicators"). `tolerances.ts` and `capabilities.ts` merged on their own. The full
run below is of the merged branch.

## Checks run

On this branch, merged with main 25747b7:

- `npm run build`: bundled; `packages/cli/dist/grid.mjs` 420,499 bytes (under the 500 kB cap;
  409,265 before the merge). `npm run typecheck`: no errors. `npm run lint`: no findings.
  `npm run check:licenses`: 363 licences, none GPL, LGPL, AGPL, MPL or EPL.
- `npx vitest run --exclude '.claude/**' --maxWorkers=2 --minWorkers=1`: 258 files, 4,935 passed,
  4 skipped, 1 failed (524 s). The failure was `scoreboard/__tests__/scoreboard.test.ts`, which
  wants "Same as the stored figures" and got "Better than the stored figures" (turns 16 → 18,
  above). After storing them, that file alone: 19 passed.
- `npm run scoreboard -- --write-current`: 197, 278, 18, 5, 14, 735, 95; stored.
