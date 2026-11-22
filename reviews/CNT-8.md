# CNT-8 review: zones inside one room

For the owner. CNT-8 lets an open-plan room show where you sleep, cook or sit. Each zone is a
room of the plan that names the room it is part of with `partOf`, and is drawn, named and
measured. The room is the place: it is measured, counted, reached and checked as a whole, so
the studio drawn with zones and drawn as one room give the same size-check result (lab EL-13).
Merging a kitchen and a living room now asks for the merged room's use, or keeps both as zones,
and the verdict names any use the plan loses (lab AB-9).

## What was on main already

ARE-5's `inside` and `geometry/nesting.ts` take a pod's floor off the room around it, and ARE-6's
holes take a hole off it. Both make the inner part not floor of the outer room. A zone is the
other way round: its floor is the room's, counted once, in the room. So nesting covers none of
it. It now leaves zones alone: a zone is never a host, and its `inside` is not read.

## What changed

1. **The plan file** (`packages/floorplan/src/types/floorplan.ts`): a room may state `partOf`,
   the id of the room it is a zone of. It is held to the id text rule (MSG-9), optional and never
   defaulted, so a plan written before reads with no key added (version 1). MSG-4's reading takes
   its fields from the schema, so `partOf` is never named as unknown. The command's text limits
   (`packages/cli/src/command/planText.ts`) hold it to an id's 64 characters. It is not a
   top-level part, so the sheet's `coverage.ts` is unchanged.
2. **The zones** (`packages/floorplan/src/geometry/zones.ts`, new): `roomZones(index)` finds each
   zone and its room, worked out once per index, and only for a plan with a room that states
   `partOf`. A room is a zone only when the room it names is on its floor, is not a zone itself,
   and holds all of it but `areaReported`. It also gives the dividing lines only zones list.
3. **The drawing's checks** (`packages/floorplan/src/geometry/`):
   - `overlaps.ts`: a zone and its room, and a zone and a pod inside its room, are not compared.
     Two zones of one room that share floor are still named.
   - `spaces.ts`: zones are set against no space, and a line only zones list is left out, so the
     room matches the space its walls enclose.
   - `wallFaults.ts`: a zone's dividing lines stand in its room by right (no `wall/crosses-room`).
   - `rules/graph.ts`: a zone is never on a side of a door, and is no place in the route graph:
     a door in the studio's walls opens into the studio.
   - `validate.ts`: new warning `room/zone-not-in-room`, with why (no such room on the floor, the
     room is a zone itself, a room cannot be its own zone, or how much lies outside). Such a room
     is counted on its own.
   - `nesting.ts`, `items.ts`, `scene3d.ts`, `export/ifc.ts`: a zone hosts nothing and is not
     nested; a fixture stands in the room; the 3D view and the IFC have the room's slab and space
     only.
   - `areas.ts` (ARE-9): each `RoomAreaFigure` has `zoneOf`. A zone is in no figure; in `byUse`
     each zone's floor goes to its own use and the rest to the room's, so by use still adds up to
     the net to the last digit.
   - `diff/props.ts`: `partOf` is compared.
4. **The figure checks** (`packages/rules/src/checks/`):
   - `zoned.ts` (new): the use a check applies to a room. The room's own when the check covers
     it, else the first covered use, in the check's own order, that one of its zones has.
   - `size.ts` and `escape.ts`: a zone is skipped as `part_of_room`; a room with zones is checked
     whole, at its whole area. A finding on it carries `use` and `zone`, and names the zone as its
     second room. `coverage` gains `wholeRooms` on a figure check that looked at a room with zones.
   - `coverage.ts`: the route checks skip zones as `part_of_room`, and a zone counts as looked
     at when its room is (`roomsLookedAt`).
   - `result/catalogue.ts`: the entry for `room/zone-not-in-room`, and `room/too-small`'s `found`
     ends ", the whole room with its zones, checked as a bedroom, the use of its zone …" on such a
     room only.
5. **The command and tool server** (`packages/cli/src/`):
   - `edit/merge.ts`, `mcp/editTools.ts`: `grid_merge_rooms` and `grid edit merge` take `zones`
     and `new_room`. Two rooms of different uses with neither `use` nor `zones` are refused, with
     the question, once the two are known to share one wall. With `zones`, the stretch taken out
     becomes a dividing line, both rooms are kept as zones (id, name, use, `partOf`) and a new room
     (`<first>-<second>` unless `new_room`) holds them. Doors that joined either room are not said
     to have changed rooms. Without zones, a merged room whose first room states no use takes the
     second's, and the zones of the room that goes are moved to the merged room. A zone is not
     merged.
   - `quantities/compare.ts`: every verdict ends with any use no room or zone has any more. The
     net and the option rows count a zone's floor once.
   - `quantities/areas.ts`, `schedule.ts`, `takeoff.ts`, `estimate.ts`, `state.ts`: a zone is
     listed with `zoneOf` in `grid_areas`, is no row of the room schedule (listed under its room
     as `zones`), and is not taken off or priced again. `room/zone-not-in-room` makes an area
     `not-proven`.
   - `describe/facts.ts`, `describe/card.ts`: a zone is "(a zone of …)" for a person and
     `zone-of:<id>` for an agent; a floor says "5 rooms and 2 zones" and counts its floor once.
6. **Docs.** `docs/plan-file.md` gains "Zones inside one room" and a line in the text limits.
   `docs/result-contract.md` gains the code's row, the reason `part_of_room`, the field
   `wholeRooms`, the doubt, and a changelog entry. `docs/tool-server.md`'s row for
   `grid_merge_rooms`. The README is untouched. No tolerance was added.

## Against `done_when`

1. *The studio drawn with zones and drawn as one room gives the same size-check result (EL-13).*
   The studio is the lab's `A/scenarios/studio.json`, read from
   `scoreboard/data/lab-plans.ndjson.gz` with `labPlan(name)`. The two versions are built in the
   test: zones (the studio round its own walls, the three parts with `partOf`) and one room with
   the same walls. In `packages/rules/src/checks/__tests__/zones.test.ts`:
   - "the studio split into four rooms: the sleeping corner is under the figure": the lab's
     finding, as Grid gives it today (6.41 m²; the lab's 6.16 was measured when a dividing line
     still took 0.1 m).
   - "the studio drawn with zones and drawn as one room give the same size-check result": no
     finding either way, the same `lookedAt` (`studio`), no `no_use` notice, `wholeRooms` says
     bedroom from `sleep`, and the zones are skipped as `part_of_room`.
   - "gives the same result whether the studio states its own use or takes its zone's", and "a
     studio too small as a whole gets one finding on the room in both drawings, with the same
     area" (the studio at 0.55 of its size): one `room_too_small` on `studio` in both, and the
     line's `found` names the zone.
   - The escape check, a room whose zones state no use, and the route checks, each against one
     room.
   `packages/floorplan/src/geometry/__tests__/zones.test.ts` holds the drawing to it: no overlap,
   no space mismatch, no new drawing problem, the door into the studio, the net counted once,
   one slab, and each way a zone is not in its room.
2. *Merging a kitchen and a living room keeps both uses as zones or asks, and never drops one in
   silence (AB-9).* In `packages/cli/src/edit/__tests__/zones.test.ts`, on the lab's flat (E):
   - "asks for the merged room's use, or zones, and writes nothing" (the tool);
   - "with a use, names the use the plan loses in the verdict";
   - "keeps both uses as zones of one open-plan room, and loses none": the new room, the two
     zones with their ids, names and uses, the dividing line, no door said to change rooms, and
     nothing new in the drawing;
   - "counts the open-plan room once": the same net as the room E made by hand, both uses by
     use, and the room schedule;
   - "checks the open-plan room as a whole, with the living room's use";
   - "grid edit merge (CNT-8) › asks, writes nothing, and keeps both uses with --zones" (the
     command, in this process through `runGrid`).

## Changed expectations

- `packages/cli/src/edit/__tests__/requests.test.ts`, "2. knock the kitchen and living room into
  one": the call now passes `use: 'living'`, the use E kept by hand; without it the merge asks.
  The test also expects the verdict to name the kitchen use as lost.
- `packages/cli/src/mcp/__tests__/tools.test.ts`: the example call of `grid_merge_rooms` (living
  and kitchen) passes `zones: true`, so it still answers.
- `packages/cli/src/command/__tests__/edit.test.ts`, "refuses an option the verb does not take":
  the list of `merge`'s options adds `--zones` and `--new-room`.
- No snapshot changed. No scoreboard figure changed (see the checks run).

## The checks run

- `npm run build`: done. The bundle `grid.mjs` is 364,405 bytes, under the 500 kB limit.
- `npm run typecheck`: no errors in any workspace (after one fix to the rules test, which
  compared a finding with a code that does not exist, `no_door`; it is `room_without_door`).
- `npm run lint`: no problems.
- `npm run check:licenses`: "Checked 363 licences in package-lock.json: none is GPL, LGPL,
  AGPL, MPL, EPL."
- `vitest run --exclude '.claude/**' --maxWorkers=2 --minWorkers=1`: Test Files 247 passed
  (247), Tests 4794 passed | 4 skipped (4798). No test failed, on timing or otherwise.
- `npm run scoreboard`: "Same as the stored figures." No lab plan states `partOf`, so nothing
  the scoreboard measures moved.

## For the owner

- **The field's name and shape.** `partOf` names the room by id, unlike ARE-5's `inside: true`,
  which finds the host from the outlines. A zone and its room overlap on purpose, so the outlines
  alone cannot tell a zone from a mistake; the id says which. It goes stale if the room's id
  changes: a merge moves it, other edits do not rename ids. Lab AU3-5 asks for one way to
  group a plan's parts (flats, buildings, phases, zones); `partOf` is one level of that and does
  not decide it.
- **One level.** A zone of a zone is refused (`room/zone-not-in-room`). A room's zones may leave
  part of it unzoned; that part goes to the room's own use by use.
- **Which use a check applies.** The room's own when the check covers it, else its zones'. So a
  studio whose own use is `living`, with a sleeping zone, is size-checked as a living room (the
  same figure) and escape-checked as a bedroom. A studio stated `kitchen` is size-checked as its
  bedroom zone. I chose the reading that checks more; say if a room's own use should win
  outright.
- **The merge asks** rather than choosing. It is the reversible option: a refused call writes
  nothing and says what to pass. It changes WRT-3's behaviour for two rooms of different uses (one
  test now passes the use). The default could instead be `zones`; one line.
- **A merged room with zones gets a new id**, `<first>-<second>`, so both old ids stay (lab
  AB-7's refused 'salon'). It states no use of its own; its zones carry them.
- **Exports.** The IFC leaves zones out, so no space is counted twice. IFC's own way is an
  `IfcSpace` with `CompositionType .PARTIAL.` aggregated under the room's; that is a follow-up.
  The DXF and the 2D drawing draw zones as rooms, with their names and areas. On the drawing the
  room's own label is placed clear of its zones' by the label placer, and may move out with a
  leader when the zones fill it.
- **The room schedule** lists a zone under its room, in the data only. The CSV and the sheet's
  table have one row per room, so a column of areas adds up to the total.
- **Rooms text** has no word for a zone. `grid describe --as rooms` gives a floor with zones in
  Grid's own terms, so nothing is lost; `grid write` cannot write a zone yet.
- **Finishes per zone** (lab AC-4) and a takeoff by zone are not built: the takeoff and the
  estimate count the room once, by its own use.
- **The lost-use sentence** is on every verdict, `grid_compare`'s too, and only when a use is
  gone. It counts zones' uses, so a merge with zones loses none.

## After merging main (25747b7)

Main had gained, among others, CNT-5 (kinds of building, 27 room uses), SHT-11 (stairs counted
once, lifts and the floor above drawn) and CNT-13 (use indicators round the fixtures). Merge
commit af95f50 resolves seven conflicted files, keeping both sides in each; the changes beyond
them are in the follow-up commit:

- `docs/result-contract.md`: the coverage table has CNT-5's `uses`, `buildings` and CNT-8's
  `wholeRooms`; the changelog has CNT-8's section on top, then CNT-13's, SHT-11's and CNT-5's.
  CNT-8's section gains a paragraph on how zones meet the three.
- `packages/rules/src/checks/types.ts`: both skip reasons (`part_of_room`, `not_for_building`),
  both coverage fields, and `BuildingType` beside `RoomUse`.
- `packages/rules/src/checks/check.ts`: a figure check's coverage carries `uses` and `buildings`
  (CNT-5) and, when it looked at a room with zones, `wholeRooms`.
- `packages/floorplan/src/geometry/areas.ts`: each room figure has `zoneOf` and, over a stair
  room below, `countedWith`; the counted rooms leave out both.
- `packages/floorplan/src/geometry/spaces.ts`: SHT-11's shared `floorWalls`, less the lines only
  zones list.
- `packages/cli/src/quantities/areas.ts`: no zone and no stair room over another in a total; a
  zone's floor counts by its use only when its room is counted.
- `packages/cli/src/mcp/readTools.ts`: `grid_areas`' CSV says `zone`, `outside`, `with the stair
  below` or `inside`; its text adds both notes.

How zones meet the new uses and indicators:

- **CNT-5's uses.** A zone may have any of the 27 uses. `zoned.ts` already read uses from
  `ROOM_USES`, so it takes them. The size and escape checks now hand it `RULE_USES` (catalogue),
  the same list their `coverage.uses` gives, in place of their own copies (`HABITABLE_USES` and
  a local `['bedroom']`), so the use a check applies to a room with zones comes from the list
  its coverage names. A studio whose own use is `office` with a `study` zone and a `bedroom` zone
  is checked as a bedroom from its zone; one whose zones are only `study`, `office` and `toilet`
  is skipped as `use_not_covered`, its zones as `part_of_room`, and is not said to have no use.
- **CNT-5's kinds of building.** On a floor the plan says is a kind a check does not run in, its
  zones are skipped as `not_for_building` with every other room, and no `wholeRooms` is given.
- **SHT-11's stair stack.** A zone is in no stack (`stairStacks` skips it), so it never has
  `countedWith` and its floor is counted once, in its room, under its own use. Without that, a
  stair zone over a stair room below was counted with it and also in `overStairs`, and the
  gross external sum no longer held.
- **CNT-13's indicators.** Fixtures stand in the room, not a zone (CNT-8's `items.ts`), and the
  measures work on the room's outline, so a room with zones is measured whole and its zones'
  dividing lines stand in no way. `grid_measure` with `what=use` on a zone, and `what=route` from
  or to one (with or without `width`), now measure its room as a whole and say so first:
  `"Kitchen" is a zone of "Kitchen and living": measured as part of it, the room as a whole.`
  The data names the zone (`zone`, `fromZone`, `toZone`). Before, `what=use` measured the
  zone's own outline as if its dividing lines were walls and said it held no fixtures, and a
  route from a zone found no way, since a zone is no place in the route graph.

Changed beyond the marked conflicts:

- `packages/rules/src/checks/size.ts`, `escape.ts`: read `RULE_USES`, as above.
- `packages/floorplan/src/geometry/areas.ts`: `stairStacks` skips zones; the `net` comment says so.
- `packages/cli/src/mcp/readTools.ts`: the zone handling in `what=use` and `what=route`.
- `packages/cli/src/sheet/pages.ts`: the sheet's area table lists rooms only, as this review
  said it did. It listed zones too, and their areas went into the sum, so the printed net was
  the room's floor counted twice; SHT-11 had changed the same function for stacked stairs.
- `docs/tool-server.md`: a paragraph on zones under the use indicators.
- New tests: "stacks no zone (CNT-8)" in `geometry/__tests__/areas.test.ts` (fails without the
  `stairStacks` change); three in `rules/src/checks/__tests__/zones.test.ts` ("zones with CNT-5's
  uses and kinds of building"); two in `cli/src/edit/__tests__/zones.test.ts` (a zone's use
  indicators and routes, and the sheet's rows).

Not changed, for the owner: `grid_rename_room` on a zone says which checks look at it by the
zone's own use (WRT-3 and CNT-5's `rulesForUse`), though they look at its room; `what=fit` on a
zone fits inside the zone's outline and counts no fixture, which stand in the room. Both were so
before this merge.

Checks after the merge and the follow-up: `npm run build`, `npm run typecheck` and `npm run lint`
exit 0. `vitest run packages/floorplan/src packages/rules packages/cli --maxWorkers=2
--minWorkers=1`: Test Files 186 passed (186), Tests 4286 passed | 2 skipped (4288); none failed,
on timing or otherwise. `npm run scoreboard`: "Same as the stored figures" (turns 16, mistakes 5,
checks fed 14; guards 735 and 95), so `current.json` is unchanged: no lab plan states `partOf`.

## After merging main (b58930a, LVL-4)

Main had gained LVL-4: one slab per floor from its outline, open over stairs, lifts and voids, a
roof over every part with nothing above, room ceilings with lowered zones, `site.ground`, and
`grid_takeoff`'s `envelope`. The merge commit resolves eight conflicted files, keeping both sides
in each; the changes beyond them are in the follow-up commit.

- `docs/plan-file.md`: both sides' rows in the text limits (a lowered zone's name, the room a
  zone is part of) and both entries in the list of sections.
- `docs/result-contract.md`: both skip reasons (`no_ground_level`, `part_of_room`); the changelog
  has CNT-8's section on top, then LVL-4's.
- `packages/rules/src/checks/types.ts`, `coverage.ts`: both skip reasons; both imports
  (`roomZones`, `statedGround`).
- `packages/rules/src/checks/escape.ts`: LVL-4's `atGround` argument and CNT-8's `wholeRooms` in
  the result.
- `packages/floorplan/src/geometry/areas.ts`: both imports (`inPolygon`, `roomZones`).
- `packages/floorplan/src/geometry/export/ifc.ts`: LVL-4's slab per floor, with CNT-8's skip of
  zones in the raised-room slabs and the spaces.
- `packages/cli/src/quantities/takeoff.ts`: LVL-4's ceilings, with CNT-8's room list (no zone
  unless asked for by name).

Changed beyond the marked conflicts, so a zone has no ceiling, slab or take-off figure of its own:

- `packages/floorplan/src/geometry/envelope.ts`: a zone fills no courtyard (`openToTheSky`), is
  no void, has no sunken slab, and a stair or lift join with a zone at either end opens no slab,
  as a zone is in no stair stack (`stairStacks`); `roomCeiling` gives no ceiling for a zone. The
  IFC's `IfcCovering`s and `grid_takeoff`'s `lowered` read `roomCeiling`, so both follow.
- `docs/plan-file.md` and `docs/result-contract.md`: a sentence each on zones with LVL-4.
- New test in `packages/cli/src/quantities/__tests__/envelope.test.ts`, "zones in the slabs,
  roofs, ceilings and take-off (CNT-8)": the lab's studio with a first floor over its
  kitchenette, its zones stating a ceiling, a void, a sunken floor and a stair use, gives the same
  `envelope`, totals and room lines, and the same count of IFC slabs, openings, roofs, coverings
  and spaces, as the studio drawn as one room. Both of its cases fail without the
  `envelope.ts` change.

For the owner: a zone used as a stair or lift now opens no slab, so an open-plan room with a
stair zone over a stair room below has a closed floor unless the plan states the stair (a stated
stair opens its flights wherever it stands). That keeps a room with zones the same as the room
without them; the other reading, a stair zone that opens the floor, is one line in `slabOf`.

Checks after the merge and the follow-up: `npm run build`, `npm run typecheck` and `npm run lint`
exit 0, with no type errors. `vitest run packages/floorplan/src packages/rules packages/cli
--maxWorkers=2 --minWorkers=1`: Test Files 191 passed (191), Tests 4333 passed | 2 skipped
(4335); none failed, on timing or otherwise. The scoreboard and the full suite were not run for
this merge.

## After merging main (bd2f6a7, WRT-6 and HND-2)

Main had gained WRT-6 (marks on what was given or assumed, and `grid_areas`' `sureness`, an area
from scanned walls given as ± m² and %) and HND-2 (IFC spaces with a number, a use, an area and
base quantities, numbered by `roomNumbers`, which the room schedule reads too). The merge commit
resolves five conflicted files, keeping both sides in each; the changes beyond them are in the
follow-up commit.

- `docs/result-contract.md`: both changelog sections, CNT-8's on top, then WRT-6's. The code rows
  of both merged cleanly.
- `packages/cli/src/describe/facts.ts`: a floor's area counts no zone (CNT-8), and its wall
  height is WRT-6's `usualHeight` (stated heights first).
- `packages/cli/src/mcp/readTools.ts`: a room's line in `grid_areas`' text has WRT-6's band, then
  "outside", CNT-8's zone note and SHT-11's stair note.
- `packages/cli/src/quantities/areas.ts`: `RoomArea` has both `zoneOf` and `sureness`.
- `packages/cli/src/quantities/schedule.ts`: rows take HND-2's numbers from `roomNumbers`, list no
  zone as a row, and keep CNT-8's `zones` under their room; a floor counts its rooms only.

Changed beyond the marked conflicts, so a zone is counted once in both:

- `packages/cli/src/quantities/areas.ts`: the plan's `sureness` added up every room not outside,
  zones among them, so a scanned studio with zones had a wider band than without. It now adds up
  the rooms the net counts (`inTotals`: no outside room, no zone, no stair room counted with the
  one below), as the floor's band already did. That also leaves out SHT-11's stair room over
  the stair below, which main's sum counted twice too.
- `packages/floorplan/src/geometry/roomNumbers.ts`: a zone gets no number. Before, it was numbered
  with the rooms, so the IFC's space numbers and the schedule's row numbers skipped numbers and
  moved for every room after a zone. Zones are found per floor (`roomZones` on the floor's own
  index, as the IFC finds them), and only on a plan with a room that states `partOf`. The IFC
  already wrote no space for a zone, so it writes one space, the room's.
- `docs/result-contract.md`: CNT-8's changelog section gains a paragraph on zones with WRT-6
  and HND-2.
- New tests: "zones in HND-2's IFC spaces and room numbers (CNT-8)" in
  `packages/floorplan/src/geometry/__tests__/zones.test.ts` (the lab's studio with zones gives
  the same `roomNumbers`, and the same IFC spaces, field by field with every property and
  quantity, as the studio drawn as one room) and
  `packages/cli/src/quantities/__tests__/zones.test.ts` (the studio's walls and dividing lines
  marked scanned: the same `sureness` on each room, the floor and the plan, the same net, and
  the same schedule numbers). Each fails without its change.

For the owner: a zone keeps a band of its own in `grid_areas` (from the walls and dividing lines
round it), shown on its line, and added into no total. A zone can be marked assumed like any
part, and is listed to confirm.
