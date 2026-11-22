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
