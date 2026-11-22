# SHT-4 review: dimensions along the walls, in chains

For the owner. SHT-4 replaces the room dimensions that measured each room's bounding box with
dimensions along the room's walls, and adds chains outside the plan: openings nearest, then
walls, then the overall size, each adding up to the next. Every dimension now says what each
of its ends measures to.

## What changed

1. **The core** (`packages/floorplan/src/geometry/dimensions.ts`):
   - `roomDimensions(room, walls)` reads the room's outline, which runs along its walls' inner
     faces. Corners where the outline carries straight on are dropped first.
     - A room with four square corners gets its width and depth, each along its own pair of
       walls, a quarter of the way in, however the plan is turned. The ids stay
       `<room>-width` and `<room>-depth`, and width × depth is still the room's area.
     - Any other room (an L, a bay, a skewed room) gets one dimension per side, `<room>-side-<n>`,
       0.4 m in from that side. A line that would leave the room is tried 0.2 m, 0.1 m and 0 m in.
       Sides shorter than 0.8 m get none, as before.
     - Every room line stays inside its room: inside the outline and out of its holes.
   - `outsideDimensions(drawing)` builds the chains. `planAxes(walls)` finds the plan's two main
     directions: the way most of its outside walls run, by length. Each of the four sides gets:
     - a chain of openings (`opening-<side>-<n>`) from the outer corner to each edge of a door
       or window in the walls that face that side;
     - a chain of walls (`wall-<side>-<n>`): where each such wall ends, and the two faces of
       every wall that meets it square (one line for a dividing line);
     - the overall size. `overall-width` (below) and `overall-height` (left) are always drawn,
       `overall-width-top` and `overall-height-right` only where that side has a chain.

     A wall faces a side when it runs along it and has a room just behind it and none in front.
     A chain is left out when it would only repeat the overall size. Every chain runs between
     the same two outer faces, so its parts add up to the overall size.
   - `Dimension` gains `measuredTo: [from, to]`, each `'face'`, `'centre-line'` or `'finish'`,
     and `side` for a dimension outside the plan. `DimensionKind` gains `'wall'`.
     `buildDimensions` takes `chains` (on by default) beside `overall`, `rooms` and `openings`.
     `overallDimensions` now takes the drawing, not its bounds.
   - `PlanWall` gains `thickness` (0 for a dividing line), so the chains know where the faces
     of a wall that meets the outside wall are.
2. **The tolerance table** gains two entries, mirrored in `docs/tolerances.md`:
   - `squareCorner` (0.0175, the sine of about 1 degree): when a room's corner is square, and
     when a wall runs along one of the plan's main directions;
   - `chainPoint` (0.001 m): two points of a chain closer than this are one.
3. **The viewer** (`picture/scene.ts`, `picture/look.ts`, `canvas2d/plan.css`):
   - The technical look has `draftedDimensions`. It ends each dimension line in two 45-degree
     ticks (7 px long, the `fine` pen) and turns the number along the line, so it reads from
     the bottom or the right. The working and dark looks keep plain ends and upright numbers.
   - A number outside the plan keeps off the room labels and the numbers already placed. It
     slides along its line, as a room dimension's number already did, or waits for a zoom.
   - Each dimension's `<g>` carries `data-measured-to`, such as `face face` or
     `face centre-line`.
   - `plan.css` has a rule for `dimension-tick`, so every part the scene paints has one there.
4. **Docs.** `docs/commands.md` gains "The sizes on a drawing". `docs/result-contract.md` gains
   a changelog entry: the record does not change, the pictures and the SVG's attributes do. The
   README is untouched.

## Against `done_when`

1. *The L-shaped living room is dimensioned side by side, not as 6.79 × 7.70 (DR-2). On the
   house turned 15 degrees, the living room reads 4.30 × 5.00 m.* The lab's plans are
   `F/scenarios/odd-house.json` (ground floor, room `g-living`) and
   `G/scenarios/s09a-house-turned-15.json` (room `living`), read from
   `scoreboard/data/lab-plans.ndjson.gz`. In
   `packages/floorplan/src/geometry/__tests__/dimensions.test.ts`:
   - "dimensions the L-shaped living room side by side…": seven sides, 6.79, 5.79, 2.70 (the
     bay), 2.88, 3.91, 2.00 and 3.79. None is 7.70, and every line stays inside the room.
   - "dimensions the living room of a house turned 15 degrees as 4.30 × 5.00": `living-width`
     4.300 and `living-depth` 5.000, and every room's width × depth is its area.
   - "dimensions a house turned 15 degrees along its walls": the main direction is 15 degrees,
     and the overall size is 9.00 × 10.00 (DR-2's "11.20 × 11.91 instead of 9 × 10").
2. *Outside chains add up within 1 mm.* "adds up: the openings and the walls each sum to the
   overall size within 1 mm" (the fixture plan) and "adds up on every floor of a third of the
   lab plans" (every third lab plan under 40,000 characters, every floor, over 300 chains).
   Each test also checks that a chain's parts meet end to end.
3. *Each dimension records what it measures to.* "records it for both ends of every
   dimension", "measures a room to the dividing line it stops at…" (the fixture's dining room:
   `r1-depth` is `face`, `centre-line`), and "measures the chains outside to the faces of the
   walls, and to a dividing line that meets them" (the fixture's left walls chain reaches the
   dividing line `v1`). In the picture, `data-measured-to`.

The technical look's ticks and turned numbers are tested in
`packages/viewer/src/picture/__tests__/looks.test.ts` ("ends every dimension line in two
45-degree ticks…"). The working look has neither ("leaves all of it to the technical look").

## Changed snapshots and expected figures

Every plan picture changes: the chains are new, and the view frames them, so it zooms out a
little. Line widths and label sizes, which are pixels times metres per pixel, change with it.

- `viewer/src/canvas2d/__tests__/__snapshots__/Canvas2D.plain.dom.test.tsx.snap`: the new
  chains, `data-measured-to` on every dimension, and the wider `viewBox`.
- `Canvas2D.restyle.dom.test.tsx.snap` (house and mixed plans) and
  `Canvas2D.unchanged.dom.test.tsx.snap`: the same.
- `viewer/src/picture/__tests__/__snapshots__/dividingLine.test.ts.snap`: only the dividing
  line's stroke width and dashes, which follow the zoom (0.01276 to 0.01509 m wide).
- `viewer/src/canvas2d/__tests__/Canvas2D.build.dom.test.tsx`:
  - "hides changed dimensions until the dimensions step": the house now has 27 dimensions, up
    from 6. There are 3 openings and 5 walls below, 3 walls on each other side, an overall
    size on each side, and the two rooms' widths and depths.
  - "never hides a dimension that did not change": 23, up from 6. The new window starts a
    chain of openings on the right. That pushes the right walls chain (3) and its overall size
    out, so those 4 move and wait with the 3 new ones.
- `floorplan/src/geometry/__tests__/dimensions.test.ts`: rewritten for the new layers. The
  "defaults" test now expects the kinds `opening`, `wall`, `overall` and `room`. The opening
  dimensions on each wall stay off by default. The old checks are kept: 5.25 × 8.25 overall,
  4.80 × 2.375 for the dining room, width × depth = area, and lines clear of the label.
- No scoreboard figure changed (see the checks run, below).

## The checks run

- `npm run build`: done. The bundle `grid.mjs` is 470,551 bytes, under the 500 kB limit.
- `npm run typecheck`: no errors in any workspace.
- `npm run lint`: no problems.
- `npm run check:licenses`: "Checked 363 licences in package-lock.json: none is GPL, LGPL,
  AGPL, MPL, EPL."
- `vitest run --exclude '.claude/**' --maxWorkers=2 --minWorkers=1`: Test Files 1 failed | 234
  passed (235), Tests 1 failed | 4653 passed | 3 skipped (4657). The one failure is a timing
  test, `diff-size.test.ts`, "diffs 1,000 entities … well inside a second" (1,223 ms, with a load
  average near 246). That code does not touch dimensions. Rerun alone, it passes (4 of 4).
- `npm run scoreboard`: "Same as the stored figures."

## For the owner

- **Finish.** `measuredTo` can say `finish`, but a plan records no finishes, so nothing
  measures to one yet. Room sizes are to the structural faces. Once the plan file can carry
  a finish thickness, the room lines move in by it and say `finish`.
- **Mixed ends.** `measuredTo` is a pair, one per end, not one word. A room between a wall and
  a dividing line is honestly `face` at one end and `centre-line` at the other. Say if you
  would rather have one word per dimension.
- **Four sides.** There are chains on every side that has outside walls facing it, with an
  overall size beside each. A drawing with only two dimensioned sides (below and left, as
  before) is one switch: draw `top` and `right` only when they hold openings.
- **Skewed walls.** Walls more than about 1 degree off the plan's main directions, such as the
  odd house's bay, are not in the chains. Their openings would show foreshortened there. Their
  ends still count in the chains of the walls they meet. Dimensioning a skewed wall along
  itself is a follow-up.
- **Short parts of a chain.** A wall's thickness (0.30, 0.12) is often narrower than its
  number. The number is still drawn at the middle when nothing else is there, so it can run
  past its ticks. Drafting would set it beside the chain. I kept it simple rather than move
  numbers out of line.
- **Upright numbers in the working look.** "Text along the line" is only in the technical look.
  The working look, which the app and agents' pictures use, keeps upright numbers. Labels stand
  at the same point in every look, and only the technical look turns them. So a turned number's
  room is reckoned with the upright number's box.
- **Spacing in metres.** The chains are 0.6 m out, then 0.5 m apart, in plan metres. On a very
  large plan in a small picture they crowd. A spacing in paper millimetres would need the
  scale in the core.
- **A wall faces a side** when a room lies just behind it and none in front, tried at five
  places along it. A courtyard wall stated `exterior` with rooms on both sides is not in any
  chain.
- **The overall size** is now to the walls' outer faces (and the ends of dividing lines), along
  the plan's main directions. Fixtures, stairs and room outlines no longer stretch it. On every
  plan where these sit inside the walls, the figure is unchanged.
- **`grid_view`'s line** still says "with inside sizes". It is true but no longer the whole
  story. I left it alone, because the replay scores hold that wording.
