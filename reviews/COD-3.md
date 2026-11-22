# COD-3: the place stored with the plan; with no place, no figure, and the report says so

Card: the plan stores its place, and every check reads it. Only known country names and codes
are accepted, and the country's name is printed from Grid's own list. The top of the report says
which figures ran and for which place. With no place stated, no figure is applied, and the
report says so.

## What changed

### The place in the plan

- **`site.country`** (`packages/floorplan/src/types/floorplan.ts`, convention C8 in its header).
  CNT-3's `site` already says where the building sits, every field optional, so the place goes
  there rather than in a new top-level field. It is a country's name or its two- or three-letter
  code on Grid's list, held to a name's limit (120 characters, MSG-9's character rule) and then
  to the list (`placeProblem`). It is kept as written: "United States" stays "United States" in
  the file, and is resolved when it is used.
- A `site.country` the list does not hold is refused by the schema with a message that names the
  rule and never the text. Read from a file, it is left out alone (`readTop` in
  `types/readParts.ts`): the rest of the `site` (origin, latitude, longitude) is kept, and the
  record gets a `plan/value-left-out` line at `site.country`. Before this, any fault inside
  `site` dropped the whole `site`; that is unchanged for every other field of it.
- `packages/cli/src/command/planText.ts` holds `site.country` to a name's limit before the
  schema, like the plan's title.
- MSG-4's unknown-field list reads the schema, so `country` is a known field of the site with no
  list to edit. The sheet's `coverage.ts` already placed `site` (not shown); its reason now says
  the check page names the place. Rooms text needs nothing: `grid write` keeps every top-level
  field it does not write, `site` among them, so writing rooms text over a plan loses no place,
  and the round trip (`buildings.test.ts`) is unchanged.

### Grid's list of places

- `packages/floorplan/src/types/places.ts`: the 249 countries and territories with an ISO 3166-1
  code, each with its alpha-2 and alpha-3 code, the short English name Grid prints, and a few
  other names people use (`USA`, `United States of America`, `UK`, `Great Britain`, `Britain`,
  `Holland`, `Turkey`, `Czech Republic`, `Ivory Coast`, `Burma`, `Swaziland`, `East Timor`,
  `DRC`, `UAE` and a handful more). Written by me as data; codes and names are facts, and no
  table was copied. A test holds it to 249 entries, every code once, and no name or code that
  reads as two places.
- `countryOf(text)` compares with accents, case, dots, apostrophes and a leading "the" set
  aside, `&` read as "and" and "St" as "Saint": `US`, `usa`, ` United States `, `U.S.A.` and
  `the United States` are one place. Text over 60 characters is no place.
- Not on the list, on purpose: names that could mean two places (`Congo`, `Korea`, `Virgin
  Islands`), parts of a country (`England`, `Scotland`, `Wales`: their building rules differ, so
  reading them as the UK would be wrong), and `America`.
- `countryName(code)` and `countryInText(code)` ("the United States", "the Netherlands",
  "Spain") are the only words a report says about a place.

### The check reads the place

- `packages/rules/src/checks/place.ts` (new): `placeFor(plan, options)` gives the caller's
  `country` if one is given, else the plan's `site.country`, else, with `withoutPlace:
  'us-figures'`, the United States as `assumed`, else null. A `country` not on the list throws
  `PlaceRefused`, whose message names the argument ("country names no place Grid knows: …"),
  never the text. `WITHOUT_PLACE = 'no-figures'` is the one default.
- `checkLocalRules` (`check.ts`) reads the place on its own. With none, no figure is resolved
  (looked-up figures included: a lookup is for a place), neither figure check runs, their
  coverage skips every room with the new reason `no_place` ("no place is stated, so no figure
  was applied"), and the report carries `place: null` and `withoutPlace: { usLines }`: the
  findings and notices (`no_use`, `above_escape_storeys`) the figure checks give on the plan
  with the US figures, counted by running them.
- With a place Grid carries no figures for, as before: `plan/not-checked-sizes-for-place` and
  `plan/not-checked-escapes-for-place`, now naming the place from the list ("this plan is for
  Spain", "for the United Kingdom"), never as given (it printed "for ES" before, upper-cased
  from the caller's text: lab T-2).
- `baselineApplies` reads its country through the list, so `USA` is the US (lab CH-3).
- The record (`inspectPlan`, `result/types.ts`) gains `place` and `withoutPlace`.

### The report says it first

- `placeText(report, words)` (`packages/cli/src/command/check.ts`) is the line right after the
  label in `grid check`, `grid_check` and the sheet's check page:
  - "Place: United States, from the plan; figures from US model codes, read for homes."
  - "Place: Spain, from --country; Grid carries no figures for it, so none was applied."
  - "No place is stated, so no figure was applied: the US figures would have given 2 lines.
    State it in the plan as site.country, or give --country." (`give country` for the tool.)
- In the short report the two figure checks that did not run for want of a place are said in one
  line ("Room sizes and escape openings: not run: no place is stated, so no figure was
  applied."), and the kind of building the figures were read for (COD-2) moves into the place
  line, so "Both checks that use figures read them for homes (houses and flats people live
  in)." is no longer printed when every check read them for one kind. The full report keeps
  each check's lines as before. Both serve the byte budget below.

### `--country` and `country`

- `grid check --country` takes a name or a code on the list (it took exactly two letters), is
  refused by its name with exit code 2 otherwise, and never repeats the text. `grid_check` and
  `grid_mark_seen` take the same through `COUNTRY_ARG`, now up to 60 characters (it was 2), and
  refuse by `country`. The resolved code is what reaches the library, and the report says the
  place came "from --country" or "from the country argument".
- `grid_check`'s data gains `place` and `withoutPlace`, in its output schema.

### The scoreboard and the retelling set

- `scoreboard/src/grid.ts` asked each plan's report with no country and with ES. With no place
  now meaning no figure, the first run would have stopped measuring the US figures, so it states
  the US: the two reports are `US` and `ES`. The README says so.
- `scoreboard/retell/cases.json`: every case without a country now has `"country": "US"`, so its
  prompt is built from the same report as before; the Berlin case keeps DE.

### Docs

`docs/plan-file.md` (new section "The place", a row in the text limits, `country` in the site
table), `docs/result-contract.md` (the front door, `place` and `withoutPlace` in the record, the
reason `no_place`, new section "The place", the short report's byte counts, an entry at the top
of the changelog for agents), `docs/commands.md` (`--country`, the place line), `docs/tool-server.md`
(`grid_check`'s row), `packages/rules/README.md` ("Where the plan will be built", the layout),
`packages/floorplan/src/test-support/pinned-tests.md` (CH-3 fixed), and a line under
"Unreleased" in `CHANGELOG.md`.

## The flat's short report

The lab's 62.65 m² flat (`packages/floorplan/fixtures/two-bed-flat.json`) states no place.

| | before | now |
|---|---|---|
| `grid check flat.json` | 988 bytes | 983 bytes |
| `grid_check` text | 973 bytes | 968 bytes |
| `grid check flat.json --country US` | 988 bytes (the same report) | 987 bytes |

Both pins in `shortReport.test.ts` are the new figures, with `< 1000` beside them, and a new pin
holds the flat with the US stated under 1,000 too, so switching `WITHOUT_PLACE` back keeps the
flat inside MSG-10's budget.

## Tests

New:

- `packages/floorplan/src/types/__tests__/places.test.ts` (11): the list (249 entries, every
  code once, upper case; no name or code read as two places); US, USA, United States in any
  case, with dots and spaces, as one place (CH-3); the other names; names refused (`the moon`,
  `Congo`, `Korea`, `England`, `America`, a sentence, a code repeated forty times);
  `countryInText` with and without "the"; `placeProblem` never repeating the text; the schema
  keeping `site.country` as written, refusing one off the list by its path with no text, and
  the reader leaving out only `site.country` and keeping the rest of the site.
- `packages/rules/src/checks/__tests__/place.test.ts` (12): no place, no figure (no finding, no
  figure, neither figure check run, the coverage reason `no_place`); `withoutPlace.usLines`
  equal to the lines of a US run; the plan checks unchanged; `withoutPlace: 'us-figures'` giving
  the US report with `from: 'assumed'`; the plan's place read on its own; the caller's place
  winning; the spellings of the US; hostile places (the moon, an injection-like sentence, 5,000
  characters, an SQL-like one, markup) refused by `country` with no text, and in a plan file left
  out with a `plan/value-left-out` line and never repeated; a mixed-case `  sPaIn  ` named only
  "Spain"; the record's `place` and `withoutPlace`; "the United Kingdom" in a sentence.
- `packages/cli/src/command/__tests__/place.test.ts` (9): `grid check` and `grid_check` with no
  place (the second line, the count matching the lines a US run adds, the data); the plan's
  place read on its own; `--country` and `country` winning, and saying where the place came
  from; a hostile `site.country` left out and never in the output; the five spellings of the US
  giving byte-identical reports; hostile `--country` refused with exit code 2 and one fixed
  line; hostile `country` refused by `grid_check` and `grid_mark_seen` by name; mixed-case and
  three-letter Spain never reaching any output, text or data, and no approval word in any.

Changed, each file named:

- `packages/cli/src/command/__tests__/shortReport.test.ts`: the flat's default report is now
  the no-place one: the second line is the place line, the figure checks are one "not run"
  line, "Checks run: 4", and the pins are **983** (`grid check`, was 988) and **968**
  (`grid_check`, was 973). "Both checks that use figures read them for homes …" is gone (the
  place line says "read for homes"). A new test pins the flat with `--country US` at **987**,
  and the tool with `country: 'US'` under 1,000. The `--full` test passes `--country US`, so it
  still holds six figures. The loft tests already passed `country: 'US'`.
- `packages/cli/src/command/__tests__/grid.e2e.test.ts`: "prints the report with its label
  first …" passes `--country US`, so it still tests the figure checks' "no use stated"; the
  refusal case `--country Spain` (refused before, a place now) became `--country "the moon"`,
  refused with "--country names no place Grid knows".
- `packages/cli/src/command/__tests__/init.e2e.test.ts`: "a plan named on the command line
  still wins" passes `--country US`: the line it looks for, "not checked, floor" (no use
  stated), comes from the room-size check.
- `packages/cli/src/command/__tests__/coverage.test.ts`: the café (CH-2) test expects the kind
  of building in the place line (second line) in place of "The check that uses figures read
  them for homes (…)" in the counts.
- `packages/rules/src/checks/__tests__/rules-escape.test.ts`: the `bedroom()` plans state
  `site: { country: 'US' }`; the expected-failure probe CH-3 is fixed and is a normal test now
  (USA, United States, ` united states `, `u.s.a.` and United States of America the same as US;
  `the moon` refused); "this plan is for ES" became "for Spain". The empty "known failures"
  block was removed.
- `packages/rules/src/checks/__tests__/rounding.test.ts`: the `room()` plans state the US.
- `packages/rules/src/checks/__tests__/rules-room-size.test.ts`, `rules-messages.test.ts`,
  `merge.test.ts`: every one-argument `checkLocalRules(p)` became `checkLocalRules(p, US)`
  (7, 5 and 3 calls).
- `packages/rules/src/checks/__tests__/rules-lookup-figures.test.ts`: the same for its one-argument
  calls, and `country: 'US'` with the looked-up figures (a lookup is for a place). "is the same
  with an empty figure list, and with the US stated" compared a report with no country to one
  with `us`; now it compares `us`, `USA`, `United States` and a plan stating `usa` with the US
  (renamed "… with the US however it is written"). "this plan is for ES" and "for IT" became
  "Spain" and "Italy".
- `packages/rules/src/checks/__tests__/coverage.test.ts`: `no_place` is among the reasons
  worded; "a room that cannot be drawn …" passes the US; a new case checks the `no_place` skip.
- `packages/rules/src/notes/__tests__/notes.test.ts`: its hand-made `RulesReport` gains `place`
  (a required field now), and nothing else.
- `packages/floorplan/src/test-support/pinned-tests.md`: CH-3 moved from the expected failures
  to the fixed ones. The pinned `is false for any other country` is unchanged and passes.
- `scoreboard/retell/cases.json`: each case without a country states `"country": "US"`, so its
  prompt is built from the same report as before (the retell tests pass unchanged).

Nothing was removed but the expected-failure wrapper of CH-3.

## Scoreboard

`npm run scoreboard` gives the same five counts and guards as stored ("Same as the stored
figures"), so `scoreboard/current.json` is unchanged. Its report runs now state their place,
`US` and `ES` (they were no country and `ES`): the "no country" run measured the US figures, and
with no place now meaning no figure it would have stopped measuring them. With the US stated,
every count is as before.

## For the owner

1. **With no place, no figure (lab W-12), and the switch back.** COD-1 (who the figure checks are
   for) is still yours. Until then a plan that states no place gets no figure: no room size or
   escape note. The switch back is one constant, `WITHOUT_PLACE` in
   `packages/rules/src/checks/place.ts`: `'us-figures'` applies the US figures to such a plan,
   as before COD-3, and its report says "Place: United States, assumed, as none is stated; …".
   The library also takes it per call (`withoutPlace`). I added no command option or tool
   argument for it: for one check, `--country US` (or `country: "US"`) does the same thing and
   says where the place came from, so a second option would be a second name for it. With the
   switch back, the flat's short report is 987 bytes, still under MSG-10's 1,000 (pinned).
2. **The place lives in `site.country`**, not a new top-level field: CNT-3's `site` is where the
   building is, every field optional, and a problem report (CMD-13) already drops `site`. It is
   kept as written ("usa" stays "usa"); every report names it from the list. If you would rather
   the file held the two-letter code only, that is a transform in the schema.
3. **No line for "no place"**. The brief suggested a new not-checked code. I tried it: one line
   with what was found, needed and the fix is about 300 bytes, and the flat's short report went
   to about 1,150, past MSG-10's pin. So "no place" is said on the report's first line after
   the label (the done-when), in the record (`place: null`, `withoutPlace.usLines`) and in each
   figure check's coverage (`no_place`), and the record's `count` does not include it. A line
   is easy to add (a code in `catalogue.ts`, a notice in `check.ts`) if you would rather have it
   in the count and give up the pin, or make the pin larger.
4. **The list**: the 249 places with an ISO 3166-1 code, territories included (Antarctica,
   Bouvet Island), as the standard assigns them; written by me as data, in short English names
   (Czechia, Türkiye, Côte d'Ivoire, Eswatini, North Macedonia), with other names as aliases. I
   left out names that could mean two places (Congo, Korea, Virgin Islands), `America`, and the
   parts of the UK (England, Scotland, Wales, Northern Ireland): their building rules differ,
   and reading "England" as the UK would hide that. Kosovo (XK) is not an assigned code and is
   not on the list. Names in other languages (España, Deutschland) are not on it either.
5. **Precedence**: the caller's place over the plan's; the report says which ("from --country",
   "from the country argument", "from the plan").
6. **The place line names the kind of building by its word** ("read for homes"), without COD-2's
   "(houses and flats people live in)", and the short report no longer prints "Both checks that
   use figures read them for homes (…)": with the gloss, the flat's report with the US stated was
   1,071 bytes, over MSG-10's budget. The notes that used a figure and the full report still
   say it in full.
7. **`grid_areas`'s `country`** (ARE-8's usual gross measure) is not a check and still takes a
   two-letter code of its own; it does not read `site.country`. Making it read the plan's place
   is a small change if you want one place for everything.
8. **Rooms text has no `place` statement.** `grid write` keeps `site` as the file has it, so
   nothing is lost; a plan written from rooms text from nothing has no place until one is
   written in the file. A `place` line in rooms text would be a WRT-2 change.
9. **A library caller's unknown `country`** throws `PlaceRefused`; `inspectPlan` still never
   throws (the plan checks' stage becomes a `plan/check-failed` line naming `country` and the
   rule). The command and the tool refuse it before that, by name.

## Checks run

Before merging `main`:

- `npm run typecheck`, `npm run lint`, `npm run build`: clean.
- `npm run scoreboard`: "Same as the stored figures" (counts above).
- `packages/rules` (370 tests), then `packages/cli`, `packages/viewer`, `packages/floorplan` and
  `scoreboard` (222 files): 9 failures, every one an expectation listed under "Changed" or the
  word "pass" in the first draft of the place line (MSG-3's `approvalWords` over the lab plans;
  it now says "give --country"). All fixed and rerun.

After merging `main` at 56458e5 (CNT-5, what kind of building it is; conflicts in `check.ts`,
`coverage.ts`, `figures.ts`, the CLI's `coverage.test.ts` and the contract, each kept both sides:
a figure check runs where the place has figures and the building's kind is one they were read
for, and the no-figures-for-place notice is skipped with no place):

- `npm run build`, `npm run typecheck`, `npm run lint`: clean.
- `npm run scoreboard`: "Same as the stored figures"; `scoreboard/current.json` unchanged.
- The affected tests (rules, floorplan types and rooms, the commands, the tool server, the
  sheet, the edits, and the scoreboard's approval-words, retell and building-uses tests): 78
  files, 1,291 passed, 1 skipped.
- The full suite, `npx vitest run --exclude '.claude/**' --maxWorkers=2 --minWorkers=1`: 252
  files passed, 4,889 tests passed, 2 skipped, none failed.

## Merging main again, at 25747b7 (SHT-11, CNT-13)

Conflicts, each resolved by keeping both sides:

- `CHANGELOG.md`, "Unreleased": COD-3's line and CNT-13's line, COD-3's first.
- `docs/result-contract.md`, the agents changelog: COD-3's entry on top, then CNT-13's and
  SHT-11's, then the rest as on `main`.
- `packages/floorplan/src/test-support/pinned-tests.md`, the fixed-failures table: the CH-3 row
  (COD-3) and the S-8 row (CNT-13).

No code conflicted: CNT-5's gate on the kind of building was already merged at 56458e5, and the
figure checks run only where both hold (a place with figures, and a home or no kind stated).

One change made in this merge, for the case the coordinator asked about: the US stated, and a
building that is not a home. The place line said "no figure was applied: the checks that use
figures had nothing to look at", which hid the reason. `placeText` now says "Place: United
States, from the plan; no figure was applied: its figures were read for homes, and the plan says
this is an office." (or, when each floor is another kind, "the plan says each of its floors is a
kind of building they were not read for"). The `…-for-building` lines and the coverage reason
`not_for_building` are CNT-5's, unchanged, so the two reasons are distinct: the place in the
first line and `place`, the kind of building in its own lines and coverage. With no place and an
office, the first line is the no-place line and the two `…-for-building` lines follow; with Spain
and an office, "Grid carries no figures for it" and the same two lines. Three new cases in
`packages/cli/src/command/__tests__/place.test.ts` ("a place and a kind of building"), and a
paragraph in the contract's "The place". No existing test changed in this merge.

The flat states no building and no place, so its short report is as before: 983 bytes from
`grid check`, 968 from `grid_check`, 987 with `--country US` (the pins in `shortReport.test.ts`
pass unchanged).

Checks run after merging `main` at 25747b7:

- `npm run build`, `npm run typecheck`, `npm run lint`: clean.
- `npm run scoreboard`: "Same as the stored figures" (checks fed 14 of 42, as stored on `main`);
  `scoreboard/current.json` unchanged.
- `npx vitest run packages/cli packages/rules packages/floorplan packages/viewer scoreboard
  --maxWorkers=2 --minWorkers=1` (every package the merge touched, the scoreboard's
  approval-words and retell tests among them): 251 files passed, 4,849 tests passed, 4 skipped,
  none failed.

## Merging main at b58930a (LVL-4)

LVL-4 adds `site.ground`, the ground level, beside COD-3's `site.country`. Conflicts, each kept
both sides:

- `packages/floorplan/src/types/floorplan.ts`, `SiteSchema`: `ground` and `country` side by side.
  The reader's unknown-field list comes from the schema, so it knows both; `readTop` still leaves
  out a bad `site.country` alone and keeps the rest of the site, `ground` among it. `ground` is a
  number, so `planText.ts` needs no limit for it.
- `packages/cli/src/sheet/coverage.ts`, `site`: LVL-4's reason (the ground is read by the checks,
  no drawing shows it) with COD-3's sentence (the check page names the place).
- `docs/plan-file.md`, the `site` row: LVL-4's `ground` sentence, then COD-3's `country` one.
- `docs/result-contract.md`: the agents changelog has COD-3's entry first, then LVL-4's; the
  short-report paragraph gives the new byte counts below.
- `packages/rules/src/checks/__tests__/rules-lookup-figures.test.ts`: COD-3's `US` constant, and
  LVL-4's `PLAN_RULES` (which also leaves out `openings-above-ground`).
- `packages/cli/src/command/__tests__/shortReport.test.ts`: COD-3's tests, with LVL-4's changes
  folded in (below).

**The flat's byte counts.** LVL-4 adds a coverage line to every plan that states no ground level
(its check of openings below the ground looked at nothing), and a tenth line to the limits. That
line alone is 213 bytes from `grid check` and 211 from `grid_check`, so on `main` the flat's
report is over MSG-10's 1,000 bytes (1,201 and 1,184), and LVL-4 pins it so: the full count, and
the count without the ground line under 1,000 (its review, "For the owner"). Re-measured here and
pinned the same way:

| | full | without the ground line |
|---|---|---|
| `grid check`, no place | 1,196 | 984 |
| `grid check --country US` | 1,200 | 988 |
| `grid_check` text, no place | 1,179 | 969 |

Each "without" figure is one byte more than before the merge: "(9)" became "(10)" in the line
on what `--full` adds. The coverage counts are 8 (were 7) and the limits 10 (were 9) in every
expectation of `shortReport.test.ts`.

One of LVL-4's own tests needed the place: `packages/rules/src/result/__tests__/ground.test.ts`,
"the floor at grade (LVL-4)", checks which escape figure a bedroom is held to, with no place
stated; with no place no figure applies, so both cases failed. Its `upstairs()` plan now states
`site: { country: 'US' }` beside its `ground`, and both pass with what they tested. No other test
changed in this merge.

Checks run after merging `main` at b58930a:

- `npm run build`, `npm run typecheck`, `npm run lint`: clean.
- `npx vitest run packages/cli packages/rules packages/floorplan packages/viewer
  scoreboard/__tests__/approvalWords.test.ts scoreboard/__tests__/retell.test.ts
  --maxWorkers=2 --minWorkers=1`: 248 files, 4,853 passed, 2 skipped, 2 failed: the two cases of
  `ground.test.ts` above. After the fix, `packages/rules` alone: 23 files, 380 passed.
- `npm run scoreboard` (the merge brought changes to the rules' checks and `scoreboard/`):
  "Same as the stored figures" (checks fed 15 of 42, as stored on `main`).
