# ARE-5 review: rooms that overlap, and rooms inside rooms

For the owner. ARE-5 (step 1b) landed on `main` while you were away. Below: what it adds, the
change to the plan file (which needs your check), the results on the lab's AR-3 and AR-4 cases
and the scoreboard, the decisions made without you, the tests that changed, and what is still
open.

## What ARE-5 adds

**An overlap check.** `packages/floorplan/src/geometry/overlaps.ts` sets the rooms of each floor
against each other, pair by pair. Two rooms that share 0.01 m² of floor or more get a warning,
`room/overlap`, naming both rooms, each one's area, the shared area and a point inside it:

| What the two rooms do | What the line says |
|---|---|
| Cover the same floor (a room listed twice) | `Rooms master and master-dup cover the same 34.14 m² of floor and list the same walls, so that floor is counted twice, once in each. If one is a copy of the other, remove it; if not, check their wall lists.` |
| One lies wholly inside the other (a pod, or a room that grew over its neighbour) | `Room ward (3.61 m²) lies wholly inside room bed (26.79 m²), so 3.61 m² of floor around (3.00, 2.50) is counted twice, once in each. If ward sits inside bed, as a wardrobe pod or an en-suite does, mark ward with "inside": true and its floor is taken off bed. If not, check the wall list of bed: it most likely names a wall it should not.` |
| Each covers part of the other | `Rooms hall (5.33 m²) and den (21.12 m²) overlap: 2.08 m² of floor around (5.30, 4.15) lies in both, so it is counted twice. Check their wall lists: one of them most likely names a wall of the other.` |

**A room inside a room.** A room can now say `"inside": true`. Grid finds the room it sits in
from the outlines (`packages/floorplan/src/geometry/nesting.ts`) and takes the inner room's floor,
with its own walls, off that room. The inner room is never reported as overlapping the room it
sits in, and a door in its walls opens into that room. A room marked `inside` that no room holds
gets `room/inside-no-host`, which says how much of it lies outside the room that holds most of
it, and it is then counted on its own.

The areas follow everywhere Grid gives one: `roomArea`, the 2D drawing's labels and the DXF
labels (`buildFloorPlan`), the room-size check in `packages/rules`, the spaces check from ARE-4
and the plan comparison. The outline of the room around it stays whole; only its area changes.

## The change to the plan file (needs your check)

One new optional field on a room, in `packages/floorplan/src/types/floorplan.ts`:

```json
{ "id": "ward", "name": "Wardrobe pod", "boundary": ["pod0", "pod1", "pod2", "pod3"], "inside": true }
```

- `inside` is `true` or `false`. Unstated means `false`, and no key is added to a plan that does
  not state it, so every plan written so far reads exactly as before. Any other value (such as
  the name of a room) is refused, naming the place (`rooms.3.inside`).
- **The version rule (CNT-1).** Its decision is "new fields are optional and added one version at
  a time", but no version rule exists in the code yet: the version is the fixed text `"1"`, and
  there is no reader for another version and no `grid upgrade`. As the brief said, the field is
  added as optional to version 1. Whether it should wait for version 2, or be the first field of
  it, is yours to decide.
- **Both spellings (WRT-1).** The schema has one spelling today, walls first: rooms-first writing
  is decided but not built. When it is, a room written rooms first can carry the same `inside`,
  because it is a fact about the room, not about its walls.
- **No host id.** The field says only that the room sits inside another, not which one. The brief
  asked for the host to be found by geometry. The other way, `"inside": "bed"`, would let Grid
  check the claim against the outlines but would go stale when a room is renamed. Switching later
  is a format change.

## Exact intersection, not triangles

The roadmap card suggested cutting both outlines into triangles with the existing triangulation
and intersecting those. ARE-4 has since brought in `polygon-clipping` (MIT), which intersects two
polygons, convex or not, exactly, in one call. That is simpler than intersecting every triangle
of one room with every triangle of the other, and gives the same area. The check uses it on the
rooms as Grid measures them, so a room with a room inside it is compared without that room.

Two things make it robust and fast:

- **Tolerance.** Only 0.01 m² of shared floor or more is reported, the scoreboard's own line.
  Rooms that meet across a wall share nothing; rooms that meet along a dividing line share an
  edge, which is 0 or rounding noise far below the line. Turned plans (7° to 137.5°) and plans a
  thousand kilometres out are tested.
- **Precision and speed.** Each pair is moved next to the origin before it is cut, so a plan in
  surveyed coordinates is cut as exactly as one at the origin. Only pairs whose boxes share at
  least 0.01 m² are cut, found by sweeping the rooms from left to right, so rooms side by side
  are never cut at all. The whole lab, 3,405 plans, takes 0.24 s; a test guards a grid of 900
  rooms. When the library fails on a
  pair, it is tried again with points rounded to 1 nm, 0.1 µm and 1 µm, as ARE-4 does; if every
  try fails, `room/overlap-unknown` says so. That happens on no lab plan.
- **A cap.** Rooms piled in one place are the one input whose cost grows with the square of the
  rooms: 5,000 copies of one room would be 12.5 million cuts, most of an hour. So one plan is cut
  for at most 200,000 pairs (`MAX_CUTS`, a few seconds), and a floor not finished gets
  `floor/overlaps-unknown`, with the overlaps found so far still listed. Finding hosts has the
  same cap (`MAX_HOST_CUTS`); the rooms marked `inside` left over get `room/inside-no-host`
  with the reason. No lab plan comes near it: the largest, 5,000 rooms in a grid, has no pair to
  cut. Two tests pile 700 copies of one room and finish in under 5 s.

The polygon helpers that ARE-4 kept in `spaces.ts` (areas, boxes, wall strips, corners made good)
moved, unchanged, to `packages/floorplan/src/geometry/polygons.ts`, so that the overlap and nesting
code can use them without importing the spaces check.

## Results

### AR-3: a room inside a room is counted once

With the pods marked `inside`, every room in both lab plans measures what the referee measured
(within 0.01 m²), and the plans get no warning at all.

| Plan (lab name) | Room | Before | Now, marked | Referee / lab by hand |
|---|---|---:|---:|---:|
| `s09-room-in-room` (B-13) | Bedroom round a wardrobe pod | 26.79 (+19.7%) | 22.38 | 22.38 |
| | Hall round a lift shaft | 21.09 (+18.2%) | 17.85 | 17.85 |
| `d3-student-inside` (D-17) | Each of 20 bedrooms round an en-suite pod | 15.96 | 12.70 | 12.70 |
| | The floor | 505.27 (+65.0 m²) | 440.28 | 440.28 |

What comes off the bedroom is the pod's footprint: its 3.61 m² of floor and the 0.80 m² of its
walls, 4.41 m² in all, which is what the lab took off by hand. On the student floor each pod sits
in a corner of its bedroom, so only the part of its footprint inside the bedroom (3.26 m²) comes
off: the outer walls the two share are the bedroom's own.

The notes no longer say "A door from Wardrobe pod leads to a space that is not drawn" or that
the lift shaft has no way out: the pod's door links it to the bedroom, the lift's door to the
hall. Unmarked, the same plans now get one `room/overlap` line per pod, which says how to mark it.

### AR-4: each overlap names both rooms and the shared area

| Plan (lab name) | The lab's figure | What Grid says now |
|---|---|---|
| The flat with "Den" (`f14-rooms-overlap`, E-15) | +21.12 m² | Three lines on `den`: `hall` 2.08 m² shared; `bed1` (13.64 m²) and `bath` (4.80 m²) lie wholly inside it |
| The villa with one wrong wall (`villa-wrong-wall`, A-14) | +21.45 m² | `ensuite` (20.74 m²) lies wholly inside `master` (55.59 m²) |
| The villa with a room listed twice (`villa-duplicate-room`, A-14) | +34.14 m² | `master` and `master-dup` cover the same 34.14 m² and list the same walls |
| The hotel room that kept its neighbour's wall (`hotel-mistakes`, C-9) | 28.83 against 20.61 | `room-308` (20.37 m²) and `room-309` (28.67 m²) share 3.32 m²; `bath-309` (4.22 m²) lies wholly inside `room-309` |

The lab's figures are each room's whole excess, and the overlap is the floor that excess counts
twice. The rest of each excess is wall, which ARE-4 already names in its `room/space-mismatch`
line: for the den, 20.52 m² shared and 0.61 m² on walls `bed1-north` and `hall-east` make its
21.12 m²; for the villa, 20.74 m² shared and 0.72 m² on wall `n5` make the 21.45 m²; for the
hotel room, 7.54 m² shared and 0.76 m² on walls make its 8.30 m² over the referee. The hotel
figures are lower than the lab's because ARE-1 corrected the L-shaped bedrooms (C-10): Grid now
measures 28.67 m² against the referee's 20.37.

### Rooms meeting face to face: no false alarms

- **The 442 sound plans: 0 overlap findings.** A test in `scoreboard/__tests__/scoreboard.test.ts`
  holds that, and the guard "sound plans with a warning" stays 70.
- **All 3,405 readable lab and generated plans:** 110 overlapping pairs in 30 plans, none in the
  2,300 generated plans. Every one is floor really counted twice: the AR-3 and AR-4 cases above
  in all their copies (76 pairs), plots and gardens drawn as rooms round a house (26 pairs in
  three plans), and a spiral stair, a stair cupboard and a dining table drawn as rooms (8 pairs). 16 of the
  pairs are between two rooms that each agree with the referee, because the referee scores a
  room it finds sharing a space as "shared"; they are the den, the duplicated master bedroom and
  their copies.

### Scoreboard

| Count | Before (after ARE-4) | After |
|---|---:|---:|
| Rooms measured wrong | 203 | 203 |
| Damage that passes in silence | 468 | 468 |
| Turns answered | 15 | 15 |
| Design mistakes named | 2 | 2 |
| Checks the plan can feed | 5 | 5 |
| Guard: rooms Grid does not measure | 712 | 712 |
| Guard: sound plans with a warning | 70 | 70 |

No count moved. The lab's plans were written before a plan could say that a room sits inside
another, so none says it, and Grid measures every room as before. 67 of the 200 lab rooms still
measured wrong are now also named in a `room/overlap` line. In the damage set, three plans that
were caught vaguely now name the damaged part (named 1,669 to 1,672, vaguely 240 to 237);
`current.json` stores the new detail.

## Decisions made without you

- **The host is the smallest room that holds it.** A room marked `inside` sits in the smallest
  room on its floor whose outline holds all of it but 0.01 m², and that is strictly larger. So a
  cupboard in an en-suite in a bedroom sits in the en-suite, and the en-suite, with the cupboard
  in it, in the bedroom. The door graph is not used.
- **What comes off is the footprint, inside the host.** The inner room's outline, the strips of
  the solid walls it lists (square ends, corners made good as in ARE-4), and whatever they close
  off, cut to the host's outline. That matches the lab's hand figures and the referee. Two rooms
  inside one host that overlap each other come off together, once, and are reported as
  overlapping each other.
- **Connected through its doors.** "Treated as connected to its host" is read as: a door or
  doorless opening in the inner room's walls opens into the host, though the host does not list
  that wall. An inner room with no door is still told it has none (a lift shaft with no door
  drawn, say). Connecting it with no door at all would hide that.
- **Which room a door opens into.** Where several rooms that list a wall hold the point past it,
  the smallest is the one there. Before, the first room in the file won: an en-suite in the
  corner of a bedroom, which lists the bedroom's outer walls too, lost its window to the bedroom.
- **Nothing is inferred.** A room wholly inside another but not marked is not taken off it: it is
  reported, and the line says how to mark it. Marking it is the plan's statement, like a wall's
  `kind`. The same line also says to check the outer room's wall list, because a wrong wall gives
  the same picture (the villa's master bedroom over the en-suite).
- **Warnings, one per pair.** Both rooms stay drawn and measured. The line goes on the larger
  room, which most often is the one that grew, or on the later of two copies.
- **`validatePlan(plan, index, { spaces: false })`** also leaves out the overlap and nesting
  lines, as it leaves out the spaces: callers that only read `broken` need none of them.
- **`roomArea` is the room's area as Grid gives it**, less any room inside it. The scoreboard,
  which only calls functions that also exist at the reference commit, reads it unchanged.
  `area(roomPolygon(room, index))` is still the outline's area.
- **The plan comparison** reports a host's area change as following from the room inside it (a
  pod added, moved or marked), and `inside` is one of a room's compared properties.

## Tests that changed

No expected figure changed.

- **Fixed and flipped:** `AR-4 a room listed twice is reported`, moved to a block named "lab
  failures fixed by ARE-5" in `geometry/__tests__/validation.test.ts`, now asserting the code, the
  room it is on and the whole message. `pinned-tests.md` lists it.
- **New:** `geometry/__tests__/overlaps.test.ts` (20 tests: face to face, dividing lines, turned
  and far plans, two floors, the five fixtures, a 900-room grid, copies, wrong walls, the villa
  cases); `geometry/__tests__/nesting.test.ts` (21 tests: the format, the lab's room-in-room plan as
  a new fixture `fixtures/room-in-room.json`, a corner en-suite, rooms three deep, two pods that
  overlap, no host, another floor, the plan comparison); one size-check test in
  `packages/rules`; and in `scoreboard/__tests__/scoreboard.test.ts`, the AR-3 and AR-4 lab plans
  read from the stored lab data and checked against the referee, and the 442 sound plans with no
  overlap.

## Checks

`npm run build`, `npm run typecheck`, `npm run lint`, `npm run check:licenses`,
`npm run check:data` and `npm run scoreboard` pass. The tests pass as
`npx vitest run --exclude '.claude/**'` (138 files, 3,405 tests), which is `npm test` without the
other sessions' worktrees (see below).

## Still open

- **The 3D view and the IFC export** still give the host its whole outline: its floor slab and
  its `IfcSpace` run under the inner room, and a program that measures the IFC spaces counts the
  pod twice. That needs rooms with inner boundaries, which ARE-6 (rooms with holes) builds; the
  roadmap pairs the two.
- **The host's label** sits at the centre of its outline, which can fall inside the pod.
- **Objects and outdoor space drawn as rooms** (a stair, a table, a plot or garden round the
  house) are reported as overlaps, which is true, but the line's advice (mark it `inside`, or
  check the wall list) does not fit them. They belong to the stair, furniture and outdoor-space
  features, as the brief said.
- **Zones meant to overlap** (roadmap feature 87 needs ARE-5): when a plan can say that a zone
  overlaps rooms on purpose, the overlap check must leave it out.
- **A refused inner room.** A room marked `inside` that the drawing's checks refuse for another
  reason (a duplicated id, a wall on another floor), but whose outline closes, is still taken off
  its host.
- **The command line** was not touched (another session works there). `grid check` shows the new
  lines with no change. ARE-4's open point about `grid check --floor` still stands.
- **`npm test` also runs other sessions' worktrees.** The root `vitest.config.ts` does not
  leave out `.claude/worktrees/`, so `npm test` in this checkout also runs the tests of every
  worktree another session keeps there. My first full run did that and never exited: one test
  worker sat at full CPU for about ten hours after every file had reported a result. Run file
  by file under a 5-minute limit, each of this checkout's 138 test files passes, the longest in
  86 s, so the worker was most likely on a file of another worktree that changed while it ran.
  The checks below were run with `--exclude '.claude/**'`. Adding that exclude to
  `vitest.config.ts` is a one-line change outside ARE-5's files; worth making.
