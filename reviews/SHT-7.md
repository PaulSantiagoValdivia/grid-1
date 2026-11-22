# SHT-7 review: writing on the drawing, and a sketch layer drawn only

For the owner. SHT-7 lets a plan carry writing for its drawings (a title, notes, tags, symbols,
a key) and a sketch layer (lines, arcs, rectangles, shapes, text) that is drawn and exported but
never measured, checked or taken as a wall. A drawing call can also leave parts off and colour
the rooms by use.

## What changed

1. **The plan file** (`packages/floorplan/src/types/floorplan.ts`) gains three optional parts
   (version 1, nothing defaulted):
   - `title`: one line;
   - `annotations`: `note`, `tag`, `symbol` (`north`, `entrance`) and `key`, each placed `at` a
     point or in a `room`;
   - `sketch`: `line`, `arc`, `rect`, `shape` and `text`, each with a `category` and a `floor`.

   Each is one flat object, checked per kind, so MSG-4 names a field the format does not have.
   The text limits of MSG-9 cover them (`command/planText.ts`).
2. **The core** (`geometry/writing.ts`) turns them into what a view or an export needs: a
   rectangle into its corners, an arc into radians, a note in a room into the room's label
   point. `planForFloor` keeps each floor's own. `PlanDrawing` gains `sketch`, `notes` and
   `sketchBounds`, and `boundsWithDimensions` frames the sketch and any note placed at a point.
   No area, check, wall or room reads any of it.
3. **The DXF** puts each sketch category on its own layer, `GRID-SKETCH-<CATEGORY>`, and the
   notes on `GRID-NOTES`. Each layer is listed only when used, so a plan without them writes
   the same file as before.
4. **The record** has two new codes, each with a catalogue entry, a contract row and a changelog
   entry:
   - `floor/sketch-drawn-only` (not checked): one line per floor with a sketch, saying it is
     drawn only, never measured or checked. Its fix offers to rewrite it as a part Grid holds,
     such as a fixture, and promises the same for furniture and site parts once Grid holds them.
   - `plan/note-no-place` (worth a look): a note in a room the plan does not have.
5. **The picture** (`viewer/src/picture/writing.ts`, `scene.ts`, `planSvg.ts`):
   - The sketch is drawn in a soft line under the walls, and the notes after the labels. A note
     in a room sits under that room's name.
   - The title and the key go in the band under the drawing, above MSG-8's list. The key lists
     only what the drawing shows.
   - `PictureOptions.show` turns `title`, `key`, `notes`, `sketch`, `areas`, `swings` and
     `warnings` on or off, and sets `colourBy: 'use'`.
   - The app's 2D view draws the sketch and the notes too, from the same scene. It shows no
     title or key, because it has no band under the drawing.
6. **Commands and tools.**
   - `grid draw` takes `--hide <parts>`, `--colour use` and `--key`. A word Grid does not know
     is refused by name, and none of the three is taken with `--3d`.
   - `grid_view` (kind plan) takes `hide`, `colour` and `key`. They are read by the same light
     module, `command/drawShow.ts`.
   - The sheet draws the notes and the sketch, but leaves off the plan's title and key (see
     `coverage.ts`).
7. **Docs.** `docs/plan-file.md` gains a section with the fields. `docs/commands.md` gains the
   options and a section. `docs/tool-server.md` and `docs/result-contract.md` gain the rows and
   the changelog. The README is untouched.

## Against `done_when`

1. *Notes, tags, a key and a title are stored and drawn. DR-6's title now changes the picture,
   and an unknown annotation field is named.* This is tested in
   `packages/cli/src/draw/__tests__/writing.test.ts`:
   - Each kind of note is stored and drawn, and so are the title and the key.
   - The lab's J-3 plan (`AU2/scenarios/J-3-estate-agent--t4-made-up-title-logo-fixtures`)
     draws differently with its title than without it, and shows the title. Its `title` is no
     longer an unknown field; `logo` still is.
   - `colour` on a note is named as `plan/unknown-field`, at `annotations[0]`.
2. *Sketch items appear on their own DXF layer and change no number.* The same file adds a
   sketch rectangle to the two-bed flat. Each of these is unchanged after it:
   - `planAreas` and `checkLocalRules`;
   - `validatePlan`;
   - the drawing's walls, rooms, openings and bounds;
   - every DXF entity on a non-sketch layer;
   - every record line but the new `floor/sketch-drawn-only` one, and the checks that ran.

   The rectangle is on `GRID-SKETCH-GARDEN`.

## Changed expectations

- `rules/src/result/__tests__/result.test.ts`: the list of the plan's fields that MSG-4 prints
  now ends `items, title, annotations, sketch, written`.
- `cli/src/sheet/__tests__/coverage.test.ts` needed no change: `coverage.ts` places the three
  new parts.
- `cli/src/command/__tests__/wordsNotRead.test.ts`: two patterns matched `  - worth a look`.
  This test came to `main` with MSG-4 after MSG-8 numbered the report's lines, so it fails on
  `main` (c4f773f) too. It now matches `  N. worth a look`.
- `look.test.ts` gains checks that the sketch line's width and the note's size match
  `plan.css`.
- No snapshot and no scoreboard figure changed.

## For the owner

- **The 3D views** do not show the sketch yet. "Drawn in every view" holds for every plan
  picture, the app's 2D view, the sheet and the DXF. Lines in the 3D model are a follow-up.
- **Units on the figures** are not done. The card's "what" lists them, but its `done_when`
  does not. Dimension numbers still print bare metres (areas say m²). Adding " m" needs the
  label boxes to grow with it, so I left it out rather than risk overlapping numbers.
- **Colour by group** is not done; rooms have no group field yet. Colour by use is.
- **Converting a sketch.** The "offer to convert" is the `floor/sketch-drawn-only` line's fix,
  in words. Grid has no command that turns a sketch item into a fixture.
- **The title on the sheet.** The sheet leaves off the plan's title and key, because each page
  has its own title and box. Say if the sheet should show them.
- **Symbols.** Only `north` and `entrance` exist. Others, such as a scale bar or a logo, would
  each need a decision.
