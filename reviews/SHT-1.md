# SHT-1: named looks drawn from the same geometry, and the Technical look

What changed, the decisions made without you, what to look at, and every snapshot or expected
figure that moved.

## What SHT-1 changes

A look is now a named set of values (`packages/viewer/src/picture/look.ts`, `Look`) that the one
drawing function, `planScene`, applies. A look holds its colours, its line widths, the colour of
its thin lines, and three switches: an outline round the cut walls, windows drawn as glass, and a
mark for undecided doors. It decides how each part is drawn, never where: the walls, openings,
door swings, dimensions and label places come from the core and are the same in every look. A
test strips the paint and the look's own symbols off a working and a technical picture of the
same plan and finds the two the same, byte for byte.

| Look | Used by | What it is |
|---|---|---|
| `working` | the app's 2D view, `grid_view` (every picture an agent gets), the `planToSvg` and `drawPlan` default | The app's light theme, unchanged: lines in screen pixels |
| `technical` | `grid sheet` (both layouts), `grid draw` | Black on white, lines in millimetres on paper |
| `dark` | `grid_view look=dark`, `grid draw --look dark` | The working look on the app's dark paper |

`light` and `mono`, the names `grid_view` took before, are still taken as older names for
`working` and `technical`; the answer says which look they stand for ("technical (asked as
mono)"). The lab's replayed conversation that asks for `mono` still passes.

### Line weights in paper millimetres

The technical look has four pens, one set per output scale (`PAPER_PENS`):

| Scale | cut | medium | fine | finest |
|---|---|---|---|---|
| 1:50 | 0.70 | 0.35 | 0.25 | 0.18 |
| 1:100 | 0.50 | 0.25 | 0.18 | 0.13 |
| 1:200 | 0.35 | 0.18 | 0.13 | 0.10 |

Cut walls take `cut`; door leaves and steps `medium`; window lines, dividing lines and the
undecided mark `fine`; swings, dimensions, leaders and fixtures `finest`. A line's width in the
SVG is its pen times the scale (0.5 mm at 1:100 is 0.05 m of plan). Any other scale takes the
pen set nearest to it by ratio (up to 1:70 the 1:50 set, up to 1:141 the 1:100 set), and its
lines are still that set's millimetres times the actual scale.

The scale comes from where the picture goes:

- `grid sheet`: the floor box's own scale on the A3 page, the frame's metres across the box's
  millimetres, corrected when the box shrinks under a tall header.
- `grid draw` and `planToSvg`: the picture's own, each pixel a CSS pixel (96 to the inch) on
  paper, so a line is its pen's width when the picture is printed at 96 dpi. `paperScale`
  (N in 1:N) sets it in the library; `grid draw` has no option for it yet.

The working look stays in screen pixels, as the app draws it, whatever scale is asked.

### Technical basics (from SHT-3)

- **Cut walls heaviest, with the fill as a tone inside.** Every wall slice is stroked black
  under all the wall fills, at twice the `cut` pen; the grey fill (`#8c8c8c`) covers the
  inner half and every seam where two walls meet, so one outline the pen's width runs round
  the walls as a whole. The SVG's `stroke-width` on `wall-outline` is therefore twice the pen.
- **Black on white**: white paper and rooms, black labels, lines and outline; soft text
  `#3c3c3c`.
- **Windows as a break**: the wall stops at both jambs (its outline shows across the cut ends,
  because a technical look leaves every gap unfilled), and two face lines and a glass line
  bridge it (`window-symbol`).
- **A door with no stated swing** gets its own mark (`door-undecided`): a dashed line across
  the gap and a "?" on a small paper disc. Doors with a hinge and swing keep their leaf and arc.
  The note: `grid_view look=technical` adds a line naming those doors and telling the agent to
  ask the person and set hinge and swing; `grid draw` prints the same names on standard error
  (as it already does for parts it leaves out); a sheet's floor page carries a key line, "A door
  drawn with a dashed line and "?" has no stated swing yet.", on both layouts.

## Decisions made without you

1. **`grid draw` defaults to the technical look.** The card says technical is "the export
   default" and `grid_view` already tells agents a file to hand on is not a view. `grid draw`
   writes a file, so it is drawn technical; an agent using the command line asks for
   `--look working`. If you read "every picture an agent gets" to cover `grid draw` too, it is
   one line: `DRAW_LOOK` in `packages/cli/src/command/draw.ts`.
2. **The working look does not draw the undecided mark.** It stays the app's drawing, byte for
   byte, so the app, every agent picture and the app-parity tests are unchanged. An undecided
   door is still a plain gap there. Drawing it in working too is one switch
   (`WORKING_LOOK.undecidedDoors`) but changes the app's snapshots.
3. **Four weights, not five.** SA1 says four or five; nothing in the plan yet needs a fifth (a
   heavier exterior wall, or seen edges above the cut, would).
4. **Text stays in pixels.** Labels are placed in pixels (SHT-5); millimetre text sizes belong
   with the sheet's own scale work.
5. **The wall tone is one mid grey for exterior and interior walls.** SA3 leaves it a choice;
   black presentation walls would be another look.
6. **No Listing, Presentation or Check look yet.** The card names them as following; the check
   view stays `ids` on top of a look.

## What to look at

Draw the two-floor house (its doors have no swings) and the three-bed house both ways:

```bash
grid draw packages/cli/fixtures/two-floor-house.json --floor first --png --scale 2 --out first.png
```

```bash
grid draw packages/cli/fixtures/two-floor-house.json --floor first --png --scale 2 --look working --out first-working.png
```

```bash
grid sheet packages/cli/fixtures/two-floor-house.json --layout client
```

- Whether the outline reads as one line round the walls, and the 0.5 mm-ish weight against the
  thin lines. At outside corners two wall fills meet on a diagonal, and the anti-aliased edge
  of each shows as a faint line there; it was there in the working look already, only less
  visible on near-black walls.
- Whether the "?" (10 px) is large enough on a printed sheet, and whether a dashed line plus
  "?" is the undecided mark you want.
- On the sheet, the key line under the floor plans.

## Snapshots and expected figures that changed

**No snapshot file changed**, and no expected figure. The working look is byte-for-byte the
drawing it was: every Canvas2D snapshot, the app-to-picture parity tests and the SHT-5 label
tests pass as they were.

Two tests changed what they compare, because `grid draw` now draws technical by default:

- `packages/cli/src/mcp/__tests__/checkView.test.ts`, "is the same drawing a person gets with
  grid draw --ids": the expected SVG is now `drawPlan(..., { look: 'technical', labels: { ids:
  true } })`.
- `packages/cli/src/command/__tests__/sheet.e2e.test.ts`, "says which parts it leaves out, as
  grid draw does": `grid draw` on the house's first floor now prints a second line naming
  `balcony` and `d_up` as undecided; the sheet's own standard error is unchanged.

## Tests added

- `packages/viewer/src/picture/__tests__/looks.test.ts`: the default and older names; the same
  geometry under every look; stroke widths at 1:50, 1:100 and 1:200 against the pens; four
  weights, heaviest for cut walls; the pen set for other scales and for the picture's own
  scale; black on white; the outline under the fills and the open gaps; the window's face and
  glass lines on the wall's faces; the undecided mark and `undecidedDoors`; nothing of it in the
  working look.
- `packages/cli/src/draw/__tests__/looks.test.ts`: `grid draw`'s default, `--look`, its
  refusals and its note; `grid_view`'s default, older names and note; the sheet's look, scale
  and key line on both layouts.

## Checks run

After merging `main` (which brought CNT-12's fixtures; they take the `finest` pen in the
technical look and keep 0.75 px in the working look):

- `npm run build`, `npm run typecheck`, `npm run lint`: clean.
- `npm run check:licenses`: 363 licences, none GPL, LGPL, AGPL, MPL or EPL.
- Full suite, two workers: 4,252 of 4,253 passed. The one failure was the timing test "answers
  grid check on the sample flat in under half a second", with the machine's load average
  above 200 from the other sessions; alone it passed.
- `npm run scoreboard`: the same as the stored figures.

## Still open

- `grid draw` has no option for a paper scale; a picture is drawn at its own.
- The sheet prints at the box's scale, not at 1:50, 1:100 or 1:200, and does not state its
  scale; a fixed scale and a scale bar are sheet work.
- Fixtures are drawn with the finest pen; a fixture's own look on paper was not designed.
- The 3D still has no technical look.
