# MSG-15 review: one table of tolerances and limits

For the owner. MSG-15 (step 1b) landed on `main` while you were away. Below: what it adds, the
table, every tolerance whose value changed, the results on the lab's cases and the scoreboard,
the decisions made without you, the tests that changed, and what is still open.

## What MSG-15 adds

**One table.** `packages/floorplan/src/geometry/tolerances.ts` exports `TOLERANCES`, the only
place a tolerance or a limit is written. Each entry has a value, a unit, a kind, a sentence on
what it decides in Grid's words, and `basis: 'grid-drawing-check'`. No entry has a field for a
source, and none cites one: every figure is Grid's own check on the drawing. Checks read an
entry when they run, with `tolerance(name)` or `limit(name, building)`.

There are three kinds:

| Kind | What it is | Can a survey change it? |
|---|---|---|
| `tolerance` (22) | How close two things must be to count as one, or how far one may run past another | Yes |
| `limit` (16) | A size past which a number is refused (`largest`), warned about (`farFromOrigin`) or asked about | Yes |
| `arithmetic` (14) | What floating-point numbers can tell apart (1e-9 m and below, the grids a polygon join is retried on) | No |

**Adjusting it for a survey.** `withTolerances(changes, run)` runs `run` with some entries
changed, and `validatePlan(plan, index, { tolerances })` does the same for one check. A change
must be a positive finite number on a `tolerance` or `limit` entry; anything else throws before
the run starts. Changes nest and are put back afterwards, even when the run throws. The
nesting cache (`roomNesting`) is neither read nor filled under a change.

**A grep test.** `geometry/__tests__/tolerances.test.ts` reads every source file of the geometry
(except the export writers), the validation and the schema, strips comments and strings, and
fails on any number with a negative exponent (`1e-9`) or any decimal of a few centimetres or
less (`0.01`, `0.002`). It also proves that it can fail, and that the README states every
`tolerance` and `limit` entry with the value Grid uses.

**Finite numbers.** Every number in the schema is `finite()` now. JSON reads `1e400` as
infinity; the schema refuses it: "Expected a finite number: this one is too large to hold and
reads as infinity". A plan built in code skips the schema, so validation refuses a number that
is not finite as well, and any number past `largest` (10,000 km):

```
Wall w1: its thickness is 1000000000 m, past the 10,000 km Grid accepts. A number this large is no building: most likely a digit or a unit slipped. Give every size in metres.
```

The codes are `wall/too-large` and `opening/too-large`; the part is skipped, and what rests on it
too. Past that size the arithmetic loses the precision the checks need.

**No non-number in an export.** The OBJ and GLB writers drop a mesh with a point that a 32-bit
float cannot hold, and the DXF writer drops an entity with a number that is not finite, and the
area label of a room whose area is not. Validation refuses such sizes before they get there, so
these are the last guard. A test exports a plan with walls of 1e308 thickness, 1e9 height, a
1e21 coordinate and an infinite one in all four formats and finds no `Infinity`, no `NaN` and
GLB bounds that are all numbers. The IFC writer already wrote `0.` for a number that is not
finite and is unchanged.

**A door flush with an angled wall (MS-16).** An opening may run up to `openingOverrun` (1 mm)
past either end of its wall, above the top of its wall or into the next opening, and still fit.
It is drawn within the wall (`wallParts` clamps it), so nothing pokes out. Past that it is
refused, with the overrun and the offset that fits, in as many decimals as tell them apart:

```
Opening d runs from 4.01 to 4.91 m on wall w, which is 4.8996 m long: it runs 10 mm past the end of the wall, more than the 1 mm Grid allows. An offset from 0.00 to 3.9996 m fits.
```

**Questions about sizes (MS-3, AE-6, VE-2).** `geometry/plausible.ts` asks, as warnings, about
sizes far outside a building's. First the whole plan: when the typical (median) solid wall
height, thickness and door width read as a building in feet, inches, centimetres or millimetres
and not in metres, one `plan/units-question`, and no line per wall:

```
Is this plan in feet? Its walls are typically 8.86 m high and 0.656 m thick, and its doors 2.95 m wide: read as feet, those are 2.70 m, 0.20 m and 0.90 m. Grid reads every size as metres. If the plan was typed in feet, multiply every length by 0.3048 (wall points, thickness and height; opening offset, width, sill and height).
```

Otherwise single sizes, as `wall/size-question`, `opening/size-question` and
`room/size-question`, each ending "The limit is Grid's own, for catching a slipped digit or
unit, and no rule.":

```
Wall w1 is 27.00 m high, the others on its floor typically 2.70 m: is that meant? Grid stands a storey on its tallest wall, so this one makes the storey 27.00 m high.
Wall p is 0.0015 m thick: is that meant? Grid asks about solid walls thinner than 0.02 m. If it is a line on the floor with no substance, mark it virtual.
Door d is 1e-9 m wide: is that meant? Grid asks about openings narrower than 0.20 m. It still counts as a way through.
```

A wall is set against the others on its floor first (four times the typical height, with three
other solid walls or more), because that names what it most likely should be; then against the
limit. Where the plan says it is a home (a room in it is used as a `bedroom` or a `living`
room), the home figures apply: walls up to 10 m high and 1.5 m thick, rooms up to 1,000 m².
Otherwise 40 m, 3 m and 50,000 m².

**The docs.** The README has a "Tolerances and limits" section with the whole table (a test keeps
it in step), and `AGENTS.md` says where the table is and what the grep test does.

## The table

The full table, with what each entry decides, is in the README and in `tolerances.ts`. In short:

| Entry | Value | Used by |
|---|---|---|
| `openingOverrun` | 0.001 m | validation: an opening past its wall's ends, its top, the floor or the next opening |
| `gap` | 0.02 m | spaces: how far every wall is lengthened at both ends (W-9) |
| `wallContact` | 0.01 m | room outlines: walls that touch, carry on in a row, reach a corner |
| `strayCorner` | 1 m | room outlines: a corner that is no corner (`room/out-of-order`) |
| `nearlyParallel` | 0.2588 (sine of 15°) | room outlines: walls that may be one side |
| `sameFace` | 1e-6 m | room outlines: two faces that are one |
| `swingContact` | 0.01 m | door swings: a wall in the way, two doors that collide |
| `stepPastFace` | 0.05 m | route check: stepping through a door |
| `areaReported` | 0.01 m² | the smallest area a message names; spaces, overlaps, nesting, the plan comparison |
| `areaEqual` | 1e-6 m² | areas that are the same; a room with no floor |
| `wallShare`, `touch`, `touchLength`, `slit`, `lineInside` | 0.001 m², 0.002, 0.02, 0.003, 0.05 m | spaces |
| `diffLength`, `diffMovement`, `diffSameLine`, `diffOpeningOffset`, `diffWallOverlap`, `diffRoomAreaShare`, `diffRoomCentre` | 0.001, 0.01, 0.01, 0.05 m, 0.9, 0.1, 0.1 m | the plan comparison |
| `largest` | 1e7 m | validation refuses past it; spaces stop past it |
| `farFromOrigin` | 500 m | the far-from-origin warning |
| `wallThinnest`, `wallThickest`, `wallLowest`, `wallHighest`, `wallHigherThanTypical` | 0.02, 3 (home 1.5), 0.1, 40 (home 10) m, 4 times | questions about walls |
| `openingNarrowest`, `openingLowest` | 0.2 m, 0.2 m | questions about openings |
| `roomLargest` | 50,000 m² (home 1,000) | questions about rooms |
| `typicalHeight…`, `typicalThickness…`, `typicalDoor…` | 1.8 to 6, 0.08 to 1, 0.5 to 2.5 m | the units question |
| arithmetic: `noLength`, `noArea`, `onLine`, `parallel`, `samePoint`, `sameAngle`, `noTurn`, `joint`, `lineHalfWidth`, `relativeNoise`, `farNoise`, `noSlope`, `joinGrids`, `overlapGrids` | 1e-9 m, 1e-12 m², … | rounding noise, as before |

The lab's suggested limits (cluster W's layer) were read as data and are not copied: the figures
above are Grid's own, chosen so that no sound plan gets a question.

## Every tolerance whose value changed

| Where | Before | Now | What it moved |
|---|---|---|---|
| An opening past either end of its wall (`opening/out-of-wall`) | 1e-9 m | 0.001 m (`openingOverrun`) | 0 of 400 flush doors refused (the lab found 208). No scoreboard count |
| An opening's top above its wall (`opening/too-tall`) | 1e-9 m | 0.001 m | – |
| An opening's sill below the floor (`opening/negative-sill`, only reachable past the schema) | 1e-9 m | 0.001 m | – |
| Two openings on one wall (`opening/overlap`) | 1e-9 m | 0.001 m | – |
| How far the spaces check lengthens each wall at both ends | 0.001 m | 0.02 m (`gap`, W-9) | One figure in `spaces.test.ts` (below). No scoreboard count |
| Which of two overlapping rooms gets the line, "the same size" | 0.01 m² | 1e-6 m² (`areaEqual`) | – |
| Coordinates and sizes past 1e7 m | the spaces were not worked out | the part is refused (`largest`) | Rooms measured wrong 203 to 197, rooms not measured 712 to 724 |
| The far-from-origin warning | counted every point | ignores points past `largest`, which are refused on their own | – |

Every other entry kept the value it had in the code; only where it is written changed. Running
the scoreboard with each change put back (`withTolerances({ gap: 0.001 })`, `{ openingOverrun:
1e-9 }`, `{ largest: 1e300 }`) gives the same counts as now for the first two, and the counts
from before for the third.

`gap` follows W-9 as closely as the spaces check can without finding each wall's neighbour:
wall bodies already reach half their thickness, and each wall is lengthened by 2 cm. Where the
wall that ends is thicker than the one it meets, that closes less than "half the thicker wall
plus 2 cm" would.

## Results

### MS-16: a door flush with the end of an angled wall

The lab's case (a wall 4.8996 m long at 33°, a door from 4.00 to 4.90) is accepted. 400 walls
with random lengths, angles and positions, their ends rounded to the millimetre, each with a door
placed to finish at the intended end: more than 150 of the doors overrun their wall, and none is
refused (the lab found 208 of 400 refused).

### MS-3: feet typed as metres

A flat scaled by 3.28 gets one `plan/units-question` naming feet; scaled by 1,000 it names
millimetres. A wall 27 m high among walls 2.7 m high gets the question quoted above. A door one
nanometre wide is asked about, and still counts as a way through.

### T-7: numbers too big to hold

`1e400` in a thickness or a coordinate is refused by the schema. A thickness of 1e9 m is refused
by validation with `wall/too-large`, and the room on it with `room/broken-wall`. Infinity in a
plan built in code gets `wall/too-large` ("is not a finite number").

### AE-6: a 2 mm wall

A partition 0.0015 m thick gets `wall/size-question`. The lab's deliberate 3 cm glass wall gets
nothing.

### Scoreboard

| Count | Before (after ARE-5) | After MSG-15 |
|---|---:|---:|
| Rooms measured wrong | 203 | 197 |
| Damage that passes in silence | 468 | 447 |
| Turns answered | 15 | 15 |
| Design mistakes named | 2 | 2 |
| Checks the plan can feed | 5 | 5 |
| Guard: rooms Grid does not measure | 712 | 724 |
| Guard: sound plans with a warning | 70 | 70 |

- The twelve rooms no longer measured are in eight lab probe plans whose walls are past 10,000
  km: a wall 1e9 m high (three plans), a coordinate of 1e21, a plan moved to 1e8 m, and the plan
  at 1e7 m (two copies). Six of them had been measured wrong. The guard rises for a new refusal
  with a clear message, so `current.json` stores 724, as `scoreboard/README.md` allows.
- 49 more damaged plans name the damaged part (1,672 to 1,721): 21 fewer pass in silence and 28
  fewer are caught vaguely. The overrun, the gap and `largest` do not move these figures (see
  above), so they come from the questions and from the room an overlap line is put on.
- No sound plan gets a question: still 70 of 442 with a warning, 91 lines.

## Decisions made without you

- **A home is what the rooms say.** The plan has no field for the kind of building, and adding
  one is a change to the plan file. Grid reads a home from a room used as a `bedroom` or a
  `living` room, the two uses only homes (and lodgings, whose storeys are a home's) have. Any
  other plan gets the limits for any building. A field of its own is a later decision.
- **Questions, not refusals.** Every plausibility limit is a warning worded as a question, and
  each ends saying the limit is Grid's own and no rule. Only `largest` and numbers that are not
  finite are refused.
- **One units question instead of a line per wall.** When the units question is asked, no single
  size is asked about.
- **`largest` is 10,000 km.** Surveyed coordinates (UTM northings reach 10,000 km) still work; the
  spaces check already stopped there.
- **Arithmetic guards are in the table and cannot be changed.** They say what a double can tell
  apart, nothing about a building, and loosening one would break the geometry, not check a
  survey.
- **The export writers are outside the grep test.** Their numbers are file-format constants and
  drawn sizes (the IFC void's 1 cm clearance, a 5 cm door leaf). The one rounding guard in the DXF
  writer (an angle of 360°) now reads the table all the same.
- **The test referee keeps its own figures.** `test-support/referee.ts` measures rooms separately
  from Grid on purpose, so it does not read Grid's table.
- **The rules package needs no tolerance.** Its checks round to what a note prints (0.01 m², the
  millimetre) before comparing, so an area drawn exactly at a figure is never read as under it
  (the AU4-4 concern).
- **The scoreboard keeps its own 0.01 m².** It measures Grid; a survey's change to Grid's table
  must not move the ruler.

## Tests that changed

- Flipped from expected failures, and moved to blocks named "lab failures fixed by MSG-15":
  `MS-3 a wall 27 m high in a house is worth a warning` and `MS-16 a door flush with the end of an
  angled wall is accepted` (`validation.test.ts`), and `VE-2 one partition typed 27 instead of 2.7
  does not make a 27 m storey in silence` (`elevations.test.ts`). MS-3 now asserts the code and the
  whole question. `pinned-tests.md` is updated; the pinned VE-2 test (each storey stands on its
  tallest wall) is unchanged, because the fix only asks.
- `spaces.test.ts`, `two rooms side by side in one space`: the strip of unclaimed floor is 0.1 m ×
  (2.9 − 1 − the gap) m, 0.1880 m² now and 0.1899 m² before, because every wall is lengthened by
  the `gap` (2 cm) instead of 1 mm. The test reads the figure from the table.
- `spaces.test.ts`, `says so when the walls lie too far out to join`: walls 2e7 m out are refused
  by validation now (`wall/too-large`), so the test asks the spaces check for its reason directly
  and checks that validation refuses the walls.
- New: `tolerances.test.ts` (the grep test, the table's entries, the README, adjusting for a
  survey, exports with no non-number) and thirteen cases in `validation.test.ts`.

## Checks

`npm run build`, `npm run typecheck`, `npm run lint`, `npm test` (vitest excluding `.claude/**`),
`npm run check:licenses` and `npm run scoreboard` pass.

## Still open

- **The command cannot loosen the table yet.** `validatePlan` takes `tolerances`, but `grid check`
  and the tool server do not read any from `grid.json`. A survey setting there is the next step.
- **The viewer and the command keep a few literals of their own.** `packages/viewer`
  (`labelPlacement.ts`, `Canvas2D.tsx`, `buildFrame3d.ts`) and `packages/cli/src/describe/facts.ts`
  hold six arithmetic guards (1e-12 to 1e-3). MSG-15 was kept out of `packages/viewer` while SHT-5
  worked there; moving them to the table is small.
- **No wall-by-wall "stops short" line.** The `gap` closes gaps in the spaces check; a message
  naming the wall that stops short of its corner (W-9, MS-2's per-wall form) is not written.
- **A plan in two units.** The units question reads the plan's typical sizes, so a plan with one
  storey in feet and one in metres gets single questions, not a units question.
- **The kind of building.** See the first decision above.
- MSG-12 and SHT-2, which waited for this table, can start.
