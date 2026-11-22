# CNT-7: outdoor space, roofed or open

Branch `claude/cnt-7`, cut from main at ba740f1e, with main merged in after CNT-16 landed
(c0a4ba22). Convention C26 (C25 is CNT-16's columns; C27 is SHT-10's and is left alone). Changelog
fragment `changes/CNT-7.md`. Docs: `docs/plan-file.md` "Outdoor space, roofed or open" (new
section), `docs/areas.md` "Outdoor space" (new section) and its measures table, a line in
`docs/rooms-first.md` and in `docs/tool-server.md`'s `grid_areas` row.

## What changed

**Plan format (C26, `types/floorplan.ts`).** A room's `outdoor`: one of `OUTDOOR_KINDS`
(`garden`, `courtyard`, `terrace`, `balcony`, `light-well`, `porch`, `carport`, `other`), or `true`,
read as `other`. A room's `roofed`: true or false. Both optional and never defaulted; version 1.
Unstated, a porch and a carport are roofed and every other kind open (`ROOFED_BY_KIND`,
`outdoorRoofed`).

**The one module (`geometry/outdoor.ts`).** `outdoorKind`, `isOutdoor`, `outdoorRoofed`,
`planHasOutdoor`, `outdoorIds`; `outdoorOnlyWalls(index)`, the walls that bound outdoor space and
no room (no room that is not outdoor lists it, and an outdoor space lists it or holds its middle,
a post at an outline's corner included); and `buildingPlan(plan)`, the plan less those walls,
their openings and the outdoor spaces that listed one. Every function returns nothing new for a
plan with no outdoor space, so such a plan takes exactly the old paths.

**Inside and outside (`exposure.ts`).** An outdoor space beside a face is the outside: a wall
between a room and an outdoor space works out `exterior`, and a wall with outdoor space beside it
and no room (a fence, a parapet) is `exterior` too. The stretches still name the outdoor spaces on
their faces, so routes and the drawing see them. So the IFC's `IsExternal`, the DXF layer, the
gross internal cut and `wall/kind-differs` all follow from the one answer.

**Areas (`areas.ts`).** An outdoor space is in no net figure, no area by use, no flat's area
(`notCounted` reason `outdoor`) and no gross figure. The gross figures are measured on
`buildingPlan`: no fence, parapet or plot line, and an outdoor space left inside the building's
walls (a courtyard, a light well) is taken off the gross external area and dropped from the gross
internal pieces. Each outdoor room carries `outdoor` (`kind`, `roofed`), each floor `outdoor`, and
the plan `outdoor` (`area`, `byKind`, `roofed`, `open`, `rule`, `weighted`), with a note.
`MEASURES.outdoor` is the new measure (its words in the message files, MSG-11); the net and gross
internal rules' "cannot say" now name outdoor space. `outdoorWeights` in `AreaOptions` weights a
kind by a rule the caller states, in no other figure; Grid states none. On a floor,
gross external = net + rooms named outside + walls + unclaimed − off its space still holds, the
outdoor spaces kept inside the walls taken off both sides.

**Checks.** `rules/check.ts`: an outdoor space joins the voids in needing no door and no route, and
stays a place a route passes through (`floorGraph` unchanged). `packages/rules`: `appliedUse` reads
no outdoor space as a room of a use a figure check covers; the escape check takes an outdoor space
beyond a window or door as the open air.

**Storey heights (`elevations.ts`).** `tallestDrawnWall` skips `outdoorOnlyWalls`, so a fence or a
parapet sets no storey height.

**Slabs and roofs (`envelope.ts`).** On a floor with outdoor space the outline is the building's
(`outdoorOutlines`): from `buildingPlan`, with any outdoor space inside the walls cut out. The slab
is that outline on the lowest level and that outline with every outdoor space above it (a balcony
or a roof terrace stands on a slab); the roof is that outline with the roofed outdoor spaces only,
less the floors above, as before. The 3D scene, the GLB, the OBJ, the IFC, the section, the facade
and the take-off all read this one envelope.

**Exports.** IFC: an outdoor space is an `EXTERNAL` space, `Pset_SpaceCommon.IsExternal` true,
`Grid_Space.Outdoor` (its kind) and `Roofed`, and its area there is outdoor area. GLB: the floor
node of an outdoor space carries `extras.gridOutdoor` and `extras.gridRoofed`. OBJ: a comment
`# grid-outdoor <kind> roofed=<bool>` before its floor. Only outdoor rooms get any of these, so the
golden files are byte for byte as before.

**Command and tools.** `grid_areas` marks each outdoor room, prints the outdoor space apart by
kind, roofed and open, with `MEASURES.outdoor`'s words, and its CSV says `outdoor`; the data carries
`outdoor`. The describe card adds "(outdoor space: terrace, in no total)" and leaves outdoor space
out of a floor's area (agent form: `outdoor:<kind>`); the sheet's area table lists an outdoor
space's area apart from the sum; the comparison's net leaves it out. Rooms text: a room line may
end `outdoor <kind>` with `roofed` or `unroofed`, and the read-back writes it, so nothing is lost.

## Done when

1. **The house with its garden drawn as outdoor space totals 76.34 m², not 436.25, and "Back garden
   has no way out" is gone (EL-8).** The lab plan is in the repo: `G/scenarios/s01c-plot-virtual.json`
   (the G series house, 76.34 m² net, in its 15 × 30 m plot with six rooms round it bounded by
   dividing lines). `packages/floorplan/src/geometry/__tests__/outdoor.test.ts`:
   - "totals 76.34 m², not the 436 m² of the garden drawn as rooms": drawn as rooms, 436.34 m² net;
     marked outdoor, 76.34 m² net, 78.96 m² gross internal, 90.00 m² gross external, the same
     figures and uses as `s01a-house-alone.json`, and 360.00 m² of outdoor space listed apart, all
     open, by kind, with its note.
   - "keeps the sums of a floor".
   - "gives the garden no note of its own, and the house walls beside it face outside": no finding
     names a garden room; the four outer walls work out exterior with no `differs`.
   - "says no garden has no way out and no courtyard has no door, fenced in or not": the back
     garden fenced in all round with no gate, drawn as a room, gets `"Back garden" has no door or
     opening to another space`; marked outdoor, nothing; the fence is in no gross area (90.00 m²).
     The infill house's courtyard (`s08a`) gets no note, and its 15.54 m² comes off the net and
     both gross figures.
   - `packages/rules/src/result/__tests__/outdoor.test.ts`: `inspectPlan` on the EL-8 plan gives four
     `wall/kind-differs` lines drawn as rooms and no line at all marked outdoor; the courtyard gets
     no line, and the kind note goes from its stated-exterior west wall.
   - The lab's 436.25 m² is the figure of the Grid the lab ran; today's Grid reads 436.34 m² for the
     same plan (450 m² less the house's 13.66 m² of walls). The test holds 436.34 and the 76.34.
   - "a parapet or a fence round a terrace sets no storey height": a 3.2 m garden wall makes the
     ground floor 3.2 m high drawn as rooms, and leaves it at the house's 2.7 m marked outdoor.
2. **The IFC and the 3D files give a roof only to outdoor spaces marked roofed (EL-18).** Same test
   file, "a roof only over the outdoor spaces marked roofed":
   - `s02a-terrace-porch.json` drawn as rooms: roof 107.55 m² in the envelope and the IFC (house,
     terrace and porch). Marked (terrace open, porch roofed by its kind): 93.60 m² in the envelope,
     the IFC's roof slab (`Qto_SlabBaseQuantities.GrossArea`, read from the file) and the 3D
     scene's roof solid (what the GLB, the OBJ and the app's 3D draw); the slab 90.00 m².
   - `s04a-garage-carport.json`: 130.75 m² drawn; 130.68 m² with the carport roofed by its kind (the
     carport's posts no longer counted); 112.32 m² stated `roofed: false`; a terrace stated roofed
     and a porch stated open: 103.95 m².
   - "keeps the outdoor and roofed marks in the IFC, the OBJ and the GLB": `EXTERNAL` and
     `INTERNAL` spaces, `Outdoor` and `Roofed` properties, the OBJ comments and the GLB extras.

Also: `packages/floorplan/src/rooms/__tests__/outdoor.test.ts` (rooms text writes and reads back
`outdoor terrace` and `outdoor porch unroofed` with no raw floor; an unknown kind is refused with
the words it takes); "the outdoor mark" in the geometry test (`true` read as `other`; a weight
only from a stated rule, the net unchanged).

## Tests whose expected values changed

- `packages/floorplan/src/geometry/__tests__/areas.test.ts`, "is in docs/areas.md in the same words
  as MEASURES": its row filter takes `Outdoor area` too, as MEASURES has a fifth measure.
- No other expected value changed. Every golden file (IFC, DXF, GLB, OBJ, SVG) is byte for byte as
  before, and no room count, known-field list or ownWords count moved (the new measure's words are
  in `en.ts` and `es.ts`).
- `scoreboard/__tests__/scoreboard.test.ts` fails on this branch, as it must when a count moves:
  it expects "Same as the stored figures", and two counts are better (below). It passes once the
  merger stores the counts on main.

## Scoreboard

Turns answered 22 → 23 and checks the plan can feed 22 → 25: the `outdoor-space` capability's
probe (`rooms.0.outdoor` set to `true`, as the lab's agents wrote it) now survives the reading. The
turn that counts is the architect's "a 3D of each from the garden, with a roof"; the checks are
"a window to the open air", "distance to the building opposite; size of a lightwell" and "an escape
window from a bedroom". No other count moved: rooms measured wrong 197, damage silent 277,
mistakes named 5, guards 735 and 95. `current.json` is not edited.

## For the owner

- **A room field, not a use.** An outdoor space is a room with `outdoor` (its kind) and `roofed`.
  `use` feeds the rules package's figure checks and holds one value, and a terrace is not a use the
  way a bedroom is; a room field keeps every use free, keeps outdoor rooms in every drawing, route
  and export path, and needs no new part. Reversible: a field.
- **`outdoor: true` is read**, as `other`: it is what the lab's agents wrote (s02b), and it keeps
  the scoreboard's probe as it was.
- **`roofed`, not `covered`.** The card's word. The lab's `covered` is not read (still named as an
  unknown field).
- **Unstated `roofed`**: a porch and a carport roofed, every other kind open.
- **A door onto outdoor space as a way out**: only when the space leads on to the outside (an open
  edge, or a door or gate in its fence). A terrace closed all round keeps the floor's "no door to
  the outside" (s02d). A balcony door above the ground is never one, as before.
- **Walls that are not the building**: a wall no indoor room lists, that an outdoor space lists or
  holds (posts at its corners included), is in no area and sets no storey height. A free-standing
  wall in no outdoor space still counts, as before.
- **Slabs**: none under outdoor space on the lowest level; a slab under a balcony or roof terrace
  above it. A porch's paving is not modelled.
- **Weighting**: only through the library's `outdoorWeights`; Grid holds no figure for it, and no
  command or tool passes one yet. A rule for part of a balcony would come as a figure record.
- **The 2D look is unchanged**: outdoor spaces are drawn as rooms, with no fill of their own, so
  SHT-10 (drawing looks) owns that choice.
- **`roofed` on an indoor room** is read as nothing, with no note.
- **Drawing checks left as they are**: a porch's or carport's posts still give
  `wall/stands-in-room` and `room/space-mismatch` when the room does not list them.
- **Rooms text**: an outdoor room's walls are written as any room's are; open sides need `open` or
  a virtual wall.
- **MEASURES.outdoor's words** are in the message files, unlike the other measures, so the ownWords
  count of `areas.ts` does not rise.

## Files shared with CNT-16

`packages/floorplan/src/types/floorplan.ts`, `packages/floorplan/src/geometry/areas.ts` (merged:
both features' fields on a room's figure and a floor's), `packages/floorplan/src/geometry/export/ifc.ts`,
`packages/floorplan/src/geometry/export/gltf.ts`, `packages/floorplan/src/geometry/export/obj.ts`,
`packages/floorplan/src/geometry/scene3d.ts`, `packages/floorplan/src/messages/en.ts` and `es.ts`,
`docs/areas.md`, `docs/plan-file.md`. CNT-16 is merged in; the conflicts were in the header (C25
then C26), the message files and the room loop of `areas.ts`.

## Check results

On the branch with main (c0a4ba22, CNT-16) merged in:

| Check | Result |
|---|---|
| `npx vitest run --exclude '.claude/**'` (after `npm run build`) | 374 files: 373 passed, 1 failed; 6,115 tests passed, 3 skipped, 1 failed. The one failure is `scoreboard/__tests__/scoreboard.test.ts`, which expects "Same as the stored figures" and gets "Better than the stored figures" (turns 22 → 23, checks 22 → 25); it passes once the counts are stored on main |
| `npm run typecheck` | passes |
| `npm run lint` | passes |
| `npm run scoreboard` | "Better than the stored figures": turns answered 22 → 23, checks fed 22 → 25, every other count as stored (197, 277, 5, 735, 95). `current.json` not edited |

An earlier full run, before the outdoor measure's words moved into the message files, also failed
`ownWords.test.ts` (`areas.ts`: 40 sentences, 37 allowed); the words are in `en.ts` and `es.ts`
now, and the test passes with the count unchanged.
