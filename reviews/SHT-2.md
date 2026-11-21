# SHT-2 review: walls joined at corners, and door leaves hung from the wall face

For the owner. SHT-2 (step 1b) landed on `main`. Below: what it changes, the decisions made
without you, the `done_when` results, the new door warnings counted on the lab's plans, every
snapshot and expected figure that moved, and what is still open.

## What SHT-2 changes

**Corners, decided once.** `packages/floorplan/src/geometry/joints.ts` (`wallJoints`) works out,
for every wall end that meets other walls, how far each of its two faces reaches past the end
of its axis. Every view and file builds its walls from those figures:

| Where | How it takes the corners |
|---|---|
| 2D drawing, DXF, the tidy trace (`traceWall`) | `PlanWall.slices` from `buildFloorPlan`, via `wallSlicePolygon(wall, from, to, ends)` |
| 3D view (Three), OBJ, GLB | `WallElevation.ends`: each face's ends move with `alongFace` (`mesh.ts`, `useWallGeometries.ts`) |
| IFC | a joined wall's body is an `IfcArbitraryClosedProfileDef` whose long sides stay parallel to the axis; a wall cut square keeps its `IfcRectangleProfileDef` |
| The door-swing check | the walls a leaf can hit are built with the same corners (`sweep.ts`) |

The rules at a joint:

- Two walls at an angle are mitred: each face runs to where it crosses the other wall's face on
  the same side. With different thicknesses both walls still end on one line, through the two
  crossings.
- Two walls in a straight line keep their square ends, which meet flush or with a step (ARE-2).
- A wall that runs into another that carries on (a T) stops at that wall's face. The wall it
  runs into is left as it is. Three or four ends at one point are treated the same way when two
  of them are in a straight line.
- Three or more ends with no two in line: the two closest to a straight line are mitred, and
  every other wall stops, cut square, where it covers the whole corner between them. It may
  overlap them a little. It never leaves a gap.
- A corner so sharp that the faces cross more than `mitreReach` (4) half thicknesses of the
  thicker wall from the joint is left cut square, as a drawing would bevel it.
- Walls join only on their own floor, only where their ends (or an end and another wall's
  axis) are within `joint` (1e-6 m) of each other, and dividing lines join nothing.

Each wall keeps a shape of its own, so it can still be picked, named and exported as itself. The
shapes meet edge to edge. Before, every wall was a strip cut square at its ends, and a partition
ran into the wall it met as far as that wall's centre line.

**Door leaves from the face.** `doorSwing` (`door.ts`) hangs the leaf from the face of the wall
the door opens towards, half the wall's thickness off the axis. The closed leaf lies across the
opening on that face. The 2D symbol, the DXF swing, the label placement round a swing and the
door-swing check all take it from there. A door in a dividing line hangs on the line, which has
no thickness.

## Decisions made without you

- **Mitre, not a fill.** The card left "mitre or fill" open. A mitre keeps one shape per wall, so
  selection, the per-wall layers of the DXF, the IFC walls and the 3D cache by wall all stay as
  they were, and each wall keeps its own height in 3D. A fill would have been an extra piece
  with no wall to belong to, and no single height where walls of two heights meet.
- **One shape per wall, not one merged outline.** The pieces meet exactly along shared edges and
  the 2D drawing paints walls with no outline, so no seam shows. A single merged outline for the
  DXF (SA5 asks for "no seams") would lose the wall ids and the two wall layers. It can be added
  as a separate layer later.
- **The mitre limit is a new entry in the tolerance table**, `mitreReach`, 4 half thicknesses
  (about 28°), listed in the README table as MSG-15 requires. 4 is the miter limit SVG uses by
  default.
- **The IFC door panel stays on the axis.** IFC draws a closed door panel, not a swing. It stays
  where it was, centred in the wall.
- **Room outlines are unchanged.** They already run from face crossing to face crossing, which is
  where a mitre puts the inside of each corner. A test checks that no joined wall reaches into
  any room of the two-bedroom flat.
- **The two-bedroom flat** is now a fixture, `packages/floorplan/fixtures/two-bed-flat.json`, a
  copy of the scoreboard's stored bench example (`scoreboard/data/bench-examples.json`).

## done_when

1. **Outside corners have no missing square in 2D, 3D and all four exports: the flat's drawn
   footprint equals its 75.05 m² outline (DR-1: 74.96).** Done. Each of these reads its own output
   back and measures the outside edge of the walls at 75.05 m², one piece with 4 corners:
   - 2D: `geometry/__tests__/joints.test.ts`, from the drawn slices and openings;
   - 3D: the same file, from the faces of every wall mesh;
   - OBJ, GLB and DXF: `geometry/export/__tests__/joined-corners.test.ts`, from the files' text and
     bytes;
   - IFC: `geometry/export/__tests__/ifc.test.ts`, "SHT-2 joined corners in the IFC file", from
     each wall's placed body.

   Before the change all five measured 74.96 m², the lab's figure (the tests were run first and
   failed with it).
2. **The 48-piece round room shows 0 wedges.** Done, in 2D and 3D: the outside and the inside
   edges each have exactly 48 corners, and the area is that of the 48-sided ring to 1e-6 m². An
   angled bay (45° corners) and walls of different thickness are tested too.
3. **A 0.9 m door into a 0.8 m corridor and a 0.75 m opening between 0.3 m walls raise
   door-swing warnings (DR-7); the new warnings on the lab plans are counted and listed.** Done:
   both lab plans (M-10's `ds-2b` and `ds-2c`) now get `opening/door-blocked`. The lab's corridor
   0.9 m deep stays silent, because the open leaf only touches the far wall
   (`geometry/__tests__/door-face.test.ts`). The count is below. There is no pull request (work is
   on `main`), so it is here.

## New door warnings on the lab's plans

Every plan in `scoreboard/data/` was run through `validateDoorSweeps` before and after.

**The 1,131 lab plans: 14 new lines, 8 gone.** Several lab folders hold copies of the same plan,
so these are five cases:

| Plan (copies) | New line | Why |
|---|---|---|
| M `ds-2b` corridor 0.8 m (3) | `opening/door-blocked front n` | DR-7: the 0.9 m leaf reaches 0.1 m into the far wall |
| M `ds-2c` 0.3 m walls (3) | `opening/door-blocked front n` | DR-7: reaches 0.15 m into it |
| B `s13-openings` / K `b-openings` (4) | `opening/door-blocked d-corner w` | the door's hinge jamb is on wall `w`'s axis at the corner. The leaf now reaches 0.15 m further, into the solid part of `w` past the other door, `d-end`. The pair already got `doors-collide` |
| H `h03-stair-U` (2) | `opening/doors-collide g-d-main g-d-front` | the front door and the hall door now overlap by a few centimetres |
| X `sonnet/brief-1/attempt-1` (2) | `opening/doors-collide d-front d-living` | the same, front door and living-room door |

Gone: `opening/door-blocked` for `t16-door` and `t48-door` in the round-room plan B `s05-curved`
(4 copies, 2 each). Both doors sit at offset 0, right at a joint, and the neighbouring piece's
square-cut end used to poke into the sweep. The mitre removed that false alarm.

**The 2,300 generated plans: 108 new lines (88 blocked, 20 collide), 19 gone (17 blocked, 2
collide)**, all in the `tight` family, whose rooms are as small as the generator makes them.

**The sound plans (scoreboard guard): 44 new lines, all `opening/doors-collide`, in 25 more
plans (70 to 95), none gone.** These are real collisions: leaves that start half a wall further
into the room now overlap by a few centimetres. In `random 6`, two 0.95 m leaves overlap across
about 4 cm; from the centre lines they missed by about 13 cm. The generator placed its doors
against the old reach.

## The scoreboard

Stored in `scoreboard/current.json`, explained in `scoreboard/README.md`:

- Guard: sound plans with a warning, 70 to 95: the door collisions above.
- Damage that passes in silence, 387 to 386 (caught vaguely 109 to 110).
- Every other count is unchanged. Rooms measured wrong stays 197.
- The detail of the lab areas also moved, from 20 to 25 unreadable plans and 16,451 to 16,435
  rooms compared. That is MSG-9's text limits, which landed without moving a count, so it had
  never been stored. SHT-2 reads the same 1,100 lab plans before and after.

## Snapshots and expected figures that changed

None of these is a figure changed to make a test pass. Each one is a position SHT-2 moves on
purpose: a wall end now at its corner, or a leaf now on its face. The tests keep what they
assert: lengths, the quarter turn, the side, the mirror image, 2 cm in and 2 cm clear. They now
state the face.

**2D view (snapshots, `packages/viewer/src/canvas2d/__tests__/__snapshots__/`).**
- `Canvas2D.plain.dom.test.tsx.snap`: 10 wall paths move their end vertices to the mitred
  corners (each corner of a 0.2 m wall 0.1 m out, or in). Nine attributes of dimension extension
  lines and one label transform differ by float noise (`0.1` to `0.10000000000000009`), because
  the drawing's bounds now come from the corner points.
- `Canvas2D.restyle.dom.test.tsx.snap`: its two whole-SVG snapshots (the house and the mixed
  fixture) differ in 17 wall paths, moved to their corners, and in 10 attributes of float noise
  of the same kind (dimension extension lines and one label transform).
- `Canvas2D.unchanged.dom.test.tsx.snap`: 7 wall paths, moved to their corners.

No door arc in these snapshots moves: their fixtures state no swing.

**2D view (expected figures).**
- `Canvas2D.door.dom.test.tsx`: the front door's leaf from y 0 to −0.9 becomes −0.1 to −1.0 (SVG
  y), and its arc ends at the far jamb on the face.
- `doorSymbol.test.ts`: the hand-checked case moves the same way. The 48 rotated cases now expect
  the pivot and the far jamb on the face the swing names.
- `labelPlacement.test.ts`: the swing's box runs from the face, y 0.1 to 1.1.

**3D (expected figures; no stored 3D snapshot exists).**
- `obj.test.ts`: the sample room's walls w1, w2 and w3 span 4.2 m and 3.2 m to their outer faces
  (−0.1 to 4.1), not 4 m and 3 m.
- `gltf.test.ts`: wall w3 spans x −0.1 to 4.1.
- Volumes are unchanged, because a mitred wall in a box room keeps its length times its
  thickness.

**DXF.**
- `dxf.test.ts.snap` did not change: its plan has no corner.
- `dxf.test.ts`: the door-swing figures put the leaf and the arc's centre on the face (1, 0.1) to
  (1, 1). The 24 rotated cases add half the wall along the normal.

**IFC golden files (`geometry/export/__tests__/golden/`).** In `one-floor.ifc` (4 walls),
`odd-walls.ifc` (8), `basement.ifc` (12) and `three-floors.ifc` (12), every joined wall's
`IFCRECTANGLEPROFILEDEF` becomes an `IFCARBITRARYCLOSEDPROFILEDEF` with its four corners. Entity
numbers after the first wall shift by the extra points. No other entity type changes in number.

**Geometry (expected figures).**
- `door.test.ts`: the hinge sits on the face, not at the jamb on the axis. The left and right
  swings mirror about the jamb on the axis, and the closed leaf reaches the far jamb on the face.
- `sweep.test.ts`: the walls placed against the leaf move 0.1 m with it. The faces at 0.88, 0.92
  and 0.895 become 0.98, 1.02 and 0.995, and the stub past the closed leaf goes from 0.005 and 0.02
  to 0.105 and 0.12. Two comments give the new centre and crossing.
- `ghosts.test.ts`: the removed 4 m wall's ghost is 4.2 m wide, to its corners.
- `build.test.ts`: "never reaches past the traced point" is checked while the trace is under way
  (t < 1). Once the wall is whole its mitred face runs past the end of the axis.

No `it.fails` was flipped: none was open for DR-1 or DR-7. `pinned-tests.md` is unchanged,
because no pinned test moved.

## Still open

- **The spaces and nesting checks** (`spaces.ts`, `nesting.ts`) still close corners with their own
  convex fill (`cornerFills`), on purpose: it is built a hair inside the faces for the polygon
  library's sake. It covers the same corner as the mitre, but it is a second decision. Moving
  them onto `wallJoints` is a follow-up, and it could move the spaces counts.
- **V-10 is not touched.** The 20 lab rooms one corner square off the referee are about where a
  room outline stops at a step between walls of different thickness. That is a decision on
  outlines, not on wall corners.
- **A door hard against a corner.** A door whose jamb lies within half a wall of the joint leaves
  a run too short for its mitre. The run is clamped so it never turns inside out, but the corner
  is then not fully closed on that side. The 3D mesh shifts only the ends of the wall, so such a
  door's hole can cross the shortened inner face.
- **Walls that stop short or overshoot** do not join (the card's MSG-12 note). That needs a
  tolerance larger than `joint`.
- **Three or more walls with no two in line** may overlap a little where they meet. It never
  leaves a gap.
