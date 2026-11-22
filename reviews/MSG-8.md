# MSG-8 review: what went wrong, shown on the drawing

For the owner. MSG-8 (step 3) draws Grid's one result record (MSG-1) on the picture of a floor.
A room Grid cannot draw is no longer a blank. Every line has a numbered mark on the drawing, and
the same number appears in front of the line in `grid check`.

## What changed

1. **A room that cannot be drawn** (`PlanDrawing.undrawn`, `packages/floorplan/src/geometry/floorplan.ts`).
   `buildFloorPlan` now returns each room it skips, with the box round the walls the room lists.
   The box is bounded by the corners where those walls meet: two axes cross within both walls,
   give or take half the other wall's thickness and `wallContact`. A long outside wall that the
   room shares with its neighbours does not stretch the box. The floor-4 bedroom's box is 3.85 m
   by 4.95 m, where the box round its whole walls would be 26.35 m wide. Below three corners, the box goes
   round the whole walls. A room none of whose listed walls exist gets no box. The 2D scene
   draws the box tinted and dashed in the warning colour, with the room's name and the reason in
   the middle. The app draws the box too, with "Not drawn" in place of the reason, because the
   app holds no record.
2. **Numbered marks** (`packages/viewer/src/picture/faults.ts`). A picture can be given the
   record's `lines` (`PictureOptions.faults`). A line's number is its place in `lines`,
   counting from 1. Where the mark goes:
   - a room: beside its label;
   - a room that cannot be drawn: in its box's corner;
   - an opening: on its gap. An opening the drawing leaves out goes on the wall the plan puts it
     on (the floor-4 front door that runs off its wall);
   - a wall: halfway along its axis;
   - the floor or the whole plan: one mark per line, down the top-left corner.

   A part's words go beside its mark on a paper-coloured backing, wrapped at 320 px, in the
   first of four places (right, left, below, above) that keeps clear of labels, marks and other
   words. If none is clear, they go in the place that covers least. A corner mark's words are
   drawn only where clear, because the key just under the drawing has them anyway. A mark on a
   door replaces the plain warning dot.
3. **The key under the drawing.** It lists every line of the floor drawn, and of the plan as a
   whole, by number with its words, and says how many lines are about other floors. The picture
   grows by the key's height. The plan keeps its own frame at the top, so the part boxes of
   `grid_view` (VEW-6) are unchanged.
4. **Who passes the record.** `grid draw` and `grid_view` (kind plan) run `inspectPlan` and pass
   its lines, so the marks always show there. `grid_view`'s text says how many lines are on the
   floor. The sheet (VEW-7) and `drawPlan` called without `faults` draw as before.
5. **The same numbers in the report.** `grid check` and `grid_check` print `N.` in place of
   `-` in front of each line. `CheckResult.numbers` gives each line's number in the whole
   plan's record, so `grid check --floor L4` prints 1, 2, 6, 7, the numbers the floor-4
   drawing shows. `docs/result-contract.md` has a section on line numbers and a changelog
   entry. No field of the record changed.

## Against `done_when`

1. *The floor-4 bedroom is the box round its walls with its name and the reason (SE-8).* See
   `packages/cli/src/draw/__tests__/faults.test.ts`, run on the lab's
   `d2-mistake-floor4` from the scoreboard data. `L4-D-bed1` has an `undrawn-room` box that
   contains its short walls and is under 8 m wide. Its text is "Flat D Bedroom 1", and its
   reason is the record's `room/unclosed` message word for word. Its mark carries that line's
   number. The courtyard house from the same finding needs nothing more: since ARE-6 it draws
   both wings.
2. *Every note has a numbered mark matching the report, and PNG stills print the words beside
   each mark (AU2-4).* On floor 4, every line of the floor and the plan has a mark with its
   number, and the key lists exactly those numbers. `checkText` prints the same number in front
   of the same message. Every mark on a part carries its words. In a PNG of the two-bed flat
   with a door swinging into a wall, the door's mark has the words of the record's
   `opening/door-blocked` line beside it. The test counts warning-coloured pixels where they are
   drawn, and checks that the PNG is the key's height taller.

## Snapshots and expected figures changed

- **No snapshot file changed.** Pictures given no faults are unchanged byte for byte, and no
  snapshot plan has a room that cannot be drawn. The app and picture parity test still passes.
- **No expected figure changed.** The scoreboard prints the stored figures ("Same as the
  stored figures").
- **Three test expectations changed, all wording.**
  - `command/__tests__/planReading.test.ts` and `command/__tests__/oneList.test.ts` matched
    `  - left out` and `  - worth a look`. They now match `  N. …`, because the report numbers
    its lines.
  - `mcp/__tests__/checkView.test.ts` compares `grid draw --ids` with `drawPlan`. It now passes
    `drawPlan` the record's lines, because `grid draw` always marks them.
  - `draw/__tests__/looks.test.ts` (SHT-1, merged after MSG-8 was written) compares `grid draw`
    in each look with `drawPlan`. It now passes the record's lines too, for the same reason.
- `look.test.ts` gains checks that the new parts' line widths, dash, tint and font sizes in
  `look.ts` match `plan.css`.

## For the owner to check

- **Opting out.** `grid draw` marks faults always and has no flag to leave them out. A plan
  with nothing to look at draws as before. A multi-floor plan usually has a "not checked: no
  stairs" line until LVL-3 is merged, so its pictures gain a corner mark and a key.
- **The app.** The app's 2D view draws the undrawn-room box but no numbered marks: the viewer
  does not depend on `@ongrid/rules`, and the app holds no record. Giving the app the record
  would be a follow-up.
- **`--country`.** It can add findings, and with them shift the numbers after them. `grid draw`
  takes no country, so its numbers match `grid check` without `--country`. The contract says so.
- **Looks (SHT-1).** The marks, words and key take their colours from the look: orange in the
  working look, black on white in the technical one, where the undrawn room's tint is a light
  grey. Their line widths stay in screen pixels in every look, because they mark the drawing
  and are not part of it.
- **Fixtures (CNT-12).** A line about a fixture (`thing.kind` `item`) gets its mark on the
  middle of the fixture's outline.
- **Parallel work.** MSG-2 and MSG-4 may touch `command/check.ts`. The numbering change there
  is a few lines in `checkText` and `checkPlan`/`checkOnFloor`.
