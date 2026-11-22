# MSG-7 review: every message says what would be right

Card: "Every message and note names the measure that fails, the value needed and the nearest
valid choice, such as the widest door that fits or the id that was probably meant, in plain
words and sensible units." Lab evidence MS-13 (reproduced by AU1), F32, W-1.

## What changed

1. **One nearest-id helper**, `packages/floorplan/src/types/nearest.ts` (pure, imports nothing;
   exported as `@ongrid/floorplan/types/nearest`). It replaces three: MSG-4's `nearestWord`
   (`types/reading.ts`, now a call to it), the floor ids' `nearestFloorId` and `idEdits`
   (`geometry/levels.ts`, now re-exported from it), and the tool server's `nearestIdText`
   (`cli/src/mcp/toolkit.ts`, now built on it). Two questions:
   - `likelyMeant(word, known, { replaced })`: the word most likely meant, or none. The same word
     in other capitals or joins, a known word it starts (`ext-nort` → `ext-north`, `thick` →
     `thickness`), or one slip (a letter added, dropped or two swapped, and for ids a letter
     replaced: `entrence` → `entrance`). `likelyId` is it with `replaced` on. Field names and uses
     keep MSG-4's rule: a replaced letter is not a slip (`roofs` is not offered `rooms`).
   - `closestId(id, known)`: the closest of a short list, always one. The floor ids keep this, as
     before.
2. **The drawing check says what would be right** (`geometry/validate.ts`, `room.ts`), and
   gives each change that would clear the problem as data, `Issue.fixes`
   (`{ part: 'opening', id, width | offset | height | sill | wall }`):
   - `opening/out-of-wall` (MS-13): keeping its width, the offsets that fit; keeping its offset,
     the widest that fits there. An opening from 0.50 to 5.50 m on a 4.30 m wall: "It is 700 mm
     wider than the wall is long; at its offset of 0.50 m, a width up to 3.80 m fits." Fix:
     width 3.80.
   - `opening/too-tall`: the height that fits at its sill. `opening/negative-sill`: how far
     below the floor, and that a sill of 0.00 m fits.
   - `opening/missing-wall` and a room that lists a wall the plan does not have: "which is not
     in the plan: did you mean "ext-north"?", when one is near. The opening's fix is `wall`, as
     data.
   - `wall/zero-length`: "starts and ends at the same point, (3.00, 2.50), so it has no length",
     in place of "has start === end".
   Fixes are rounded down to the tenth of a millimetre, so they stay inside what fits.
3. **The record** carries `fixes` on the line (`ResultLine.fixes`). The catalogue's `needed` and
   `fix` for `opening/out-of-wall`, `opening/too-tall` and `opening/missing-wall` name the
   figures or the wall, in place of "as the line found says". `room/escape-window-too-small`'s
   `found` names the measure that fails against what it needs first, then the ones that pass
   ("0.6 m high, under the 0.61 m needed; 0.6 m² in area and 1 m wide, which are enough"). Its
   figures, their sources and status, and the label are untouched.
4. **`grid_check` returns the calls** (`packages/cli/src/mcp/readTools.ts`, `fixCalls`): each
   line with fixes gets `calls`, each one `grid_change_opening` with the plan argument and the
   corrected value, ready to send (`width` with `keep: "start"`, an offset as `from: "start"`
   and `distance`, `height`, `sill`). Two when moving or narrowing would each do. Its text says
   how many lines carry a call.
5. **The tool server's refusals** name "the nearest known id" only when one is near. A wall
   `grid_measure` does not find, with none near, now lists the plan's walls.
6. The contract (`docs/result-contract.md`): the `fixes` field (and `calls`) and a changelog
   entry listing every changed wording.

## Against `done_when`

1. *The message for an opening on a 4.30 m wall states the offset or width that fits (3.80 m).*
   `geometry/__tests__/whatWouldBeRight.test.ts` holds the drawing check's sentence and its fix.
   `cli/src/mcp/__tests__/fixCalls.test.ts` holds the record line through `grid_check`: `found`
   with the sentence, `needed` "a width of at most 3.80 m at its offset", `fix` "Make it 3.80 m
   wide or narrower, keeping its start." The record's `message` stays the code's one wording,
   "Door "door" runs off its wall" (see For the owner, 1).
2. *`ext-nort` gets "did you mean ext-north"; plain words replace "start === end".* Both in
   `whatWouldBeRight.test.ts`.
3. *Where one call would fix a problem the result carries that call as data, and a test
   replays it and sees the problem gone.* `fixCalls.test.ts` sends each call `grid_check` gave,
   for a door too wide, a door too far along and a door too tall, and checks again: the line is
   gone each time.

## Expected texts I changed

- `geometry/__tests__/validation.test.ts`: the two MS-16 out-of-wall sentences end with the
  width that fits at the offset ("…; at its offset of 4.01 m, a width up to 0.8896 m fits.").
- `geometry/__tests__/holes.test.ts` and `types/__tests__/planText.test.ts`: "which does not
  exist" is "which is not in the plan".
- `cli/src/mcp/__tests__/measureBetween.test.ts` passes unchanged: its three ids are near ones.
- Two tests failed on `main` at 56ed9b5 as well: the bundle budget in `grid.e2e.test.ts` (450,000
  bytes; `main`'s bundle was 459,241, and MSG-7 adds 1,689) and the problem report's path line in
  `reportProblem.test.ts` (cut off past the draft's 4,000 characters). I fixed both here; SHT-7
  then fixed both on `main` the same way (500 kB, the path line first), and the merge keeps
  `main`'s versions.

## For the owner

1. **The record's `message` keeps one wording per code.** The card asks for the fitting width
   "in the message". The record's `message` is the code's one wording (MSG-1, tested), so the
   figures are in `found` (the check's sentence), `needed` and `fix`, which `grid check` and
   `grid_check` print beside it. The drawing check's own message (`Issue.message`, in the views
   and `drawing`) carries it in full.
2. **Calls go to `grid_change_opening` only.** It is the one tool that takes an opening's
   width, place, height and sill. No tool sets an opening's wall, so the wall meant
   (`opening/missing-wall`) is data with no call. A `wall` argument on `grid_change_opening`
   would close that; I did not add one.
3. **The fixes cover openings only**: off its wall, too tall, sill below the floor, wall not
   in the plan. Wall faults have `grid tidy`; findings (a room with no door) have no one call
   that fixes them, and their `needed` already says what would.
4. **The tool's limits are repeated in `fixCalls`** (no width under 0.3 m, no height under
   0.2 m), so a call the tool would refuse is not offered. They match the tool's argument
   minimums but are written twice.
5. **Numbers keep each place's style.** The drawing check prints exact metres (3.80, 0.8896),
   the catalogue's figures trim zeros (0.6 m) as they did. MS-13's "1.118 m" was not reworked.
6. **"A window called a door"** (MS-13): I found no message that does it today. The opening
   noun comes from the opening's type in every line I read.
7. **The bundle** is 1,689 bytes larger with MSG-7, under the 500 kB budget `main` now has.

## Checks run

On top of `main` 56ed9b5: `npm run build`, `npm run typecheck` and `npm run lint` pass;
`npm run scoreboard`: "Same as the stored figures"; the one full run,
`npx vitest run --exclude '.claude/**' --maxWorkers=2 --minWorkers=1`: 4,568 of 4,568.

After merging `main` cae036c (SHT-7): build, typecheck and lint pass; the tests of
`packages/floorplan`, `packages/rules`, `packages/cli`, the front door over the damage set and
the W-5 test: 3,996 of 3,996; `npm run scoreboard`: "Same as the stored figures".
