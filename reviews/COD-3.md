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

- `packages/floorplan/src/types/__tests__/places.test.ts` (12): the list (249 entries, every
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
