# ARE-6 review: a room with a hole, such as a courtyard

For the owner. What ARE-6 adds, the change to the plan file (which needs your check), the
results on the lab's AR-5 case, the decisions made without you, every expected figure, golden
file and snapshot touched, and what is still open.

## What ARE-6 adds

A room can have holes. A ring gallery round a courtyard, or a car park round a core, is one room
with one area and one label. Its `boundary` lists the walls round the outside, as before, and
the new `holes` lists the walls round each hole, one list per hole:

```json
{ "id": "ring", "name": "Ring gallery", "boundary": ["os", "oe", "on", "ow"], "holes": [["cw", "cn", "ce", "cs"]] }
```

The room's floor is its outline less each hole. A hole is traced along the faces of its walls
that look into the room (`packages/floorplan/src/geometry/room.ts`), so the hole's walls are not
floor either: the same rule as the outline (C3), with the room on the other side of the walls.

Everything that reads a room's outline now takes its holes:

| Part | What it does with a hole |
|---|---|
| Area (`roomArea`, `roomFloorArea`) | Outline less each hole, and less any room marked `inside` (ARE-5) |
| 2D drawing (`buildFloorPlan`, viewer) | The room is one path of two loops; the hole winds the other way, so it stays open under either fill rule |
| Label | `labelAt` and the viewer's label placement use the point of the floor farthest from every edge, never a point in a hole |
| 3D floor (`buildScene`, `Slab3D`, `RoomMarker3D`) | The slab is a Three shape with a hole |
| OBJ and GLB floors (`floorMesh`) | Triangulated with the hole (the triangulation already took holes) |
| IFC space and slabs | `IfcArbitraryProfileDefWithVoids` (an IFC2X3 entity) with the hole as its inner curve; the floor slab and the roof get the same void |
| DXF | One more closed polyline per hole on `GRID-ROOMS`, right after the room's outline (see "DXF" below) |
| Door graph (`rules/graph.ts`) | A point in a hole is not in the room: a door in a core wall leads from the gallery to the courtyard |
| Wall sides (`exposure.ts`) | The hole's walls face the room on the side its floor is; a point in the hole is not in the room |
| Spaces and overlaps (ARE-4, ARE-5) | The room is set against the spaces and the other rooms by its outline less its holes, so a room drawn in the courtyard does not overlap the gallery |
| Wall faults | The hole's walls are the room's own, not walls standing in it; a wall standing in the courtyard stands in no room |
| Validation | A hole wall that is invalid, or on another floor, refuses the room as an outline wall does |
| Comparison and revision | `holes` is a compared property (`"Ring gallery" holes changed`); the revision key includes each hole |
| Measuring (CLI: `grid_measure`, take-off, room height) | The widest circle and what fits are found on the room's floor, never in a hole; the room's sides, perimeter and wall finishes include the hole's; the ceiling rests on the hole's walls too |

## The change to the plan file (needs your check)

One new optional field on a room, in `packages/floorplan/src/types/floorplan.ts`: `holes`, a
list of lists of wall ids. Each list has the same limits as `boundary` (MSG-9: at most 2,000
walls, ids checked like every id), and the CLI's reading layer (`packages/cli/src/command/planText.ts`)
checks them too, as `rooms[0].holes[1][3]`.

- **Version.** As ARE-5's `inside` and ARE-10's `height`, it is added as optional to version 1,
  never defaulted, so a plan written before reads with no key added. CNT-1 (the rule for how the
  format changes) is still not built, so whether this is the first field of a version 2 is yours
  to decide.
- **Order.** A hole lists its walls in the order they are met going round it, either way round:
  the tracing works out which face of each wall looks into the room, as it does for the outline.
- **Both spellings (WRT-1).** Rooms-first writing is decided but not built. When it is, a room
  written rooms first can carry the same `holes`.

## Results

### AR-5: one room, 75.60 m²

The lab's ring gallery (`s03b-ring-room`) is a 10 × 10 m square of 0.3 m walls round a 4 × 4 m
core of 0.3 m walls. By hand: 9.70 × 9.70 = 94.09 inside the outer walls, less the core to its
outer faces, 4.30 × 4.30 = 18.49, is 75.60 m². The referee's figure for it is 75.6.

| | Before ARE-6 | Now |
|---|---|---|
| The ring as one list (the lab's file) | Refused: `walls "ow" and "cw" are parallel and form no corner` | Refused, and the line now says how to list the hole (below) |
| The ring with its core as a hole | Not expressible | One room, 75.60 m² (equal to the referee to 9 decimals), no error |
| Its label | In the courtyard (lab picture, two halves) | In the gallery: (1.73, 1.73), the widest point of its floor |
| The two halves (`s03d`) | 37.80 + 37.80 | Unchanged. The card's 79.20 (+4.8%) was measured before ARE-1; since ARE-1 the halves already add up to 75.60 |

The lab's file still states no `holes`, so it is still refused: ARE-6 changes no plan that does
not use the field. The refusal now ends with the fix, worked out from the list itself:

> In room "ring", walls "ow" and "cw" are parallel and form no corner. The boundary may be out of
> order. If walls "cw", "cn", "ce", "cs" go round a hole in the room, list them as one of its
> holes, as "holes": [["cw", "cn", "ce", "cs"]], and the walls "os", "oe", "on", "ow" as its
> boundary.

The hint is given only when the list falls, at the two parallel walls named, into two rings that
each close with one inside the other (tried for lists of 6 to 400 walls). Written as the hint
says, the lab's plan measures 75.60, which a scoreboard test checks against the stored referee.

### Plans with no holes

Read and measured exactly as before:

- **Every test passes unchanged** (no expected figure, golden file or snapshot touched). The four
  IFC golden files, the DXF and OBJ tests, the 2D snapshots and the QAR-5 byte-identity tests
  pass as they were: a room with no holes writes the same bytes in every format.
- **The scoreboard did not move**: every count is the stored one (below).
- **One message changed**, and only for a refused room: the AR-5 hint above. It is added to the
  `room/unclosed` line of a room whose one list goes round two rings, one inside the other.

### Scoreboard

| Count | Stored | Now |
|---|---:|---:|
| Rooms measured wrong | 197 | 197 |
| Damage that passes in silence | 386 | 386 |
| Turns answered | 15 | 15 |
| Design mistakes named | 2 | 2 |
| Checks the plan can feed | 5 | 5 |
| Guard: rooms Grid does not measure | 724 | 724 |
| Guard: sound plans with a warning | 95 | 95 |

No count moved, so `scoreboard/current.json` is unchanged. No lab plan states a hole: the lab's
ring room is among the 724 rooms not measured, as written.

## Decisions made without you

- **A field, not a second kind of room.** The card's "one outer list plus inner lists, one per
  hole" is `boundary` plus `holes`. `boundary` keeps its meaning, so nothing that reads it had to
  change for plans without holes.
- **Measured to the faces that look into the room.** The hole is the courtyard and the core's
  walls, as the lab measured by hand and as the referee does.
- **A hole must sit inside the room with floor all round it.** One that reaches or crosses the
  outline gets the new error `room/hole-outside`, and two holes that overlap or touch get
  `room/holes-overlap`; the room is then not drawn, as with any outline that is not a room's. A
  hole that reaches the outline makes a U, or cuts the room in two, which are rooms of their own
  shape. A hole whose list cannot close or is out of order gets the outline's codes
  (`room/unclosed`, `room/out-of-order`, `room/inside-out`), with the hole named
  (`Hole 1 of room "r" references wall "nope", which does not exist`).
- **The hole's area is not counted anywhere.** It is not given to any room and not reported as a
  room of its own. What lies in it is up to the plan: a room drawn in the courtyard is measured
  on its own (13.69 m² inside the core's walls in the fixture), and it neither overlaps the
  gallery nor is unclaimed.
- **The label of a room with no hole** is still placed at the average of its corners
  (`labelAt`), as before; only a room with holes uses the farthest point of its floor. SHT-5's
  note that DXF labels should move to that point everywhere is still open (it would change every
  DXF).
- **DXF.** The file is R12, which has no HATCH entity: a room is a closed polyline on
  `GRID-ROOMS`, which is what a reader hatches or fills. Each hole is written as its own closed
  polyline on the same layer, right after its room's outline, so a hatch made from them leaves the
  hole as an island. A separate layer for holes would have changed the layer table, and so the
  bytes, of every DXF Grid writes.
- **Comparison.** A hole is shown in a change as its wall ids written as JSON, one entry per hole,
  because a property value is a list of text (`PropValue`). No holes stated and an empty list are
  the same room, with the same revision key.

## Tests

No expected figure, golden file or snapshot changed. Four test literals gained the new required
`holes: []` field and nothing else: a `PlanRoom` in `geometry/__tests__/dimensions.test.ts`, and a
`SceneSlab` in `geometry/export/__tests__/gltf-large.test.ts`, `viewer/src/canvas3d/__tests__/Slab3D.test.ts`
and `viewer/src/canvas3d/__tests__/RoomMarker3D.test.ts`. No `it.fails` existed for AR-5, so
none flipped (`pinned-tests.md` says so).

New:

- `packages/floorplan/fixtures/ring-gallery.json`: the lab's s03b plan with the core as a hole.
- `packages/floorplan/src/geometry/__tests__/holes.test.ts` (24 tests): the format; 75.60 by
  hand; the hole's faces and winding; either order and a turned plan 250 km out; two holes; an
  L-shaped hole; a hole on the outline, two holes overlapping, a hole that does not close or is out
  of order; the drawing, its label in the ring and a room with no hole as before; the DXF outlines;
  the 3D slab, OBJ and GLB floors with nothing in the courtyard; wall sides; a door into the
  courtyard; walls standing in the gallery and in the courtyard; a room drawn in the courtyard;
  the comparison and the revision key; the lab's one-list ring and its hint.
- "a room with a hole (ARE-6)" in `geometry/export/__tests__/ifc.test.ts` (3 tests), read back
  through the test's strict STEP reader: the space's profile with one void, 94.09 less 18.49;
  the floor slab and roof with the same void; no void for a room without a hole.
- `packages/cli/src/quantities/__tests__/holes.test.ts` (2 tests): the widest circle on the
  gallery, not in the courtyard; the perimeter of 56.00 m round both; what fits; the ceiling on a
  lower core wall.
- `packages/viewer/src/picture/__tests__/holes.test.ts` (3 tests): the room path's two loops wind
  opposite ways; the label box is clear of the courtyard at three zooms; the 3D slab has no vertex
  in the courtyard.
- The AR-5 case in `scoreboard/__tests__/scoreboard.test.ts`: the lab's stored plan as written
  (refused, with the hint) and rewritten as the hint says (75.6, the stored referee figure).

## Checks

`npm run build`, `npm run typecheck`, `npm run lint`, `npm run check:licenses`,
`npx vitest run --exclude '.claude/**'` and `npm run scoreboard` pass; the counts are in the
hand-over message.

## Still open

- **The courtyard is reported as unclaimed floor.** The fixture gets ARE-4's warning
  `floor/unclaimed`: 13.69 m² enclosed by the core's walls that no room claims, "If it is a room,
  draw it as one." The two halves got the same line before ARE-6, so it is not new, but a plan
  that states a hole has said the floor there is not the room's. Two ways: leave it (a core in a
  car park usually holds stairs and lifts that should be drawn), or let a hole whose walls are
  all stated `exterior` mark the floor in it as outside. Yours to decide.
- **Rooms inside rooms in 3D and the IFC.** ARE-5's open point stands: a host's slab and
  `IfcSpace` still run under a room marked `inside`. The hole machinery here (slab with holes,
  profile with voids) is what that needs; the inner rooms' footprints would be the holes. Not done
  here, to keep plans without `holes` unchanged.
- **Editing tools and tidy fixes do not write holes.** `grid_move_room_side`, `grid_mirror` and
  the wall-fault fixes change `boundary` only. A fix that would leave a hole naming a removed wall
  is not offered, because every fix is tried first (`fixHolds`).
- **`grid describe`** gives a room with a hole its outline's extent (9.70 × 9.70 m, not a
  rectangle, 75.60 m²) and does not yet say it has a hole.
- **Moving a side of a room with a hole** (`grid_move_room_side`) is refused where a side of the
  hole faces the same way as the outline's ("made of 2 walls"): which one to move is ambiguous.
- **A label moved out of its room** (no spot fits inside) treats the courtyard as part of the
  room when choosing where to move it, so it will not move into the courtyard.
