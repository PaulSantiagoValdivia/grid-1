# COD-8: a firm's own standards as checks

A firm's own figures ("corridors at least 1.5 m") live in a plain file beside the plan, are
measured by the indicators Grid already has, and are reported as notes under their own heading,
apart from the code figures. Four skills ship beside Grid's own as plain text a firm can own.

## What changed

- **The firm's file** (`packages/cli/src/firm/standards.ts`): `firm-standards.json` in the
  plan's folder, for every plan there, read only through `fs/projectFiles.ts` (`readFirm`), as
  BRF-1's brief and MSG-10's seen marks are. JSON: `version` "1", an optional `heading` (one line,
  not read), and `standards`, at most 200, each with a `measure`, a least `value` and its `unit`
  (`m` or `mm` for a length, `m²` or `m2` for an area), and optionally the firm's `name` (120
  characters) and `note` (300), `uses` (room uses, for the room measures) and `kinds` (fixture
  kinds, for `fixture_clearance`). Strict: an unknown field is refused by name when it is a plain
  key; a field a code's figure carries (`document`, `edition`, `clause`, `source`, `status`,
  `readOn`, …) is refused with "a firm's standard is the firm's own and cites no code"; an unknown
  measure is refused with the six it knows. Every refusal names the place and the limit and never
  repeats the text (MSG-9). No file is no firm: the record and every report are as before.
- **The measures** (`packages/cli/src/firm/measure.ts`), each a least size, by measures Grid has:
  - `corridor_width`: CNT-13's way through a room (`passageWidth`), between each pair of the
    room's doorways (at most 10, as `grid_measure what=use`), the narrowest; for the rooms used as
    `corridor` unless `uses` names others. Each way starts from the corridor's own middle near the
    doorway (the point of most clear floor within the room's reach straight in from the doorway),
    so a narrow door does not narrow the corridor; read in the plan's favour by the grid's step.
  - `door_clear_width`: CNT-13's clear width of each door and doorless opening (`doorwayClearance`).
  - `turning_circle`: CNT-13's turning space (`turningSpace`), clear of fixtures.
  - `fixture_clearance`: CNT-13's floor in front of each fixture (`fixtureSpace`'s front).
  - `room_area`: ARE-9's net area (`planAreas`).
  - `room_width`: the widest circle the empty room holds (`measureRoom`, `grid_measure what=narrow`).
  `quantities/use.ts` now exports `fixturesOf`, `waysOf`, `mouthOf` and `besideText` for it.
- **The lines** (`packages/rules/src/result/firm.ts`, `catalogue.ts`, `inspect.ts`):
  `inspectPlan`'s options take `firm` (`InspectOptions`: the file, why it was not read, the
  standards and the parts measured). Each part short of a figure is a `finding` with a code of the
  new `firm/` family: `firm/corridor-width`, `firm/door-clear-width`, `firm/turning-circle`,
  `firm/fixture-clearance`, `firm/room-area`, `firm/room-width`; a file that cannot be read is
  `firm/not-read` (`not-checked`, about the plan), its `found` the reason. Each wording is in the
  catalogue: the message "Room "Hall": the way through is 1.14 m wide at its narrowest, under the
  firm's own figure of 1.5 m for corridor width ("Corridors")"; the needed "at least 1.5 m: the
  firm's figure used here ("Corridors"), from "firm-standards.json", the firm's own and not from
  any code or standard"; the fix ends "The figure is the firm's own: if it does not hold for this
  plan, change it in the firm's file." A line gains an optional `firm` (the figure it was set
  against); the record an optional `firm` (heading, file, read, each standard with `lookedAt` and
  `notes`). A firm's line never carries `figures`; the firm's figures are never in the record's
  `figures`, `checks` or `basis`.
- **The reports** (`command/check.ts`, `mcp/readTools.ts`): `grid check`, `grid_check` and
  `grid_mark_seen` read the file (`firmForCheck`) and pass it to `checkPlan`, so a note's number
  is the same in each. The firm's lines come after the code figures' findings under one heading:
  "The firm's own standards (N), from "firm-standards.json": the firm's own figures, from its
  file beside the plan: not from any code or standard, and not tied to a place, so they are set
  against the plan wherever that file is." The count says "1 finding of the firm's own" or
  "3 findings, 2 of them the firm's own"; with no other finding, "No findings outside the firm's
  own standards." A file whose standards gave no note is one line saying how many standards were
  set against how many parts. `--full` (`full=true`) adds the table: each standard, "the firm's
  figure used here is at least 1.5 m", the parts it was set against and how many are short.
  `grid_check`'s data carries both `firm` fields, in its output schema.
- **Skills** (`distribution/listing.ts`, `pluginFiles`): beside `skills/grid/SKILL.md`,
  `skills/firm-standards/SKILL.md`, `skills/room-programme/SKILL.md`,
  `skills/option-table/SKILL.md` and `skills/dimensioning/SKILL.md`, each with the frontmatter
  shape Grid's skill has (`name`, a description starting "Use when" and saying when not to use
  it), Grid's tools by name, the label rule and the retelling rule, and the line "This skill is
  plain text. A firm can copy it into its own repository, keep it in git and change it to its own
  ways of working." Grid's own skill says `grid_check` reads `firm-standards.json`.
- **Docs**: a new page, `docs/firm-standards.md`, with a row in the README's documentation
  table; `docs/result-contract.md` (the record's and the line's `firm`, the seven codes, a section
  "The firm's own standards", a changelog entry at the top); `docs/commands.md` (`grid check`)
  and `docs/tool-server.md` (`grid_check`); `CHANGELOG.md` under Unreleased; `AGENTS.md` (one
  layout line). `grid_check`'s description names the firm's file.

## How each done-when is held

| Done when | Test |
|---|---|
| A firm's file of its own figures is read by the checks | `packages/cli/src/firm/__tests__/firm.test.ts`: `grid_check` on CNT-13's flat with `firm-standards.json` beside it; `grid check` (short, `--full`, `--json`) on the lab's two-bed flat; `grid check --seen 1` on a firm note. `standards.test.ts`: the schema, the refusals with no echo, the file read through the project, a link out of the project refused |
| … reported under its own heading, apart from code figures | `firm.test.ts`, "gives one firm/ note under the firm's own heading, apart from the code figures": the corridor 1.15 m between faces (1.14 m on CNT-13's grid) under the firm's 1.5 m gives `firm/corridor-width` only, right after the heading, said once, no `[firm/` line before it, no `figures` on it and none of the firm's in the record's; "are unaffected": with the US stated, the code lines, `place` and `coverage` are the same with and without the file, the firm's after them, counted in `count`; "gives no firm note" for a plan not short; "checks a plan with no firm's file exactly as before" |
| … passes MSG-3's forbidden-words test | `scoreboard/__tests__/approvalWords.test.ts`, new case: the fixtures and every 50th lab plan with a sample firm's file setting all six measures high, the short and full report and every firm line (over 100) through `approvalWords`; `firm.test.ts` "no word of approval" (every code, short and full, label first); `packages/rules/src/result/__tests__/firm.test.ts` (every measure's wording); `listing.test.ts` (each new skill) |

Also: `packages/rules/src/result/__tests__/firm.test.ts` holds the wording, the precision read in
the plan's favour, a way through that is not there, `firm/not-read`, and no `firm` in a record
without a file. `tools.test.ts` gains "answers grid_check with a firm's standards file beside the
plan within its output schema".

## Tests whose expected value changed

- `packages/rules/src/result/__tests__/contract.test.ts`, "lists every code the catalogue words,
  and no other": its pattern for a code row took the thing kinds only (`plan|floor|…|pattern`);
  it takes `firm` too, since `firm/` is a family and not a thing kind. The seven codes are in the
  contract's table.
- `packages/cli/src/distribution/__tests__/listing.test.ts`, "holds a manifest for each, the
  server for each, and one skill": the plugin folder holds four more skills, so the list of its
  files grows by four and the test's name says so.
- `packages/cli/src/mcp/readTools.ts`'s output schema for `grid_check` now lists its required
  keys (the same fourteen as before) so that `firm` is optional; no test's value changed for it.
- No snapshot, no byte count (MSG-10's flat has no firm's file) and no stored scoreboard figure
  changed. Nothing was removed.

## For the owner

The owner is away, so each choice took the reversible option.

1. **The file: `firm-standards.json`, in the plan's folder, one for every plan there.** BRF-1's
   brief is per plan (`<plan>.brief.json`); a firm's standards are the firm's, for all its plans,
   so one file a folder. Found automatically; there is no `--standards` option or tool argument,
   so no new path slot in `everyPath.e2e.test.ts` (a link out of the project is refused, as the
   seen marks are, `standards.test.ts`). A path argument, or looking in the project folder too,
   is a small change.
2. **JSON**, like the brief, the seen marks and HND-1's `dxf-layers.json`: plain and diffable.
3. **Six measures, each a least size**: corridor width, a doorway's clear width, turning circle,
   floor in front of a fixture, room area, room width. "Desks 1.6 m" has no measure: Grid holds
   no desks (CNT-11: fixtures now, furniture later); the docs say so. A largest size (`at_most`)
   is not offered.
4. **(Superseded after merging CNT-17, see below.)** A corridor's width was the narrowest way between its doorways, from the corridor's own
   middle near each**, not CNT-13's way from doorway to doorway, which a narrow door narrows
   (a 1.15 m hall read 0.78 m that way). The start is the point of most clear floor within the
   room's reach straight in from the doorway; a pinch within that reach of a doorway can be
   missed. At most 10 ways a room, as `grid_measure what=use`, and the line says so when there
   are more. Read in the plan's favour by the grid's step (2 cm).
5. **Zones are not measured on their own** by the room measures; their room is.
6. **Code family `firm/`**, the first outside `<thing>/<what>`; the thing is in `thing`.
7. **The heading: "The firm's own standards"**, with "the firm's own figures, from its file
   beside the plan: not from any code or standard, and not tied to a place, so they are set
   against the plan wherever that file is."
8. **Firm lines count**: as findings in `count`, `counts.finding` and `problems`, MSG-1's one
   list with one count. The count line says how many are the firm's. Leaving them out of the
   count would be a new kind of line, or a second count.
9. **Not tied to a place (COD-3)**: set against the plan whatever place it states, or none.
10. **Where it is read**: `grid check`, `grid_check`, `grid_mark_seen`. Not the edit receipts
    (BRF-1's brief is there), the sheet (`grid sheet` calls `checkPlan` without it), the problem
    report or the scoreboard. Each is one call to `firmForCheck`.
11. **A file that cannot be read is a `not-checked` line**, `firm/not-read`, and the plan is
    checked as without it; never a refusal of the check.
12. **The limits line** "Which way a door opens, and how wide doors and corridors are, are not
    checked, beyond whether a person fits through a door at all" stays: it is about the code
    checks, and the firm's widths are under their own heading. It could name the firm's file.
13. **The skills**: `firm-standards` (writing the file, reading its notes), `room-programme`
    (a list of rooms to a brief and a plan), `option-table` (options side by side with
    `grid_compare` and `grid_check`), `dimensioning` (`grid_measure`, `grid_view` with sizes,
    `grid_sheet`). Each is short, in Grid's words, and says a firm can copy and own it.

## Checks run

While building, only the touched tests, two workers: the new `firm`, `standards` and rules `firm`
tests, `contract.test.ts` (rules), `tools`, `server` and `contract` (tool server),
`shortReport`, `oneList`, `src/__tests__`, `distribution` (with `install.e2e`), `everyPath.e2e`,
the brief's and the use indicators' tests and the scoreboard's `approvalWords`. Failures on the
way, all in the new tests or from this change, and fixed: the contract test (the `firm/` codes
were not yet in the table), `grid_check`'s output schema (it required every key, so `firm` was
made optional), and expected values in the new tests that were wrong (the front door leaves 0.85
m, not short of 0.8 m).

After merging `main` at 8a43380 (HND-1), merge commit d941242. Two files conflicted, both
kept: `CHANGELOG.md` (COD-8's Unreleased line, then HND-1's) and `docs/result-contract.md`
(COD-8's changelog entry on top, then HND-1's). Then, on that merge:

- `npm run build`, `npm run typecheck`, `npm run lint`: exit 0.
- `npm run scoreboard`: "Same as the stored figures." (Turns 18 of 67, checks 16 of 42,
  mistakes 5 of 9; guards 735 and 95.)
- The full suite, `timeout 1500 npx vitest run --exclude '.claude/**' --maxWorkers=2
  --minWorkers=1`, after the build: 305 of 305 files passed, 5,412 tests passed and 4 skipped,
  exit 0, in 691 s. Nothing failed, so nothing was rerun alone.

## After merging `main` at e486ccb (LVL-9, CNT-17)

Conflicts, both sides kept: `CHANGELOG.md` (COD-8's Unreleased line first, then CNT-17's, LVL-9's,
WRT-4's and BRF-3's), the agents' changelog in `docs/result-contract.md` (COD-8's entry first,
then CNT-17's and the others), the imports of `packages/cli/src/mcp/readTools.ts` (COD-8's
firm names beside CNT-17's `confirmedFigure`) and the comment on `fixturesOf` in
`packages/cli/src/quantities/use.ts` (both features named).

**How the firm's figures relate to CNT-17.** CNT-17 adds no file of its own: its access answer
(`grid_measure what=access`) reads the person's figures from BRF-1's brief and a code's only once
a named person confirmed it, so `firm-standards.json` clashes with nothing; the brief
(`<plan>.brief.json`, the person's own), the firm's file (`firm-standards.json`, the firm's own)
and the code figures stay three sources, each said as such. Where CNT-17 measures what a firm's
standard sets, the firm now reads CNT-17's measure:

- **Corridor width**: CNT-17's narrowest point from end to end. `corridorNarrowest` in
  `quantities/access.ts` now calls a new exported `corridorEnds`, which returns the whole
  passage (its grid step and what stands beside the narrowest point) and the widest circle;
  CNT-17's answer is unchanged (its `access.test.ts` passes as it was). COD-8's own start point
  near each doorway (`startIn`, at most 10 ways a room) is gone. On CNT-13's flat the hall
  still reads 1.14 m and 0.64 m past the cupboard, and the lab's two-bed hall 1.30 m, so no
  expected value in COD-8's tests changed; the line's `found` says "from end to end" now.
- **A doorway's clear width and the turning circle**: CNT-17 reads them by CNT-13's
  `doorwayClearance` and `turningSpace`, which COD-8 already used: one measure each.
- **Not added**: CNT-17's step at a door (a sill, a largest height) and the steps on the way in.
  Every firm measure is a least size; a largest one needs `at_most`, its own wording and the
  short test turned round. For the owner: a `step` measure for the firm's file is the next one to
  add if wanted.
- **The firm's figures are not set against the numbers in the access answer itself**: that
  answer's `against` holds the person's figure and a confirmed code's only. Adding the firm's as
  a third source changes `grid_measure what=access`'s data; for the owner.

**Apart, each under its own heading.** CNT-17's lines in `grid check` are one not-checked line,
`plan/not-checked-access`, and its numbers are in the access answer under its own head; the
firm's notes stay `firm/` findings under "The firm's own standards"; the code figures' findings
before them. `docs/firm-standards.md` says the corridor, doorway and turning numbers are the ones
`grid_measure what=access` gives.

**Tests changed**: none. The descriptions of `corridor_width` changed in `firm.ts` (its
`measures`, in every firm corridor line's `found`) and in `docs/firm-standards.md`.

**Checks run on the merge** (main at e486ccb): `npm run build`, `npm run typecheck`, `npm run lint`
exit 0. `npx vitest run packages/cli packages/rules packages/floorplan
scoreboard/__tests__/approvalWords.test.ts --maxWorkers=2 --minWorkers=1`: 241 of 241 files,
4,855 passed and 2 skipped, exit 0 (1,179 s). The merge brought main's changes to `scoreboard/`
and the rules' checks, so `npm run scoreboard` ran too: "Same as the stored figures." (Turns 19
of 67, checks 20 of 42, mistakes 5 of 9.) `packages/viewer` and `scripts` were not in this run.
