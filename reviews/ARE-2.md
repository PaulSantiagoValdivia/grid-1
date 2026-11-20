# ARE-2 review: dividing lines take no floor, walls in a row meet with a step

For the owner. ARE-2 landed on `main` while you were away, in three commits. It completes
step 1a. Below: what ARE-1 had already done, what ARE-2 adds, the decisions made without you,
the tests that changed, and what is still open.

## Already done by ARE-1

ARE-1 ported the lab's area patch, which held the geometry half of ARE-2. Checked again on
today's `main` before starting, so none of it was rebuilt:

- `wallFaces()` gives a virtual wall no width, whatever thickness it states (`wall.ts`).
- Walls in a row with different thickness are joined with a step at the end of the wall that
  stands further into the room (`joint` in `room.ts`).
- A crossing that overshoots a wall's end by more than two wall thicknesses becomes a step
  (lab V-4).
- The 2D picture already drew a dividing line as a dashed centre line, and since ARE-1 the
  rooms either side meet on it, so the floor runs on under it.

The generated sets are already in `scoreboard/data/generated-plans.ndjson.gz`, under `rows/`.
Counted on `main` against the referee:

| Set | Rooms | Not drawable | Wrong | Lab before the fix |
|---|---:|---:|---:|---|
| Walls in a row of different thickness (V-3) | 960 | 0 | 0 of 936 with a referee figure | 576 not drawable, 221 wrong |
| The same, every wall end moved up to 2 cm (V-4) | 720 | 0 | 0 of 687 with a referee figure | 519 wrong |

The referee has no figure for 57 of these rooms ("not enclosed"). Each one is a turned or
surveyed copy of a room it did measure: the turned copies equal their originals to 1e-13 m²,
and the surveyed ones are within 0.3 m² of them, as the 2 cm moves allow.

## What ARE-2 adds

1. **Schema** (`types/floorplan.ts`). A virtual wall may state thickness 0 and height 0, and
   gets 0 for both when it states neither. A solid wall keeps 0.2 m and 2.7 m and is still
   refused at 0, with the same issue, path and message as before. A negative value is
   refused on any wall.
2. **Z-5.** `types/__tests__/every-plan-parses.test.ts` sends every JSON fixture under
   `packages/*/fixtures/`, the bench examples and every plan the shared fixture builders make
   through the schema. Twin tests do the same for the rules and viewer fixtures.
3. **The Madrid and Berlin flats (R-7)**, rebuilt as `packages/floorplan/fixtures/madrid-flat.json`
   and `berlin-flat.json`, with no lab paths. Their tests are worked by hand room by room and
   checked against the referee.
4. **Drawing.** 3D: the core scene now lists each virtual wall as a divider (`Scene3D.dividers`),
   and `Divider3D` draws it as a dashed line 5 mm above the slabs, which meet on it. DXF: a
   line-type table with `CONTINUOUS` and `DASHED` (0.2 m dash, 0.1 m gap), and the
   `GRID-WALLS-VIRTUAL` layer uses `DASHED`. 2D: unchanged, now covered by a snapshot.
   Each drawing has a snapshot test.
5. **Two follow-on fixes** that the new default made necessary:
   - An opening in a dividing line was refused as `opening/too-tall` once the line's height
     defaulted to 0. A line has no height, so that check now skips virtual walls.
   - A gap in a dividing line was given the line's written thickness, so a line written
     0.3 m thick painted a 0.3 m strip across the floor. It now has no width.

## Decisions made without you

- **The Madrid flat totals 80.66 m², not 81.10.** The brief asked for 81.10. That figure is
  the lab's workaround plan, where the light well's 0.2 m walls were drawn 0.1 m thick to make
  the rooms drawable, which R-7 itself calls untrue. With the walls as built, the thicker wall
  takes a 0.05 m strip from each room it borders: the salón (0.114 m²), Dormitorio 2
  (0.114 m²) and the light well (0.218 m²). That is 80.66 m², worked by hand, and the
  referee agrees within one corner square per room. The test checks both: 80.66 m² as built
  and 81.10 m² with the walls thinned. There is no "no door" note on Dormitorio principal.
  The one "no door" note left is on the light well, which really has none (outdoor space,
  lab R-8).
- **Rooms measured wrong went from 200 to 203, and was stored.** Five lab plans gave a
  dividing line thickness 0, so the schema refused them. They are read now (unreadable lab
  plans 25 to 20, rooms compared 16,449 to 16,463). 11 of their 14 rooms agree with the
  referee. The other 3 are one probe in three copies (`v-wall-4-virtual-zero-thickness`). Its
  dividing line runs through the middle of the bedroom and is in no room's wall list. Grid
  measures the bedroom its walls list (9.00 m²); the referee stops at the line (4.50 m²).
  That is a wall list that does not match the space (V-9), not a measuring fault, and the
  lab's probe only asked that the plan be accepted. `scoreboard/README.md` says the same.
- **3D colour.** The dividing line uses the scene's existing grid-section colour. A new
  `--plan-virtual-3d` token would have meant changing the expected object in
  `usePlanColors.test.ts`, which pins every token.
- **2D drawing order kept.** Drawing dividing lines before the solid walls would hide the
  dashes where a line runs into a wall's end. It also changes the DOM order that two existing
  snapshots pin (`Canvas2D.plain`, `Canvas2D.restyle`). The dashes over a wall end are a
  small blemish, so I left the order and the snapshots as they were.
- **How far Z-5 reaches.** The committed test covers the fixture files and the shared
  builders. For the plans written inline in single tests, I ran the whole suite once with a
  probe that put every plan reaching the core through the schema. All 44 plans it refused
  are broken on purpose (NaN coordinates, a solid wall 0 thick, a sill below the floor), in
  the tests of what Grid does with broken plans. That probe is not committed.

## Tests that changed

No expected figure changed.

- `geometry/export/__tests__/dxf.test.ts`, "declares every layer any entity puts itself on".
  It took the first `ENDTAB` as the end of the layer table. The line-type table now comes
  first, as DXF readers expect, so the test reads up to the last `ENDTAB`. What it asserts
  is unchanged.
- `geometry/export/__tests__/gltf-large.test.ts`. Its hand-built `Scene3D` gained
  `dividers: []`, the new field.
- Expected failures flipped: `AR-2 a virtual wall may state thickness 0` and
  `Z-5 the shared fixture plan passes the schema`. Both are in
  `types/__tests__/floorplan.test.ts`, and `test-support/pinned-tests.md` lists them as fixed
  by ARE-2.

## Checks

`npm run build`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run check:licenses`
and `npm run scoreboard` pass. Of three runs of `npm test`, the first had DOM and CLI timing
failures and the next two passed in full. Scoreboard: rooms measured wrong 203, damage that
passes in silence 538, turns answered 15, mistakes named 2, checks fed 5, rooms not
measured 712, sound plans with a warning 70.

## Still open

- **Not looked at in a real program.** The DXF has not been opened in a CAD program (none is
  installed here), and the 3D line has been checked by its geometry, not by looking at the
  running app.
- **Corner squares (V-10).** The Berliner Zimmer is 0.033 m² off the referee, and two Madrid
  rooms 0.005 m² each. Where a thick wall ends at the step, the referee fills the corner and
  Grid does not. That needs the one corner decision for drawing, 3D and outlines.
- **A dividing line in no room's wall list** (the v-wall-4 probe) is measured as if absent.
  The unclaimed-floor checks (AR-3, AR-4, AR-15) should name it.
- **`npm test` also runs another session's worktree** under `.claude/worktrees/`, which
  doubles the test count. Excluding `.claude/` in `vitest.config` would stop that.
