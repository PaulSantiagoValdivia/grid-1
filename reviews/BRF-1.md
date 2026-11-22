# BRF-1: the brief held beside the plan and checked after every edit

What changed, how each done-when is held, every test whose expected value changed and why, what
moved on the scoreboard, and the choices that were yours.

## What changed

- **A brief file beside the plan** (`packages/cli/src/brief/brief.ts`): `<plan>.brief.json`
  (`plan.brief.json` beside `plan.json`), read and written only through `fs/projectFiles.ts`, as
  MSG-10's seen marks are. The plan knows nothing of it and no export, sheet or drawing reads
  it. It holds:
  - room wishes, one room by `name` (any case, or its id) or the rooms of a `use`, with `count`,
    a net `area` (about), `at_least`, `at_most` (m²) and an `inside` size (metres, either way
    round); with none of them, the room is only asked to be there;
  - the `footprint`: outside `width` and `depth`, either way round, and/or `area`;
  - `touch`: two rooms that must share a wall, or must not (`avoid`);
  - the person's own `figures` under the heading "The person's own figures: theirs, not from any
    code or standard.": `door_width`, `corridor_width`, `turning_circle` (with the rooms it is for),
    `step` and `ceiling_height`. A figure Grid does not know is refused with the five it knows;
  - `open`: the person's words for what has no figure yet, with what is still to ask.

  Every wish has a `level` (`must`, `should`, `avoid`; the footprint and the figures take `must`
  or `should`) and a `source` in WRT-6's words: `given`, which must keep the person's words in
  `quote`, or `assumed`, written "assumed 4.5" rather than "asked 4.5". A refusal names the place
  (`rooms[0].area must be…`) and never repeats the person's words.
- **Each wish against the drawing** (`brief/lines.ts`), as a line `met`, `missed`, `open` or, for
  a size in a room's name, `differs`, in words ("asked 4.5, drawn 11.93 m²"), never as a score.
  The target and the drawing are measured by the same rules: a room's net area and inside size
  from ARE-9's `planAreas` (to the faces of its walls), widths and turning circles from
  `measureRoom`'s widest circle (`grid_measure`), doors from the opening schedule's hole in the
  wall, a step from each door's sill, a ceiling from `roomHeight`, the footprint from the lowest
  floor's solid walls to their outside face and its gross external area. `area` and `inside` are
  met within `briefAbout` (5%); `at_least` and `at_most` at the figure. `avoid` is met when the
  drawing does not hold the wish. With no plan, or no room drawn, every line is `open`.
- **Until the brief gives a room a size, a size in its name is read against it** (lab R-14):
  m² (`12 m²`, `m2`, `sqm`, `sq m`), ft² and mats (`tatami`, `jo`, `jō`, `畳`), with a mat taken as
  0.9 × 1.8 m (`MAT`), Grid's own reading of one, citing no document. A line `differs` when the
  drawn size is more than `nameSize` (2%) from the size named.
- **After every change** (`brief/answer.ts`): `writeChange` (every edit tool, so `grid edit` too)
  and `writeRoomsIntoProject` (`grid_write_rooms` and `grid write`) read the brief beside the
  plan they read and add its lines, missed first, at most 12, to the text, and `brief` (`{ file,
  problem, lines }`) to the data. A brief that can't be read is one line; the change is written
  as asked.
- **The first write with no brief** (`briefReminder`): a plan written for the first time (not
  there, empty, or still the starter plan) with no brief beside it gets one line saying so, and
  `reminder` in the data; never a refusal, and not on the writes after.
- **`grid_write_brief`** (`packages/cli/src/mcp/briefTool.ts`): writes the whole brief in one
  call, before the first room if need be (the plan need not exist), and answers with every
  line, each with the person's words. Left without `brief`, it reads the brief and writes
  nothing, and a plan that is not there with no brief beside it is refused. A plan that is there
  and that Grid refuses (its format, or a trace image outside the project) is refused as by every
  tool, and no brief is written (`mcp/__tests__/contract.test.ts`, and CMD-15's trace-image case
  in `everyPath.e2e.test.ts`). Hint `write-file`; it sits after
  `grid_mark_seen` and before `grid_write_rooms`, the files it writes beside the plan last of
  them and just before the first room. The tools are 23.
- **The tolerance table** (`packages/floorplan/src/geometry/tolerances.ts`, `docs/tolerances.md`):
  `briefAbout` (0.05 ratio) and `nameSize` (0.02 ratio), Grid's own, citing no document.
- **The server's instructions and the plugin's skill** say to write the brief from the person's
  words before the first room, and that a line met never means a plan is allowed.
- **Docs**: a new page, `docs/brief.md`, with a row in the README's documentation table;
  `docs/tool-server.md` (the order, the table row, the brief's lines in every change's answer),
  `docs/commands.md` (23 tools; `grid write` and `grid edit` say the brief's lines),
  `docs/result-contract.md` (the receipts, the line's fields, a changelog entry at the top),
  `CHANGELOG.md` under Unreleased, `AGENTS.md` (23 tools, `briefTool.ts`, a paragraph on
  `src/brief/`).

## How each done-when is held

All in `packages/cli/src/brief/__tests__/brief.test.ts` unless named otherwise.

| Done when | Test |
|---|---|
| 1. Lab FD-2's house reports "asked 4.5, drawn 11.93" for Bathroom 1 after the edit, where today it gives 0 notes | "FD-2: the house whose bathroom took the floor left over > reports "asked 4.5, drawn 11.93" for Bathroom 1 after the edit, where the check gives no note": lab plan `I/scenarios/s1-room-list/attempt-1.json` (the room list whose floor left over went into the bathroom, `mistakes.json` mistake 1). `grid_check` gives `count` 0 and "To look at: nothing."; with the brief, `grid_change_opening` on the bathroom door answers "asked 4.5, drawn 11.93", the line `missed`, `must`, `given`, with its quote. The bedroom and bathroom counts are met. "says the same through grid edit, which runs the same tool" holds `grid_rename_room`; `command/__tests__/write.test.ts`, "says each line of the brief beside the plan after the write, and after an edit (BRF-1)", holds `grid write` and `grid edit rename` on the command line |
| 2. Lab Y-7's probe lists its 9 shortfalls, and R-14's "6 tatami" room measuring 5.8 mats gets a line | "Y-7: the narrow flat… > lists its 9 shortfalls…": lab plan `J/scenarios/7-wheelchair-user/probe-narrow-everything.json`, with the wheelchair user's figures (doors 0.8, corridor 1.2, turning circle 1.5, no step): six doors at 0.55, the hall 0.70 wide and 0.70 to turn in, and the entrance's 0.18 m sill: 9 lines `missed`, nothing else. "refuses a figure Grid does not know, with the ones it knows". "R-14: … > gives the "6 tatami" room that measures 5.8 mats a line…": a room 2.70 × 3.48 m inside (9.396 m², 5.80 mats), written with `grid_write_rooms` and no brief: `differs: "6 tatami room" is named 6 mats; drawn 5.80 mats (9.40 m², a mat taken as 0.90 × 1.80 m), net area.`; "leaves the room to the brief once the brief gives it a size"; "reads sizes in names in square metres, square feet and mats" |
| 3. No "met" line contains a forbidden word (MSG-3's test), and the first write on a plan with no brief gives one reminder line, never a refusal | "no line met reads as approval… > holds every met line, and every line, to MSG-3's forbidden words": a brief with met lines of every kind (an area at least, a count, a room asked for, a use to avoid, a footprint, rooms that touch, two figures, one quote holding "passes"), on FD-2's house and Y-7's probe, every line's text, the brief tool's answer and an edit's answer through MSG-3's `approvalWords`: none. "gives the first write with no brief one reminder line, never a refusal, and none after" (`grid_write_rooms`), and `command/__tests__/write.test.ts`, "reminds the first write over the starter plan that no brief is kept, in one line, and writes it (BRF-1)" (`grid write` over `grid init`'s starter plan) |

Lab AA-11 (the brief written in one call before the first room, each quote beside its target,
what is open marked) is held by "the brief before the first room (lab AA-11) > is written in one
call…": no plan yet, every line `open`, each quote kept beside its wish in the file, the open
item said with what is still to ask, and no plan written.

### How faithful the lab cases are

The lab's ids FD-2, Y-7, R-14 and AA-11 are not in this repository's data, so each case was
found by what it describes and built as closely as the data allows:

- **FD-2**: the only lab plan with a Bathroom 1 of 11.93 m² (11.928 in the referee's figures) is
  the room-list attempt, which `mistakes.json` stores as "the floor left over went into the
  bathroom, far bigger than asked". The room list's other figures are not in the data: the
  brief here holds Bathroom 1 at 4.5 m² (the figure in the roadmap), three bedrooms and two
  bathrooms (counted from the plan's rooms; the second marked `assumed`). The edit is the
  bathroom door made wider; any edit gives the same line.
- **Y-7**: the wheelchair user's conversation is the seventh of the lab's eight (cluster J), and
  its probe is the flat with everything narrow. The person's figures are the ones the replayed
  conversation uses (`replay.test.ts`: doors 0.8, a 1.5 m circle) and a 1.2 m corridor and no
  step, which are ours. With them, the probe's shortfalls are exactly 9.
- **R-14**: no lab plan has a room named in mats. The room is written in the test, its size
  chosen to measure 5.8 mats of 0.9 × 1.8 m.

## Tests whose expected value changed

- `packages/cli/src/mcp/__tests__/tools.test.ts`: `ORDER` gains `grid_write_brief` after
  `grid_mark_seen`; "keeps about a dozen tools" allows 23 (with the line saying why); `CALLS`
  gains a call of `grid_write_brief`, so its answer is held to its output schema and the label.
- `packages/cli/src/mcp/__tests__/server.test.ts`: `tools/list` gives 23 tools, not 22.
- `packages/cli/src/command/__tests__/everyPath.e2e.test.ts`: `grid_write_brief`'s `plan` slot,
  so the six T-5 paths, the link out of the project and the trace image a plan names are tried on
  it too. The trace-image case first failed: the tool wrote the brief beside a plan Grid refuses.
  It now refuses that plan as every tool does, and writes nothing.
- `packages/cli/src/mcp/__tests__/contract.test.ts` is unchanged, and first failed the same way
  for a call with only `plan`: reading a brief that is not there, beside a plan that is not there,
  is now refused.
- No snapshot and no stored scoreboard figure changed.

## Checks run

Before merging `main`, on 84c3c32 and 1061ffa: `npm run typecheck`, `npm run lint` and
`npm run check:licenses` (363 licences, none GPL, LGPL, AGPL, MPL or EPL) exit 0;
`packages/floorplan packages/rules packages/viewer scoreboard/__tests__ scripts`: 3,841 passed,
2 skipped, in 183 of 183 files. `packages/cli` first ran with one failure, CMD-15's trace-image
case (above); after the fix, it and the brief, contract and tools tests passed (61 of 61), and
the rest of `packages/cli` had passed in the same run (1,027 passed, 1 skipped).

### After merging `main` at 6ba4fb9 (SHT-11)

Merge commit 273d7ba. One file conflicted, `docs/result-contract.md`, at the top of the
changelog for agents: both sections are kept, BRF-1's above SHT-11's. `tolerances.ts` and
`docs/tolerances.md` merged cleanly: SHT-11's `planCutHeight` and `aboveSameEdge` beside BRF-1's
`briefAbout` and `nameSize`. SHT-11 counts a stair stacked over another once in the totals; each
room keeps its own net area, which is what a brief's room line reads, so no line changes.

After the merge: `npm run build`, `npm run typecheck`, `npm run lint` and
`npm run check:licenses` exit 0. `npx vitest run packages/floorplan packages/rules
packages/viewer scoreboard/__tests__ scripts --maxWorkers=2 --minWorkers=1`: 3,865 passed,
2 skipped, in 185 of 185 files. `npx vitest run packages/cli --maxWorkers=2 --minWorkers=1`:
1,032 passed, in 68 of 68 files. Together they are the full suite. Nothing was rerun alone.
`npm run scoreboard`: "Same as the stored figures" (197, 278, 16, 5, 12; guards 735 and 95), so
no stored figure changes.

### After merging `main` at bd2f6a7 (CNT-13, LVL-4, WRT-6, HND-2) and ca2db98 (MSG-5, CNT-9)

Merge commit 3d4962d (main at bd2f6a7). Five files conflicted; both sides were kept in each:

- `CHANGELOG.md`: BRF-1's Unreleased line, then WRT-6's and CNT-13's.
- `docs/commands.md`: WRT-6's `square` verb in the `grid edit` row, with BRF-1's "the same lines of the brief".
- `docs/tool-server.md`: the order names the seen mark and the brief, and "the ten that change the plan" (WRT-6's `grid_square_scan`).
- `docs/result-contract.md`: the edit receipts row names `grid_square_scan` with its `moves` and `leftAsTheyAre`, and BRF-1's `brief` and `reminder`; BRF-1's changelog section on top, then WRT-6's, LVL-4's and CNT-13's.
- `packages/cli/src/mcp/__tests__/tools.test.ts`: both reasons for the count; 24 tools then, `server.test.ts` 24, `AGENTS.md` and `docs/commands.md` 24.

Then 5a2f908 made the brief's `given` and `assumed` WRT-6's own (For the owner, item 1).

Merge commit bd52964 (main at ca2db98). Seven files conflicted; both sides were kept in each:

- `AGENTS.md`: CNT-9's `query.ts` note with BRF-1's `briefTool.ts`; 27 tools.
- `CHANGELOG.md`: BRF-1's Unreleased line, then CNT-9's.
- `README.md`: CNT-9's wording of the tool-server and plan-file rows, and BRF-1's `docs/brief.md` row.
- `docs/commands.md`: `grid serve` with the 27 tools.
- `docs/result-contract.md`: BRF-1's changelog section on top (the tools are 27), then CNT-9's and MSG-5's.
- `packages/cli/src/mcp/__tests__/server.test.ts`: 27 tools listed.
- `packages/cli/src/mcp/__tests__/tools.test.ts`: CNT-9's reason for 26 and BRF-1's for 27. The order merged cleanly: `grid_fields`, `grid_find` and `grid_count` after `grid_schedule`, `grid_write_brief` after `grid_mark_seen`, `grid_square_scan` last.

After the last merge: `npm run build`, `npm run typecheck` and `npm run lint` exit 0.
`npx vitest run packages/cli --maxWorkers=2 --minWorkers=1`: 1,084 passed, 1 skipped, in 73 of 73
files. `npx vitest run packages/floorplan packages/rules scoreboard/__tests__ --maxWorkers=2
--minWorkers=1`: 3,454 passed, 3 skipped, in 140 of 140 files (`packages/viewer` and `scripts`
were not in this run). Nothing failed, so nothing was rerun alone. `npm run scoreboard`: "Same as
the stored figures" (197, 278, 16, 5, 15; guards 735 and 95). Between the two merges, on 5a2f908:
`packages/cli` 1,061 passed, 1 skipped, in 71 files; the second group 3,399 passed, 3 skipped, in
134 files; the scoreboard the same figures.

## For the owner

The owner is away, so each choice took the reversible option; each is one line to change.

1. **The brief speaks WRT-6's words.** WRT-6 reached `main` at 680530f. The brief's `Source` is
   now `Extract<MarkSource, 'given' | 'assumed'>` and `SOURCES` is filtered from WRT-6's
   `MARK_SOURCES` (`@ongrid/floorplan/types/floorplan`), so both features use one list. A wish
   takes only `given` and `assumed`: it is said, not taped or captured, so `measured` and
   `scanned` stay the plan's and are refused in a brief (a test holds both). The words are the
   same, so no brief file changes on disk. If a brief should ever take `measured`, that is one
   line in `brief.ts`.
2. **The brief's lines are in the change receipts and the brief tool, not in `grid_check`.** No
   new message code, so the result record and the scoreboard are unchanged. Putting them in the
   record would be a new kind of line with its own codes.
3. **No `grid brief` command.** The brief is written by the tool; on the command line, `grid
   write` and `grid edit` read the file and say its lines. A command would need its own slot in
   the every-path test.
4. **The bands are Grid's own**: `briefAbout` 5% for a size asked as a figure, `nameSize` 2% for
   a size in a name (a 6-mat room at 5.8 mats is 3.3% off). Both are in the tolerance table.
5. **A mat is 0.9 × 1.8 m** (1.62 m²), Grid's own reading, citing no document. Mats differ by
   region; a brief can give the room's area instead, and then the name is not read.
6. **A footprint is the lowest floor**: its solid walls to their outside face for the sizes, its
   gross external area for the area. An upper floor that overhangs is not in it.
7. **A turning circle is every room unless the figure names rooms**; a corridor width is every
   room used as a corridor. Both are the widest circle the empty room holds, as `grid_measure
   what=narrow` reads them, so a fixture standing in the room is not taken off.
8. **A step is a door's or opening's sill**: the plan has no threshold of its own.
9. **The brief belongs to the plan the change read**: an edit with `out` reads the brief beside
   `plan`, not beside `out`.
10. **The scoreboard is not taught the brief.** Mistake 1 (FD-2's bathroom) would be named if
    the scoreboard held the person's room list and ran the brief's lines; the runner is the
    library as the lab ran it, and the room list's figures beyond 4.5 m² are not in the data.
