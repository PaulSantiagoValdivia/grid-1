# MSG-5 review: notes traced to their cause

Card: "Notes traced to their cause: no false notes from one broken part, follow-ons grouped."
When a check depends on a part Grid couldn't draw, it gives no note but a "not checked because"
line naming that part. Every follow-on issue carries the id of its cause and is filed under it.
Identical notes become one line that lists the rooms. Lab evidence MS-4, MS-5, MS-14, W-6, W-7,
M-9.

## What changed

1. **The drawing check names each issue's cause** (`packages/floorplan/src/geometry/validate.ts`,
   `Issue.causedBy`, set where the issue is raised):
   - `opening/broken-wall` and `room/broken-wall`: the wall (a wall the reader left out first).
   - New `plan/no-walls` (error): the plan has no walls, but its rooms and openings name walls.
     Every `opening/missing-wall` and room outline line then follows from it (`causedBy: "plan"`).
   - `floor/unclaimed`: the room that could not be drawn, or that the reader left out, which lists
     at least two of the walls round the piece.
   - A wall that stops short or leaves a gap (`wall/short`, `wall/gap`): its rooms' outline lines
     (`room/space-mismatch`, `room/not-enclosed`, `room/overlap`) and the walls found standing in
     them (`wall/crosses-room`, `wall/stands-in-room`).
   - `validatePlan` takes `leftOutParts`, what the reader left out, for the unclaimed floor.
2. **The reader says what it left out** (`types/readParts.ts`): `PlanRead.leftOut`, each wall,
   room and opening it left out (`part-left-out`, `id-clash`) with its id, floor and the walls it
   names, when they can be read.
3. **Notes held back** (`geometry/rules/held.ts`, new, pure). `planDamage` works out, floor by
   floor, what could not be drawn: what `drawable` leaves out, what the reader left out, and
   openings no floor holds (on a wall the plan does not have: lab M-9, which listed nothing as not
   checked). W-6's rule: a way out or a route is held when anything on its floors could not be
   drawn; "no door" when the room shares a wall with a room or opening that could not be drawn,
   or an opening could be placed on no wall; a door into a space not drawn when a room that could
   not be drawn rests on its wall, or any room on its floor could not be drawn (a room whose wall
   list is cut short may be that space); an escape note when an opening on the room's walls could
   not be drawn, or on no wall. `checkPlanSanity(plan, { leftOut })` holds its own; `checkLocalRules`
   holds the escape notes. A held note goes on the floor's `cannot_be_drawn` notice, `held`, with
   the ids it waits for. `coverage` moves those parts to skipped, reason `waits_for_part`.
4. **The "could not be drawn" lines say so** (`rules/messages.ts`): "On "Ground floor", these
   rooms could not be drawn, so they and what rests on them were not checked: "Corridor"", and the
   same for doors or windows, which are now named. In the record their `found` lists the notes
   held back in words, and `held` holds them as data (`{ code, thing, floor, also, waitsFor }`).
5. **The record** (`packages/rules/src/result/`):
   - `causedBy: { code, id }` on a line that follows from another, which then comes right under
     it, whatever its kind. The cause is the first line about that part, a part left out before
     one worth a look: the reader's, the drawing's, `plan/duplicate-id` for an id two walls share.
     The record links one more chain itself: a plan that may not be in metres
     (`plan/units-question`) files `plan/far-from-origin`, the size questions, `room/too-small`
     and the escape-window findings under it, and it follows from the reader's `plan/value-left-out`
     for a stated unit read as metres.
   - `problems`: the lines with no cause, `not-checked` aside.
   - Identical findings are one line (`each`): one code, one floor, the same `found`, `needed`,
     `fix` and figures. The names go where the one name goes and the verb agrees (`PLURALS` in
     the catalogue: "have", "are", "The windows of", "Doors from"). The report and the notes on
     the plan keep one per room.
6. **`grid check`** sets a follow-on under its cause with "follows from: "stub" (wall/zero-length)",
   prints "1 problem; 2 lines follow from it." after the counts, and "held back: room "b"
   (room/no-door), waits for "a"" under the line that holds it. Its report is given what the
   reader left out (`LoadedPlan.leftOut`), so report and record hold back the same notes.
   **`grid_check`** returns `problems`, `causedBy`, `each` and `held` in its schema, and says
   "Follows from …" in its text.
7. The contract: the fields, a section "Causes and follow-ons", `plan/no-walls` in the code table,
   the two new wordings, the reason `waits_for_part`, and a changelog entry.

## Against done_when

1. *The plan with one undrawable corridor gives 0 false notes and one 'not checked because' line
   naming the corridor (MS-4: 16 false notes).* The lab's co-living floor (D-13) draws today, since
   ARE-1; the test lists its corridor's walls out of order so it cannot be drawn, which gave 16
   notes before (15 "no door", 1 "no door to the outside"). Now: 0 findings, one `not-checked`
   line, "On "Ground floor", these rooms could not be drawn, so they and what rests on them were
   not checked: "Corridor"", holding the 16 notes, each waiting for `corridor`; 1 problem. The plan
   as the lab wrote it still gives 0 lines. `scoreboard/__tests__/causes.test.ts`, "MS-4".
2. *W-7's 67 lines read as about 26 problems, with their follow-ons beneath.* E's 26 fault plans
   gave 104 lines before MSG-5 (Grid has more checks than in the lab). Now 95 lines (11 notes held
   back, four pairs of identical notes made one, a few not-checked lines and `plan/no-walls`
   added), read as 30 problems with 48 lines filed beneath
   them. After merging `main` 6fce2ae (WRT-7 reads f01's millimetres and f02's feet as stated,
   one line each and no units question), 90 lines, 30 problems, 43 beneath. The empty walls list is 1 problem with 19 lines under it; the zero-length wall 1 problem
   with 5 beneath and the not-checked line. The test checks every follow-on sits under its cause.
   Of the 4 above the lab's 26: three walls that run past their corner because the wall they met
   was left out (f20), and a floor slip whose cause is a wall on the other floor with no line of
   its own (f15). Same test file, "W-7".
3. *Twelve identical escape notes become one line listing the twelve rooms (MS-14).* The lab's
   hotel: one `room/escape-window-too-high` line, "The windows of "Room 301", … "Room 312" are too
   high to escape through", `each` the twelve rooms, `also` the other eleven ids. Same test file,
   "MS-14".

Smaller tests: `packages/floorplan/src/geometry/__tests__/held.test.ts` (the rule, a true note
held while a part on its walls is broken and given again once it is fixed, a note on a room no
broken part touches still given, the reader's parts, each `causedBy`),
`packages/rules/src/result/__tests__/causes.test.ts` (an escape note held and its coverage, two
identical notes in one line, the units chain) and `packages/cli/src/command/__tests__/causes.test.ts`
(the text of `grid check` and `grid_check`).

## Expected texts I changed

- `packages/cli/src/command/__tests__/coverage.test.ts`, the hotel (COD-2): its twelve sill notes
  were twelve lines; they are one line with `each` of twelve. The `needed` text it checks is the
  same.
- `scoreboard/__tests__/frontDoor.test.ts` and `packages/rules/src/result/__tests__/result.test.ts`:
  `wordingOf` reads a line for several rooms back to its one room's words with the catalogue's
  `PLURALS` before comparing. No expected wording changed.
- No other expectation changed: no existing test pinned the old wordings of
  `floor/not-checked-rooms-not-drawn` or `floor/not-checked-doors-not-drawn`.

## For the owner

1. **One line per floor, not one per held note.** The card asks for one "not checked because"
   line naming the part. I put the held notes on the floor's existing "could not be drawn" line
   and reworded it to say "so they and what rests on them were not checked", rather than adding a
   second line. The notes are in `held`, and in words in `found`.
2. **The record's order changed a little.** A line that follows from another now comes right
   under it, even when its kind comes later (enclosed floor no room claims, worth a look, under
   the room left out). The lines with no cause keep the kind order. `resultVersion` stays 1: I
   read this as a refinement of order, which the contract already says may change within a kind.
   If you read it as a change of meaning, the version should go to 2.
3. **Held notes that are true.** W-6's caveat holds: "no door" on a room with truly no door is held
   while a wall it shares carries a broken part. A test shows it comes back once the part is fixed.
4. **An opening placed on no wall** (its wall is not in the plan) counts as not drawn on every
   floor, since it could be any room's door. On a plan of several floors each floor's line names
   it. A likelier floor could come from the wall most likely meant (MSG-7); I did not do that.
5. **The units chain** files size findings under `plan/units-question`. They are still listed, and
   they would mostly go away once the units are right; a real finding on a plan typed in
   millimetres would stay after the fix.
6. **Grouping is in the record only.** The notes drawn on the plan, the sheet's pages and the
   report's `findings` stay one per room, so each note still has its room to sit in. `grid draw`
   marks a grouped line on its first room only.
7. **Plurals.** Grouped lines put the names where the one name goes and make the verb agree
   through one table, `PLURALS`; the one-wording tests read lines back with it. The alternative was
   a singular verb after a list ("…, "Bedroom" has no door").
8. **Not traced**: the walls that run past their corner because the wall they meet was left out
   (f20), and rooms on a floor slip (f15), which would need a line for the wall on the other
   floor. Both stay problems of their own.
9. **A seen mark on a line for several rooms** (after merging MSG-10). The grouped line is one
   note, keyed by its code, its first room and the others in `also`, so marking it holds every
   room with its outline, and a change to any room brings it back. A mark made on one room's
   note before the rooms were one line (or on the line when it named other rooms) finds the
   line but never holds: the line is back, naming the rooms that joined or left, rather than
   seen. The alternative was to hold the line as seen when every room in it had a mark of its
   own that still holds; I took the stricter reading, since a mark on one room says nothing about
   the others. A line that splits apart again (one room's note now reads differently) is new,
   not back: its rooms' notes are notes the person did not mark. MSG-10 is not published, so no
   marks file in use holds marks from before grouping.

## Checks run

On top of `main` 666bb01:

- `npm run build`: passes.
- `npm run typecheck`: passes.
- `npm run lint`: passes.
- `npm run check:licenses`: "Checked 363 licences in package-lock.json: none is GPL, LGPL, AGPL,
  MPL, EPL."
- `npm run scoreboard`: "Same as the stored figures." No count moved, so `current.json` is
  unchanged. Holding a note back still prints a new line for damage (the not-checked line names
  the part), so "damage that passes in silence" stays 386.
- `npx vitest run --exclude '.claude/**' --maxWorkers=2 --minWorkers=1`: 239 test files passed;
  4,673 tests passed, 3 skipped (4,676).

### Again after merging `main` 6fce2ae (MSG-3, MSG-16, WRT-7)

Conflicts kept both sides: the contract's changelog (MSG-5 above MSG-3, MSG-16 and WRT-7), the
exports of `rules/src/result/index.ts` (`problemsIn` and `approvalWords`), the imports of
`readTools.ts` and `validate.ts`, and the hotel test, which keeps one line for twelve rooms with
MSG-3's "the figure used here" `needed`.

Two expectations changed because WRT-7 reads `"units": "mm"`, `"cm"`, `"ft"` and `"in"` in that
unit:

- `rules/src/result/__tests__/causes.test.ts`, "a plan that may not be in metres": the plan now
  states `"yd"`, a unit Grid still does not read, so the size findings still sit under the units
  question, and that question under the unit line.
- `scoreboard/__tests__/causes.test.ts`, W-7: 95 lines with 48 beneath became 90 with 43; the
  problems stay 30. f01 and f02 are one `plan/read-as-meant` line each.

After the merge: `npm run build`, `npm run typecheck` and `npm run lint` pass. The tests of
`packages/floorplan`, `packages/rules`, `packages/cli` and `scoreboard/__tests__`: 4,169 of 4,169
pass, 3 skipped (two failed before the two changes above, then passed). `npm run scoreboard`:
"Same as the stored figures".

### Again after merging `main` 56458e5 (SHT-4, CNT-3, MSG-10, CNT-5)

Conflicts, each keeping both sides:

- `docs/result-contract.md`: the changelog keeps every entry, newest first: MSG-5, then CNT-5,
  MSG-10, CNT-3, SHT-4 and ARE-13 as `main` has them. The code, field and reason tables merged
  without conflict and hold both sides' rows (`plan/no-walls`, the four `…-for-building` codes,
  `problems`, `causedBy`, `each`, `held`, `seenCount`, `waits_for_part`, `not_for_building`).
- `packages/rules/src/checks/check.ts`: the imports of both; every floor is drawn first for
  `planDamage`, then CNT-5's building gate runs; the escape check runs only where the plan's kind
  of building reads it (CNT-5) and, where its figures ran, each finding on a broken part is held
  back (MSG-5).
- `checks/types.ts`: `NotChecked` keeps both `held` (MSG-5) and `building` (CNT-5).
- `checks/coverage.ts`: both import lines (`RuleFinding` for `heldCoverage`, the building texts
  for `skipWhy`); `SKIP_ORDER` holds `not_for_building` and `waits_for_part`.
- `result/catalogue.ts`: the imports of both; every code of both sides kept its one wording.
- `result/inspect.ts`: CNT-3's orientation lines come first, then MSG-5's units chain, so the
  chain sees every line.
- `packages/cli/src/command/check.ts`: MSG-10 moved a line's text into `lineText`; it now sets a
  follow-on under its cause with "follows from" (also in the Seen list) and the notes held back.
  The count line is MSG-10's, with MSG-5's problems sentence after it.
- `packages/cli/src/mcp/readTools.ts`: MSG-10's short text and `toolLine`, which now says
  "Follows from …" in place of the fix for a follow-on; the schema holds `problems`, `causedBy`,
  `each`, `held` and `seen`; the data holds `problems` beside MSG-10's seen fields.

**Seen marks on a grouped line.** MSG-10 keys a mark by `code`, `thing` and `also` (as a set),
and hashes each part: the thing, every `also` id, a room with its outline walls. A grouped line's
thing is its first room and `also` the others, so the mark already covers every room: marking it
holds on the next check, and a change to any one room brings it back naming the part. New:
`earlierNote` in `packages/cli/src/seen/marks.ts`, so a mark made on one room's note before the
rooms were one line (or on the line when it named other rooms) finds the line but never holds:
the line is back, naming the rooms that joined. Marking or unmarking the line replaces such a
mark. Tests: `shortReport.test.ts`, "a line for several rooms (MSG-5)" (two doorless rooms
marked, seen again, back when a bedroom wall changes; a bathroom mark made before the bedroom's
door went, back on the grouped line, then replaced and taken off). The contract's seen section
and MSG-5's changelog entry say so. Owner choice 9 above.

**The short report for the flat** prints no follow-on and no problems sentence (it has no lines):
`grid check` 988 bytes and `grid_check`'s text 973 bytes, as MSG-10 pinned them.

Expectation changed: `packages/cli/src/command/__tests__/coverage.test.ts`, CNT-5's "a plan that
says it is a home runs the home figures": twelve sill lines are one line with `each` of twelve
(MS-14), with a comment. No other expectation changed; W-7 stays 90 lines, 30 problems, 43
beneath.

After the merge: `npm run build`, `npm run typecheck` and `npm run lint` pass. The tests of
`packages/floorplan`, `packages/rules`, `packages/cli` and `scoreboard/__tests__`: 193 files,
4,307 tests pass, 2 skipped (4,309); the first run failed only the CNT-5 expectation above.
`npm run scoreboard`: "Same as the stored figures", so `current.json` is unchanged.
