# MSG-1 review: one result record for everything Grid tells the agent

For the owner. MSG-1 (step 2) adds a front door, `inspectPlan`, that returns one record, and a
contract for it, `docs/result-contract.md`. `grid check` and `grid_check` now answer from the
record.

## What MSG-1 adds

1. **`inspectPlan(raw, options)`** in `@ongrid/rules` (`packages/rules/src/result/`). It takes
   a plan as parsed JSON or as text, and returns one record: `count`, `counts` by kind, and
   `lines`. The lines are the reading's refusals, the drawing's problems (`validatePlan`), the
   door sweeps (`validateDoorSweeps`, in no report before), and the full check's findings and
   notices. Each line carries `code`, `kind`, `thing` `{kind, id}`, `floor`, `also` (the other
   ids it names), `message`, `found`, `needed` and `fix`, plus `figures` on a finding that
   applied one. It never throws. A check that fails inside Grid becomes a `plan/check-failed`
   line, and the other checks still run.
2. **A catalogue of codes** (`result/catalogue.ts`): 73 codes, each with its one wording,
   what is needed and the fix. The record's `message` is only ever made there. A finding's
   wording is its check's own, now written once as parts (`planCheckWordings` in
   `geometry/rules/messages.ts`, and `wordings` in `rules/checks/messages.ts`). The report's
   `message`, the notes' titles and the record all use those parts (AU4-1).
3. **`checkLocalRules` from one package only.** The floorplan check is renamed
   `checkPlanSanity`. A test makes the type check fail if the core exports a `checkLocalRules`
   again.
4. **The contract** (`docs/result-contract.md`): the record, the codes table, refusals, the
   receipts of the writing tools, the stability promise and an agent changelog. A test fails
   when the file and the catalogue list different codes.
5. **`grid check`** prints one list headed "To look at (N): …" with each line's code, found,
   needed and fix, in place of the sections "Findings", "Not checked" and "Problems in the
   drawing". `--json` adds `result`. **`grid_check`** returns `count` and `lines` and leads its
   text with the same count. It keeps `findings`, `notChecked` and `drawing`. **The edit tools'
   receipts** add `toLookAt` `{before, after}`, the record's count.

## Against `done_when`

1. *One front door, never throws, 0 exceptions over the 3,000 damaged plans.*
   `scoreboard/__tests__/frontDoor.test.ts` runs `inspectPlan` over the 3,000 damaged plans
   and the 442 sound plans (about 25 s). It gives 0 exceptions, 0 `plan/check-failed` lines and
   0 codes missing from the catalogue. 504 plans are refused: the lab's 506 for MS-20, less the
   two that LVL-1 now reads (`reviews/LVL-1.md`).
2. *Every line carries id, floor, stable code, found, needed, fix and one wording; a test
   fails if a code has two wordings.* `result/__tests__/result.test.ts` checks the fields and
   the code style (`<thing>/<what>`) on a corpus of fixtures. The same test file and the
   damage-set test take every message, set aside the plan's names, the figures and the thing
   (`Door "d1"`, `The plan`), and fail when one code is left with two wordings. Another test
   checks that every finding and notice says the report's own words, and that the notes' titles
   say them too.
3. *The MS-18 plan no longer reports "Notes: 0"; `checkLocalRules` from one package only.* The
   plan is 505 m out, with two doors that collide and a door with a hinge and no swing. It now
   gives "To look at (3): 3 worth a look." (`cli/src/command/__tests__/oneList.test.ts`, and the
   record test). The rename is item 3 above.
4. *The contract is a file in the repository; refusals are error results, protocol errors only
   for malformed requests.* The file is `docs/result-contract.md`. The tool server already
   answered every refusal with `isError`. `cli/src/mcp/__tests__/contract.test.ts` now holds
   every tool to that, for four kinds of refusal, and holds the JSON-RPC errors to text that is
   not JSON, JSON that is not a request, an unknown method and an unknown tool.

## Wordings and expected texts I changed, and why

- **Notes' titles take the report's wording** (AU4-1). The old titles and the new ones:
  - "X has no way out" became "X has no route to a door to the outside", or the longer form
    when the way out is not drawn.
  - "X has no door" became "X has no door or opening to another space".
  - "Ground floor has no way out" became "Ground floor has no door to the outside".
  - "A door from X leads to a space that is not drawn" gains "as a room".
  - "X has no way to escape" became "X has no window or door to escape through".
  - "X's window is too small/high to escape through" became "The window of X is too
    small/high to escape through".
  - "X is under 6.5 m²" now prints the figure with `figureText`, as the message does.

  Tests updated: `floorplan/src/notes/__tests__/notes.test.ts` and
  `rules/src/notes/__tests__/notes.test.ts`. The details under each title are unchanged.
- **Two notices have one wording for one room or many:**
  - "On "F", "A", "B" could not be drawn and were not checked" became "On "F", rooms that could
    not be drawn were not checked: "A", "B"".
  - "Room sizes weren't checked for 3 rooms that don't say what they're for" became "On "F",
    room sizes were not checked in rooms with no use stated: 3". It now always names the floor,
    in a one-floor plan too.

  Tests updated: `rules-room-size.test.ts` (two expectations and the message test). No test
  pinned the first notice's text.
- **`no_figures_for_place` notices carry `ruleId`** (optional), so the record can tell the two
  apart (`plan/not-checked-sizes-for-place` and `plan/not-checked-escapes-for-place`). Updated
  `rules-lookup-figures.test.ts`.
- **`grid check` text**: e2e tests now look for "To look at: nothing." and "To look at (1): 1
  finding." in place of "Findings: none." and "Findings (1):" (`grid.e2e`, `init.e2e`,
  `sheet.e2e`). `planReading.test.ts` finds the `  - left out, opening "d": ` line by its start,
  not by the header, which now also says "left out".
- **Replay** (`replay.test.ts`, architect 1): it looked for "Drawing: no problems found". It now
  checks that the text has no line left out, worth a look or refused. The score is unchanged.
- **`rules-report.test.ts`** only counts real import lines now: the wording "A door from '…'"
  matched its `from '…'` pattern.
- The floorplan tests that called `checkLocalRules` now call `checkPlanSanity`, with no other
  change.

No scoreboard figure moved. No `it.fails` was flipped, so `pinned-tests.md` is unchanged.

## Decisions for the owner

1. **`found` for a drawing problem is the check's own sentence.** The validation messages hold
   their figures only as text: 30 of the 54 codes seen on 3,594 lab and damaged plans have more
   than one sentence shape. Splitting them at the source would have rewritten `validate.ts`,
   `room.ts`, `plausible.ts` and `wallFaults.ts` while LVL-1 and ARE-6 work there. So each code
   has one short wording (`message`), and the detailed sentence goes in `found`. For findings,
   `found` and `needed` are figures from the finding (6.20 m² net, at least 6.5 m²). Porting
   the lab's layer, so that each check gives its measure as data, is the next step the card
   names. It changes `found` and `needed` only, as the contract allows.
2. **Not in this step:** areas and storey heights in the record (the card's "how" lists them,
   but `done_when` does not), marking the rest of `@ongrid/floorplan/geometry` internal, and
   moving the check sheet (`sheet/pages.ts`) onto the record. The sheet still prints
   "Findings: none." beside its drawing problems.
3. **`count` counts every line, "not checked" lines too.** A flat drawn alone has count 1 ("the
   way out was not checked"). I chose one number over a count that leaves notices out, so
   nothing sits outside the count as the 505 m warning did. "No findings" is said on its own
   line.
4. **`{}` reads as an empty plan with 0 lines.** MSG-4 is to give it a warning.
5. **An unknown tool name stays a protocol error (-32602)**, as MCP sets out. Every other
   refusal is an error result.
6. **`grid_check` keeps `findings`, `notChecked` and `drawing` beside `lines`.** The contract
   says a later version may remove them.

## For the other sessions

- LVL-1 and any session that adds a validation code: the catalogue test fails until the new
  code has an entry in `packages/rules/src/result/catalogue.ts` and a row in
  `docs/result-contract.md`.
- A test written against `checkLocalRules` from `@ongrid/floorplan/geometry` (or `../rules`)
  must call `checkPlanSanity`.

## Merged with `main` at `1ed1ee7` (LVL-1, QAR-6, LVL-7)

- Conflicts: `geometry/rules/messages.ts` (LVL-1's `doorOutAboveGround` is now one of the
  shared wordings), and `rules-messages.test.ts` and `rules-report.test.ts` (main's version,
  with the fixtures in `test-support/plans`, the rename to `checkPlanSanity`, and the
  import-line rule).
- New codes in the catalogue and the contract: `plan/level-gap`, `plan/same-level` (about the
  floor it names), `wall/above-storey`, `room/offset-question`, `floor/empty-top`,
  `floor/size-question`, and the finding `opening/door-out-above-ground`.
- LVL-1's note for a door out above the ground had its own title, "A door from X opens outside
  above the ground". The one-wording test caught it. It now takes the finding's wording, "A
  door from X leads outside 9.85 m above the ground, so it is not a way out". For that, the
  finding carries `elevation` (optional, in m). Updated `levels.test.ts`.
- `scoreboard/__tests__/frontDoor.test.ts` expects 504 refused plans (LVL-1's figure).

## Checks run (worktree, each under `timeout`)

- `npm run build`: bundled, no errors.
- `npm run typecheck`: no errors in any workspace, scripts or scoreboard.
- `npm run lint`: no problems.
- `npm run check:licenses`: 412 licences checked, none GPL, LGPL, AGPL, MPL or EPL.
- `npx vitest run --exclude '.claude/**'`: 184 files, 4,046 tests, all passed.
- `npm run scoreboard`: every count the same as `current.json` (197, 386, 15, 2, 5; guards
  724 and 95).

After the merge with `main` at `1ed1ee7`: build, typecheck, lint, no errors. check:licenses:
363 licences, none GPL, LGPL, AGPL, MPL or EPL. vitest: 188 files, 4,108 of 4,109 tests passed.
The one failure was `sheet/__tests__/pdf.test.ts` "cuts a note taller than a page…", which timed
out at 60 s in a 512 s run on a loaded machine. Run alone it passes in 29.6 s. MSG-1 does not touch
the PDF. Scoreboard: the same as the stored figures (197, 386, 15, 2, 5; guards 727 and 95).
