# CNT-5: what kind of building it is, and more room uses in the person's own words

What changed, how each done-when is held, every test whose expected value changed and why, what
moved on the scoreboard, and the choices that were yours.

## What changed

- **A plan may say what kind of building it is** (`building` on the plan), and **a floor may say
  otherwise for itself** (`floors[].building`): the shop on the ground floor of the lab's block
  of flats. Thirteen kinds, in Grid's own words (`BUILDING_TYPES` and `BUILDING_TYPE_TEXT` in
  `packages/floorplan/src/types/floorplan.ts`): `home`, `office`, `shop`, `food`, `hotel`,
  `school`, `health`, `sport`, `assembly`, `industry`, `warehouse`, `parking`, `other`. Unstated,
  a floor is the plan's kind; a plan that says nothing reads and checks as before.
  `floorBuilding(plan, floor)` in `geometry/floors.ts` gives a floor's kind.
- **Each figure check runs only in the kinds of building its figures were read for.** COD-2's
  `readFor` decides it: `READ_FOR_BUILDINGS` (`homes` covers `home`) in `checks/figures.ts`,
  `RULE_READ_FOR` and `RULE_BUILDINGS` in `checks/catalogue.ts`. On a floor the plan says is
  another kind, the room-size and escape checks look at no room: every room is skipped as
  `not_for_building` ("the figures were read for homes (houses and flats people live in), and
  the plan says this is an office"), and one `not-checked` line says so: about the plan
  (`plan/not-checked-sizes-for-building`, `plan/not-checked-escapes-for-building`) when the
  plan's own kind is the reason on every floor, or about each floor
  (`floor/not-checked-sizes-for-building`, `floor/not-checked-escapes-for-building`). Four new
  codes, each in the catalogue and the contract's code table; a new skip reason and notice
  reason. No code changes meaning, so `resultVersion` stays 1.
- **Each check says which uses and kinds of building it reads**: `coverage` gains `uses` and
  `buildings` on the two figure checks.
- **COD-2's sentences stay where no type is stated.** Where a floor says it is a home, a note
  that used a figure ends "and the plan says this is a home" instead (`readForSentence`).
  `needed` on the figure findings is unchanged.
- **27 room uses** (`ROOM_USES`): the nine (ten with LVL-3's `lift`, merged from `main`), then `toilet`, `utility`, `study`, `office`,
  `meeting`, `reception`, `retail`, `classroom`, `treatment`, `waiting`, `sport`, `changing`,
  `staff`, `worship`, `assembly`, `lift`, `plant`, `parking`, with `other` last. None of the new
  ones is habitable: `HABITABLE_USES` and `RULE_USES` are unchanged.
- **The person's word is the room's name, and a word that plainly means a use is read as it**
  (`USE_WORDS`, `readUse`, `foldUseWord`): `WC` is `toilet`, `staff room` is `staff`,
  `warehouse` is `storage`, `bryggers` is `utility`, `pooja room` is `worship`. A trailing
  "room" is taken off before the lookup. No word is read as `bedroom`, `living` or `dining`, and
  no word that means two things (`hall`, `studio`). MSG-4's suggestion table (`USE_MEANS` in
  `types/reading.ts`) keeps only those: `lounge` and `living room` still give
  `plan/unknown-use` with "Did you mean living?".
- **Tenure and the firm's own room type** on a room: `tenure` (`private`, `shared`, `common`,
  `commercial`) and `roomType` (free text, the name's text rule). No check reads either.
- **Rooms text** (`rooms/compile.ts`, `rooms/read.ts`): `building <kind>`, `building <kind>` on a
  `floor` line, and `tenure <t>` and `type "<text>"` on a room line; the use word goes through
  `readUse`, so `wc` and `Bedroom` are read. The read-back writes all of them, so the round trip
  keeps them. `grid write` keeps the file's `building` when the text has no `building` line.
- **Elsewhere**: the sheet places `building` in `sheet/coverage.ts` (not shown: it decides which
  checks run, and the check lines say so). `grid describe` says the stated kind after its first
  line ("The plan says it is an office.", `BUILDING office.` for an agent) and no longer lists
  "what kind of building it is" as not in the plan when it is stated. `grid_rename_room` and
  `grid edit rename` say which checks look at a room by its floor's kind too. A problem draft
  (CMD-13) keeps `building`, a floor's `building` and `tenure`, which are the format's words, and
  reads a room's use as Grid does; it never copies `roomType`, which is free text. The tools'
  `use` arguments take the new uses from `ROOM_USES`.
- **Fixtures**: `fixtures/rooms/office.rooms` and `office.plan.json` say `building office`, and
  the rooms text states the uses the plan file already wrote (reception, office, meeting,
  toilet); `school.plan.json` says `building school`, its three classrooms `classroom`, its hall
  `assembly` and its staff room `staff`.
- **Docs**: `docs/plan-file.md` (a new section, "What kind of building it is, and what each room
  is for"), `docs/rooms-first.md`, `docs/commands.md`, the contract (rows, reason, coverage
  fields, words read as uses, changelog entry at the top), `CHANGELOG.md` and the rules README.

## How each done-when is held

| Done when | Test |
|---|---|
| 1. The office's report applies no home figure and says which checks do not apply to an office (EL-2) | `packages/cli/src/command/__tests__/coverage.test.ts`, "what kind of building it is (CNT-5) > the office applies no home figure, and says which checks do not apply to an office (EL-2)": lab plan `C/scenarios/office-known-uses.json` with `building: "office"` set on a copy. Both figure checks look at 0 rooms and skip all 7 as `not_for_building`; no figure is applied; the two plan lines read "Room sizes were not checked: the figures here were read for homes (houses and flats people live in), and the plan says this is an office" and the same for escape openings. The same block holds the café (`food`: its seating is no longer measured against a home's figure, CH-2), the hotel (`hotel`: none of its twelve sill notes), and a stated `home` (the twelve notes stay) |
| 2. In the five non-home buildings, the share of floor with no use stated falls from 69–99.5% to under 10% (EL-3) | `scoreboard/__tests__/buildingUses.test.ts`, one case per building: `C/scenarios/clinic.json`, `office.json`, `school.json`, `shop.json`, `warehouse.json`, read as the lab's agents wrote them. "Before" reads the same file with only the nine uses Grid knew; it is 68.9, 78.7, 86.7, 73.4 and 99.5%. Now it is 0% in all five |
| 3. A building type can be set on a part (the block's ground-floor shop) as well as on the plan | `coverage.test.ts`, "a kind of building on a part of the building (CNT-5)": lab plan `D/scenarios/d2-block-g+5.json` with `building: "home"` and `ground` a `shop`. Both figure checks skip the ground floor's rooms, with one floor line each, and look at the homes above. Without the plan's kind, the floors above get the same lines as before. The schema side is in `packages/floorplan/src/types/__tests__/floorplan.test.ts`, "what kind of building it is (CNT-5)", and rooms text in `rooms/__tests__/rooms.test.ts`, "writes and reads what kind of building it is, a floor's own kind, a room's tenure and the firm's room type (CNT-5)" |

## Tests whose expected value changed

- `packages/floorplan/src/types/__tests__/floorplan.test.ts`, "keeps each of the nine values" is
  now "keeps each of the 27 values (CNT-5: past homes)", with the new list.
- `packages/floorplan/src/types/__tests__/reading.test.ts`:
  - "names each of the 20 uses AU3-3 found, but reads Bedroom as bedroom" (19 named) is now
    "names the 5 of the 20 uses AU3-3 found that Grid still does not read, and reads the other
    15 as the use they mean". Named: `studio`, `balcony`, `terrace`, `porch`, `lounge`. Read:
    the other 15, each listed with the use it is read as.
  - The suggestion test: `toilet` no longer suggests `bathroom` (it is a use); `office` and
    `classroom` are no longer "no suggestion" (they are uses). It now holds `lounge` and `living
    room` to `living`, `hall` to `corridor`, and `balcony` and `studio` to none.
- `packages/rules/src/result/__tests__/result.test.ts`: the MSG-4 corpus plan wrote `toilet` and
  `office` as uses Grid did not know. Both are uses now, so it writes `lounge` (suggests
  `living`) and `balcony` (told to write "other"), and the test checks those. The plan's list
  of fields in `needed` gains `building`.
- `packages/cli/src/command/__tests__/wordsNotRead.test.ts`: the room was `"Office"`, use
  `office`; it is `"Balcony"`, use `balcony`, for the same reason.
- `scoreboard/__tests__/wordsNotRead.test.ts` (W-5): of the 19 lab plans whose use Grid did not
  know, 15 wrote words Grid now reads (office, classroom, consulting, warehouse, garage…) and
  give no `plan/unknown-use` line; the test now expects that, and the line on the other four
  (`studio` twice, `terrace`/`porch`, `balcony`). Across the 1,131 stored lab plans the code now
  gives 8 lines (MSG-4 counted 171).

New tests: the three in the table above, plus "reads a word that plainly means a use as it, and
never as a use the figure checks look at" (`reading.test.ts`), "refuses a kind of building or a
tenure it does not know, naming the ones it does" (`rooms.test.ts`) and "the office with no kind
stated is checked as before, with COD-2's sentence" (`coverage.test.ts`).

No snapshot changed. **No scoreboard figure moved**: `npm run scoreboard` gives "Same as the
stored figures" (197, 386, 16, 2, 5; guards 735 and 95), so `current.json` is unchanged. The
scoreboard reads plans with the schema and counts areas, issues and notices; uses that are now
read change no area and no drawing issue, and the damage set's misspelt words are still unknown.

## For the owner

Each choice that was yours, taken the reversible way:

1. **Where a kind of building sits: the plan and each floor, not each room.** It covers the
   block's shop and every lab plan. A floor with a shop and a flat side by side is said by its
   rooms' uses (the figure checks look only at bedrooms, living and dining rooms) and by
   `tenure: commercial`. A per-room kind can be added later as one more optional field.
2. **A hotel is not a home.** The figures were read for homes, so they do not run in a plan that
   says `hotel`, even though the IBC's escape rule reaches some sleeping rooms that are not homes.
   `READ_FOR_BUILDINGS` is one line to change.
3. **Grid does not guess the kind.** The lab's office says nothing, and its rooms are "other",
   so it is still checked as before (with COD-2's sentence); the EL-2 test states `office` on a
   copy, as its author now can. The lab files are not changed. Inferring a kind from the rooms
   would turn the home figures off in homes named loosely, which COD-2 refused.
4. **Words read as uses.** MSG-4 said Grid never reads one word as another. CNT-5 asks for local
   words mapped to uses, so a short table of plain words is read as its use (`USE_WORDS`), and
   gives no line, as `Bedroom` gives none. It never yields `bedroom`, `living` or `dining`, so no
   room comes under a figure check by a word Grid read; a test holds that. Words that mean two
   things (`hall`, `studio`, `lounge`) are left as suggestions. Check the table reads right to
   you: `servery` as `retail`, `garage` as `parking`, `warehouse` as `storage`, `consulting` as
   `treatment` are mine.
5. **The five EL-3 buildings** are the lab's clinic, office, school, shop and warehouse, whose
   shares (68.9 to 99.5%) match the card's 69–99.5%. The gym (86% before) is not one: its
   "Studio" is not read (a studio is a flat as often as a room to train in), so it falls to 30%.
   "No use stated" counts the floor under "not said"; a room that says `other` has a stated use.
6. **The plan format version stays "1".** Every new field is optional and never defaulted. A use
   Grid named as unknown and read as unstated before (`office`, `WC`) is read as a use now; I
   took that as a new kind (the minor, per RELEASING.md), not a plan read differently. If you
   read it the other way, the version must rise to "2".
7. **Four codes, not two.** One wording per code (MSG-1) needs a plan-level and a floor-level
   wording for each check. The plan line is used when the plan's own kind is the reason on every
   floor; otherwise one line per floor, which names the floor's rooms.
8. **No outdoor use.** `balcony`, `terrace` and `porch` are still unknown words: an outdoor use
   touches the areas (which rooms are outside) and the scoreboard's `outdoor-space` capability,
   so it wants its own decision.
9. **Tenure and room type are kept and read by nothing.** No export writes them yet (an IFC
   space's object type could hold `roomType`); a problem draft keeps `tenure` and never
   `roomType`, which is free text.
10. **The tools do not set the kind, tenure or room type yet.** They are written in the plan file
    or in rooms text; a tool for them is a later step. The use arguments take the new uses.
11. **The fixtures**: the office and the school say their kind. The hotel and the four flats
    do not: stating `hotel` would turn its escape checks off and change what the lab's eight
    buildings hold the rooms text to.
12. **`plausible.ts`** still reads a plan as a home from its rooms (a bedroom or a living room)
    for its size questions, and not from `building`. Those are Grid's own limits, not figures.
13. **`grid write`** keeps the file's `building` when the text has none, as it keeps the file's
    other keys; taking the line out of the text does not take the kind off the plan.

## Checks run

On the branch at the feature commit 398791f: `npm run build`, `npm run typecheck`, `npm run lint`
clean; `npm run check:licenses` checked 363 licences, none GPL, LGPL, AGPL, MPL or EPL;
`npm run scoreboard` "Same as the stored figures". The full suite (two workers): 4,571 of 4,573
passed, in 224 of 226 files. The two that fail also fail on `main` at 56ed9b5, built and run
apart from this branch: "the built file > starts with a shebang and is one file" (the bundle is
463,963 bytes on `main` against its 450,000 limit; this branch makes it 464,845) and "a draft
from the S-11 plan > replaces room names by their uses and every id, and holds no path" (the
answer it passes is cut at 4,000 characters before the path it looks for). Neither is touched
here.

### After merging `main` at 666bb01 (LVL-3, MSG-7, SHT-7, QAR-3, QAR-4, QAR-7)

Merge commit 4b09fab. Nine files conflicted; both sides were kept in each:

- `docs/commands.md`: CNT-5's "kind of building when the plan does not say it" with LVL-3's
  stairs line.
- `docs/result-contract.md`: every code row of both; CNT-5's changelog section on top, then
  MSG-7's and SHT-7's. CNT-5's entry now says the uses join the ten (LVL-3 added `lift`).
- `packages/cli/src/describe/card.ts`: main's `unsaid(facts, names)` with CNT-5's stated kind.
- `packages/cli/src/describe/facts.ts`: both `building` (CNT-5) and `connections` (LVL-3) on
  `PlanFacts`, and both built in `planFacts`.
- `packages/floorplan/src/types/floorplan.ts`: CNT-5's 27 uses with LVL-3's comment on `lift`
  (both sides had added `lift`); main's `stairs`, `title`, `annotations` and `sketch` beside
  `building`, `tenure` and `roomType`.
- `packages/floorplan/src/types/reading.ts`: both imports (`foldUseWord`, `withRunFromEnds`);
  MSG-7's unused `fold` import dropped, since CNT-5's `nearestUse` folds with `foldUseWord`.
- `packages/floorplan/src/types/__tests__/floorplan.test.ts`: the 27-use list.
- `packages/rules/src/result/__tests__/result.test.ts`: the plan's fields with both sides' new
  ones (`building`, `stairs`, `title`, `annotations`, `sketch`).
- `packages/rules/src/result/catalogue.ts`: both imports (MSG-7's `PlanFix`, CNT-5's
  `BUILDING_TYPE_TEXT`, `RULE_READ_FOR`, `BuildingKind`). MSG-7 added no field every entry must
  have, so the four CNT-5 codes keep their `needed` and `fix`, which already say what would be
  right.

One change the merge needed beyond the conflicts: SHT-7's `USE_FILLS`
(`packages/viewer/src/picture/look.ts`) is a fill for each use, so the 17 new uses got a pale fill
each, near their group's colour. The sheet's `coverage.ts` merged cleanly with main's new parts
(`stairs` drawn, `title` not shown, `annotations` and `sketch` drawn) and CNT-5's `building`.

After the merge: `npm run build`, `npm run typecheck` and `npm run lint` clean. The affected
tests (`packages/floorplan`, `packages/rules`, `packages/viewer`, `packages/cli/src/command`,
`packages/cli/src/mcp`, `packages/cli/src/sheet`, `scoreboard/__tests__`) passed 4,248, with 3
skipped (one in `sweep.test.ts` and two in `scoreboard/__tests__/doorSweeps.test.ts`, skipped on
`main` too), in 206 of 206 files. The two tests that failed before the merge pass now: main
raised the bundle budget to 500,000 bytes (the bundle is 476,143), and the report-problem path
test passes. `npm run scoreboard`: "Same as the stored figures" (197, 386, 16, 2, 11; guards 735
and 95).


### After merging `main` at fa2f948 (SHT-4, CNT-3, MSG-10)

Merge commit bf164a6. Five files conflicted; both sides were kept in each:

- `docs/commands.md`: CNT-5's "kind of building when the plan does not say it" with CNT-3's lines
  on a stated north and front.
- `docs/result-contract.md`: every code row of both (they merged cleanly); CNT-5's changelog
  section on top, then MSG-10's, CNT-3's and SHT-4's.
- `packages/cli/src/describe/card.ts`: CNT-3's `northStated` and CNT-5's stated kind both decide
  what the card says the plan does not hold.
- `packages/cli/src/report/draft.ts`: both imports (CNT-5's `BUILDING_TYPES`, `ROOM_TENURES`,
  `readUse`; CNT-3's `Y_AXES`); `building` and `north`/`yAxis` are both kept in a draft.
- `packages/rules/src/result/__tests__/result.test.ts`: main's `plot` as the field Grid does not
  read (`site` is a field now) with CNT-5's `lounge` and `balcony` as the unknown uses; the plan's
  fields in the schema's order: `version, units, building, projectId, walls, rooms, openings,
  floors, stairs, referenceImage, items, title, annotations, sketch, north, yAxis, front, site,
  display, written`.

The sheet's `coverage.ts` merged cleanly: CNT-3's `north` (drawn), `yAxis`, `front` and `site`
(not shown) beside CNT-5's `building`. MSG-10's short report leaves out only the lines marked
seen, so CNT-5's not-checked lines show in it as any other; 7718754 adds a test that an office
plan's `grid check` and `grid_check` list both and give the reason in the counts. Two tests in
`coverage.test.ts` needed MSG-10 and CNT-5 read together (2e02be5): the café's servery is now read
as `retail`, a use the room-size check is not about, so the short report names no gap for it; and
the office's list of rooms not looked at is in the full report now that the default is short.

After the merge and the fix: `npm run build`, `npm run typecheck` and `npm run lint` exit 0.
`packages/floorplan`, `packages/rules`, `packages/viewer` and `scoreboard/__tests__`: 3,739 passed,
2 skipped, in 176 of 176 files. `packages/cli`: 1,013 passed, 1 skipped, in 66 of 66 files (before
the fix, 2 of these failed, the two above). `npm run scoreboard`: "Same as the stored figures"
(197, 278, 16, 5, 12; guards 735 and 95).
