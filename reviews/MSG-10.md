# MSG-10: a short report sized to the plan, where a seen note can be set aside

Card: by default the report is short and about this plan: the label, the notes, what was not
checked, and which rooms were looked at. Rule and figure tables come only on request, or for the
figures a note used. The person, through the agent, can mark a note as seen with a reason. It
stays listed under "seen", and comes back as new when its part of the plan changes.

## What changed

### The short report

- `grid check` (`packages/cli/src/command/check.ts`, `checkText(result, floors, { full })`) is
  short by default. It prints, in this order:
  - the label, then the lookup notice and the floor, as before;
  - "To look at (n): …", each line with its number, message, code, found, needed and fix, as
    before (or "To look at: nothing. That only means …");
  - "Figures these notes used (n):": only the figures a line used (`figuresOfLines`), each as
    MSG-3's `figureUsedText` (the figure used here, its document, edition, clause, the day read,
    the kind of building and the status);
  - "Looked at by at least one check: 6 of 6 rooms." and "What each check looked at (7):", one
    line per check with its count, the parts it could not look at with the reason, and its
    findings when it gave any (`coverageSummary`). A part the check is not about
    (`use_not_covered`, such as a kitchen for the bedroom check) is no gap and is left to the
    full report. A check that looked at nothing still says `Nothing was checked for "…": it
    looked at no rooms` (MSG-3). The kind of building the figures were read for (COD-2) is said
    once, "Both checks that use figures read them for homes (houses and flats people live in).",
    or per check when the checks read them for different kinds;
  - "Checks run: 6. --full lists the checks, the figures, the parts looked at and what is never
    looked at (9)." (MSG-3's "Checks run: none. Nothing was checked for this plan: …" when none ran).
- `grid check --full` gives the report as it was before MSG-10, plus the Seen part below.
  `--json` gives the whole check, as before; a plan with no marks gives the same JSON as before.
- `grid_check` (`packages/cli/src/mcp/readTools.ts`) is short in the same way. It takes
  `full: true` for the checks run, every figure (`figureUsedText`, new in its text), each
  check's skipped parts and the never-looked-at lines (COD-4). Its data is unchanged but for the
  new seen fields: `coverage` and `limits` are there either way.
- **The byte counts, for the lab's 62.65 m² flat** (`packages/floorplan/fixtures/two-bed-flat.json`,
  net 62.65 m² by `planAreas`): `grid check` prints **988 bytes** (5,095 before), and
  `grid_check`'s text is **973 bytes** (2,027 before). Both are pinned exactly in
  `packages/cli/src/command/__tests__/shortReport.test.ts`, with `< 1000` beside them.

### Seen marks

- **Where:** `<plan>.seen.json` beside the plan (`plan.seen.json` beside `plan.json`), like HND-9's
  occupancy file: read and written only through `fs/projectFiles.ts` (the atomic writer), and read
  by nothing that exports, draws or makes a sheet. Code: `packages/cli/src/seen/marks.ts`.
- **Format:** `{ "version": "1", "marks": [{ code, thing, also, parts: [{ kind, id, hash }],
  reason, by, at }] }`, checked strictly on reading (`parseSeen`); a refusal names the place and
  never the text.
- **How a change is found:** a mark is keyed to the note (`code`, `thing`, `also`, compared as a
  set) and holds a hash (SHA-256 of canonical JSON, keys sorted, first 16 hex digits) of each part
  the note is about: the thing and every `also` id; a room with each wall of its outline; an
  opening with its wall; a floor with everything on it (its entry in `floors`, walls, rooms,
  openings, fixtures, stairs, notes and sketch); the whole plan for a line about the plan that
  names no part. An `also` id that is no wall, room, opening, fixture, stair or floor (a sketch
  item, a note on the drawing, or a part gone) is hashed as what it is, or as missing. Each
  part's hash holds the part as Grid reads it **and its entry in the plan file as written** (every
  entry with its id in the list for its kind; the whole file for the plan), so a value Grid does
  not read or reads otherwise is part of the mark too (see "The gap found in review" below). A mark
  holds while every hash is the same and no part was added or lost; otherwise the note is `back`:
  new again, naming the parts that changed. Keys in another order, or the file written again by
  Grid unchanged, keep the mark.
- **Reading never writes.** A mark whose parts changed stays in the file and holds no more;
  marking the note again replaces it.
- **In the report:** a seen line is listed under "Seen (n): each stays listed here, and is new
  again when one of its parts changes.", with its number, message and code, and "seen by
  "Owner" on 2026-11-22: "reason"" (both quoted: they are the person's words, so approvalWords
  leaves them out, as it does plan names). The count says "; 1 of them seen, listed under Seen".
  A line back as new is listed with the others and says "seen before, by … ; but opening
  "loft-w-loft" changed since, so it is new again." No line says resolved, fixed or closed (a
  test holds that).
- **The command:** `grid check --seen <n> --reason <text> --by <name>` marks note n (its number
  in the whole plan's report, as printed; with `--country`, the same country), prints one line
  after the label saying what was marked and which parts would bring it back, then the report.
  `--unseen <n>` takes the mark off. `--reason` and `--by` without `--seen`, both `--seen` and
  `--unseen`, a number that is no note, and a missing reason or name are refused (exit 2). A
  reason over one line, empty, or with a control character is refused without being repeated
  (exit 1). No new command: the command list in AGENTS.md is unchanged.
- **The tool:** `grid_mark_seen` (`packages/cli/src/mcp/seenTool.ts`), hint `write-file`, after
  `grid_sheet` and before the tools that change the plan. It takes `line` and `code` as
  `grid_check` gave them (a number that now names another code is refused), `reason`, `by`,
  `unmark` and `country`. Its description says never to guess the reason or the name and never
  to mark a note the person did not ask about. The tools are now 22.
- **A marks file that can't be read** (not JSON, wrong shape, too large, a folder) is said in the
  report ("The seen marks were not read: plan.seen.json is not JSON. Every note is listed as
  new."), never fails a check, and is never written over: marking is refused until it is fixed
  or taken out.

### The gap found in review (fixed)

The coordinator marked `plan/unknown-field` seen on the flat with `"extra": 1` at the top, changed
it to `"extra": 2`, and the note stayed seen: the hash was made from the plan as read, and the
reader leaves fields it does not know out. The same held for every note whose `found` names a
value from the file that the plan as read does not keep: `plan/unknown-field` and
`plan/unknown-use`, and MSG-6's `plan/value-left-out`, `plan/part-left-out` and
`plan/read-as-meant` (the plan as read holds the default, nothing, or the value as meant).

Fixed in 9f36820: a mark is made from the plan and the file's own text (`SeenSource`, the loaded
plan), and each part's hash covers `{ read, written }`, where `written` is the part's entry in the
file read by Grid's one text reader (`readPlanText`, so NaN and a decimal comma read as they do
for the check). A plan made in memory, with no text, hashes the plan as read, as before. Four
new cases in `shortReport.test.ts`, each marking the note, reading it again unchanged (still
seen), then changing only the value in the file (back, naming the part): `"extra"` 1 → 2 at the
top (the plan), an unknown `colour` on a wall red → blue, a door's `swing` Grid leaves out
`sideways` → `upwards`, and a wall `height` written as text `"2.6"` → `"2.7"`. `plan/unknown-use`
and `plan/part-left-out` go the same way (the room's or the part's own entry in the file) and
have no case of their own.

### Docs

- `docs/result-contract.md`: a section "The short report, and seen notes" (format, keys, data
  fields), a receipts row for `grid_mark_seen`, a sentence under "The front door", and the
  agents' changelog entry. No new message code.
- `docs/commands.md`: the `grid check` row, a section "The report, short or full, and notes
  seen: `grid check`", 22 tools.
- `docs/tool-server.md`: the `grid_check` and `grid_mark_seen` rows, the order sentence, a
  section "A note set aside as seen".
- `AGENTS.md`: 22 tools, `seenTool.ts`, and two sentences on `check` and `src/seen/marks.ts`.
- `CHANGELOG.md`: one line under Unreleased; "21 tools" becomes 22 in the first-release list.
- The plugin's skill (`distribution/listing.ts`), step 4: one sentence on `grid_mark_seen`.

## Tests whose expected values changed, and why

Read from `git diff main -- '*.test.ts'` after the work. No test was deleted and no expectation
dropped: each changed one checks the full report with `--full` / `{ full: true }` /
`full: true`, and the short one beside it where the change is about it.

- `packages/cli/src/command/__tests__/grid.e2e.test.ts`:
  - "prints the report with its label first, and says no plan meets any rule": the default
    report now says "Checks run: 4. --full lists the checks", and the empty size check reads
    `…: it looked at no rooms; not looked at 5: no use stated.` (the short report gives the
    gap's reason on the check's line). The expectations on "Checks run (4):", the room-by-room
    skip line and "What these checks never look at" moved to a `--full` run in the same test,
    with the label and forbidden-word checks repeated for it.
  - "lists ceiling height and load-bearing walls among what the checks never look at": reads
    the `--full` report; a new expectation holds that the short one says "what is never looked
    at (9)."
- `packages/cli/src/command/__tests__/coverage.test.ts`:
  - the office whose rooms are "other": `checkText(result, 1, { full: true })`, for the skipped
    rooms one by one ("not looked at, 7 rooms: …"), which only the full report lists.
  - the café (COD-2): the per-check "looked at 1 room; 0 findings; its figures were read for
    homes" line and the figure line are read from the full report. Two new expectations hold the
    short one: the size check's line, and "The check that uses figures read them for homes (…)".
- `packages/cli/src/command/__tests__/oneList.test.ts`, COD-4's test: `grid_check` lists the
  never-looked-at lines with `full: true`. New: the short answer has the same `limits` in its
  data and says how many there are.
- `packages/cli/src/mcp/__tests__/tools.test.ts`: `ORDER` gains `grid_mark_seen` after
  `grid_sheet`; "keeps about a dozen tools" allows 22 (with a comment, as for earlier cards);
  `grid_mark_seen` joins the tools that take no length (the metres test); `CALLS` gains a
  `grid_mark_seen` call, on a bench plan `noted.json` (the flat with one field Grid does not
  read, so it has a note to mark).
- `packages/cli/src/mcp/__tests__/server.test.ts`: `tools/list` has 22 tools (was 21).
- `packages/cli/src/command/__tests__/everyPath.e2e.test.ts`: `TOOL_SLOTS` gains
  `grid_mark_seen`'s `plan`, and `COMMAND_SLOTS.check` gains `check --seen`, so the T-5 paths and
  links are refused there too. No expected value changed.
- `scoreboard/__tests__/approvalWords.test.ts`: scans the full report as well as the short one,
  each led by the label. No expected value changed.

Not a test, but read by one: `scoreboard/src/retell.ts` builds the retelling prompts from the
full report (`{ full: true }`), so the twelve cases still hold a model to sourcing every figure.
The prompts are as they were before MSG-10.

New: `packages/cli/src/command/__tests__/shortReport.test.ts` (the flat's two byte counts and
contents; `--full` and `full: true`; the figures a finding used and no others; marking, Seen,
the count, the words quoted; a change to the window bringing the note back and a change on
another floor leaving it seen; a room's outline walls among its parts; unmark and re-mark;
`--json`; every refusal of the options and the tool; the marks file's name and five bad files;
an unreadable file said and not written over).

## For the owner

Each of these is the reversible choice I took overnight.

- **One switch, `--full` / `full: true`**, rather than separate `--rules` and `--figures`. The
  full report is the report as it was.
- **The never-looked-at lines (COD-4) are on request**, with a one-line pointer naming how many
  there are. With them in, the flat's short report would be about 1,860 bytes (their section is
  875), so the 1,000-byte target can't be met with them; `limits` stays in `grid_check`'s data. COD-4's review offered exactly
  this. Putting them back in the short text is one line in each of `checkText` and `checkTool`.
- **The kind of building is said once** when every figure check read its figures for the same
  kind (always today), not on each check's line: that saves about 50 bytes on the flat.
- **`grid_check`'s short text gives no separate figure table.** A line that used a figure already
  gives it with its document, edition, clause and status in "Needed" (MSG-3's
  `figureNeededText`), as before; `full: true` adds the table. `grid check` gives the table of the
  figures its lines used, since its lines are longer anyway.
- **A part a check is not about** (`use_not_covered`) is left out of the short coverage lines; the
  gaps (no use stated, no stair, cannot be drawn, above the third storey, …) are always given.
- **What a part of a note is** (above, "How a change is found") is my reading of "its part of the
  plan": a room's outline walls and an opening's wall count, so moving a wall of a small room
  brings its note back; a floor note comes back on any change on that floor; a plan note that
  names no part comes back on any change to the plan.
- **A part's content includes its text as written in the file**, not only what Grid reads (the
  gap above). So writing a number as `2.60` instead of `2.6`, or moving a field's place, keeps the
  mark (canonical JSON, the same number), but a hand edit that turns `2.6` into `"2.6"` brings the
  note back, as it should for a read-as-meant note and harmlessly for others.
- **A mark whose parts changed is not deleted** from the file: reading a check never writes, and
  `grid_check` is a read-only tool. It holds no more, and the report says the note is new again.
  Marking it again replaces it.
- **Who marked it is what the person types.** Nothing is filled in (no user name, no machine
  name). The description tells the agent never to guess it, and suggests a role such as "Owner".
  It is kept only in the marks file, which no export, sheet or drawing reads; `grid_check`'s data
  and text do give it back, since the person gave it to the agent. If the owner wants no names at
  all, `by` could take a role from a fixed list instead.
- **A reason is at most 200 characters, one line**; who marked it at most 120 (a name's limit in a
  plan). Both are held to MSG-9's character rule.
- **A note is named by its number** in the whole plan's report, as printed, which is how a person
  and an agent see it. The tool also takes the code and refuses a mismatch; the command does not
  (it prints what it marked). With `--floor`, the number is still the whole plan's.
- **The retelling set uses the full report**, to keep its prompts and its figure-sourcing cases as
  they were. Running it on the short report is a one-word change in `scoreboard/src/retell.ts`.
- **No label in the marks file.** It is Grid's own data beside the plan, like the occupancy file,
  not a report or an export.
- **`grid check --json`** carries `seen` only once a line has a mark or the file can't be read, so
  a plan no one has marked gives the same JSON as before (a UTF-16 test compares two such outputs).

## Checks run

### After merging main at ef88ec9 (ARE-13), on the branch at 9f36820

`git merge --no-edit main` (041383d) had two conflicts, both resolved by keeping both sides:

- `packages/cli/src/mcp/readTools.ts`, the imports: ARE-13's `PATH_MAX` import kept beside
  MSG-10's `figureUsedText`, check and seen imports.
- `docs/result-contract.md`, the changelog for agents: both new entries kept, MSG-10's first,
  then ARE-13's.

Everything else merged cleanly (ARE-13's `rates` path argument on `grid_takeoff` and its slot in
`everyPath.e2e.test.ts`, the changelogs, `docs/tool-server.md`). The tool count stays 22: ARE-13
added arguments, not a tool.

- `npm run build`, `npm run typecheck`, `npm run lint`: pass.
- `npm run scoreboard`: "Same as the stored figures" (123.6 s).
- The affected tests, `timeout 1500 npx vitest run packages/cli packages/rules
  packages/floorplan/src/geometry docs scoreboard/__tests__/approvalWords.test.ts
  scoreboard/__tests__/retell.test.ts --exclude '.claude/**' --maxWorkers=2 --minWorkers=1`
  (the merge touched `packages/cli` and `packages/floorplan/src/geometry`): 160 files, 3,937
  tests passed, 2 skipped, in 448 s. The full suite was not run again after the merge.
- The flat's default report, measured again after the merge and the fix: `grid check` 988 bytes,
  `grid_check` 973 bytes, as before (ARE-13 changes no line of the check). The pins are unchanged.

### Before the merge, on the branch at 4a34ea2

`git merge --no-edit main`: already up to date (main is still at 6fce2ae, the branch point).
Then, on the branch at 4a34ea2:

- `npm run build`: passes.
- `npm run typecheck`: passes.
- `npm run lint`: passes.
- `npm run scoreboard`: "Same as the stored figures" (288 s). No count moved.
- The full suite, `timeout 1500 npx vitest run --exclude '.claude/**' --maxWorkers=2
  --minWorkers=1`: 243 files, 4,747 tests passed, 3 skipped, in 1,094 s.

Before that, a run of `packages/cli`, `packages/rules`, `docs` and the two scoreboard scans
failed two tests: everyPath's "no other free text argument is described as a file" (the `by`
argument said "marks file"; reworded in 4a34ea2) and `grid.e2e`'s speed test (618 ms against
500, with the machine's load average at about 230). The speed test also failed once run alone
under that load; `grid check` on the flat took 0.39 to 0.52 s by hand, and the test passed in
the full suite above. MSG-10 adds one small file read to a check.
