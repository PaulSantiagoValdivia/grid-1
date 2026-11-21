# MSG-14 review: doors and routes read from the geometry

For the owner. MSG-14 (step 1b) landed on `main` while you were away, in its floorplan and rules
part. Printing the door line in the answer to an edit is a command and tool server change, which
belongs to lane B: what it needs is below.

## What MSG-14 adds

All in `packages/floorplan/src/geometry/rules/`:

1. **A dividing line joins the rooms beside it along its whole length** (`graph.ts`). Each
   stretch of the line is tested at its own middle, the stretches being those of MSG-13's
   `wallSides`: cut wherever the rooms beside the line change, so at every crossing. Before, a
   line was tested only at its middle, and two lines crossing at their middles were both tested
   at the crossing point, where neither found a room.
2. **Rooms cut off are named when the way out is not checked** (`check.ts`). When a floor's only
   ways out are doors into a space not drawn (a flat's entrance onto a landing drawn as walls and
   not as a room), the route check now starts from those doors: a room that reaches neither one
   of them nor an exit gets `no_route_to_exit` with the message "Store 1 has no route to a door to
   the outside, nor to a door into a space that is not drawn". The `way_out_not_drawn` notice
   stays.
3. **"A door … leads to a space that is not drawn as a room" on every floor.** Before, only the
   ground floor was asked; upstairs, a door into floor nobody drew passed in silence.
4. **A door that joins other rooms after an edit** (`doors.ts`, exported from `geometry/rules`):
   `doorsThatChangedRooms(before, after)` reads, in each version, which rooms every door and
   doorless opening joins from where it stands (the route check's own reading), follows each by
   its id, and returns those that changed, with "door-living joined hall and living; it now joins
   hall and kitchen". A side with no room is "the outside" or "a space that is not drawn".

Together with MSG-13, a door with nothing past it and no enclosed floor is a way out whatever its
wall's kind says, which is what removes the plot plans' false notes below.

## Results

**CH-7, two stores that open only into each other** (the lab's M-8 flat, three rooms in a row,
the front door in the hall, a door between the two stores and none to the hall). With the
landing outside the front door drawn as walls: before, only the hall's door "leads to a space
that is not drawn", the way out was not checked, and the stores were never mentioned. Now both
stores are named, each with the door it does have (`through`: the other store). With nothing
past the front door, as the lab drew it, the door is the way out (MSG-13) and the stores get the
ordinary "has no route to a door to the outside".

**S-4, the open office in four zones split by two crossing lines** (24 × 14 m; the lab's
`office-move-v1`): 6 false exit notes in 7 rooms before; now each line joins the two zones on
each half (four links), and the report has no finding. The lab's own `office-move-v1` and
`office-move-v2` plans give 0 findings.

**CH-7's house on its plot** (12 false notes, the garden's open edges read as doors to nowhere):
the lab's plot plans `s01a` to `s02c` give 0 findings now, from MSG-13's outside test and the
lines read along their length.

**WR-3, a wall moved 1 m**: a hall south of a living room and a kitchen, the living-room door 4.0
to 4.9 m along the hall's north wall, the wall between living room and kitchen moved from x = 5
to x = 4. `doorsThatChangedRooms` returns "door-living joined hall and living; it now joins hall
and kitchen" (0 issues, 0 warnings, 0 notes before). Moving the wall to 5.5 names nothing.

**The scoreboard** moved no count: no damaged plan draws two dividing lines that cross, and the
damage outcomes are as they were.

## Decisions made without you

1. **Same finding code for a room cut off when the way out is not drawn**, `no_route_to_exit`,
   with its own message; a new code would need a new rule in the catalogue for the same
   question.
2. **A door is followed between versions by its id.** The rooms it joins come from where it
   stands; the card's "by where it stands, not by its id or wall" is read as the second half.
   A door removed and drawn again under a new id is the plan comparison's id-churn question.
3. **A door with no room on either side**: its wall's stated kind is not used to say which side
   is outside, since it cannot tell the sides apart; only the enclosed floor is.

No existing test changed. New tests: `geometry/__tests__/routes.test.ts`.

## For lane B

- The edit answer (the tool server's changing tools, `grid_move_room_side` and the others, and
  any `grid` command that edits) should call `doorsThatChangedRooms(before, after)` and print
  each `message` as its own line, as the lab's prototype did.
- `grid check` and `grid describe` print the route findings as they come; the new message needs
  nothing there.

## Still open

- A door on a dividing line, or a dividing line that is in no room's list, is still MS-8's.
- A courtyard or garden not drawn as a room is enclosed floor no room claims, and a door into it
  "leads to a space that is not drawn": outdoor rooms are CNT-7's.
