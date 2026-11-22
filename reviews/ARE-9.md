# ARE-9 review: gross, net and other areas from the spaces, each saying what it measures

For the owner. What ARE-9 adds, how it follows the ARE-8 decision, the results on the lab's
flat and the lab's plans, every expected figure and test that changed, the decisions taken
without you, and what is still open.

## What ARE-9 adds

One areas call in the library, `planAreaFigures(plan, options)` in
`packages/floorplan/src/geometry/areas.ts`. For each floor, and for the plan, it returns:

| Figure | How it is worked out |
|---|---|
| Net | Each room as Grid measures it everywhere (`roomArea`: to the faces of its walls, less holes and rooms marked `inside`), by floor and by use |
| Gross external | The outline the walls enclose, as ARE-4's spaces join it: every wall counted |
| Gross internal | That outline less the stretches of wall that face outside, as MSG-13 works them out, with the corners made good between them; only the parts that hold enclosed floor are kept |
| Walls, outer walls, unclaimed floor | From the same join, so the figures add up |
| Off its space | Room floor that is not enclosed floor counted once: overlaps, rooms over walls or outside them. 0 on a sound plan |

On every floor:

    gross external = net + rooms named outside + walls + unclaimed floor − off its space
    gross internal = net + (walls − outer walls) + unclaimed floor − off its space

Every figure carries its rule from `MEASURES`: what it measures, what it does not take off, and
what the plan cannot say, each one sentence in Grid's own words. A room Grid could not draw is
named in `leftOut` and in a note, and is in no figure. A floor whose figure cannot be worked out
has `null` with the reason, never a guess.

The CLI's `quantities/areas.ts` (`planAreas`, used by `grid_areas`, `grid_compare` and
`grid sheet`) now only adds room sizes and circulation to the library's figures. It no longer
reads `wall.kind === 'exterior'`, which MSG-13's hand-over asked lane B to switch.

`grid_areas` gains `country` (two letters) and `gross` (`internal`, `external` or `both`). Its
text gives the net area and each gross area with the sentence of its rule, totals by floor and
by use, an "Assumed:" line saying why that gross measure was given and that the rule is Grid's
own, then what each measure does not take off and cannot say. Its data adds `byUse`, `leftOut`,
`gross` (the measures given, how they were chosen, why) and `measures` (the table).

## Following ARE-8's decision

- **Every area says which rule it follows.** Each `AreaFigure` carries its `MeasureRule`; every
  text line has its sentence beside the figure (AR-16: no bare number).
- **The measures as decided.** Gross internal to the inside face of the outer walls, inner walls
  counted; gross external to the outside face; net the floor inside each room.
- **The default follows the country.** `usualGross(country)`: the inside face for the 27 EU
  countries and GB, CH, NO and IS, the outside face for US. With
  no country, or any other, both are given, and the text says why. Either or both can be asked
  for with `gross`.
- **No standard's name.** The README's new "Measuring areas" section holds the measures table
  (ARE-8's first done-when); a test fails when it and `MEASURES` differ. Another test reads every
  source file of the four packages, the README, AGENTS.md and the result contract, and fails if
  one names a measuring standard (the list is built from parts in the test). The figure records
  file in `packages/rules` is the one place allowed. No figure record for a measuring rule was
  added: none is needed until a named local rule is wanted, and the card says that needs a
  party-wall kind and an outdoor kind first (R-1, ARE-14).

## Results

The lab flat (AR-6, `fixtures/two-bed-flat.json`, also the bench's flat): **net 62.65 m²,
gross internal 64.97 m² (8.9 × 7.3 m inside the 0.3 m outer walls), gross external 75.05 m²**,
each with its sentence.

Per floor, net plus walls plus unclaimed floor equals gross external within 1e-6 m² on all 8
fixtures, each also stacked as two floors, and on the 442 sound scoreboard plans (with no room
floor off its space). On the 1,102 lab plans Grid can read (those with up to 300 rooms in the
test; the four size probes of thousands of rooms were run by hand: same result), the full sum
holds within 1e-6 m² on every floor, gross internal is never above gross external nor below net,
and nothing throws. On 12 lab floors room floor is off its space without a warning naming it: each
is 1 to 8 mm² (1 mm walls, a door sweep probe), under the 0.01 m² any message names; the test
holds them to that.

Figures that moved against the old CLI `planAreas`, which took gross areas from the walls stated
`exterior` only:

| Fixture | Gross internal before → now | Gross external before → now |
|---|---|---|
| `berlin-flat.json` | 2.75 → 128.39 m² | 16.57 → 154.18 m² |
| `madrid-flat.json` | not known → 83.68 m² | not known → 95.07 m² |
| The other six | unchanged | unchanged |

Berlin's and Madrid's stated kinds do not close a floor (their light wells and party walls are
stated `interior` or `partition`), so the old figures were wrong or missing. Neither new figure
was checked by hand against a drawing; Madrid's net is ARE-2's hand-worked 80.66 m².

## Tests and figures changed

- `packages/cli/src/mcp/__tests__/replay/replay.test.ts`, estate agent 3: the rule's wording
  changed from "inside the inner face of the walls marked exterior" to "inside the inside face of
  the walls that face outside". The figure, 660 sq ft (61.32 m²), is unchanged. Added: asked for
  GB, gross internal is given alone.
- `packages/cli/src/sheet/__tests__/pages.test.ts`, "shows a gross area it cannot work out":
  setting every wall to `interior` no longer hides the gross areas, since which walls face
  outside is worked out. The case is now a plan with no rooms: gross internal not known, with
  the reason in the notes; gross external known. `GROSS_NOT_KNOWN` is gone: the sheet prints the
  reason the library gives.
- `scoreboard/src/capabilities.ts`: `gross-area` and `area-table` get library probes.
  Turns answered moves 15 to 16 (the architect's third turn: areas of each, by use, circulation
  share, gross); every other count is unchanged. Stored in `scoreboard/current.json`, explained
  in `scoreboard/README.md`. It is the first turn counted that the lab did not mark answered
  fully.
- New: `packages/floorplan/src/geometry/__tests__/areas.test.ts` (21 tests) and
  `scoreboard/__tests__/areas.test.ts` (2 tests, about 45 s).

No message code was added, so MSG-1's catalogue and the result contract are unchanged: the
areas answer is not part of the check's result record, and its notes carry no code.

## Decisions for you to check

1. **The country list.** "Most of Europe" became the 27 EU countries plus GB, CH, NO and IS.
   It is the ARE-8 decision applied, not something read from any document. Some of those
   countries quote a figure closer to net for homes; Grid still gives both on request.
2. **US: homes only?** The decision says the outside face "for US homes". Grid does not know
   whether a plan is a home for this, and uses the outside face for every US plan, saying "for
   homes in US" in the text.
3. **Floor no room claims counts in gross internal**, a courtyard or light well included, unless
   its walls are stated `exterior` (then they are cut as outer walls, and the courtyard floor
   still counts). MSG-13 reads such floor as not outside; the rule's "cannot say" sentence says so.
4. **A garden wall standing apart** is in the gross external area and the walls; in gross
   internal it goes with the outer walls, since it holds no enclosed floor.
5. **Short stretches with no room on either face** (where a partition runs into an outer wall,
   and round corners) go with the outer stretches on both sides, or on one side and the wall's
   end on the other. Without this, a plan with no stated kinds measured 0.36 m² more gross
   internal than the same plan with them.
6. **Rooms named outside** stay as before: out of net and gross internal (their walls stay in
   gross internal), in gross external.
7. **A floor with no wall facing outside** (no rooms, no stated outside walls) has no gross
   internal area, with that reason. A floor whose walls enclose no floor has gross internal 0.
8. **The "Assumed" line.** Every answer ends its figures with "Grid's own rule, not checked
   against any local standard", as the lab prototype marked its figures.

## Still open

- `grid sheet` has no country: its cover still leads with gross internal. `grid_compare` gives
  both gross areas as before.
- `packages/cli/src/describe/facts.ts` still reads `wall.kind === 'exterior'` (MSG-13's other
  lane B item); not an area, so left alone.
- ARE-14: party walls, outdoor weighting, free floor and per-flat or per-zone figures.
- ARE-8's card can be checked against its done-when: the measures table and the grep test are
  here.

## Checks run

After merging `main` (0d4d6f8), on a machine with a load average of about 210:

- `npm run build`: bundled, no output beyond the command.
- `npm run typecheck`: no errors in any of the four packages.
- `npm run lint`: no findings.
- `npm run check:licenses`: 363 licences, none GPL, LGPL, AGPL, MPL or EPL.
- `npx vitest run --exclude '.claude/**'`: 4,203 passed, 5 failed, of 4,208 in 197 files. Rerun alone:
  - `grid.e2e.test.ts` speed (half a second), `cropView.test.ts` boxes, `diff-size.test.ts`
    (1,000 entities in a second): pass alone. Timing under load.
  - `scoreboard.test.ts`: failed in the full run because it ran before the new turns figure was
    stored ("better than stored", not "same as"). Rerun alone after storing: 19 passed.
  - `pdf.test.ts`, "cuts a note taller than a page": times out at 60 s alone as well. It lays
    out an 8,000-word note; the other nine tests in the file build the same sheet and pass, so
    the time is in the text layout, not the areas. Not looked into further.
- `npm run scoreboard`: rooms measured wrong 197, damage silent 386, turns answered 16 (better),
  mistakes named 2, checks fed 5, rooms not measured 727, sound plans with a warning 95. Stored.
