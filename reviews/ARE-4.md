# ARE-4 review: the spaces the walls enclose, and floor no room claims

For the owner. ARE-4 (step 1b) landed on `main` while you were away. Below: what it adds, the
library it uses, the results on the lab plans and the scoreboard, the decisions made without
you, the tests that changed, and what is still open. At the end, every one of the 200 lab rooms
still measured wrong is listed with what Grid now says about it.

## What ARE-4 adds

Until now a room was a list of walls, and its outline was never compared with the space those
walls actually enclose. A room left out of the file made the total smaller in silence.

`packages/floorplan/src/geometry/spaces.ts` now works out, once per floor and without looking at
any room, the spaces the walls enclose. It is the method of the lab's referee:

1. Every solid wall is a strip with square ends, as the 2D view draws it, lengthened by 1 mm at
   both ends so that walls drawn to meet do meet.
2. Where two walls end at one point at an angle, the notch between their square ends is filled
   (the corner made good), as the room outline already does.
3. Every dividing line is a hairline, a few nanometres wide.
4. The strips are joined. What their outer edges enclose is the floor's outline; less the walls
   it is the enclosed floor; less the walls and the lines it falls apart into the spaces.

Then each room's outline is set against the spaces. `validatePlan` reports what it finds as
warnings ("worth a look" in `grid check`), so nothing is left out of the drawing because of it:

| Code | Entity | What it says |
|---|---|---|
| `floor/unclaimed` | `floor`, the floor's id | Enclosed floor no room claims: its area, a point inside it, and the walls around it |
| `room/space-mismatch` | the room | The room's outline is not the space its walls enclose: how much of it lies on walls it does not list, on its own walls, outside the walls, across several spaces (naming dividing lines it leaves out), or in one space beside another room with nothing between them |
| `room/not-enclosed` | the room | None of the room's outline is floor its walls close off: they leave a gap |
| `floor/spaces-unknown` | `floor` | The spaces could not be worked out, and why (walls more than 10,000 km out or that thick) |

`floor` is a new kind of entity on an issue. The library also exports the layer itself:
`floorSpaces` and `planSpaces` give, per floor, the outline area, the wall area, the enclosed
floor, the room area, the unclaimed floor, every space with the rooms that cover it, the pieces
of unclaimed floor and the rooms that do not match.

ARE-4 reports. It measures no room differently, so no room's area changed.

## The library

**`polygon-clipping` 0.15.7, MIT** (Mike Fogel; forked from Alexander Milevski's `martinez`).
Its two dependencies are `splaytree` (MIT) and `robust-predicates` (Unlicense, public domain).
All three are named in `NOTICE`, and `npm run check:licenses` passes. It is pure JavaScript with
no browser, DOM or network use.

The candidates I looked at: `clipper2-js` and `clipper2-ts` are under the Boost Software Licence,
so they were out. `polyclip-ts` (MIT) is a port of the same algorithm that pulls in a big-number
library and runs slower. `martinez-polygon-clipping` (MIT) is the older code `polygon-clipping`
came from. The test referee imports nothing, so it stays independent of the choice.

A new test, `packages/floorplan/src/__tests__/purity.test.ts`, holds the whole package to the rule
in AGENTS.md. Every source file outside the tests may import only relative paths, `zod` and
`polygon-clipping`. No file may use a browser or network global (`window`, `document`, `fetch`,
`WebSocket` and the like), and the package may depend on nothing else.

## Results

**The villa (AR-15, lab O-6):** with the walk-in wardrobe left out, Grid reports
"Floor ground has 13.59 m² of enclosed floor that no room claims, around (9.00, 12.25),
between walls ext-n, corr-n, n8 and n10." With the wardrobe in, it reports nothing.

**The house (lab I-2):** with the utility room left out, the rooms total 86.15 m² instead of
91.69 m², and Grid reports 5.54 m² of unclaimed floor around (2.08, 9.12), between walls ext-w,
corr-w, bed1-n and util-n. The point lies inside the utility room's outline. With the room in,
it reports nothing. Both plans are now fixtures (`packages/floorplan/fixtures/villa.json` and
`three-bed-house.json`), copied from the lab with no lab paths. Their tests remove the room.

**The books balance.** Per floor, net room area + wall area + unclaimed floor equals the outline
area within 1e-6 m². The check runs on every floor of the scoreboard's 442 sound plans, the
rectangular control plans (595 floors, worst 5.7e-13 m²). It also runs on rectangles turned
seven ways at three thicknesses, on a 4 × 4 grid of rooms drawn whole and in pieces, and on the
villa, the house, the shared fixture and the Madrid and Berlin flats.

**The 200 lab rooms still measured wrong.** The brief counted 167 after ARE-1. The scoreboard,
which also reads the five plans ARE-2 made readable and stores the referee's figures to six
decimals, has 200. None stays silent:

| What Grid says now | Rooms |
|---|---:|
| `room/space-mismatch`, the room named | 174 |
| Listed with a reason below: one corner square off the referee (V-10) | 20 |
| Listed with a reason below: plans 10,000 km or more from the origin, which say so | 6 |

The 174 break down as: 83 cover walls they do not list (pods, columns, a chimney breast,
furniture, trees and posts drawn as walls); 67 cover such walls and run across into other
spaces (plots and gardens drawn round a house, rooms round a pod or a cupboard); 12 run across a
dividing line they leave out (`v-wall-4`, a table or stair drawn as lines); 4 also lie on their
own walls; and 8 lie beside another room in one space with nothing dividing it. Those 8 are a
basement aisle and two parking bays with no line between them (five copies, the aisle also
covering columns), a bedroom and bathroom on the floor whose stair was shifted (two copies), and
front and back gardens with no fence between them.

**False alarms: none found.** On the 16,263 lab rooms that agree with the referee, no room is
reported. The 2,300 generated plans and the 442 sound plans get no new line at all.

**Unclaimed floor in the lab plans:** 130 pieces in 79 plans: the villa and the house above,
courtyards and void galleries nobody drew as rooms, basement bays and ramps, a roof inside its
parapet, and floor left by rooms the drawing's checks refuse (where the refused room does not
list the walls around it; see below).

### Scoreboard

| Count | Before (after ARE-2) | After |
|---|---:|---:|
| Rooms measured wrong | 203 | 203 |
| Damage that passes in silence | 538 | 468 |
| Turns answered | 15 | 15 |
| Design mistakes named | 2 | 2 |
| Checks the plan can feed | 5 | 5 |
| Guard: rooms Grid does not measure | 712 | 712 |
| Guard: sound plans with a warning | 70 | 70 |

70 damaged plans that changed Grid's results in silence now get a line: 45 with one coordinate
scaled (a wall pulled off its corner), 20 with a room deleted (its floor is now unclaimed), and
5 with an id reference or a number changed. Another 48 that were caught vaguely now name the
damaged part. None moved the other way. `current.json` stores the new figures, and
`scoreboard/README.md` says why the count moved.

Most lab plans take a few milliseconds. The largest, a regular grid of 5,000 rooms, takes
about 2 s. My first version
cut every room against the whole floor and took 190 s on that plan, so the comparison is now
local: each room is cut only against the spaces and walls its box overlaps. A test guards a plan
of 900 rooms.

## Decisions made without you

- **Warnings, in `validatePlan`.** The new lines are problems in the drawing, not findings of a
  rule, so they come with the drawing's checks and show in `grid check` with no change to the
  CLI. They are warnings: a room that does not match its space is still drawn and measured.
- **A new entity kind, `floor`,** for floor no room claims: it belongs to no wall or room. The
  id is the floor's id.
- **Corners: as Grid draws them, with corners made good, and floor in a filled corner counts
  neither way.** The room outline fills the notch at a corner, except in V-10's case: a thick
  wall ends where a cross wall ends, and a thinner wall carries on. Until that corner is decided
  once, floor in a filled corner is neither unclaimed nor a mismatch. A room that takes the
  corner in counts it as its own, so the books still balance. This is why the 20 V-10 rooms get
  no line.
- **Tolerances.** 0.01 m², the scoreboard's own line, for every area reported. Walls are
  lengthened by 1 mm, so gaps under 1 mm are closed. Two rooms are only said to share a space
  when they still do with every wall widened by 3 mm. In the lab's site plan turned by 15°, a
  dividing line drawn on the face of the house sits a fraction of a millimetre off it, and that
  slit would otherwise join two gardens.
- **One fault, one line.** Floor that a refused room lists the walls of is not reported again as
  unclaimed. Either every wall the room lists is around the floor (a wall missing from the list),
  or the room lists every wall around it (out of order, or a wall too many). Without that, every
  `room/out-of-order` and `room/unclosed` test would have gained a second line. A forgotten room
  beside a refused one is still reported.
- **Overlapping rooms are left to ARE-5.** Two rooms that cover the same floor are not reported
  here, so `AR-4 a room listed twice is reported` stays an expected failure. Rooms side by side
  in one space, not overlapping, are reported, because their wall lists do not match the space.
- **When the library fails.** `polygon-clipping` cannot always close a ring when two edges almost
  coincide: 11 lab plans failed at first. Two things fixed every case. Each corner fill is built
  a nanometre inside the walls, so no corner of it sits on a strip's edge. And a failed join is
  tried again with every point rounded to 1 nm, 0.1 µm, 1 µm and 10 µm. An L turned in
  half-degree steps all the way round joins every time. If every try fails, the floor gets
  `floor/spaces-unknown`; that happens on none of the 3,421 lab and generated plans.
- **Far from the origin.** Spaces are worked out up to 10,000 km out, so surveyed coordinates in
  the millions of metres work. Beyond that, `floor/spaces-unknown` says so.
- **`validatePlan(plan, index, { spaces: false })`.** Joining the walls costs more than every
  other check together. Callers that only read `broken` now pass it: storey heights, the rules
  check, the IFC export and the scoreboard's area passes. `buildFloorPlan` and `buildScene` keep
  the full list, so every issue list in the library matches `validatePlan`'s. The scoreboard now
  takes about 25 s instead of 7, still well within CI.
- **Rounding in messages.** Areas in the new lines are rounded half up from twelve figures, so an
  area of exactly 13.585 m² reads 13.59 and not 13.58.

## Tests that changed

No expected figure changed.

- **Fixed and flipped:** `MS-2 a 1.5 m gap in a room outline is reported` (now
  `room/not-enclosed`) and `MS-17 a wall that cuts a room in two without being listed is
  reported` (now `room/space-mismatch`, naming the wall and the two spaces). They moved to a block
  named "lab failures fixed by ARE-4" in `geometry/__tests__/validation.test.ts`, with
  assertions on the code and the message instead of "some issue". `pinned-tests.md` lists them.
- **Tightened, still expected failures:** `MS-8 a door on a virtual wall is reported` and
  `VE-2 one partition typed 27 instead of 2.7 does not make a 27 m storey in silence`. Both
  passed by accident: the dividing line in MS-8 splits the room, and the partition in VE-2 stands
  in the room without being listed, and ARE-4 reports both. Each now asks for a line about its
  own subject (the door; the height). `pinned-tests.md` says so.
- **New:** `geometry/__tests__/spaces.test.ts` (22 tests), `src/__tests__/purity.test.ts`, and the
  sound-plan balance in `scoreboard/__tests__/scoreboard.test.ts`.

## One change for the CLI (not made here)

`grid check --floor <id>` keeps an issue when its entity is `plan` or when its id is on that
floor. A `floor` issue's id is the floor itself, which is in neither list, so with `--floor
ground` the unclaimed floor of every other floor still shows. In
`packages/cli/src/command/check.ts`, `checkPlan`, the filter needs one more case:

```ts
const issues = loaded.issues.filter((issue) =>
  issue.entity === 'plan' || (issue.entity === 'floor' ? issue.id === floor : (on.get(issue.id) ?? floor) === floor))
```

Without `--floor`, and in `--json`, the lines show correctly today:

```
Problems in the drawing (1):
  - worth a look, floor ground: Floor ground has 13.59 m² of enclosed floor that no room claims, around (9.00, 12.25), between walls ext-n, corr-n, n8 and n10. It is in no room's area. If it is a room, draw it as one.
```

## Checks

`npm run build`, `npm run typecheck`, `npm run lint`, `npm test` (6,642 tests),
`npm run check:licenses`, `npm run check:data` and `npm run scoreboard` pass.

## Still open

- **Overlapping rooms (ARE-5)** and a room inside a room (AR-3). The layer gives each space the
  rooms that cover it, which is what those checks need.
- **Corners (V-10).** 20 lab rooms are one corner square off the referee and get no line, because
  floor in a filled corner counts neither way until the corner is decided once for drawing, 3D
  and outlines.
- **The `--floor` filter** in the CLI, above.
- **Roofs and voids.** A roof inside its parapet and a void gallery are reported as unclaimed
  floor. That is true, but a plan has no way yet to say "this is a roof" or "this is a void".
  Outdoor space (lab R-8) and voids need a kind of space that is not a room.
- **The message for columns.** A room with columns standing in it is told that 1.29 m² lies on
  walls its list leaves out, and to check its wall list. A wall list cannot hold an island, so
  for columns the useful advice is that the area counts the columns. Worth its own wording once
  rooms can have holes.
- **The test referee still has no dividing lines.** `test-support/referee.ts` skips virtual walls,
  so the tests here that involve dividing lines are checked by hand, not by the referee.
- **A wall stub inside a room loses 1 mm.** Every wall is lengthened by 1 mm to close hairline
  gaps, so a free-standing wall end takes 1 mm × its thickness from the floor around it (0.0001 m²
  for a 0.1 m wall). That is below every tolerance, but it is there.

## Listed with a reason

**One corner square (V-10), 20 rooms.** Each is a room where a thick wall ends at a joint and a
thinner wall or dividing line carries on in a row. The referee fills the corner square there and
the room outline does not: 0.0225 m² with 0.3 m walls (the courtyard plans' south and north
wings, the U-house master bedroom split by a dividing line), 0.01 m² with 0.2 m and 0.1 m walls
(the co-living corridor, the hall of `X/haiku/brief-3/attempt-1`). ARE-4 measures the corner as
Grid draws it, counts it as the room's, and reports nothing (see "Decisions").

**Far from the origin, 6 rooms.** `k-far-1e7` (two copies, two rooms each) lies 10,000 km out and
`far-away--whole-plan-moved-to-1e-8-m` 100,000 km out. Their rooms are off the referee because
Grid's own arithmetic loses precision that far out. Both plans already get `plan/far-from-origin`.
Each now also gets `floor/spaces-unknown`, which says the spaces were not worked out there.

## The 200 rooms

Plan names are where each plan sat in the lab, as stored in `scoreboard/data/lab-plans.ndjson.gz`.
"Grid" is Grid's area for the room, "Referee" the referee's figure, and the last column what
Grid now says, quoted from the message.

| Plan | Room | Grid m² | Referee m² | What Grid says now |
|---|---|---:|---:|---|
| `A/scenarios/probes/villa-wrong-wall.json` | master | 55.59 | 34.14 | `room/space-mismatch`: 0.72 m² of it lies on wall n5, which its wall list leaves out; it covers parts of 2 enclosed spaces (34.14 and 20.74 m²) |
| `AU1/scenarios/AR-15/d5-block-with-basement.json` | B1: B1-aisle | 119.34 | 146.85 | `room/space-mismatch`: 1.31 m² of it lies on walls B1-core-n, B1-col-1, B1-col-2, B1-col-3, B1-col-4, B1-col-5 and 2 more, which its wall list leaves out; it lies in one enclosed space with rooms B1-bay-13 and B1-bay-14, and no wall or dividing line divides that space between them |
| `AU1/scenarios/AR-15/d5-block-with-basement.json` | B1: B1-bay-10 | 12.50 | 12.46 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-5, which its wall list leaves out |
| `AU1/scenarios/AR-15/d5-block-with-basement.json` | B1: B1-bay-11 | 12.50 | 12.46 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-6, which its wall list leaves out |
| `AU1/scenarios/AR-15/d5-block-with-basement.json` | B1: B1-bay-12 | 12.50 | 11.46 | `room/space-mismatch`: 1.04 m² of it lies on walls B1-ext-e and B1-col-6, which its wall list leaves out |
| `AU1/scenarios/AR-15/d5-block-with-basement.json` | B1: B1-bay-15 | 12.50 | 12.46 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-7, which its wall list leaves out |
| `AU1/scenarios/AR-15/d5-block-with-basement.json` | B1: B1-bay-2 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-1, which its wall list leaves out |
| `AU1/scenarios/AR-15/d5-block-with-basement.json` | B1: B1-bay-3 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-1, which its wall list leaves out |
| `AU1/scenarios/AR-15/d5-block-with-basement.json` | B1: B1-bay-4 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-2, which its wall list leaves out |
| `AU1/scenarios/AR-15/d5-block-with-basement.json` | B1: B1-bay-5 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-2, which its wall list leaves out |
| `AU1/scenarios/AR-15/d5-block-with-basement.json` | B1: B1-bay-6 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-3, which its wall list leaves out |
| `AU1/scenarios/AR-15/d5-block-with-basement.json` | B1: B1-bay-7 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-3, which its wall list leaves out |
| `AU1/scenarios/AR-15/d5-block-with-basement.json` | B1: B1-bay-8 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-4, which its wall list leaves out |
| `AU1/scenarios/AR-15/d5-block-with-basement.json` | B1: B1-bay-9 | 11.75 | 11.71 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-5, which its wall list leaves out |
| `AU1/scenarios/AR-2/d4-coliving.json` | corridor | 60.55 | 60.54 | nothing new: 0.0100 m², one corner square (V-10, see "Listed with a reason") |
| `AU1/scenarios/AR-2/v-wall-4-virtual-zero-thickness.json` | bed | 9.00 | 4.50 | `room/space-mismatch`: it covers parts of 2 enclosed spaces (4.50 and 4.50 m²), split by dividing line line, which its wall list leaves out |
| `AU1/scenarios/AR-3/d3-student-inside.json` | r01-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r01-pod-s and r01-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `AU1/scenarios/AR-3/d3-student-inside.json` | r02-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r02-pod-s and r02-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `AU1/scenarios/AR-3/d3-student-inside.json` | r03-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r03-pod-s and r03-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `AU1/scenarios/AR-3/d3-student-inside.json` | r04-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r04-pod-s and r04-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `AU1/scenarios/AR-3/d3-student-inside.json` | r05-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r05-pod-s and r05-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `AU1/scenarios/AR-3/d3-student-inside.json` | r06-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r06-pod-s and r06-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `AU1/scenarios/AR-3/d3-student-inside.json` | r07-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r07-pod-s and r07-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `AU1/scenarios/AR-3/d3-student-inside.json` | r08-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r08-pod-s and r08-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `AU1/scenarios/AR-3/d3-student-inside.json` | r09-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r09-pod-s and r09-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `AU1/scenarios/AR-3/d3-student-inside.json` | r10-bed | 15.53 | 12.28 | `room/space-mismatch`: 0.29 m² of it lies on walls r10-pod-s and r10-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.28 and 2.97 m²) |
| `AU1/scenarios/AR-3/d3-student-inside.json` | r11-bed | 15.53 | 12.43 | `room/space-mismatch`: 0.28 m² of it lies on walls r11-pod-s and r11-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.43 and 2.82 m²) |
| `AU1/scenarios/AR-3/d3-student-inside.json` | r12-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r12-pod-s and r12-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `AU1/scenarios/AR-3/d3-student-inside.json` | r13-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r13-pod-s and r13-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `AU1/scenarios/AR-3/d3-student-inside.json` | r14-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r14-pod-s and r14-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `AU1/scenarios/AR-3/d3-student-inside.json` | r15-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r15-pod-s and r15-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `AU1/scenarios/AR-3/d3-student-inside.json` | r16-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r16-pod-s and r16-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `AU1/scenarios/AR-3/d3-student-inside.json` | r17-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r17-pod-s and r17-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `AU1/scenarios/AR-3/d3-student-inside.json` | r18-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r18-pod-s and r18-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `AU1/scenarios/AR-3/d3-student-inside.json` | r19-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r19-pod-s and r19-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `AU1/scenarios/AR-3/d3-student-inside.json` | r20-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r20-pod-s and r20-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `AU1/scenarios/AR-3/h04-stair-spiral.json` | first: f-main | 43.89 | 41.60 | `room/space-mismatch`: it covers parts of 2 enclosed spaces (41.60 and 2.29 m²), split by dividing lines f-sp0, f-sp1, f-sp2, f-sp3, f-sp4, f-sp5 and 2 more, which its wall list leaves out |
| `AU1/scenarios/AR-3/h04-stair-spiral.json` | g-main | 43.89 | 41.60 | `room/space-mismatch`: it covers parts of 2 enclosed spaces (41.60 and 2.29 m²), split by dividing lines g-sp0, g-sp1, g-sp2, g-sp3, g-sp4, g-sp5 and 2 more, which its wall list leaves out |
| `AU1/scenarios/AR-3/h05-stair-cupboard.json` | g-stair | 3.23 | 1.61 | `room/space-mismatch`: 0.10 m² of it lies on wall g-cup-s, which its wall list leaves out; it covers parts of 2 enclosed spaces (1.61 and 1.52 m²) |
| `AU1/scenarios/AR-3/s09-room-in-room.json` | bed | 26.79 | 22.38 | `room/space-mismatch`: 0.80 m² of it lies on walls pod0, pod1, pod2 and pod3, which its wall list leaves out; it covers parts of 2 enclosed spaces (22.38 and 3.61 m²) |
| `AU1/scenarios/AR-3/s09-room-in-room.json` | hall | 21.09 | 17.85 | `room/space-mismatch`: 1.28 m² of it lies on walls lift0, lift1, lift2 and lift3, which its wall list leaves out; it covers parts of 2 enclosed spaces (17.85 and 1.96 m²) |
| `AU1/scenarios/AR-3/t2b-table-as-a-room.json` | kitchen | 36.48 | 34.86 | `room/space-mismatch`: it covers parts of 2 enclosed spaces (34.86 and 1.62 m²), split by dividing lines tv-s, tv-e, tv-n and tv-w, which its wall list leaves out |
| `AU1/scenarios/AR-4/hotel-mistakes.json` | l3: room-309 | 28.67 | 20.37 | `room/space-mismatch`: 0.23 m² of it lies on wall bx-309, which its wall list leaves out; 0.53 m² lies on its own walls party-n2 and by-309; it covers parts of 3 enclosed spaces (20.37, 4.22 and 3.32 m²) |
| `AU1/scenarios/AR-4/villa-wrong-wall.json` | master | 55.59 | 34.14 | `room/space-mismatch`: 0.72 m² of it lies on wall n5, which its wall list leaves out; it covers parts of 2 enclosed spaces (34.14 and 20.74 m²) |
| `AU1/scenarios/MS-17/nodoor-3-silent-stray-wall.json` | bed | 9.00 | 4.35 | `room/space-mismatch`: 0.30 m² of it lies on wall stray, which its wall list leaves out; it covers parts of 2 enclosed spaces (4.35 and 4.35 m²) |
| `AU1/scenarios/MS-4/d4-coliving-first-try.json` | corridor | 60.55 | 60.54 | nothing new: 0.0100 m², one corner square (V-10, see "Listed with a reason") |
| `AU1/scenarios/MS-4/s03-courtyard.json` | north | 65.12 | 65.09 | nothing new: 0.0225 m², one corner square (V-10, see "Listed with a reason") |
| `AU1/scenarios/MS-4/s03-courtyard.json` | south | 65.12 | 65.09 | nothing new: 0.0225 m², one corner square (V-10, see "Listed with a reason") |
| `AU1/scenarios/MS-8/v-open-2-silent-door-on-virtual.json` | bed | 9.00 | 4.50 | `room/space-mismatch`: it covers parts of 2 enclosed spaces (4.50 and 4.50 m²), split by dividing line line, which its wall list leaves out |
| `AU2/scenarios/B-s03-courtyard/plan.json` | north | 65.12 | 65.09 | nothing new: 0.0225 m², one corner square (V-10, see "Listed with a reason") |
| `AU2/scenarios/B-s03-courtyard/plan.json` | south | 65.12 | 65.09 | nothing new: 0.0225 m², one corner square (V-10, see "Listed with a reason") |
| `AU2/scenarios/B-s09-room-in-room/plan.json` | bed | 26.79 | 22.38 | `room/space-mismatch`: 0.80 m² of it lies on walls pod0, pod1, pod2 and pod3, which its wall list leaves out; it covers parts of 2 enclosed spaces (22.38 and 3.61 m²) |
| `AU2/scenarios/B-s09-room-in-room/plan.json` | hall | 21.09 | 17.85 | `room/space-mismatch`: 1.28 m² of it lies on walls lift0, lift1, lift2 and lift3, which its wall list leaves out; it covers parts of 2 enclosed spaces (17.85 and 1.96 m²) |
| `AU2/scenarios/D-d2-stair-shifted-floor3/plan.json` | L3: L3-A-bed1 | 23.96 | 33.91 | `room/space-mismatch`: it lies in one enclosed space with room L3-A-bath, and no wall or dividing line divides that space between them |
| `AU2/scenarios/D-d2-stair-shifted-floor3/plan.json` | L3: L3-riser | 12.99 | 12.87 | `room/space-mismatch`: 0.13 m² of it lies on wall L3-B-mid, which its wall list leaves out |
| `AU2/scenarios/G-s02a-terrace-porch/plan.json` | porch | 3.60 | 3.56 | `room/space-mismatch`: 0.05 m² of it lies on walls post-1 and post-2, which its wall list leaves out |
| `AU2/scenarios/G-s04a-garage-carport/plan.json` | carport | 18.36 | 18.33 | `room/space-mismatch`: 0.03 m² of it lies on walls cp-1, cp-2, cp-3 and cp-4, which its wall list leaves out |
| `AU2/scenarios/H-h03-stair-U/plan.json` | first: f-stair | 8.60 | 8.41 | `room/space-mismatch`: 0.19 m² of it lies on wall f-newel, which its wall list leaves out |
| `AU2/scenarios/H-h03-stair-U/plan.json` | g-stair | 8.60 | 8.41 | `room/space-mismatch`: 0.19 m² of it lies on wall g-newel, which its wall list leaves out |
| `AU2/scenarios/X-haiku-brief-3-attempt-1/plan.json` | hall | 8.74 | 8.73 | nothing new: 0.0100 m², one corner square (V-10, see "Listed with a reason") |
| `AU4/scenarios/K/scenarios/b-columns.json` | open | 90.09 | 89.68 | `room/space-mismatch`: 0.41 m² of it lies on walls col1, col2 and col3, which its wall list leaves out |
| `AU4/scenarios/K/scenarios/b-courtyard.json` | north | 65.12 | 65.09 | nothing new: 0.0225 m², one corner square (V-10, see "Listed with a reason") |
| `AU4/scenarios/K/scenarios/b-courtyard.json` | south | 65.12 | 65.09 | nothing new: 0.0225 m², one corner square (V-10, see "Listed with a reason") |
| `AU4/scenarios/K/scenarios/b-room-in-room.json` | bed | 26.79 | 22.38 | `room/space-mismatch`: 0.80 m² of it lies on walls pod0, pod1, pod2 and pod3, which its wall list leaves out; it covers parts of 2 enclosed spaces (22.38 and 3.61 m²) |
| `AU4/scenarios/K/scenarios/b-room-in-room.json` | hall | 21.09 | 17.85 | `room/space-mismatch`: 1.28 m² of it lies on walls lift0, lift1, lift2 and lift3, which its wall list leaves out; it covers parts of 2 enclosed spaces (17.85 and 1.96 m²) |
| `AU4/scenarios/K/scenarios/c-hotel-mistakes.json` | l3: room-309 | 28.67 | 20.37 | `room/space-mismatch`: 0.23 m² of it lies on wall bx-309, which its wall list leaves out; 0.53 m² lies on its own walls party-n2 and by-309; it covers parts of 3 enclosed spaces (20.37, 4.22 and 3.32 m²) |
| `AU4/scenarios/K/scenarios/c-warehouse-columns.json` | warehouse | 1396.99 | 1395.71 | `room/space-mismatch`: 1.29 m² of it lies on walls col-10-10, col-10-20, col-10-30, col-10-40, col-20-10, col-20-20 and 2 more, which its wall list leaves out |
| `AU4/scenarios/K/scenarios/d-block-basement.json` | B1: B1-aisle | 119.34 | 146.85 | `room/space-mismatch`: 1.31 m² of it lies on walls B1-core-n, B1-col-1, B1-col-2, B1-col-3, B1-col-4, B1-col-5 and 2 more, which its wall list leaves out; it lies in one enclosed space with rooms B1-bay-13 and B1-bay-14, and no wall or dividing line divides that space between them |
| `AU4/scenarios/K/scenarios/d-block-basement.json` | B1: B1-bay-10 | 12.50 | 12.46 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-5, which its wall list leaves out |
| `AU4/scenarios/K/scenarios/d-block-basement.json` | B1: B1-bay-11 | 12.50 | 12.46 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-6, which its wall list leaves out |
| `AU4/scenarios/K/scenarios/d-block-basement.json` | B1: B1-bay-12 | 12.50 | 11.46 | `room/space-mismatch`: 1.04 m² of it lies on walls B1-ext-e and B1-col-6, which its wall list leaves out |
| `AU4/scenarios/K/scenarios/d-block-basement.json` | B1: B1-bay-15 | 12.50 | 12.46 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-7, which its wall list leaves out |
| `AU4/scenarios/K/scenarios/d-block-basement.json` | B1: B1-bay-2 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-1, which its wall list leaves out |
| `AU4/scenarios/K/scenarios/d-block-basement.json` | B1: B1-bay-3 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-1, which its wall list leaves out |
| `AU4/scenarios/K/scenarios/d-block-basement.json` | B1: B1-bay-4 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-2, which its wall list leaves out |
| `AU4/scenarios/K/scenarios/d-block-basement.json` | B1: B1-bay-5 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-2, which its wall list leaves out |
| `AU4/scenarios/K/scenarios/d-block-basement.json` | B1: B1-bay-6 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-3, which its wall list leaves out |
| `AU4/scenarios/K/scenarios/d-block-basement.json` | B1: B1-bay-7 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-3, which its wall list leaves out |
| `AU4/scenarios/K/scenarios/d-block-basement.json` | B1: B1-bay-8 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-4, which its wall list leaves out |
| `AU4/scenarios/K/scenarios/d-block-basement.json` | B1: B1-bay-9 | 11.75 | 11.71 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-5, which its wall list leaves out |
| `AU4/scenarios/K/scenarios/d-coliving.json` | corridor | 60.55 | 60.54 | nothing new: 0.0100 m², one corner square (V-10, see "Listed with a reason") |
| `AU4/scenarios/K/scenarios/k-far-1e7.json` | a | 17.84 | 17.86 | `floor/spaces-unknown` and `plan/far-from-origin` (see "Listed with a reason") |
| `AU4/scenarios/K/scenarios/k-far-1e7.json` | b | 17.88 | 17.86 | `floor/spaces-unknown` and `plan/far-from-origin` (see "Listed with a reason") |
| `AU4/scenarios/M/nodoor-3-silent-stray-wall.json` | bed | 9.00 | 4.35 | `room/space-mismatch`: 0.30 m² of it lies on wall stray, which its wall list leaves out; it covers parts of 2 enclosed spaces (4.35 and 4.35 m²) |
| `AU4/scenarios/M/v-open-2-silent-door-on-virtual.json` | bed | 9.00 | 4.50 | `room/space-mismatch`: it covers parts of 2 enclosed spaces (4.50 and 4.50 m²), split by dividing line line, which its wall list leaves out |
| `AU4/scenarios/M/v-wall-4-virtual-zero-thickness.json` | bed | 9.00 | 4.50 | `room/space-mismatch`: it covers parts of 2 enclosed spaces (4.50 and 4.50 m²), split by dividing line line, which its wall list leaves out |
| `AU4/scenarios/M/worst-1-sleeping-floor-level4.json` | corr | 6.36 | 1.53 | `room/space-mismatch`: 0.18 m² of it lies on walls x1, x2 and x3, which its wall list leaves out; it covers parts of 4 enclosed spaces (1.56, 1.56, 1.53 and 1.53 m²) |
| `AU4/scenarios/M/worst-3-uses-other.json` | corr | 6.36 | 1.53 | `room/space-mismatch`: 0.18 m² of it lies on walls x1, x2 and x3, which its wall list leaves out; it covers parts of 4 enclosed spaces (1.56, 1.56, 1.53 and 1.53 m²) |
| `B/scenarios/s02b-u-house-master-split.json` | m-bed | 46.17 | 46.15 | nothing new: 0.0225 m², one corner square (V-10, see "Listed with a reason") |
| `B/scenarios/s02c-u-house-master-split-thick-virtual.json` | m-bed | 46.17 | 46.15 | nothing new: 0.0225 m², one corner square (V-10, see "Listed with a reason") |
| `B/scenarios/s03-courtyard.json` | north | 65.12 | 65.09 | nothing new: 0.0225 m², one corner square (V-10, see "Listed with a reason") |
| `B/scenarios/s03-courtyard.json` | south | 65.12 | 65.09 | nothing new: 0.0225 m², one corner square (V-10, see "Listed with a reason") |
| `B/scenarios/s07-columns.json` | open | 90.09 | 89.68 | `room/space-mismatch`: 0.41 m² of it lies on walls col1, col2 and col3, which its wall list leaves out |
| `B/scenarios/s09-room-in-room.json` | bed | 26.79 | 22.38 | `room/space-mismatch`: 0.80 m² of it lies on walls pod0, pod1, pod2 and pod3, which its wall list leaves out; it covers parts of 2 enclosed spaces (22.38 and 3.61 m²) |
| `B/scenarios/s09-room-in-room.json` | hall | 21.09 | 17.85 | `room/space-mismatch`: 1.28 m² of it lies on walls lift0, lift1, lift2 and lift3, which its wall list leaves out; it covers parts of 2 enclosed spaces (17.85 and 1.96 m²) |
| `C/scenarios/hotel-mistakes.json` | l3: room-309 | 28.67 | 20.37 | `room/space-mismatch`: 0.23 m² of it lies on wall bx-309, which its wall list leaves out; 0.53 m² lies on its own walls party-n2 and by-309; it covers parts of 3 enclosed spaces (20.37, 4.22 and 3.32 m²) |
| `C/scenarios/warehouse-columns.json` | warehouse | 1396.99 | 1395.71 | `room/space-mismatch`: 1.29 m² of it lies on walls col-10-10, col-10-20, col-10-30, col-10-40, col-20-10, col-20-20 and 2 more, which its wall list leaves out |
| `D/scenarios/d2-stair-shifted-floor3.json` | L3: L3-A-bed1 | 23.96 | 33.91 | `room/space-mismatch`: it lies in one enclosed space with room L3-A-bath, and no wall or dividing line divides that space between them |
| `D/scenarios/d2-stair-shifted-floor3.json` | L3: L3-riser | 12.99 | 12.87 | `room/space-mismatch`: 0.13 m² of it lies on wall L3-B-mid, which its wall list leaves out |
| `D/scenarios/d3-student-inside.json` | r01-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r01-pod-s and r01-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `D/scenarios/d3-student-inside.json` | r02-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r02-pod-s and r02-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `D/scenarios/d3-student-inside.json` | r03-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r03-pod-s and r03-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `D/scenarios/d3-student-inside.json` | r04-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r04-pod-s and r04-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `D/scenarios/d3-student-inside.json` | r05-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r05-pod-s and r05-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `D/scenarios/d3-student-inside.json` | r06-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r06-pod-s and r06-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `D/scenarios/d3-student-inside.json` | r07-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r07-pod-s and r07-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `D/scenarios/d3-student-inside.json` | r08-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r08-pod-s and r08-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `D/scenarios/d3-student-inside.json` | r09-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r09-pod-s and r09-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `D/scenarios/d3-student-inside.json` | r10-bed | 15.53 | 12.28 | `room/space-mismatch`: 0.29 m² of it lies on walls r10-pod-s and r10-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.28 and 2.97 m²) |
| `D/scenarios/d3-student-inside.json` | r11-bed | 15.53 | 12.43 | `room/space-mismatch`: 0.28 m² of it lies on walls r11-pod-s and r11-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.43 and 2.82 m²) |
| `D/scenarios/d3-student-inside.json` | r12-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r12-pod-s and r12-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `D/scenarios/d3-student-inside.json` | r13-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r13-pod-s and r13-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `D/scenarios/d3-student-inside.json` | r14-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r14-pod-s and r14-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `D/scenarios/d3-student-inside.json` | r15-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r15-pod-s and r15-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `D/scenarios/d3-student-inside.json` | r16-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r16-pod-s and r16-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `D/scenarios/d3-student-inside.json` | r17-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r17-pod-s and r17-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `D/scenarios/d3-student-inside.json` | r18-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r18-pod-s and r18-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `D/scenarios/d3-student-inside.json` | r19-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r19-pod-s and r19-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `D/scenarios/d3-student-inside.json` | r20-bed | 15.96 | 12.70 | `room/space-mismatch`: 0.29 m² of it lies on walls r20-pod-s and r20-pod-e, which its wall list leaves out; it covers parts of 2 enclosed spaces (12.70 and 2.97 m²) |
| `D/scenarios/d4-coliving-first-try.json` | corridor | 60.55 | 60.54 | nothing new: 0.0100 m², one corner square (V-10, see "Listed with a reason") |
| `D/scenarios/d4-coliving.json` | corridor | 60.55 | 60.54 | nothing new: 0.0100 m², one corner square (V-10, see "Listed with a reason") |
| `D/scenarios/d5-block-with-basement.json` | B1: B1-aisle | 119.34 | 146.85 | `room/space-mismatch`: 1.31 m² of it lies on walls B1-core-n, B1-col-1, B1-col-2, B1-col-3, B1-col-4, B1-col-5 and 2 more, which its wall list leaves out; it lies in one enclosed space with rooms B1-bay-13 and B1-bay-14, and no wall or dividing line divides that space between them |
| `D/scenarios/d5-block-with-basement.json` | B1: B1-bay-10 | 12.50 | 12.46 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-5, which its wall list leaves out |
| `D/scenarios/d5-block-with-basement.json` | B1: B1-bay-11 | 12.50 | 12.46 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-6, which its wall list leaves out |
| `D/scenarios/d5-block-with-basement.json` | B1: B1-bay-12 | 12.50 | 11.46 | `room/space-mismatch`: 1.04 m² of it lies on walls B1-ext-e and B1-col-6, which its wall list leaves out |
| `D/scenarios/d5-block-with-basement.json` | B1: B1-bay-15 | 12.50 | 12.46 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-7, which its wall list leaves out |
| `D/scenarios/d5-block-with-basement.json` | B1: B1-bay-2 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-1, which its wall list leaves out |
| `D/scenarios/d5-block-with-basement.json` | B1: B1-bay-3 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-1, which its wall list leaves out |
| `D/scenarios/d5-block-with-basement.json` | B1: B1-bay-4 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-2, which its wall list leaves out |
| `D/scenarios/d5-block-with-basement.json` | B1: B1-bay-5 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-2, which its wall list leaves out |
| `D/scenarios/d5-block-with-basement.json` | B1: B1-bay-6 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-3, which its wall list leaves out |
| `D/scenarios/d5-block-with-basement.json` | B1: B1-bay-7 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-3, which its wall list leaves out |
| `D/scenarios/d5-block-with-basement.json` | B1: B1-bay-8 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-4, which its wall list leaves out |
| `D/scenarios/d5-block-with-basement.json` | B1: B1-bay-9 | 11.75 | 11.71 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-5, which its wall list leaves out |
| `G/scenarios/s01e-plot-one-room.json` | plot | 450.00 | 360.00 | `room/space-mismatch`: 13.77 m² of it lies on walls ext-s, ext-e, ext-n, ext-w, spine, liv-n and 3 more, which its wall list leaves out; it covers parts of 7 enclosed spaces (360.00, 21.50, 18.49, 13.20 and 3 more m²) |
| `G/scenarios/s01g-fence-gate-path-trees.json` | back-garden | 148.25 | 147.65 | `room/space-mismatch`: 0.19 m² of it lies on walls tree2-0, tree2-1, tree2-2, tree2-3, tree2-4, tree2-5 and 10 more, which its wall list leaves out; it covers parts of 3 enclosed spaces (147.65, 0.21 and 0.21 m²) |
| `G/scenarios/s01g-fence-gate-path-trees.json` | front-garden | 77.11 | 76.81 | `room/space-mismatch`: 0.09 m² of it lies on walls tree1-0, tree1-1, tree1-2, tree1-3, tree1-4, tree1-5 and 2 more, which its wall list leaves out; it covers parts of 2 enclosed spaces (76.81 and 0.21 m²) |
| `G/scenarios/s01i-gardens-on-house-walls.json` | back-garden | 150.00 | 360.00 | `room/space-mismatch`: it lies in one enclosed space with room front-garden, and no wall or dividing line divides that space between them |
| `G/scenarios/s02a-terrace-porch.json` | porch | 3.60 | 3.56 | `room/space-mismatch`: 0.05 m² of it lies on walls post-1 and post-2, which its wall list leaves out |
| `G/scenarios/s02b-terrace-porch-words.json` | porch | 3.60 | 3.56 | `room/space-mismatch`: 0.05 m² of it lies on walls post-1 and post-2, which its wall list leaves out |
| `G/scenarios/s04a-garage-carport.json` | carport | 18.36 | 18.33 | `room/space-mismatch`: 0.03 m² of it lies on walls cp-1, cp-2, cp-3 and cp-4, which its wall list leaves out |
| `H/scenarios/h03-stair-U.json` | first: f-stair | 8.60 | 8.41 | `room/space-mismatch`: 0.19 m² of it lies on wall f-newel, which its wall list leaves out |
| `H/scenarios/h03-stair-U.json` | g-stair | 8.60 | 8.41 | `room/space-mismatch`: 0.19 m² of it lies on wall g-newel, which its wall list leaves out |
| `H/scenarios/h04-stair-spiral.json` | first: f-main | 43.89 | 41.60 | `room/space-mismatch`: it covers parts of 2 enclosed spaces (41.60 and 2.29 m²), split by dividing lines f-sp0, f-sp1, f-sp2, f-sp3, f-sp4, f-sp5 and 2 more, which its wall list leaves out |
| `H/scenarios/h04-stair-spiral.json` | g-main | 43.89 | 41.60 | `room/space-mismatch`: it covers parts of 2 enclosed spaces (41.60 and 2.29 m²), split by dividing lines g-sp0, g-sp1, g-sp2, g-sp3, g-sp4, g-sp5 and 2 more, which its wall list leaves out |
| `H/scenarios/h05-stair-cupboard.json` | g-stair | 3.23 | 1.61 | `room/space-mismatch`: 0.10 m² of it lies on wall g-cup-s, which its wall list leaves out; it covers parts of 2 enclosed spaces (1.61 and 1.52 m²) |
| `I/scenarios/s5-plot/attempt-1-with-plot.json` | plot | 500.00 | 259.93 | `room/space-mismatch`: 25.74 m² of it lies on walls ext-s, ext-e, ext-n, ext-w, a-n, b-n and 7 more, which its wall list leaves out; it covers parts of 11 enclosed spaces (259.93, 37.57, 33.38, 28.22 and 7 more m²) |
| `I/scenarios/s6-drawing-file/house-with-plot-from-dxf.json` | room-11 | 500.00 | 259.93 | `room/space-mismatch`: 25.74 m² of it lies on walls wall-1, wall-2, wall-3, wall-4, wall-5, wall-6 and 7 more, which its wall list leaves out; it covers parts of 11 enclosed spaces (259.93, 37.57, 33.38, 28.22 and 7 more m²) |
| `J/scenarios/1-homeowner/t2a-table-as-low-walls.json` | kitchen | 36.48 | 34.81 | `room/space-mismatch`: 0.11 m² of it lies on walls table-s, table-e, table-n and table-w, which its wall list leaves out; it covers parts of 2 enclosed spaces (34.81 and 1.57 m²) |
| `J/scenarios/1-homeowner/t2b-table-as-a-room.json` | kitchen | 36.48 | 34.86 | `room/space-mismatch`: it covers parts of 2 enclosed spaces (34.86 and 1.62 m²), split by dividing lines tv-s, tv-e, tv-n and tv-w, which its wall list leaves out |
| `J/scenarios/5-interior-designer/t1-empty-room.json` | living | 20.80 | 20.31 | `room/space-mismatch`: 0.49 m² of it lies on wall chimney-breast, which its wall list leaves out |
| `J/scenarios/5-interior-designer/t2-layout-a-furniture-as-walls.json` | living | 20.80 | 15.34 | `room/space-mismatch`: 5.47 m² of it lies on walls chimney-breast, sofa, coffee-table, armchair-1, armchair-2 and tv-unit, which its wall list leaves out |
| `J/scenarios/5-interior-designer/t2x-furniture-made-up-field.json` | living | 20.80 | 20.31 | `room/space-mismatch`: 0.49 m² of it lies on wall chimney-breast, which its wall list leaves out |
| `J/scenarios/5-interior-designer/t4-layout-a-chair-moved.json` | living | 20.80 | 15.34 | `room/space-mismatch`: 5.47 m² of it lies on walls chimney-breast, sofa, coffee-table, armchair-1, tv-unit and armchair-2, which its wall list leaves out |
| `J/scenarios/5-interior-designer/t7-layout-b-sofa-under-window.json` | living | 20.80 | 15.16 | `room/space-mismatch`: 5.65 m² of it lies on walls chimney-breast, sofa, coffee-table, armchair-1, armchair-2 and tv-unit, which its wall list leaves out |
| `K/scenarios/b-columns.json` | open | 90.09 | 89.68 | `room/space-mismatch`: 0.41 m² of it lies on walls col1, col2 and col3, which its wall list leaves out |
| `K/scenarios/b-courtyard.json` | north | 65.12 | 65.09 | nothing new: 0.0225 m², one corner square (V-10, see "Listed with a reason") |
| `K/scenarios/b-courtyard.json` | south | 65.12 | 65.09 | nothing new: 0.0225 m², one corner square (V-10, see "Listed with a reason") |
| `K/scenarios/b-room-in-room.json` | bed | 26.79 | 22.38 | `room/space-mismatch`: 0.80 m² of it lies on walls pod0, pod1, pod2 and pod3, which its wall list leaves out; it covers parts of 2 enclosed spaces (22.38 and 3.61 m²) |
| `K/scenarios/b-room-in-room.json` | hall | 21.09 | 17.85 | `room/space-mismatch`: 1.28 m² of it lies on walls lift0, lift1, lift2 and lift3, which its wall list leaves out; it covers parts of 2 enclosed spaces (17.85 and 1.96 m²) |
| `K/scenarios/c-hotel-mistakes.json` | l3: room-309 | 28.67 | 20.37 | `room/space-mismatch`: 0.23 m² of it lies on wall bx-309, which its wall list leaves out; 0.53 m² lies on its own walls party-n2 and by-309; it covers parts of 3 enclosed spaces (20.37, 4.22 and 3.32 m²) |
| `K/scenarios/c-warehouse-columns.json` | warehouse | 1396.99 | 1395.71 | `room/space-mismatch`: 1.29 m² of it lies on walls col-10-10, col-10-20, col-10-30, col-10-40, col-20-10, col-20-20 and 2 more, which its wall list leaves out |
| `K/scenarios/d-block-basement.json` | B1: B1-aisle | 119.34 | 146.85 | `room/space-mismatch`: 1.31 m² of it lies on walls B1-core-n, B1-col-1, B1-col-2, B1-col-3, B1-col-4, B1-col-5 and 2 more, which its wall list leaves out; it lies in one enclosed space with rooms B1-bay-13 and B1-bay-14, and no wall or dividing line divides that space between them |
| `K/scenarios/d-block-basement.json` | B1: B1-bay-10 | 12.50 | 12.46 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-5, which its wall list leaves out |
| `K/scenarios/d-block-basement.json` | B1: B1-bay-11 | 12.50 | 12.46 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-6, which its wall list leaves out |
| `K/scenarios/d-block-basement.json` | B1: B1-bay-12 | 12.50 | 11.46 | `room/space-mismatch`: 1.04 m² of it lies on walls B1-ext-e and B1-col-6, which its wall list leaves out |
| `K/scenarios/d-block-basement.json` | B1: B1-bay-15 | 12.50 | 12.46 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-7, which its wall list leaves out |
| `K/scenarios/d-block-basement.json` | B1: B1-bay-2 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-1, which its wall list leaves out |
| `K/scenarios/d-block-basement.json` | B1: B1-bay-3 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-1, which its wall list leaves out |
| `K/scenarios/d-block-basement.json` | B1: B1-bay-4 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-2, which its wall list leaves out |
| `K/scenarios/d-block-basement.json` | B1: B1-bay-5 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-2, which its wall list leaves out |
| `K/scenarios/d-block-basement.json` | B1: B1-bay-6 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-3, which its wall list leaves out |
| `K/scenarios/d-block-basement.json` | B1: B1-bay-7 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-3, which its wall list leaves out |
| `K/scenarios/d-block-basement.json` | B1: B1-bay-8 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-4, which its wall list leaves out |
| `K/scenarios/d-block-basement.json` | B1: B1-bay-9 | 11.75 | 11.71 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-5, which its wall list leaves out |
| `K/scenarios/d-coliving.json` | corridor | 60.55 | 60.54 | nothing new: 0.0100 m², one corner square (V-10, see "Listed with a reason") |
| `K/scenarios/k-far-1e7.json` | a | 17.84 | 17.86 | `floor/spaces-unknown` and `plan/far-from-origin` (see "Listed with a reason") |
| `K/scenarios/k-far-1e7.json` | b | 17.88 | 17.86 | `floor/spaces-unknown` and `plan/far-from-origin` (see "Listed with a reason") |
| `L/scenarios/odd/far-away--whole-plan-moved-to-1e-8-m.json` | a | 12.00 | 10.36 | `floor/spaces-unknown` and `plan/far-from-origin` (see "Listed with a reason") |
| `L/scenarios/odd/far-away--whole-plan-moved-to-1e-8-m.json` | b | 12.00 | 10.36 | `floor/spaces-unknown` and `plan/far-from-origin` (see "Listed with a reason") |
| `M/scenarios/nodoor-3-silent-stray-wall.json` | bed | 9.00 | 4.35 | `room/space-mismatch`: 0.30 m² of it lies on wall stray, which its wall list leaves out; it covers parts of 2 enclosed spaces (4.35 and 4.35 m²) |
| `M/scenarios/v-open-2-silent-door-on-virtual.json` | bed | 9.00 | 4.50 | `room/space-mismatch`: it covers parts of 2 enclosed spaces (4.50 and 4.50 m²), split by dividing line line, which its wall list leaves out |
| `M/scenarios/v-wall-4-virtual-zero-thickness.json` | bed | 9.00 | 4.50 | `room/space-mismatch`: it covers parts of 2 enclosed spaces (4.50 and 4.50 m²), split by dividing line line, which its wall list leaves out |
| `M/scenarios/worst-1-sleeping-floor-level4.json` | corr | 6.36 | 1.53 | `room/space-mismatch`: 0.18 m² of it lies on walls x1, x2 and x3, which its wall list leaves out; it covers parts of 4 enclosed spaces (1.56, 1.56, 1.53 and 1.53 m²) |
| `M/scenarios/worst-3-uses-other.json` | corr | 6.36 | 1.53 | `room/space-mismatch`: 0.18 m² of it lies on walls x1, x2 and x3, which its wall list leaves out; it covers parts of 4 enclosed spaces (1.56, 1.56, 1.53 and 1.53 m²) |
| `N/scenarios/d5-block-with-basement.json` | B1: B1-aisle | 119.34 | 146.85 | `room/space-mismatch`: 1.31 m² of it lies on walls B1-core-n, B1-col-1, B1-col-2, B1-col-3, B1-col-4, B1-col-5 and 2 more, which its wall list leaves out; it lies in one enclosed space with rooms B1-bay-13 and B1-bay-14, and no wall or dividing line divides that space between them |
| `N/scenarios/d5-block-with-basement.json` | B1: B1-bay-10 | 12.50 | 12.46 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-5, which its wall list leaves out |
| `N/scenarios/d5-block-with-basement.json` | B1: B1-bay-11 | 12.50 | 12.46 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-6, which its wall list leaves out |
| `N/scenarios/d5-block-with-basement.json` | B1: B1-bay-12 | 12.50 | 11.46 | `room/space-mismatch`: 1.04 m² of it lies on walls B1-ext-e and B1-col-6, which its wall list leaves out |
| `N/scenarios/d5-block-with-basement.json` | B1: B1-bay-15 | 12.50 | 12.46 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-7, which its wall list leaves out |
| `N/scenarios/d5-block-with-basement.json` | B1: B1-bay-2 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-1, which its wall list leaves out |
| `N/scenarios/d5-block-with-basement.json` | B1: B1-bay-3 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-1, which its wall list leaves out |
| `N/scenarios/d5-block-with-basement.json` | B1: B1-bay-4 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-2, which its wall list leaves out |
| `N/scenarios/d5-block-with-basement.json` | B1: B1-bay-5 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-2, which its wall list leaves out |
| `N/scenarios/d5-block-with-basement.json` | B1: B1-bay-6 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-3, which its wall list leaves out |
| `N/scenarios/d5-block-with-basement.json` | B1: B1-bay-7 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-3, which its wall list leaves out |
| `N/scenarios/d5-block-with-basement.json` | B1: B1-bay-8 | 12.00 | 11.96 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-4, which its wall list leaves out |
| `N/scenarios/d5-block-with-basement.json` | B1: B1-bay-9 | 11.75 | 11.71 | `room/space-mismatch`: 0.04 m² of it lies on wall B1-col-5, which its wall list leaves out |
| `Q/scenarios/part1-limits/columns.json` | hall | 90.00 | 89.52 | `room/space-mismatch`: 0.48 m² of it lies on walls col-1, col-2 and col-3, which its wall list leaves out |
| `X/haiku/brief-3/attempt-1.json` | hall | 8.74 | 8.73 | nothing new: 0.0100 m², one corner square (V-10, see "Listed with a reason") |
