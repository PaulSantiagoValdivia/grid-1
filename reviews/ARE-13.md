# ARE-13 review: quantities for a first estimate, and a cost from the person's own rates

For the owner. What ARE-13 adds, how each done-when item is met, every expectation that changed,
the choices made without you, and what is left.

## What ARE-13 adds

`grid_takeoff` with `for=estimate` gives the bill of quantities a first estimate needs. Each line
has a key a rates file can price, a quantity in m², m or nr, its rule in one sentence and an
`assumed` mark (`packages/cli/src/quantities/estimate.ts`, `planEstimate`):

| Key | Built on |
|---|---|
| `floor:<use>`, `wall_finish:<use>`, `ceiling`, `skirting` | the rooms' take-off (`roomTakeoff`, `takeoff.ts`), grouped by the room's stated use |
| `reveals`, `door:<w>x<h>`, `window:<w>x<h>` | the opening facts, each opening once (as the schedule counts them) |
| `wall:<kind>:<thickness>` | the floor's wall facts: centre line × height, less openings |
| `external_finish`, `slab`, `roof` | a new library function, `planShell` (`packages/floorplan/src/geometry/shell.ts`) |
| `upper_floor`, `gross_internal` | the areas (`planAreas`), less stated stairs' footprints (LVL-3) |

`planShell` reads each floor's outline from `floorSpaces`, which now also returns it
(`FloorSpaces.outline`, added, nothing else changed in `spaces.ts`). It shares the outline's edge
out wall by wall (two walls in a row split the edge where they meet, each at its own height) and
works out the part of each floor that no floor above covers. Its only tolerances are
`tolerance('gap')`, `noLength`.

A cost comes only from the person's rates file (`packages/cli/src/quantities/rates.ts`):
`readRates` reads it through `projectFiles.ts`, `parseRates` checks it, `priceEstimate` prices the
lines, `rateCard` gives the fill-in file, `estimateCsv` the CSV. Grid has no price anywhere.

## The done-when items

1. **The 26-room floor matches the hand-worked figures; the call takes under 1 s.** The plan is
   already a repo fixture, identical to the lab's `s-d1-four-flats/plan.json` (checked field for
   field): `packages/floorplan/fixtures/rooms/four-flats.plan.json`, so no copy was made. The test
   holds 14 figures, each worked by hand in its comment (`estimate.test.ts`, "AC-1: the 26-room
   floor"):

   | # | Figure | By hand | Grid | Lab bill |
   |---|---|---|---|---|
   | 1 | Floor finishes, every use | 419.48 m² | 419.48 | 419.48 (oak 339.45 + tile 80.04) |
   | 2 | Ceilings (assumed) | 419.48 m² | 419.48 | 419.48 |
   | 3 | Inside wall faces, every use | 1,093.12 m² | 1,093.12 | 1,005.04 + 88.08 tiling = 1,093.12 |
   | 4 | Skirting | 391.20 m | 391.20 | 391.20 |
   | 5 | Reveals | 51.92 m² | 51.92 | 51.92 |
   | 6 | Exterior walls 0.35 | 210.00 m² | 210.00 | 210.00 |
   | 7 | Interior walls 0.25 | 133.00 m² | 133.00 | 133.00 |
   | 8 | Interior walls 0.3 | 66.08 m² | 66.08 | 66.08 |
   | 9 | Interior walls 0.2 | 28.00 m² | 28.00 | 28.00 |
   | 10 | Partitions 0.12 | 245.28 m² | 245.28 | 245.28 |
   | 11 | Outside face | 213.92 m² | 213.92 | 213.92 |
   | 12 | Doors and windows, each once | 21 + 17 = 38 nr | 38 | 38 |
   | 13 | Slab (assumed) | 483.52 m² | 483.52 | 483.52 |
   | 14 | Gross internal area | 452.72 m² | 452.72 | 452.72 |

   Beside them: doors and windows by size, the bathrooms' floor (35.23 m²), the roof (483.52 m²,
   assumed) and the lab's plasterboard order (578 sheets). **AC-1's own 14 tests** in the lab
   (`lab/AC/tools/test_qto.py`) are on the one-room plan, the two-bed flat and the hotel floor,
   not on the 26-room floor; the one-room plan's quantity and cost figures are ported as a second
   block ("the lab's one-room plan"), the plan written into the test as data. Their heat-loss,
   tile, paint-litre and XLSX tests are not ported (see below). The 1 s test is skipped when the
   load is above the core count; on this machine at a load of 40 to 50 the call took 47 to
   193 ms (six calls, the first cold).
2. **No rates file: a rate card, no money.** Every line with its key and `rate per <unit>`, the
   format of the file, and `rateCard` in the data, ready to save as `rates.json`. A rates file
   with no currency is refused, naming the file. A rate in the wrong unit is listed apart
   (`cost.wrongUnit`, and its own sentence) from lines with no rate (`cost.missing`); neither is
   priced. Tests: "AC-2: a cost only from the person's own rates" and "grid_takeoff with
   for=estimate".
3. **Every line carries its rule; lines resting on an assumed slab or roof are marked.** The
   slab, `upper_floor`, `roof` and `ceiling` are assumed, and their rule opens "Assumed: … because
   the plan holds no …". An order resting on an assumed line is assumed. On the odd house the roof
   is 83.31 m² (39.32 over the single-storey part, 43.99 over the first floor), not the top
   floor's 43.99 (AC-6). Tests: "AC-6: the slab and the roof".

Tests: `packages/cli/src/mcp/__tests__/estimate.test.ts` (36, one skipped under load),
`packages/floorplan/src/geometry/__tests__/shell.test.ts` (3).

## Expectations changed

- `packages/cli/src/command/__tests__/everyPath.e2e.test.ts`: `rates` is a path argument, so it
  has a slot (`grid_takeoff` with `for=estimate`), and the list of path argument names the test
  looks for adds `rates`. All 22 pass.
- No other expectation changed. `grid_takeoff` without `for` answers as before, with one more
  text line at the end saying `for=estimate` exists; the replay and tools tests pass unchanged.

## For the owner

1. **How it is asked for: `grid_takeoff` with `for=estimate`, no new tool.** The tools keep their
   order and count (21). `rates` names the file; left out, Grid reads `rates.json` beside the
   plan when there is one. `rates` without `for=estimate`, and `rooms` with it, are refused. No
   `grid` command: as for ARE-12, one is easy to add later and would need its every-path slot.
2. **Finishes by room use.** The plan holds no finishes (AC-4), so floor finishes and wall faces
   are one line per use (`floor:bathroom`), and the person prices by use; `floor` alone prices all.
   The lab took finishes from its rates file; Grid keeps the rates file to rates.
3. **No wall tiling line.** It needs a tile height per room, which neither the plan nor a rate
   can say; the bathroom's wall faces can be priced as tiled to full height by key. This is why
   figure 3 is the lab's wall finish plus its tiling.
4. **Keys follow the lab's where they fit** (`floor:`, `ceiling`, `wall_finish`, `skirting`,
   `reveals`, `wall:<kind>:<t>`, `external_finish`, `door:`, `window:`, `roof`, `upper_floor`);
   renamed: `slab` (lab `ground_floor`) and `gross_internal` (lab `gia_rate`). A shorter key covers
   longer ones; an exact key wins.
5. **Walls by the kind the plan states**, like the existing take-off; the lab decided "outside"
   by geometry. On the lab's plans they agree.
6. **Reveals of doorless openings are left out**, as the lab did; the rule says so.
7. **The upper floor takes off the footprint of each stated stair arriving on it** (LVL-3 now
   exists), which AC-6 could not. Assumed.
8. **A rate may carry `waste`**, a share added before pricing; **orders** (`orders` in the rates
   file: `for`, `covers`, `coats`, `waste`, `pack`) give whole packs. Grid adds no waste or pack
   size of its own. Skirting is ordered as one length, not cut stretch by stretch as the lab did.
9. **CSV only, no spreadsheet with formulas.** The CSV writer writes a cell that starts like a
   formula as text (an existing safety rule), so amounts are values. The lab's XLSX would need
   its own writer; left out.
10. **The whole-building line is an alternative**, never in the total, and no rate for it is not a
    gap. A rate that prices no line is named (to catch a mistyped key). A total that is not the
    whole cost says so, with the lines.
11. **Quantities stay in metres.** `units=ft` writes feet beside them; rates per ft² and ft are
    turned into m² and m, and a rate in any other unit is not used.
12. **A plan with a room Grid cannot draw is still priced**, with a note naming the room and
    saying the room lines are short by it. AC-9's "refuse unless told to" was not taken up.
13. **The rates file is refused strictly**: no currency, a negative rate, an unknown unit, a key
    that is not a key, or a field Grid does not read; the refusal names the file and the part,
    never the person's text.

## What's left

- Wall tiling to a height, finishes by name and zones (AC-4, EL-13); wall, door and window types
  (AC-5, AC-13); phases, so a change is costed as demolish, make good and new (AC-3, EL-10).
- What lies above and below a floor that is part of a larger building (AC-7, EL-17): such a
  floor gets a slab and a roof.
- Per-flat grouping (AC-16), an XLSX with live formulas, heat loss and running cost (AC-12), and
  quantities in the IFC (AC-11).
- When LVL-4 brings slabs and roofs into the plan, `slab`, `upper_floor` and `roof` should read
  them and drop their assumed mark.

## Checks run

CHECKS_LINE
