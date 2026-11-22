# CNT-17 review: accessibility measurements, as numbers only until figures are confirmed

For the owner. What CNT-17 adds, how each done-when item is met, every expectation that changed,
the choices made without you, and the checks run. Lab findings: EL-15 (accessibility cannot be
marked or checked), C-14 ("Accessible WC" lives only in a name), J-15 (a person's own needs
cannot be given to any check; the narrow flat gets "Notes: 0", "Not checked: (nothing)").

## What CNT-17 adds

**A mark of what needs to be accessible** (C13, `packages/floorplan/src/types/floorplan.ts`). A
plan may state `accessible`: `rooms` by id, and `routes`, each `to` a room and `from` a room or,
left out, from the entrance. Optional and never defaulted (version 1), as the format's change
rule asks, so no plan, export or snapshot gains a key. A mark that cannot be read is left out
with `plan/value-left-out` (MSG-6); a misspelt field inside it is named with the one meant
(MSG-4); its ids follow MSG-9's text rule. It is placed in `packages/cli/src/sheet/coverage.ts`
as not shown: the sheet draws no mark and states no figure.

**`grid_measure what=access`** (`packages/cli/src/quantities/access.ts`, pure; no new tool, the
count stays 30). For the rooms and routes the plan marks, or every room when it marks none (and
it says which), it lists:

| What | Measured by (already on main) |
|---|---|
| Every door and doorless opening of a room measured or on a way: its hole, its clear width past an open leaf (less `useOpenLeaf`, 0.05 m, and any fixture in front of it), its sill when above the floor | CNT-13's `doorwayClearance` |
| Each corridor at its narrowest from end to end: its two ends are the sides of its outline no wider than it, farthest apart; the widest circle when Grid finds no two ends | CNT-13's `passageWidth`, `turningSpace` |
| Each room's turning space: the widest circle its free floor holds | CNT-13's `turningSpace` |
| The way in from the entrance to each room marked, and each route marked, with every step on it and its height: a door's sill (BRF-1's step), a change of level between rooms (LVL-7's `planSteps`), the ground outside when the site states its level (LVL-4's `groundLevel`), the risers of a stated stair; between floors a lift where one joins them, else a stair (LVL-3's `floorJoins`) | the way-out check's ways (`wayGraph`) |

The entrance is the front door the plan names (`front.opening`, CNT-3) when it leads outside,
else every door out of the ground floor. Where Grid cannot tell, it says so: the step from the
ground with no `site.ground`, the steps of a stair drawn only as rooms, a floor no stair or lift
joins. The answer ends with "Not looked at:" (eight plain lines: door leaves and handles, other
thresholds, ramps, inside a lift, fittings the plan does not hold, surfaces and control heights,
the way outside, and whether any number is enough).

**Figures.** A number is set against a figure only when it is the person's own, read from the
brief beside the plan through BRF-1's `readBrief` (`door_width` by the clear width,
`corridor_width` by the narrowest point, `turning_circle` with its rooms, `step`), and every such
line says "your figure" (data: `figure.from: "yours"`, `label: "your figure"`); or a code figure
that a named person has confirmed. That path exists in `packages/rules` (a figure's `status` and
`verifiedBy`), so CNT-17 adds the gate there, `confirmedFigure` (`checks/figures.ts`): status
`checked-once` or `checked-twice`, every check by a named person (never an AI), the place stated
and one the figure is for, the building a kind it was read for. The access answer asks it for two
figures that already exist, `exitDoorClearWidth` (the entrance door) and `routeMinWidth`
(corridors). Both are `ai-found`, like every figure Grid holds, so today none is used, and the
answer says so. No code figure was added.

**`grid check`** gives a plan that marks anything one not-checked line, `plan/not-checked-access`:
"What the plan marks as needing to be accessible (2 rooms and 1 route) was not checked: Grid
holds no figure for it that a named person has confirmed." Its wording, needed and fix are in
`catalogue.ts`; the contract's code table and changelog have it. No line says a room, a route or
a plan is accessible, and MSG-3's words are kept out (tested).

**Scoreboard**: the `accessible-mark` capability gets its probe (a schema probe for
`accessible`). No count moves: check 30 also needs `fixtures`, which still probes the lab's
`rooms.0.fixtures`.

**Docs**: `docs/plan-file.md` (a section "What needs to be accessible" and its code in the list),
`docs/tool-server.md` (the tool table row and a section "Accessibility measurements, as
numbers"), `docs/brief.md` (the figures the access answer reads), the agents' changelog and the
code table in `docs/result-contract.md`, a line under "Unreleased" in `CHANGELOG.md`, and a
paragraph in `AGENTS.md`.

## The done-when items

| Done when | Test |
|---|---|
| 1. EL-15's flat reports every door's clear width (0.55 m), the hall's narrowest point (0.70 m) and the 18 cm step, and never "Notes: 0" with "Not checked: (nothing)" | `packages/cli/src/mcp/__tests__/access.test.ts`, "EL-15: the narrow flat, measured as numbers": "reports every door's 0.55 m hole and its clear width, the hall's narrowest point of 0.70 m and the 18 cm step" (six doors at a 0.55 m hole and 0.50 m clear, the hall 0.70 m from end to end and 0.70 m to turn in, the entrance's 0.18 m sill on the way in to every room, what Grid cannot tell and what it did not look at); "never reports "Notes: 0" with "Not checked: (nothing)", marked or not, and says the marked rooms were not checked" (`grid check` on the command line and `grid_check`, unmarked and marked) |
| 2. The person's own figures are kept and labelled as theirs; no code figure is used unless a named person confirmed it | Same file: "the person's own figures, kept and labelled as theirs (BRF-1) > sets every number against the brief's figures, each said as "your figure"" (every comparison line and every `against` in the data); "no figure from a code unless a named person confirmed it": "uses none of the ai-found figures Grid holds, even for a plan in the US", "never sets a number against an ai-found figure, even one a person is named on", "sets the entrance door and the corridor against a figure once a named person has confirmed it, with its source". `packages/rules/src/checks/__tests__/confirmed.test.ts` holds the gate itself |

EL-15's flat is in the repository already: the scoreboard's stored lab plans
(`scoreboard/data/lab-plans.ndjson.gz`, `J/scenarios/7-wheelchair-user/probe-narrow-everything.json`,
the plan BRF-1's Y-7 reads). Nothing was copied from the lab folder.

**Where the figures differ from the brief, and why.** The doors are a 0.55 m hole; Grid's clear
width past an open leaf is 0.50 m, because CNT-13 takes `useOpenLeaf` (0.05 m, Grid's own) off
every door. The answer gives both ("0.55 m hole, 0.50 m clear past the open leaf"), and sets the
person's `door_width` against the 0.50 m. BRF-1's brief lines still set `door_width` against
the hole (0.55 m); see For the owner, 2. The hall's 0.70 m and the 0.18 m step are as the brief
says. One more thing the lab's flat does: its entrance door spans the end of the hall's east wall
(`wall/ends-in-opening` names it), so the way-out graph reads it as opening into Bedroom 2, and
every way in goes through Bedroom 2. That is the plan's drawing, reported as Grid reads it.

## Expectations changed

- `packages/rules/src/result/__tests__/result.test.ts`, MSG-4's words Grid does not read: the
  plan's fields named to an unknown field now include `accessible`, between `views` and `display`.
- `scoreboard/current.json`: the stored capability `accessible-mark` is `yes` (it was `no`, with no
  probe). The counts did not move.

Nothing else changed; no snapshot or golden file.

## For the owner

1. **Which code figures the access answer would use, once confirmed.** It asks `confirmedFigure`
   for `exitDoorClearWidth` (the entrance door's clear width) and `routeMinWidth` (a corridor's
   narrowest point), both US figures read for homes, egress figures rather than accessibility
   ones. Both are `ai-found`, so nothing is compared today. If you would rather no egress figure
   ever met an accessibility number, empty `ACCESS_CODE_FIGURES` in `quantities/access.ts`.
2. **A door's width against the person's `door_width`.** The access answer uses the clear width
   past the leaf (0.50 m on EL-15); BRF-1's brief lines use the hole (0.55 m), as BRF-1 decided.
   Each says what it measured. Making BRF-1's line use the clear width too would change its Y-7
   test's "drawn 0.55".
3. **What a corridor's narrowest point is.** From end to end of the room used as a corridor, its
   ends found from its outline. A corridor with no clear ends (about as wide as long) gives its
   widest circle and says so. A stretch beyond the last door counts. Rooms not used as corridors
   (a hall used as `other`) get turning space only.
4. **The mark's shape.** One top-level part, not a field on each room, so a route can be marked
   and `coverage.ts` places it. A fitting (a WC, a shower) cannot be marked yet; that waits on
   fixtures' kinds (CNT-11).
5. **Grid's edits do not carry the mark.** A room merged or split away leaves an id the mark names
   that is no room; the access answer says so, and `grid check` does not. A drawing check
   (`accessible/unknown-room`) would be a new code; left out.
6. **`grid describe`, the rooms text and the edit tools** neither say nor set the mark; an agent
   writes it in the plan file.
7. **Lifts.** A lift is taken as joining two floors where its shafts line up (`floorJoins`), and
   is preferred to a stair. Nothing about the car is measured. A ramp cannot be stated, so a
   level change between floors without a lift is a stair or "cannot tell".
8. **The scoreboard's `threshold` capability** still probes the lab's `openings.0.threshold`.
   Grid reads a door's sill as a step, so pointing it at the access answer would let turn 1 ("can
   I get in the front door, is there a step") and check 28 count. Not done: it moves counts on a
   capability this card did not add.
9. **The lab's `accessibility` field** (`t9-made-up-access-fields.json`) is still an unknown field,
   and MSG-4 does not offer `accessible` as the field meant. Its
   `wheelchairWidth` is not read as the person's figure: the person's figures live in the brief.
   Reading `accessibility` as meant would be a change to MSG-4's nearest-name rule; left out.

## Checks run

On this branch at 5c3583d (main at c05d051 plus CNT-17):

- `npm run build` (bundle 535,791 bytes, under the 550 kB limit), `npm run typecheck`,
  `npm run lint`: clean.
- The full suite, `timeout 1500 ./node_modules/.bin/vitest run --exclude '.claude/**'
  --maxWorkers=2 --minWorkers=1`, after the build: 298 of 298 files, 5,328 passed and 4 skipped,
  exit 0 (568 s).
- `npm run scoreboard`: 197, 278, 18, 5, 16, 735, 95. Same as the stored figures. The stored
  capability `accessible-mark` was set to `yes` by hand, as the run reads it; no count moved.
- While building, only the touched files: the new tests, `rules-report`, `result`, the tool
  server's `tools`, `contract`, `server` and `useIndicators` tests, `src/sheet` and `src/brief`.
  On the way: the rules package's import test read "its document." in a comment of
  `figures.ts` as the DOM's `document.` (reworded), and the first wording of the answer's head
  ("None of them says that … is accessible") matched the test that no line says a plan is
  accessible (reworded).

After merging `main` at 8b599e9 (LVL-8): LVL-8 took contract letter C12 (opening patterns), so
the accessible mark is **C13**. Conflicts, both sides kept: `CHANGELOG.md`, the agents'
changelog in `docs/result-contract.md` (CNT-17's entry on top), the `grid_measure` and
`grid_view` rows of `docs/tool-server.md`, the contract header in `floorplan.ts`, and MSG-4's
list of the plan's fields in `result.test.ts` (now `… openings, patterns, … views, accessible,
display, written`). Build (540,324 bytes), typecheck and lint clean; the affected tests rerun
(`packages/cli/src/mcp`, `src/sheet`, `src/brief`, `src/quantities`, `grid.e2e`, `shortReport`,
all of `packages/rules`, `packages/floorplan/src/types`, `tolerances.test.ts`,
`scoreboard/__tests__`): 92 files, 1,239 passed and 3 skipped. The scoreboard: same as the
stored figures.

After merging `main` again at 8a43380 (HND-1): conflicts in `CHANGELOG.md` and the agents'
changelog in `docs/result-contract.md`, both sides kept (CNT-17's entry on top). No contract
letter clash (C13 stays) and no scoreboard file changed, so the scoreboard was not rerun. Build
(541,843 bytes), typecheck and lint clean; the affected tests rerun, adding HND-1's
(`packages/cli/src/export`, `everyPath.e2e`, `packages/floorplan/src/export`,
`src/geometry/export`, `exposure`, `holes`) to the set above: 113 files, 1,765 passed and 3
skipped.
