# CNT-13: use findings as measured indicators

Will it fit, can you turn, is the window blocked: the plan's fixtures (CNT-12's `items`) are
obstacles now, and a group of use indicators is measured round them. Each says what it
measured, with what width or clearance, and whose figure that is: the person's own, or one of
Grid's own indicators. None is a rule, and none cites a document.

## What changed

- **Fixtures in the door-swing check** (`packages/floorplan/src/geometry/sweep.ts`). The
  fixtures a floor draws (`PlanDrawing.items`) are tried against each door's sweep exactly as
  the walls are, through QAR-7's box index. A leaf that reaches into one gives a new warning,
  `opening/door-hits-item`, with the fixtures' ids in `hits` and each named by its label, kind
  and id. S-8 now reads: `Door "d1" hits "Table 2" (kitchen run "table-2") when it opens`
  (`grid check`'s line; the drawing's own message is "This door hits "Table 2" (kitchen run
  "table-2") when it opens."). A wall in the way is still `opening/door-blocked`. The 2D view
  lights a fixture while the warning of a door that hits it is hovered (`scene.ts`,
  `plan.css`). `itemName` (`items.ts`) names an item inside a sentence: `kitchen run "k1"`, or
  `"Table 2" (kitchen run "t2")` when the plan states a label.
- **The measures** (`packages/floorplan/src/geometry/use.ts`, new, pure), one per indicator:
  - `doorwayClearance` (`use/doorway-clear-width`): the widest stretch of a doorway's hole that
    no fixture stands in front of, within `useApproachDepth` on either face, less `useOpenLeaf`
    for a door's open leaf and stop; a doorless opening keeps its whole hole.
  - `passageWidth` (`use/passage-width`): the widest body or trolley that gets through a room
    from one mouth to another (a doorway's edge on the room's face, a dividing line's stretch, a
    point, or anywhere in the room), keeping clear of its walls, holes and fixtures. The floor is
    tried on a grid of points `useRaster` (2 cm) apart, coarser past `useRasterCells` points; the
    way is the one whose narrowest point is widest (points joined widest first until a start
    meets an end). It says where the narrowest point is, which fixtures and whether a wall stand
    beside it, and whether it is only a doorway.
  - `turningSpace` (`use/turning-space`): the widest circle the room's free floor holds.
  - `fixtureSpace` (`use/space-by-fixture`): the clear floor straight out from a fixture's front
    and each side to the nearest wall face, doorway line or other fixture, the least along that
    face.
  - `windowCover` (`use/window-blocked`): how much of a window's width fixtures higher than its
    sill stand in front of, within `useApproachDepth`.
  - `USE_INDICATORS` lists the five codes with what each measures and its figure; `INDICATOR_NOTE`
    is said with them.
- **Two checks on the drawing** (`itemUseIssues` in `use.ts`, run by `validatePlan` after the
  fixture checks), both worth a look and only for a plan with fixtures: `item/blocks-doorway` (a
  fixture within 0.3 m in front of a doorway's hole: what it covers and the clear width left)
  and `item/blocks-window` (a fixture higher than a window's sill in front of it: what it
  covers). Each line's `found` ends "Measured within Grid's own approach depth of 0.30 m: an
  indicator, not a rule."; its message ends ", an indicator". The opening is in `also`.
- **The figures** (`tolerances.ts`, `docs/tolerances.md`), all Grid's own and citing nothing:
  `useOpenLeaf` 0.05 m, `useApproachDepth` 0.3 m, `useDoorwayClear` 0.8 m, `usePassageWidth`
  0.9 m, `useTurningCircle` 1.5 m, `useClearSpace` 0.6 m (each a `limit` that starts "Grid's own
  size, not a code figure", as MSG-18 asks), `useRaster` 0.02 m (a tolerance) and
  `useRasterCells` 250000 (a limit; a new unit, `count`).
- **`grid_measure`** (`packages/cli/src/mcp/readTools.ts`, `src/quantities/use.ts`, new). No new
  tool; the count stays 22.
  - `what=use` with `room`, and optionally `width` (a body or trolley), `diameter` (a turning
    circle) and the new `clearance`: the room's turning space, each doorway's clear width, the
    way through between each pair of its doorways (or from its one doorway to its widest point,
    ten pairs at most), the floor round each of its fixtures, and each window a fixture stands
    in front of. Every line starts "Indicator, <name>:", gives the figure, and says "at least" or
    "under" "the 0.70 m you gave" or "Grid's own indicator of 0.80 m". The answer ends with
    `USE_RULE` (`INDICATOR_NOTE`, what is measured clear of, and the grid's precision); its data
    is `{ code, about, measured, figure: { value, from }, under, at?, detail? }` per indicator.
  - `what=route` takes `width`, a body or a trolley. The way with the fewest rooms is measured
    room by room (`passageWidth`, from anywhere in the first room to anywhere in the last) and
    doorway by doorway (`doorwayClearance`); when something on it is narrower than `width`, the
    answer names it, and a search over (room, doorway in) finds the way with the fewest rooms
    that is at least that wide all along, or says none is. Without `width` the route answer is
    as before. `wayGraph` (`measure.ts`) is `routeBetween`'s graph, shared.
- **Docs**: `docs/tool-server.md`, new section "Use indicators: will it fit, can you turn, is
  the window blocked", with a table of asks, calls and codes, and its tool-table row;
  `docs/plan-file.md`'s fixtures section and code table; `docs/tolerances.md`'s rows; the
  contract's code table (three codes) and a changelog entry for agents; a line under
  "Unreleased" in `CHANGELOG.md`; S-8 in `test-support/pinned-tests.md`'s fixed table.

## Scoreboard

"Checks the plan can feed" goes from 12 to 14: the scoreboard now asks the library for the clear
width a door leaves (`doorwayClearance` on the sample flat, which feeds check 13, the entrance
door's clear width, and 14, the inside doors'), the clearance (`fixtureSpace`, `passageWidth`)
and the turning circle (`turningSpace`). `clear-width` was a schema probe for a `clearWidth`
field the lab's agents wrote; Grid works the width out instead of holding it, so the probe asks
for that. `clearance` and `turning-space` were `none`; they are `yes` now but feed nothing more
yet (every turn and check that needs them also needs `fixtures`, `furniture` or
`marks-on-plan`, see "For the owner"). The stored detail also had `fed: 11` and `north: "no"`
from before CNT-3 stored its count; `--write-current` rewrote them as they are (14, `yes`).
Every other count is unchanged. The new figures are in `scoreboard/current.json`.

## Tests

- New `packages/floorplan/src/geometry/__tests__/useIndicators.test.ts` (18): S-8's swing naming
  "Table 2" and no wall; nothing for a fixture outside the swing or resting on its arc; several
  fixtures in plan order, one with no label; an unheld kind (a table) left out of the swing as of
  the drawing; `itemName`; each measure on a 4 × 3 m room: a doorway's clear width with and
  without a fixture, one too far off or beside the hole; a window blocked by a run higher than its
  sill, and not by one lower; the turning circle with and without an island; the floor round a
  toilet, stopping at a basin, turned; the way through an empty room (only its doorways), round a
  bath (0.6 m, beside the bath and a wall), closed by a run, to a point, and a dividing line's
  mouth; every indicator naming a figure that says it is not a code figure.
- New `packages/rules/src/result/__tests__/useLines.test.ts` (5): S-8's line, word for word, with
  `also`; `item/blocks-doorway`'s and `item/blocks-window`'s message and found, word for word; no
  line for a plan without fixtures; the label and no forbidden word (MSG-3) in any line.
- New `packages/cli/src/mcp/__tests__/useIndicators.test.ts` (11) on a flat with a hall, a
  bathroom and a bedroom: `what=use` lists the six indicators in order, each with Grid's own
  figure or the person's, word for word for the doorway and the window; a room with no fixtures;
  a stray argument refused; `what=route` with width 0.6 getting through past a cupboard, 0.7
  stopped in the hall with no other way, 0.78 stopped at a door, and the answer without width as
  before. Every answer starts with the label and holds no forbidden word.

### Changed expectations

- `packages/floorplan/src/geometry/__tests__/tolerances.test.ts`, "holds the size a person
  passes through as Grid's own, saying it is not a code figure (MSG-18)": it pinned that only
  `passableWidth`, `passableHeight` and `passableSill` carry the words "Grid's own size, not a
  code figure". The six indicator figures carry them too, because each is a size that could be
  read as a requirement; the test now lists all nine, and its name adds "and the use indicators
  (CNT-13)".
- `scoreboard/current.json`: checks fed 12 → 14 and the capability detail, as above.

Nothing was removed.

## The checks run

- While building, only the touched files, two workers: the three new test files, `sweep.test.ts`,
  `items.test.ts`, `tolerances.test.ts`, `packages/rules/src/result/__tests__`, and the tool
  server's `tools`, `fixtures`, `measureBetween`, `contract` and `replay` tests. Two failures on
  the way, both in the new tests and both fixed: a window covered by nothing read
  `-2.2e-16` m (now 0), and the first route started the hall at its widest point, the far side
  of the cupboard, so a door narrower than the body was reported behind the cupboard (a route now
  starts and ends anywhere in its first and last rooms).
- `npm run build`, `npm run typecheck`, `npm run lint`: clean.
- `npm run scoreboard`: "Better than the stored figures" (checks fed 12 → 14), stored with
  `--write-current`, then rerun: "Same as the stored figures."
- The full suite, `timeout 1500 npx vitest run --exclude '.claude/**' --maxWorkers=2
  --minWorkers=1`, after the build: 251 of 251 files passed, 4,867 tests passed and 4 skipped,
  exit 0.

- After merging `main` (56458e5, CNT-5): one conflict, the changelog for agents in
  `docs/result-contract.md`, kept both entries, CNT-13's on top. Build, typecheck and lint
  clean; the scoreboard "Same as the stored figures"; the affected tests rerun (floorplan
  geometry and types, all of `packages/rules`, the tool server, quantities, the commands' tests,
  the viewer and `scoreboard/__tests__`): 209 files, 4,257 passed, 2 skipped.

- After merging `main` again (6ba4fb9, SHT-11): the same changelog conflict, both entries kept.
  Build, typecheck and lint clean; the scoreboard "Same as the stored figures"; geometry, the
  result record, the tool server, quantities, draw, sheet, the viewer and `scoreboard/__tests__`
  rerun: 184 files, 3,639 passed, 2 skipped.

## For the owner

1. **S-8's table is a kitchen run labelled "Table 2".** CNT-11 holds fixtures only, so a loose
   table (`kind: "table"`) is still `item/unknown-kind`, left out of the drawing and so of the
   swing check. S-8's case is written as a fixed piece with a label, and its line names the label
   first. The swing check takes every item the drawing holds, so when furniture kinds are
   decided a table becomes an obstacle with no change here. If you want an unheld kind to stand
   in the way before that (drawn nowhere, but an obstacle), it is a few lines in `sweep.ts`, but
   it would break CNT-12's "left out, and nothing else of the plan changes".
2. **"Room beside a bed" needs beds.** Beds are furniture. `use/space-by-fixture` measures the
   floor in front of and beside every fixture (a bath, a toilet, a kitchen run), and will measure
   a bed's once beds are held.
3. **Grid's own indicator figures** are mine and cite nothing: 0.8 m clear for a doorway, 0.9 m
   for the way through a room, 1.5 m for a turning circle, 0.6 m in front of and beside a
   fixture, 0.05 m for an open leaf and its stop, 0.3 m for standing in front of a doorway or a
   window. Each is one entry in `tolerances.ts`; change them there. The person's own figure
   always wins, and every line says whose figure it used.
4. **Indicators are asked for, not given with every check.** `grid check` gets only the three
   lines that are about the drawing itself (a leaf hitting a fixture, a fixture in front of a
   doorway or a window). Setting every room against Grid's own widths in every report would add
   lines to every plan and read like rules; `grid_measure what=use` gives them when the person
   asks. Putting them in `grid check` as a `not-checked`-like kind would be a contract change.
5. **A kitchen run under a low window is flagged.** `item/blocks-window` fires when a fixture is
   higher than the sill by more than a millimetre, so a worktop at 0.90 m under a sill at
   0.85 m is named. A worktop at or under the sill is not.
6. **The leaf allowance applies to every door.** The plan does not say a door is hinged or
   sliding, so every `door` gives up `useOpenLeaf`; a doorless opening gives up nothing. The
   leaf's swing itself (a door opened against a fixture) is the swing check's, not the clear
   width's.
7. **The way through is measured on a grid.** Widths come out up to about 2 cm under the true
   gap (a 0.65 m gap reads 0.64 m), and the answer says "to within a few centimetres". An exact
   method (the medial axis of the free floor) would be a larger piece of work. A big room is
   measured on a coarser grid (250,000 points at most); a route search over a large plan with
   many fixtures can take a second or two.
8. **Where a route starts and ends.** From a room, the way may start anywhere in it, and it may
   end anywhere in the room it goes to; only the stretch between the doorways it uses is
   measured. In `what=use`, a room with one doorway is measured from it to its widest point.
9. **The scoreboard's `fixtures` capability** still probes `rooms.0.fixtures` (the lab's field),
   which CNT-12 did not change, so it reads "no" though the plan holds fixtures in `items`.
   Pointing it at `items` would let wheelchair turns 3 and 9 and check 29 count (they need
   `fixtures` and `turning-space`). I did not change it: it is CNT-12's capability and moves
   counts this card did not build.
10. **The replay is unchanged.** The lab's wheelchair flat (`replay/plans.ts`) holds no fixtures,
    so turns 3 and 9 keep their S ("the plan draws it empty"). Adding fixtures to that flat would
    change the other turns' answers; worth doing with the replay's owner.
11. **`what=narrow` still lists hole widths**, and still says the clear width past a leaf is less.
    The clear widths are in `what=use` and `what=route` with a width.
