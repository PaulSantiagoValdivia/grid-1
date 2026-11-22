# CNT-9 review: facts of your own on walls, doors and rooms, and a way to ask across them

For the owner. Walls, doors, windows, doorless openings, rooms and floors can now carry facts of
the person's own (text, a number, or yes or no), and a room its number. The facts are kept
through every edit and `grid tidy`, listed in the schedules, and written into the IFC and the
DXF. Three short tools ask across them: `grid_fields`, `grid_find` and `grid_count`. Their
answers carry the `grid_view` arguments that pick the parts out or colour them by group.

**S-10 is not in the repository.** I looked again under `packages/floorplan/fixtures`, in
`scoreboard/data/*.json` and every gunzipped `.gz` there, and in `reviews/`: the only hits are
MS-10 and a wall id `ds10`. So `packages/floorplan/fixtures/facts-office.json` **stands in for
S-10**: a two-floor office with exactly 59 facts, 19 on its five rooms (a number, a department,
a finish each, and a head count on four), 11 on its four doors (fire ratings on three, a door set
and self-closing on each), 12 on its six windows, 14 on its eleven walls and 3 on its two floors.
Every test that says "59" reads this file (`packages/floorplan/src/test-support/facts.ts`). When
the lab's S-10 plan turns up, swap it in there.

## What changed

1. **The format** (`packages/floorplan/src/types/floorplan.ts`, convention C7, and the new
   `types/facts.ts`). `properties` on walls, openings, rooms and floors: an object of name to
   value, the value text (one line, at most 120 characters), a finite number, or true or false.
   A name is one line and not blank; two names on one part that differ only in capitals, spaces,
   dashes or underscores are refused (`factKey`, which every match uses). At most 100 per part
   (`PROPERTIES_MAX`, in both text-rule files). A room's `number` is text, at most 64 characters.
   Both are optional and never defaulted, so the file stays version 1 (see "For the owner").
   - The facts sit in their own object, so MSG-4's walker still names a misspelt field beside them
     and never a fact (`reading.ts` does not walk into a record).
   - `readParts.ts` leaves out one unreadable fact on its own (`plan/value-left-out` at
     `walls.0.properties.<name>`), and the part keeps its others.
   - `packages/cli/src/command/planText.ts` holds each name and text value to a name's limit, and
     the count to 100, before the schema, naming the place and never the text.
2. **The sheet's coverage** (`packages/cli/src/sheet/coverage.ts`). The new fields are not
   top-level parts, so `SHEET_COVERAGE` could not hold them. A second table, `FACT_COVERAGE`,
   `satisfies Record<FactField, Coverage>` over `FACT_FIELDS`; `coverage.test.ts` holds that list
   to the schemas. Rooms' and openings' facts and the room number are tabled; walls' and floors'
   facts are not shown, with why.
3. **Schedules** (`packages/cli/src/quantities/schedule.ts`, `grid_schedule`, the check sheet).
   Room rows gain `roomNumber` and `properties`; opening rows gain `properties`. On each floor the
   rooms that state a number come first, in its order (`compareIds`), and are shown by it; the rest
   follow by id with Grid's count, which `number` still holds. The CSVs add one column per fact
   name, first met first. The sheet's tables show the number and the facts.
4. **IFC** (`export/ifc.ts`). Each part with facts gets one `IfcPropertySet` named
   `Grid_Properties`, one `IfcPropertySingleValue` per fact (`IfcLabel`, `IfcInteger` for a whole
   number, `IfcReal`, `IfcBoolean`), related to its `IfcWallStandardCase`, `IfcDoor`, `IfcWindow`,
   `IfcOpeningElement` (doorless), `IfcSpace` or `IfcBuildingStorey` by an
   `IfcRelDefinesByProperties`. The sets are written after the stairs and before HND-6's left-out
   set, in the order the elements were written, which is id order; a plan with no facts writes
   the file it wrote before. A numbered room's space is named by the number, with its name as the
   long name, and the number is the first value of its set, as `room number`.
5. **DXF** (`export/dxf.ts`, `export/planExport.ts`). Each fact is one `TEXT` on a new layer,
   `GRID-FACTS`, worded `[id] name: value`: a room's under its label and area, a wall's and an
   opening's at its middle, a floor's above the drawing's upper left corner. The layer is listed
   only in a file that writes a fact.
6. **Edits keep them** (`packages/cli/src/edit/`, `grid tidy`, `grid write`). I went through each:
   - `edits.ts` (change, move or remove an opening, move a room's side, mirror), `stretch.ts`,
     `rename.ts`, `seat.ts`: they merge changes into the part as written, so its facts stay. No
     change needed; `facts.test.ts` holds change-opening and move-side to it.
   - `merge.ts` and `addRoom.ts` cut a wall into pieces with `cutWall`, which copies every field
     but the id and ends, so **both pieces keep the wall's facts**. Merging two rooms keeps the
     first room's facts and number, adds the second's facts the first does not carry, and says in
     `notKept` what the second said otherwise and which number is gone.
   - `split.ts`: **the new room keeps the room's facts, not its number**, and the answer says so.
   - `grid tidy` (`geometry/wallFaults.ts`): taking out a copy of a wall now carries the copy's
     facts onto the wall kept, where it has none of that name (`remove-wall` gains `factsTo`, only
     when the copy carries facts, so every other fix is the same edit list as before). Splitting a
     room along a wall across it gives the part the room's facts, not its number.
   - `grid write` and `grid_write_rooms` (`rooms/facts.ts`, `command/write.ts`): rooms text holds
     no facts, so writing a plan again keeps each part's facts and room number by id, says how many
     parts kept them, and names the parts that carried some and are no longer in the text.
     `rooms/read.ts` no longer counts facts as a difference, so a plan with facts still reads back
     rooms first instead of as raw lines.
7. **The three tools** (`packages/cli/src/quantities/query.ts`, `packages/cli/src/mcp/readTools.ts`),
   after `grid_schedule` in the fixed order:
   - `grid_fields`: Grid's 17 fields (id, kind, floor, name, number, use, area m², height, width,
     sill, length, thickness m, wall kind, virtual, wall, rooms, level) with units and kinds, and
     the facts the parts carry, with their type, kinds, count and values.
   - `grid_find`: `kind`, `floor`, `room`, `where` (conditions such as `fire rating is missing`,
     `department = Sales`, `width < 900 mm`), `fields`, `limit`. Gives `ids` and `rows` of the id
     and only the fields named.
   - `grid_count`: the same selection, `by` and `sum`. Gives each group's value, count, sums,
     missing and ids, largest first and "not stated" last, and the total.
   - Each answer has `view`, the `grid_view` arguments that show it. `grid_view` takes `highlight`
     (ids, one colour) and `colour` set to any field or fact (one colour per value, with a key).
     The viewer (`packages/viewer/src/picture/`) gained `show.paint` and `show.paintKey`, drawn
     over the part; it still computes no geometry.
8. **Docs and records.** `docs/plan-file.md` ("Facts of your own, and room numbers", and the
   limits table), `docs/tool-server.md` ("Asking across the parts: fields, find and count", the
   tool table), `docs/areas.md` (schedules), `CHANGELOG.md`, an entry at the top of the changelog
   for agents in `docs/result-contract.md`, the tool count and the facts module in `AGENTS.md`,
   and one line in the plugin skill (`distribution/listing.ts`). No new message code.

## Done when

1. **S-10's 59 facts survive reading and an edit, and appear in schedules, an IFC property set
   and the DXF.**
   - Reading: `packages/floorplan/src/types/__tests__/facts.test.ts`, "holds 59 facts…" and "is a
     sound plan…" (the schema, `readPlanParts` with no fault and `readingNotes` with no note).
   - An edit: `packages/cli/src/mcp/__tests__/facts.test.ts`, "keeps all 59 after a door is
     changed and a side is moved", and the split, merge and rooms-text tests beside it; tidy in
     `packages/floorplan/src/geometry/__tests__/tidyFacts.test.ts`.
   - Schedules: the same file, "the facts in the schedules" (23 opening facts, every room's).
   - IFC: `packages/floorplan/src/export/__tests__/facts.test.ts`, "writes every one of the 59
     facts as a single value in a Grid_Properties set", and byte-identical output for the same
     plan and for its lists reversed.
   - DXF: the same file, "writes every one of the 59 facts, one line each on GRID-FACTS, that
     reads back by id", and order independence.
2. **"Which doors have no fire rating" and "area per department" are each one call, returning ids
   and only the fields asked for.** `packages/cli/src/mcp/__tests__/facts.test.ts`: the first
   gives `ids: ["d-g2"]` and `rows: [{ id: "d-g2" }]`; the second gives three groups with their
   ids and their area, which equals the two Sales rooms' net areas from `grid_areas`.

## Gates

Run on a laptop shared with about ten other sessions (load average near 200), with
`--maxWorkers=2 --minWorkers=1`.

| Gate | Result |
| --- | --- |
| `npm run build` | passes; `packages/cli/dist/grid.mjs` is **501,829 bytes**, up from 475,398 on main |
| `npm run typecheck` | passes (every workspace, `scripts`, `scoreboard`) |
| `npm run lint` | passes |
| `npm run scoreboard` | passes, **same as the stored figures**: 197 rooms measured wrong, 278 damage silent, 16 turns answered, 5 mistakes named, 11 checks fed, 735 rooms not measured, 95 sound plans with a warning. Nothing to store |
| Full suite (`vitest run --exclude '.claude/**'`) | 243 files, 4,705 passed, 3 skipped, 2 failed, in 1,029 s. Both failures were tests that list a wall's known fields or stack every fixture (see "Tests"); each was fixed and passes when rerun on its own. No timing failure |

**The bundle cap.** Before the merge, CNT-9 took the built file to 501,829 bytes, past the 500 kB
cap of `grid.e2e.test.ts`, and the build raised the cap to 525 kB. Main's build now minifies and
splits the file into chunks, so after merging main `grid.mjs` is 386,069 bytes. The cap is back
at main's 500 kB, unchanged by CNT-9.

## Tests

- New: `packages/floorplan/src/types/__tests__/facts.test.ts` (8),
  `packages/floorplan/src/export/__tests__/facts.test.ts` (7),
  `packages/floorplan/src/geometry/__tests__/tidyFacts.test.ts` (3),
  `packages/cli/src/mcp/__tests__/facts.test.ts` (13), and one case in
  `packages/cli/src/sheet/__tests__/coverage.test.ts`.
- Changed:
  - `tools.test.ts`: the fixed order gains `grid_fields`, `grid_find` and `grid_count` after
    `grid_schedule`, they are read-only, each has a call in the every-tool schema test, and
    "keeps about a dozen tools" allows 24, up from 21, with a line saying why.
  - `server.test.ts`: `tools/list` over stdio gives 24 tools, not 21.
  - `everyPath.e2e.test.ts`: the three new tools' `plan` slots.
  - `reading.test.ts`, "thick on a wall is named…", and `packages/rules/src/result/__tests__/result.test.ts`,
    "names thick on a wall…": the fields a wall knows, listed in the note, now end with
    `properties`.
  - `areas.test.ts`, "ARE-9 per floor…": the test stacks each fixture on a copy of itself as a
    second floor; it now does so only for a fixture of one floor. The stand-in for S-10 has two
    floors already, and stacking it put its upper walls on the ground floor. The identity is
    still checked on it, as written.
- Removed: none.

## For the owner

1. **The version rule.** `docs/plan-file.md` has no section on how the format changes: CNT-1 is
   still not built (LVL-1's review says the same). As every step since, the new fields are
   optional and never defaulted, and the file stays version 1; a plan that states none reads,
   exports and checks as before. Whether they make a version 2 is yours when CNT-1 lands.
2. **An object, not a list.** `properties` is `{ "fire rating": "EI 30" }`, not a list of
   `{ name, value }` entries. It is what a person and an agent write most easily, one name cannot
   appear twice, and the IFC and DXF map it one to one. It leaves no place for a unit on a fact:
   the facts' unit is null in `grid_fields`, and a unit can be part of the name ("U-value W/m2K").
   A list with an optional `unit` is the alternative; switching later means reading both forms.
3. **Fact names match loosely.** Capitals, spaces, dashes and underscores do not count, in the
   format's one-name rule and in every question. Exact matching is the alternative.
4. **The room number** is `number` on the room, text. The schedule lists numbered rooms first on
   their floor, by number, then the rest by id with Grid's count. The IFC names the space by it.
5. **Split and merge.** Both halves of a cut wall keep its facts. A split room's new part keeps the
   room's facts but not its number. A merge keeps the first room's facts and number and adds the
   second's missing ones, naming the conflicts. `grid tidy` follows the same rules.
6. **Rooms text holds no facts.** They are carried by id when the text is written again. Writing
   them into rooms text itself is the alternative; it touches the language.
7. **The DXF form** is text on a layer, `[id] name: value`, chosen because a test reads it back
   and a CAD user sees it. XDATA would hide it from the drawing and needs an APPID table in R12.
8. **IFC names.** The set is `Grid_Properties` (`Pset_` names are the standard's). A whole number
   is `IfcInteger`, text `IfcLabel`.
9. **The tools' place in the order**: after `grid_schedule`, as `grid_fields`, `grid_find`,
   `grid_count`. 24 tools now.
10. **Conditions are one line of text** (`fire rating is missing`), not structured objects. The
    tool kit takes lists of strings only, and one line reads as the person said it. A part with
    no value meets only `is missing`, so `fire rating != EI 30` leaves out unrated doors.
11. **What `grid_count`'s view colours**: every room, wall, door and window of the floor drawn that
    carries the field, not only the parts counted. Colours are ten fixed ones
    (`GROUP_COLOURS` in `look.ts`); past ten values, the tenth stands for the rest.
12. **`grid draw` is unchanged**: its `--colour` still takes only `use`, and it has no
    `--highlight`. The picture code takes both, so they are a small step if wanted.
13. **Nothing checks a fact.** No message says a door or wall meets its fire rating, and no
    check reads one; the tools' rule line says so in every answer.
14. **The bundle cap stays at 500 kB.** With main's minified build the file is 386,069 bytes.
15. **The stand-in's name and place**: `packages/floorplan/fixtures/facts-office.json`, read
    through `@ongrid/floorplan/test-support/facts`, so every fixture-wide test reads it too.
16. **One room number, the plan's `number`, read through HND-2's `roomNumbers`** (decided when
    merging main at bd2f6a7; reversible). HND-2 added no field: it works a room's number out every
    time (`packages/floorplan/src/geometry/roomNumbers.ts`), for the schedule and the IFC alike.
    So the format keeps one field, CNT-9's `number`, and CNT-9's rule moved into the library:
    on each floor the rooms that state a number come first, by it, then the rest by id, and each
    `RoomNumber` carries `stated` beside Grid's count (`shownRoomNumber` gives the one shown).
    The schedule keeps one `number` column (the stated number, else Grid's count) and its row
    `roomNumber`; the IFC space's `Name`, `Pset_SpaceCommon.Reference` and `Grid_Space.Number`
    take the stated number (an `IfcLabel` in `Number`, where Grid's count is an `IfcInteger`).
    The alternatives: leave HND-2's numbers as Grid's count only and give the stated number in
    `Grid_Properties` alone, or make `Grid_Space.Number` always Grid's count; either is a few
    lines in `writeSpaceData`.

## Not done or not verified

- **S-10 itself.** The 59 facts are the stand-in's; the lab's S-10 was not found (see the top).
- **`grid draw`** does not take `--highlight` or `--colour <field>`; only the tool server's
  `grid_view` does.
- **The app's live view and `grid describe`** do not show facts; the sheet shows no wall or floor
  facts (`FACT_COVERAGE` says why).
- **Rooms text** cannot state a fact; facts are carried by id when it is written again.
- **One part with more than about 60 facts that cannot be read** is left out whole: the part
  reader's turn bound (64) counts each fact it leaves out as one turn. A part with 100 sound facts
  reads fine.
- **The IFC sets were not opened in a BIM tool**; they are checked by reading the STEP text back.
  The DXF text was not opened in a CAD tool either.
- **No scoreboard count measures facts**; none moved.

## After merging main

Main was merged at `ef88ec9` (ARE-13's estimate, MSG-3's label). Two doc conflicts, both kept
whole: the changelog for agents in `docs/result-contract.md` (CNT-9's entry first, then ARE-13's
and MSG-3's) and `docs/tool-server.md` (both new sections, ARE-13's `grid_takeoff` row and
CNT-9's `grid_schedule` row). MSG-3 now starts every CSV with the label, so the two schedule CSV
checks in `packages/cli/src/mcp/__tests__/facts.test.ts` read the header from the second row.

## After merging main at 25747b7

Main was merged again at `25747b7` (SHT-4, CNT-3, MSG-10, CNT-5, SHT-11, CNT-13). Thirteen files
conflicted; every one keeps both sides.

- **Tools: 25.** MSG-10's `grid_mark_seen` stays where main put it, after `grid_sheet` and before
  the tools that change the plan; CNT-9's three stay after `grid_schedule`. Main's 22 plus three
  is 25, in `tools.test.ts` (with a line saying why), `server.test.ts`, `AGENTS.md`,
  `docs/commands.md` and the agents' changelog. The tool lists in `tools.test.ts` and
  `everyPath.e2e.test.ts` had already merged with both sides.
- **The convention is now C8.** CNT-3 took C7 on main for north, front and site, so the facts of
  the person's own are C8 in `types/floorplan.ts` and `AGENTS.md`. The numbered list above still
  says C7, as it was written. The schema keeps CNT-5's `building` on a floor and `tenure` and
  `roomType` on a room beside CNT-9's `properties` and `number`; the known-field lists in the tests
  matched without a change.
- **`grid_view`**: `hide` takes SHT-11's `above`, and `colour` still takes a field or fact, with
  `highlight`. In the viewer the picture options, the key's entries and the scene keep SHT-11's
  floor above and dashed stair beside CNT-9's picked parts; the north arrow (CNT-3) is drawn after.
- **IFC**: both imports kept: the facts' sets and the room-number names beside CNT-3's `TrueNorth`
  and site.
- **Changelogs**: CNT-9's entry first, then main's in main's order.

## After merging main at b58930a

LVL-4 conflicted in three places, each kept whole: the changelog for agents (CNT-9 first, then LVL-4), the tool table in `docs/tool-server.md` (LVL-4's `grid_takeoff` row, CNT-9's `grid_schedule`, `grid_fields`, `grid_find` and `grid_count` rows) and the exports of `packages/floorplan/package.json` (both test-support entries).

## After merging main at bd2f6a7

Main was merged at `bd2f6a7` (WRT-6's `grid_square_scan` and marks, HND-2's IFC room data and
quantities). Twelve files conflicted; every one keeps both sides.

- **Tools: 26.** WRT-6's `grid_square_scan` stays where main put it, after `grid_rename_room`;
  CNT-9's three stay after `grid_schedule`. Main's 23 plus three is 26, in `tools.test.ts` (the
  ceiling, with a line saying why), `server.test.ts`, `AGENTS.md`, `docs/commands.md` and CNT-9's
  entry in the agents' changelog. `READ_ONLY` and `CHANGES_PLAN`, the every-tool call table and
  `everyPath.e2e.test.ts` list both sides' tools.
- **The convention is now C9.** WRT-6 took C8 on main for where a value came from (`marks`), so
  the facts of the person's own are C9 in `types/floorplan.ts` and `AGENTS.md`. The wall schema
  keeps WRT-6's `unstated` beside `properties`; rooms text's wall comparison skips both. The
  known-field lists in `reading.test.ts` and `result.test.ts` matched without a change
  (`unstated` is never a file's field).
- **Room numbers: one field.** HND-2 added none; it works numbers out in `roomNumbers`. That now
  holds CNT-9's rule and carries the stated number, and the schedule and the IFC read it (owner
  item 16). Two tests added: `roomNumbers.test.ts` (stated numbers first, by number) and
  `export/__tests__/facts.test.ts` (`Reference` and `Number` are `G.02`); the space-name test now
  allows HND-2's `ObjectType`.
- **IFC**: CNT-9's `Grid_Properties` sets sit beside HND-2's `Pset_SpaceCommon`, `Grid_Space`,
  base quantities, wall types and door and window styles: a wall's facts after its type, a
  doorless opening's facts on its void with its quantities, a door's or window's after its style,
  a space's after its data. The four goldens are main's, unchanged: their plans carry no facts or
  numbers, so CNT-9 writes nothing into them.
- **Viewer**: the scene draws WRT-6's assumed parts, then CNT-9's picked parts over them.
- **Changelogs**: CNT-9's entry first, then main's in main's order (WRT-6, HND-2 in `CHANGELOG.md`).
- **Docs**: `docs/commands.md` (what the IFC holds) and `docs/plan-file.md` (facts in the
  exports) say the stated number is the IFC's number.

- **Gates**: `npm run build` (the bundle is 439,305 bytes, under the 500 kB cap), `npm run
  typecheck` and `npm run lint` pass. The test run over `packages/cli/src`, `packages/floorplan/src`,
  `packages/viewer` and `packages/rules/src/result` found one failure, HND-2's structure check on
  the facts office, which read `Grid_Space.Number` as a whole number only; it now reads the stated
  number as text. After that fix the four affected files pass (67 tests), so the run stands at 237
  files, 4,584 passed and 2 skipped. The scoreboard was not run.
