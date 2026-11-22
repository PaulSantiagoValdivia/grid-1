# SHT-6: one printable sheet at true scale, with scale bar, caption and title block

## What changed

- `grid sheet --scale 1:100 --paper A4` (or `--layout drawing`) writes one floor as a drawing to
  print and measure: a vector PDF, an SVG and a PNG, into `exports/<name>-drawing.*` (the second
  floor of a plan with several: `<name>-floor-2-drawing.*`), or beside `--out`'s PDF. Options:
  `--scale 1:N` (1 to 1000), `--paper A4|A3|A2|A1|A0`, `--floor <id>`, `--room-sizes on|off`.
  Left out, the scale is the largest of 1:100, 1:200, 1:500 the floor fits and the paper the
  smallest that holds it; a floor too large for the paper asked for is refused, naming the paper
  that fits at that scale and the scale that fits that paper.
- `grid_sheet` takes `layout: "drawing"` with `scale`, `paper`, `floor` and `roomSizes` (refused
  with `client` or `check`), writes the same three files and answers with the PNG as its image.
- `packages/cli/src/sheet/drawingSheet.ts` lays the sheet out in paper millimetres as SVG
  elements: the floor is the technical look's `planPicture`, nested at its true size (its view in
  plan metres × 1000 / N mm), with the paper, a frame, a caption, the notes, a scale bar, the
  north arrow and a title block (project, drawing, scale and paper, date, status, the label).
  Picture pixels are sized so a dimension figure prints at 2.5 mm (`PIXEL_MM`); the picture's
  lines are already in paper millimetres from the pen set for 1:N.
- `packages/cli/src/sheet/vector.ts` draws those elements onto a canvas as paths and text. Skia
  rasterises an SVG handed to it as an image (checked: the PDF had an image XObject), so the PDF
  is drawn element by element instead; the PNG is drawn the same way. Text uses the bundled
  Source Sans 3 (embedded by Skia as Type3 outlines with a ToUnicode map, as VEW-7's sheet).
- `packages/cli/src/sheet/drawingFiles.ts`: the PDF (page in points, drawn in mm), the PNG
  (150 dpi, at most 4,000 px on the longer side) and a text measure for wrapping.
- Viewer: `PictureOptions.roomSizes` (room dimensions on or off) and `pictureFrame` (the framed
  part of the plan before the margin). Both default to what was drawn before: no picture changes.
- `pages.ts` exports `sheetDate`. Messages: 14 `sheet.drawing.*`, `sheet.block.*`,
  `sheet.status.draft`, `sheet.north.*`, `sheet.scaleBar.metres` keys in `en.ts` and `es.ts`
  (the Spanish is a draft, as the rest of `es.ts`).
- Docs: `docs/commands.md` (a "One floor at a true scale" section under `grid sheet`, and a row in
  the command table), `docs/tool-server.md` (the `grid_sheet` row). Fragment: `changes/SHT-6.md`.
- C32 is unused: no plan field and no convention.

## How "done when" is met

- `grid sheet --scale 1:100 --paper A4` writes a vector PDF and an SVG (and a PNG): the e2e test
  runs the built `grid.mjs`, reads the PDF back with a small reader (`sheet/__tests__/readPdf.ts`:
  inflates the content stream, follows `cm`, `q`/`Q`, paths and text through ToUnicode), and
  measures the 10 m wall's fill: 100.00 mm. The PDF holds no image. Unit tests measure a
  10 × 6 m room at 1:50, 1:100 and 1:200 (outside faces 10.2 × 6.2 m to 0.01 mm) and the scale
  bar (5 m = 50 mm at 1:100).
- The scale bar, caption, title block, north arrow and the label are read back as text from the
  PDF (and the arrow is one element, turned to the plan's north; a plan with no north gets no
  arrow and the note "North is not stated in the plan.").
- Linux: nothing macOS-only. The PDF and PNG come from `@napi-rs/canvas` (prebuilt for Linux,
  macOS and Windows), no JPEG or system image step.

## Tests whose expected values changed

None. Every new expectation is in new tests: `sheet/__tests__/drawingSheet.test.ts` (24),
the SHT-6 block of `command/__tests__/sheet.e2e.test.ts`, the SHT-6 block of
`mcp/__tests__/sheetTool.test.ts`. `src/__tests__/ownWords.test.ts`: counts for the files with new
English refusals (see the results below).

## For the owner

- **Status is always "Draft".** The title block's status is fixed; no option sets it, so no sheet
  can say "approved" or "for construction". Adding `--status` from a closed list is easy later.
- **No north stated: no arrow.** Grid does not guess north from the top of the page; the sheet
  says north is not stated.
- **Papers A4 to A0 only**, ISO. No US Letter or ANSI sizes yet.
- **Scale bar in metres** even for a plan displayed in feet (its dimensions follow the plan's
  display). A feet bar for a feet plan is a follow-up.
- **Defaults**: 1:100 first, then 1:200, then 1:500; smallest paper; orientation by the drawing's
  shape. Room sizes on.
- **One floor per call.** A plan with several floors needs a call per floor (`--floor`); the file
  names carry the floor's place.
- **The drawing's key band is left off** on this sheet (as VEW-7's floor pages do). A plan whose
  phases or hatches need a key shows them without one here.
- **Project name**: `sheet.json`'s name, else the plan's title, else the file's export name.
- **Room labels stay sized in pixels** inside the picture (2.95 mm names, 2.5 mm areas and
  figures, 2.27 mm room sizes at `PIXEL_MM`); the sheet's own text is in millimetres.
- **No new dependency**: the card expected one for a vector PDF; Skia's PDF writer, already in
  for VEW-7, does it once the elements are drawn as paths.

## Check results

(Filled in after the final run.)
