# ARE-7 review: rounding stated once

For the owner. ARE-7 (step 1c) is on `main`. Below: what it adds, the results against
done_when, the one expected figure that changed and why, the decisions made without you, and
the command's part, which is described here and not done, because another session owns
`packages/cli`.

## What it adds

**One formatter** (`packages/floorplan/src/geometry/rounding.ts`, exported from the geometry).
Its header states the rule once:

- the arithmetic's noise is taken off first: a number is read to 12 significant digits, so
  1.8749999999999982 and 1.875 are the same number before rounding;
- halves round away from zero (1.875 is 1.88); nothing prints as -0.00;
- a length goes to the millimetre first, then to the digits shown;
- a value checked against a figure is compared as it is, a tiny tolerance apart, and printed
  with the usual digits plus as many more as it takes to set it apart from the figure when, at
  those digits, the two would read the same (6.4951 against 6.5 prints 6.495);
- a figure the person or a lookup gave is printed as given (0.775 is 0.775);
- a sum is printed with the fewest digits at which the printed parts add up to the printed total.

Functions: `rounded`, `fixedText`, `metresText`, `areaText`, `figureText`, `sumText`,
`atFigure` / `underFigure` / `overFigure`, `decimalsAgainst`, `shownAgainst`.

**Who uses it.**

- The drawing: room areas (`formatArea`), dimension numbers and the space they are given
  (`dimensionText`, `dimensionTextBox`), and the "before → after" areas of a change, in
  `packages/viewer`. They used `toFixed`, which reads 1.8749999999999982 as 1.87.
- The figure checks in `packages/rules`: the room-size check and the escape check compare the
  value as measured (`underFigure`, `overFigure`), where they rounded it first to 0.01 m² or to
  the millimetre. A finding carries the value as its note prints it (`shownAgainst`), so the
  number in the finding and the number in the note are the same and on the same side of the
  figure.
- The notes: areas next to their minimum, the sill next to its maximum, and every figure
  (`figureText`), where the escape area's minimum was printed with `toFixed(2)` and a width in
  centimetres was rounded to a tenth.
- The core's own messages: validation (`two`, coordinates, lengths, millimetres, the distance
  from the origin), the plausibility questions, the wall faults (`wallMetres` and the split
  areas), the room-outline messages, the diff summary and the DXF room labels.

The export writers' coordinates (DXF, OBJ, IFC) and the revision hash keep their own fixed
digits: they are file formats, not figures a person reads.

**One new table entry.** `lengthEqual`, 1e-9 m, arithmetic: a length this close to the figure
it is checked against is that figure. Areas use the existing `areaEqual` (1e-6 m², adjustable),
which already said an area drawn at exactly a figure is never read as a hair under it. The card
asks for "a tiny tolerance near 1e-9"; for areas the lab's AU4 re-run asked for about a
millionth of a square metre, which is what `areaEqual` is, so no second area entry was added.

## Against done_when

1. *On the hotel floor all ten 1.875 m widths print the same figure.* Done. The lab's hotel
   floor (`C/scenarios/hotel-floor.json` in the scoreboard's lab plans) has ten bathroom widths
   of 1.875 m, six held as 1.8749999999999982 or 1.8749999999999996. All ten now print 1.88, in
   the core (`geometry/__tests__/rounding.test.ts`) and in the drawn SVG
   (`viewer/src/picture/__tests__/rounding.test.ts`, which also checks no 1.87 is left).
2. *A 6.4951 m² room checked against 6.5 raises its note and prints 6.495; a person's 0.775 m is
   echoed as 0.775.* Done (`rules/src/checks/__tests__/rounding.test.ts`): the room gets
   `room_too_small` with `area: 6.495`, and its note says "It measures 6.495 m²". The audit's
   other three cases now get their notes too: a 0.4575 m² window against 0.46 (prints 0.458),
   a 0.5252 m² window against 0.53 (prints 0.525), a sill at 1.1184 m against 1.118 (prints
   1.1184). A looked-up sill limit of 0.775 m is printed "It needs to be 0.775 m or lower", and
   a looked-up window area of 0.4575 m² "at least 0.4575 m²" (it read 0.46). Rooms drawn at
   exactly the figure, whatever their last digits, still pass.
   The lab's own case, `grid check --my door=0.775`, is not a command of this repository
   (there is no `--my` option); the command's side is below.
3. *Totals add up by eye: AU7-3's '54.00 + 54.00 + 1.12 = 109.13' no longer occurs.* Done in
   the core: `sumText([54, 54, 7.5 × 0.15], total)` gives `54.00 + 54.00 + 1.13 = 109.13`, three
   parts that do not add up at two decimals are shown at three, and a randomised test checks
   that the printed parts always add up to the printed total. The line itself was printed by
   the lab's edit tool, not by this repository: nothing in `packages/` prints a sum with its
   parts today. The command's quantities should use `sumText` when they do (below).

## The expected figure that changed

- `rules-room-size.test.ts`, "leave an area that rounds up to 6.50 m² alone": a 6.496 m² living
  room passed, because its area was rounded to 6.50 before it was compared with 6.5. That is the
  CH-11 behaviour this card removes, so the test now says the room is reported, with
  `area: 6.496`, and is renamed accordingly. Its second half (6.494 m² is reported as 6.49) is
  unchanged.

No other expected figure changed: every test of the core, the rules, the viewer and the command
passed with the new formatter as they were. No `it.fails` named these findings, so none was
flipped and `pinned-tests.md` needed no line for ARE-7.

## Decisions taken without you

- **Halves away from zero, after 12 significant digits.** "Round one way" could be
  round-half-even. Half away from zero is how people round by hand and how the lab's auditors
  read 1.875; and it was already the rule in the two places that took the noise off
  (`two` in validate, `wallMetres`).
- **A length to the millimetre, then to the centimetre.** The card's "round to the millimetre
  before formatting". It is a double rounding (1.8745 reads 1.875 and then 1.88), on purpose: a
  length printed to the centimetre then agrees with the same length printed to the millimetre.
  Areas are not taken to a smaller unit first.
- **The finding carries the printed value, not the measured one.** The card says compare the
  true value; it does not say what the finding's `area`, `width`, `height` and `sill` hold. They
  hold the value as the note prints it: rounded as before, with more digits only where they
  would otherwise read as their figure. So existing figures (0.31, 6.49, 1.12, 5.88) are
  unchanged, and the number an agent reads in a finding is never on the wrong side of the
  minimum it is shown with.
- **"One more digit" is "as many as it takes".** At one more digit the value can still read as
  the figure (6.4999 against 6.5 is 6.500 at three); digits are added until it does not, up to
  nine.
- **The rounding band is the figure's, at the digits shown.** A sill at 1.12 m against 1.118 now
  reads "1.120 m" in the note, where it read "1.12": at two decimals 1.118 also reads 1.12. A
  sill at 1.20 still reads 1.20.

## For the command (`packages/cli`, not touched here)

The command prints most of Grid's numbers and still uses `toFixed` in about forty places. To
finish ARE-7 there:

- `src/quantities/units.ts` (`metres`, `squareMetres`): use `metresText` and `areaText`; every
  quantity, describe and tool answer goes through these two.
- `src/quantities/compare.ts`, `measure.ts`, `schedule.ts`, `areas.ts`, `src/describe/card.ts`,
  `facts.ts`, `src/edit/edits.ts`, `src/mcp/readTools.ts`, `toolkit.ts`, `src/draw/*`: the
  remaining `toFixed(2)` calls on lengths and areas, the same way.
- Any line that prints parts and their total (the area schedule's total, an edit that joins two
  rooms): `sumText(parts, total)`.
- A figure the person gives on the command line or to a tool (a door width, a threshold): print
  it with `figureText`, and compare with `underFigure` / `overFigure`, never after rounding.
- When the command quotes a finding's `area` or `sill`, print it with `areaText(area, 2,
  minimum)` or `metresText(sill, 2, maximum)` (or print the field as it is: it already holds
  the needed digits).

## Checks

`npm run build`, `npm run typecheck`, `npm run lint`, `npx vitest run --exclude '.claude/**'`,
`npm run check:licenses` and `npm run scoreboard` pass.

The scoreboard moved by one, for the better, and the new figures are stored in
`scoreboard/current.json` in the same commit:

| Count | Before | After |
|---|---|---|
| Damage that passes in silence | 388 | 387 |
| (damage outcome) no effect at all | 90 | 91 |
| (lab damage) plans whose outcome differs now | 410 | 411 |
| Rooms measured wrong | 197 | 197 |
| Turns answered | 15 | 15 |
| Design mistakes named | 2 | 2 |
| Checks the plan can feed | 5 | 5 |
| Guard: rooms Grid does not measure | 724 | 724 |
| Guard: sound plans with a warning | 70 | 70 |

One damaged plan went from "result changed, nothing said" to "no effect at all". The
scoreboard does not list outcomes plan by plan, so the plan was not traced. The likely cause is
a damage too small to change any printed figure, which used to change the last digit of one,
because `toFixed` reads noise in the last place (1.8749999999999982 as 1.87). With one rounding
the printed results are now identical, so nothing changed for a reader either. No sound plan
gained a warning, and no count got worse.
