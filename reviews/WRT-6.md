# WRT-6 review: mark what the person gave and what the agent assumed

For the owner. The design, how each `done_when` is met, every expectation that changed, and the
choices taken while you were away.

## The design

An audit called this the heaviest format change in the theme. The design keeps every existing
reader and every existing plan file unchanged.

- **Marks are one optional top-level list, `marks`** (C7 in `types/floorplan.ts`, `MarkSchema`):
  `{ part, id, value?, source, tolerance? }`. `part` is `wall`, `room`, `opening`, `floor` or
  `item`; `value` names one value of it (a wall's `start`, `end`, `thickness`, `height` or
  `kind`, and so on, `MARKED_VALUES`), or is left out for the whole part; `source` is `given`,
  `measured`, `scanned` or `assumed`; `tolerance` is metres, give or take, only on a whole part or
  a length. A mark on a value wins over one on its part; of two on one value, the first is read.
  No number becomes an object and no part changes shape. Optional and never defaulted; the
  version stays `1`. The sheet's coverage table places it (`drawn`).
- **A value a wall leaves out stays not stated** (AU3-6). The schema still fills `Wall.height`
  (its floor's, else 2.7), `thickness` and `kind`, so the 148 places that read a wall's height
  are untouched, but the reading records what it filled in `Wall.unstated`
  (`['thickness', 'height', 'kind']`, only on a solid wall that left something out). A wall whose
  height came from its floor is marked through a symbol set by `withFloorHeights`, which no file
  can write. `unstated` is the reading's own: a file's `unstated` is ignored and named as a field
  Grid does not know (`READING_ONLY` in `reading.ts`). The parsed plan is the derived layer.
  Three helpers say it: `statedWall` (the wall as its file states it, for writing back),
  `heightStated` and `heightByDefault` (stated by neither the wall nor its floor).
- `geometry/marks.ts` reads the marks: `planMarks`, `assumedValues`, `marksWithNoPart`,
  `wallSureness`.

### Rejected

- **Numbers that become objects** (`"height": { "value": 2.7, "source": "assumed" }`): every
  reader, exporter, the rooms text and every plan file in the lab would change. Rejected, as the
  brief asks.
- **A mark field on each part** (`wall.source`, `wall.assumed: ['height']`): changes five part
  schemas and their types, and spreads one idea over five places; a list beside the parts is one
  key to place, read and strip.
- **Making `Wall.height` optional** and resolving it in one derived function: honest, but touches
  148 reads of a wall's height across the geometry, viewer, exports and CLI, for the same result.
  The record in `unstated` gives the same answer to every reader that asks, and none that does
  not ask has to change.
- **A `to confirm` list as a new field of the record** beside `lines`: a second list with its own
  count breaks "one list, one count" (MSG-1). A new line kind is an addition the contract allows.

## How each done_when is met

1. **A wall written with no height reads back as not stated, and gets the storey height only in
   the derived layer.** `parseFloorPlan` gives it 2.7 m (or its floor's height) with
   `unstated: ['height']`; `statedWall` gives it back without it. `grid describe` says "wall height
   not stated (drawn 2.7 m high)" (and "N walls with no height stated" in a mixed plan; `h?` in the
   agent card); `grid describe --as rooms` writes no `height` on its walls line; `grid write`
   writes a wall the rooms text gives no height with none, and a wall on a floor that states a
   height with none of its own (the floor says it once); and Grid's edits never write a filled-in
   value: `cutWall` (merge, add-room) writes the pieces from `statedWall`, `grid_split_room` and
   `grid_add_room` give a new wall a height only when the walls they copy state one, and the edit's
   own reading of the result reads those new walls as the file will (`readingAfter`). Before this,
   a merge on a plan with no heights wrote `"height": 2.7, "thickness": 0.2, "kind": "interior"`
   into every cut piece. Held by `packages/floorplan/src/types/__tests__/marks.test.ts` ("a value
   a wall leaves out") and `packages/cli/src/edit/__tests__/scan.test.ts` ("says a height that is
   not stated", "writes no height into a file that stated none when a room is split").
2. **Values carry a source; assumed values are drawn in their own style and listed to confirm.**
   `buildFloorPlan` sets `assumed: true` on each wall, room, opening and fixture the marks call
   assumed (whole or any value); `planScene` draws a dashed line in the look's warning colour,
   with the undecided door's pen and dash, round each (across an opening), over the walls, in
   every look; the key gains "Assumed, to confirm with the person" (`viewer/.../assumed.test.ts`,
   one case per look). The record gains a line kind, `to-confirm`, listed last so every other
   line keeps its number, and the code `plan/value-assumed`; a mark on a part the plan lacks is
   `plan/mark-no-part` (worth a look). Both are in `catalogue.ts` with wording, needed and fix,
   in the contract's code table and kinds list, and in the agents' changelog. `grid check` prints
   them under "To confirm (n)", and `grid_check` names them in its text even past its first 12
   lines (`rules/.../assumed.test.ts`, `scan.test.ts` "lists the assumed use to confirm").
3. **Squaring a scan is an explicit step that reports each wall's move; areas from a scan carry
   a plus-or-minus.** `grid_square_scan` (`edit/square.ts`, through `writeChange` like every edit)
   and `grid edit square`: by default the walls marked scanned, every wall with `all`. Each wall
   within `squareWithin` (sine 0.0523, about 3°, new in the tolerance table and
   `docs/tolerances.md`) of the plan's main direction (length-weighted, folded onto a quarter
   turn, per floor) is turned onto it about its middle; each end goes where the new lines cross,
   and the end of an unsquared wall that meets a squared one comes along its own line. Openings
   are seated as in every edit. The answer has one line per wall ("Wall "s": turned 0.94°
   clockwise, an end moved 0.050 m.") and `moves` / `leftAsTheyAre` as data; a wall further off is
   left and named. `grid_areas` gives `sureness` (`source`, `plusMinus`, `percent`) on each room
   whose walls are marked, each floor and the total, and says "from a scan, about ± 1.6%
   (± 0.39 m²)", or "how sure is not stated" for a scanned wall with no tolerance. The band is
   each side of the room times its wall's tolerance, added up, over the area: Grid's own rule,
   stated in the answer's rules (`SURENESS_RULE`). Held by `scan.test.ts` ("squaring a scan",
   "areas from a scan").

## Expectations changed

- `packages/rules/src/result/__tests__/result.test.ts`: the plan's fields named in
  `plan/unknown-field`'s `needed` gain `marks` (the new top-level key). The corpus gains a plan
  with marks, because "every kind but refused" must now meet `to-confirm` too.
- `packages/cli/src/mcp/__tests__/tools.test.ts`: `grid_square_scan` joins the fixed order after
  `grid_rename_room`, the plan-changing set and the calls; the ceiling on the tool count goes from
  21 to 22, with the reason in the comment.
- `packages/cli/src/mcp/__tests__/server.test.ts`: `tools/list` over stdio gives 22 tools, not 21
  (and `docs/commands.md` and `AGENTS.md` say 22).
- `grid_areas`' output schema gains `sureness`, null when no wall is marked, so every answer
  keeps one shape.
- `packages/cli/src/command/__tests__/everyPath.e2e.test.ts`: two slots for `grid_square_scan`
  (`plan`, `out`).
- No golden, snapshot or lab fixture changed. The eight rooms-first buildings state their heights
  and read and write as before. The tolerance docs table gains a row.

## The suite and the scoreboard

- `npm run build`, `npm run typecheck`, `npm run lint`: clean. The bundle is 484,165 bytes, under
  the 500,000 cap.
- One full run (`vitest run --exclude '.claude/**'`, two workers): 4,678 passed, 3 skipped, 1
  failed: the speed test ("grid check on the sample flat in under 500 ms"), run while the
  scoreboard shared the machine. Run alone it passes. Not a real failure.
- `npm run scoreboard`: every count the same as the stored figures (197, 386, 16, 2, 11, 735,
  95). The lab plans carry no marks, and a plan with no marks gives no new line, so
  `scoreboard/current.json` is unchanged.

## For the owner

- **The tool count is 22** (ceiling raised from 21). Squaring had to be its own step (AE-4), and
  `grid edit` verbs are made from tools. Reversible: the verb and the tool can fold into another
  tool later.
- **A new line kind, `to-confirm`, counts in `count`.** An agent that marks what it assumed sees
  `toLookAt` grow. The alternative was a separate list outside the count. Placing it last keeps
  every other line's number.
- **Rooms text no longer writes a default height.** A rooms text with no `height` on its walls
  line now writes walls with no height (they read as 2.7 m, not stated). A wall on a floor that
  states a height is written with none of its own. Before, both got a written figure. Plans
  already written keep theirs. A plan where some walls state a height and others do not is read
  back with that floor in Grid's own terms (raw lines), since rooms text cannot say "not stated"
  for one wall.
- **Only wall marks feed the area band and the squaring** ("starting with walls"). Marks on
  rooms, openings, floors and fixtures are read for "assumed" (drawn and listed) and kept, but no
  figure uses their tolerance yet.
- **`unstated` covers walls only.** An opening's `sill` (default 0) and a room's or fixture's
  values with defaults still fill silently. The same record fits them when it is wanted.
- **The kind is recorded as not stated, but Grid still works it out from the rooms** as before
  (`wall/kind-differs`); nothing reads `unstated` for kind yet beyond `statedWall`.
- **The band is a worst case** (every face moves its full tolerance one way). The lab's figures
  (AE-4: mean 0.5 to 1.9 %) suggest a typical error well inside it; a statistical band would need
  a decision on what the tolerance means (one standard deviation, or a bound).
- **The server's instructions in `distribution/listing.ts` do not name `grid_square_scan`**: the
  tool's own description says when to use it, and changing the instructions moves the install
  tests' text. Worth adding with the next listing change.
