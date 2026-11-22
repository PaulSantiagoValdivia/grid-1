# MSG-18: an opening counts as passable only if a person fits through it

Card: "A door or opening clears a way-out or 'has no door' note only when it is at least Grid's
own stated passable size and its sill is at the floor." Lab evidence CH-6 (M-4), reproduced.
Split from MSG-17, which keeps the other half of CH-6: what lies beyond an opening.

## What changed

- **Three entries in the tolerance table** (`geometry/tolerances.ts`, MSG-15), all `limit`,
  all `basis: 'grid-drawing-check'`, and each `decides` text opens with the words "Grid's own
  size, not a code figure":

  | Entry | Value | A door or doorless opening is not a way through when |
  |---|---|---|
  | `passableWidth` | 0.4 m | it is narrower than this |
  | `passableHeight` | 1.2 m | it is lower than this |
  | `passableSill` | 0.3 m | its sill stands higher than this above its floor |

  They are compared as drawn (ARE-7): a door at exactly 0.40 m, 1.20 m high with a 0.30 m sill
  is a way through; one 0.399 m wide is not, and is printed as 0.399 m. They can be changed for
  a run with `withTolerances`, like every other limit. The README's table has the three rows.
- **The floor graph** (`geometry/rules/graph.ts`). `shortOf(opening)` says what a door or
  doorless opening falls short of (sill first, then width, then height), or `null`. An opening
  that falls short is left out of `links`, `exits` and `undrawn` and listed in a new
  `tooSmall`. Windows are untouched: they were never a way through. Because routes are read from
  this graph, the route `grid_measure` gives (`routeBetween` in `cli/src/quantities/measure.ts`)
  also stops going through such an opening, with no change of its own.
- **A new finding, `opening_too_small_to_pass`** (`opening/too-small-to-pass` in the result
  record), one per opening that falls short and has a room beside it, on every floor, under the
  rule `room-has-door`. One wording, as MSG-1 asks: An opening from "Hall" is too small for a
  person to pass through, so it is not a way through. The size is data: the finding carries
  `passage` (`kind` door or opening, `short`, `drawn`, `passable`), the record's `found` says
  "the door is 0.30 m wide" and its `needed` "at least 0.40 m wide: Grid's own size for a
  person to pass, not a code figure". The note a person reads gives the size and all three of
  Grid's sizes, ending "That is Grid's own size, not a code figure."
- **The notes that follow.** A room whose only door is too small now gets `room_without_door`;
  a floor whose only way out is too small gets `no_exit`. These are the notes the lab cases
  cleared.
- **The limits line** "Which way a door opens, and how wide doors and corridors are, are not
  checked" now ends ", beyond whether a person fits through a door at all".
- The contract (`docs/result-contract.md`) has the code in its table and a changelog entry.

## The lab cases (CH-6), before and after

`geometry/__tests__/passable.test.ts` rebuilds the lab's plan (a hall and a bedroom behind one
dividing wall) for each case.

| Case | Before | After |
|---|---|---|
| A 5 x 5 cm hole is the hall's only way out | no notes | `no_exit`, and the hole named |
| The only outside door has its threshold 1.5 m up (and is 1.0 m high) | no notes | `no_exit`, and the door named for its sill |
| A 0.3 m door is the bedroom's only door | no notes | `room_without_door` on the bedroom, and the door named |

## Expected figures changed, and why

- `packages/rules/src/checks/__tests__/rules-check.test.ts`: the known failure `CH-6 a 5 cm
  hole in the outside wall is not a way out` passes now. Its `it.fails` became `it`, in a block
  named "lab failures fixed by MSG-18", and it asserts every finding instead of only that
  `no_exit` is there: `no_exit`, `opening_too_small_to_pass` on the hole, and
  `room_without_door`, which any one-room plan with nothing in its walls gets as well. Noted
  in `test-support/pinned-tests.md`.
- `geometry/__tests__/tolerances.test.ts`: no entry's `decides` may name a code. That check now
  takes out the exact words "Grid's own size, not a code figure" first, and a new test holds
  that the three passable entries, and only they, carry those words.
- No other expected figure, golden file or snapshot changed. No committed plan has a door or
  doorless opening below the new sizes (194 scanned). The scoreboard's counts: see below.

## Decisions for the owner

- **The three sizes.** 0.4 m is a little more than the 0.3 m door the card names and below
  every door in the repository's plans; 1.2 m lets a person through stooping, not crawling; 0.3 m
  of sill is a step, not a climb. They decide only whether Grid reads a route through an
  opening, not whether a door is wide enough for anyone's rules. *Owner:* change them in the
  table if these are not the sizes you want; nothing else needs to change.
- **The opening is named, not only left out.** Without its own line a user sees "Bedroom has
  no door" next to a door. The cost is a line for a small opening that was never meant as a way
  through (a hatch drawn as an `opening`); its fix says so.
- **The escape check is unchanged.** `packages/rules` still lets any door to the outside be a
  bedroom's escape (lab M-4's 0.3 x 0.5 m "door"). That check applies code figures to windows,
  and the card names the way-out and door checks; applying Grid's own size there, or measuring
  such a door as a window, is a follow-up.
- **A room's step (LVL-7) is not added to the sill.** The sill is read as the plan states it,
  from the wall's foot.

## Checks run

After merging `main`, on the loaded machine:

- `npm run build`, `npm run typecheck`, `npm run lint`: passed.
- `npm run check:licenses`: 363 licences checked, none GPL, LGPL, AGPL, MPL or EPL.
- `npx vitest run --exclude '.claude/**'`: 4,197 passed, 1 failed. The failure was the timing
  guard `diffs 1,000 entities against a slightly edited copy well inside a second`
  (`diff-size.test.ts`, 1,067 ms against 1,000) under load; run alone it passes.
- `npm run scoreboard`: same as the stored figures, so `scoreboard/current.json` is unchanged.
  Damage that passes in silence stays 386: no damaged plan in the set has an opening below the
  new sizes.
