# MSG-17: a door, an exit and an escape must be plausible and lead somewhere real

Card: "A way out or an escape must lead somewhere real: open air for a way out, and a route
through shared space rather than through someone else's private room; outside doors above the
ground are listed as not checked. The passable-size half is MSG-18." Lab evidence CH-6 (the
courtyard half; the size half was MSG-18) and AB-1.

No plan-format convention was added: C28 is left unused. The room property the card asks for,
private to a group or common, already existed as CNT-5's `tenure`; the groups are CNT-4's flats.

## Done when

| Item | Where it is shown |
|---|---|
| An infill house whose only door opens into a closed courtyard gets a note (CH-6) | The lab's `G/scenarios/s08g-infill-no-street-door-court-not-room.json`: before, 0 notes (the courtyard door, in a wall stated exterior, was taken as the way out); now `opening/into-closed-court` on the door and `floor/no-exit`. `geometry/__tests__/wayOut.test.ts` "names a door onto a courtyard closed in on every side…", and `rules/src/result/__tests__/wayOut.test.ts` in the record. The same house with the courtyard drawn as a room (`s08d`) already got `floor/no-exit` and still does |
| A let reached only through another let is named, with the country set or not (AB-1) | New finding `room/through-another-let`. `rules/src/result/__tests__/wayOut.test.ts` runs the same house of rooms to let with no country, GB, US and ES and gets the same line each time; `geometry/__tests__/wayOut.test.ts` holds the let rules (a shared room passed is fine, no common parts means one household, a private bathroom is an en-suite, a flat whose door opens into a let room) |
| A way out across floors follows a stair (LVL-3), and an outside door above the ground is listed as not checked | The let search walks LVL-3's stair joins: "follows the way out of a let upstairs down the stair (LVL-3)". `opening/door-out-above-ground` is now a `not-checked` line in the record: "lists a door to the outside above the ground as not checked" |

## What changed

- **A courtyard closed in on every side is no way out** (`geometry/rules/graph.ts`). A door or
  doorless opening through a wall stated `exterior`, onto floor the walls enclose and no room
  claims, was an exit because the stated kind won (MSG-13 kept that one exception). It is an exit
  now only if that piece of floor leads on to open air: a door or doorless opening a person fits
  through, with no room on either side, from it to floor no wall encloses, or to another such
  piece that does (a gate, a passage to the street). Otherwise it goes into the graph's new
  `closedCourts`, never `exits`. `sideReader` (beside `outsideTest`, which is unchanged in what it
  answers) says which enclosed piece lies past a face.
  - Three kinds of piece keep the old reading (a wall stated exterior faces outside): one a room
    claims (a door past a small gap into a garden drawn as a room), one with a dividing line
    along its edge (open on that side), and one narrower than a person: twice its area over the
    length of its edge under `passableWidth` (0.4 m). The last two came from the lab's
    `s01c-plot-virtual`, whose 5 cm strip between the house and the front-garden line read as a
    closed courtyard on the first try and cut every room off.
- **New finding `door_into_closed_court`** (`opening/into-closed-court`, rule
  `door-leads-somewhere`). Given only on floors (or floors joined by stairs) that have no other
  way out, so it sits beside `floor/no-exit` and says why. A house with a street door and a
  courtyard door gets nothing.
- **New finding `let_through_another_let`** (`room/through-another-let`, rule
  `room-reaches-exit`). A let is a flat (CNT-4), or a room with `tenure: "private"` in no flat when
  some room of the plan is `common` or `shared`. For each let a route reaches at all, a second
  search from its rooms allows only its own rooms and rooms no let holds, over the floor links and
  the stairs (LVL-3), to the same doors the routes start from (the exits, else the ways on the plan
  does not draw). When that search fails, the let is named with the other lets' rooms on its
  nearest way out. The report's finding carries `lets` (`own`, `through`) and `flat`.
- **A door to the outside above the ground is listed as not checked.** The record line
  `opening/door-out-above-ground` keeps its code, thing and values; its kind is `not-checked`
  and its wording "Where a door from "{name}" leads, {height} m above the ground, was not checked:
  it is not taken as a way out". The plan checks' own report still lists it with its findings
  (see "For the owner").
- **`grid_measure`'s route** reads the same graph, so it no longer leaves through a closed
  courtyard's door.
- **Words**: English and draft Spanish for the two new codes and the new door wording
  (`messages/en.ts`, `es.ts`); notes for a person (`notes/notes.ts`); the catalogue entries
  (`rules/src/result/catalogue.ts`); the contract's row for `opening/door-out-above-ground`; the
  two new rows in `changes/MSG-17.md`.
- **Docs**: a new section in `docs/plan-file.md`, "A way out that leads somewhere, and rooms to
  let", with its codes in the page's contents; the `tenure` paragraph now says one check reads it;
  `passableWidth`'s row in `docs/tolerances.md` and its `decides` text say it also tells a gap
  from a courtyard.

## Tests whose expected values changed, and why

- `geometry/__tests__/holes.test.ts`, "reads a door into the courtyard as one with the gallery on
  one side only": the courtyard inside the ring room is closed in by the core on every side, so
  its door is now in `closedCourts`, not `exits` (`['front']`, was `['front', 'yard']`). The plan
  has a front door, so no finding changes.
- `geometry/__tests__/levels.test.ts` (two tests) and `largerBuilding.test.ts` (one): the new
  wording of `door_to_outside_above_ground`.
- `rules/src/result/__tests__/result.test.ts`, "says a finding and a notice in the report's
  words…": the door above the ground is a report finding listed as `not-checked`, so the test
  counts it with the findings and checks its kind.
- `test-support/pinned-tests.md` records all four.

## For the owner

- **Where a closed courtyard is named.** Only where it is why the floor has no way out. A
  courtyard door beside a street door is an ordinary courtyard door, so naming it would be noise;
  it is still never counted as a way out. *Owner:* if you want it named everywhere, drop the
  `exits` test in `checkPlanSanity`'s group loop.
- **What counts as a courtyard.** Unclaimed floor closed in by real walls, at least as wide as a
  person (`passableWidth`, reused rather than a new table entry). A courtyard reached through a
  gate in a wall that has a room on its far side is still closed: a route back through the
  building is not a way out of the courtyard.
- **What a let is.** Flats, and private rooms in no flat only where the plan also marks something
  `common` or `shared`: without that, a plan that marks every room of one house `private` (CNT-5
  allows "one household's own") would name every walk-through room. A `shared` room (a kitchen
  four student rooms share) may be passed through; `commercial` rooms in no flat may too. A
  private bathroom, toilet, storage or utility room in no flat is an en-suite: no let of its own,
  and no route passes it. *Owner:* if en-suites should be grouped explicitly instead, list them
  with their bedroom as a flat; the use list is `SERVICE_USES` in `rules/check.ts`.
- **The above-ground door stays in the plan checks' report as a finding** and is a `not-checked`
  line only in the record (`grid check`, `grid_check`). Moving it to the report's `notChecked`
  would change its thing from the door to the floor in the record and drop it from the
  scoreboard's "mistakes named" matching, which reads findings. The person-facing notes
  (`planNotes`) still show it as a note, with the new wording.
- **Escapes are unchanged.** `packages/rules`' escape check still accepts a door or window onto a
  closed courtyard as a bedroom's escape: the card's done-when names the way out and lets, and an
  escape into a courtyard is a code question. Follow-up if wanted.
- **The split-room option** the card's "how" mentions (a door or passage chosen when a room is
  split for a let) is not built; no done-when needs it. `grid_split_room` still adds its one door
  in the new wall.
- **No new rule in the catalogue**, so "Checks run" lists the same four plan checks: the two new
  findings sit under `door-leads-somewhere` and `room-reaches-exit`.

## Checks run

After merging `main` at 739066d0 (CMD-4, CMD-14), on a machine with load averages of 60 to 270:

- `npm run typecheck`, `npm run lint`, `npm run build`: passed.
- `npx vitest run --exclude '.claude/**' --maxWorkers=2 --minWorkers=1`: 384 files, 6,219 passed,
  4 skipped. Two earlier runs hit the 1,500 s timeout under load; the timing guards that failed in
  them (`answers grid check on the sample flat in under 500 ms`, `stop looking for hosts after
  MAX_HOST_CUTS pairs`, the `grid diff` tools' three-colour picture) pass run alone. One real
  failure found on the way, `ownWords.test.ts` counting a new literal in `tolerances.ts`, was fixed
  (c0fbf979).
- `npm run scoreboard` (before the merge; the merge touched no source): the same as the stored
  figures, so no count moved and `scoreboard/current.json` is unchanged. Rooms measured wrong 197,
  damage that passes in silence 277, turns answered 23, design mistakes named 5, checks the plan
  can feed 25; guards 735 and 95. No damaged plan in the set turns on a closed courtyard or a let,
  and the door above the ground is still a report finding, so "mistakes named" is unchanged.
