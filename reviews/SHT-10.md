# SHT-10: walls by kind, 1:50 detail, tints with a key, light files and contrast

Branch `claude/sht-10`, cut from `main` at c0a4ba22, merged with local `main` at dafe1530 (CNT-7;
the only conflict was the two message files' tails, both sides kept). No plan-format convention (C27 is unused:
everything here is an option of the looks, not a plan field). Changelog fragment
`changes/SHT-10.md`. Docs: `docs/commands.md` "How each look draws a plan" (new section), the
`grid draw` row and "What a drawing shows"; one phrase of the `grid_view` row in
`docs/tool-server.md`; three rows changed and one added in `docs/tolerances.md`.

## What changed

**Core (`packages/floorplan`).**

- `PlanWall` gains `partition?: true` (a stated partition whose worked-out exposure is interior)
  and `material?: string` (its wall type's material, CNT-15). `PlanOpening` gains `above?: true`
  for a window wholly above the plan's cut: its sill at or above `planCutHeight`, or a
  high-level window (CNT-14). All three are left out when they do not apply.
- New `geometry/detail.ts`: `wallDrawnKind` (outside for `exterior` and `separating`, partition
  for a stated partition inside, inside otherwise), `planWallMaterials` (the wall types'
  materials in list order: the order a material takes its hatch in), `hatchLines` (parallel lines
  cut to a ring, concave allowed, set out from the plan's origin so hatches run on across a joint)
  and `openingDetail` (two frames, a window's two panes and its two sills).
- Tolerances: new `sillProjection` (0.03 m). `frameFace`, `frameDepth` and `glassThickness` keep
  their values; their descriptions now say they also size the plan's detail.
- Messages: `drawing.key.partition`, `drawing.key.material`, `drawing.key.finish` (en, es draft).

**Looks (`packages/viewer/src/picture/look.ts`).** Each refinement is an option of a look:

- `walls: { fill, pen? }` by drawn kind. Working: outside `#121210`, inside `#57544e`, partition
  `#827e75`. Dark: `#f3f1ec`, `#aea9a2`, `#847d72`. Technical: tones `#595959`, `#8c8c8c`,
  `#c8c8c8` inside the black outline, pens cut, cut, medium. `PlanLook` gains optional
  `wallInside` and `wallPartition` (new CSS tokens `--plan-wall-inside`, `--plan-wall-partition`),
  and `lookWithColors` builds the fills from them, so the app's canvas still draws what a picture
  draws, byte for byte.
- `aboveDashed` (true in every named look): what lies above the cut is dashed; now also a window
  above the cut, in every look.
- `detail: { from, hatchSpacing, hatches } | null`: technical only, from the 1:50 pen set (up to
  about 1:70), hatches 1.5 mm apart, six patterns in turn. `detailShown` says when.
- `tints: { uses, finishes }`: light tints (`USE_FILLS`, new `FINISH_FILLS`) and new dark ones
  (`DARK_USE_FILLS`, `DARK_FINISH_FILLS`) for the dark look.
- `fileLook` (a look on dark paper gives the working look) and `FILE_LOOK_NAMES`
  (`working`, `technical`).
- Contrast fixes (light, and the same in `plan-tokens.css`): soft label and soft dimension text
  `#75726a` to `#66635c`, dividing line and soft dimension line `#b3afa2`/`#a9a598` to `#817e75`,
  warning `#b4531a` to `#a14a17`, existing-phase fill `#9b968b` to `#7f7a70`, site path, paving,
  pool and tree edges darker. Dark: soft text `#8a8175` to `#9f988e`, dividing and soft dimension
  lines `#635a4d` to `#817a70`, existing-phase `#7a7266` to `#867e70`, site edges lighter.
- New `contrast.ts`: `relativeLuminance`, `contrastRatio`, `lookPairs` (every text and symbol
  colour of a look against the paper, a room and every tint; site edges against the paper and their
  fills) and `CONTRAST_LEAST` (4.5 text, 3 symbols, WCAG 2.2 SC 1.4.3 and 1.4.11, cited by number
  only).

**Drawing (`scene.ts`, `writing.ts`, `planSvg.ts`, `plan.css`, `plan-tokens.css`).** Walls carry
`data-wall-kind` and take their kind's fill and outline pen. At 1:50 and larger in the technical
look: `wall-hatches` over the walls (a hatched wall is filled with the paper), `opening-detail`
(frames, sills) and a plain window's glass as two panes. A window above the cut is dashed
(`data-above`). `colourBy: 'finish'` tints rooms by floor finish (in the order the plan's rooms
first name it, so a finish keeps its tint on every floor). The key now lists partitions, each
hatched material (a hatch swatch drawn by `hatchLines`) and each finish, and is drawn on its own
whenever rooms are tinted by use or finish or walls are hatched (unless `key: false`). The CSS
rules for wall kinds use `:where` so selection still wins over them.

**Light files (CLI).** `drawPlan`, `drawFacade` and `drawSection` draw `fileLookOf(look)`;
`drawStill` draws `light` when asked for `dark`; `grid_view` (`views.ts`, via the new
`pictureLook`) draws `working` when asked for `dark` and says "working (asked as dark)";
`grid draw --look dark` is refused by name; `grid draw --colour finish` is new. The preview page's
own 2D drawing (`planDrawing`, through `grid_preview_sync`) keeps the dark look for a dark page:
that is the screen. The sheet already drew the technical look through `drawPlan` and `drawStill`.

## The three "done when"s

1. Each refinement is an option of a look, with a snapshot test:
   `packages/viewer/src/picture/__tests__/refinements.test.ts` (walls by kind, detail at 1:50,
   above the cut, tints by use and finish with the key, files light), with
   `__snapshots__/refinements.test.ts.snap`; the core in
   `packages/floorplan/src/geometry/__tests__/detail.test.ts`.
2. Exported drawings are always light: `packages/cli/src/draw/__tests__/lightFiles.test.ts`
   (`drawPlan` SVG and PNG, `drawFacade`, `drawSection`, `drawStill`, `planView`, `facadeView`,
   `sectionView`, the `grid_view` answer, `grid draw --look dark` refused, `grid_preview_sync`
   with a dark page: its drawing dark, its picture light; the sheet's look), and
   `drawPlan.test.ts` "draws a file on light paper whatever look it is asked for".
3. Contrast on every look: `packages/viewer/src/picture/__tests__/contrast.test.ts`, over
   `lookPairs` of `working`, `technical` and `dark`.

## Tests whose expectations changed, and why

- `viewer/.../looks.test.ts`: the parts only a look draws now include `opening-detail` and
  `wall-hatches` (the technical look at a small house's own scale is at 1:50); at 1:50 a window
  has two glass lines; a wall's fill is its kind's (two tones in the house), not one grey.
- `viewer/.../phases.test.ts`: a new wall in the working look takes its kind's fill.
- `viewer/.../planSvg.test.ts`: a wall's fill is one of the three kind fills.
- `viewer/.../look.test.ts`: the token map has the two new tokens.
- Snapshots `Canvas2D.plain`, `Canvas2D.unchanged`, `Canvas2D.restyle` (`data-wall-kind` on each
  wall, nothing else) and `dividingLine` (the dividing line's new colour).
- `cli/.../drawPlan.test.ts`: the size-and-look case uses `technical`; `dark` now draws light (new
  case).
- `cli/.../looks.test.ts`: `grid draw --look dark` no longer draws; the unknown-look refusal lists
  `working, technical`.
- `cli/src/__tests__/ownWords.test.ts`: `draw.ts` 44 to 45 (the `--look dark` refusal),
  `tolerances.ts` 250 to 255 (the table's own descriptions, developer), ceiling 1540 to 1541, each
  with a comment naming SHT-10.

## Scoreboard

No count moves. Before the merge: 197, 277, 22, 5, 22, 735, 95, "Same as the stored figures".
After merging `main` (CNT-7 stored 23 turns and 25 checks): 197, 277, 23, 5, 25, 735, 95, "Same as
the stored figures". `scoreboard/current.json` is not edited here.

## Checks run

- `npm run build`: done, before and after the merge.
- `vitest run --exclude '.claude/**' --maxWorkers=4 --minWorkers=1`: 375 files, 6134 passed, 4
  skipped before the merge; 378 files, 6147 passed, 4 skipped after it. No failure, no rerun needed.
- `npm run typecheck`: clean, before and after the merge.
- `npm run lint`: clean, before and after the merge.
- `npm run scoreboard`: as above.

## For the owner

- Wall kinds: a party or common-parts wall (`separating`) is drawn as an outside wall (keyed on its
  own as before); a partition is only a stated `partition` standing inside.
- Technical: outside and inside walls keep the cut pen and differ by tone; a partition is
  outlined with the medium pen, so cut walls stay the heaviest line.
- "Layers": the plan holds one material per wall type (C24 says build-ups are not held), so a
  wall is hatched as one material; no layer lines are drawn.
- Material hatches are assigned in the order the wall types list materials, six patterns, then
  they repeat (a seventh material shares the first's hatch).
- A hatched wall is drawn on the paper under its hatch, not on its kind's tone.
- The detail is shown when the scale takes the 1:50 pens (up to about 1:70), not only at exactly
  1:50 or larger; a small plan drawn with `grid draw` at its own scale gets it.
- The working and dark looks draw no detail at any zoom (screen looks).
- Glazed wall types (`glazed`) are not drawn differently yet.
- A floor finish is the room's own `finishes.floor`; zones' finishes are not tinted. Eight finish
  tints, then they repeat.
- Wall kinds are always drawn by fill, but only listed in the key when a key is drawn. A key is now
  drawn on its own for a drawing tinted by use or finish or hatched by material; before, `colour
  use` listed its uses only when a key was drawn for another reason.
- `grid sheet` draws its plans with no key band, so a hatch there is not keyed.
- Light files: `grid draw --look dark` is refused (strict options), while `grid_view look=dark`
  draws `working` and says so; the `grid_view` tool description still says "or dark" (not edited,
  as asked; worth a one-word follow-up). The preview page's own drawing keeps the dark look.
- Contrast colours: soft text, dividing and soft dimension lines, the warning, the existing-phase
  fill and the site edges were changed to pass; the comparison picture's deliberately pale look
  (WRT-8) and the picking-out colours (CNT-9) are not one of the named looks and are not held to it.
- `0.5` relative luminance is the line between light and dark paper (`fileLook`), in the viewer.
