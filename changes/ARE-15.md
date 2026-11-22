# 2026-11-22: the unit mix, the door and window schedules by type, and marks on the drawing (ARE-15)

## For people

- The door schedule and the window schedule a supplier needs: `grid_schedule` with `of=doors` or
  `of=windows` groups them into types by kind and size, each type with its count and the marks of
  its openings. Every room and opening now has a mark (the room's number; `D1`, `W1`, `O1`), and
  `grid draw --marks schedule` (`grid_view` with `marks schedule`) draws it beside its part, so
  each mark on the drawing has one row in the schedules. The check sheet draws the marks on its
  floor pages, lists the openings by mark and adds a page of the door and window types. The unit
  mix gives the bedrooms of each flat type (ARE-15).

## For agents

- `grid_schedule` takes `of=doors` and `of=windows`: `rows`, one per type in kind, width and
  height order, each with `number`, `basis` (`kind-and-size`; CNT-15's named types will be
  `named`), `key` (`door:0.9x2.1`, `door:sliding:2.2x2.1`, with `:opens:<w>x<h>` when the plan
  states the part that opens), `type`, `kind`, `width`, `height`, `opens`, `sills`, `count`,
  `marks` and `items` (each `mark`, `id`, `floor`, `floorName`, `sill`, `handing`, `between`);
  `count`; `rule`. Its CSV has one row per type, its marks joined by `; `.
- With `of=openings`, each row has `mark` (`D1`, `W1`, `O1`: its type's letter and its place among
  that type's openings in the schedule of every floor) and `typeKey` (null for a doorless
  opening); the CSV has a `mark` column after `number`, and the text starts each line with it.
  With `of=rooms`, each row has `mark`, the room's number in the schedule of every floor. A mark
  is the same when one floor is asked for.
- With `of=flats`, each `mix` row has `bedrooms` (the bedrooms of each flat of the type when they
  all have as many, else null), in the text (`1 bedroom each`) and the CSV's `bedrooms` column.
- `grid_view` kind=plan takes `schedule` in `marks` (up to 4 marks): each room's and opening's
  mark, drawn in a box, one for each row of the room and opening schedules on that floor.
- No new code in the record.
