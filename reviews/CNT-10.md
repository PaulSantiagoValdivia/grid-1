# CNT-10 review: existing, demolished and new, and a fit-out on a fixed shell

For the owner. Every wall, opening and room can now carry a phase: `existing`, `demolished` or
`new`. One plan holds the building before the work and after it, is drawn as a demolition and
new-work drawing is (demolished dashed, new filled, a key), keeps the phase in the DXF and the
IFC, compares by phase, and costs its work as three lists. A fit-out can name its base plan,
whose walls and openings are read in as existing and are read-only.

**EL-10 and CP4-4 have no plan file in the lab.** EL-10 (`MASTER-LIST.md`) and CP4-4
(`MASTER-LIST-WAVE3.md`) are descriptions; AC-3 and AB-16 point at the same need. So
`packages/floorplan/fixtures/refurbishment.json` **stands in for EL-10**, in Grid's own words: a
flat whose kitchen and dining room are knocked into one (wall `wk` and its door demolished, both
rooms demolished, the room they become new), whose living room gets a new partition for a study,
whose bathroom door is widened (`d-bath-old` demolished, `d-bath` new in the same place) and
whose south window is blocked up for a new one further along. 8 walls, 11 openings, 7 rooms:
6/5/1 existing, 1/3/3 demolished, 1/3/3 new. The CP4-4 shell and fit-out are written into the
tests (`cli/src/mcp/__tests__/phases.test.ts`, `floorplan/src/geometry/__tests__/phases.test.ts`).

## What changed

1. **The format** (`types/floorplan.ts`, convention C13). `phase` on walls, openings and rooms
   (`PHASES`, `PhaseSchema`), and `base` on the plan (a path, held to a path's limit by
   `command/planText.ts`). Optional and never defaulted: the file stays version 1, and a plan that
   states neither reads exactly as before (`planInState` returns it as it is). A part that states
   no phase: an opening takes its wall's when that is demolished or new; any other part of a
   plan with phases is existing; a part of a fit-out is new (see "For the owner").
2. **The states** (`geometry/phases.ts`, new, pure). `planHasPhases`, `phaseReading`,
   `partPhases`, `planInState` (before: existing and demolished; after: existing and new),
   `phaseCounts`, `phaseClashes`, `mergeBase` and `phasedJoints`.
3. **Validation** (`validate.ts`). A plan with phases is checked once per state
   (`validatePhases`): after the work in full; before it, only what is about a demolished part.
   So a widened door and a wall rebuilt in place are no overlap or duplicate. An opening or room
   that stands when its wall does not is one error, `opening/phase-wall` or `room/phase-wall`,
   and is left out of both states.
4. **Measuring and checks read the building after the work**: `surveyPlan` and `planFacts`
   (every CLI measure: areas, measure, schedule, take-off, estimate, describe, find, count,
   compare, the brief's lines), `planAreaFigures`, `planShell`, `buildScene`, `planFacade`,
   `roomNumbers`, the door sweeps, `checkLocalRules`, and `inspectPlan` (whose drawing check
   reads both states). They say so: `inspectPlan` adds one `not-checked` line,
   `plan/read-after-work`, with the counts; `grid_areas` a first note; `grid describe` a sentence
   (person) or a `WORK` clause (agent).
5. **The drawing** (SHT-1's looks). `buildFloorPlan` builds the state after the work, each wall,
   opening and room with its `phase`, and puts the demolished walls and openings first, as they
   stood before the work, each state's corners joined among its own walls. `planScene` draws a
   demolished wall as a dashed outline with no fill (`data-part="demolished-wall"`), a demolished
   opening as a dashed outline across its wall over everything that stands
   (`demolished-opening`), and a wall by its phase's fill: each look's new `phases`
   (`PhaseLook`): working, existing in a mid tone `#9b968b`, new as walls are; technical, existing
   in its grey tone, new black. Dashes and widths are new `LinePart`/`DashPart` entries
   (`demolished`: 1.25 px, 6 4 on screen; the medium pen, 2 1 mm on paper). The key lists
   Existing wall, New wall and To be demolished, and a drawing with phases shows its key unless
   it is turned off. Dimensions leave demolished parts out.
6. **The DXF** (HND-1). Five new categories with neutral layers: `walls-existing`
   (`GRID-WALLS-EXISTING`), `walls-new` (`GRID-WALLS-NEW`), `walls-demolished`
   (`GRID-WALLS-DEMOLISHED`, dashed), `wall-fill-new` (`GRID-WALLS-FILL-NEW`) and
   `openings-demolished` (`GRID-OPENINGS-DEMOLISHED`, dashed). In a plan with phases every wall
   goes on its phase's layer; a demolished wall is unfilled; a demolished opening is a closed
   outline, not a block. A plan with no phases writes the file it wrote before (layers are listed
   only when used).
7. **The IFC** (HND-2). Every wall and opening is written, the demolished ones as they stood,
   corners joined per state; spaces are the rooms after the work. Each element gets a
   `Grid_Phase` set with `Phase`, written after the facts, so a plan with no phases writes the
   same bytes.
8. **The comparison by phase** (WRT-8). `grid diff --since phase` and `grid_diff` with
   `since: "phase"` run `compareBuildings` on the plan before its work against after it.
   `phase` is refused as a marker name.
9. **The cost** (ARE-13). `quantities/change.ts`, `planChange`: three lists, each line an
   estimate line with `list`: demolish (`demolish:wall:<kind>:<t>` m² less openings,
   `demolish:<type>:<w>x<h>` nr), make good (`make_good:floor` m², `make_good:wall_end` m,
   `make_good:infill:<kind>:<t>` m², `make_good:reveals` m²) and new (`new:wall:…`,
   `new:<type>:…`, `new:floor:<use>`). `grid_takeoff` takes `for: "change"`; the rates, the rate
   card and the CSV are ARE-13's.
10. **The base plan** (CP4-4). `command/plan.ts`, `readBase`: the path in the plan is resolved by
    `projectFiles.ts` from the project folder, like the trace image (CMD-15), read as a plan, must
    name no base, and is merged with `mergeBase`; an id clash refuses the plan. `LoadedPlan.base`
    carries the base and its read-only ids; `grid check` and the edits' counts pass it to
    `inspectPlan` (`CheckOptions.base`). The every-path test has a new block for it: each of the
    six T-5 paths makes every command and every tool refuse the plan, and a link out is refused.
11. **Edits** (WRT-3, `cli/src/edit/phases.ts`). In a fit-out, `baseTouched` refuses a change
    that would move, cut or take out a base wall or opening, or put an opening in a base wall,
    naming them; nothing is written, and the base's parts never reach the fit-out's file. In a plan
    with phases, `phasedPatch` makes a change the work: added parts are new (pieces of a cut wall
    keep its fields); an existing opening, room or wall taken out stays, demolished; an existing
    opening changed keeps its old self as `<id>-before`, demolished, and becomes new; an existing
    wall or room moved, cut or reshaped is changed in place and named in `couldNotKeep`.
    `grid write` refuses rooms text over a plan with phases or a base without `--replace`
    (`rooms/phases`), and `grid tidy --apply` refuses to change one.
12. **The sheet's coverage.** `base` in `SHEET_COVERAGE`; a new table, `PHASE_COVERAGE`, over
    `PHASE_FIELDS`, with its test.
13. **Docs and records.** `docs/plan-file.md` ("Existing, demolished and new", "A fit-out on a
    base plan", the limits table), `docs/commands.md`, `docs/tool-server.md`, the codes and an
    entry at the top of the agents' changelog in `docs/result-contract.md`, `CHANGELOG.md`,
    `AGENTS.md` (the phases module), and two lines in the plugin skill.

## Done when

1. **EL-10's plan keeps every phase, the comparison by phase shows what is demolished, and the
   drawing shows demolished parts dashed and new parts filled.**
   - Keeps: `floorplan/src/geometry/__tests__/phases.test.ts` "keeps every phase as the file
     states it, with no note and nothing left out"; through an edit, `cli/src/mcp/__tests__/phases.test.ts`
     "widens a door…" (every other part keeps its phase in the file written); the exports,
     `floorplan/src/export/__tests__/phases.test.ts` (each wall on its phase's layer; the IFC's
     `Grid_Phase` counts: walls 6/1/1, doors 2/2/2, windows 3/1/1, spaces 1 existing and 3 new;
     byte-identical whatever the order).
   - The comparison: `cli/src/mcp/__tests__/phases.test.ts` "compares by phase…": `Wall "wk"
     removed`, `Door removed: "d-kitchen"`, `Window removed: "win-south-old"`, `Room removed:
     "Kitchen"`, `Wall "wst" added`, `Room added: "Kitchen and dining"`, and the widened door as
     `Door "d-bath" width 0.70 → 0.90 m`; the bathroom unchanged; a picture.
   - The drawing: `viewer/src/picture/__tests__/phases.test.ts`, in all three looks: `wk` dashed
     and unfilled, the three demolished openings dashed, `wst` filled (`#000000` in the technical
     look), `wx` in its existing tone, the key's three entries; a plan with no phases has none of it.
2. **A widened door is accepted as an old opening and a new one in the same place.**
   `floorplan/src/geometry/__tests__/phases.test.ts` "accepts a widened door…" (no error, no
   `opening/overlap`; the same two openings without phases still overlap), and through an edit,
   `cli/src/mcp/__tests__/phases.test.ts` "widens a door as an old opening, kept to be demolished,
   and a new one in its place" (`d-living-before` demolished 0.8, `d-living` new 1.2, and
   `grid_check` names no overlap).
3. **In a fit-out on a base plan, an edit that touches a base wall is refused or listed (CP4-4).**
   `cli/src/mcp/__tests__/phases.test.ts` "refuses an edit that touches a base wall, and writes
   nothing": moving the office's east side (base wall `s2`) and widening the base's entrance are
   refused, naming the part, the fit-out and the base unchanged on disk; "makes an edit inside the
   shell, and never writes the base's parts into the fit-out".

## Checks

RESULTS

## Changed test expectations

- `packages/rules/src/result/__tests__/result.test.ts`, "names thick on a wall…" and "gives each
  field and each use one line…": the fields a wall knows now end with `phase`, and the plan's
  fields list `base` after `referenceImage`, as the schema orders them.
- `packages/cli/src/sheet/__tests__/coverage.test.ts`: a new case for `PHASE_COVERAGE`.
- `packages/cli/src/command/__tests__/everyPath.e2e.test.ts`: a new block for the base plan's
  path (a new path slot written inside a plan, like the trace image).

No pinned test changed. No scoreboard figure moved.

## For the owner

1. **A part that states no phase.** In a plan that states a phase anywhere, it stands before and
   after the work, as an existing part does, and is drawn as one; in a fit-out it is new, since the
   fit-out is the work. An opening that states none takes its wall's phase when that is demolished
   or new. The alternative is to read an unstated part as new everywhere; it would make a plan
   that only marks what goes call every other wall new work.
2. **The base's reach.** Its walls and openings are read in, as they stand after its own work,
   all as existing; its rooms are not (the fit-out says what its rooms are), its floors fill in
   the ones the fit-out does not list. A base may not name a base of its own. A fit-out part with
   the id of a base part refuses the plan. Reading the base's rooms or stairs too is the
   alternative.
3. **Refused, not listed.** An edit that touches the base is refused. The brief allowed "refused
   or listed"; refusing keeps the base read-only without a second scope check. A plan file that
   states an opening in a base wall by hand is accepted (it is drawn and exported as new); only
   the edits refuse to cut one.
4. **Edits in a plan with phases.** What an edit adds is new; an existing opening, wall or room it
   takes out stays, demolished; an existing opening it changes keeps its old self as
   `<id>-before`, demolished, so the id the person knows is the one after the work. A wall or room
   that stood before and that an edit moves, cuts or reshapes is changed in place and named in
   `couldNotKeep`: splitting the before and after of walls and rooms through every edit is larger
   work, left for later. `grid tidy --apply` refuses a plan with phases, and `grid write` refuses
   one without `--replace`, because rooms text holds no phase.
5. **The IFC carries the phase in Grid's own set**, `Grid_Phase`, not a standard property: the
   file is IFC2x3. Revisit with an IFC4 export. Demolished rooms are not written as spaces.
6. **The DXF moves a phased plan's walls** off `GRID-WALLS-EXTERIOR` and `-INTERIOR` onto the
   phase layers, so an exterior and an interior wall of the same phase share one layer and pen.
   Six layers (phase by inside and outside) is the alternative.
7. **The working look's tone** for existing walls is `#9b968b`; the app's own stylesheet still
   sets a wall's fill, so in the app's 2D view walls keep their usual fill whatever their phase;
   the dashed demolished parts show there, as they are parts of their own. The pictures, sheets
   and `grid draw` show the phases fully.
8. **The make-good rules** are Grid's own: the floor strip under a demolished wall, the face of a
   wall that stays where a demolished one met it (its height, per end), each demolished opening
   in a wall that stays filled in less what a new opening there takes, and the reveals of a new
   opening cut in a wall that stays. Decoration, skirting and plaster to the rooms changed are not
   lines yet.
9. **`phase` is now a reserved word** for `grid diff --since`, like `git`: no marker may take it.
10. **Version 1.** As every step since CNT-1 is not built, the new fields are optional and never
    defaulted, and the file stays version 1.

## Not done or not verified

- The 2D canvas (`packages/viewer/src/canvas2d`) draws the plan it is handed: a host that hands
  it a fit-out without its base draws the fit-out alone. Grid's command and tool server read the
  base in (`loadPlan`); the library's `mergeBase` is there for any other host.
- Validation messages about a demolished part do not say "before the work" themselves; the record
  says which state it reads in its one `plan/read-after-work` line.
