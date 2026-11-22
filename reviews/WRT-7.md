# WRT-7 review: feet and inches, millimetres and the decimal comma, in and out

For the owner. What WRT-7 adds, how each `done_when` is met, every expectation that changed,
and the choices taken while you were away.

## What it adds

- **One reader and one writer of lengths** (`packages/floorplan/src/types/units.ts`):
  `readLength` takes a number in metres, or text with its unit (`3.81 m`, `381 cm`, `3810 mm`,
  `12'6"`, `12'-6"`, `12 ft 6 in`, `150"`, `6 1/2"`), and the decimal comma when it is chosen; it
  refuses what it cannot read and anything past the tolerance table's `largest`, in words.
  `showLength` and `showArea` write metres, centimetres, millimetres, or feet and inches
  (`12'-6"`, a height in inches as `48"`), with a decimal point or comma.
- **A plan file in another unit** (`"units": "mm"`, `"cm"`, `"ft"`, `"in"`) is read in that unit
  (`planInMetres`, called at the start of `readPlanParts`), with a `plan/read-as-meant` line. A
  change to it is written back in metres (`writeChange`), the only unit Grid writes. Before, MSG-6
  read such a file as if it were in metres. A unit Grid has no word for keeps the old behaviour.
- **`display` in the plan format** (optional, never defaulted, version 1, CNT-1): `length`,
  `area`, `decimal`, `precision`. It changes no stored number. The sheet's coverage table places
  it ("not shown").
- **Lengths in**: every tool argument that is a length (24 of them) takes text with its unit,
  and a comma with `decimal: comma`; its schema is `["number", "string"]` with a `maxLength`.
  `decimal` is read before the other arguments. `grid edit` passes length options through as
  typed.
- **Lengths out**: `units` (`m`, `cm`, `mm`, `ft-in`, `ft`) and `decimal` on `grid_areas`,
  `grid_takeoff`, `grid_schedule`, `grid_measure` and `grid_view`; `--units` and `--decimal` on
  `grid draw`. Left out, the plan's `display`. The viewer writes room areas and dimensions in the
  drawing's display (`withDisplay` in `canvas2d/labelPlacement.ts`, set by `planScene` for the one
  drawing it makes).

## The done_when items

1. `12'6"`, `3810 mm`, `381 cm` and `3,81` with the decimal comma are all 3.81 m
   (`types/__tests__/units.test.ts`; through the tool server in `tools.test.ts`, "lengths typed
   with their unit", where all five write the same file). A bare `1,2192` in a plan file gives
   exactly one line, and it names the decimal comma (`quantities/__tests__/display.test.ts`). That
   was already MSG-6's work; WRT-7 holds it with a test.
2. With feet and inches, the drawing's dimensions print `12'-6"`, `grid_areas` prints
   `12'-6" × 9'-5"`, and `grid_schedule` prints `sill 48"`. With millimetres the drawing prints
   `3810` and `2860` (`display.test.ts`). The plan's own `display` gives the same without the call
   naming it.
3. The plan file is byte-identical after it is drawn, measured and scheduled under all four
   units and both decimal marks, and the same change typed as `0,3`, `300 mm`, `30 cm` or `0.3`
   writes the same bytes (`display.test.ts`).

## Expectations changed

- `mcp/__tests__/replay/replay.test.ts` (estate agent 5): feet and inches are now `15'-1" ×
  11'-10"`, not `15' 1" × 11' 10"`, the style the card asks for (`12'-6"`).
- `floorplan/src/types/__tests__/readParts.test.ts`: `units: "mm"` is now read in millimetres
  with a `read-as-meant` line, not left out; a made-up unit (`furlong`) still gets
  `value-left-out`.
- `mcp/__tests__/tools.test.ts`: a length argument's schema may be `["number", "string"]` with a
  minimum, a maximum and a maxLength.
- No golden file, snapshot or scoreboard figure changed.

## For the owner

0. **The built file's size cap** is 500 kB on main since SHT-7, which raised it on its own; this
   branch had raised it the same way and now takes main's comment. WRT-7 adds about 9 kB, and the
   merged file is 466,329 bytes. No dependency was added.
1. **What stays in metres for now.** The check's report (its figures come from building codes,
   printed in metres), the sheet, the edit answers and the exports (DXF, IFC are metric by their
   own rules) do not follow the display yet. The card lists "reports and messages"; I covered the
   measuring reports, the schedules and the drawing, and recorded the rest here as the next step.
2. **Rooms text takes no units.** Its numbers are still plain metres: `x,y` points use the comma,
   so a decimal comma there would need its own rule. Unchanged.
3. **Feet and inches style.** `12'-6"` for lengths, inches alone for a sill (`48"`); whole inches
   unless `precision` asks for halves to 32nds. Square feet keep square metres beside them in the
   measuring tools, as before.
4. **`ft` stays** as an alias of `ft-in` on the four measuring tools, so calls that used it keep
   working.
5. **The display is per plan or per call.** There is no per-project setting in `grid.json` yet.
