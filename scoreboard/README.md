# The scoreboard

`npm run scoreboard` runs the Grid lab's plans through Grid and prints five counts. Each is
compared with the figures stored in `current.json`. When any count is worse than the stored
figure, the run exits with code 1 and CI fails. It runs in CI on Ubuntu and Windows. A full run
takes about 35 seconds (7 before ARE-4, which works out the spaces the walls enclose each time
the drawing's checks run, and 25 before MSG-12, which sets every wall against the others).

```bash
npm run scoreboard                          # run, print, compare with current.json
npm run scoreboard -- --write-current       # store this run's counts in current.json
npm run scoreboard -- --every 10            # a quick partial run, not compared
npm run scoreboard -- --out result.json     # also write every figure as JSON
```

The counts measure Grid. They say nothing about whether a plan complies with anything.

## The five counts

Two areas "differ" when they are more than 0.01 m² apart.

1. **Rooms measured wrong** (lower is better). This counts rooms whose area from Grid differs
   from the expected area. Grid's area is the one its library gives a room: read the plan,
   run the drawing's checks, skip a room they mark as broken, then take the area of the room's
   outline. The expected area comes from one of two places:
   - the referee's figure, for the 1,121 lab plans and 2,300 generated plans the referee
     measured. The referee is the lab's own area check, written separately from Grid.
   - the construction's figure, for the 400 seeded sound buildings. Their generator knows the
     rectangles it built.

   A room only counts when both sides have a figure for it. Grid's area counts as wrong when
   it is not a finite number.
2. **Damage that passes in silence** (lower is better). The damage set has 3,000 plans. Each
   one is a sound plan with one random change: a wall deleted, a coordinate scaled, an id
   changed, an opening moved, a number set wrong, a word misspelt and so on. A plan counts
   here when Grid reads it, nothing throws, and Grid's results change (areas, issues, notes,
   storey heights or exports), but Grid prints nothing new. Nothing new means no new issue, no
   new door warning, no new rules note and no new "not checked" line, both with and without a
   country. The other outcomes are listed under "Damage" in the printout:
   - Grid names the damaged part;
   - Grid names something else;
   - the schema refuses the plan;
   - the change has no effect at all.
3. **Turns answered** (higher is better). The lab held eight conversations with 67 turns, and
   each turn asks Grid for something. A turn counts when every capability it needs is
   available, and Grid itself is asked about each capability (see "Capabilities").
4. **Design mistakes named** (higher is better). The lab's 15 design attempts held 9 real
   mistakes. Each one is stored with the plan it is in and the ids of the parts that are
   wrong. A mistake counts when anything Grid says about that plan is about one of those
   parts. That can be a drawing issue, a door warning or a rules finding, matched by id or by
   the id appearing in the message.
5. **Checks the plan can feed** (higher is better). These are 42 checks architects commonly
   make at early design. A check counts when everything it needs is available, either as a
   fact the plan file can hold or as a measure Grid can make.

Two guards stop the counts from improving the wrong way:

- **Rooms Grid does not measure** (lower is better). These are rooms that have an expected
  area but no area from Grid, in plans Grid can read. Refusing a room would otherwise lower
  count 1.
- **Sound plans with a warning** (lower is better). This counts the 442 sound plans on which
  Grid raises any drawing issue or door warning. Calling everything wrong would otherwise
  lower count 2.

A guard can rise for a good reason, for example a new refusal with a clear message. In that
case, store the new figure in the same commit and say why.

## Capabilities

The capabilities behind counts 3 and 5 are listed in `src/capabilities.ts`. Each one has a
probe that asks Grid directly:

- `lib`: the library has the function, or gives the result.
- `schema`: the plan file can hold the fact. A plan carrying the field is read, and the field
  must still be there afterwards. The field names are the ones the lab's agents wrote when
  they tried to say the fact.
- `export`: the export formats include the format.
- `none`: Grid cannot do it yet, and no probe can see it coming.

When a step builds a capability with a `none` probe, it writes the probe in the same commit,
and that is when the count moves.

Which capabilities each turn and each check needs is our reading of the lab's notes, stored in
`data/turns.json` and `data/checks.json`. With today's Grid, every turn the lab marked
"answered fully" counts, and no other turn does. The same holds for checks: every check the
lab marked "yes" counts, and no other.

## The figures

| Count | Baseline (76caeb8) | Current (after MSG-12) | The lab's own figure |
|---|---:|---:|---:|
| Rooms measured wrong | 1,975 | 197 | baseline 829 + 1,145 = 1,974 |
| Damage that passes in silence | 560 | 388 | baseline 560 |
| Turns answered | 15 | 15 | 15 |
| Design mistakes named | 2 | 2 | 2 |
| Checks the plan can feed | 5 | 5 | 5 |
| Guard: rooms Grid does not measure | 1,284 | 724 | – |
| Guard: sound plans with a warning | 70 | 70 | 70 |

The baseline is commit `76caeb8`, the roadmap's reference point from before the week's work.
It was built and run once in a temporary `git worktree` outside the repository, with this same
runner and data, and is stored in `baseline.json`. Until ARE-1 the current figures matched it,
because nothing had changed in Grid's geometry or rules code since `76caeb8` except the lists
of what is not checked, which every plan gets alike.

At the baseline, rooms measured wrong is one room above the lab's figure. One lab plan sets a
wall thickness of 1e308, and Grid gives its room an area that is not a finite number. The
lab's harness saved that area to JSON as `null` and so left the room out. Here it counts as
wrong.

ARE-1 (each wall's face chosen from the outline, dividing lines with no width, steps between
walls in a row, and the refusals `room/inside-out` and `room/out-of-order`) moved three
counts:

- Rooms measured wrong, 1,975 to 200: lab plans 830 to 197, generated plans 1,145 to 3. No
  room that was right became wrong. The lab's own run of the same change (entry V-1) found
  191 on the lab plans. The 6 between are copies of one co-living corridor that is exactly
  0.01 m² (one corner square) off the referee: `referee.json.gz` stores the referee's
  figures to six decimals, which puts that difference a hair over the 0.01 m² line.
- Damage that passes in silence, 560 to 538: rooms that could not be drawn before are now
  measured, so damage to them changes an area and gets named.
- Rooms Grid does not measure, 1,284 to 712: 555 generated and 22 lab rooms with walls in a
  row of different thickness are measured now, less 5 lab rooms newly refused, each of which
  Grid had measured wrong: 2 out of order, 2 empty, and the room beside the 1e308 m wall,
  which is now inside out.

ARE-2 (a virtual wall may have thickness and height 0, and gets 0 when it states neither) moved
one count:

- Rooms measured wrong, 200 to 203. Five lab plans that give a dividing line thickness 0 were
  refused by the schema and are read now (unreadable lab plans 25 to 20, rooms compared 16,449
  to 16,463). 11 of their 14 rooms agree with the referee. The other 3 are one probe in three
  copies, `v-wall-4-virtual-zero-thickness`: a dividing line runs through the middle of the
  bedroom and is in no room's wall list. Grid measures the bedroom its walls list, 9.00 m²; the
  referee stops at the line, 4.50 m². That is a wall list that does not match the space (lab
  entry V-9), for the unclaimed-floor checks, not a measuring fault. The lab's probe only asked
  that the plan be accepted.

ARE-4 (the spaces the walls enclose, worked out per floor, with floor no room claims and rooms
that do not match their space reported as warnings) moved one count:

- Damage that passes in silence, 538 to 468. 70 damaged plans that changed Grid's results in
  silence now get a new line: 36 plus 9 with one coordinate scaled (a wall pulled off its
  corner leaves a room no longer enclosed by its walls, or floor no room claims), 13 plus 7
  with a room deleted (its floor is now unclaimed), and 5 with an id reference or a number
  changed. Another 48 that were caught vaguely now name the damaged part. None moved the other
  way.
- Rooms measured wrong stays 203. ARE-4 measures no room differently: it reports, and does not
  correct. Of the 200 wrong lab rooms, 174 are reported (171 as a room that does not match its
  space, 3 by unclaimed floor beside them), 6 are in plans too far from the origin to work out,
  which say so, and 20 are one corner square off the referee (lab entry V-10).
  `reviews/ARE-4.md` lists all 200.
- Sound plans with a warning stays 70: no sound plan gets a new line.

ARE-5 (rooms that overlap are reported, and a room marked `inside` is taken off the room it
sits in) moved no count:

- Rooms measured wrong stays 203. The lab's plans were written before the plan could say that a
  room sits inside another, so none of them says it, and Grid measures them as before. Of the 200
  wrong lab rooms, 67 are now also named in a `room/overlap` line: the 20 student bedrooms
  round their en-suite pods (two copies), the bedroom and hall of the room-in-room plan (five
  copies),
  plots and gardens drawn round a house, a stair and a table drawn as rooms, and the AR-4
  mistakes. With their pods marked `inside`, the AR-3 plans measure what the referee measured,
  room by room (`scoreboard/__tests__/scoreboard.test.ts`).
- Damage that passes in silence stays 468. Three damaged plans that were caught vaguely now
  name the damaged part, the rooms that grew over each other (named 1,669 to 1,672, vaguely 240
  to 237); `current.json` stores the new detail.
- Sound plans with a warning stays 70: rooms that meet face to face give no overlap on any of
  the 442 sound plans, and a test holds that.

MSG-15 (one table of tolerances and limits, numbers past `largest` refused, sizes far outside a
building's asked about) moved three counts. Running the scoreboard with each changed figure put
back (`withTolerances`) shows which change moved what: the 1 mm opening overrun and the 2 cm gap
move no count, the refusal past `largest` moves the first and the guard, and the questions move
the damage.

- Rooms measured wrong, 203 to 197, and rooms Grid does not measure, 712 to 724. Twelve lab rooms
  in eight probe plans rest on a wall past 10,000 km: a wall 1e9 m high (three plans), one
  coordinate of 1e21, a whole plan moved to 1e8 m, and the plan at 1e7 m (two copies). Their
  walls are refused now, with `wall/too-large`, and the rooms on them are not measured. Six of
  the twelve had been measured wrong. The guard rises for that reason, a new refusal with a
  clear message, and the new figure is stored.
- Damage that passes in silence, 468 to 447, and plans caught vaguely, 237 to 209: 49 more
  damaged plans name the damaged part (1,672 to 1,721). Putting back the overrun, the gap or
  `largest` leaves these figures as they are, so they come from the new questions about sizes
  (and from the smaller changes listed in `reviews/MSG-15.md`).
- Sound plans with a warning stays 70: none of the 442 sound plans gets a question.

MSG-12 (wall faults named at the wall, each with its fix) moved one count:

- Damage that passes in silence, 447 to 388, and plans caught vaguely, 209 to 109: 1,721 to
  1,907 damaged plans name the damaged part. Of the 333 plans with one wall end slipped, 279 now
  name the wall (132 before): 52 that were silent and 95 that were caught vaguely. Of the other
  54, the slip is within the stated tolerance (an end moved 1 mm, or 10 cm along a wall whose
  half thickness plus `gap` is more than that) or it leaves a drawing that is consistent (an end
  that slides along the wall it meets, which turns the wall but leaves every end on a wall). A
  wall listed twice in a room's list is named in 30 plans with a damaged wall list: 27 where the
  damage changed no figure, which is why "no effect at all" falls from 117 to 90, and 3 that
  were silent. A number set wrong names its wall in 6 more plans (4 silent, 2 vague) and an id
  reference changed in 3 (vague).
- Sound plans with a warning stays 70: none of the 442 sound plans gets a wall fault.

The runner's calls of `validatePlan` that only read which rooms are broken pass
`{ spaces: false }`, which leaves the spaces out (`BROKEN_ONLY` in `src/grid.ts`). The
reference commit ignores the argument.

The damage outcomes match the lab's plan for plan: 1,512 named, 305 something else, 560
silent, 117 no effect, 506 refused. The printout's `plansWhoseOutcomeDiffersNow` says how many
have moved since. Of the 560 silent plans, the lab judged about 223 to be edits that are not
mistakes (lab entry W-3): a wall list reordered or reversed, an opening moved along its own
wall, a room or opening deleted. They stay in the count as the lab defined it.

## The data

Everything is in `data/`, about 1.7 MB in all:

| File | What | From the lab |
|---|---|---|
| `lab-plans.ndjson.gz` | 1,131 plans written by the lab's groups, as they were when the referee measured them. Some are broken on purpose and are not valid JSON. | cluster V's snapshot |
| `generated-plans.ndjson.gz` | 2,300 generated plans: L, T, U, Z, cross and courtyard shapes, turned and surveyed variants, rows of rooms, tight rooms | cluster V |
| `referee.json.gz` | the referee's area for every room it measured, keyed `floor\|room id`, with how it closed the room | cluster V's referee run |
| `damage-lab.tsv.gz` | one line for each of the 3,000 damaged plans: a fingerprint of the change, and the lab's outcome | cluster L, experiment 3 |
| `bench-examples.json` | the lab bench's two example plans, the first two bases of the damage set | the bench |
| `turns.json` | the 67 turns, in our words | cluster J |
| `checks.json` | the 42 checks, in our words | cluster M (M-26) |
| `mistakes.json` | the 9 design mistakes | cluster I (PE-2) |

The damaged plans and the sound plans are not stored. They are rebuilt from their seeds by
`src/gen.ts` and `src/damage.ts`, which are ported from the lab's cluster L code. The tests
check that the rebuild matches the lab: the 42 bases are byte-identical to the lab's, and
every one of the 3,000 changes matches the lab's fingerprint. The 400 further sound buildings
use seeds 1 to 400, as in lab entry W-4.

The referee is Python and cannot run here, so its figures are stored as data. Mistakes 1 to 7
come straight from the lab's notes. Mistakes 8 and 9 are our reading, because the lab does not
list the nine one by one.

Before the data landed, it was scanned for machine paths and personal data. CI runs the same
scan, `npm run check:data` (`scripts/check-data.mjs`), over this whole folder, compressed files
included.

## Plans with no referee figure

The referee left 10 of the 1,131 lab plans without a figure. These plans count only in the
"unreadable" line.

| Plan | Why |
|---|---|
| `AU4/L-rerun/scenarios/size/grid-2000-pieces.json` | more than 1,200 rooms: the referee run skipped it (lab entry V-11) |
| `AU4/L-rerun/scenarios/size/grid-3000-pieces.json` | same |
| `AU4/L-rerun/scenarios/size/grid-4000-pieces.json` | same |
| `AU4/L-rerun/scenarios/size/grid-5000-pieces.json` | same |
| `AU1/scenarios/MS-6/c-comma-in-coordinates.json` | broken on purpose; the referee could not read it |
| `AU2/scenarios/I-s9-units-conventions--c-comma-in-coordinates/plan.json` | same |
| `I/scenarios/s9-units-conventions/c-comma-in-coordinates.json` | same |
| `AU1/scenarios/MS-6/f17c-null-for-number.json` | same |
| `E/scenarios/faults/f17c-null-for-number.json` | same |
| `bench/verify/inputs/missing-field.json` | same |

The four large plans are regular grids of rectangles, which the generated plans already cover.
All 2,300 generated plans have a referee figure.

## Changing a count

- A change that makes a count better: run `npm run scoreboard -- --write-current` and commit
  `current.json` with the change. Say in the message which count moved.
- A change that makes a count worse fails CI. If the change is still right (a guard rising
  for a good reason), store the new figure in the same commit and say why.
- Never edit `baseline.json`. It records one fixed commit.
- New data goes under `data/`, passes `npm run check:data`, and the total stays under about
  25 MB. A test checks the size.
