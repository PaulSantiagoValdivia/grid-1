# ARE-12 review: schedules for rooms, doors and windows

For the owner. What ARE-12 adds, how each done-when item is met, every expectation that changed,
the choices made without you, and what is left for ARE-15.

## What ARE-12 adds

Two schedules in `packages/cli/src/quantities/schedule.ts`, built as data on top of the areas
(`planAreas`, ARE-9 with MSG-2's states), the room height rule (`roomHeight`, ARE-10) and
QAR-5's id order (`compareIds`):

| Schedule | One row per | Each row holds | Then |
|---|---|---|---|
| `roomSchedule` | room | number, id, name, use, net area (null when Grid could not draw it), its state, height, floor | each floor's total, named by its floor; the total of all floors, with its state |
| `openingSchedule` | door, window and doorless opening, once | number, id, type, floor, width, height, sill, what lies on its two sides | the count of each type |

Order: floors by level, then by id; rooms by id; openings by doors, doorless openings, windows,
then by id. Room numbers are Grid's, 1, 2, 3… in that order; the plan format holds none and is
unchanged.

The text of `grid_schedule`, its CSV (`roomScheduleCsv`, `openingScheduleCsv`) and two new pages
at the end of `grid sheet --layout check` ("Room schedule", "Door and window schedule") are all
written from those rows. The CSV writer reads every cell before it writes: a missing name or
id, or a number that is not finite, throws `ScheduleRowError` naming the schedule and the row.
Numbers are bare and never `-0`.

## The done-when items

1. **The flat's room schedule** (`two-bed-flat.json`): six rows, numbered 1 to 6, each with
   name, use, area, height and floor; net 62.65 m². With every list of the file and its floors
   reversed, the schedule is equal, field for field (and the same for the tiny house).
2. **The opening schedule** lists the flat's 6 doors and 1 doorless opening once each, 7 rows
   and not 13: the test counts 13 room by room first, as the lab did (AC-10). Each row has its
   two sides; the entrance has `outside` on one.
3. **A row that cannot be read fails loudly**: an area set to `NaN` stops the CSV with
   "The room schedule cannot be written: row 3 has no number for its area."; an empty name with
   "row 1 has no name". **The tiny house totals 277 sq ft**: the lab's AB-4 plan
   (`packages/cli/fixtures/tiny-loft.json`, copied from the lab as data) gives 25.73 m² for its
   two floors, and the all-floors row says 277 sq ft in the text, the CSV and the sheet. Each
   floor's total names its floor ("Total, Main floor", "Total, Sleeping loft"). The test reads
   the CSV as a spreadsheet would: the numbers are numbers.

Tests: `packages/cli/src/mcp/__tests__/schedules.test.ts` (10).

## Expectations changed

- `packages/cli/src/sheet/__tests__/pages.test.ts`: three tests expected the check set to end
  after its floor pages. It now ends with the two schedule pages: "is a summary, then one page
  per floor" now lists `summary, floor, floor, summary, summary`; "says a floor with no findings
  found nothing" picks the floor pages by kind instead of every page after the first; "says
  which floor a floor page is" expects two more pages with no floor on the check layout.
- `packages/cli/src/command/__tests__/sheet.e2e.test.ts`, "writes the expected pages, the same
  twice (check)": the check PDF of the two-floor house has 5 pages, not 3. The client PDF keeps 3.
- No other expectation changed. `grid_schedule` without `of` answers exactly as before.

## For the owner

1. **How it is asked for: the tool and the sheet, no new command.** `grid_schedule` takes
   `of=rooms` or `of=openings` (with `format=csv` for the CSV); left out, it is the grouped
   schedule it was. The check sheet carries both tables. The tools keep their fixed order and
   count (15), and no path argument was added, so the every-path test is unchanged. A
   `grid schedule` command that prints the CSV is easy to add later if people outside an agent
   want it; it would need its slot in the every-path test.
2. **Numbers by floor, then id**, counting across all floors (1 to 4 in the tiny house), not
   per floor ("G.01"). The sheet and the CSV show the same numbers.
3. **Doorless openings sort between doors and windows**, so the passages a person walks through
   come first.
4. **The CSV's totals are rows of the same table**, with no number and the label in the name
   column ("Total, Main floor", "Total, all floors"), so a spreadsheet sum over the room rows
   and the total agree. A separate totals file would be the other choice.
5. **Sheet tables only on the check layout.** The client layout keeps its per-floor area tables.
6. **The opening rows' "count" column on the sheet is 1 for each**, and the total row counts
   them all, since the sheet's tables have one figure column.
7. **The tiny house fixture** is the lab's file copied as plan data; it holds no path.

## Left for ARE-15

The unit mix, the typed door and window schedules (frames, ironmongery, fire ratings) and the
marks on the drawing. The schedule numbers are not drawn on the plan.

## Checks run

On `main` at 89f1f15 (it had not moved when the branch was finished):

- `npm run build`, `npm run typecheck`, `npm run lint`: clean. `npm run check:licenses`: 363
  licences, none GPL, LGPL, AGPL, MPL or EPL.
- `npx vitest run --exclude '.claude/**' --maxWorkers=2 --minWorkers=1`: 4,462 passed, 1 failed,
  of 4,463 in 213 files (403 s). The one was real: the check sheet's page count in
  `sheet.e2e.test.ts` (above). Updated; that file then passed, 22 of 22.
- `npm run scoreboard`: 197, 386, 16, 2, 5, 735, 95. Same as stored. The scoreboard probes only
  the library, and the schedules are in the command's package, so no capability moved.
