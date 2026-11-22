# LVL-4: slabs, roofs, ceilings and the ground from the floor's outline

Card: "Slabs, roofs, ceilings and the ground from the floor's outline". Lab evidence VE-4 (the OBJ
and GLB hold no slab, so a stacked model has 0.25 m of air between its floors; the IFC has a slab
per room, none under walls, no roof over a single-storey part and a closed slab over every stair
and lift shaft), AC-6 (a roof taken as the top floor's outline is 43.99 m² on the odd house, the
true flat roof 83.31 m²), VE-7 (Grid does not know where the ground is), F19, SF3, CP4-7 and CP1-15
(ceilings). Builds on LVL-1 (floor levels and slab thickness), LVL-3 (stairs, stair and lift
rooms, `floorJoins`), LVL-7 (room floor offsets), ARE-6 (room holes), ARE-9 (the gross outline)
and MSG-13 (which walls face outside).

## Before: the findings reproduced

Before any change, on main at 666bb01, with the lab's plans as the scoreboard stores them:

- The odd house (`F/scenarios/odd-house.json`): the ground floor's OBJ held `wall_…` and
  `floor_g-kitchen`, `floor_g-living`, `floor_g-stair` and nothing else; the first floor's the
  same. No slab: stacked at their levels (ground walls to 2.70 m, first floor at 2.95 m) the files
  leave 0.25 m of air (VE-4).
- Its IFC held no `IFCROOF`, and its `ROOF` slabs were "Bathroom roof", "Bedroom 1 roof" and
  "Landing roof": the first floor's rooms only, 43.99 m² of outline, the figure the lab's first
  tool gave (AC-6). ARE-9's gross external area gave 83.31 m² for the ground floor and 43.99 m²
  for the first: the true roof, 83.31 − 43.99 + 43.99 = 83.31 m², reproduced.
- The basement flat (`A/scenarios/basement-flat.json`) with a ground level added: no finding of
  any kind about its windows at −1.15 m (VE-7). The plan had nowhere to say the ground.

The tests that hold these, with the lab's numbers, are in
`packages/floorplan/src/geometry/__tests__/envelope-lab.test.ts` and
`packages/cli/src/quantities/__tests__/envelope.test.ts`; both failed before the change.

## Done when

| Item | Where it is shown |
|---|---|
| Stacked OBJ and GLB models have slabs, with no 0.25 m of air between floors (VE-4) | `envelope-lab.test.ts` "gives each floor of the odd house its slab, so the stacked model has no air between its floors": each floor's OBJ lifted to its floor level, the first floor's `slab_first` runs from 2.70 m (the top of the ground floor's walls) to 2.95 m (its floor); "writes the same slab and roof into the GLB" reads the GLB back (`slab_<floor>` from −0.25 to 0 in each file). `envelope.test.ts` "make every slab and roof a closed solid, as thick as it is" |
| The odd house's single-storey living room has a roof … | `envelope-lab.test.ts` "covers the east half of the living room, which has nothing above it, on every copy of the odd house": on all 14 copies the lab kept (F, N, O, Q, K, AU1, AU2, AU4 and the round-tripped K copy with other floor ids), the ground floor's roof holds the point (7.5, 3) and not (4, 2), which lies under the bathroom |
| … the IFC holds roof objects and openings over stairs and lifts | `envelope-lab.test.ts` "opens the first floor over the stair, and holds roof objects and that opening in the IFC": two `IfcRoof`s, two `ROOF` slabs, one base slab and one floor slab (not one per room), and an `IfcOpeningElement` "Opening over Landing" voiding the first floor's slab. Lift shafts: `envelope.test.ts` "opens each floor over a lift shaft, which stays closed at its foot"; stated stairs "opens the floor a stated stair arrives at over its flights, 2.52 m², and no more" |
| A quantities run gives the roof as 83.31 m², not 43.99 (AC-6) | `packages/cli/src/quantities/__tests__/envelope.test.ts` "gives the roof as 83.31 m², not the top floor's 43.99" (39.32 over the ground floor, 43.99 over the first), and through the tool server "says the roof in all, and that it is assumed" (`grid_takeoff`: "Roof in all: 83.31 m², assumed.") and the CSV |
| A window below a stated ground level is flagged (VE-7) | `envelope-lab.test.ts` "flags the basement flat's windows and door once the site states its ground level": with `site.ground` 0, `b-w-living`, `b-w-bed` and `b-entry` are named, the living room's window "lies wholly below the ground: its top is 0.55 m under the ground level the site states". `ground.test.ts` (core) and `packages/rules/src/result/__tests__/ground.test.ts` (the record's `opening/below-ground` lines and coverage) |

The coordinator's other asks:

| Ask | Where |
|---|---|
| A routine that cuts one outline by another, first | `cutOutline` in `packages/floorplan/src/geometry/polygons.ts` (difference, intersection, union, retried on the join grids, slivers under `areaReported` dropped) and the floor's outline, `floorOutline` in `geometry/outline.ts`, joined exactly as ARE-9's gross external area is (the odd house: 83.31 and 43.99 m² from both) |
| One slab per floor, a roof over every part with nothing above, an opening over each stair and lift, a void, a parapet | `planEnvelope` in `geometry/envelope.ts`; tests in `envelope.test.ts` |
| In the IFC and the 3D files (OBJ, GLB, the viewer's 3D) | `export/ifc.ts` (`writeSlabs`), `export/obj.ts`, `export/gltf.ts` (`shellMesh` in `export/mesh.ts`), `scene3d.ts` (`sceneShell`, `Scene3D.shell`), `packages/viewer/src/canvas3d/Shell3D.tsx` |
| A ceiling per room with its height and lowered zones | room `ceiling` in the schema; `roomCeiling` in `envelope.ts`; IFC `IfcCovering` `CEILING`; `grid_takeoff`'s `ceilingHeight` and `lowered` |
| The site has a ground level; openings below it flagged | `site.ground`; `geometry/ground.ts`; plan check `openings-above-ground`, finding `opening_below_ground`, code `opening/below-ground` |
| Restate the checks that pick the ground floor by "level equals 0" | `groundLevel` in `ground.ts`, used by `checkPlanSanity` (the way out, `door_to_outside_above_ground`) and by the escape check's floor at grade (`packages/rules/src/checks/escape.ts`). Unstated ground: exactly as before |
| Quantity lines for slabs and roofs marked assumed (AC-6) | every slab and roof line of `grid_takeoff` has `state: 'assumed'` and `assumed`, what Grid took that the plan does not state |

## The schema change

Four additions, all optional and never defaulted, so every plan written before reads with no key
added (tested: `envelope.test.ts` "reads every plan written before LVL-4 with no key added") and
the file stays version 1.

| Field | Type | Meaning |
|---|---|---|
| `site` | object, optional | The site. Only `ground` for now |
| `site.ground` | number, optional | The level of the ground outside, in metres from the ground floor's floor level (the datum of a floor's `elevation`) |
| `floors[].parapet` | positive number, optional | Metres the floor's outside walls rise above the roof over it |
| `rooms[].void` | boolean, optional | The room is open to the floor below: no floor of its own |
| `rooms[].ceiling` | object, optional | The room has a ceiling, at its `height` (ARE-10), else its storey's |
| `rooms[].ceiling.lowered` | list, optional | Zones lower than the rest: `points` (three or more), `height` (from the room's floor), `name` optional |

`site` is placed in `packages/cli/src/sheet/coverage.ts` (not shown: its ground level is read by the
checks), the lowered zones' names and point counts in `packages/cli/src/command/planText.ts` and
the text-limits table of `docs/plan-file.md`. MSG-4's field reading takes the new fields from the
schema with no change; `site` is now a part, so a field it does not have is named on it
(`site.area`), not on the plan.

## Decisions

- **The slab is the floor's outline.** One `IfcSlab` per floor over the whole outline, walls and
  all (VE-4: none under walls before), its body extruded from the floor level down by its slab
  thickness. The outline is joined as ARE-9's gross external area is, keeping only the pieces that
  hold enclosed floor, so a garden wall standing apart carries no slab.
- **The roof is the floor's outline less the floors on the next level up**: the lab's own fix for
  AC-6. Every part with nothing directly on it is roofed on that floor's walls, 0.25 m thick
  (`SLAB_THICKNESS`, as `roofOver` already was), flat, with no overhang and no fall. "Above" is
  the next level up only: a part of a floor two levels down under a bridge with air between is
  roofed too.
- **The opening over a stair.** A stated stair (LVL-3) opens the floor it arrives at over its
  flights and landings, footprint and nothing more (2.52 m² on the test house). Stair rooms one over
  the other, with no stated stair between them, open the upper floor over the floor they share:
  the whole upper stair room, since the plan does not say where the flights are. On the odd house
  that is the landing, 10.57 m², the figure the lab said its slab still included. Where a stated
  stair joins rooms, the rooms open nothing of their own. A lift shaft is open over the floor its
  rooms share and closed at its foot.
- **IFC openings are elements.** The slab body is the outline (less sunken rooms), and each
  opening is an `IfcOpeningElement` voiding it through `IfcRelVoidsElement`, as a door voids a wall
  in this file, overshooting both faces by 1 cm (`VOID_CLEARANCE`). The 3D view and the meshes draw
  the slab already cut.
- **IFC roofs.** An `IfcRoof` (`FLAT_ROOF`) per roofed floor, contained in that storey, aggregating
  one `IfcSlab` `ROOF` (not contained apart). A parapet is an `IfcWall` with `ObjectType`
  "Parapet": IFC2x3 has no parapet type.
- **A courtyard is open.** The floor inside a hole of a room (ARE-6) that no room fills is open to
  the sky: no slab and no roof, while the walls round it stand on the slab. A core with rooms in it
  is floor.
- **Room floor offsets (LVL-7).** A sunken room is cut out of the floor slab and has a slab of its
  own, lower down. A raised room stands on the floor slab, with a slab of its own from the storey's
  floor up to its floor (before, from under the storey's slab).
- **Ceilings** are in the IFC only, as `IfcCovering` `CEILING` boards 2 cm thick over the room's
  space (`IfcRelCoversSpaces`), and in `grid_takeoff`. The 3D view does not draw them, so a room
  is not closed from above; a ceiling-plan look comes later, as the card says.
- **The ground floor, restated.** With no ground stated, everything is as before: the ground floor
  is the floor at level 0 (or the only floor), and "above the ground" is a floor's level over 0.
  With `site.ground` stated, a floor stands above the ground by its floor level less the ground,
  and the ground floors are those nearest it (within `sameFloorLevel` of the nearest) among those
  not above it. The escape check's figure for a floor at grade follows the same ground floors.
- **Below the ground.** A door, window or doorless opening in an outside wall (stated exterior, or
  with a room on one side only, MSG-13) whose foot lies more than `openingBelowGround` (0.005 m,
  new) under the ground is named, wholly (its top below) or in part (its sill, threshold or foot
  below). Only once the plan states a ground; every report's limits say so, and with none stated
  the new check skips every door and window with a new skip reason, `no_ground_level` ("the plan
  states no ground level for the site"), so `grid check` lists it as looking at nothing, with why,
  and not among the checks run. The record's contract gains the code, the reason and a changelog
  entry.
- **A void needs no door.** A room marked `void` is no room to stand in: no "has no door" and no
  route. Its floor area still counts in ARE-9's figures (see the owner's list).
- **Corners square to a micrometre.** The wall join leaves each outline corner a hair (1e-9 m) off
  square; the slab, roof and parapet are drawn and exported rounded to `shellGrid` (1e-6 m, a new
  arithmetic entry), and points in line are dropped, so a plan turned off the axes meshes the same.
  Areas are measured before the rounding.
- **The viewer.** Every storey draws its slab (behind the rooms' own floors where they lie on it).
  Its roof and parapet are drawn when the whole building of several floors is shown, as the roof
  over the top floor was before; one floor alone, or a floor cut away, is open from above. The
  per-room roof slabs of the top floor are gone. `grid_view` says which.

## For the owner

Each of these is the reversible choice, taken and recorded rather than stopped on.

- **Whole stair rooms as openings.** Without a stated stair, the upper stair room is open in full,
  so the odd house's landing has no floor in 3D or in the IFC. The other reading, no opening until
  a stair is stated, keeps the landing but seals the stairwell, as VE-4 complained. Stating the
  stair gives the right opening either way.
- **"Above" is the next level up only.** A floor two levels up does not cover a floor whose
  neighbour level leaves it open.
- **A void's area.** A room marked `void` is still counted in net, gross internal and gross external
  area (ARE-9's rules are unchanged); a measuring rule that leaves voids out belongs to ARE-8's
  decision on measures. Its slab is open, and its floor is no slab area.
- **Courtyards.** A hole no room fills is taken as open to the sky. A covered light well drawn the
  same way would wrongly be open; the plan cannot say which (ARE-9's `cannotSay` says the same).
- **The ground floor with a stated ground** is the floor nearest the ground, even a basement when
  the ground is stated at its level (a house entered at the foot of a slope). The owner may prefer
  the floor at level 0 always, with the ground only moving the "above the ground" test.
- **Ceiling height.** A ceiling stands at the room's `height` (ARE-10); there is no separate
  `ceiling.height`, so a suspended ceiling under a taller structure is said with the room's height.
- **The scoreboard's ceiling probe** now asks for LVL-4's field, `rooms.0.ceiling` (see below).
- **Two roofs in `grid_takeoff`, after merging ARE-13.** ARE-13's estimate (`for=estimate`)
  works out its slab and roof lines from its own `planShell`; the plain take-off works out LVL-4's
  from `planEnvelope`, which also opens the slab over stairs, lifts and voids. The merge keeps both
  as they were. Making the estimate read `planEnvelope` is a follow-up: it would move the
  estimate's slab figure by the openings, so it is the owner's call.
- **Lab paths.** No lab path is committed: the tests read the lab's plans by name from
  `scoreboard/data/lab-plans.ndjson.gz` through `packages/floorplan/src/test-support/lab.ts`.

## Not built

- **A roof's type, pitch, overhang and fall** (VE-5): every roof is flat. The scoreboard's `roof`
  capability (a roof the plan states) stays no.
- **A ground level for each wall or side**, for a slope (VE-7's "later"). The buried-wall window on
  a slope (G/s06b) is still not caught: that floor is at ground on the garden side.
- **A ceiling plan, lights and grilles** (CP1-15: not now), and ceilings in the 3D view.
- **A void open to the sky** (a light well): a void marks no floor; its roof stays.
- **A lift shaft object** and **stairs in the DXF**: as LVL-3 left them.
- **The opening's own floor (a landing) inside a stair room**: the whole room is open, see above.
- **No check judges** a slab, a roof, a parapet's height or a ceiling height: those are figures
  from building codes, and no source was read in this step.

## Expected figures, golden files and snapshots changed

IFC golden files, regenerated with `npx vitest run -u` and read by diff: in all four
(`one-floor.ifc`, `three-floors.ifc`, `basement.ifc`, `odd-walls.ifc`) only the entities after
the spaces changed: the per-room `IfcSlab`s and their profiles became one slab per floor over the
outline (new GlobalIds, keyed `floor-slab`), the per-room roof slab became an `IfcRoof` with its
`ROOF` slab and their `IfcRelAggregates`, and the slabs' containment relation lists them. Every
entity before is byte for byte as it was.

Existing tests whose expected values changed, and why:

- `geometry/export/__tests__/ifc.test.ts`, "slabs": a slab per floor named "<floor> slab" over the
  outline (14.96 m² outside, where the room is 12) in place of one per room at its inner faces; the
  roof is "<floor> roof slab" under an `IfcRoof` "<floor> roof"; "writes no slab for a room that
  does not close" became "writes a slab wherever the walls close a floor, whatever the rooms". ARE-6
  courtyard: the void in slab and roof is the floor inside the core's walls, 3.7 m square, not the
  4.3 m square of the hole's outer faces, since the core's walls now stand on the slab. LVL-7
  genkan: its slab rises from the storey's slab (0 to 0.18 m), not from under it; the hall has no
  slab of its own, the storey's one base slab lies under it.
- `geometry/export/__tests__/gltf.test.ts`, `obj.test.ts`, `export/__tests__/planExport.test.ts`,
  `export/__tests__/fileOrder.test.ts`: the node and object lists end in `slab_ground` and
  `roof_ground` (the file-order plan has a floor over all of its ground floor, so no roof), and the
  counts grow by two. `gltf-large.test.ts`: the hand-built scene gains `shell: null`.
- `geometry/__tests__/holes.test.ts`: the OBJ's room floor is read up to the next object, since the
  slab and roof follow it.
- `geometry/__tests__/rules-catalogue.test.ts` "are the six plan checks" (was five): the new rule
  `openings-above-ground`.
- `types/__tests__/reading.test.ts` and `rules/src/result/__tests__/result.test.ts`: `site` is a part
  of the plan now, so the unknown top-level field these tests plant is another one, and the plan's
  field list gains `site`.
- `rules/src/checks/__tests__/rules-lookup-figures.test.ts`: the checks run on a plan with no
  ground stated leave out `openings-above-ground` too (RULES has one more).
- `cli/src/command/__tests__/coverage.test.ts`: the coverage lists `openings-above-ground` after
  `stairs-line-up`.
- `viewer/src/canvas3d/__tests__/Slab3D.test.ts`: `roofGeometry` (a roof per room of the top floor)
  is gone; the roof is the shell's, tested in `Shell3D.test.ts`.

Every report's `LIMITS` gained one line: "Whether a door or window lies below the ground is checked
only when the plan states the site's ground level, and against that one level, not a slope".

New tests: `geometry/__tests__/envelope-lab.test.ts`, `envelope.test.ts`, `ground.test.ts`,
`rules/src/result/__tests__/ground.test.ts`, `cli/src/quantities/__tests__/envelope.test.ts`,
`viewer/src/canvas3d/__tests__/Shell3D.test.ts`.

## The scoreboard

One count moved, and is stored in `scoreboard/current.json` in this commit: **checks the plan can
feed, 11 → 12**. The capability `ceiling-height` ("holds ceiling heights") is now `yes`: its probe
asks for LVL-4's own field, a room's `ceiling` with a lowered zone (`rooms.0.ceiling`), in place of
the lab's `rooms.0.ceilingHeight`, which the schema has never had. That feeds check 5, "lowest
ceiling height": the plan can now say each room's ceiling and the zones lowered under it. "Fed"
means the plan can hold what the check needs, not that Grid runs it: no ceiling height is checked,
and the report's limits still say so.

The other probes this step touches stay no, honestly: `roof` (a roof the plan states, with a type
and a pitch) and `site` (the plot's boundary) are not what LVL-4 built.

Every other count is unchanged: rooms measured wrong 197, damage silent 386, turns 16, mistakes
named 2, rooms not measured 735, sound plans with a warning 95. Nothing here changes a room's area,
a check on a plan with no ground stated, or what a damaged plan says.

## The checks run

Each once, at the end, on a machine shared with other sessions (load average about 250):

| Check | Result |
|---|---|
| `npm run build` | passed (`node build.mjs`, exit 0) |
| `npm run typecheck` | passed, exit 0, no errors in any workspace, `scripts` or `scoreboard` |
| `npm run lint` | passed, exit 0, no problems |
| `npm run check:licenses` | "Checked 363 licences in package-lock.json: none is GPL, LGPL, AGPL, MPL, EPL." |
| `npx vitest run --exclude '.claude/**' --maxWorkers=2 --minWorkers=1` | 241 files passed; 4,687 tests passed, 3 skipped, 0 failed (754 s) |
| `npm run scoreboard` | better than stored: checks the plan can feed 11 → 12, every other count the same; stored with `--write-current` |

An earlier full run, before the last fix, failed three tests: the two "a plan turned off the axes"
mesh tests (rounding to `shellGrid` left joins in line as corners; fixed in its own commit, a point
within `shellGrid` of the line through its neighbours is none) and the scoreboard test (the count
not yet stored). The timing test "answers grid check on the sample flat in under 500 ms" failed
once at 4.2 s in a run of the CLI's tests under a load average near 250; it passed alone, and in
both full runs.

## After merging main at 0b8b641

Merged SHT-4, ARE-13, MSG-3, MSG-16 and WRT-7. Conflicts in the contract's changelog (both
entries kept), `docs/tool-server.md` and `readTools.ts` (both descriptions of `grid_takeoff`
joined), `takeoff.ts` (`roomTakeoff` exported for ARE-13, its ceiling argument optional), the
plan's field list in `result.test.ts` (now `…, stairs, site, …, sketch, display, written`) and
`scoreboard/current.json` (main's 278 silent and 5 mistakes named, LVL-4's 12 checks fed). After
the merge: build, typecheck, lint and licences clean; full suite 250 files, 4815 passed, 4
skipped; scoreboard "Same as the stored figures".
