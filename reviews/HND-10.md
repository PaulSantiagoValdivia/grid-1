# HND-10: trace over an image

Card: "A scan, photo or sketch can be traced over: the plan stores the image's position, scale,
rotation and floor, sets the scale from two points and a known length, draws the image under the
plan in the picture the agent gets back, and accepts only an image inside the project folder."
Lab evidence AU2 / WR-13 (the agent traced by eye because no picture showed the image), T-5
(six paths accepted), AE-11 and F36 (a photo has no scale without a known length).

CMD-15 had already made `loadPlan` refuse a trace path that leaves the project folder. Nothing
placed, scaled or drew the image: the schema held only `path`, `opacity` and `updatedAt`, and the
viewer's 2D view says "the reference image is not part of this viewer yet".

## What changed

- **The plan format (C31, `types/floorplan.ts`).** `referenceImage` takes `floor`, `at` (the
  plan point under the picture's top-left corner), `rotation` (degrees counter-clockwise about
  that corner) and a scale: `scale` in metres per pixel, or `calibration` (`from` and `to` in the
  picture's pixels, `length` in metres). Both at once, two equal points or a length of 0 are
  refused by the schema; the reader (`readParts.ts`) then leaves out that one field and keeps the
  image, with a `plan/value-left-out` line, instead of dropping the whole trace image. All new
  fields are optional and never defaulted, so a plan stating only `path` reads as before.
- **The geometry (`geometry/trace.ts`).** `traceScale`, `traceFloor`, `tracePixelToPlan` and
  `tracePlacement`: the scale and where it came from, the floor (stated, else the lowest), the
  four corners on the plan and one SVG matrix from pixels to the drawing's frame. An image with no
  scale is placed at `traceUnscaled`, 0.01 m a pixel, a new entry of the tolerance table and of
  `docs/tolerances.md`.
- **Reading the picture (`packages/cli/src/trace/traceImage.ts`).** `readTrace` reads the file
  through `Project.readBytes` (so CMD-15's resolver and link rules hold), knows a PNG or a JPEG by
  its header, takes its size from the header, turned as its EXIF orientation shows it (the picture
  is never decoded by Grid), and returns
  the picture as a `data:` address with one sentence on it. Missing, not a PNG or JPEG whatever
  its ending, over 32 MB, over 16,384 px along a side, under another floor or under a floor the
  plan lacks: not drawn, and the sentence says which. Nothing is refused here: a plan may name its
  picture before it is in the folder (CMD-15's rule).
- **The ending rule (`command/plan.ts`).** After CMD-15's path check, `loadPlan` refuses a trace
  path that does not end in `.png`, `.jpg` or `.jpeg` (any capitals), naming the plan, the path
  and the project folder. That closes the sixth T-5 case.
- **Drawing it (`viewer/src/picture/planSvg.ts`).** `PictureOptions.trace` takes the picture
  (`data:image/png` or `data:image/jpeg` only; anything else, a file path or an address, throws).
  `planPicture` draws one `<image data-part="trace-image">` with the placement's matrix and the
  image's opacity, after the rooms' fills and before every wall, opening, dimension and label, and
  frames the view round the drawing and the picture (the picture alone on a floor with nothing
  drawn). Skia draws an embedded PNG or JPEG with its opacity (checked before building), so the
  PNG needs no second path. The app's 2D view does not pass a trace, so VEW-1's byte-identity
  test is untouched.
- **Where it shows.** `grid draw` (a floor plan, any look) draws it and prints its sentence on
  standard error; `grid_view` with `kind=plan` draws it and adds the sentence to its text; the
  preview's picture comes from `grid_view`, so it shows there too. `drawFile` takes the project
  as a new last argument; a caller without one draws no trace.
- **Words.** Every new sentence is in `messages/en.ts` and a draft in `es.ts` (`trace.*`,
  `read.trace.*`), said with `say`; the refusal and the schema's two refusals too.
- **Docs.** A new section of `docs/plan-file.md`, "A trace image under the plan" (fields, the
  pixel formula, scaling a photo, what is refused and what is only not drawn, the hand-sketch
  path); a paragraph in `docs/commands.md` under `grid draw`; `grid_view`'s row in
  `docs/tool-server.md`; a layout bullet in `AGENTS.md`; `changes/HND-10.md`.

## Tests

- New: `floorplan/src/geometry/__tests__/trace.test.ts` (9), `viewer/src/picture/__tests__/trace.test.ts`
  (5), `cli/src/trace/__tests__/traceImage.test.ts` (17, among them the card's six T-5 cases one by
  one through `loadPlan`: another folder, `..`, a web address, a script, an absolute path, an
  ending that is not a picture), and one end-to-end case in `everyPath.e2e.test.ts`: a trace path
  ending `.sh` refused by every plan-reading command and tool of the built `grid.mjs`.
- Expected values changed, and why:
  - `floorplan/src/types/__tests__/reading.test.ts`, "names a field on every part and on the
    trace image": its unknown field on the trace image was `scale`, which Grid now reads. It is
    `zoom` now; the test still checks the same thing.
  - `cli/src/__tests__/ownWords.test.ts`: `geometry/tolerances.ts` 255 → 256 (the new entry's
    description, kind `developer`) and `viewer/src/picture/planSvg.ts` 3 → 4 (the refusal of a
    trace given as anything but a `data:` address, `developer`). The ratchet on sentences shown
    to the person is unchanged: those went into the message files.

## Checks

See "Results" at the end, filled in after merging the latest `main`.

## For the owner

Choices made for you; each is reversible.

1. **One trace image per plan**, with a `floor`, not a list with one per floor. A list later is
   additive (the field could take one image or a list). A two-storey survey traced from two scans
   needs that list, or one plan per floor until then.
2. **Unstated floor is the lowest floor**, the one `grid draw` and `grid_view` draw when none is
   asked for, not `defaultFloor` (the app's first floor at level 0). Same for one-floor plans.
3. **No scale draws at 1 cm a pixel** (`traceUnscaled`) and every answer says it is not to scale,
   rather than refusing to draw it or fitting it over the plan. An agent with only a photo sees it
   at once; the sentence asks for the two points and the length.
4. **Calibration sets the scale only.** Position and turn stay `at` and `rotation`. Two points with
   their plan positions could set all three at once (a two-point placement); not built.
5. **Drawn over the rooms' fills, under every line**, not under everything: the working look's
   room fills are opaque and hid the picture completely (seen in the first picture drawn).
6. **Pictures are `.png`, `.jpg` and `.jpeg` only.** No SVG (it can carry a script, one of the T-5
   cases), WebP, HEIC (iPhone photos), GIF or PDF. The bytes are checked too: a file whose header
   is not PNG or JPEG is not drawn, whatever its ending.
7. **Limits** of 32 MB and 16,384 px a side are constants in `traceImage.ts`, not the tolerance
   table, which holds the drawing checks.
8. **Where it is drawn:** `grid draw` in every look (the technical look too) and `grid_view`'s plan.
   Not in the sheet (`sheet/coverage.ts` keeps "not shown"), the exports, the 3D still, a facade
   or section, or the preview page's own live SVG (its picture shows it). An SVG from `grid draw`
   carries the whole picture inside it.
9. **A phone JPEG's EXIF turn counts.** Skia applies a JPEG's EXIF orientation inside an SVG
   (checked: a 40 × 20 picture marked orientation 6 is drawn 20 × 40), so `pictureHeader` reads
   the orientation too and gives the size as shown; calibration pixels are counted on the picture
   as shown. Tested with made-up EXIF in both byte orders, not with a real phone's photo.
10. **A trace floor the plan lacks is said in the picture's answer only**, with no `grid check`
    code (no new code in the record, no catalogue entry). A `plan/trace-unknown-floor` code is a
    small follow-up if wanted.
11. **The hand sketch** is a documented path (rooms first from the sketch's numbers, the sketch as
    the trace image, marks `given` and `assumed`), not a new `grid write --given` switch that marks
    every written part given. That switch would touch `grid write`'s stamp and `grid_write_rooms`
    (a hot file); it is the natural follow-up.
12. **C31** is used, for the trace image convention in the header.

## Scoreboard

Filled in at the end.
