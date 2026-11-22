# ARE-15 review: the unit mix, door and window schedules by type, and marks on the drawing

For the owner. What ARE-15 adds, how each done-when item is met, every expectation that changed,
the choices made without you, and the checks run. Lab evidence: AR-7 (no room schedule and no
unit mix) and CP2-4 (no door and window schedule, and no mark on the drawing tied to one).

## What changed

1. **Marks for every schedule row** (`packages/cli/src/quantities/schedule.ts`):
   - each room schedule row has `mark`: its number in the schedule of every floor (the number the
     room states, CNT-9, else Grid's);
   - each opening schedule row has `mark`, its type's letter (`D` door, `W` window, `O` doorless
     opening, `MARK_LETTERS`) and its place among that type's openings in ARE-12's order (floors
     by level, then id), and `typeKey`. The schedule now lists every floor before it keeps the
     floors asked for, so a mark is the same whichever floors are asked for. `number` still
     counts the rows given, as before.
   - `scheduleMarkLabels(survey)` gives the marks by part id, from those rows, for the drawing.
2. **Door and window schedules by type** (`openingTypeSchedule`, `openingTypeScheduleCsv`): the
   doors, or the windows, grouped by the kind the plan states (CNT-14, C20) and the size of the
   hole, and the part that opens when stated. One row per type with its key (the estimate's and
   the IFC's form, `door:0.9x2.1`, `door:sliding:2.2x2.1`, plus `:opens:<w>x<h>`), count, marks
   and items; a window type lists its sills. Every row says `basis: 'kind-and-size'`.
3. **The unit mix** (`flatSchedule`, CNT-4): each mix row gains `bedrooms`, the bedrooms of each
   flat of the type when they all agree, else null; in the text (`1 bedroom each`) and the CSV's
   `bedrooms` column, which was empty on mix rows.
4. **Marks on the drawing**:
   - Core (`packages/floorplan/src/geometry/drawingMarks.ts`): LVL-9's `drawingMarks` takes
     `schedule` (labels by id) and gives `DrawingMarks.schedule`, one `ScheduleMark` for each
     drawn room and opening that has a label: a room's at its label point; an opening's on its
     wall's face away from a door's stated swing, or on the side a room is on (tried one wall's
     thickness from the middle, so no new tolerance).
   - Viewer (`packages/viewer/src/picture/drawingMarks.ts`, `scene.ts`, `planSvg.ts`):
     `scheduleMarkNodes` draws each in SHT-7's tag (a box of paper with the mark), a room's over
     its name where the scene placed its label, an opening's 14 px out from the face.
     `data-part="schedule-mark"` with `data-of`, `data-id` and `data-mark`. The scene draws them,
     because only it knows where the labels went. Nothing is drawn unless asked.
5. **Asking for them**: `schedule` is a new LVL-9 mark word: `grid draw --marks schedule` and
   `grid_view` kind=plan `marks: ['schedule']` (up to 4 words now). The command reads its
   options before the plan, so the labels are added once the plan is read (`withScheduleMarks`).
6. **`grid_schedule`** takes `of=doors` and `of=windows` (text or CSV). With `of=openings` each
   text line starts with the mark (`1. D1 door "door-bath"`), and the CSV has a `mark` column.
   No tool was added, so the tools keep their fixed order.
7. **The check sheet** (`sheet/pages.ts`): its floor pages draw the schedule marks; the door and
   window schedule lists each opening by mark (`D1 door door-bath`, was `1. door door-bath`); a
   new page, "Door and window types", lists the types with their marks and counts. New message
   keys in `en.ts` and `es.ts` (`sheet.openingTypes*`, `sheet.openingType.marks`).
8. **Docs**: `docs/areas.md` (the door and window schedules, a new "Marks" heading under
   "Schedules", the unit mix's bedrooms), `docs/commands.md` (`--marks schedule`),
   `docs/tool-server.md` (the `grid_schedule` and `grid_view` rows). README untouched.
   `changes/ARE-15.md` holds the changelog lines. No new message code, no new convention: the
   plan format is unchanged, so C22 was not used.

## The done-when items, each with its test

All in `packages/cli/src/mcp/__tests__/scheduleMarks.test.ts` (14 tests).

1. **The four-flat floor's unit mix counts flats by type and totals their areas**: written by
   `grid_write_rooms` from `fixtures/rooms/four-flats.rooms`, `of=flats` gives "One bedroom" 2
   flats (1 mirrored, 1 bedroom each, 136.53 m²) and "Two bedrooms" 2 flats (1 mirrored, 2
   bedrooms each, 198.46 m²); the total is 4 flats, the sum of the types, 335.00 m² (the
   unrounded 2 × 68.2671 + 2 × 99.2313).
2. **The door schedule groups doors by kind and size**: the two-bed flat with its living room's
   door made sliding gives four types, `door:0.7x2.1` [D1], `door:0.8x2.1` [D2, D3, D5],
   `door:0.9x2.1` [D4] and `door:sliding:0.8x2.1` [D6]: same size, another kind, another type. The
   window schedule's five types with their sills, the text and the CSV are tested too.
3. **Every mark on the drawing has one row and every row has one mark**: for the two-bed flat,
   the two-floor house, the duplex, the lab's tiny house with a loft and the four-flat floor,
   each floor's SVG is read for `schedule-mark` nodes and set against that floor's room and
   opening schedule rows, as `of:id:mark`, equal both ways with no repeats; and no mark is used
   twice in the plan. A picture not asked for marks draws none.
4. **Kept through an edit**: `grid_move_room_side` (bed2 north 0.3) then `grid_change_opening`
   (a door made sliding) leave every room's and opening's mark as it was, and the edited plan's
   drawing is still one to one with its rows.

## Expectations changed

- `packages/cli/src/mcp/__tests__/doorKinds.test.ts` and `facts.test.ts`: the opening schedule's
  CSV header gains `mark` after `number`.
- `packages/cli/src/mcp/__tests__/schedules.test.ts`: the CSV's size columns are checked at
  fields 4 to 6, not 3 to 5, for the same column.
- `packages/cli/src/mcp/__tests__/flats.test.ts`: the mix line reads `4 flats (2 mirrored), 1
  bedroom each, 100.0% …`, and the mix CSV row has `1` in its `bedrooms` column.
- `packages/cli/src/sheet/__tests__/pages.test.ts`: the check set of the two-floor house ends with
  three schedule pages, not two ("Door and window types" last); the page kinds and floors lists
  gain one entry.
- `packages/cli/src/__tests__/ownWords.test.ts`: `readTools.ts` 306 → 309 (tool answers, English
  by design), `quantities/schedule.ts` 12 → 15 and the not-moved ratchet 1507 → 1510: the types'
  rule and the type CSV's `opens width m` and `opens height m` columns. The sheet's new words are in the message files.
- No snapshot changed: a picture not asked for schedule marks is byte for byte as before.

## For the owner

1. **Types are kind and size for now.** CNT-15's named wall, door and window types are not built.
   Each type row carries `basis: 'kind-and-size'` and a key; when CNT-15 lands, a type the plan
   names should be its own row with `basis: 'named'` keyed by its id, and openings naming none
   stay grouped as here. The part that opens splits types (a pair with a 0.9 m main leaf is not
   the same as an equal pair), and its key gets `:opens:<w>x<h>`, which the IFC's type tag does
   not have. Say if they should stay together.
2. **Marks follow ids, and are not stored.** A room's mark is its schedule number, an opening's
   `D`/`W`/`O` and its place in id order. An edit that keeps ids keeps the marks (tested). A part
   an edit adds (a split room, its new door) takes its place in id order, so later marks of that
   kind move up by one. A room's stated number (CNT-9) holds; openings have no stated mark. If
   marks must never move, a stated opening mark would be a plan-format change (it would take
   C22, which I left unused).
3. **The letters** are `D`, `W` and `O` (doorless opening), the same in every language, so a
   Spanish sheet and an English CSV agree. `O` could be read as zero; `P` (passage) is the other
   choice.
4. **Windows are not split by sill**: a window type lists its sills. A supplier orders by size;
   the opening schedule keeps each window's sill.
5. **Marks are drawn only when asked** (`--marks schedule`, `marks: ['schedule']`) and on the
   check sheet's floor pages, not on the client sheet, `grid draw` by default, the app's 2D view
   or the DXF. The DXF has no mark layer yet.
6. **The room schedule asked for one floor** still numbers its rows from 1 (ARE-12), while each
   row's `mark` is its number in the whole plan. Its CSV has no `mark` column, to keep ARE-12's
   columns; the opening CSV has one. Say if the room CSV should carry it too, or if ARE-12's
   numbers should never restart.
7. **The bedrooms in the mix** are given only when every flat of the type has as many; a type
   whose flats differ says nothing (null).
8. **The sheet's opening rows** are now named by mark (`D1 door door-bath`) instead of the row
   number, so the sheet and the drawing say the same.
9. **The check PDF** was written and opened by the tests and by `grid sheet --layout check` on
   the two-bed flat; I could not look at its pages as pictures here (no PDF renderer on this
   machine). The PNG of `grid draw --marks schedule` was looked at: marks sit by their parts,
   clear of door swings, a room's over its name.

## Checks run

See "Checks" below, filled in after the last run.
