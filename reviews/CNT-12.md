# CNT-12: an items list, built for fixtures

What changed, what the owner should check, and every snapshot, golden file or expected figure
that moved.

## Scope: fixtures only, on CNT-11's decision

CNT-12's card asks for furniture, fixtures, racks, counters, stages, point markers and seats.
CNT-11's decision, recorded on its card, is "fixtures now (toilet, basin, shower, bath, kitchen
run), because the checks need them; furniture later". The coordinator said to build only what
that allows, so this step holds exactly those five kinds. The shape (kind, place, turn, size,
height, label, floor) is the one CNT-11 asked for and is the same shape furniture, points and
seats will use later; only `ITEM_KINDS` and the symbols grow.

How each `done_when` reads under that decision:

| Done when | What was built | Where it is held |
|---|---|---|
| A table drawn as an item adds 0 m² and 0 notes | A fixture adds 0 m² and 0 notes. A table (a kind not held yet) adds 0 m² and is left out with **one** line, `item/unknown-kind`, so the agent learns why it is not drawn. | `floorplan/.../__tests__/items.test.ts` "adds 0 m² and 0 notes", "leaves a table out with one note"; `cli/.../mcp/__tests__/fixtures.test.ts` "adds 0 m² and one note for a table" |
| S-18's four answers | Count by kind (`grid_schedule`, types `fixture`); free floor per room (`grid_areas`); a fixture taller than its room or running into a wall (`grid check`: `item/too-tall`, `item/into-wall`); the gap between two items (`grid_measure what=between` takes fixture ids, edge to edge). **Seats are not built**: seats are furniture, and so are seated tables; the gap answer works between any two items, so it answers "between seated tables" once tables are held. | `cli/.../mcp/__tests__/fixtures.test.ts` |
| Items exported as furnishing, never as walls (IFC test) | Each fixture is an `IfcFurnishingElement` on its storey (`ObjectType` its kind, `Tag` its id), extruded to its height from its room's floor; wall, space and slab counts do not change. | `items.test.ts` "the IFC" |

Also not built, and why:

- **A room's number of people** (the card's "Each room can also state how many people it
  holds"). It is a field on rooms, not an item; MSG-4 is changing the schema in parallel and the
  brief said to keep to the items part. Worth its own small step.
- **Point markers** (hydrant, riser, camera, power point) and **markers outside the building**:
  not in CNT-11's list. A fixture outside every room is allowed and only worth a look
  (`item/outside-rooms`).
- **Fixtures in 3D, OBJ and GLB**: not drawn yet. The 2D drawing, the sheet's plans, the DXF and
  the IFC hold them. `sheet/coverage.ts` places `items` as `drawn` (by `drawPlan`) and says the
  3D still does not show them.
- **Writing fixtures from rooms text or with an edit tool**: an agent writes `items` in the plan
  file. `grid write` keeps the key as it is (it writes over walls, rooms and openings only).
- **An open library of kinds** (the card's "how"): there are five kinds and Grid's own symbols;
  no outside library was used, so no licence question arises.

## Decisions the owner should check

1. **An unknown kind is a note, not a refusal.** `kind` is read as any id-like text, and a kind
   the plan does not hold is `item/unknown-kind` (left out), so a table in an agent's plan does
   not refuse the whole plan. The other choice, an enum in the schema, would refuse it with
   `plan/unknown-word`.
2. **Every size is the author's.** `size` and `height` are required; Grid gives a fixture no
   default size (the card: never a made-up figure). `turn` is optional (0).
3. **Where a fixture is.** `at` is the middle of its footprint; unturned its back faces -Y (down
   the drawing) and its front +Y; `turn` is degrees counter-clockwise. The room it is in is the
   smallest room on its floor whose floor holds its middle (C6 in `types/floorplan.ts`).
4. **The symbols are Grid's own**, drawn inside the stated footprint in proportions of it: a
   toilet's cistern and oval pan, a basin's bowl and tap, a shower tray's diagonals and waste, a
   bath's rounded tub and waste, a kitchen run's outline. No figure in them says how big a
   fixture should be.
5. **Two new tolerances** (Grid's own, in the table and the README): `itemIntoWall` 0.005 m (how
   far a fixture may reach into a wall's body and still stand against its face) and
   `itemAboveRoom` 0.001 m.
6. **`item/too-tall` compares with the room's height**: as the room states, else its floor's
   stated height, else its lowest solid wall. A fixture in no room is compared with its floor's
   stated height only.
7. **`grid_measure what=fit` now keeps clear of the room's fixtures** (they are passed as holes
   to the same fitting), and says which. The other measures still take no fixture off, and
   `EMPTY_ROOM_RULE` now says "the fixtures the plan holds … are not taken off" instead of
   "fixtures … are not in the plan".
8. **`grid_mirror` mirrors fixtures** with the walls: left to right turns a fixture to minus its
   turn, top to bottom to 180° less it. Without this a mirrored plan would leave every fixture
   in the wrong room.
9. **The DXF gets a `GRID-FIXTURES` layer only when the drawing has fixtures**, so a plan without
   any writes the same file as before.
10. **Room labels keep off fixtures** in the 2D drawing, as they keep off walls.

## New message codes

All have their entry in `packages/rules/src/result/catalogue.ts`, a row in
`docs/result-contract.md`'s code table and a changelog entry there. A line about a fixture has
`thing.kind` `item` (a new kind of thing, so `resultVersion` stays 1) and names it by its kind:
`Toilet "wc"`.

| Code | Kind of line |
|---|---|
| `item/too-large`, `item/no-size`, `item/unknown-kind`, `item/duplicate-id`, `item/unknown-floor` | left out |
| `item/outside-rooms`, `item/into-wall`, `item/too-tall` | worth a look |

The catalogue's test that reads code literals from the geometry, and the contract's test, now
look for `item/…` codes too.

## Snapshots, golden files and expected figures

No snapshot, golden file or stored figure changed. Every existing output for a plan without
`items` is byte-for-byte as before: the IFC writes fixtures after everything else, in their own
containment relation; the DXF lists its new layer only when there are fixtures; the 2D picture
draws nothing new; the area, schedule, describe and check answers add their fixture parts only
when the plan has fixtures. The scoreboard's counts did not move (its plans hold no items).

Text that changed for every plan:

- `EMPTY_ROOM_RULE` (the rule line `grid_measure` prints): "…: the fixtures the plan holds,
  furniture, radiators, door leaves and the space a person needs round them are not taken off."
- The descriptions of `grid_schedule` and `grid_measure`, and the `types`, `from` and `to`
  arguments, name fixtures.

## Files

- `packages/floorplan/src/types/floorplan.ts`: `ItemSchema`, `ITEM_KINDS`, `items`, C6.
- `packages/floorplan/src/geometry/items.ts`: footprints, symbols, rooms, floor taken, checks.
- `validate.ts`, `floorplan.ts` (`PlanDrawing.items`), `floors.ts` (slice), `order.ts`,
  `tolerances.ts`, `export/ifc.ts`, `export/dxf.ts`.
- `packages/viewer/src/picture/scene.ts`, `look.ts`, `canvas2d/plan.css`.
- `packages/rules/src/result/`: `types.ts`, `inspect.ts`, `catalogue.ts`; `docs/result-contract.md`.
- `packages/cli/src/quantities/fixtures.ts` (new), `areas.ts`, `measure.ts`; `mcp/readTools.ts`,
  `mcp/toolkit.ts`; `edit/edits.ts`; `command/describe.ts`, `check.ts`, `planText.ts`;
  `sheet/coverage.ts`.
- Tests: `floorplan/.../__tests__/items.test.ts`, `viewer/.../picture/__tests__/fixtures.test.ts`,
  `cli/.../mcp/__tests__/fixtures.test.ts`, one line in `look.test.ts`.

## Checks run (after merging main at 5db4bc6)

- `npm run build`, `npm run typecheck`, `npm run lint`: pass.
- `npm run check:licenses`: 363 licences, none GPL, LGPL, AGPL, MPL or EPL.
- `npx vitest run --exclude '.claude/**'`: 4213 of 4214 pass. The one failure was the timing
  guard in `geometry/__tests__/diff-size.test.ts` (19 s against a one-second limit, load
  average about 215). Rerun alone it passes, all 4 tests.
- `npm run scoreboard`: "Same as the stored figures."
