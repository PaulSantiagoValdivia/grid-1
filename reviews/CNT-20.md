# CNT-20 review: a library of fixtures, furniture and typical rooms, and one registry of kinds

Branch `claude/cnt-20-8583d6`, cut from main at ce236f72. Convention C30 (the plan's `library`,
an item's `library`, `clearance` and `fromLibrary`). The page is [docs/library.md](../docs/library.md).

## What changed

- **The kinds registry** (`packages/floorplan/src/geometry/itemKinds.ts`). Every kind of item is
  one entry: its group (`fixture`, which takes free floor, or `furniture`, which takes none), its
  English word, what an agent is told of it (`about`, a key of the message files for Grid's own),
  its plain symbol drawn with a pen in shares of the footprint, and optional checks of its own.
  `registerItemKind` adds one from outside and returns the call that takes it out. The drawing
  (`buildFloorPlan`), the DXF, the IFC, the fixture counts and schedule, the free floor, the use
  indicators' obstacles, `grid describe` and the drawing's check all read a kind through it. The
  symbols CNT-12 had in a `switch` in `items.ts` moved into the entries unchanged.
- **Furniture kinds**: `bed`, `table`, `chair`, `sofa`, `storage` (`FURNITURE_KINDS`), each with a
  plain symbol and its words in `en.ts` and `es.ts`. `ITEM_KINDS` is now fixtures then furniture;
  `FIXTURE_KINDS` is CNT-12's five. Furniture takes no free floor (`takesFloor`).
- **The library** (`packages/floorplan/src/library/`): `builtIn.ts` holds 24 named sizes and four
  typical rooms (bathroom, cloakroom, double and single bedroom), every size Grid's own and saying
  "Grid's own size, not a code figure"; `index.ts` looks a name up in the plan's own `library`,
  then an office's files, then Grid's, and places an item or a typical room by name (a typical
  room set out from its inside back-left corner and turned about it). An office entry placed is
  copied into the plan's `library`.
- **The schema** (C30): an item may name `library` and leave out `kind`, `size`, `height`,
  `clearance` and `label`; `withLibrary` fills them on the file as read (in `FloorPlanSchema` and
  in `readPlanParts`, after `withTypes`), the item's `fromLibrary` records what was filled, and
  `statedItem` writes it back without them (used by `readingAfter`). An item may state
  `clearance`. The plan holds `library` (a list of entries). `fromLibrary` is a reading-only field
  (`READING_ONLY` in `reading.ts`).
- **Checks** (`items.ts`), all worth a look: `item/unknown-library`, `item/overlap` (an item
  standing in another past the new `itemOverlap` tolerance, 5 mm) and `item/clearance-blocked` (a
  wall past `itemIntoWall`, or an item past `itemOverlap`, in the clear floor an item keeps in
  front). A registered kind's own findings come after, worded in its own words through the key
  `issue.item/kind-check`.
- **The DXF**: each fixture and piece of furniture is a block (`GRID-<ENTRY or KIND>-<w>x<d>`, in
  millimetres), one per entry or kind, size and symbol, drawn in the item's own frame on layer 0
  and inserted at its middle on the fixtures layer, turned as the plan turns it. `PlanItem`
  carries `at`, `turn`, `size`, `library` and `block` (its symbol unturned about its middle) for
  that. Doors, windows and openings were already blocks (HND-1, CNT-14).
- **The CLI**: `src/library/office.ts` reads the `library` folder beside the plan through the
  project file gate; `src/edit/place.ts` makes the patch (new `Patch.addItems` and
  `Patch.addLibrary` in `edits.ts`); `grid_place_item` (in `editTools.ts`, after
  `grid_square_scan`; 33 tools) and the verb `grid edit place`; `grid_measure what=library` and
  `what=fit name=…` (`src/library/answer.ts`). The fixture schedule's rows carry `group` and
  `library`; `grid describe` says "Furniture: …" apart from the fixtures; the sheet's coverage
  places `library` as not shown.
- **Docs**: `docs/library.md` (new, with its README row), the fixtures section of
  `docs/plan-file.md`, `docs/commands.md`, `docs/tool-server.md`, `docs/tolerances.md`
  (`itemOverlap`), AGENTS.md's layout, and `changes/CNT-20.md` with the three new code rows.

## The done-when items, each with its test

1. *A library item placed by name draws and measures; the DXF writes each door and fixture as a
   block.* `packages/floorplan/src/library/__tests__/library.test.ts` (an item by name reads its
   entry's size, writes back as stated, and draws; the checks see it),
   `packages/cli/src/mcp/__tests__/library.test.ts` (placed by name through the tool server: the
   answer says it fits or not, `grid_describe` counts it, `grid_measure what=fit name=double-bed`
   tries 1.40 × 2.60 m every time, the DXF has `GRID-OUR-BED-1500x2000`), and
   `geometry/__tests__/itemKinds.test.ts` "the DXF" (every door and every fixture is a block
   insert; two equal WCs share one block; an insert is turned as the item).
2. *Adding a new kind through the registry changes one place in the code.*
   `itemKinds.test.ts` "takes a new kind in one call, and it reaches the drawing, the DXF, the IFC
   and the checks": a dummy `piano` kind, registered in one call, is drawn with its symbol and
   word in its room, is a DXF block and an `IfcFurnishingElement` of its kind, gives its own
   check's line in its own words, gets Grid's `item/into-wall`, and as furniture takes no free
   floor; before registering, it is `item/unknown-kind` and drawn nowhere.

## Expectations changed

- `geometry/__tests__/items.test.ts`: "leaves a table out with one note" now uses a `piano` (a
  table is furniture now) and expects the note to name `"bed"` among the kinds, not the word
  "furniture"; the IFC test's left-out kind is a piano too. One cast removed (`itemSymbol` takes
  any item and returns null for a kind Grid does not hold).
- `geometry/__tests__/useIndicators.test.ts`: the item left out is a piano, not a table; a
  `sofa` named in a sentence is `sofa "x"` now, so the "item" fallback is tested with a piano.
- `viewer/src/picture/__tests__/fixtures.test.ts`: the left-out item is a piano.
- `cli/src/mcp/__tests__/fixtures.test.ts`: `fixtureCounts` lists every kind the registry holds
  (the five furniture kinds at 0 too); the left-out item is a piano.
- `rules/src/result/__tests__/result.test.ts`: the plan's known fields include `library`.
- `cli/src/mcp/__tests__/tools.test.ts`: the order gains `grid_place_item` after
  `grid_square_scan`, the cap is 33 (with its line), the call list and the unknown-floor case
  have its arguments. `server.test.ts`: 33 tools. `everyPath.e2e.test.ts`: its two path slots.
- `cli/src/__tests__/ownWords.test.ts`: the new files' English sentences by kind, and the ratchet
  from 1541 to 1573 (32 of the kinds left to move: the place receipts, the library answer, the
  office folder's problems, the library's refusals, the schema's library mark and describe's
  furniture heading).
- `cli/src/command/__tests__/grid.e2e.test.ts`: the bundle cap from 700 kB to 750 kB (711,450
  bytes; no new dependency).
- `docs/result-contract.md`: the `item/unknown-kind` row's "needed" now names the furniture
  kinds and the registry, as its wording in `en.ts` does.

## For the owner

- **Furniture now, against CNT-11's "fixtures now, furniture later".** The card's own answer is
  "a double bed and two side tables", and you said build CNT-20, so beds, tables, chairs, sofas
  and storage are kinds. Furniture takes no free floor (it can be moved), but is an obstacle for
  the use indicators and the routes, as a fixture is. Reversible: drop `FURNITURE_KINDS`.
- **Every built-in size is Grid's own**, read from no document, and says "Grid's own size, not a
  code figure". I wrote them as plain common sizes (a 1.40 × 2.00 m double bed, a 1.70 × 0.70 m
  bath) and the clear floor in front of each (0.6 m for most, 0.7 m for a bath, 1.2 m in front of
  a kitchen run). Please look them over; a test freezes them, since a released name never changes
  size.
- **The office library lives in a `library` folder beside the plan, inside the project**, as
  every file Grid reads must be. An office copies or checks out its library into each project.
  A folder shared across projects would need a way through the project file gate: your call.
- **An office entry placed is copied into the plan** (like a CAD drawing keeping its blocks), so
  a plan does not change when the office's file does. Grid's own entries are not copied; their
  sizes are frozen instead.
- **Clearance is the front only**, a box as wide as the item. Side clearance (beside a bath or a
  bed) is not modelled; `grid_measure what=use` still measures the floor beside each fixture.
- **Furniture goes on the DXF's fixtures layer**, not a layer of its own, so a firm's DXF profile
  needs no new category. A `furniture` category would be a small follow-up.
- **The IFC writes every kind as `IfcFurnishingElement`**, its kind as its type. I left an IFC
  class out of the registry, since another class needs other attributes.
- **A registered kind's own codes are not in the catalogue**: their lines are worded in the kind's
  own words. Grid's own new codes are in the catalogue and the contract.
- **Placing does not check the fit before writing**: it writes and says what is worth a look, as
  the other edits do with notes. It refuses only a name no library holds.
- **Convention C30** is used (the plan's `library`, an item's `library`, `clearance`, `fromLibrary`).

## Checks run

See the session's report for the final results after merging main.
