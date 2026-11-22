# CNT-3: north, front and where the building is

## What changed

- **Four new plan fields** (`packages/floorplan/src/types/floorplan.ts`, convention C7 in its
  header). Each is optional and never defaulted, and the file stays version `"1"`, as CNT-1's
  rule asks: a plan that states none parses with no key added and reads, draws, checks and
  exports as before.
  - `north`: where north lies on the drawing, in degrees counter-clockwise from its top (+y),
    as a north symbol's `turn` is: 0 up, 90 to -x, -90 to +x. Any finite number; it is read
    modulo 360.
  - `yAxis`: `up` (C4, as Grid draws every plan) or `down` (the coordinates are the building's
    mirror image, as a screen's or an image's pixels run). Unstated reads as `up`.
  - `front`: `{ wall }` or `{ opening }`, exactly one: the part whose outside face is the front.
  - `site`: `{ origin?: [x, y], latitude?, longitude?, elevation? }`: a point of the plan and
    where it is on the earth. Latitude and longitude come together; ±90 and ±180 at most.
    Nothing is placed on the earth without `origin`. Every field is optional because two lab
    plans already write a `site` of their own (`G/scenarios/s01b-site-fields.json`, a plot
    boundary, setbacks and a street; `s06c`, ground levels): with `origin` required, those
    plans failed the format whole and could no longer be edited (the full suite caught it in
    `scoreboard/__tests__/stairJoins.test.ts`). Now they read, and their fields are named as
    fields Grid does not hold.
  - The reader names fields inside `front` and `site` it does not know, like any other part, and
    `planTextProblem` holds `front.wall` and `front.opening` to an id's limit (MSG-9).
- **Which way things face** (`packages/floorplan/src/geometry/orientation.ts`, new). `planFacing`
  takes each stretch of a wall that `wallSides` (MSG-13) says faces outside, turns the normal of
  its outside face into a bearing with the stated north and y direction, and names the nearest
  of eight compass points. It gives every outside stretch, every opening in one (with the rooms
  it lets out of) and every room with the ways its outside walls face, longest first, and its
  windows' ways; and the front, or why it cannot be said. A plan with no north is answered with
  north taken as the top of the page it was drawn on (+y, or -y when y runs down), flagged
  `northStated: false`. Dividing lines and stretches shorter than `lineInside` face nowhere.
- **The north arrow.** `PlanDrawing.north` carries the stated north; the viewer draws SHT-7's
  north symbol (moved into `northShape` in `packages/viewer/src/picture/writing.ts`, so the
  note symbol and the arrow are one drawing) on a paper disc in the top-right corner of the
  view (`northArrowNode`, appended by `planPicture`). So `grid draw`, `grid_view` and every sheet
  page show it. A floor that places its own north symbol gets no second arrow, and a north
  symbol that states no `turn` now points to the stated north (`planNotes`).
- **IFC** (`packages/floorplan/src/geometry/export/ifc.ts`). The context's `TrueNorth` is the
  stated north, `IFCDIRECTION((-sin θ, cos θ))`, exact at quarter turns; a plan that states none
  gets `$` where Grid wrote `IFCDIRECTION((0.,1.))` for every plan (lab EL-14). A plan with a
  `site` puts the IFC site's placement on its origin with `RefLatitude`, `RefLongitude` (IFC2x3
  compound angles) and `RefElevation`, and places the building back by minus the origin, so
  every element keeps the plan's coordinates.
- **Asking which rooms face east.** `grid_measure` takes `what=facing` (optionally `room`): the
  north it used and whether the plan stated it, the y direction, the front, and the rooms,
  outside walls and openings with `faces` and `bearing`. No new tool: the count stays 16.
  `grid describe` (and `grid_describe`) adds, for a plan that states its north, its front or a
  y that runs down, a few lines: the north, which real way each side of the drawing faces, the
  rooms facing each way and the front; and "where north is" leaves its "not in the plan" line.
  `grid_view`'s text says where the arrow points for a plan with a north, and its description
  no longer says a plan holds no real north.
- **Mirroring** (`packages/cli/src/edit/edits.ts`). `grid_mirror` sets the stated north to minus
  itself and mirrors `site.origin` with the walls (a new `plan` field on `Patch`, applied to
  the file's own top-level keys). With north mirrored, left-right swaps the real east and west
  and top-bottom the real north and south, whichever way the drawing is turned. `yAxis` is kept
  (the result is a new design, drawn as before), and `front` keeps naming its part. Its answer
  says the north it mirrored.
- **Two new codes**, both worth a look (`catalogue.ts`, `inspect.ts`, the contract's table):
  `plan/front-not-said` (the front names a part the plan lacks, or one not facing outside) and
  `plan/y-down` (the plan's drawings and exports show the building mirrored).
- **The sheet's coverage**: `north` drawn; `yAxis`, `front` and `site` not shown, each with why.
- **A problem report** (CMD-13) keeps `north` and `yAxis` in the cleared plan and drops `site`
  and `front`.
- **Docs**: `docs/plan-file.md`, new section "North, front and where the building is" (with
  the real `what=facing` answer for a two-room house); a line in `commands.md`, `rooms-first.md`
  (its sides are the drawing's) and `tool-server.md`'s table; the contract's code table and a
  changelog entry for agents; a line under "Unreleased" in `CHANGELOG.md`.

## Scoreboard

"Checks the plan can feed" goes from 11 to 12: the plan now holds where north is (the
scoreboard's `north` capability probes `north: 0`), which feeds check 40, "window share by
facade and orientation". Check 42, sun shading, still lacks shading. The `site` capability
probes a plot boundary, which this `site` does not hold, so it stays unfed. Every other count is
unchanged. The new figures are stored in `scoreboard/current.json` in the same commit.

## Tests

- New `packages/floorplan/src/geometry/__tests__/orientation.test.ts` (19): the format (no key
  added when unstated; the four read; bad fronts, a lone latitude, a sideways y, an infinite
  north refused; a site with no origin, or with a plot boundary, read); bearings with north up, turned, y down and none; the eight points and exact
  quarter turns; which rooms face east in a two-room house, the openings' ways and that a door
  between rooms faces nowhere; everything turning with north 90, and the front with it; the
  fallback with no north, and with y down; the same building drawn mirrored with y down facing
  the same ways; each reason a front is not said; the drawing's `north`, and a north symbol
  taking it; the IFC's `TrueNorth` (`$`, and four stated norths), the site placement, and no
  placement for a site with no origin.
- New `packages/cli/src/mcp/__tests__/facing.test.ts` (8): `what=facing` with a stated north,
  with none, for one room, and refusing an argument it does not take; `grid_describe` for a
  person and an agent, and unchanged for a plan with no north; `grid_view`'s words; the two
  codes in `grid_check`; `grid_mirror` keeping every wall's real way swapped east-west, writing
  north 330 from 30 and 270 from 90, mirroring the site and keeping the front; and a plan with
  no north staying without one.
- New `packages/cli/src/draw/__tests__/north.test.ts` (4): one arrow, turned, with its N; none
  and a byte-identical picture for a plan without north (also with a site and `yAxis` stated);
  no second arrow beside the plan's own north symbol, which points north; the PNG, and no area,
  check or record line changed by a north.

### Changed expectations

- `packages/floorplan/src/geometry/export/__tests__/golden/*.ifc` (all four): regenerated. Each
  loses the line `IFCDIRECTION((0.,1.))`, the context's last argument becomes `$`, and every
  later entity number drops by one. I checked each file with a script that undoes exactly that
  on the old one: nothing else differs.
- `packages/floorplan/src/types/__tests__/reading.test.ts`, "names a field on every part …": the
  unknown plan field it adds was `site`, which the format now has; it is `plot` now, and the
  expected note `['', 'plot', null]`.
- `packages/rules/src/result/__tests__/result.test.ts`: `wordsNotRead()` added
  `site: { north: 12 }` as a field Grid does not know; it is `plot: { north: 12 }` now. The
  `needed` of the plan's unknown field lists the plan's fields, now with `north, yAxis, front,
  site` before `written`.

Nothing was removed.

## The checks run

- `npm run build`, `npm run typecheck` and `npm run lint`: clean.
- `npm run scoreboard`: "Same as the stored figures" (after storing checks fed 12).
- The full suite (`npx vitest run --exclude '.claude/**' --maxWorkers=2 --minWorkers=1`, under
  a load average near 250): 237 of 238 files passed, 4,669 tests passed and 3 skipped; the one
  failing file was `scoreboard/__tests__/stairJoins.test.ts`, which failed to load because a lab
  plan's own `site` had no `origin`. That was this branch's fault: `site.origin` is optional now
  (above), and the file passes alone (8 scoreboard test files, 53 passed, 2 skipped), as do the
  orientation, facing, reading and result tests rerun after the fix.

## For the owner

1. **The north's convention.** Degrees counter-clockwise from the top of the drawing, the same
   sense as a north symbol's and a fixture's `turn`. Architects often state the angle from
   project north to true north clockwise; that would be the same number negated. It is one
   line in `orientation.ts` and the docs if you prefer the other.
2. **The drawing's sides keep their names.** Rooms text, anchors, `grid_move_room_side`,
   `grid_view`'s 3D sides, the mirror's "east and west swap" and `grid describe`'s sides still
   call the top of the drawing north, even when the plan states a real north. Renaming them all
   by the real north would change what every existing rooms text means. `grid describe` now
   says which real way each side faces; `what=facing` always speaks real directions.
3. **The mirror is a new design.** `grid_mirror` negates the north (as the brief asks, so the
   promised swap is real) and keeps `yAxis`. The other reading, "the drawing was mirrored, the
   building was not", would instead flip `yAxis` too and keep every real direction; I did not
   build it, since the tool is for "flip it, the lounge on the other side". The site origin is
   mirrored with the walls; latitude and longitude are kept. Annotations, the sketch and stairs
   are still not mirrored by `grid_mirror` (they were not before either; seen, not changed), so
   a north symbol the plan places itself is not turned.
4. **A plan whose y runs down is not drawn the right way round.** Grid still draws and exports
   the coordinates with y up, so the drawing, the sheet, the DXF and the IFC show the mirror
   image; `grid check` says so (`plan/y-down`) and `what=facing` reads it the right way round.
   Drawing it flipped would touch every view and export. Its fix is said in words (negate every
   y, north to 180 less it, `yAxis` up); there is no tool for it.
5. **"No north" in IFC.** IFC reads an absent `TrueNorth` as +y, so a reader places a plan with
   no north exactly as before; the file only stops asserting it. If you want an explicit "north
   not known" for BIM users, a property on the site would be a small follow-up.
6. **Site in the IFC.** I write the site's latitude, longitude and elevation when an origin is
   stated, and put the IFC site's origin on that point; without an origin nothing is placed.
   The lab's agents wrote `site` as the plot (boundary, setbacks, street, ground levels); this
   `site` holds only where the building sits, so a plot remains a later card under the same key. The DXF, the sheet and the 3D views carry no
   location. A building's position may count as personal data for a home; the problem report
   drops it, but every IFC export carries it once stated.
7. **No tool sets them.** North, front, site and y direction are written in the plan file by
   hand (or by an agent writing JSON); rooms text has no line for them, though `grid write`
   keeps them when it rewrites a plan. A `front` that names a wall may go stale when rooms text
   rewrites the walls with new ids; `plan/front-not-said` then says so. Naming the front door
   (`opening`) survives better.
8. **The front is not drawn.** It is said by `grid describe` and `what=facing` only.
9. **Eight points, nearest.** A wall at 120° faces south-east, not east. The bearing is in the
   answer for an agent that wants a wider "east". Dividing lines face nowhere, so a room open to
   a terrace through a dividing line does not face that way.
10. **Where the arrow sits.** Top-right corner of the view, 30 px in, on a paper disc. On a plan
    that fills its frame it can sit over a dimension line. The app's live 2D view does not draw
    it (it draws `planScene`, and the arrow is added by `planPicture`).
