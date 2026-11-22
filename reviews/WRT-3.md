# WRT-3 review: edit commands, one sentence of request is one call, and openings stay put

For the owner. What WRT-3 adds, how each `done_when` is met, what changed in tests and
fixtures, and the decisions to check.

## What it adds

- **Five new edits**, each a tool of `grid serve` and a verb of `grid edit`:
  `grid_merge_rooms` (`merge`), `grid_split_room` (`split`), `grid_add_room` (`add-room`),
  `grid_stretch` (`stretch`) and `grid_rename_room` (`rename`). The code is in
  `packages/cli/src/edit/` (`merge.ts`, `split.ts`, `addRoom.ts`, `stretch.ts`, `rename.ts`),
  the tools in `src/mcp/editTools.ts`.
- **Two existing edits do more.** `grid_change_opening` moves an opening to a side of a room
  (`room`, `side`) and places it from a room's side or an end of its wall (`from`,
  `distance`), as rooms text does. `grid_move_room_side` takes an inside size (`to`) instead
  of a distance (WRT-2's "resize by an inside size").
- **Openings stay put** (`edit/seat.ts`). After any edit that moves walls, each opening on a
  changed wall is put back by its anchor, else by its place in the building; then a door
  that would join other rooms is carried with the move if that keeps it between the same
  rooms, and otherwise left in place and named under "could not keep".
- **The opening anchor**, a new optional field of the plan format (CNT-1: optional, never
  defaulted, version stays "1"): `anchor: { from, room? }` on an opening. `from` is `start`,
  `end`, or a side of the drawing (the wall's end toward it, so the agent need not know which
  way the wall runs); with `room`, that room's inside face on that side. `offset` is still
  the one place an opening is drawn from (C2, reopened in its comment); the anchor only tells
  Grid's edits what to keep. `grid_change_opening` writes it when `from` is given; a split's
  door placed with `door_from` gets one too.
- **Every edit answer** (`writeChange`) adds `guessed` and `couldNotKeep`, as data and as
  "Guessed:" and "Could not keep:" lines. Lists that grow with the building (walls that
  followed, rooms beside a moved wall, openings that stayed in a stretch) show at most three
  names, then how many more.
- **`grid edit <verb>`** (`src/command/edit.ts`): the verbs `opening`, `move-side`, `merge`,
  `split`, `add-room`, `stretch`, `rename`, `mirror`, each built from its tool's own argument
  list (dashes for underscores), so the command and the tool cannot drift apart. Exit 2 for a
  bad option, 1 for a change refused, with one line on standard error.
- **`rulesForUse`** in `packages/rules` (`checks/catalogue.ts`, `RULE_USES`): which figure
  rules look at a room of a use. `grid_rename_room` answers with the rules that now look at
  the room and those that no longer do.

## The done_when items

1. **The six WR-2 requests each run as one call** (`edit/__tests__/requests.test.ts`), each on
   E's version before it, compared with E's hand version by where every wall is (wall ids are
   names), by id for rooms and openings, to the millimetre:

   | Request | Call | Against E's hand version |
   |---|---|---|
   | 1. Kitchen 1 m deeper | `grid_move_room_side` room kitchen, side south, `to` 4.0 | Same walls and rooms. One difference, said in the answer: see below |
   | 2. Merge kitchen and living | `grid_merge_rooms` | Identical |
   | 3. Bathroom door to the other wall | `grid_change_opening` room bath, side north, from west, distance 0.25 | Identical (plus the anchor) |
   | 4. Bedroom 2 into a study and a bathroom | `grid_split_room` | Identical (plus the door's anchor); "Study has no window now" |
   | 5. 3 x 4 m extension with sliding doors | `grid_add_room` with `in_the_way remove`, an opening and a door | Identical but for the door's id (`door-extension`, E's `slide-garden`); the door has no swing, as E's, and the answer says Grid has no sliding door |
   | 6. The flat 30 cm wider | `grid_stretch` side east, by 0.3 | Identical, entrance offset 3.45 → 3.75 |

   The lab prototype matched four (1, 2, 4, 6); requests 3 and 5 it did not cover, and both
   now match. **Request 1, the one difference:** by hand, E carried the living-room door 1 m
   with the wall (offset 3.45 → 2.45), which puts it in bedroom 1's wall: the door joins the
   living room and bedroom 1 there. That is the lab's own WR-3 mistake. Grid tries the same
   carry, sees it would join other rooms, leaves the door, and says so: "door "door-living"
   could not stay between the same rooms … It was left in place", with the MSG-14 line that it
   now joins the hall and the kitchen. The test holds that one difference.
2. **WR-4.** Widening the flat leaves the entrance at x 4.85 to 5.75, clear of every wall that
   meets the north wall (test "keeps the entrance off the wall junction"). A door anchored to
   bedroom 2's south side keeps its distance to that corner within 1 mm when that side moves
   0.3 m (offset 2.0 → 1.7), and one anchored to the west end of a wall that grows at its
   start keeps its distance from that end.
3. **AB-8.** `grid_rename_room` renames, changes the use (or `none`), and answers "Checks that
   now look at it: …" / "Checks that no longer do: …", with the rule ids in `checks`.
   Bedroom 2 to a study of use other: both figure rules no longer look at it. The living room
   to a bedroom: the escape-opening rule now does.
4. **AU6-3.** Every answer names the plan by its path in the project (`Wrote "plan.json".`),
   never the folder (`answerSize.test.ts` checks the text and data hold no part of the project
   path). Rename, a north side moved and an east side moved, on bedroom 2 of the flat and on
   bedroom 2 of flat C in the 588-part block, answer within 10% of the same size.

## A bug found and fixed on the way

`comparePlans` (`quantities/compare.ts`) paired openings by position without looking at the
floor: moving the north wall of one flat of the block paired its windows with the windows
above them, and every edit answer said "openings: 6 out, 6 new". It now pairs an opening only
with one on its own floor. `quantities/__tests__/compareFloors.test.ts` fails without the fix.
No expected figure elsewhere changed with it.

## Expected figures, golden files and snapshots changed

- `mcp/__tests__/tools.test.ts`: the tool order adds the five tools after `grid_mirror`; the
  ceiling on the number of tools goes from 15 to 20; `grid_rename_room` is excused from
  "mentions metres", as `grid_mirror` is; `grid_stretch` gets its own arguments in the
  unknown-floor test; the five tools get sample calls.
- `mcp/__tests__/server.test.ts`: 15 → 20 tools listed.
- No golden file, snapshot, scoreboard figure or rooms fixture changed.
- New fixtures, copied from the lab as data: `packages/floorplan/fixtures/edits/flat-v00.json`
  to `flat-v06.json` (lab E's two-bedroom flat and its hand edits) and `block-588.json` (lab
  D's block with a basement, 588 parts).

## Decisions for the owner to check

1. **20 tools.** One tool per request (WR-2), against "about a dozen". I folded resize into
   `grid_move_room_side` (`to`) and moving an opening into `grid_change_opening` rather than
   adding two more. If 20 is too many, the next fold would be `grid_stretch` into
   `grid_move_room_side`.
2. **The anchor is written when `from` is given.** Placing an opening from a corner records
   that it is kept from there. A plan edited this way carries `anchor` keys an older Grid
   reads as unknown (it ignores them; MSG-4 may start naming them).
3. **No anchor means "where it is in the building".** An unanchored opening on a wall that
   changes keeps its place, except a door that would then join other rooms, which follows the
   move if that keeps its rooms. The lab prototype did the same.
4. **The extension's size and place.** `grid_add_room` sizes are inside sizes unless `size
   centre`; `distance` runs from the host room's inside face to the new room's inside face.
   With openings in the covered stretch and no `in_the_way`, the call is refused in one line
   naming them (Y-11) rather than guessing.
5. **The split's door** hangs from its south or west end and opens toward the west or north,
   as the prototype and E did; the answer says so as a guess.
6. **Stretch defaults** to the outside wall on that side, every floor together; both are
   said as guesses.
7. **Rectangles and right angles only** for split and add-room, as the prototype. Merge
   refuses rooms sharing more than one wall and rooms with holes.

## Message codes

No new message code: edit refusals are one line of `EditRefused` text, outside the record
(MSG-1's catalogue covers the record's codes). The contract's receipts row and changelog say
what the receipts add.
