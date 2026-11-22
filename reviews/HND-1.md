# HND-1: a DXF with units, named layers, room data and line weights

Card: "Grid writes a DXF that a drafter can keep working in. Units are set to metres and accented
names are readable. Layers are named and penned the way the receiving office wants. Doors and
windows are blocks, walls are joined and hatched outlines, and there are real dimensions and room
tags." Lab evidence EX-1 (F-14, K-3, K-4, K-12, I-10) and CP1-18.

## What existed

`packages/floorplan/src/geometry/export/dxf.ts` wrote R12 (`AC1009`): a header with
`$ACADVER`, `$DWGCODEPAGE` (`ANSI_1252`), `$INSBASE` and the extents, a line-type and a layer
table, and the entities. No units field (R12 has none), plain ASCII with every other letter as
`\U+XXXX` (lab K-3: ezdxf's normal read, `dxf-parser` and `dxf` all showed `Ba\U+00F1o`), every
layer in colour 7 with no line weight. Each solid piece of wall was a closed `POLYLINE`, each
opening one `LINE` on `GRID-OPENINGS`, each door swing a loose `LINE` and `ARC`, each room a
`POLYLINE` with its name and area as two `TEXT`s on `GRID-LABELS`. No blocks, hatches,
dimensions, layout or viewport (CP1-18: 9 walls as 22 rectangles, 13 openings as 13 lines, 12
texts all 0.2 units tall). What later cards had added, and what this one keeps:

- HND-6: `GRID-LEFT-OUT`, the note of what the file leaves out, one `TEXT` per line.
- SHT-7: the sketch, `GRID-SKETCH-<CATEGORY>`, and the notes, `GRID-NOTES`.
- CNT-9: the facts, `GRID-FACTS`, one `[id] name: value` text each (`dxfFactText`, read back by
  `dxfFacts` in `export/__tests__/facts.test.ts`).
- MSG-3: the label "General guidance, not your local rules" as `TEXT` on `GRID-LABELS`.
- CNT-12: the fixtures, `GRID-FIXTURES`. ARE-2: dividing lines dashed on `GRID-WALLS-VIRTUAL`.
- QAR-5: byte-identical exports whatever the order of the plan's file (`exportPlan` hands the
  writer the parts in id order).

SHT-2's joined corners are in `PlanWall.slices` (`joints.ts`), SHT-4's chains in
`buildDimensions` (`dimensions.ts`), ARE-12/CNT-9's numbers in `roomNumbers` and
`shownRoomNumber` (`roomNumbers.ts`). All three are on main and are what the writer now reads.

## The version, and why

**AutoCAD 2013's DXF, `AC1027`.** From AutoCAD 2007's (`AC1021`) on, a DXF's text is UTF-8:
"Baño" is the four letters, and the readers the lab ran show it as such. I checked that with the
lab's own installed readers on the new files: `dxf` 5.3.1 reads the tag's name attribute as
`Baño` (the madrid flat's bathroom); `dxf-parser` 1.1.2 reads the file without error. The other
route the card names, `AC1018` with `$DWGCODEPAGE` and `\U+`, is what K-3 already showed three of
four readers print as codes, so it was not taken. Every version from R2000 on stores `$INSUNITS`.
`AC1021` would hold the same file; `AC1027` was chosen because it is the version AutoCAD 2013
to 2017 save, read by every current CAD program, ezdxf and LibreCAD, and nothing in the file needs
a newer one. It is a constant (`DXF_VERSION`) if the owner wants `AC1021` instead.

The frame is a whole document: `HEADER` (`$ACADVER`, `$DWGCODEPAGE`, `$INSBASE`, extents and
limits, `$LTSCALE`, `$PSLTSCALE` 0, `$TEXTSTYLE`, `$CLAYER`, `$DIMSTYLE`, `$LUNITS` 2, `$LUPREC`
3, `$INSUNITS` 6, `$MEASUREMENT` 1, `$LWDISPLAY` 1, `$TILEMODE` 1, `$HANDSEED`), `CLASSES` (the
layout class), `TABLES` (`VPORT` with `*ACTIVE` framed on the drawing, `LTYPE` with `ByBlock`,
`ByLayer`, `Continuous` and the ones used, `LAYER`, `STYLE` `Standard`, `VIEW`, `UCS`, `APPID`
`ACAD`, `DIMSTYLE` `Standard` and `GRID`, `BLOCK_RECORD`), every record with its handle and its
owner table; `BLOCKS` with `*Model_Space`, `*Paper_Space` and the drawing's blocks; `ENTITIES`,
each with its owner space and subclass markers; `OBJECTS` with the root dictionary,
`ACAD_GROUP`, `ACAD_LAYOUT` and the two layouts, each tied to its block record and back.
Handles are given out in the order the file is made: the frame's first, then the blocks', then
each entity as it is written, so the same drawing gives the same bytes (QAR-5's
`scoreboard/__tests__/fileOrder.test.ts` passes).

## What changed

1. **The writer** (`dxf.ts`, rewritten; pure, never throws), in a drafter's order:
   - **Units**: metres, `$INSUNITS` 6, the plan's axes 1:1 as before (C4).
   - **Doors, windows and openings as blocks.** One block per kind, width and wall thickness,
     named in millimetres (`GRID-WINDOW-1200x200`, `GRID-OPENING-900x200`). A door that states
     hinge and swing has one block per hand (`-L` opens to +Y of the block, `-R` to −Y), its
     leaf and arc drawn by the core's `doorSwing` on a canonical opening, on `GRID-DOOR-SWINGS`
     inside the block; a door hung from its end jamb is the other hand's block turned 180° at
     that jamb, so no insert is mirrored. A door with no stated swing has a block with no swing,
     as before. Inserts go on `GRID-DOORS`, `GRID-WINDOWS` or `GRID-OPENINGS`, turned along the
     wall. A window draws the two wall faces and the glass, as the 2D view does. Block names are
     made from the sorted list of sizes, so they do not depend on the order of the plan.
   - **Walls**: each solid piece a closed `LWPOLYLINE` with SHT-2's joined corners, and one solid
     `HATCH` per wall on `GRID-WALLS-FILL` with each piece a loop. Each wall keeps its own shape
     (as `joints.ts` says it should, so it can still be told apart); the pieces meet edge to
     edge, so the fill is continuous. I did not union them into one outline per building: that is
     new geometry the core does not give.
   - **Dimensions**: `buildDimensions(drawing)`, the same call the 2D view and `grid draw` make,
     each an aligned `DIMENSION` on `GRID-DIMENSIONS` with style `GRID` (ticks, metres to two
     places, text above the line, sized for the scale), and its own anonymous block (`*D1`…)
     drawing its extension lines, line, ticks and text, as a dimension is stored. The writer
     measures nothing: it places the core's lines and turns the text to read from below or the
     right.
   - **Room tags**: the block `GRID-ROOM-TAG` with the attributes `NUMBER`, `NAME`, `AREA`,
     inserted at the room's label point on `GRID-ROOM-TAGS`. The number is `shownRoomNumber`
     of `roomNumbers`, across the whole building (`exportPlan` passes them as `roomNumbers`);
     the area is `areaText` with `m²`.
   - **Paper layout**: `Sheet`, A3 across in millimetres, a border and a title strip on
     `GRID-SHEET`, the layout's own viewport and one viewport (on `GRID-VIEWPORT`, not plotted,
     scale locked) showing the model's middle at the profile's scale, with `Scale 1:100 on A3`
     and the label under it. Text heights are millimetres on paper times the scale: names 2.5,
     other text 2, facts 1.5; dashes 2 on 1.2 mm.
   - **Text**: UTF-8 as written (`dxfText`), cut at 250 characters; control characters dropped,
     line and paragraph separators made spaces; a backslash as `\U+005C`, a caret as `^ `, a
     percent sign as `%%%` in text that holds `%%`, a lone surrogate as `?`.
   - **Kept**: HND-6's note (now under the dimensions), SHT-7's sketch and notes, CNT-9's facts
     (the floor's now over the dimensions), MSG-3's label (above the dimensions, written last in
     the model, and on the sheet), CNT-12's fixtures (rings closed, lines as open polylines).
   - A layer is listed only when something is drawn on it (before, all but four were always
     listed).
2. **The export profile** (`geometry/export/dxfProfile.ts`, pure): Grid's 19 categories
   (`DXF_CATEGORIES`), each with a layer, a colour (1–255), a line weight (one of the 24 the
   format holds, in mm) and a line type (`continuous`, `dashed`, `dotted`, `dash-dot`), and a
   scale. `NEUTRAL_DXF_PROFILE` keeps the old `GRID-` names, colour 7 (the fill 8) and weights
   from the technical look's 1:100 pens. `readDxfProfile` reads a profile, every part optional,
   and lists every problem by where it is, never repeating the value; two categories may share a
   layer only with one pen. `DXF_LAYERS` is now the neutral profile's names.
3. **The command and the tool server**: `packages/cli/src/export/dxfProfile.ts` reads
   `dxf-layers.json` in the project folder through `Project.readText` (64 KB cap), for DXF only.
   `exportFile` now takes the project. `grid export` prints `Layers and pens from
   dxf-layers.json.` on standard error when it used one; `grid_export` answers with `dxfProfile`
   and the same line. A wrong profile is refused (`DxfProfileRefused`, exit 1, one line), no file
   written; a link out of the project is a `PathRefused`. No new message code: it is a refusal,
   as HND-6's empty export is.
4. **Docs**: `docs/commands.md` "What the DXF holds (HND-1)" with the profile's format;
   `docs/tool-server.md`'s `grid_export` row; `docs/result-contract.md`'s receipt and changelog;
   `docs/plan-file.md`'s facts line; `CHANGELOG.md`; `pinned-tests.md`.
5. **`.gitattributes`**: `golden/*.dxf` is binary, so its CRLF lines are not turned into LF on
   checkout (`* text=auto eol=lf`).

## The test of structure

No DXF reader is a dependency, and none was added: a structural check is in
`packages/floorplan/src/geometry/export/__tests__/dxf-reader.ts` (`dxfProblems`, with `readDxf`,
`worldShapes`, `attributesOf` for the tests). It checks: pairs well formed; number and handle
codes hold numbers and handles; sections in order and closed, `EOF` last; `$ACADVER` `AC1027`,
`$INSUNITS` 6, `$MEASUREMENT` 1; every handle once, `$HANDSEED` past all; every owner and pointer
(330–369) resolves; the nine tables there, counted, each record owned by its table, no name twice;
the records a CAD program needs (`ByBlock`, `ByLayer`, `Continuous`, layer `0`, `Standard` style
and dimension style, `ACAD`, both spaces); every layer, line type, text style, dimension style and
block named is declared; each block has its record, owner and end; model and paper entities owned
by their space; attributes and `SEQEND` owned by their insert; polyline and hatch vertex counts;
the root dictionary with `ACAD_GROUP` and `ACAD_LAYOUT`; each layout and its space pointing at each
other; and no letter written as a `\U+` code. `dxf.structure.test.ts` runs it over every fixture,
floor by floor, an empty plan, a plan with a broken wall, a hostile name and a profile of its own,
and proves it can fail.

## The lab's plans

Every readable lab plan (`scoreboard/data/lab-plans.ndjson.gz`, 1,131 plans, all read part by
part as Grid reads a file) exported to DXF floor by floor through `exportPlan`, the files checked
with `dxfProblems` and read with the lab's two installed JavaScript readers (`dxf-parser` 1.1.2
`parseSync`, `dxf` 5.3.1 `parseString` and `denormalise`, both MIT, run from the lab's folder, not
added here):

| | Count |
|---|---:|
| Plans | 1,131 |
| DXF files written | 1,573 |
| Floors refused as empty (HND-6) | 24 |
| Exports that threw | 0 |
| Files with a structural problem | 0 |
| Files `dxf-parser` could not read | 0 |
| Files `dxf` could not read | 0 |
| **Files with an error** | **0** |

The first run had 9 exports that threw: the lab's large grids (500 to 5,000 pieces, 30 × 30)
overflowed the stack where a section's lines were pushed as arguments. Fixed (one at a time), and
the second run is the table. ezdxf, the lab's third reader, is not installed on this machine, and
no file was opened in AutoCAD, BricsCAD or LibreCAD. The run was repeated after merging main, with the same result.

## Goldens

- `packages/floorplan/src/geometry/export/__tests__/__snapshots__/dxf.test.ts.snap`: the ARE-2
  snapshot, regenerated. The room outlines are `LWPOLYLINE` vertices (the same points); the
  tables are now the `LTYPE` and `LAYER` records without their handles: `ByBlock`, `ByLayer`,
  `Continuous`, `DASHED` (0.2, −0.12 at 1:100, was 0.2, −0.1), and only the layers drawn on, each
  with its line weight (`370`), the viewport's not plotted (`290 0`).
- New: `packages/floorplan/src/geometry/export/__tests__/golden/one-room.dxf` (62,327 bytes), held
  by `dxf.golden.test.ts`: a room "Baño" with a door with a swing, a window and an opening.
- The IFC goldens are unchanged.

## Test expectations changed, and why

`packages/floorplan/src/geometry/export/__tests__/dxf.test.ts`:

- `declares the version it claims to be` → `…, and that it is in metres (HND-1, lab EX-1)`:
  `AC1027`, `$INSUNITS` 6, `$MEASUREMENT` 1 and the six sections, where it was `AC1009`.
- `declares every layer any entity puts itself on`: reads the layer table and every entity and
  block entity, since the last table is no longer the layer table.
- `separates walls, rooms, openings and labels` → `separates walls, their fill, rooms, doors,
  tags, dimensions and labels`: the sample's one opening is a door, a block on `GRID-DOORS`.
- New: `lists only the layers something is drawn on`.
- `writes meters, unscaled`, `does not flip Y`: the wall outlines' corners in model space, since
  code 10 now also holds blocks' own frames and the sheet's millimetres. Same figures.
- `reports an extent that matches what it drew` → `reports an extent round everything it drew in
  the model`: the dimensions and label are drawn outside the walls, so the extent is the box round
  every model point, not the walls' x range.
- `closes wall and room outlines`: the `LWPOLYLINE`s, not every code 70 (attributes and
  dimensions carry one). New: `fills each wall with a solid hatch bounded by its outlines`.
- `draws the room name and its area` → `tags the room with its name and its area`: the tag's
  attributes; the area reads `m²` (was `m2`).
- `marks the opening left in the wall` → `… with a block`: an insert on `GRID-DOORS`.
- Pinned (Z-6): `escapes an accented letter as \U+XXXX, which CAD tools decode` → `writes an
  accented letter as itself, which every reader shows`: `Baño` is `Baño`. Noted in
  `packages/floorplan/src/test-support/pinned-tests.md`, where it left the table.
- `writes only ASCII, whatever the room is called` → `writes every name as it is, in UTF-8`.
- `replaces what R12 cannot hold, instead of splitting it` → `keeps a character made of two units
  whole, and replaces half of one`: the emoji is kept (UTF-8 holds it); a lone surrogate is still
  `?`.
- `caps a value at 250 bytes of what is written, not 250 characters` → `caps a value at 250
  characters`: letters are no longer seven bytes each.
- `never cuts an escape in half when it hits the cap`: with backslashes, the one character still
  written as an escape.
- New: `keeps the codes a CAD program reads in text from reading as codes` (caret, `%%`).
- `centres every text on its point` → `centres every label and tag on its point`: the model's
  texts and the tags' attributes (4), not the sheet's left-aligned scale line.
- Door swings: `lists the door-swing layer in the layer table` → `… when a door has a swing` (the
  sample's door states none, and a layer is listed only when drawn on); the leaf and arc are read
  through the insert (`worldShapes`), same figures; `still marks the opening line across the gap`
  reads it on `GRID-DOORS` (inside the door's block). In the twelve angle cases the hinge point
  is compared to 5 places, not 6: it is the insert's point plus the block's line, each written to
  6. New: `is one block per size and hand, however many doors use it`.
- ARE-2: the room outlines are read as `LWPOLYLINE`s; `declares every line type a layer names`
  expects `Continuous` (AutoCAD's spelling) and `DASHED`, read from the tables; `keeps solid walls
  … continuous` expects `Continuous`.

Elsewhere:

- `geometry/export/__tests__/joined-corners.test.ts` (SHT-2, DXF case): reads the wall
  `LWPOLYLINE`s through `worldShapes`. Same 75.05 m².
- `geometry/__tests__/holes.test.ts`, `writes the hole into the DXF…`: reads the room outlines as
  `LWPOLYLINE`s and the name from its tag. The old test read the label point two lines off (it
  took the codes `20` and `30` as x and y); it now reads the point and checks it is the room's
  label point.
- `geometry/__tests__/exposure.test.ts`: counts the `LWPOLYLINE`s on each wall layer.
- `export/__tests__/planExport.test.ts`: `GRID-DOORS` in place of `GRID-OPENINGS` for the
  sample's door.
- `export/__tests__/leftOut.test.ts`, `keeps a hostile id inside the note`: the `é` is written as
  itself, and the JSON string's backslashes as `\U+005C`, where it expected `\U+00E9`.

New tests: `dxf.structure.test.ts` (13), `dxf.golden.test.ts` (2), and
`packages/cli/src/export/__tests__/dxfProfile.test.ts` (7: none, a profile, other formats, a wrong
profile naming each part with nothing written, not JSON, two pens on one layer, a link out).

## For the owner

- **Version**: `AC1027` (AutoCAD 2013). `AC1021` would also be UTF-8; say if you want it.
- **Profile**: `dxf-layers.json` in the project folder, beside `grid.json`: `{ "scale": 100,
  "layers": { "<category>": { "layer", "colour", "lineweight", "linetype" } } }`, every part
  optional. It is a fixed name in the project, not a new path argument, so `everyPath.e2e.test.ts`
  has no new slot; it is read through `projectFiles.ts` like every other file, and its link case is
  tested in `dxfProfile.test.ts`. One file per project: an office copies it in. An option naming
  a profile elsewhere was not added.
- **Layer names** (neutral): `GRID-WALLS-EXTERIOR`, `GRID-WALLS-INTERIOR`, `GRID-WALLS-VIRTUAL`,
  `GRID-WALLS-FILL`, `GRID-ROOMS`, `GRID-ROOM-TAGS`, `GRID-DOORS`, `GRID-DOOR-SWINGS`,
  `GRID-WINDOWS`, `GRID-OPENINGS`, `GRID-FIXTURES`, `GRID-DIMENSIONS`, `GRID-NOTES`,
  `GRID-SKETCH-<CATEGORY>`, `GRID-FACTS`, `GRID-LEFT-OUT`, `GRID-LABELS`, `GRID-SHEET`,
  `GRID-VIEWPORT`. New are the fill, room tags, doors, windows, dimensions, sheet and viewport.
  Changed meaning: `GRID-OPENINGS` holds doorless openings only (a door's or window's gap line is
  inside its block), and `GRID-LABELS` holds the label only (names and areas are tag attributes).
- **No devDependency added.** The lab's `dxf-parser` and `dxf` were run from the lab folder for
  the count above; `npm run check:licenses` is unchanged (363 licences).
- **Paper space is in millimetres** while the model is in metres (`$INSUNITS` 6 applies to the
  model and the blocks): the usual way to set up a metric sheet, the viewport's scale being 10
  paper units to a model metre at 1:100. Say if your offices expect metres on paper too.
- **Size**: a file is larger (the two-bed flat 130 KB, was about 17 KB), mostly the dimensions'
  blocks; the lab's 1,573 files are 342 MB together.
- **What a drafter still cannot do**: open it as DWG (DXF only); get stairs, lifts, steps or the
  floor above (not written yet); get a hatch pattern other than solid; see room numbers in a
  plan written straight through `toDxf` without `exportPlan` (the tag's number is then empty);
  rely on the viewport fitting: a plan wider than about 40 m at 1:100 is cut by the A3 viewport
  (set a smaller scale in the profile); see CJK names in a CAD program whose font (`arial.ttf` by
  default) has no CJK letters: they are stored right, and shown as the font allows. The file has
  not been opened in AutoCAD, BricsCAD, LibreCAD or ezdxf here.

## Checks run

On `claude/hnd-1` from `main` at 5039f12, on a heavily loaded machine, then after merging `main`
at d058d4d (BRF-1, CNT-8, VEW-3, LVL-6 and the rest):

- `npm run build`: passed. `packages/cli/dist/grid.mjs` 466,102 bytes before the merge (main at
  5039f12 was 462,477); 520,831 bytes after it, under the bundle test's cap, which main raised to
  550 kB with VEW-3 (main alone about 512 kB). No new dependency.
- `npm run typecheck`, `npm run lint`: passed, before and after the merge.
- `npm run check:licenses`: 363 licences, none GPL, LGPL, AGPL, MPL or EPL.
- Full suite before the merge, `timeout 1500 npx vitest run --exclude '.claude/**'
  --maxWorkers=2 --minWorkers=1`: 284 files, 5,205 tests: 5,199 passed, 4 skipped, 2 failed, both
  in `scoreboard/__tests__/causes.test.ts` (W-7 and MS-14). They failed again alone, read no
  export, and are the two tests main fixed in 7b90435 ("MSG-5's cause tests state a place, as
  COD-3 now needs"); after the merge they pass.
- `npm run scoreboard` before the merge: the same as the stored figures (rooms measured wrong
  197, damage that passes in silence 278, turns 18, mistakes 5, checks 15, guards 735 and 95).
  Nothing stored.
- After the merge, the affected tests (the DXF, export, profile, tool, zone-facts, writing,
  occupancy, safety, file-access, `grid.e2e`, `paths.e2e`, `everyPath.e2e`, `causes` and QAR-5's
  `fileOrder` tests): 37 files, 829 tests, all passed.
- `npm run scoreboard` after the merge: the same as the stored figures (197, 278, 18, 5, 16 with
  main's BRF-1, 735, 95). Nothing stored: the DXF's new bytes move no count.
- The lab DXF run (above) was repeated after the merge: the same 1,573 files, 0 with an error.
- No full suite was run after the merge; the affected tests above were.
