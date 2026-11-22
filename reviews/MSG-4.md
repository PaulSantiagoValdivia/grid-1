# MSG-4 review: unknown words and fields are named, not dropped

For the owner. MSG-4 (step 2) makes Grid say what a plan file holds that it does not read. Until
now the schema dropped an unknown field and read an unknown room use as "no use stated", on
purpose and in silence: `thick` for `thickness` left a wall at 0.2 m, and `{}` gave nothing to
look at (lab MS-1, AU3-3, W-5).

## What MSG-4 adds

1. **`readingNotes(raw)`** in `@ongrid/floorplan/types/reading` (`packages/floorplan/src/types/reading.ts`,
   a new export of the package). It reads the file as parsed JSON, beside the schema, before the
   schema throws anything away. It lists each field no part of the format has (on the plan, a
   wall, a room, an opening, a floor, a fixture (CNT-12's `items`), the trace image or the
   `written` record), each room use
   Grid does not know, and a plan with no walls, rooms or openings. The fields a part has are
   read from the schema itself, so a field added to the format (CNT-12's fixtures, LVL-3's
   stairs) is known here the moment it is added, with no list to keep.
2. **The nearest word.** A field gets one only when it was most likely meant: the same word in
   other capitals or joins (`Thickness`, `floor_offset`), a known word it starts (`thick` for
   `thickness`), or one letter added, taken out or swapped with its neighbour (`heigth`,
   `heights`). A letter *replaced* is not counted, so `roofs` is not offered `rooms`. A room use
   is also matched by meaning through a short table of my own (`toilet` → bathroom, `lounge` →
   living, `hallway` → corridor, `stairs` → stair, `closet` → storage, …). The suggestion is
   only words in a line: Grid never reads one word as another.
3. **A room use is read whatever its capitals.** `Bedroom` is `bedroom` (`readUse` in the
   schema). Nothing else is folded: wall kinds and opening types are still refused when their
   capitals differ, as before.
4. **Three new codes in the catalogue and the contract**, all `worth-a-look`, leading the lines
   of that kind (they may explain the others):
   - `plan/unknown-field`: `Wall "s1" has a field Grid does not know, "thick"`. Found: `"thick"
     at walls[0], which Grid does not read; the nearest field it knows is "thickness"`. Needed:
     the fields that part has. Fix: `Did you mean "thickness"? Rename "thick" to "thickness".
     Until then Grid reads the plan without it.` When the part already has the field meant, the
     fix says to take the stray one out or move its value.
   - `plan/unknown-use`: `Room "Office" has a use Grid does not know, "office"`, with the uses
     Grid knows and, when one is near, "Did you mean …?"; otherwise "write "other"".
   - `plan/empty`: `The plan has nothing in it: no walls, rooms or openings`.
   A field name or use that breaks MSG-9's text rule is never repeated ("with a name Grid does
   not repeat"). The contract (`docs/result-contract.md`) has their rows, a section "Words Grid
   does not read" and a changelog entry dated 2026-11-22.
5. **`grid check` and `grid_check` read the file as written.** `loadPlan` keeps the parsed JSON
   (`LoadedPlan.raw`), and `checkPlan` gives it to `inspectPlan`; before, it gave the plan after
   the schema, which had already dropped the words. The edit tools' `toLookAt` now counts the
   file as written before and after the change. An edit patches the file and keeps an unknown
   field, so the field is counted on both sides.

## Against `done_when`

1. *`thick` on a wall gives "unknown field thick, did you mean thickness"; `{}` gives an
   empty-plan warning (MS-1).* `packages/rules/src/result/__tests__/result.test.ts` ("names
   thick on a wall, and the field meant") holds the whole line; the CLI test
   `packages/cli/src/command/__tests__/wordsNotRead.test.ts` holds what `grid check` prints. `{}`
   gives `plan/empty` (and, since MSG-2, `plan/not-checked-no-rooms` beside it).
2. *Each of AU3-3's 38 unknown field names and 20 unknown uses gives a warning; 'Bedroom' is
   read as bedroom.* `packages/floorplan/src/types/__tests__/reading.test.ts` holds all 58. Of the
   38 fields, 36 are named; `floors.elevation` and `floors.height` are fields since LVL-1, so the
   test asks the schema whether it keeps each field and expects a line exactly when it does
   not. That way, when CNT-12 (fixtures) or LVL-3 (stairs) lands, those words stop being named
   without the test changing. Of the 20 uses, 19 are named and `Bedroom` is read as `bedroom`
   with no line (see decision 1). Only `thick` gets a field suggestion; `toilet` and `lounge`
   get a use suggestion.
3. *Of the 338 lab plans that pass with 0 issues, the 33 with an unknown use or a dropped field
   now each get a line (W-5: 19 and 14).* `scoreboard/__tests__/wordsNotRead.test.ts` reads the
   19 and the 14 from the scoreboard's stored lab plans and expects `plan/unknown-use` on each of
   the first and `plan/unknown-field` on each of the second. They are 31 plans, not 33: two are in
   both lists (`G/scenarios/s02b-terrace-porch-words.json` and `G/scenarios/s03b-flat-balcony-words.json`).
   All 31 get their line. Across the 1,131 stored lab plans the two codes give 171 use lines and
   126 field lines. The W-5 plans that hold `stairs` or `fixtures` (LVL-3, CNT-12) each have
   another word Grid still does not read, so the test holds after those land too.

## Expected texts and figures I changed

- `packages/rules/src/result/__tests__/result.test.ts`: `inspectPlan({})` was `count: 0` ("MSG-4
  is to say so"); it is now `count: 2`: `plan/empty`, and MSG-2's `plan/not-checked-no-rooms`, which
  landed in parallel. I kept both, as the coordinator asked: one says the file holds nothing, the
  other that the room checks did not run. The CLI test expects the same two. Its corpus has two more plans, the
  words-not-read plan and `{}`. The test that compares the record with `checkLocalRules` now gives
  the check the plan as read (`FloorPlanSchema.parse`), since a file with `Bedroom` is read as
  `bedroom`.
- `docs/result-contract.md`: three rows, a section, a changelog entry, and the `worth-a-look`
  kind says it now leads with these lines.
- Scoreboard counts: none moved (`npm run scoreboard`: "Same as the stored figures"). Its runner reads plans with the schema and counts the drawing's issues, not the record (see the follow-ups); reading `Bedroom` as `bedroom` in the two lab plans that write it moved none.

## Decisions for the owner

1. **`Bedroom` gives no line.** The card says both "a room use is accepted whatever its capitals"
   and "each of the 20 unknown uses gives a warning". I read `Bedroom` as a use Grid knows, so it
   is not unknown and gets no line; the other 19 do. If you want a line saying "read as
   bedroom", it is one more code (`plan/use-capitals`), but it would add to the one count for a
   word that was understood.
2. **"Did you mean" is in `found` and `fix`, not in `message`.** MSG-1's rule is one wording per
   code (AU4-1, tested), and a message that sometimes ends "did you mean …?" would be worded two
   ways. So the message is always `{thing} has a field Grid does not know, "{field}"`, and the
   suggestion opens the fix. `grid check` prints both.
3. **One line per word per part.** Fourteen walls with `status` are fourteen lines (W-5 counted
   35 fields the same way). Grouping them into one line would need a wording for "14 walls
   have", which is a second wording for the code. The lines are about their parts, so
   `grid check --floor` keeps each on its floor.
4. **A plan the format refuses gets no reading lines.** The contract says a refused plan's lines
   are its refusals and nothing else ran; I kept that.
5. **The use table is mine, and short.** It is suggestions only. `garage`, `office`, `classroom`,
   `balcony` and the like get no suggestion and are told to write "other". Check whether
   `hall` → corridor and `store` → storage read right to you.
6. **The kind is `worth-a-look`**, not a new kind. A new kind is a new key in `counts`, which the
   contract does not promise is safe to add; a new code is.

## Not done here, worth a follow-up

- **Rooms text still refuses `Bedroom`.** `grid write` (WRT-2, `rooms/compile.ts`) checks a use
  letter for letter. Making it fold capitals too is one line, but WRT-3 is changing that file in
  parallel, so I left it.
- **A `written` record that cannot be read is still read as unstated in silence** (`.catch` in the
  schema). Unknown keys inside it are named; a broken one is not. That is WRT-2's field.
- **The scoreboard's own runner** (`scoreboard/src/grid.ts`) reads plans with `parseFloorPlan`
  and counts the drawing's issues, not the record, so its counts do not see these lines.
  Counting them would raise `soundPlansWithAlarm` for plans with made-up fields.
- **The sheet** (`grid sheet`) is not on the record yet (MSG-1), so it does not show these lines.

## Checks run (on top of main fc78ff7, with CNT-12 and MSG-18)

The machine was under load of 220 to 270 the whole time, from the parallel sessions.

- `npm run build`, `npm run typecheck`, `npm run lint`: pass.
- `npm run check:licenses`: 363 licences, none GPL, LGPL, AGPL, MPL or EPL.
- `npx vitest run --exclude '.claude/**'`: 4,251 of 4,253 pass. Two timing tests fail, both
  under load: `grid.e2e.test.ts` "answers grid check on the sample flat in under half a second"
  (median 4.0 s) and `diff-size.test.ts` "the size guard" (21.9 s). Run alone, the size guard
  passes; the speed test still fails at 4.1 s with the load at 268. Run by hand,
  `grid check packages/cli/fixtures/two-bed-flat.json` takes 0.18 to 0.46 s, so the time goes to
  starting processes under load. The reading walk is one pass over the file's keys.
- `npm run scoreboard`: "Same as the stored figures"; no count moved.

### Again after merging main e7cf925 (MSG-2, CMD-15, QAR-10)

Conflicts in `docs/result-contract.md` (both changelog entries kept), `packages/cli/src/command/check.ts`
(MSG-2's `coverage` and `rooms`, from the record of the file as written) and the `{}` test (both
lines kept). `npm run build`, `npm run typecheck` and `npm run lint` pass. The tests for the
touched packages (floorplan types, rules result, cli command, mcp and `src/__tests__`): 638 of 638.
`npm run scoreboard`: "Same as the stored figures". One full run,
`npx vitest run --exclude '.claude/**' --maxWorkers=2 --minWorkers=1`: 4,375 of 4,375 pass, the
timing tests among them.
