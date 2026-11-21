# MSG-12 review: wall faults named at the wall, each with its fix

For the owner. MSG-12 (step 1b) landed on `main` while you were away. Below: what it adds, the
results on the lab's cases and the scoreboard, the decisions made without you, the tests that
changed, what lane B still has to build (`grid tidy`), and what is still open.

## What MSG-12 adds

A room's outline is made by crossing the endless lines of its walls, so where a wall ends never
changed it, and nothing compared one wall with another. `packages/floorplan/src/geometry/wallFaults.ts`
now does both, floor by floor, and names each fault at the wall with the change that would fix it.
`validatePlan` reports them as warnings (they are skipped with `{ spaces: false }`, like the other
checks that never change `broken`):

| Code | Entity | What it finds | Fix offered |
|---|---|---|---|
| `wall/short` | the wall | At a corner of a room, one of the two walls stops short of where their lines cross | Move its end to the corner |
| `wall/gap` | the wall before the gap | The pieces of one straight side of a room leave a gap, in whatever order they are listed | Move the end of the piece before the gap |
| `wall/overrun` | the wall | A wall runs past the last corner any room makes on it, and its end meets no other wall | Move its end back to that corner; the message also offers the other reading when the other wall ends at the corner |
| `wall/duplicate` | the copy | Two walls (or two lines) on one line whose bodies overlap | Remove the copy, list the kept wall in its place, move its openings over (a door both carry is not doubled; hinge and swing are turned when the walls run opposite ways); or take back the overlapping end |
| `wall/line-on-wall` | the line | A dividing line on top of a solid wall | Remove the line and list the wall in its place; or take back its end. None when the line carries an opening |
| `room/wall-listed-twice` | the room | A room names one wall twice | List it once, when the room still has an outline |
| `wall/crosses-room` | the wall | A wall across a room that does not list it, from side to side | Split the room in two along it, each part listing it. The larger part keeps the id, name and use; the other is `<id>-2`, named "<name> (part)", with no use |
| `wall/stands-in-room` | the first wall | Walls that stand inside a room without dividing it: a stub, or a pod, column or furniture drawn as walls. One line per room | None: what they are is for the person to say |

In the library: `wallFaults(plan, { index, broken })` returns each fault with a stable id
(`short:n:start`, `gap:s1:s2`, `overrun:w2:end`, `duplicate:copy`, `line-on-wall:bay-e`,
`listed-twice:r1:w2`, `crosses-room:stray:bed`, `stands-in-room:r1`), its kind, floor, walls,
rooms, distance, message and fix. A fix is a list of plain edits (`move-end`, `remove-wall`,
`set-boundary`, `add-room`, `move-opening`, `remove-opening`). `applyWallEdits(plan, edits)`
makes them on a parsed plan or on a plan file as read, and keeps every other key.
`tidyPlan(plan, ids?, parse?)` makes the fixes of the faults named (or of every fault with a
fix), looking for the faults again before each one, and says why any was skipped.

A fix is offered only after it has been tried: every room it touches must still have an outline
with no fault. Moving the start of a wall resets the offsets of its openings so they stay where
they stand; a fix that would push an opening off its wall is not offered.

## The tolerance

Every distance is read against the table (MSG-15), no new entry:

- **Reaching.** A wall reaches the wall it meets when its end lies within half the thicker of the
  two plus `gap` (0.02 m) of the other wall's line, as `gap` already said. So walls drawn to centre
  lines, to inner faces, and 1 mm apart all meet. For a corner that is the distance to the
  corner times the sine of the angle between the walls; for an overrun it is how far the end is
  past the last corner.
- **A free end** lies on no other wall's body to within `gap` (half that wall's thickness plus
  0.02 m).
- **On top of each other**: the two bodies overlap by more than `gap` across their width, along
  more than the thicker wall (at least `lineInside`, 0.05 m) plus `gap`, and the walls are closer
  to parallel than `nearlyParallel` (15 degrees).
- **In a room**: more than `lineInside` of the wall's centre line inside the room's outline.

The `decides` text of `gap` and `lineInside` now says they serve these checks too. No value
changed.

## Results

**MS-2, the lab's gap room** (4 × 3 m, north wall 1.5 m short; 0 issues and 10.64 m² before):
"Wall n stops 1.50 m short of its corner with wall e in room r: its start is at (2.50, 3.00) and
the corner at (4.00, 3.00). The room is measured as if the two walls met. Fix: move the start of
wall n to (4.00, 3.00)." Tidied, the plan gives no issue at all and the room is still 10.64 m².
ARE-4's `room/not-enclosed` on the room stays beside it.

**L-6, the 333 plans with one wall end slipped** (the damage set's "scale one coordinate"): 279
now name the slipped wall, against 132 before. The other 54:

- 19 change no figure at all and 22 more are a slip of 1 mm (an end at 0 scaled to 0.001), within
  the 2 cm that `gap` allows on purpose ("1 mm gaps are rightly tolerated", MS-2);
- 10 cm slips (0 scaled to 0.1) on walls 0.2 m or more thick, within half the thickness plus
  `gap`: a wall drawn to the face of the next looks exactly like that;
- slips that leave a consistent drawing: an end that slides along the wall it meets turns the
  wall, but every end still lies on a wall, and the room closes on the new corner. Example: the
  south wall of a flat whose end rises 1.1 m up a partition, making a skewed façade. Nothing in
  the geometry says which drawing was meant.

The done_when asked for every one; 279 of 333 is what the stated tolerance allows. Lowering the
reach would name the 10 cm slips and also every wall drawn to a face.

**L-6's smallest case** (`corner-slipped-0.3m`, 9.43 m² instead of 9.99): "Wall east runs 0.30 m
past its corner with wall south in room room, at (4.00, 0.30), to (4.00, 0.00), where it meets no
other wall. Fix: move the start of wall east back to (4.00, 0.30). If instead wall south is meant
to reach (4.00, 0.00), move its end there." The second sentence is the real slip; Grid cannot
tell which wall moved, so it offers the trim as the fix and states the other reading.

**MS-15, a copy of a wall**: "Wall copy lies on top of wall w1 for 5.00 m: the drawing and every
export show that stretch twice. Fix: remove wall copy." The lab's `f04-two-identical-walls` (in
four copies) and the round trip `k-virtual-back` (two dividing lines on one line) are named the
same way. **AE-5's doubled scan walls**: a doubled door on the two copies is not doubled again by
the fix.

**W-10, dividing lines on solid walls**: in D's parking basement "Dividing line B1-bayline-se-4
lies on top of wall B1-ext-e for 5.00 m, so that stretch is both open and solid. Fix: remove line
B1-bayline-se-4, and list wall B1-ext-e in its place in room B1-bay-12", and the aisle line on the
core wall for 6.00 m (no fix: it runs past the wall at both ends). The lab counted 29 lines in 4
plans; Grid names 8 of them (2 in each of the 4 copies of the basement). The other 21 are the
aisle lines crossing seven 0.40 m columns in each basement copy, and the carport line touching
two 0.15 m posts for 0.07 m. **Decision:** a line that passes through a column drawn as a short
wall is how a line through a row of columns is drawn; naming it would put a line on every column
of every aisle. The threshold is the thicker wall plus `gap`, so a column 0.40 m long is not
named. If you want them named, it is one comparison in `overlapFaults`.

**MS-17, the partition across the bedroom** (lab M-7: 0 issues, 0 notes): "Wall stray runs
3.00 m across room bed, which does not list it, so the room is measured and checked as one space.
Fix: split room bed along it, into bed (4.35 m²) and bed-2 (4.35 m²), each listing it. If it
should not be there, remove it instead." Tidied, the two rooms add up to the bedroom less the
partition, and no fault is left. The three copies of V-9's dividing line through a bedroom are
named the same way.

**The 442 sound plans give no wall fault**, and the six shared fixtures (the flat, the villa, the
three-bed house, the Madrid and Berlin flats, the room-in-room plan) give none either. Each of
the sound plans' 91 warnings is still a door collision.

**On the 1,121 lab plans** (hand-written, many broken on purpose), 91 plans get a wall fault:
34 short corners (25 plans: the lab's mistake probes, the villa with a wrong wall, the stair
shifted on floor 3, gardens drawn across the house), 12 overruns (8 plans: the junction probe's
wall 1 m past both ends, the shifted stair, the slipped corner), 11 duplicates (10 plans), 10
lines on walls (5 plans), 29 walls across a room (21 plans) and 133 rooms with walls standing in
them (50 plans: student-room pods not marked `inside`, columns, trees and fences in gardens,
furniture drawn as walls, a stair drawn in lines).

## The scoreboard

| Count | Before | After |
|---|---:|---:|
| Damage that passes in silence | 447 | 388 |
| Damage caught, naming the damaged part | 1,721 | 1,907 |
| Damage caught vaguely | 209 | 109 |
| Damage with no effect at all | 117 | 90 |
| Sound plans with a warning (guard) | 70 | 70 |

Every other count is unchanged. By kind of damage: one coordinate scaled, 52 silent and 95 vague
now named; a damaged wall list (a wall listed twice), 27 with no effect and 3 silent; a number set
wrong, 4 silent and 2 vague; an id reference changed, 3 vague. None moved the other way. A full
run takes about 35 s instead of 25.

## Decisions made without you

1. **Warnings, not errors.** Nothing is left out of the drawing because of a wall fault, as with
   the other checks on spaces and overlaps.
2. **One line per room for walls standing in it**, with no fix. Each wall of 20 student pods would
   otherwise be 40 lines in one plan.
3. **A wall crossing a room is "dividing" only when the room can be split along it**; a column
   straddling the line between two bays stands in both.
4. **The new part of a split room has no use**, and the larger part keeps the room's id, name and
   use.
5. **A straight side drawn in pieces is judged as a whole**: a corner is measured from the piece
   nearest it, and a gap is a gap in the pieces' union. Listing the pieces of one side out of
   order (the damage set's swaps) changes no outline and is not named.
6. **Two thick walls of a room narrower than they are thick** overlap, but are left to that
   room's `room/inside-out` refusal and not called duplicates.
7. **A refused room** (out of order) is left to its refusal; its stray corner is not called short.

## Tests that changed on purpose

- `geometry/__tests__/validation.test.ts`: `MS-15 a copy of a wall under a new id is reported`
  was an expected failure and now passes; it moved to "lab failures fixed by MSG-12" and asserts
  the code, entity, id and whole message.
- Same file, "lab failures fixed by ARE-4": `MS-2 …` and `MS-17 …` pin the exact issue list and
  each gained the wall line (`wall/short` on `w2`, `wall/crosses-room` on `cut`). The room lines
  they asserted are unchanged.
- `packages/floorplan/src/test-support/pinned-tests.md` records both.

No expected figure changed. The new tests are in `geometry/__tests__/wallFaults.test.ts`.

## For lane B: `grid tidy`

The done_when's `grid tidy --apply <ids>` is a command in `packages/cli`, which is lane B's.
What it needs from the library is there and tested:

- `grid tidy [plan]` lists `wallFaults(plan)`: id, message, and whether a fix is offered.
- `grid tidy --apply <id,…>` (or `--apply all`) reads the plan file as raw JSON, calls
  `tidyPlan(raw, ids, parseFloorPlan)`, writes the result through `projectFiles.ts`, and prints
  `applied` and `skipped`. The raw file keeps every key it had.
- "As the first step after an import": the importer can call `tidyPlan` with no ids.
- A tool for `grid serve` (`grid_tidy`, a changing tool) would take the same ids.

## Still open

- 54 of the 333 slipped ends stay unnamed, for the reasons above.
- Columns on aisle lines (W-10's other 21) are not named, by decision 3 of W-10 above.
- A wall's end that is free but lies inside its own room (a stub drawn as part of the list) is
  not tested: no room in the lab draws one.
- `wall/stands-in-room` repeats what ARE-4's `room/space-mismatch` says about the same walls, on
  the wall instead of the room. Merging the two is MSG-7's question (each finding says what
  would be right).
