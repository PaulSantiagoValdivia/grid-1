# CNT-6: a plan that is part of a larger building

Branch `claude/cnt-6-630723`. Convention C23 (given by the coordinator). Changelog fragment
`changes/CNT-6.md`. Docs: `docs/plan-file.md`, "Part of a larger building" (new section), "Inside
and outside walls" (one paragraph), and the gross external row of `docs/areas.md`.

## What changed

**Plan format (C23, `types/floorplan.ts`).** All optional and never defaulted; version 1.

- Wall `kind: "separating"`: a party wall, or a wall between a home and the common parts.
- Wall `beyond`: `outside`, `common` or `neighbour`, what lies past its side with no room drawn on
  it. It holds along every stretch with a room on one side only (MSG-13's stretches), so a wall
  can be a party wall for part of its length. A separating wall that states nothing beyond is read
  as one to a common part (`wallBeyond` in `exposure.ts`).
- Floor `above` (`outside`, `common`, `neighbour`) and `below` (`ground`, `outside`, `common`,
  `neighbour`).
- `buildings`: `{ id, name, floors }`, each floor in one building at most.
- `context`: `{ id, name, floor, points, height }`, shapes drawn round the plan, in no measure.

**Walls.** `WallExposure` gains `separating`. A one-sided stretch of a separating wall, or of one
that states a common part or a neighbour beyond, is `separating`; a wall stated separating is
`separating` as a whole unless it faces outside. Consequences, all through the one answer every
reader already used: not `IsExternal` in the IFC (DXF layer `walls-inside`), drawn with the
outer-wall fill and its own key entry ("Separating wall"), never an exit or an escape window
(`outsideTest`), and taken off the gross internal area as an outside wall is. The gross external
area takes off the half past its middle (`pastMiddle` in `areas.ts`); `walls` is reduced by the
same amount so net + walls + unclaimed still equals the gross external. The take-off lists
separating walls as their own kind; IFC wall types get "Separating wall".

**Routes (`rules/graph.ts`, `rules/check.ts`).**

- A door through a separating wall, or one with `beyond: "common"`, with nothing drawn behind it
  is a way on onto the common parts (`graph.common`): no `door_to_undrawn_space`, and the floor's
  notice is the new `way_out_through_common_parts` instead of `way_out_not_drawn` when every way on
  is onto the common parts (lab R-10).
- A door into a stated neighbour (`graph.intoNeighbour`), and any way through between rooms of two
  different flats (`graph.betweenHomes`), is never a route and is the new finding
  `door_between_homes` (lab EL-4). So a home that escapes through its neighbour gets
  `no_route_to_exit` for its rooms.
- Every flat needs a front door: new finding `flat_without_front_door` (rooms to a room in no flat,
  up or down a stair to one, onto the common parts, into a space not drawn, or out at ground level).
- A virtual wall with a room on one side only is an open edge (`graph.openEdges`), never a door
  (lab S-3). Stated `outside` or worked out as outside, it is an exit as before; `common` is a way
  on; `neighbour` leads nowhere; into floor no room claims it is a way on with no note (before it
  was `door_to_undrawn_space`).
- A floor that states `below` is at the ground or not by that statement alone (`groundLevel`). A
  door to the outside from one above the ground only by its statement is said without a height
  ("on a floor with more of the building below it").

**Envelope (lab AC-7).** A floor with `above` `common` or `neighbour` has no roof (`roof: null`,
`roofKnown: true`, `above` set); the take-off says why. One with `below` other than `ground`
stands on a `floor` slab, never a `base` slab. The 3D view, the section and the IFC read the same
envelope.

**Buildings (`geometry/buildings.ts`).** `planBuildings`, `buildingOfFloor`, `buildingIssues`
(`plan/building-unknown-floor`, `plan/building-floor-in-two`, `plan/building-duplicate-id`),
`contextOn`. `floorElevations` stacks each building's floors on their own (floors in no building
together, as before). `planAreaFigures().buildings` sums each building's own floors;
`buildingHeights` gives each one's height. `grid_areas` adds `buildings` (data and lines) only on
a plan that names them.

**Context.** `buildFloorPlan` gives the floor's context shapes (`context`, framed in the bounds);
the viewer draws them dashed under everything. Nothing else reads them, so neighbours drawn as
context add 0 m² (lab EL-17).

**Result record.** New codes `opening/between-homes`, `flat/no-front-door`,
`floor/not-checked-way-out-common-parts` and the three `plan/building-*` warnings, each worded in
`en.ts` and `es.ts` (Spanish a draft), with their rows in the fragment. New skip reason
`way_out_through_common_parts` in the rules' coverage.

## The three "done when"s

1. **EL-4**, a door cut through a separating wall between two flats is flagged:
   `largerBuilding.test.ts`, "says a door through the party wall between two flats": finding
   `door_between_homes`, and the door is in no route link. A home that escapes through its
   neighbour gets the finding, `flat_without_front_door` and `no_route_to_exit` for each room.
2. **R-10**, flats entered from a landing get no "leads to a space that is not drawn" note: two
   flats whose front doors are in separating walls give no finding, one notice
   `way_out_through_common_parts`, and no text containing the phrase.
3. **EL-17**, neighbours drawn for context add 0 m²: the house with its two neighbours as context
   shapes has the same net, gross internal and gross external area as the house alone; drawn as
   rooms (as the lab did) they add 152.88 m² of net in the test's 10 × 8 m houses.

## Tests whose expected value changed

- `packages/floorplan/src/types/__tests__/reading.test.ts`, `packages/rules/src/result/__tests__/result.test.ts`:
  the list of a wall's fields now holds `beyond`, and the plan's fields `buildings` and `context`.
  These lists are read from the schema.
- `packages/rules/src/result/__tests__/flats.test.ts`: `flatLines` leaves out
  `flat/no-front-door`, which is the route check's, not the list's. A new test there says why the
  fixture gets it: in `duplexHouse` the studio S1 (bedroom and bathroom) is entered only through the
  duplex D1's hall, so CNT-6 says S1 has no front door and names door `d_hb` as between homes. The
  fixture is unchanged.
- `packages/cli/src/mcp/__tests__/flats.test.ts`: the duplex's `grid_check` held no `flat/` line;
  it now holds `flat/no-front-door` for the studio (same reason) and still no fault of the list.
- `packages/cli/src/__tests__/ownWords.test.ts`: `coverage.ts` 27 to 28 (the buildings' "not
  shown" reason), and the ceiling on sentences left to move one higher for the context shape's
  outline refusal in the schema (merged with ARE-15's raise: 1511). Two other new sentences went
  into the message files instead (`read.building.floors`, `areas.buildings.heading`).

## Scoreboard

No count moves: 197, 277, 22, 5, 22, guards 735 and 95, the same as `current.json`. None of the
lab's plans states a separating wall, a `beyond`, buildings or context yet, so the routes and areas
read them as before.

## The checks run

After merging `main` (ARE-15, 0e99848d): the full suite (`vitest run --exclude '.claude/**'
--maxWorkers=4 --minWorkers=1`) 365 files, 6,051 passed, 4 skipped; `npm run typecheck` and
`npm run lint` clean; `npm run scoreboard` the same as the stored figures.

## For the owner

1. **Codes reuse rule ids.** `door_between_homes` belongs to `door-leads-somewhere` and
   `flat_without_front_door` to `room-reaches-exit`, so the rules list stays seven rules. A rule of
   its own ("homes kept apart") is an easy change if you want it.
2. **A separating wall with nothing beyond stated is read as one to a common part**, the one way a
   door through it is right. A door through a party wall to an undrawn neighbour therefore needs
   `beyond: "neighbour"` to be said.
3. **A door between two drawn rooms is "between homes" only by the flats list**, never by the wall's
   kind: a separating wall between a flat's hall and a drawn landing is the front door.
4. **A front door may be to the outside** (a ground-floor flat with its own street door), not only
   onto a common part as the card says. A door to the outside on a floor above the ground does not
   count.
5. **The building codes are `plan/building-*`**, not `building/*`: the contract test and the
   release step only know the existing kinds of thing, and the issue is about the plan's list.
6. **Separating walls are drawn with the outer-wall fill**, with their own key entry; a party-wall
   hatch would be a look change for SHT. The DXF puts them on `walls-inside`.
7. **Context shapes are drawn on the 2D plan only**, dashed, with no name written and not in 3D, the
   DXF or the IFC. Their `height` is kept for a later 3D block.
8. **Gross external to the middle** applies to every one-sided separating stretch, to a neighbour
   and to the common parts alike. At a wall's end the cut runs on to the face of the wall it meets,
   except where another wall carries straight on.
9. **Each building stacks from 0** on its own. A plan with buildings but no floor in any keeps
   stacking as before.
10. **Rooms text** reads `separating` as a wall kind already (it takes the schema's kinds); there is
    no rooms-text word for `beyond`, `above`, `below`, `buildings` or `context` yet.
11. **Shared files touched:** the `types/floorplan.ts` header (C23 only), `packages/rules/src/result/catalogue.ts`
    (new entries in their kinds' places, and `opening/door-out-above-ground` gets a variant),
    `packages/cli/src/mcp/readTools.ts` (grid_areas' output and lines only, no description, nothing
    of grid_schedule), and `packages/cli/src/sheet/coverage.ts` (two entries: buildings not shown,
    context drawn). No tool description changed.
