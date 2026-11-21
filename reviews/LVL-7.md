# LVL-7: a step inside a floor (genkan, sunken wet area, stage)

Card: "A step inside a floor: genkan, sunken wet area, stage". Lab evidence R-4 (the genkan and
the 현관 can only be drawn flat) and S-17 (a 0.6 m stage had to be an 8 × 4 m wall). Builds on
LVL-1's stated floor levels: an offset is measured from the storey's floor level, which LVL-1
made a height in metres.

## Done when

| Item | Where it is shown |
|---|---|
| A genkan set 0.18 m off its storey draws a step line (R-4) | `geometry/__tests__/steps.test.ts` "draws a step line across the opening into the hall"; `viewer/src/picture/__tests__/steps.test.ts` "is a line across the genkan's opening" |
| … and is raised in 3D | `steps.test.ts` "is raised 0.18 m in 3D"; `viewer/src/canvas3d/__tests__/Slab3D.test.ts` "stands a raised room on a solid block" |
| … and in the IFC | `export/__tests__/ifc.test.ts` "LVL-7 a step inside a floor in the IFC file": the space stands at 0.18 m and reaches the ceiling, the slab's top is at 0.18 m |
| A 0.6 m stage is floor at its own level, not a wall (S-17) | `steps.test.ts` "is floor, not a wall" and "stands at its own level in 3D, 0.6 m up"; the IFC test "writes the stage as a space 0.6 m up with its 32 m², and no wall" |
| … and its 32 m² counts as floor | `steps.test.ts` "counts its 32 m² as floor, taken off the ballroom" (stage 32.00, ballroom 387.49, together the hall's 419.49) |

## The schema change

One optional field on a room (`packages/floorplan/src/types/floorplan.ts`):

| Field | Type | Meaning |
|---|---|---|
| `floorOffset` | finite number, optional | Metres from the storey's floor level to the room's floor: positive up, negative down |

Never defaulted, so a plan that states none reads with no key added (tested), and the file stays
version 1. As with LVL-1, when CNT-1 (the version rule) lands the owner should decide whether
this field belongs to a version 2.

## Decisions

- **One mechanism for both entries, as AU7 asked.** The card names two: an offset on a room, and
  a platform with an outline, a top height and a step or ramp edge. A platform is said as a room
  marked `inside` (ARE-5), edged with dividing lines, with its own `floorOffset`. ARE-5 already
  takes an inner room's floor off the room around it and counts it once, so the stage's 32 m² is
  counted as floor with no new area code. No new top-level part, so the sheet's coverage and the
  exports' lists did not change.
- **The name `floorOffset`.** It sits beside the room's `floor` (the storey's id) and reads as
  "offset from its floor". `level` and `elevation` already mean the floor's order and its height
  from the ground (LVL-1); `step` would read as a stair.
- **Where the step line goes.** In a door or doorless opening it is on the lower room's face of
  the wall: the lower room's floor ends at its inner face (C3), and the higher floor runs through
  the gap. Along a dividing line it is the line. A window gets none. Which room is on which side
  comes from `planWallSides`, the one answer every view uses, so the side of a stage's edge that
  faces the ballroom is found by the same probe that gives a pod's walls their host. The steps are
  data on the drawing (`PlanDrawing.steps`, `planSteps`), with the upper and lower room and the
  rise: what a later step-free route check (EL-15) reads. Nothing judges them yet.
- **Two rooms closer than 5 mm in height share a level** (`sameFloorLevel`, a new tolerance).
- **In 3D a raised room's slab is solid down to the storey's floor** (and the slab under it), so
  a stage reads as a platform. A sunken room's slab keeps the usual thickness, lower down. The
  OBJ and glTF floor gets a band of faces round its edge from the storey's floor to the room's,
  facing out of a platform and into a sunken room. The IFC writes the space at the offset, up to
  the storey's ceiling, and the slab with its top at the offset.
- **The scene slab's `offset` is present only when a room states one other than 0**, as the
  drawing does for a door's hinge. So no existing scene, export or snapshot gains a key.
- **A new warning, `room/offset-question`**, for a room set more than 1.5 m off its storey
  (`floorOffsetLargest`, a new limit) or raised to the height its floor states: so far off, it is
  more likely a floor of its own (a half level, a mezzanine). Both figures are Grid's own and cite
  nothing. A loading dock at 1.2 m passes.
- **The diff** lists a changed offset (`floor offset 0.00 → 0.18 m`) and reads unstated as 0.

## Not built

- **A ramp edge.** The card's platform has "a step or ramp edge". Nothing in the done-when needs a
  ramp, and a ramp needs a slope and a direction the plan cannot say yet. Left for EL-15 or a card
  of its own.
- **The DXF.** A step line on a layer of its own would add a layer to every DXF file and change
  every DXF golden file. A stage's edge is already a line in the DXF (its dividing line), and an
  opening already has its line across the gap.
- **`grid describe` and the tool server's edit tools** do not mention or set the offset. An agent
  sets it by writing the plan file. WRT-2 (rooms-first writing) is reworking the writing side in
  parallel; adding it there is a follow-up.
- **Walls standing on a raised room** still rise from the storey's floor.

## Expected figures, golden files and snapshots changed

None. No IFC, DXF, OBJ or glTF golden file, no snapshot and no scoreboard figure changed: every
existing plan states no offset, and every new key is left out when unstated. The changes to
existing test files are additions only:

- `packages/floorplan/src/test-support/plans.ts`: two new shared plans, `genkanFlat` and
  `ballroomWithStage`.
- `packages/floorplan/src/geometry/export/__tests__/ifc.test.ts`: a new `describe` block at the end.
- `packages/viewer/src/canvas3d/__tests__/Slab3D.test.ts`: two new cases.
- `packages/viewer/src/picture/__tests__/look.test.ts`: one line, the step's width against `plan.css`.
- `README.md`: a new section "A step inside a floor", and the two new rows in the tolerance table
  (the tolerance test reads it).
