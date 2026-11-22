# CNT-14 review: kinds of door and window, their handing and the part that opens

Card: "Kinds of door and window, their handing and opening part, drawn as real parts in 2D and
3D." Each door and window may state a kind and the part of it that opens; its handing can be said
in the person's terms; each kind is drawn with its usual symbol in plan and with glass, frames
and leaves in 3D, checked by the door-swing check and carried into the schedules and every
exporter. Lab evidence EL-5 (re-run by AU3: 176 doors of 1.5 m or more drawn as one leaf, in 53
plans), R-6, R-5, AC-13, F18, F20, AE-7, SG5, SB4.

## What changed

1. **The plan format** (`packages/floorplan/src/types/floorplan.ts`, convention C20), version 1,
   nothing defaulted:
   - `kind` on an opening: `DOOR_KINDS` (`single`, `double`, `sliding`, `pocket`, `folding`,
     `roller`, `garage`) and `WINDOW_KINDS` (`single`, `double`, `sliding`, `fixed`,
     `high-level`), one enum, `OPENING_KINDS`. A door with no kind is one swinging leaf, as
     every door was; a window with none is drawn and measured as before.
   - `opens`, the part that opens: `{ width, height? }`, at the end the door hangs from.
   - `hinge` and `swing` are unchanged and stay the stored handing (C2). For a door that slides,
     rolls or lifts, `hinge` names the end it opens toward and `swing` the face it runs on.
   - No top-level part changed, so `sheet/coverage.ts` needed nothing.
2. **The kinds in the core** (`geometry/openingKinds.ts`, new, pure): what each kind is drawn
   and checked as, how it moves (swing, fold, slide, lift), whether it sweeps the floor, what it
   needs stated (`swingNeeds`), the part's width and height, a pair's two leaves and a folding
   door's panels (`foldingPanel`).
3. **Handing in the person's terms** (`geometry/handing.ts`, new): `handingFromRooms(plan,
   opening, { opensInto, hinged, seenFrom })` turns "opens into the hall" into `swing` (the face
   the room is on, from the rooms either side, `openingSides`) and "hinged on the left as seen
   from the bedroom" into `hinge` (standing on the face the wall's normal points at, a person
   facing the wall has its end on their left). Unless another room is named, the side is seen
   from the room it opens into. `outside` names the side no room is on. `handingInRooms` and
   `sideSeenFrom` read it back.
4. **The door-swing check** (`sweep.ts`, `door.ts`): `doorSweeps` says what each kind sweeps: one
   leaf its quarter disc (as wide as the part that opens), a pair a quarter disc from each jamb
   (the main leaf, the part that opens, else half, at the end it hangs from), a folding door a
   strip one panel deep on the face it opens to, a sliding, pocket, roller or garage door nothing.
   Walls and fixtures are tried against every sweep (QAR-7's box index still picks them); a strip
   is tested by the same clip as two door sweeps. A pair's two leaves never collide with each
   other, and two doors are named once however many of their leaves meet. The half-swing warning
   follows the kind: a pair needs only its face. `doorSwing` takes a leaf width.
   - `checkDoorSweeps(plan, swingOf)`: the issues and, floor by floor, the doors not checked
     because the plan states neither hinge nor swing for a kind that sweeps. Each floor is built
     once and each door asked once. `validateDoorSweeps` returns its issues, as before.
   - `opening/wide-single-leaf` (worth a look): a door at least `wideSingleLeaf` (1.5 m) wide
     that states no kind. It is a door warning in the drawing too, marked on the plan
     (`doorWarningsOf` now keeps this one, which has no hits).
5. **The drawing's own questions** (`validate.ts`, worth a look): `opening/kind-not-for-type` (a
   window that is a `garage`, any kind on a doorless opening; read as no kind) and
   `opening/part-too-large` (a part larger than the opening, or on a fixed window or a doorless
   opening; read as the whole opening).
6. **The plan symbol** (`geometry/openingSymbol.ts`, new): every line and swing of each kind, in
   plan coordinates, in proportions of the opening and its wall, a line above the cut or hidden in
   the wall marked `above`. One leaf is drawn exactly as before (the same arithmetic as the
   viewer's `doorSymbolOf`); the others: a pair's two swings, a folding door's zig-zag of panels,
   a sliding door's two leaves in the wall, a pocket door's leaf and its pocket dashed, a roller
   door's curtain and its roll dashed, a garage door and the door open overhead dashed. Windows:
   as before; a pair with the line where its casements meet; a sliding window's two panes; a
   high-level window all dashed. `PlanOpening` carries the stated `kind`, `opens` and `height`.
7. **The viewer draws what the core gives it** (`packages/viewer`):
   - `planScene` (`picture/scene.ts`) draws a door or window that states a kind or a part from
     `openingSymbol`, in the look's pens (`doorLeaf`, `doorArc`, `jamb`, `windowFace`, `glass`)
     with the `above` dash for what lies above the cut, as `data-part="door-symbol"` or
     `window-symbol` with `data-kind`. Any other door or window is drawn by the code that drew
     it before, so every picture of a plan with no kinds is byte for byte as before (the DOM
     snapshots did not move). A door whose kind needs no swing is never drawn undecided.
   - Labels keep off a kind's symbol (`doorSwingBox`); `DoorHanding` carries `kind` and `opens`.
   - 3D: `Opening3D.tsx` (new) draws each door's and window's boxes in `Storey3D`, so the app's
     view and `grid draw --3d` (the still) show them: the frame in the outside wall's colour, the
     leaves in the floor's, the glass in the background colour, seen through (opacity 0.35).
8. **Glass, frames and leaves in 3D** (`geometry/openingParts.ts`, new; `scene3d.ts`):
   `openingParts(opening, wall)` lays out the boxes in the wall's terms; `Scene3D.openings`
   (`sceneOpening`) puts them on the plan. A door: a frame lining its wall's depth (jambs and
   head), its leaves closed, hung from the face of the wall it opens toward (or in the middle
   when no face is stated), a fixed glazed panel beside a leaf that opens only in part. A window:
   a frame in the middle of its wall, a sash with its glass for each part that opens (two for a
   pair or a sliding window, the sliding ones passing in the wall), only glass when fixed, fixed
   glass beside a casement that opens in part. None in a doorless opening or a dividing line.
   Sizes are Grid's own drawing sizes in the tolerance table (`frameFace` 0.05 m, `frameDepth`
   0.07 m, `leafThickness` 0.04 m, `glassThickness` 0.02 m).
9. **The exporters**:
   - OBJ and GLB (`export/mesh.ts`, `obj.ts`, `gltf.ts`): each door's and window's `frame_`,
     `leaf_` and `glass_` objects, after the stairs; the GLB's glass in a second material
     (`glass`, alpha blend, double-sided), written only when the file holds glass.
   - IFC (`export/ifc.ts`): each `IfcDoor` and `IfcWindow` is filled with its parts, one
     `IfcExtrudedAreaSolid` each in the filler's frame (turned with it), the glass styled
     (`IfcStyledItem` with a surface style "Glass"). Styles are typed by kind too: the tag
     `door:sliding:2.2x2.1` (lab AC-13), the name (`Door 2.2 x 2.1 m, sliding, two leaves`) and
     IFC2x3's operation (`DOUBLE_DOOR_SINGLE_SWING`, `FOLDING_TO_LEFT/RIGHT`,
     `SLIDING_TO_LEFT/RIGHT` for a pocket door, `DOUBLE_DOOR_SLIDING`, `ROLLINGUP`, and
     `USERDEFINED` for a garage door, whose name says it lifts overhead); a window's operation
     `SINGLE_PANEL` or `DOUBLE_PANEL_VERTICAL`. A door or window with no kind keeps its tag and
     name.
   - DXF (`export/dxf.ts`): a door or window that states a kind or a part is written by its
     symbol (leaves and swings on `GRID-DOOR-SWINGS`, faces and glass on `GRID-OPENINGS`), and
     what lies above the cut on a new dashed layer `GRID-OPENINGS-ABOVE`, listed only when used.
     Since HND-1, each symbol is a block (see "Again after merging `main` 8a433801 (HND-1)").
10. **The checks** (`packages/rules`): `inspectPlan` gives `floor/not-checked-door-swings`, one
    not-checked line per floor naming the doors (in `also`) whose swing is not stated. On a plan
    that may not be in metres, `opening/wide-single-leaf` follows from `plan/units-question`
    (MSG-5's chain). The escape check measures a window by the part that opens when stated, and
    a `fixed` window as opening nothing (lab F18); its limit line says so.
11. **The edits and rooms text** (both fitted naturally):
    - `grid_change_opening` takes `kind`, `hinged` (`left`/`right`) and `seen_from` (a room or
      `outside`); a kind the type does not take is refused with the kinds it does; a pair or a
      door that sweeps nothing is not given a default hinge with `opens_into`. A change of type
      drops a kind the new type does not take.
    - Rooms text (`rooms/compile.ts`) reads a kind word, `hinged left|right [seen from <room>]`
      and `part <w> [x <h>]` on a door or window line; it guesses no swing for a door that sweeps
      nothing and no hinge for a pair. The old refusal of `sliding` is gone. `read.ts` writes them
      back, so `grid describe --as rooms` round-trips them.
    - `addRoom`'s guess and `grid_add_room`'s description no longer say Grid has no sliding or
      folding door.
12. **Schedules** (ARE-12, `quantities/schedule.ts`): the grouped schedule groups by kind as well
    (`2 × sliding door …`, `kind` on each row); the opening schedule's rows carry `kind`, `opens`
    and `handing` (`opens into Hall, hinged on the left`), in the text, the CSV (columns only when
    some row has them) and the check sheet's table. Plan comparison names a change of kind.
13. **The scoreboard**: the runner passes each opening to the swing check (its kind with it) and
    counts the doors listed as not checked among the not-checked lines, as its README says it
    does. The capability probes `door-leaves` (`openings.0.kind`, was the lab's `leaves`) and
    `openable-part` (`openings.0.opens`, was none) now ask for the new fields.
14. **Docs**: `docs/plan-file.md`, new section "Kinds of door and window, their handing and the
    part that opens" with its codes; `docs/rooms-first.md`, `docs/commands.md` (what the IFC
    holds), `docs/tool-server.md`, `docs/tolerances.md` (six rows), the contract's code table (four
    codes) and changelog, `CHANGELOG.md`, `test-support/pinned-tests.md`.

## Against done_when

1. *A 3.5 m dock door draws as its kind, not a 3.5 m arc; every one of the 176 lab doors of
   1.5 m or more is either typed or flagged (EL-5).*
   - `scoreboard/__tests__/doorKinds.test.ts` reads the stored lab plans of the groups AU3
     scanned and finds the same 176 doors in 53 plans. Of them, 159 are flagged by id with
     `opening/wide-single-leaf`; 5 the drawing cannot place (wider than their wall, and the
     like) and leaves out with a line of their own, so they are drawn as no leaf at all; 12 are
     in two plans stated in millimetres and feet (`E/…/f01-mm-declared`, `f02-feet`), which Grid
     reads in their unit since WRT-7: they are 0.7 to 0.9 m doors, said with `plan/read-as-meant`,
     and get no question. Each of the 164 in metre plans, typed `roller`, gets no question, no
     sweep warning and a roller symbol with no arc. The lab's warehouse
     (`C/scenarios/warehouse.json`): three 3.5 m arcs as written, three roller doors once typed.
   - `packages/viewer/src/picture/__tests__/doorKinds.test.ts`: the picture of a 3.5 m dock
     door as one leaf has its arc and a door warning; as a roller door, no arc and no warning,
     `data-kind="roller"`, the roll dashed. Garage, sliding and pocket doors are never "?".
   - `packages/floorplan/src/geometry/__tests__/openingKinds.test.ts`, "the plan symbol of each
     kind".
2. *"Opens into the hall" converts to the right handing; a sliding door sweeps nothing in the
   swing check; doors with no swing stated are listed as not checked.*
   - Core: `openingKinds.test.ts`, "handing in the person's terms": the same door with its wall
     drawn either way gives the leaf at the same jamb, opening into the hall; "seen from the
     bedroom" is the other jamb; a room not beside the door is refused. "The door-swing check by
     kind": a wall a leaf hits is no hit for sliding, pocket, roller and garage doors; the doors
     with no swing are listed floor by floor, a sliding one never.
   - Tool server: `packages/cli/src/mcp/__tests__/doorKinds.test.ts`: `grid_change_opening` with
     `opens_into: hall, hinged: left` writes `swing: left, hinge: end` on a wall drawn south to
     north; `grid_check` gives "On "Ground floor", 2 doors state no swing, so whether they open
     clear was not checked: "d", "patio"", not checked, and drops the sliding door from it once
     typed. Rooms text writes and reads back the kinds.
3. *3D files show glass, frames and leaves hung from the wall face.*
   - `packages/floorplan/src/geometry/export/__tests__/openingKinds.test.ts`: the OBJ holds
     `frame_d`, `leaf_d`, `frame_win`, `glass_win`; in the GLB the leaf's outer face is on the
     wall's face it opens to (±0.15 m), 0.04 m thick, the glass in its own seen-through
     material; the IFC window holds nine solids, its glass styled "Glass"; the IFC styles carry
     the kind.
   - `ifc.test.ts`: at six wall angles and four handings, the IFC door's leaf hangs from the
     face it opens to. `openingKinds.test.ts` (core): leaves on the face, frames through the
     wall, a fixed window with no sash, none in a doorless opening or a dividing line.

Smaller tests: the escape check on a window's part and a fixed window
(`rules/src/checks/__tests__/rules-escape.test.ts`, "CNT-14").

## Expected texts I changed

- **The four IFC golden files** (`geometry/export/__tests__/golden/*.ifc`), written again with
  `-u`. Compared with `main` entity by entity, references and GlobalIds blanked: what went is each
  filler's one-box shape (its profile and representation) and the two styles' old description;
  what came is each filler's frame, leaf and glass solids with their profiles and placements, one
  glass style per storey (`IfcColourRgb`, `IfcSurfaceStyleRendering`, `IfcSurfaceStyle`,
  `IfcPresentationStyleAssignment`, `IfcStyledItem`) and the styles' new description. No wall,
  void, space, slab or relationship changed; entity numbers move.
- `geometry/export/__tests__/ifc.test.ts`: `gives the filler a thin leaf, centred in the wall,
  over the void` is now `CNT-14 fills the void with a frame and a leaf…` (the parts fill the void;
  the leaf of a door with no swing is 0.04 m and centred; the jambs line the wall); the 24 door
  swing cases read the span of every solid, not one, and check the leaf hangs from its face. A
  helper `bodiesOf` reads every solid.
- `geometry/export/__tests__/gltf-large.test.ts`: its hand-made scene gains `openings: []`.
- `viewer/src/still/__tests__/planStill.test.ts`: the still's meshes are the walls, slabs and
  slab, and now each door's and window's boxes; renamed "…and door and window part…".
- `rules/src/result/__tests__/result.test.ts`, "says a finding and a notice in the report's
  words": the record's not-checked lines are the report's, less `floor/not-checked-door-swings`,
  which comes from the door check.
- `cli/src/edit/__tests__/requests.test.ts`: the added room's door guess no longer says Grid has
  no sliding or folding door.
- The limit line "Windows are measured as drawn: the part that opens may be smaller" now reads
  "Windows are measured by the part that opens where the plan states it, else as drawn: the part
  that opens may be smaller" (no test pinned it).
- The OBJ and GLB name lists now hold each door's and window's `frame_`, `leaf_` and `glass_`
  objects, after the stairs and before the slab, in the plan's order of openings (`Scene3D.openings`
  is sorted so): `geometry/export/__tests__/gltf.test.ts` ("writes one named node…", "names
  nodes…", "declares bounds…" 7 → 13 accessors, "leaves out the broken and the virtual wall…",
  and "gives every primitive the same plain grey material…", now two materials, the glass's only
  on `glass_` meshes), `export/__tests__/planExport.test.ts` (the OBJ and the GLB of the sample)
  and `export/__tests__/fileOrder.test.ts` (the parts in id order too).
- `cli/src/mcp/__tests__/facts.test.ts`: the office's opening schedule CSV gains a `handing`
  column after `sill m`: its doors state their swing, so the schedule says their handing.
- `cli/src/command/__tests__/coverage.test.ts`, "the same walls with no rooms": its doors state no
  swing, so `floor/not-checked-door-swings` comes before `plan/not-checked-no-rooms`.
- `scoreboard/__tests__/causes.test.ts`, W-7: 90 lines with 43 beneath become 102 with 55; the
  problems stay 30. The twelve are `opening/wide-single-leaf` on f01b and f02b, plans in
  millimetres and feet that state metres, filed under their units question.
- `scoreboard/__tests__/doorSweeps.test.ts` (QAR-7's all-pairs comparison): the new code's
  `opening/wide-single-leaf` is left out of the comparison, since the old code never asked it.
- `scoreboard/current.json`: checks fed 15 → 17, the probes `door-leaves` and `openable-part`
  yes; reason in `scoreboard/README.md`.
- No DXF snapshot or picture snapshot changed: each is as before for a plan that states no kind.

## For the owner

1. **The kinds.** Doors: the card's seven. Windows: `single`, `double`, `sliding`, `fixed` and
   `high-level`; I read "windows: also fixed or high-level" as the kinds a window can share with a
   door plus those two, and left out pocket, folding, roller and garage windows. One enum holds
   both lists, so a wrong pairing is a warning (`opening/kind-not-for-type`), not a refusal.
2. **Handing stays in the wall's terms in the file.** The person's terms are accepted by the tools
   and rooms text and turned into `hinge` and `swing`; the file holds one truth. I did not add
   `opensInto` to the file: two ways of stating one thing could disagree.
3. **"As seen from" defaults to the room the door opens into.** Conventions differ by country;
   naming the room (`seen_from`, `seen from`) removes the doubt. I did not record local handing
   words or their sources (the card's "how"): none was added.
4. **A garage door sweeps nothing**, like a roller door: an overhead door parks under the ceiling.
   An up-and-over door's canopy swings out a little; that is not drawn or checked.
5. **A folding door's sweep** is a strip one panel deep along the part that folds, its panels at
   most `foldingPanel` (0.6 m, Grid's own) wide. The plan symbol is a zig-zag in proportions of
   the door. A folding door needs both `hinge` (the end it folds to) and `swing`.
6. **The wide-door question** asks at 1.5 m (`wideSingleLeaf`, the lab's figure, Grid's own) and
   only when no kind is stated: a door stated `single` that wide is the person's word and is not
   asked about. It is a warning in `grid check`, so a plan that has one gets a line it did not get
   before.
7. **Leaves are drawn closed in 3D**, hung from the face they open toward, as IFC draws a door.
   A door with no face stated has its leaf in the middle of the wall. The frame and leaf sizes are
   Grid's own drawing sizes, in the tolerance table; the plan holds no frame.
8. **The 3D colours** reuse the plan's tokens (frame: the outside wall's, leaf: the floor's,
   glass: the background's, at 0.35 opacity) rather than adding `--plan-*-3d` tokens, which would
   move the colour tests. New tokens are a small change if the look needs them.
9. **The part that opens** sits at the hinge end, from the sill up. A top-hung vent or a part in
   the middle cannot be said yet. A door's part narrower than the door is a fixed glazed panel
   beside the leaf in 3D (a sidelight) and a thin line in plan. No `glazed` field for doors: a
   glazed leaf, and R-6's "a sliding glazed door that counts as a door for routes", are a
   follow-up (a sliding door already counts as a door for routes, as every door does).
10. **IFC**: one glass style per storey, since the exporter keeps one context per storey; one per
    file would be tidier. IFC2x3 has no overhead door: a garage door is `USERDEFINED`, named. No
    `IfcDoorPanelProperties` or `IfcWindowPanelProperties` are written: the operation and the
    geometry say it. Door style GlobalIds of kinded doors are new keys; doors with no kind keep
    theirs.
11. **The scoreboard's probes.** `door-leaves` and `openable-part` now ask for `kind` and `opens`;
    the counts they feed moved (see Checks run). `exit-side` stays `none`: which side of an exit
    door is out is not this card.
12. **Not done, follow-ups**: `grid describe` (the card and agent text) does not word a door's
    kind yet (the schedule and `describe --as rooms` do); `grid_change_opening` takes no `part`
    (write `opens` in the file, or rooms text's `part`); marks (WRT-6) cannot be put on `kind` or
    `opens`; problem report drafts (CMD-13) keep no opening kind; `useOpenLeaf` (CNT-13) still
    takes a leaf's allowance from every door, sliding or not.
13. **After merging `main` c05d051.** LVL-6's rooflights stay one pane 0.05 m thick in the IFC
    (`ROOFLIGHT_DEPTH`, main's old `LEAF_DEPTH`, kept for them alone): a rooflight is not an
    opening and takes no kind, so it gets no frame, sash or glass style. Giving rooflights CNT-14's
    parts would be a small follow-up. CNT-14's plan-format convention is now C12, since COD-3 and
    VEW-3 took C10 and C11 on `main`.
14. **After merging `main` 8a43380 (HND-1), the DXF's symbols by kind.** Choices made overnight:
    - A door or window of a kind is a block per symbol (`GRID-DOOR-SLIDING-2400x200`,
      `-P800` for the part that opens, `-H2100` for a garage door's height), placed by the jamb it
      hangs from as HND-1's doors are. A door stated `single` with no part keeps HND-1's door
      block (`GRID-DOOR-900x200-L`), since it draws the same.
    - Inside the block, a door's leaves and swings are on `GRID-DOOR-SWINGS` (as one leaf's are);
      its fixed panel and a window's faces and glass on layer 0, so they take `GRID-DOORS` or
      `GRID-WINDOWS`; a door keeps HND-1's line across the gap. The symbol's jambs are not written
      (the wall outlines end there, as for HND-1's blocks).
    - The dashed layer is `GRID-OPENINGS-ABOVE`, a new profile category `openings-above`, listed
      after `openings`, pen 0.18 mm dashed, colour 7 (the technical look's `above` pen, `fine`,
      at 1:100). An office can rename or repen it in `dxf-layers.json`. A high-level window has
      every line on it, so its block draws nothing on `GRID-WINDOWS` itself; say if it should.

## Checks run

On top of `main` ca2db98, on this branch:

- While building, only the touched tests, two workers. Failures on the way, each fixed: test
  fixtures of my own (a door taller than its wall, a pair's leaves meeting in the middle), the
  door check asking each door twice (`checkDoorSweeps` now asks once), the units chain
  (`opening/wide-single-leaf` follows from `plan/units-question`), and the changed expectations
  listed above.
- `npm run build`, `npm run typecheck`, `npm run lint`: pass.
- `npm run check:licenses`: "Checked 363 licences in package-lock.json: none is GPL, LGPL, AGPL,
  MPL, EPL."
- `npm run scoreboard -- --write-current`, then `npm run scoreboard`: 197, 278, 16, 5, **17**
  (was 15), 735, 95; "Same as the stored figures."
- `timeout 1500 npx vitest run --exclude '.claude/**' --maxWorkers=2 --minWorkers=1`: the first
  run failed 8 tests in 3 files (the OBJ and GLB name lists in `gltf.test.ts`, `planExport.test.ts`
  and `fileOrder.test.ts`, which did not yet hold the door and window parts); after updating them
  (and ordering the scene's openings by the plan), the second run: 280 of 280 files passed, 5,159
  tests passed, 4 skipped (5,163), in 1,122 s.

### Again after merging `main` c05d051

`main` brought, since ca2db98: zones inside one room (CNT-8), the place stored with the plan
(COD-3), comparing two versions by what stands where (WRT-8), the brief (BRF-1), sloped ceilings
and roofs (LVL-6), which rooms get the sun (BRF-5) and a camera saved as a named view (VEW-3).

**Conflicts and how each was kept**

- `CHANGELOG.md`: every Unreleased entry of both sides, CNT-14's first.
- `docs/result-contract.md`: both sides' rows (none clashed: CNT-14's
  `floor/not-checked-door-swings` beside COD-3's reworded place rows) and every agents' changelog
  entry, CNT-14's at the top. CNT-14's entry gains one line for `grid_diff` (below).
- `packages/floorplan/src/types/floorplan.ts`: both header conventions. COD-3 and VEW-3 took C10 and
  C11, so CNT-14's is now C12 (also in its two comments, `openingKinds.ts` and point 1 above). The
  opening's `kind` and `opens` sit beside main's fields; no top-level part changed, and
  `sheet/coverage.ts` (main's, with `views`) still type-checks.
- `validate.ts`, `edits.ts`, `readTools.ts`, `escape.ts`: import lists, the union of both.
- `scene3d.ts`: CNT-14's `SceneOpening` and `sceneOpening` beside LVL-6's `roofSolidOf`; in
  `buildScene` the scene's height is LVL-6's (the elevation's, under the roof) and each wall still
  adds its doors' and windows' parts.
- `export/ifc.ts`: `bodyRepresentation` takes one solid or CNT-14's list of parts, and LVL-6's
  representation type (`SweptSolid` or `Clipping`). CNT-14's `boxSolid` and `glazed` beside
  LVL-6's `clipped` and `above`. LVL-6's rooflight pane used `LEAF_DEPTH`, which CNT-14 had
  removed: it is `ROOFLIGHT_DEPTH` (0.05 m, the same figure), so rooflights are written as on
  `main` (For the owner 13).
- `scoreboard/current.json`: not hand-merged; written by the scoreboard (below).

**Where the two features meet.** Main's new opening code was read for CNT-14's kinds. LVL-6's
`opening/above-roof` measures heights only and needs no kind. BRF-1's `door_width` measures the
hole, as before. No new code on `main` sweeps a door, so no sweep needed teaching. WRT-8's building
comparison (`geometry/diff/building.ts`) named width, height, sill, hinge and swing but not the
kind: it now names a change of kind and of the part that opens, in the words CNT-14's plan
comparison (`quantities/compare.ts`) uses, with a test in `diff-building.test.ts` ("a door of
another kind"), under new ids too.

**Goldens.** Both sides changed the IFC exporter, so the four goldens were written again with
`-u`: byte for byte CNT-14's. Entity by entity against `main` (references and GlobalIds blanked)
the only changes are CNT-14's: each filler's one-box shape and the two styles' old description
went; the frame, leaf and glass solids with their profiles and placements, one glass style per
storey and the styles' new description came. No golden holds a roof, so LVL-6 moved none.

**Expectations changed.** None.

**Scoreboard** (`npm run scoreboard -- --write-current`, then `npm run scoreboard`): 197, 278,
**19**, 5, **18**, 735, 95. Turns answered 19 is above both sides (16 here, 18 on `main`): the
homeowner's sixth turn, "wide bifold doors and a roof lantern", needs `door-leaves` (CNT-14) and
`roof` (LVL-6). Checks fed 18 is LVL-6's 16 with CNT-14's two (`openable-part`). The reason is in
`scoreboard/README.md`.

**Checks run**

- While merging, only the touched tests, two workers: the floorplan export tests with the roof,
  zone, diff and kind tests (15 files, 456 tests passed), then `packages/rules`, the edits, the
  versions and the floorplan core (126 files, 3,082 passed, 1 skipped). No failure.
- `npm run build`, `npm run typecheck`, `npm run lint`: pass (the first type check failed on LVL-6's
  `LEAF_DEPTH`, fixed as above).
- `npm run scoreboard -- --write-current`, then `npm run scoreboard`: 197, 278, 19, 5, 18, 735, 95.
- `timeout 1500 npx vitest run --exclude '.claude/**' --maxWorkers=2 --minWorkers=1 packages/floorplan
  packages/rules packages/cli packages/viewer scoreboard/__tests__`: 292 of 292 files passed,
  5,244 tests passed, 4 skipped (5,248), in 706 s.

### Again after merging `main` 8b599e9 (LVL-8)

`main` brought facades drawn from the model and opening patterns (LVL-8).

**Conflicts and how each was kept**

- `CHANGELOG.md`, `docs/tolerances.md`: every entry and row of both sides, CNT-14's first.
- `docs/result-contract.md`: both agents' changelog entries, CNT-14's at the top, with one more
  line: a pattern carries its opening's kind, part and handing.
- `packages/floorplan/src/types/floorplan.ts`: LVL-8 took C12 for opening patterns, so CNT-14's
  convention is now C13 (the header, its two comments, `openingKinds.ts` and point 1 above).
- `geometry/tolerances.ts`: CNT-14's six entries, then LVL-8's three.
- `geometry/validate.ts`, `mcp/readTools.ts`: import lists, the union of both.

**Where the two features meet.** LVL-8's template opening (`PatternOpeningSchema`) took `hinge`
and `swing` but not CNT-14's fields: it now takes `kind` and `opens`, and `expandPatterns` gives
each opening it makes the kind, the part that opens and the handing. On a floor above whose wall
in the same line runs the other way, `hinge` and `swing` are now turned with the wall, so each
door hangs from the same jamb and opens to the same side (before, they were copied as written,
which put the leaf on the other jamb and face). Lengths in a plan written in millimetres or feet:
`planInMetres` did not scale an opening's `opens` (a gap in CNT-14 itself); it now scales
`opens.width` and `opens.height` on openings and on a pattern's opening, through a path of any
depth. New tests in `geometry/__tests__/patterns.test.ts`, "a pattern of doors or windows of a
kind": a pattern of sliding doors gives each opening its kind, part and handing and no opening
issue; a door repeated onto a wall drawn the other way has its handing turned; the part is read
in metres in a millimetre plan. `docs/plan-file.md`'s pattern table says so. The facade (LVL-8)
draws a door or window as its outline and does not draw its kind yet: a follow-up.

**Goldens.** No golden moved: LVL-8's four exporter lines leave the four files as they were
(the golden test passes as written).

**Expectations changed.** None.

**Scoreboard.** LVL-8 touched none of it; run anyway: 197, 278, 19, 5, 18, 735, 95, "Same as the
stored figures."

**Checks run**

- While merging: `patterns.test.ts` and `packages/floorplan/src/types` (11 files, 191 tests passed).
- `npm run build`, `npm run typecheck`, `npm run lint`: pass.
- `timeout 1500 npx vitest run --exclude '.claude/**' --maxWorkers=2 --minWorkers=1 packages/floorplan
  packages/rules packages/cli packages/viewer scoreboard/__tests__`: 297 of 297 files passed,
  5,298 tests passed, 4 skipped (5,302), in 1,214 s.
- `npm run scoreboard`: same as the stored figures.

### Again after merging `main` 8a433801 (HND-1)

`main` brought a DXF a drafter can keep working in (HND-1): AutoCAD 2013's version in UTF-8 and
metres, layers named and penned by an export profile (`neutral(...)`, `dxfProfile.ts`), doors,
windows and openings as blocks, filled walls, dimensions, room tags and an A3 layout, and a new
writer.

**Conflicts and how each was kept**

- `CHANGELOG.md`: both Unreleased entries, CNT-14's first.
- `docs/result-contract.md`: both agents' changelog entries, CNT-14's at the top, with one more
  line for the DXF (below).
- `packages/floorplan/src/geometry/export/dxf.ts`, four hunks (imports, `DXF_LAYERS`, the old R12
  writer and tables, the old entities): HND-1's side taken whole as the base, then CNT-14's
  drawing by kind carried into its blocks.

**How the DXF was combined.** `openingBlocks` asks, for each door or window, whether it states a
kind other than `single` or a part that opens (`kindBlock`). If so, `openingSymbol` (CNT-14's,
unchanged) draws it on the block's own opening: along +X, normal +Y, hung from the origin. A door
or window hung from its end jamb is HND-1's way round: inserted at that jamb and turned 180°, its
face swapped, as HND-1 does a door's hand. The block's key is the symbol itself (every line and
arc to the file's precision), so the same symbol is one block however many inserts use it. Its
name adds the kind, the part and a garage door's height to HND-1's (`GRID-DOOR-SLIDING-2400x200`,
`GRID-DOOR-POCKET-2400x300-R`). Inside the block, arcs and a door's leaves go on the door-swing
layer, a fixed panel and a window's faces and glass on layer 0 (the insert's `GRID-DOORS` or
`GRID-WINDOWS`), and lines marked `above` on the new dashed layer. A door keeps HND-1's line
across the gap, and the symbol's jambs are left to the wall outlines. The kinds that draw no arc
(sliding, pocket, roller, garage doors, and fixed, sliding or high-level windows) get none. A
door whose kind needs a swing the plan does not state, or a kind its type does not take, keeps
HND-1's block of before. `PlanOpening` already carried `kind`, `opens` and `height`.

**The new layer.** `GRID-OPENINGS-ABOVE` is `neutral('openings-above')`, a new profile category
in `DXF_CATEGORIES` right after `openings` (so the layer table lists it there), pen 0.18 mm,
colour 7, `dashed`, the technical look's `above` pen at 1:100. Like every HND-1 layer, it is
listed only when something is drawn on it, and `DASHED` with it. An office can rename or repen it
in `dxf-layers.json`. `docs/commands.md` ("What the DXF holds") says so and lists the category.
The choices are under For the owner 14.

**Tests.** HND-1's DXF tests (`dxf.test.ts` 64, `dxf.structure.test.ts` 13, `dxf.golden.test.ts`
2, the CLI's `dxfProfile.test.ts` 7, and the export, holes, exposure and joined-corner tests)
pass as written. Their plans state no kind, so neither the golden `one-room.dxf` nor the ARE-2
snapshot moved. Nothing was regenerated. CNT-14's DXF test (`geometry/export/__tests__/
openingKinds.test.ts`) passes as written. It gains three tests for where the two meet: every
door kind at both jambs and both faces, and every window kind at both jambs, on walls at four
angles (one drawn backwards), has each line and arc of the core's symbol where the core puts it,
on its layer, through the insert, and the file has no structural problem (`dxfProblems`); one
block per symbol, counted by its inserts; the dashed layer listed only when used, with `DASHED`
and weight 18; a `single` door with no part on HND-1's block. Making the end-jamb face swap
wrong fails two of them.

**Expectations changed.** None.

**Checks run**

- `npm run build`, `npm run typecheck`, `npm run lint`: pass.
- While merging: the DXF and export tests (22 files, 527 tests passed), then `openingKinds.test.ts`
  (10 passed).
- `timeout 1500 npx vitest run --exclude '.claude/**' --maxWorkers=2 --minWorkers=1 packages/floorplan
  packages/cli packages/viewer scoreboard/__tests__`: 274 of 274 files passed, 4,926 tests passed,
  3 skipped (4,929), in 549 s. `packages/rules` was not in this run: the merge does not touch it.
- `npm run scoreboard`: 197, 278, 19, 5, 18, 735, 95, "Same as the stored figures." Nothing
  stored.

### Again after merging `main` 26e928e (WRT-4, BRF-3)

`main` moved while the HND-1 merge was checked, so it was merged again: repeat, mirror and turn,
and a mirrored plan recognised (WRT-4), and the plot, its set-backs and the distances to it
(BRF-3).

**Conflicts and how each was kept**

- `CHANGELOG.md`: every Unreleased entry of both sides, CNT-14's first.
- `docs/result-contract.md`: every agents' changelog entry, CNT-14's at the top.
- `packages/floorplan/src/types/floorplan.ts`: BRF-3 took C13 for the plot, so CNT-14's convention
  became C14 (the header, its three comments, `openingKinds.ts` and point 1 above); C15 after the
  next merge.
- `geometry/floorplan.ts`, `rules/src/result/inspect.ts`: import lists, the union of both
  (`inspect.ts` keeps CNT-14's `checkDoorSweeps` in place of `validateDoorSweeps`, and BRF-3's
  `siteThingsText`).
- `scoreboard/current.json`: not hand-merged; written by the scoreboard (below).

**Where the two features meet.** WRT-4's mirror (`mirrorPlan`) and the core's turn recognition
(`diff/turn.ts`) swap a door's `swing` and keep its other fields, so a door's kind and part go
with it. That holds for every kind: `hinge` names a jamb by the wall's end, which a mirror keeps,
and `swing` the face, which a mirror swaps, whether the door swings, slides or rolls. Rooms
text's `copy <floor> with openings` copies the opening lines whole, kind and part included. BRF-3
does not touch openings. Nothing needed changing.

**Expectations changed.** None.

**Scoreboard** (`npm run scoreboard -- --write-current`, then `npm run scoreboard`): 197, 278,
**20**, 5, **22**, 735, 95. Turns answered 20 is main's 19 and the homeowner's sixth turn
(`door-leaves` with `roof`). Checks fed 22 is main's 20 and CNT-14's two (`openable-part`). The
reason is in `scoreboard/README.md`.

**Checks run**

- `npm run build`, `npm run typecheck`, `npm run lint`: pass.
- `timeout 1500 npx vitest run --exclude '.claude/**' --maxWorkers=2 --minWorkers=1 packages/floorplan
  packages/rules packages/cli packages/viewer scoreboard/__tests__`: 306 of 306 files passed,
  5,378 tests passed, 4 skipped (5,382), in 874 s.
- `npm run scoreboard`: 197, 278, 20, 5, 22, 735, 95, "Same as the stored figures."

### Again after merging `main` e486ccb (CNT-17, LVL-9)

`main` moved again while the merge above was checked: accessibility measurements, as numbers
only (CNT-17), and sections drawn from the model with section and level marks (LVL-9).

**Conflicts and how each was kept**

- `CHANGELOG.md`: every Unreleased entry of both sides, CNT-14's first.
- `docs/result-contract.md`: every agents' changelog entry, CNT-14's at the top.
- `packages/floorplan/src/types/floorplan.ts`: CNT-17 took C14 for what needs to be accessible,
  so CNT-14's convention is now C15 (the header, its three comments, `openingKinds.ts` and point
  1 above).

**Where the two features meet.** CNT-17 measures each door's clear width with CNT-13's
`doorwayClearance`, which takes a leaf's allowance (`useOpenLeaf`) off every door. That is For
the owner 12's follow-up, now seen in one more answer: a sliding, pocket, roller or garage door
has no leaf standing in its opening, and a pair has two. Not changed here: it would move CNT-17's
EL-15 figures, and the right allowance per kind is a decision. LVL-9's sections, like LVL-8's
facades, draw no door leaves or glass, so a door's kind is not drawn there yet: the same
follow-up as the facade.

**Expectations changed.** None.

**Scoreboard** (`npm run scoreboard`): 197, 278, 20, 5, 22, 735, 95, "Same as the stored figures."
Main moved no count; nothing stored.

**Checks run**

- `npm run build`, `npm run typecheck`, `npm run lint`: pass.
- `timeout 1500 npx vitest run --exclude '.claude/**' --maxWorkers=2 --minWorkers=1 packages/floorplan
  packages/rules packages/cli packages/viewer scoreboard/__tests__`: stopped by its timeout on a
  machine with a load average near 245, after 146 files had passed and none had failed. The 167
  files it had not reached were run with the same options: 167 of 167 passed, 1,823 tests passed,
  2 skipped (1,825), in 1,387 s. Together that is every test file in the five folders once, none
  failed.

### Again after merging `main` 4fe29ed (COD-8)

`main` moved once more: a firm's own standards as checks (COD-8).

**Conflicts and how each was kept**

- `CHANGELOG.md`: both Unreleased entries, CNT-14's first.
- `docs/result-contract.md`: both agents' changelog entries, CNT-14's at the top.

**Where the two features meet.** COD-8's `firm/door-clear-width` reads a doorway's clear width
through CNT-13's `doorwayClearance`, as CNT-17 does, so the same follow-up holds (For the owner 12
and the merge above): a door that slides, rolls or lifts loses a leaf's allowance it does not
have. Not changed here. Nothing else in COD-8 reads a door's kind.

**Expectations changed.** None.

**Checks run**

- `npm run build`, `npm run typecheck`, `npm run lint`: pass.
- The affected tests, the five folders' 316 test files in two halves with the same options
  (`--exclude '.claude/**' --maxWorkers=2 --minWorkers=1`, `timeout 1500` each), on a machine with
  a load average between 220 and 310. First half: 157 of 158 files passed, 3,292 tests passed, 1
  skipped, 1 failed: `geometry/__tests__/diff-size.test.ts`, "diffs 1,000 entities … well inside a
  second", which took 14.4 s under that load (a timing guard; it passed in every run above).
  Second half: stopped by its timeout after 154 of 158 files had passed (about 2,175 tests, 3
  skipped), none failed. The 4 files it had not reached and `diff-size.test.ts` again: 5 of 5
  passed, 33 tests. Every file has passed once; none fails.
- `npm run scoreboard`: 197, 278, 20, 5, 22, 735, 95, "Same as the stored figures."

### Again after merging main 90a933b1 (HND-11)

`main` moved again: a survey drawn from its own numbers (HND-11): walls placed by a face, lengths
taped on site kept beside the drawing, and survey coordinates kept at a stored origin.

**Conflicts and how each was kept**

- `CHANGELOG.md`: both Unreleased entries, CNT-14's first.
- `docs/result-contract.md`: both agents' changelog entries, CNT-14's at the top. The code table
  keeps CNT-14's four codes and HND-11's two (`room/taped-differs`, `plan/taped-not-measured`).
- `packages/floorplan/src/types/floorplan.ts`: HND-11 took C15 for taped lengths, so CNT-14's
  convention is now C16 (the header, its three comments, `openingKinds.ts` and point 1 above).
- `packages/cli/src/edit/edits.ts`: the import lists, the union of both (CNT-14's kinds and
  handing, HND-11's `wallWithEnds`). The bodies merged on their own: `applyPatch` moves every
  changed wall end through `wallWithEnds` (and turns a face over on a mirror) and still drops a
  kind its new type does not take and a part that opens on a doorless opening. Every wall-moving
  path was checked: `stretch.ts`, `moveWall`, `mirrorPlan` and the turn go through `applyPatch`;
  `merge.ts`'s `cutWall` (used by `addRoom.ts`) places each piece with `wallWithEnds`;
  `split.ts` and `addRoom.ts` add only new walls, by their centre lines; `seat.ts` moves walls
  only in the reading, which is on centre lines.
- `packages/rules/src/result/inspect.ts`: the import list, CNT-14's `checkDoorSweeps` in place of
  `validateDoorSweeps` and HND-11's `taped…` helpers. The stages are both sides' in order, the
  door check (CNT-14's) and `taped` (HND-11's) each where its side put it.

**Where the two features meet.** A wall placed by its face is read on its centre line before
anything else sees it, and an opening's offset runs along the wall's axis, which a face does not
change, so a door or window of a kind is placed, checked, drawn and built in 3D as on that centre
line. A new test holds this (`geometry/__tests__/openingKinds.test.ts`, "places, checks and draws a
door or window of a kind on a wall placed by its face"): a double door, a sliding door opening in
part and a fixed window give the same openings, 3D parts, plan symbols and drawing notes on a wall
given by its left face as on the same wall by its centre line. A plan in other units already scales
`opens` with an opening's width (`LENGTH_FIELDS` in `types/units.ts`, tested in `patterns.test.ts`).
The exports' move to the site's origin moves the walls, and the openings with them. Not changed
here, and HND-11's own: `planInMetres` scales no `taped` length or `site.origin`, so a plan in
millimetres would read its taped lengths as metres.

**Expectations changed.** None.

**Checks run**

- `npm run build`, `npm run typecheck`, `npm run lint`: pass.
- The affected tests in three parts with the same options (`--exclude '.claude/**'
  --maxWorkers=2 --minWorkers=1`): `packages/floorplan`, 123 of 123 files, 3,239 tests passed;
  `packages/rules packages/viewer scoreboard/__tests__`, 103 of 103 files, 1,022 passed, 2
  skipped (1,024); `packages/cli`, 92 of 92 files, 1,262 passed. The new test was added while the
  first part ran, so its file was run again alone: 21 of 21 passed. No timing test failed, so none
  was rerun.
- `npm run scoreboard`: 197, 278, 20, 5, 22, 735, 95, "Same as the stored figures." Nothing stored.

### Again after merging main fbe5160e (WRT-7, CNT-10, VEW-9, VEW-4)

`main` moved again: the person's own units from rooms text to the sheet (WRT-7); existing,
demolished and new parts and a fit-out on a base plan (CNT-10); a route's walked length and the
walk-through (VEW-9); and the preview the person and the agent both point at (VEW-4).

**Conflicts and how each was kept**

- `CHANGELOG.md`: every Unreleased entry, CNT-14's first, then VEW-4's, VEW-9's, CNT-10's and
  WRT-7's.
- `docs/result-contract.md`: every agents' changelog entry, CNT-14's at the top. The code table
  merged on its own and keeps CNT-14's four codes beside CNT-10's three (`plan/read-after-work`,
  `opening/phase-wall`, `room/phase-wall`); the contract test holds it to the catalogue.
- `docs/plan-file.md`: both rows of the contents and both sections, "Kinds of door and window…"
  and then "Existing, demolished and new", in that order in both places.
- `packages/floorplan/src/types/floorplan.ts`: CNT-10 took C16 for phases, so CNT-14's convention
  is now **C17** (the header, after C16; its three comments; `openingKinds.ts`; point 1 above).
- `packages/floorplan/src/geometry/floorplan.ts`: one import line with both sides' types
  (`OpeningKind`, `OpeningPart`, `Phase`) and CNT-10's `phases` import; a drawn opening carries
  CNT-14's `kind`, `opens` and `height` and CNT-10's `phase`.
- `packages/floorplan/src/geometry/export/dxfProfile.ts`: both layer categories,
  `openings-above` (CNT-14) and `openings-demolished` (CNT-10), each with its pen.
- `packages/viewer/src/picture/scene.ts`: CNT-10's `host` wall (for a closing wall's phase paint)
  kept, and CNT-14's handing, kind symbol and `drawn` kept; demolished openings are still skipped
  before either.
- `packages/cli/src/edit/edits.ts`: the import lists, the union (CNT-14's kinds and handing,
  CNT-10's `Room`); `OpeningChange` takes both `phase` and `kind`.
- `packages/cli/src/mcp/editTools.ts` (`grid_add_room`), `writeTools.ts` (`grid_change_opening`),
  `readTools.ts` (`grid_schedule`): CNT-14's wording with WRT-7's last sentence on lengths
  ("Lengths are metres, or text with their unit", "Figures are in the units argument, else the
  plan's display…"). Every argument and output field from both sides; the tools' order is main's.
- `packages/cli/src/sheet/pages.ts`: an opening's row names its kind (CNT-14) and gives its size,
  sill and the part that opens in the plan's display (WRT-7), through one `sizeText`.

**Where the features meet.**

- WRT-7: rooms text reads lengths through `numberOf`, so `part <w> [x <h>]` takes a unit in one
  word (`part 36in x 2000mm`); the plan file stays in metres. A plan file in another unit already
  scaled `opens` (`LENGTH_FIELDS`, tested in `patterns.test.ts`). `grid_change_opening` has no part
  argument; its lengths already take text with a unit. The schedule's text and the sheet write the
  part in the chosen units. New test: `rooms/__tests__/units.test.ts`, "reads a door's part that
  opens (CNT-14) in its unit, and the read-back keeps it".
- CNT-10: in a plan with phases, a change keeps an opening's old self, demolished, when its shape
  changes. A door or window made another kind is another one, so `kind` joins `SHAPE_KEYS` in
  `packages/cli/src/edit/phases.ts`; a door rehung (`hinge`, `swing`) is still changed in place.
  New test: `mcp/__tests__/phases.test.ts`, "keeps a door made another kind (CNT-14) as its old
  self, to be demolished, beside the new one". The DXF writes no kind block for an opening to be
  demolished (its outline only), and the 2D drawing skips its symbol, as before.
- VEW-4: `pickInModel` meets a door or window where its hole is in its wall, so a kind's frame,
  leaves and glass change nothing it picks. VEW-9: unaffected.

**Expectations changed.** None.

**Checks run**

- `npm run build`, `npm run typecheck`, `npm run lint`: pass.
- The affected tests in three parts with the same options (`--exclude '.claude/**'
  --maxWorkers=2 --minWorkers=1`): `packages/floorplan`, 127 of 127 files, 3,268 passed, 1
  skipped (3,269); `packages/cli`, 98 of 98 files, 1,349 passed, 1 skipped (1,350);
  `packages/rules packages/viewer scoreboard/__tests__`, 104 of 104 files, 1,026 passed, 2
  skipped (1,028). No timing test failed, so none was rerun.
- `npm run scoreboard`: 197, 278, 20, 5, 22, 735, 95, "Same as the stored figures." Nothing stored.

### Again after merging main 65e37ca1 (BRF-4, HND-12)

`main` moved again: massing before walls and how much fits on a plot (BRF-4), and a plan from a
phone room scan, read from each wall's two faces and kept beside the plan as evidence (HND-12).

**Conflicts and how each was kept**

- `CHANGELOG.md`: every Unreleased entry, CNT-14's first, then HND-12's and BRF-4's, then VEW-4's,
  VEW-9's, CNT-10's and WRT-7's.
- `docs/result-contract.md`: every agents' changelog entry, CNT-14's at the top, then HND-12's and
  BRF-4's. The code table merged on its own and keeps CNT-14's four codes beside BRF-4's
  `floor/past-outline`; the contract test holds it to the catalogue.
- `docs/tool-server.md`: `grid_write_rooms` as main has it (with `scan`), `grid_change_opening` as
  CNT-14 has it (the side it is hinged on as seen from a room, its kind).
- `packages/cli/src/mcp/readTools.ts`: one import line with CNT-14's `kindWords` and BRF-4's
  `planStoreys`.
- `packages/floorplan/src/rooms/read.ts`: both imports, CNT-14's `openingKinds` and BRF-4's
  `RAW_FLOOR_KEYS`. The read-back writes both: CNT-14's kind, `hinged`, `seen from` and `part`
  words on door and window lines, BRF-4's `outline`, `homes` and `parking` on `raw floor` lines;
  the words do not meet, and the read-back still writes again losslessly (rooms tests pass).
- `packages/floorplan/src/types/floorplan.ts`: BRF-4 holds C17 for floor outlines on `main`. The
  coordinator assigned CNT-14 **C20** (C18 and C19 are kept for CNT-4 and LVL-5, not yet on
  `main`, so the header goes C17, then C20). Renamed in the header, its three comments,
  `openingKinds.ts` and point 1 above; BRF-4's own C17 comments and docs are untouched.

**Where the features meet.**

- HND-12: a scan makes doors, windows and openings with no `kind`, no `opens` and no `hinge` or
  `swing` (it says which way none opens, and lists that as assumed). Each door is therefore one
  swinging leaf, and CNT-14's `floor/not-checked-door-swings` now names the scanned doors as not
  checked, instead of leaving them out in silence. A scanned door 1.5 m wide or more would also
  get `opening/wide-single-leaf`; the lab's scan has none. A re-scan over a plan changed since is
  refused, as before; with `--replace` it carries a part's facts and room numbers by id, not a
  door's kind or handing, which is the same as writing rooms text over a plan with `--replace`.
  Carrying a door's kind and handing across a re-scan would be a follow-up of its own.
- BRF-4: a massing floor has no walls and so no openings; the outline mirrors and turns with the
  walls, and CNT-14's handing is mirrored with them, as before. Nothing else meets.

**Expectations changed.** One. `packages/cli/src/command/__tests__/scan.test.ts`, "writes the
plan with no issue but the values to confirm…": `grid check` on the scanned flat now has one
not-checked line, `floor/not-checked-door-swings` for `door-1` to `door-4` (was 0), beside the six
`plan/value-assumed` lines; the test also holds that no scanned opening states `kind` or `opens`.

**Checks run**

- `npm run build`, `npm run typecheck`, `npm run lint`: pass.
- The affected tests in three parts with the same options (`--exclude '.claude/**'
  --maxWorkers=2 --minWorkers=1`): `packages/floorplan`, 129 of 129 files, 3,297 passed, 1
  skipped (3,298); `packages/rules packages/viewer scoreboard/__tests__`, 105 of 105 files, 1,028
  passed, 2 skipped (1,030); `packages/cli`, 100 of 100 files, 1,362 passed, 1 skipped (1,363).
  No timing test failed, so none was rerun.
- `npm run scoreboard`: 197, 278, 20, 5, 22, 735, 95, "Same as the stored figures." Nothing stored.

### Again after merging main 8a0c839e (CNT-4, LVL-5, BRF-6)

`main` moved again: flats, flat types and the mix (CNT-4), walls through floors and floors that
line up (LVL-5), and a first layout from the brief with a door's alignment (BRF-6).

**Conflicts and how each was kept**

- `packages/cli/src/mcp/readTools.ts`: `grid_schedule`'s description keeps both: CNT-4's flats,
  the area of each flat and the unit mix in its first sentence, `of=flats` and each room's flat,
  and CNT-14's kind in the grouping and the kind, the part that opens and the handing with
  `of=openings`. It keeps CNT-14's "the plan holds no frame" (CNT-14 dropped "or leaf", since
  `opens` now states the part that opens). Its arguments (with `of=flats`) and outputs merged on
  their own; the tool order is main's.
- `packages/floorplan/src/geometry/floorplan.ts`: main's `flatOutlines` import kept; main's
  `MarkedPart`/`Phase` import is already in CNT-14's one line with `OpeningKind` and
  `OpeningPart`, so the second line was dropped. A drawn opening carries CNT-14's kind, part and
  height and CNT-10's phase; CNT-4's flat outlines are drawn as on `main`.
- `packages/floorplan/src/types/floorplan.ts`: the header goes C16, C17, C18 (CNT-4's flats), C19
  (LVL-5's walls through floors), then CNT-14's C20, with every schema field from both sides.
- `docs/rooms-first.md`: CNT-14's kind, `hinged` and `part` words, then BRF-6's door alignment and
  `layout` lines. `docs/tool-server.md`: `grid_write_rooms` as main has it (with `layout` and
  `scan`), `grid_change_opening` as CNT-14 has it.
- `CHANGELOG.md`: every Unreleased entry, CNT-14's first, then BRF-6's and CNT-4's.
- `docs/result-contract.md`: the code table takes LVL-5's new wording of
  `floor/not-checked-doors-not-drawn` and keeps CNT-14's `floor/not-checked-door-swings` below it;
  the agents' changelog has CNT-14's entry at the top, then BRF-6's, LVL-5's and CNT-4's.
- `scoreboard/README.md`: CNT-4's and LVL-5's notes, then CNT-14's, then the note for this merge.
- `scoreboard/current.json`: stored by `npm run scoreboard -- --write-current` (below).

**Conventions.** C18 and C19 are CNT-4's and LVL-5's on `main`, as the coordinator kept them;
CNT-14 stays C20.

**Where the features meet.**

- LVL-5: a floor's slice cuts an opening in a wall through floors into its stretch on that floor
  (`{ ...opening, sill, height }`), so the stretch keeps `kind`, `opens`, `hinge` and `swing`, and
  the 3D view, the exports and the sections draw the whole opening with its frame, leaves and
  glass (`wholeWall`). One gap, fixed: CNT-14's `opening/part-too-large` measured a stated part
  against the slice's stretch, so the stair window through two storeys with a part 2.3 m high was
  "higher than the 2.05 m opening" on the ground floor's slice (the drawing's warnings), though
  the whole plan said nothing. It now measures against the opening as the plan states it
  (`statedOpening` in `through.ts`). Test: `geometry/__tests__/through.test.ts`, "measures the
  part that opens of the window through two storeys against the whole window on each floor". Not
  changed: the rules' escape check measures a window's part no higher than the opening it is
  given (`partHeight`), so on a floor above its own it would see only that floor's stretch, as
  LVL-5 has it for any window.
- CNT-4: flats make no openings; a flat type placed many times (WRT-4's `unit` and `repeat`)
  carries each door's and window's kind and part into every copy. Test:
  `mcp/__tests__/flats.test.ts`, "carries a door's and a window's kind and part into every flat
  placed, and schedules both the flats and the kinds": `of=flats` lists the two flats,
  `of=openings` both pocket doors and both double windows with their 0.6 m part, and the grouped
  schedule `2 × pocket door`.
- BRF-6: a first layout places no doors or windows. Its door-alignment fix reads the rooms from a
  door line's third and fifth words, which CNT-14's kind, `hinged` and `part` words follow, so
  they do not meet.

**Expectations changed.** None; two tests added (above).

**Scoreboard.** Stored: 197, 277, 22, 5, 22, 735, 95. Against `main`'s stored figures (197, 277,
21, 5, 20, 735, 95): turns answered 21 to 22 (`door-leaves` with `roof`) and checks the plan can
feed 20 to 22 (`openable-part`), both CNT-14's own; damage that passes in silence is LVL-5's 277
(CNT-14's branch had 278).

**Checks run**

- `npm run build`, `npm run typecheck`, `npm run lint`: pass.
- The affected tests in three parts with the same options (`--exclude '.claude/**'
  --maxWorkers=2 --minWorkers=1`): `packages/floorplan`, 133 of 133 files, 3,343 passed, 1
  skipped (3,344); `packages/cli`, 103 of 103 files, 1,378 passed, 1 skipped (1,379);
  `packages/rules packages/viewer scoreboard/__tests__`, 108 of 109 files, 1,038 passed, 1
  failed, 2 skipped (1,041). The one failure was `scoreboard.test.ts` before the figures were
  stored ("Better than the stored figures", turns 22 against `main`'s 21); after
  `--write-current` the file alone, 19 of 19 passed.
- `npm run scoreboard`: 197, 277, 22, 5, 22, 735, 95, "Same as the stored figures."
