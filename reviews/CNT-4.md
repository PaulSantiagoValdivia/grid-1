# CNT-4 review: a flat inside a building

For the owner. What CNT-4 adds, how each done-when item is met, every expectation that changed,
the choices made without you, and the checks run. Lab findings: EL-1 (the four-flat floor gives
one total of 419.48 m²; the split into flats came only from room-name prefixes and a lab script),
WR-6 and CP3-6 (a flat type placed many times), AR-7 (the unit mix), AC-16 (a cost script needed
the same stand-in grouping).

## What CNT-4 adds

**Flats and flat types in the plan file** (C17, `packages/floorplan/src/types/floorplan.ts`). Two
optional top-level lists, never defaulted (version 1), as the format's change rule asks:
`flatTypes` (each `id`, `name`) and `flats` (each `id`, `name`, `type`, `rooms` by id, at least
one, on any floors, and `mirrored`). C14 is CNT-17's, C15 HND-11's (taped lengths) and C16 CNT-10's (phases), all merged from main while CNT-4 was built, so this is C17. Both are placed in
`packages/cli/src/sheet/coverage.ts`: `flats` drawn and tabled, `flatTypes` tabled (a new
`Coverage` variant). The command's text limits (`src/command/planText.ts`) hold their ids, names
and room lists; MSG-4 names a misspelt field inside a flat with the one meant; a flat that cannot
be read leaves the list out with `plan/value-left-out` (MSG-6).

**One reading of the list** (`packages/floorplan/src/geometry/flats.ts`, pure). `planFlats` is
the only place the list is resolved: the first flat with an id wins, a room another flat lists
first stays there, ids that are no room are set aside, and a floor's slice reads the whole plan,
so a duplex keeps its other floor. Every consumer reads it from there.

**Checks** (`flatIssues`, run by `validatePlan` on the whole plan only), each worth a look, with
its entry in `packages/rules/src/result/catalogue.ts` and a row in `docs/result-contract.md`:
`flat/unknown-room` (with the room most likely meant), `flat/room-in-two`, `flat/unknown-type`
(with the type most likely meant), `flat/duplicate-id`, `flat/duplicate-type` and
`flat/zone-without-room`. A new kind of thing, `flat`, in the record (`ThingKind`), the picture's
fault marks and the seen-notes marks.

**Flat types, placements and mirror, and the mix, as one step.** In rooms text a unit can be a
flat type: `unit one flat "One bedroom" "Flat {n}"` (`packages/floorplan/src/rooms/compile.ts`).
Every placement of it by WRT-4's `place` or `repeat`, mirrored or not, writes a flat of that type
with the label as its id, the rooms placed as its rooms and `mirrored` when it is placed mirrored
one way; a floor copied from it has its flats too. `grid write` writes the types and flats a text
places over the file's, and keeps the file's when the text places none (and says so). The mix
is `flatSchedule` in `packages/cli/src/quantities/schedule.ts`.

**The consumers:**
- *ARE-9's areas.* `planAreaFigures` gives `flats` (each flat's net, `byFloor` for a duplex, the
  rooms counted and those not, with why) and `notInFlats`, the common parts; `FLAT_AREA_RULE`
  says what a flat's area measures. The CLI's `quantities/areas.ts` adds each flat's state.
  `grid_areas` gives them in `data.flats` and `data.notInFlats`, as text lines and CSV rows, only
  on a plan that lists flats.
- *ARE-12's schedules.* `grid_schedule of=flats` (an `of` value on the existing tool, so the tool
  count and order are unchanged): each flat with type, mirrored, floors, rooms, bedrooms and area,
  then the totals and the mix by type (flats, mirrored, share, area, area each). The room schedule
  gains `flat` on each row, a phrase in the text and a `flat` CSV column, on such a plan only. The
  check set ends with a "Flat schedule" page from the same rows.
- *SHT-11's flat outline.* `buildFloorPlan` gives `flats`, each flat's outline on that floor
  (`flatOutlines`: its rooms grown to the middle of the walls round them, joined), and
  `planScene` draws it as a chain line in the paper's colour over the walls, under the openings.
- *HND-2's IFC.* `writeZones`: an `IfcZone` per flat (Name the flat's name, ObjectType its type's)
  with one `IfcRelAssignsToGroup` of its spaces on every storey it is on, and a `Grid_Flat`
  property set (id, type, type name, mirrored, net area with its measure and rule). Written after
  everything else, so a plan with no flats writes the same bytes as before; the goldens did not
  change. `inIdOrder` now orders flat types and flats too.
- `grid describe` no longer says "which rooms make each flat" is something the plan cannot say,
  on a plan that lists them.

**Docs.** `docs/plan-file.md` ("Flats and flat types", its codes, the text limits), `docs/areas.md`
(a flat's area, the flat schedule), `docs/rooms-first.md` (a unit as a flat type),
`docs/tool-server.md` (the `grid_areas` and `grid_schedule` rows), the agents' changelog and code
table in `docs/result-contract.md`, and a line under "Unreleased" in `CHANGELOG.md`. No README
section and no tolerance was added; the outline reuses `wallContact`, `nearlyParallel`, `joint`,
`noLength` and `sameFace`.

## The done-when items, each with its test

1. **On the four-flat floor, the areas per flat (68.27 and 99.23 m²) come from the units list, not
   from name prefixes (EL-1).** The floor is in the repo already: `packages/floorplan/fixtures/
   rooms/four-flats.plan.json` (the lab's original) and `four-flats.rooms`, so nothing was copied
   from the lab. No code in the repo grouped by name prefix: the split was the lab's own script.
   `four-flats.rooms` now writes its two units as flat types, so the list comes from the rooms text.
   - `packages/floorplan/src/geometry/__tests__/flats.test.ts`, "gives 68.27 m² for flats A and B
     and 99.23 m² for C and D, from the flats rooms text writes": A 68.27, B 68.27 (mirrored),
     C 99.23, D 99.23 (mirrored); 84.49 m² in no flat; flats plus common parts equal the net
     (419.48 m²). The unrounded figures are 68.2671 and 99.2313, the same as grouping the lab's
     file by id prefix.
   - Same file, "reads the flats from the list, never from the names": the lab's own file, whose
     22 flat rooms are all named "Flat A …" to "Flat D …", gives no flat until it lists them; with
     the list it gives the same figures, and the same again with every room renamed "Room n"; moving
     one room from C's list to A's moves its area.
   - `packages/cli/src/mcp/__tests__/flats.test.ts`, "gives the four-flat floor's areas per flat
     from the list grid_write_rooms wrote": the same through the tool server, text and CSV.
2. **A flat type placed four times, two of them mirrored, gives a mix table by type, and a duplex
   accepts rooms on two floors.**
   - `flats.test.ts` (floorplan), "writes four flats of the one type, two of them mirrored": one
     unit, `repeat … 2 east as A` and `repeat … 2 east as B … mirror east-west`, writes A1, A2, B1,
     B2 of type `one`, B1 and B2 `mirrored`, each 32 m², the mirrored ones with the bedroom on the
     other side.
   - `flats.test.ts` (cli), "gives a mix by type for one flat type placed four times, two of them
     mirrored": `grid_schedule of=flats` gives one mix row, `{ type: one, flats: 4, mirrored: 2,
     share: 1, area: 128, each: 32 }`, the text line and the CSV row. The four-flat floor gives
     two rows, `flat1` 2 (1 mirrored) and `flat2` 2 (1 mirrored).
   - Duplex: floorplan `flats.test.ts`, "holds rooms on both floors, measured floor by floor and in
     all, with no fault" and "is drawn on each of its floors…" (`duplexHouse` in
     `test-support/plans.ts`); cli `flats.test.ts`, "takes a duplex as one flat on two floors";
     the IFC structure test checks its zone groups spaces on two storeys.

The IFC structure test (`packages/floorplan/src/geometry/export/__tests__/ifc.structure.test.ts`)
now reads the four-flat floor written from rooms text and the duplex, allows `IFCZONE` and
`IFCRELASSIGNSTOGROUP`, and checks that each flat is one zone grouping exactly its rooms' spaces,
with its name, `Grid_Flat` area equal to the areas' figure, and as many storeys as floors.

## Expectations changed

- `ifc.structure.test.ts`, "…writes no zone: the plan holds no flats" now reads "the plan lists no
  flats (CNT-4)" and also expects no `IFCRELASSIGNSTOGROUP`; a new test beside it writes a zone
  once the same flat lists its rooms, and checks every line before the zone is unchanged. Section
  3 and 9 of `checkFile` and the totals now include zones.
- `packages/rules/src/result/__tests__/result.test.ts`, MSG-4's list of the plan's fields: now
  `… views, accessible, flatTypes, flats, display, written`. Its source-code scan and
  `contract.test.ts`'s code-table scan now read `flat/` codes too.
- `packages/floorplan/fixtures/rooms/four-flats.rooms`: its two `unit` lines are flat types. The
  plan it writes is the same in walls, rooms and openings (`buildings.test.ts` unchanged), plus the
  flat types and flats.
- `scoreboard/current.json`: see "Checks run".

## For the owner

1. **There is no shared grouping mechanism on main.** The brief says to build the units list "on
   the shared grouping mechanism"; that is CNT-2 (named groups with a kind and members), which is
   not built: CNT-8's zones are a `partOf` on rooms, CNT-9's facts are per part. So flats are their
   own list, shaped as a named group (id, name, kind by its list, members in `rooms`), and read in
   one place (`planFlats`). When CNT-2 lands, `flats` can become groups of kind `flat`, with
   `planFlats` the only reader to change.
2. **The list is `flats`, not `units`.** `units` is already the plan's length unit (`"m"`). The
   alternatives were `dwellings` or `homes`; `flats` matches the lab's word and the scoreboard's
   `flats` capability probe.
3. **A flat type holds no geometry.** As WRT-4 decided for repeats, the type is defined once and
   placed many times in rooms text (a unit), and the plan file holds every room written out, with
   each flat's type and `mirrored`. A plan-file type that holds rooms and is expanded per
   placement, like LVL-8's patterns, is the other way; it would let "change the type once" reach
   every placement in the file, at the cost of a second expansion step every reader runs.
4. **The outline runs along the middle of the walls round the flat**, so two flats share one line,
   drawn as a chain line in the paper's colour over the walls (an ink line would vanish into a
   dark wall) and broken by doorways. It is a drawing line only: no area is measured to it, and no
   party-wall figure is given. A tint per flat, or an ink line on the inside faces, are the other
   ways. The outline is not labelled with the flat's name; the rooms' names are.
5. **Which flat a disputed room counts in.** A room two flats list counts in the flat whose id
   comes first (QAR-5's id order), so the file's order decides nothing and the IFC, which orders
   flats by id, agrees with the areas. Named by `flat/room-in-two`. Counting it in the flat listed
   first in the file is the other way.
6. **A duplex is written in the plan file.** Rooms text places a unit on one floor, so a flat type
   cannot span floors there; a `flat <id> rooms …` line for rooms text was not built.
7. **Grid's edits do not carry flats.** Merging, splitting or renaming a room leaves the flat
   naming the old id; `grid check` says so (`flat/unknown-room`, with the id most likely meant).
   Carrying them in the edit patch is a follow-up.
8. **The mix counts flats, mirrored flats, share and area by type.** Bedrooms are counted per flat
   (rooms used as a bedroom) and not in the mix, and targets such as "one-beds of about 50 m²"
   are left to the features that own them, as the brief says.
9. **A flat with an empty room list** is refused by the schema, so the reader leaves the whole
   `flats` list out with `plan/value-left-out`, as MSG-6 does for any value it cannot read.
10. **`mirrored` means mirrored one way.** A placement mirrored both east-west and north-south is a
    half turn, not a mirror image, so it is not marked mirrored.

## Checks run

On this branch at 0a3b32f (main at e486ccb plus CNT-4), on a laptop shared with other sessions
(load average about 300):

- `npm run build` (bundle 537,813 bytes, under the 600 kB cap), `npm run typecheck`,
  `npm run lint`: clean.
- The full suite, `timeout 1500 ./node_modules/.bin/vitest run --exclude '.claude/**'
  --maxWorkers=2 --minWorkers=1`, after the build. Under that load the 1500 s cap was reached
  before every file had run, twice, so the files not yet run were run again with the same flags,
  in turn: 155 files in the first run, 162 in the second and the last two (`fixtures-parse` and
  `scoreboard.test.ts`, 1,213 s on its own) in a third. In all, 319 of 319 files, 5,545 tests:
  5,540 passed, 4 skipped, 1 failed. The one failure was a timing test,
  `diff-size.test.ts` "diffs 1,000 entities … well inside a second" (1,088 ms under the load);
  rerun alone it passed (no flat is in that plan).
- `npm run scoreboard`: "Better than the stored figures": turns answered 19 to 21 (the `flats`
  capability, the developer's "the mix and net to gross" and "a schedule of accommodation"); the
  other counts the same (197, 278, 5, 20, 735, 95). Stored in `scoreboard/current.json` by hand
  (the two turn figures and the capability), the reason in `scoreboard/README.md`; the full
  suite's `scoreboard.test.ts` then passed on the stored figures.
- While building, only the touched files: the new tests, `rooms`, `tolerances.test.ts`, the
  exports, `rules/src/result`, the tool server's `tools` and `schedules`, `src/sheet`, and the
  viewer's picture and canvas tests.

After merging `main` at 90a933b (HND-11, COD-8): HND-11 took contract letter C15 (taped lengths),
so flats are **C16**. Conflicts, both sides kept: the contract header and the plan's fields in
`floorplan.ts` (`taped`, then `flatTypes` and `flats`), `CHANGELOG.md` and the agents' changelog
(CNT-4's entries on top), the text-limits table in `docs/plan-file.md`, the code-table scan in
`contract.test.ts` (now `firm` and `flat`) and MSG-4's list of the plan's fields in
`result.test.ts` (now `… accessible, taped, flatTypes, flats, display, written`). Build (550,601
bytes, under the cap), typecheck and lint clean. The affected tests rerun (the flats tests,
`tolerances`, `survey`, the exports, `packages/floorplan/src/types`, `rooms`, `rules/src/result`,
the tool server's `flats`, `tools`, `schedules`, `writeRooms` and `contract`, `src/sheet`,
`src/taped`, `src/firm`, `grid.e2e`, `everyPath.e2e`, `cli/src/__tests__`, and the viewer's
`flats` and `faults`): 60 files, 1,121 passed.
The scoreboard on the merged tree: "Same as the stored figures" (197, 278, 21, 5, 20, 735, 95).

After merging `main` at fbe5160 (WRT-7, CNT-10, VEW-9, VEW-4): CNT-10 took C16 (phases), so flats are **C17**; `grid_schedule` keeps WRT-7's units beside `of=flats`, facts keep `flatsListed` and `work`, MSG-4's list reads `… referenceImage, base, … taped, flatTypes, flats, display, written`; build (580,054 bytes, under the 600,000 cap), typecheck and lint clean; the affected tests (`cli/src/mcp` with the replay, `quantities`, `sheet`, `describe`, `edit`, `preview`, `command/__tests__`, `cli/src/__tests__`, floorplan `types`, `geometry/__tests__`, both export folders, `rooms`, `rules/src`, `viewer`): 290 files, 5,234 passed, 2 skipped; the scoreboard "Same as the stored figures".
