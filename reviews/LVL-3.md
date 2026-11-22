# LVL-3: stairs that join two floors

Card: "Stairs that join two floors". Lab evidence VE-1 (rooms marked as stairs are read by
nothing, so upper floors are never checked), AU3-1 (stair rooms that overlap on neighbouring
floors already say where the stair is) and F21. Follows the decision recorded in LVL-2: a stair
is a designed object with a start floor, an end floor, a width and a run, and Grid works out the
risers, the goings and the connection between floors. Builds on LVL-1 (floor levels and heights
in metres) and LVL-7 (a room's floor offset).

## Done when

| Item | Where it is shown |
|---|---|
| The townhouse report no longer says the upper floors were not checked for want of stairs; routes run down the stair to a door (VE-1) | On the lab's townhouse (`A/scenarios/townhouse.json`) the report before said "The way out of "First floor" / "Second floor" was not checked: the plan has no stairs"; now it has no finding and no notice: every room upstairs is reached down the stair rooms to the front door. In the tests: `stairs.test.ts` "joins stair rooms that lie one over the other, floor to floor, to the front door" (the three-floor `stairRoomHouse`), "checks the first floor of the two-floor house through its stair" (a stated stair), and "names a room upstairs that the stair does not reach, with its ways through" (a route followed down the stair, and `through` listing the stair by its id) |
| On the 74 multi-floor lab plans, stair rooms on neighbouring floors are joined in 117 of 120 pairs, and the 3 that are not are exactly the planted faults (AU3-1) | `scoreboard/__tests__/stairJoins.test.ts`, on the same 74 plans the lab ran AU3-1 on, as the scoreboard stores them: 155 pairs of neighbouring levels, 120 with a drawable stair room on both, 117 joined, and the 3 out of line are `townhouse-stair-misaligned` (ground–first and first–second) and `h01b-stair-shifted` (ground–first) |
| A stair or lift out of line is named | New plan checks `stair_out_of_line` and `lift_out_of_line` (rule `stairs-line-up`): `stairs.test.ts` "names a stair room out of line, and checks nothing above it" and "names a lift shaft out of line, and never takes a lift as a way out". A new room use `lift` covers shafts (AU3-1: the shifted shaft of h06b could not be found because a lift could only be `other`) |
| … and stair area is counted once | A stated stair adds no floor of its own: its flights stand in rooms already measured. `planStairs` returns its `footprint` once, with the stair; `planAreas` says it in a note ("Stair "s1" covers 2.52 m² in the rooms it stands in; it adds no floor of its own"). See the decision below: the owner should check this reading |

LVL-2's own done-when, which this step builds:

| Item | Where it is shown |
|---|---|
| The stair object (start floor, end floor, width, run) is in the schema and the guide with an example | `StairSchema` in `packages/floorplan/src/types/floorplan.ts`; README "Stairs that join two floors", with an example |
| Risers and goings are worked out from the stated floor heights and returned with the stair | `planStairs` (`geometry/stairs.ts`): rise, risers, riser height, going, pitch, flights, landings, footprint and the rooms at each end. `stairs.test.ts` "works out 14 risers of 0.21 m and treads of 0.215 m"; `grid describe` prints them |

## The schema change

Two additions, both optional and never defaulted, so every plan written before reads with no key
added (tested) and the file stays version 1. As with LVL-1 and LVL-7, the owner should decide
whether they belong to a version 2 when CNT-1 lands.

| Field | Type | Meaning |
|---|---|---|
| `stairs` | list, optional | Stairs, each stated once across the two floors it joins |
| `stairs[].id`, `name` | text | `name` optional |
| `stairs[].from`, `to` | floor ids | The floor the walking line starts on and the one it ends on; either may be the higher |
| `stairs[].width` | positive number | Metres across the flight |
| `stairs[].run` | 2 to 64 points | The walking line, down the middle of the flight, from the stair's edge on `from` to its edge on `to`; each point between is a turn with a square landing as wide as the flight |
| `stairs[].risers` | positive whole number, optional | The number of risers, when the design has chosen |
| room `use: "lift"` | new value | A lift shaft drawn as a room on each floor it serves |

A straight stair may be written with `start` and `end` in place of `run`; it is read as
`run: [start, end]`. That is what the one lab plan that already held a `stairs` key wrote
(`H/scenarios/h01a-stair-guessed-keys.json`: `from`, `to`, `type`, `start`, `end`, `width`,
`risers`). Without it, that plan, which Grid read before (dropping the key), would have been
refused. `type` is dropped as any unknown key is.

## Decisions the owner should check

- **What "stair area is counted once" means.** I read it as: the stair object never adds floor
  area, because its flights stand inside rooms that are already measured (a stair room, a hall).
  Stair rooms on each floor are still each that floor's floor, as before, and circulation still
  counts them per floor. If the card meant that the void over a stair on the upper floor should
  not count as that floor's area (a measuring-standard question), that is not built: it needs a
  floor opening (LVL-4) and a choice of measuring rule.
- **Riser count when the plan states none.** Grid takes the number of risers that brings twice the
  riser plus the mean going nearest 0.63 m, the stride of a person on a stair (`stairStepLength`,
  a new limit in the tolerance table). It is Grid's own proportion for laying the stair out and
  judges nothing; it cites no document. The proportion is old and common, and some building codes
  state a range for it; I did not take the figure from any code and recorded none in
  `packages/rules`. The owner may prefer a riser target instead.
- **No stair check against a building code.** Nothing judges a riser, a going, a pitch, a width or
  headroom: those are figures from building codes, and no source was read in this step, so no
  figure was added to `packages/rules`. The report's limits say so in a new line. The scoreboard
  checks "stair width" and "stair rise, going and pitch" now count as *fed* (the plan can hold the
  facts), not as checked.
- **Neighbouring floors and the half overlap.** Neighbouring floors are neighbouring `level`s in
  order; all floors of one level are set against all of the next. Two stair rooms are one stair
  when they share at least half of the smaller one (`stairRoomOverlap`, 0.5, the lab's AU3-1
  threshold). Out of line means both levels have a stair room and none lies over another; a stair
  room with none on the next floor (a loft ladder, a roof hatch) says nothing, as AU3-1 found no
  false alarm that way. The lab's `D/scenarios/d2-stair-shifted-floor3` is a planted shift that
  still leaves at least half of the stair rooms over each other: it is joined and not named, as in
  AU3-1.
- **A lift is never a way out.** Lift rooms are lined up and named when out of line, but a route
  never goes through a lift. So the lab's block with a basement (`D/d5-block-with-basement` and its
  copies) now says "Lift lobby (basement)" and "Lift" have no route to a door to the outside: the
  basement is checked through its stair, and that lobby is reached only by the lift.
- **Which floors are checked.** The ground floor (level 0, or the only floor, unless it stands
  above the ground) and every floor joined to it by stairs, through any number of floors, are
  checked as one: routes from every door to the outside on those floors that do not stand above
  the ground, up and down the stairs. A basement's own door to the outside counts as a way out. Any
  other floor gets the notice with reason `no_stairs`, now worded "no stair joins it to the ground
  floor" (the card's "no stair room joins this floor").
- **A stair is a way through.** A room a stair joins is not "a room without a door". So a stair
  room drawn with no door on its own floor, in a plan where the stair rooms line up, now gets "has
  no route to a door to the outside" (with the stair as its way through) instead of "has no door or
  opening to another space". Seen on the lab's `townhouse-v1-id-clash` (whose doors collide).
- **Routes go by floor and room id.** Some lab plans repeat a room's id from floor to floor
  (`d2-dup-ids`): routes key rooms by floor and id, so those rooms stay apart.
- **Where a stair is drawn.** In 2D on both floors it joins (its flights, a line at every riser,
  the walking line with an arrow pointing up; `data-end` says which end the floor is). In 3D, OBJ,
  glTF and IFC on the floor it rises from: a block per tread and per landing, solid from the foot,
  the last riser rising onto the floor above. The IFC writes an `IfcStair` (`STRAIGHT_RUN_STAIR`
  for one flight, else `NOTDEFINED`) aggregating an `IfcStairFlight` per flight, with its risers,
  treads, riser height and tread length, and an `IfcSlab` `LANDING` per turn, after everything
  else, so a plan without stairs writes the file it always did.
- **A floor's slice reads its stairs from the whole plan.** A stair joins two floors, so
  `planForFloor` now remembers the plan a slice was cut from (`wholePlan`). The 3D scene memo in
  the viewer keys on the laid-out stairs as well as the slice.
- **The sheet.** A plan that states its stairs no longer says "stairs are not shown"; the stair
  notice is now "No stair joins some of the floors to the others, so the way between them is not
  checked", and appears only when a floor is joined to none.

## Not built

- **A lift as a shaft object through named floors.** The card names it; a shaft here is a room used
  as a `lift` on each floor, lined up from floor to floor. Nothing in the done-when needs a shaft
  object, and the rooms already say where it is.
- **Winders, spiral and curved stairs.** A turn is a square landing. A spiral stair can still be a
  stair room on each floor.
- **The DXF** draws no stair: a stair layer would change every DXF golden file. Left for SHT-11.
- **The tool server's edit tools** do not add a stair; an agent writes it in the plan file. WRT-2
  is reworking writing in parallel.
- **Headroom, handrails, guarding, the floor opening over a stair** (LVL-4) and **a section
  through the flight** (LVL-9).

## Expected figures, golden files and snapshots changed

No IFC, DXF, OBJ or glTF golden file and no snapshot changed: no existing test plan states a stair.

Existing tests whose expected values changed, and why:

- `packages/floorplan/src/types/__tests__/floorplan.test.ts` "keeps each of the ten values" (was
  nine): the room uses gain `lift`.
- `packages/floorplan/src/geometry/__tests__/rules-catalogue.test.ts` "are the five plan checks"
  (was four): the new rule `stairs-line-up`.
- `packages/cli/src/describe/__tests__/describe.test.ts` "says what the plan cannot say": the lab's
  block has six stair rooms that line up, so its card no longer says "how its floors connect (it
  holds no stairs or lifts, only 6 rooms marked as a stair)" and instead says "Stairs: the stair
  rooms lie one over the other from Ground floor to Floor 5."
- `packages/floorplan/src/geometry/export/__tests__/gltf-large.test.ts`: the hand-built scene gains
  `stairs: []` (a new field of `Scene3D`).

The report's `LIMITS` gained one line, in every report: "A route may go up or down a stair, but how
steep or wide the stair is is not checked, and a lift is never taken as a way out".

New tests: `packages/floorplan/src/geometry/__tests__/stairs.test.ts`,
`scoreboard/__tests__/stairJoins.test.ts`, `packages/viewer/src/picture/__tests__/stairs.test.ts`,
a case in `describe.test.ts`, a line in `look.test.ts`. New shared plans in
`packages/floorplan/src/test-support/plans.ts`: `stairRoomHouse` and `stairHouse`.

## The scoreboard

One count moved, and is stored in `scoreboard/current.json` in this commit: **checks the plan
can feed, 5 → 11**. The capabilities `stairs` and `lift` are now `yes`. That feeds the six checks
that need only those (with capabilities Grid already had): 7 headroom on stairs and at doors
(with door heights), 17 doors that do not swing across a corridor or stair (with the door check),
19 stair width, 20 stair rise, going and pitch, 21 stair landings, handrails and guarding, and 31 a
lift above a number of storeys. "Fed" means the plan can hold what the check needs, not that Grid
runs the check: none of these is checked yet, and 21's handrails and guarding cannot be stated.

Two probes changed in `scoreboard/src/capabilities.ts`: the `stairs` probe keeps the lab's field
names (`from`, `to`, `width`, `risers`) and adds the walking line `run`, which the schema requires;
the `lift` probe, which had none, is a room used as a `lift`.

Every other count is unchanged: rooms measured wrong 197, damage silent 386, turns 15, mistakes
named 2, rooms not measured 727, sound plans with a warning 95. The sound plans are one floor, and
the damage set's bases too, so the cross-floor routes do not reach them.

On the 1,131 lab plans, the way-out report changed on 94: 269 floor notices "not checked: the plan
has no stairs" are gone because a stair now joins those floors, 36 rooms newly have no route to a
door to the outside (the lift lobbies above, the planted fault on floor 4 of `d2-mistake-floor4`,
whose flat C is shut off, and a spiral stair drawn as an overlapping room in `h04-stair-spiral`),
31 stair rooms no longer have "no door" (the stair is their way through), and 4 stair rooms are
named out of line (the planted faults above, and their copy in AU2).

## Merging main (MSG-1, ARE-6, WRT-2)

- MSG-1 renamed the core's `checkLocalRules` to `checkPlanSanity`; the new stair test uses it.
  Its wordings live once in `rules/messages.ts` as parts: `noStairs` now reads "no stair joins it to
  the ground floor", and the out-of-line wording is a new part, `outOfLine`. `grid check` keeps
  MSG-1's "No findings." wording, with 7 checks run.
- MSG-1's catalogue and `docs/result-contract.md` gain the nine new codes: `stair/unknown-floor`,
  `stair/same-floor`, `stair/no-rise`, `stair/run-too-short`, `stair/too-few-risers`,
  `stair/end-in-no-room`, `stair/duplicate-id`, `room/stair-out-of-line`, `room/lift-out-of-line`,
  and a changelog entry. The record's thing kinds gain `stair` (on the floor its walking line
  starts from). `floor/not-checked-no-stairs` and `opening/door-out-above-ground` no longer say
  stairs "cannot be held yet". The contract tests' code patterns now include `stair/`.
- ARE-6 made an IFC footprint an outline with holes; a stair block is an outline with none.

After the merge every check passed except the timing test "answers grid check on the sample flat in
under half a second": it took 6.8 s and 8.7 s while the machine's load average was about 220 (other
sessions running). `diff-size`'s timing guard failed once under the same load and passed alone.
For a plan with no stairs the check adds one pass over the room outlines it already traced; it
should be rerun on a quiet machine.

## Merging main again (MSG-18, CNT-12)

Both sides kept everywhere: stairs beside items (fixtures) in the schema's text limits, the id
order, the drawing, the IFC (items, then stairs), the entity and thing kinds (`item`, `stair`)
and the viewer's look; the out-of-line findings beside `opening_too_small_to_pass`, whose check
now runs in the per-floor pass of the stair-aware routes; the limits keep both lines. No IFC
golden file changed. After this merge every check passed, the two timing tests included.

## Merging main again (MSG-2, CMD-15, QAR-10, the README split)

- README.md is main's front page. This step's sections moved to the docs pages: "Stairs that join
  two floors" into `docs/plan-file.md` (with its line in the page's index), the two tolerance rows
  into `docs/tolerances.md`, the stair rows of the text limits into `docs/plan-file.md`, and the
  sheet and describe lines into `docs/commands.md`.
- MSG-2 says what each check looked at. The new check `stairs-line-up` looks at the rooms used as a
  stair or a lift, on every floor; every other room is skipped as "only rooms used as a stair or a
  lift are lined up". A plan with no such room lists the check as looking at nothing, so it is not
  among the checks run: `grid check` on the sample flat still says "Checks run (4)". Three
  expectations changed with it: `coverage.test.ts` (cli) lists `stairs-line-up` among the
  coverage, and `rules-lookup-figures.test.ts` leaves it out of the rules a stairless plan lists.
- Every code row and changelog section of `docs/result-contract.md` is kept from both sides.
