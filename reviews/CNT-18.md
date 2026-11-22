# CNT-18: a curved wall

A wall can be an arc of a circle, given by its centre and the angle it turns through, with doors
and windows along the curve. A round room, a half-round bay or a stair tower is one wall with the
right area. This is the full arc, not the cheaper first step: the curve is in the plan file, and
every part of Grid that reads a wall reads it, exactly where that is cheap and by straight pieces
that follow it where a straight line is all the code can take. Which is which is in the table
under "For the owner".

## What changed

- **The plan file** (`packages/floorplan/src/types/floorplan.ts`, convention C8 in its header).
  A wall may state `arc: { centre: [x, y], sweep }`: `sweep` is the angle in degrees the wall
  turns through round `centre` from `start` to `end`, counter-clockwise positive as `turn` and
  `north` are, never 0 and at most a whole turn either way (the schema refuses others). 360 is a
  whole circle, whose `start` and `end` are one point. The radius is the distance from the centre
  to `start`. C1 and C2 hold along the curve: the wall grows half its thickness either side of
  it, and an opening's `offset` and `width` are measured along it; the hole is straight between
  its two edges. Optional and never defaulted, version 1, as CNT-1's rule asks: a plan with no
  curved wall reads, measures, draws and exports exactly as before. An `arc` the reader cannot
  read is read as not stated, as a hinge is (`plan/value-left-out`), and the wall is straight.
- **The curve** (`packages/floorplan/src/geometry/arc.ts`, new). `wallCurve` works out the centre,
  radius, start angle, the signed sweep that brings `start` round to `end` the stated way and the
  length along the curve; `curvePointAt`, `curveTangentAt`; `curveStations`, the distances the
  straight pieces meet at, each piece at most `arcSagitta` off the curve and turning at most
  `arcStep`, never more than `arcPiecesMost` pieces; `curveFault`, the two new refusals;
  `curveDeviation`, how far an export's pieces stand off at most.
- **A wall, curved or straight** (`wall.ts`). `wallLength`, `wallFrameAt` (the point, the way
  the axis runs and the normal at any distance along it), `wallPointAt`, `wallSegments` (one
  piece for a straight wall, the chords of a curve), `wallPath`, `openingChord` (an opening's
  straight hole), `straightPieces` (straight copies under the wall's id, for code that joins
  strips), and `wallSliceShape` (a run of wall with its faces as exact arcs, for the DXF).
  `wallSlicePolygon`, `wallPolygon`, `wallParts` and `wallPlanSlices` follow the curve; a whole
  circle's run after its last opening carries on round into the run before its first.
  `wallAxis` throws for a curved wall, so no code takes its chord for it.
- **Every reader of a wall** follows it: the room outline (`room.ts`, which traces a curved wall
  by its chords, oriented the way the ring arrives at it), the joints (`joints.ts`, along the
  curve's tangent at each end, and a wall that runs into a curve's middle), the plan drawing
  (`floorplan.ts`: `PlanWall.curve` with the exact arc and each run's exact faces), the 3D scene
  (`scene3d.ts`: `SceneWall.pieces`, flat pieces mitred to each other, a lintel and a sill over
  each hole; `SceneDivider.path`), the exposure, the spaces, the nesting, the outside walls, the
  areas (net, gross internal, gross external), the opening checks, the facing (a curved stretch
  cut where it comes to face another compass point), the steps between levels, the use
  indicators (a hole measured along its own chord), the route graph, the comparison of two plans
  (`arc` is a compared property, "curve changed"), the build order, the floor boxes, and the
  dimensions (a curved wall is not chained along a side; its faces count for the overall size).
- **Validation** (`validate.ts`): two new errors, each leaving the wall out of every view,
  measure and export: `wall/arc-ends-apart` (the end is more than `arcEnds` off where the sweep
  takes the start, or off the circle) and `wall/arc-too-tight` (a radius no more than half the
  thickness). An opening's fit is checked against the length along the curve. A curved wall's
  centre and sweep are numbers like any other (`wall/too-large`).
- **The exports.** The DXF writes a curved wall's faces as true arcs (an R12 `POLYLINE` with a
  bulge on each curved stretch) and a curved dividing line as an `ARC` or a `CIRCLE`. The IFC
  writes its `Axis` as an `IfcTrimmedCurve` on an `IfcCircle`, its body as an extruded outline of
  pieces (a whole circle as a ring with a void), and each opening as a void and filler on its
  chord, deep enough to cut both bowed faces. The OBJ and the GLB write the 3D pieces as one mesh
  per wall. Each export names what it writes as pieces, beside what it leaves out (HND-6):
  `exportContents` lists the curved walls and the rooms along them, `planExport` picks per format,
  and each file says it (`Grid_Approximated` in the IFC, the `GRID-LEFT-OUT` layer in the DXF,
  comment lines in the OBJ, `asset.extras.gridApproximated` in the GLB), with how far off the
  pieces are at most. `PlanExport.approximated`, `grid export`'s line on standard error and
  `grid_export`'s `approximated` say the same.
- **The viewer**: the 2D picture draws a curved dividing line along its stations and traces a
  curved wall round its curve in the build animation; the 3D view raises the pieces as one
  geometry per wall, draws a curved divider as dashes round the curve, and outlines a hole on its
  chord.
- **Rooms text** (`rooms/read.ts`): rooms text writes straight walls, so a floor with a curved
  wall is read back in Grid's own terms (`raw` lines, which keep the arc), whatever was asked
  for, and `rawFloors` says why. Writing it again loses nothing (a test writes it again).
- **The command and the tool server.** `grid describe` gives a curved wall's centre and sweep
  (`arc(5,5 360°)` for an agent; "curving 360° anticlockwise round 5, 5 (radius 3, 18.85 along
  the curve)" for a person), and gives no corner distances on a whole circle, which has none. The
  survey, the measures, the take-off, the estimate, the comparison and the part boxes follow the
  curve. The problem report keeps a wall's arc (numbers only). The room edits that would move,
  cut or measure from a side of a room refuse a curved wall, naming it (`refuseCurved`):
  `move-side`, `merge`, `split`, `add-room` against it, `stretch` that would move it, and an
  opening placed on a side or measured from a side of the drawing. An opening on a curved wall
  can still be widened, turned, made another type or moved along it from its start or end;
  `mirror` mirrors the centre and turns the sweep the other way.
- **Figures** (`tolerances.ts`, `docs/tolerances.md`), Grid's own, citing nothing: `arcEnds`
  0.005 m, `arcSagitta` 0.001 m, `arcStep` 0.03 radian (tolerances) and `arcPiecesMost` 1000 (a
  limit).
- **Docs**: `docs/plan-file.md`, new section "A curved wall" with its codes and a row in the
  page's list; `docs/commands.md` (what each export writes as an arc and what as pieces);
  `docs/tool-server.md` (`approximated`); the contract's code table (two codes) and a changelog
  entry for agents; a line under "Unreleased" in `CHANGELOG.md`; a bullet in `AGENTS.md`.

## Tests

- New `packages/floorplan/src/geometry/__tests__/curvedWalls.test.ts` (29): the schema reads and
  keeps an arc, refuses a sweep of 0 or past a whole turn, and reads an arc it cannot read as
  not stated (the lab's scenario s05b); the curve worked out; the pieces within a millimetre;
  **a round room of one arc wall within 0.1% of its hand area, and under 0.03%**; a 0.9 m door
  with no fault, straight across its hole (0.8966 m), both edges on the curve; one solid run round
  the circle open at the door; 3D pieces with one lintel and the unrolled elevation keeping the
  door; the net area; a half-round bay within 0.1%; a window on the curve; both refusals; joints
  along the tangent (in line, square; at a right angle, mitred); the exposure and the spaces; the
  gross areas of a round building; no wall fault on a curve; the revision and the comparison
  naming a changed curve; the facing every compass point; a door swinging from its straight
  edge into the room with nothing in its way; a clockwise curve; a curved dividing line; an
  opening past the end of the curve refused; the DXF bulges and `ARC`, the IFC trimmed circle,
  void, door and `Grid_Approximated`, the OBJ and GLB notes; a plan with no curved wall exports as
  before; the rooms-text read-back written again.
- New `packages/cli/src/mcp/__tests__/curvedWalls.test.ts` (6), through the tool server on a
  round room, a living room with a bay and a kitchen beside it: `grid_check` with no part it
  cannot draw; `grid_areas` within 0.1%; `grid_describe` for an agent, a person and as rooms;
  `grid_export` naming what each format writes as pieces, in its answer and in the file;
  `grid_merge_rooms` and `grid_move_room_side` refused on the curve, the kitchen beside it still
  moved; `grid_change_opening` widening the window on the bay, `grid_mirror` mirroring the arc.

Measured area of the round room (axis radius 3 m, 0.2 m thick, inside radius 2.9 m): 26.4166 m²
against 26.4208 m² by hand, 0.0157% under. The same circle at other radii: 0.0205% at an axis
radius of 0.5 m, 0.0170% at 1.2 m, 0.0134% at 10 m, 0.0033% at 40 m. The pieces are inscribed,
so the outline always measures a hair under the true curve.

### Changed expectations

- `packages/floorplan/src/types/__tests__/reading.test.ts`, "thick on a wall is named, with
  thickness as the word meant (MS-1)": the fields of a wall Grid knows now end with `arc`.
- `packages/rules/src/result/__tests__/result.test.ts`, "names thick on a wall, and the field
  meant (MS-1)": the same list, in the line's `needed`.

Nothing was removed, and no other expectation, golden file or snapshot changed.

## Scoreboard

"Same as the stored figures." On the way it was once worse: the guard "rooms Grid does not
measure" went 735 to 736 while an `arc` that could not be read left its wall out. The lab's
scenario s05b writes `"arc": {"radius": 3}`: no centre, no sweep. An arc has no default, so it is
now read as not stated, as a hinge is, with `plan/value-left-out`; the wall is straight and the
room is measured as before.

## The checks run

CHECKS_RUN

## For the owner

1. **Shipped: the full arc, not the cheaper first step.** The arc is in the plan file and every
   consumer reads it. What takes the exact arc and what follows it by straight pieces (each at
   most `arcSagitta`, 1 mm, off the curve and turning at most `arcStep`, 0.03 radian):

   | Consumer | Takes the arc | How |
   |---|---|---|
   | Room outline (`room.ts`) | pieces | traced by its chords; a round room of 2.9 m inside radius is 0.016% under |
   | Areas (net, gross internal, gross external) | pieces | the same outline and chord strips |
   | Wall length, offsets, opening fit | exact | along the curve (`wallLength`) |
   | Openings | exact | edges on the curve; the hole is the straight chord between them, by design (C8) |
   | Door swings, sweep check | exact | from the straight hole; the swing is a true arc |
   | Routes (door graph, way-out checks) | exact | each opening's sides from the curve's normal at its middle; room floors by the outline |
   | Exposure, spaces, outside walls, facing, use indicators | pieces | by the chords |
   | 3D scene, viewer, stills (meshes) | pieces | flat pieces mitred to each other |
   | 2D drawing (picture, sheet) | pieces drawn, exact data | faces drawn along stations (1 mm off: 0.02 mm on paper at 1:50); `PlanWall.curve` carries the exact arc for any drawing that wants it |
   | Rooms text | refuses, keeps | rooms-first writing has no curve; a floor with one is read back raw, which keeps it exactly |
   | Edits | refuse / exact | move-side, merge, split, add-room against it and a stretch that moves it are refused, naming the wall; an opening on it changes along the curve; mirror is exact; rename is unaffected |
   | Wall faults, `grid tidy` | left out | no fault is about a curved wall, and no fix moves one |
   | Dimensions | left out of chains | not chained along a side; its faces count in the overall size |
   | DXF | exact walls, pieces for rooms | faces as bulged polylines, a curved line as `ARC`/`CIRCLE`; room outlines along it as pieces, named |
   | IFC | exact axis, pieces for body | `Axis` an `IfcTrimmedCurve`; body, spaces and slabs as pieces, named in `Grid_Approximated` |
   | OBJ, GLB | pieces | facets; walls and floors named in the note |

2. **The schema: centre and sweep.** The brief says "centre and radius". The radius is the
   distance from the centre to `start`, so stating it again could only disagree; the sweep says
   which way round and how far, which centre and radius alone do not (two arcs join two points
   round one centre). A whole circle is `sweep: 360` with `start` equal to `end`. Alternatives,
   each a small change in `arc.ts` and the schema: a DXF-style bulge (no whole circle), or
   centre plus a direction (`clockwise: true`). Version 1, optional, never defaulted.
3. **An opening's width is along the curve**, as C2 measures it along a straight wall, so
   `offset + width` is still at most the wall's length. Its hole is the straight chord between
   its edges: a 0.90 m door on a 3 m radius is a 0.8966 m hole and leaf. If you would rather
   `width` be the straight width of the hole, it changes `openingSpan` and the fit check (the
   arc length of a chord is `2r·asin(w/2r)`).
4. **The area is by the chords, not sector-exact.** It is within 0.021% at every radius tried
   (0.5 m to 40 m), well inside the 0.1% the brief asks, and every check reads the same outline,
   so the room's area, its spaces and the overlap checks agree. A sector-exact correction is
   possible later (each piece's sliver is `r²(θ − sin θ)/2`); it would make the area and the
   outline disagree by that sliver.
5. **IFC body as pieces.** IFC2x3 profiles hold an arc only through an `IfcCompositeCurve` of
   trimmed circles, which not every Coordination View reader builds; the axis is exact. Writing
   the composite curve is the next step if a BIM tool shows the facets.
6. **The edits keep to straight walls.** Moving or cutting a curved wall well (a bay that grows
   with its room, a merge across a round room) is design work of its own; until then each edit
   refuses, naming the wall, and changes nothing.
7. **The wall faults leave a curved wall out**: a short or overrun curve and a duplicate curve go
   unnamed. Their fixes move an end along a straight line, which a curve does not have.
8. **An unreadable `arc` is read as not stated** (the wall drawn straight, with
   `plan/value-left-out`), as a hinge is, rather than leaving the wall out as a bad thickness
   does: an arc has no default to be wrong about. Leaving it out lost a room on the scoreboard.
9. **A whole circle with no opening** is one run that closes on itself at its start, with a
   radial seam there in the outline of the 2D drawing (too fine to see at print scale) and in the
   DXF polyline.
10. **`grid check` says nothing new about a curved plan that is sound**, and the label "General
    guidance, not your local rules" leads every answer as before. No figure check cites a curve.
