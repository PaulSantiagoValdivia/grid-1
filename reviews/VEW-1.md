# VEW-1: pictures of the plan and the 3D model without a browser or the app

Card: "Grid turns a plan into a picture file (SVG and PNG) from a plain call or command, with no
browser and no running app, using one drawing function shared with the app." 3D stills are
VEW-10, already merged.

## What existed already

Most of the card was on `main` (56ed9b5) before this branch:

- `grid draw plan.json` writes one floor as SVG and `grid draw plan.json --png` as PNG, from
  `drawFile` (`packages/cli/src/command/draw.ts`), which calls `drawPlan`
  (`packages/cli/src/draw/drawPlan.ts`). `--3d` writes the 3D still (VEW-10). `grid.e2e.test.ts`
  already runs the built bundle for both ("writes a PNG, twice as large with --scale 2", "prints
  the PNG bytes when the output goes to a program").
- The PNG is the SVG drawn by Skia through `@napi-rs/canvas` 1.1.0 (MIT), already a dependency
  of `ongrid`, listed as optional in the npm manifest (CMD-9), kept outside `grid.mjs` by
  `packages/cli/build.mjs` (`external`), and loaded on the first PNG (`src/draw/canvas.ts`). It
  ships ready-built binaries for Linux, macOS and Windows, so nothing is compiled at install. It
  is the "native canvas from node_modules" the tool server's tests draw with.
- No browser: both formats are plain Node calls. `packages/floorplan` has no DOM: its
  `tsconfig.json` has `lib: ["ESNext"]` only, and `src/__tests__/purity.test.ts` holds it. This
  branch changes nothing in `packages/floorplan`.
- One drawing function: the app's 2D view (`Canvas2D`) and every picture lay a floor out with
  `planScene` (`packages/viewer/src/picture/scene.ts`); `Canvas2D` turns its nodes into React
  elements (`toReact`), `planPicture`/`pictureToSvg` into text (`toSvg`).
  `packages/viewer/src/picture/__tests__/picture.dom.test.tsx` already held the app's `<svg>`
  contents to `planPicture`'s nodes byte for byte, in the working and dark looks.

## What was missing, and what changed

1. **Proof on the command's side and in the command's look.** The existing test compared the
   app with `planPicture` in `@ongrid/viewer`, not with `drawPlan`/`drawFile`, which `grid draw`
   calls; and not in the technical look, `grid draw`'s default, because `Canvas2D`'s `look`
   prop was typed `PlanLook` (colours only), so the app could not be given it.
   - `Canvas2D`'s `look` prop now takes `Look | PlanLook`, as `planScene` already did. A type
     change and its comment; nothing at run time changes, and the default stays `LIGHT_LOOK`.
   - New `packages/cli/src/draw/__tests__/sameDrawing.dom.test.tsx` (jsdom): renders the real
     `Canvas2D` for the lab's eight buildings (`packages/floorplan/fixtures/*.json`) in each of
     the three looks (24 cases), at the size `grid draw` draws (1200 px wide, height from the
     plan's shape, `pictureView`), and asserts that the file `drawPlan(plan, { format: 'svg',
     look })` writes is exactly its root and paper `<rect>`, then the app's `svg.innerHTML`, then
     `</svg>\n`. A second case goes through `drawFile` itself (the record's lines from
     `inspectPlan` included) in the technical look: where the floor drawn has no fault mark and
     no undrawn room (4 of the 8 buildings), the drawing is the app's byte for byte. The app
     draws no fault marks, so the other 4 cannot be compared that way.
2. **Timing.** New `packages/cli/src/draw/__tests__/pictureTime.test.ts`: times `drawFile` as
   SVG and as PNG per plan and prints median, 95th percentile, max and the five slowest. In the
   suite it times the eight buildings with a 10 s guard per picture (ten times the card's
   second, so a busy machine does not fail it). With `GRID_TIME_ALL=1` it times every lab plan
   in `scoreboard/data/lab-plans.ndjson.gz` that reads as a plan and has at most
   `GRID_TIME_MAX_ROOMS` rooms (600 by default) and holds none to the guard.
3. **NOTICE** names `@napi-rs/canvas` 1.1.0, its MIT licence, that it is a dependency rather than
   copied code, that the `.mcpb` bundle carries it unchanged with its LICENSE, and that its
   binary holds other libraries listed in its `sbom.cdx.json`.
4. **Docs**: a new section in `docs/commands.md`, "A picture of the plan: `grid draw`": SVG and
   PNG, no browser, the shared function and its test, the canvas and its licence, the timings.
   No agent-visible output changed, so `docs/result-contract.md` and `docs/tool-server.md` are
   unchanged.

## Expected figures and texts changed, and why

No existing test expectation changed. Two new test files, above. No scoreboard count moved (see
Checks).

## Timings

All under heavy load from other sessions on this machine (12 cores). Times are `drawFile`, the
work `grid draw` does once the plan is read: the record's lines (`inspectPlan`), the drawing,
and for a PNG the rasterising. Process start-up and reading the file are not in them.

Every lab plan that reads as a plan with at most 600 rooms (1,093 of 1,131 rows; 9 larger ones
left out, the rest do not read as a plan), `GRID_TIME_ALL=1`, run alone. Load average at the
start `151.46 156.55 173.06`, at the end `204.25 178.14 178.49`:

| | Median | 95th percentile | Max | At or over 1 s |
|---|---:|---:|---:|---:|
| SVG | 21 ms | 193 ms | 17,521 ms | 3 of 1,093 |
| PNG | 64 ms | 282 ms | 16,980 ms | 7 of 1,093 |

The slowest: the lab's size test `grid-500-pieces` (500 rooms on one floor) 17.5 s as SVG and
17.0 s as PNG; `grid-100-pieces` (100 rooms, two copies) 1.4 to 1.8 s; then the
`d5-block-with-basement` (160 rooms) at 855 ms SVG and the 21-storey block (529 rooms, one floor
drawn) at 778 ms. Of the PNGs over 1 s, `basement-alone` (3 rooms, 1,446 ms) is the first plan
of the run, which loads the native canvas, and `d4-coliving-first-try` (19 rooms, 1,159 ms) is
most likely the load: its SVG, which does the same checks and layout, is not among the five
slowest (all of 778 ms or more). I did not rerun it alone.

The eight buildings alone (the suite's run), load average `145.95 155.67 173.04`: SVG median
105 ms, max 318 ms; PNG median 138 ms, max 1,058 ms (`berlin-flat`, the first PNG, which loads
the canvas; the next slowest 185 ms).

Above 600 rooms: one earlier run, at a load average near 200, drew `grid-5000-pieces` (5,000
rooms, 10,150 walls on one floor) as SVG in 723 s. On `grid-500-pieces` (load about 135) the
time splits as `inspectPlan` 4.0 s, `planPicture` 5.8 s with the fault marks (4.0 s without),
the SVG text 0.09 s and Skia about 0.3 s: it is the scene and the checks that grow, not the
picture file or the PNG.

## For the owner

- **"`--png` writes an SVG and a PNG"**: read as "`grid draw` writes the SVG, and `--png` the
  PNG of the same drawing, both without a browser", which is what `main` does. `--png` still
  writes one file, the PNG. The other reading, that one `--png` run writes both files, is not
  built: with `--out plan.png` it would write a second file the person did not name (and could
  overwrite one), and to standard output only one file can go. If you want it, it is a small
  change in `main.ts`'s `draw` branch (write `plan.svg` beside the named `.png`) and a line in
  `docs/commands.md`; say so.
- **Under a second each, on a quiet machine**: not shown, as the machine was never quiet. On it,
  loaded at 150 to 200, 19 in 20 lab pictures took under 300 ms and the median was 21 ms (SVG)
  and 64 ms (PNG). The lab's size tests do not meet it and likely will not on a quiet machine
  either: 100 rooms on a floor about 1.5 to 2 s, 500 rooms about 17 s, 5,000 rooms 723 s, under
  load. The time grows faster than the plan, in `inspectPlan` and `planPicture`. Making them
  fast is work of its own (a card for the checks and the label placement), not done here.
- **The canvas's licence**: `@napi-rs/canvas` and its platform packages are MIT, and
  `npm run check:licenses` passes. But the binary's own bill of materials
  (`@napi-rs/canvas-<platform>/sbom.cdx.json`) lists four Rust crates under MPL-2.0, Servo's
  `cssparser`, `cssparser-macros`, `dtoa-short` and `selectors`, built into the one `.node` file
  with Skia and the rest (BSD, MIT, Apache-2.0, Zlib, FreeType, ICU, libpng and others). The
  check reads `package-lock.json` only, so it cannot see them. AGENTS.md says no dependency may
  be under MPL; whether a component inside a permissively licensed dependency's binary counts is
  your call. It matters most for the `.mcpb` bundle, which carries the binary (MPL-2.0 lets a
  binary be passed on when its covered source stays available, which crates.io keeps). The
  alternatives I looked at are no better on this rule: `@resvg/resvg-js` is MPL-2.0 itself,
  `sharp` brings libvips under LGPL, and a pure-JS rasteriser does not exist for this SVG without
  writing one. I kept the canvas, which was already there, and changed nothing about it: the
  reversible path. NOTICE says where its components are listed.
- **NOTICE names the canvas's copyright holder as "its author"**: its LICENSE gives only an email
  address, which I did not copy into the repository.
- **SHT-7, on `main` since, writes on the drawing** (a title and key band, notes, a sketch). The
  eight buildings carry none of it, so the new test does not say whether the app's view draws
  that writing as the file does. Once merged, a building with writing added to
  `sameDrawing.dom.test.tsx` would settle it.
- **The 450 kB bundle cap fails on `main` already.** `packages/cli/dist/grid.mjs` builds to
  459,241 bytes on this branch, and nothing this branch changes is in it (`Canvas2D` is not
  bundled, and the change is a type). So `grid.e2e.test.ts` "starts with a shebang and is one
  file" fails here as on `main`; I left the cap to the card that grew the file.

## Checks run

- `npm run build`: built `packages/cli/dist/grid.mjs`, 459,241 bytes.
- `npm run typecheck`: no errors, every workspace, `scripts` and `scoreboard`.
- `npm run lint`: no problems.
- `npm run check:licenses`: "Checked 363 licences in package-lock.json: none is GPL, LGPL, AGPL,
  MPL, EPL."
- New tests alone: `sameDrawing.dom.test.tsx` 26 of 26 passed; `pictureTime.test.ts` 1 of 1
  (default), and 1 of 1 with `GRID_TIME_ALL=1`.
- Full suite, `timeout 1500 npx vitest run --exclude '.claude/**' --maxWorkers=2
  --minWorkers=1`, load average `211.11 181.42 179.66` at the start and `335.72 317.29 260.35` at
  the end: 225 of 227 files and 4,579 of 4,581 tests passed, in 988 s. The two failures are not
  this branch's, and neither is about time:
  - `grid.e2e.test.ts` "the built file > starts with a shebang and is one file": 459,241 bytes
    against the 450,000 cap (see For the owner).
  - `mcp/__tests__/reportProblem.test.ts` "a draft from the S-11 plan > replaces room names by
    their uses and every id, and holds no path": the draft has no `<path>`. It fails alone too
    (1 of 12). `main` has fixed it since this branch was cut (f29ccb8, "CMD-13's S-11 draft puts
    the path where the cut keeps it").
- `npm run scoreboard`: "Same as the stored figures." (rooms measured wrong 197, damage that
  passes in silence 386, turns answered 16, design mistakes named 2, checks the plan can feed 5;
  guards 735 and 95), in 267 s. Nothing to store.
- `main` has moved since 56ed9b5 (QAR-7, SHT-7 among others; SHT-7 touches `Canvas2D.tsx`,
  `scene.ts` and `planSvg.ts`). In a throwaway detached worktree, this branch merged with `main`
  without conflict, the two new test files passed there (27 of 27), and `tsc` passed for
  `packages/viewer` and `packages/cli`. QAR-7 speeds the door-swing check on large plans, so the
  timings of the lab's size tests above may be lower on `main`; I did not measure them there.
  That merge first conflicted in `docs/commands.md` only, beside SHT-7's new section; the picture
  section now sits after the 3D one and the branch merges with `main` without conflict.
