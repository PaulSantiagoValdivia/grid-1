# MSG-2 review: say what each check looked at, and mark numbers proven, incomplete or not looked at

For the owner. MSG-2 builds on MSG-1's result record. Each check now says which floors, rooms
or doors it looked at, and which it skipped, with a reason and a count. Every area that
`grid_areas` gives now carries a state.

## What MSG-2 adds

1. **Coverage for every check** (`packages/rules/src/checks/coverage.ts`). The full report
   (`checkLocalRules`) and the record (`inspectPlan`) gain `coverage`. It has one entry per
   check, whether the check ran or not, and each entry holds:
   - `looksAt`: what the check looks at (`floor`, `room` or `door`);
   - `lookedAt`, by floor, with its count;
   - `skipped`, by floor and reason, with its count and a one-line `why`;
   - `findings`: how many findings the check gave.

   The figure checks (`sizeCheck` and `escapeCheck`) return their own coverage. The coverage of
   the core's four plan checks is worked out in `@ongrid/rules` from the plan and from the
   core's own notices (`no_stairs`, `way_out_not_drawn`, `drawable`), so floorplan's
   `rules/check.ts` is not touched. Reasons: `no_figures_for_place`, `no_rooms`,
   `cannot_be_drawn`, `no_stairs`, `way_out_not_drawn`, `alone_off_ground`,
   `above_escape_storeys`, `no_use`, and `use_not_covered` (the check is not about that use).
2. **A check that looked at nothing is not listed as run.** This is the card's "report.json
   stops listing a rule as applied". Its figures are not listed either, and `basis` follows
   from the figures that are listed.
3. **Two new `not-checked` codes**, each with a catalogue entry and a row in the contract:
   - `floor/not-checked-above-escape-storeys`: "On "Floor 3", escape openings were not checked
     in bedrooms: the figures here cover bedrooms up to the third storey: 6". The escape check
     used to return nothing above level 2, and said nothing.
   - `plan/not-checked-no-rooms`: "No check that looks at rooms ran: the plan has no rooms".
4. **`grid check`** prints "Looked at by at least one check: N of M rooms." after the "To look
   at" list. It then prints "What each check looked at (6):": each check's count and findings,
   the ids when there are 8 or fewer, and one line per skip with its reason and ids.
   `--floor` filters the coverage as it filters the lines. **`grid_check`** returns `coverage`,
   and its text gives the same counts.
5. **Every area carries a state** (`packages/cli/src/quantities/state.ts`, used by `planAreas`).
   The states are `proven`, `not-proven` and `not-looked-at`, from `NUMBER_STATES` in
   `@ongrid/rules`.
   - A room that cannot be drawn has `net: null` (it was 0) and the state `not-looked-at`.
   - A room the drawing questions is `not-proven`, with its `doubts`. Those are
     `room/not-enclosed`, `room/space-mismatch`, `room/overlap`, `room/overlap-unknown` and
     `room/inside-no-host`.
   - Each figure of each floor (`net`, `byUse`, `circulation`, gross internal and gross
     external) and each plan total (the same, plus the two shares) has `{ state, leftOut,
     notProven }`. Rooms in those lists are `{ floor, id, name }`.
   - `grid_areas` prints the state after each total, and a room that cannot be measured as "not
     measured". It adds a note that names the rooms left out. The CSV gains a `state` column.
     The sheet prints "not measured" for such a room.
6. **The contract** (`docs/result-contract.md`) gains these sections: "What each check looked
   at", "Numbers and their state", the two codes, the `coverage` field and a changelog entry.

## Against `done_when`

1. *CH-1's two plans no longer report 'Not checked: (nothing)'.*
   `cli/src/command/__tests__/coverage.test.ts` checks this on the lab's own plans, read from
   the scoreboard data:
   - On the office, the fifth-storey floor, the block and three sound plans, every room is
     under each room check, either looked at or skipped with a reason. The counts add up, and
     the checks listed as run are exactly those that looked at something.
   - The office whose rooms are "other" shows the size and escape checks looking at 0 rooms,
     with 7 skipped and the reason.
   - The fifth-storey floor gets a line for its 8 bedrooms.
   - The same walls with no rooms get `plan/not-checked-no-rooms`, and the two plans no longer
     give the same report.
2. *The 18 bedrooms on floors 3 to 5 are listed as not checked for escape (CH-4).* The same
   test checks the block plan. There are 18 bedrooms on L3 to L5, 6 per floor, all under
   `above_escape_storeys`, and one line per floor names them. The 12 bedrooms on L1 and L2 are
   looked at. `--floor L4` shows L4's line and coverage only.
3. *Every area and total carries a state, and a total that left a room out names it (AC-9).*
   The same test covers the lab flat's three faults (E f05, f06 and f07). There the room that
   cannot be drawn (kitchen, living, kitchen) has `net: null`. The plan net, the floor net and
   that use's figure are `not-proven` and name the room, and so do the note and the text. The
   repaired f05 is proven throughout. On 10 lab plans every state is one of the three, a proven
   figure names no room, and `net === null` exactly when a room is `not-looked-at`.

## Expected texts and figures I changed, and why

- `rules-escape.test.ts`: "a bedroom on level 3 gets no finding and no notice" became "…gets no
  finding, and a notice that names it as not checked". This is the CH-4 behaviour the card
  asks for. I added a level-2 case that is looked at.
- `rules-check.test.ts` and `rules-catalogue.test.ts`: an empty plan now has one notice,
  `no_rooms` (it had none). It lists no rule as applied (it listed all six) and no figures.
- `result.test.ts`: `inspectPlan({})` now has count 1 (`plan/not-checked-no-rooms`). It was 0.
- `merge.test.ts`: the full report keeps every core notice and adds only its own (`no_use`,
  `above_escape_storeys`, `no_rooms`). `rules` equals the core's rules and the figure rules,
  minus those that looked at nothing.
- `rules-lookup-figures.test.ts`: the "every figure a baseline" test now makes every room a
  bedroom first. The fixtures state no use, so without that the figure checks look at nothing
  and list no figures. A new test pins that: the flat with no uses lists no figure.
- `rows-flats.test.ts`: the Madrid flat's dormitories are above the third storey and now
  appear in an `above_escape_storeys` notice. The "no room left out" expectation leaves that
  notice out.
- `grid.e2e.test.ts`: `two-bed-flat.json` states no room use, so it now shows "Checks run
  (4):" (it was 6). The test also checks the new coverage lines.
- `pages.test.ts`: `r.net ?? 0`, because a room's net may be null.
- `notes.test.ts`: the hand-built report gains `coverage: []`.

No scoreboard figure is stored differently unless the run below says so.

## Decisions for the owner

1. **The vocabulary.** The card's title says "proven, incomplete or not looked at", and its
   `done_when` says "proven, not proven, not looked at". I used the `done_when` words, as
   `proven`, `not-proven` and `not-looked-at`. A total that left a room out is `not-proven`,
   and `leftOut` names the room: that is the "incomplete" case.
2. **Figures follow the rules list.** A check that looked at no room loses both its place in
   `rules` and its figures in `figures`. So a plan whose rooms state no use no longer prints
   the US figures under "Figures used". The card only asked for the rules. I dropped the
   figures too, so the report does not list a figure for a check it says did not run.
3. **Only skips of whole floors or plans get a line.** The new lines are the bedrooms above the
   third storey and a plan with no rooms. "The size figure is for bedrooms, living and dining
   rooms only" (`use_not_covered`) is in the coverage, room by room, and gets no line. If it
   did, every kitchen and bathroom would add to the count. The office of CH-1 therefore still
   has count 0, but its report now shows the size and escape checks looking at 0 rooms, with
   the reason.
4. **Escape and rooms with no use.** A room with no use is skipped by the escape check with
   `no_use`, because it may be a bedroom (lab M-3). The existing `floor/not-checked-no-use` line
   still names room sizes only. I kept its wording because MSG-4 is changing room uses in
   parallel.
5. **The plan checks' coverage is read from the core's notices, not returned by the core.**
   That leaves floorplan's `rules/check.ts` alone while LVL-3 rewrites it. A check that
   `LOOKS_AT` does not list (LVL-3's `stairs-line-up`) gets no coverage entry and stays listed
   as run. `rules/src/checks/__tests__/coverage.test.ts` fails until it has an entry.
6. **"Proven" for an area** means the room was measured and none of the five drawing problems
   above questions its outline. A gross area is proven when the walls marked exterior close the
   floor, and none of the outside rooms it takes off is in doubt. A sum of no rooms is 0, and
   proven.
7. **Not in this step:** states on `grid_measure`, `grid_takeoff`, `grid_describe` and the
   sheet's figures. They still give their numbers as before. ARE-9's areas call should carry
   the states over.

## For the other sessions

See `MSG-2.md` in the shared notes. In short:
- `RulesReport.coverage` is required.
- `rules` and `figures` only list what looked at something.
- `escape.ts` returns `{ findings, scope }`.
- `RoomArea.net` may be null, with `state`, `doubts` and `states` added in `areas.ts`.
- LVL-3 must add `stairs-line-up` to `LOOKS_AT`.

## Checks run (worktree, each under `timeout`, after merging `main` at `5db4bc6`)

- `npm run build`: bundled, no errors.
- `npm run typecheck`: no errors.
- `npm run lint`: no problems.
- `npm run check:licenses`: 363 licences checked, none GPL, LGPL, AGPL, MPL or EPL.
