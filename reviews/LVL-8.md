# LVL-8: facades drawn from the model, with a rhythm that can be said

Card: "Facades drawn from the model, with a rhythm that can be said". Grid draws a facade from the
model: the walls that face a side, the floors stacked at their levels, in elevation line weights
(the ground line heaviest, then the outline, lighter with depth). An opening pattern holds a
facade's rhythm: one opening with a spacing or a count and margins, optionally repeated on the
floors above, expanded into plain openings so the exporters do not change. Builds on CNT-3 and
MSG-13 (which side of a wall is outside), LVL-1 (floor levels), LVL-4 (slabs, roofs, parapets, the
ground) and SHT-1 (looks and paper pens).

## Done when

| Item | Where it is shown |
|---|---|
| A facade for a chosen side draws the walls facing it, with floors stacked at their levels, in elevation line weights | Geometry: `planFacade` (`packages/floorplan/src/geometry/facade.ts`); tests `geometry/__tests__/facade.test.ts` (which walls face each side, the floors at 0 and 2.95 m with slab, roof and wall bands, openings at sill and head, depth and plane of each face, the ground and the silhouette; the walls agree with CNT-3's `planFacing` on three fixtures; the lab's odd house stacked). Drawing: `facadePicture` / `facadeScene` (`packages/viewer/src/picture/facade.ts`); tests `viewer/src/picture/__tests__/facade.test.ts` (the parts, the label, ground > outline > front plane > set back in both looks, the 1:100 pens). Command: `grid draw --facade` (`cli/src/command/__tests__/facade.e2e.test.ts`). Tool: `grid_view kind=facade` (`cli/src/mcp/__tests__/facadeView.test.ts`) |
| An opening pattern expands to the same plain openings a person would place by hand: a plan with a pattern exports byte for byte the same DXF, IFC, GLB and OBJ as the same plan with those openings written out by hand | `geometry/__tests__/patterns.test.ts`, "done when: a pattern exports the same bytes as its openings written out by hand": the hand plan's offsets are written as numbers worked out on paper (1, 7.8, 0.5, 3), not computed; the expansion equals them exactly, and each format's bytes are equal on both floors (DXF, OBJ, GLB per floor; IFC once). A last test checks the IFC holds the six windows, so the comparison compares something |

## What changed

### The plan format: `patterns` (C12)

A new optional top-level list, never defaulted, so every plan written before reads as before and
the file stays version 1 (C12 in `types/floorplan.ts`, `OpeningPatternSchema`; it was C11 until
VEW-3's saved views took that number on main):

```json
{ "id": "north-row", "wall": "gn", "opening": { "type": "window", "width": 1.2, "height": 1.4, "sill": 0.9 },
  "count": 4, "margins": { "start": 1, "end": 1 }, "floors": ["first", "second"] }
```

`opening` is an opening without its id, wall and place (`type`, `width`, `sill` default 0,
`height`, `hinge`, `swing`). A pattern states `count`, `spacing` or both (a refinement, so one with
neither is a part left out). The format's change rule, part by part:

- schema: `OpeningPatternSchema`, `PatternOpeningSchema`, `PATTERN_FLOORS_MAX` (200), C12;
- the reader (MSG-6): `patterns` is a part list in `readParts.ts`, so a pattern that cannot be read
  is left out alone (`plan/part-left-out`, "Opening pattern …") and its id takes part in the id
  clash rules; the unknown-field reader (MSG-4, `reading.ts`) knows the list;
- units (WRT-7): a plan in mm, cm, ft or in has its patterns' lengths read in metres too
  (`LENGTH_FIELDS` gains nested fields);
- text limits (MSG-9): `planText.ts` holds a pattern's id and wall to an id's limit, its floors
  each an id, at most 200, and the list to 50,000; the table in `docs/plan-file.md` says so;
- sheet coverage: `patterns: drawn` (every page draws the openings they expand into);
- rooms text: `grid describe --as rooms` reads the openings the file states, never the ones a
  pattern places, and says in a comment line that the patterns are kept apart; `grid write`
  keeps `patterns` as the file has it (it writes over walls, rooms and openings only). Wall ids
  survive the round trip, so the pattern still finds its wall (tested through the tools).

### Expansion: one function, at load

`expandPatterns(plan)` (`geometry/patterns.ts`) gives the plan with every placed opening after its
own and without `patterns`, the issues, and the ids each pattern placed. `withPatterns` is the
same, plan only. It is called:

- by `loadPlan` (cli) for every command and tool that reads a plan, unless the plan is read whole
  to be written back; `LoadedPlan.stated` keeps the plan as stated for rooms text;
- by `inspectPlan` (rules) for every check but the drawing check, so a window from a pattern counts
  for escape and routes like one placed by hand; the drawing check reads the plan as stated:
- by `validatePlan`, which, given a plan with patterns, gives what kept a pattern's openings from
  being placed and then the checks on the expanded plan (a window from a pattern that runs above
  its wall is named like any other);
- by `exportPlan`, so every format reads plain openings whoever calls it;
- by `planPicture` and `planFacade`, so a picture drawn from a stated plan has the openings too.

`planForFloor` drops `patterns` from a slice: a pattern names a wall on one floor and repeats on
others, so it is expanded on the whole plan, never on a slice.

Placement rules, between the start margin `a` and the wall's length less the end margin `b`, along
the wall's axis from its start (C2): `count` alone spreads the openings evenly, the first's near edge
at `a`, the last's far edge at `b` (one alone in the middle); `spacing`, with or without `count`,
places one every `spacing` centre to centre from `a`, as many as fit, or `count`. On a floor above,
each opening stands where it stands on the pattern's wall (same plan position), on the solid wall
of that floor whose axis lies within the two walls' half thicknesses of both its ends and that holds
its width; its offset is measured from that wall's start, whichever way it runs. Offsets are kept to
the micrometre (`toFixed(6)`), so 3.6 is never 3.5999999999999996. Ids are
`<pattern>-<floor>-<n>`, numbered from the wall's start on the pattern's floor; a copy above keeps
its number.

### New codes (all `left-out`, about a new kind of thing, `pattern`)

| Code | When |
|---|---|
| `pattern/unknown-wall` | its wall is not in the plan (with the nearest id), or two walls share the id |
| `pattern/does-not-fit` | the openings need more room than the margins leave; the spacing is less than the width; the wall has no length; or it would pass 50,000 openings |
| `pattern/unknown-floor` | a floor in `floors` the plan does not have (with the nearest id) |
| `pattern/no-wall-above` | on a floor it repeats on, no wall in line holds some of its openings (which ones) |
| `pattern/overlaps-opening` | one of its openings would overlap another on its wall (by more than `openingOverrun`) |
| `pattern/id-clash` | an id it would give is another part's |

Each is in `packages/rules/src/result/catalogue.ts` with its wording, what is needed and the fix, in
the contract's code table, and in the agents' changelog. `ThingKind`, `EntityKind` and the viewer's
`FaultThingKind` gain `pattern`; `resultVersion` stays 1 (a new kind of thing, as CNT-12's `item`).
The seen marks (MSG-10) hash a pattern's line with its entry in the file and its wall. HND-6's
left-out lists name an opening pattern the reader left out (`OpeningPatterns` in the IFC's
`Grid_LeftOut`, only when there is one).

### The facade geometry (`packages/floorplan`, pure)

`planFacade(plan, side)` works out what is seen from one side, from the core's own answers:

- the outside of each floor is the edge of its outline from `planEnvelope` (LVL-4), the floor its
  walls enclose, walls and all; so the facade's corners are the building's corners and which side is
  outside is the one answer MSG-13 and CNT-3 use. An edge is seen when its outward normal turns
  toward the side by at least `facadeFacing` (new, a sine of 0.0175, about one degree) and it shows
  more than `facadeOnFace` across the view. Corners the wall join leaves a hair off square (a notch
  1e-9 m wide) are straightened first, within `facadeOnFace`;
- each stretch of such an edge shows the solid wall whose outside face lies on it, within
  `facadeOnFace` (new, 0.01 m): from its floor's level (`floorElevations`) to its height, with its
  doors and windows at their sills and heads. A stretch no wall covers that is no longer than the
  thickest wall plus `gap` (a corner, a wall end) belongs to the wall beside it; a longer one is open;
- each floor's slab edge under its walls, each roof's edge over the parts with nothing above, each
  parapet on top (LVL-4);
- under a roof the floor states (LVL-6, merged from main while this was built): each wall's top as
  the roof leaves it (`wallTopProfile`), so a gable end is a pentagon; each plane's edges as bands
  that follow its slope; and each plane that comes down toward the side (by `facadeFacing`) as a
  surface (`roof-plane`). A face is a polygon (`outline`, `[u, z]` points) with its box;
- the ground: `groundLevel` (LVL-4), as stated, else the ground floor's floor level 0;
- each face's depth behind the nearest, and its plane (`tier`: faces within `facadeSameDepth`, new,
  0.05 m, of each other share one; 0 front, 1 the next, 2 any further); faces come farthest first;
- the silhouette above the ground, the union of the faces (`polygon-clipping`, MIT, already in
  `NOTICE`), the floors with their levels, and the walls and openings seen.

`u` runs left to right as a person outside that side sees it (north: against x; south: with x; east:
with y; west: against y).

### The facade picture (`packages/viewer`, draws only)

`facadePicture(plan, { side, look, width, height, paperScale })` returns a `Picture` (with a new
optional `title`, the SVG's accessible name), so `pictureToSvg` writes it with the label (MSG-3) and
`pictureToPng` draws it, as a plan. `facadeScene` draws the faces farthest first, each a path of its
outline filled with
the look's room colour (white in the technical look) and outlined, its openings filled (window
colour for windows), then the paper under the ground, the silhouette, the ground line, each floor's
level mark and name ("First floor +2.95"), and a caption naming the side, and the way it faces when
the plan states north, and that the ground is not stated when it is not.

The look gains seven line parts, read through `lineMetres` like every other: `elevationGround`,
`elevationOutline`, `elevationNear`, `elevationBack`, `elevationFar`, `elevationOpening`,
`elevationLevel`. The working look's are `ELEVATION_PX` (3, 2, 1.25, 0.75, 0.5, 0.75, 0.75 px); the
technical look's pens are cut, medium, fine, finest, finest, finest, finest (at 1:100: 0.5, 0.25,
0.18, 0.13 mm). The far plane is drawn in the look's soft label colour as well, so it reads lighter
than the plane in front even with the same pen. The app's 2D view draws no facade, so
`plan.css` has no rule for them and `look.test.ts` is unchanged.

### The command and the tool

- `grid draw --facade <side>` (north, east, south, west): SVG, or PNG with `--png`; `--out`,
  `--look` (technical by default, as every `grid draw`), `--scale` (PNG). Refused by name: an
  unknown side, `--3d`, `--view` (VEW-3), `--floor`, `--ids`, `--hide`, `--colour`, `--key`, `--units`, `--decimal`;
  given twice, as every option (`options.ts`). Help and usage lines updated.
- `grid_view kind=facade` with `side` (required for it, refused with another kind) and `look`. Its
  `camera` and `view` (VEW-3) are null, and its data adds `facade`: `side`, `compass`, `ground`, `levels`, `walls`, `openings`, `extent`; `ids`
  holds the openings it shows. The output schema gains the optional `facade` object.

### Docs

`docs/plan-file.md` (opening patterns, the codes in the contents list, the text limits),
`docs/commands.md` (`--facade`, a section of its own), `docs/tool-server.md` (the view kind),
`docs/tolerances.md` (three rows), `docs/result-contract.md` (codes, `thing`, agents' changelog at
the top), `CHANGELOG.md` (Unreleased), `AGENTS.md` (one layout line for `patterns.ts` and
`facade.ts`).

## Tests whose expected values changed

- `packages/rules/src/result/__tests__/result.test.ts`, "gives each field and each use one line…":
  the `needed` of an unknown field on the plan lists the plan's fields from the schema, which now
  has `patterns` after `openings`. Expected string updated.
- `packages/rules/src/result/__tests__/result.test.ts` (code shape, and the code literals read from
  the geometry's source) and `packages/rules/src/result/__tests__/contract.test.ts` (codes listed
  in the contract): their patterns of a code's thing gain `pattern`, so the six new codes are held
  to the catalogue and the contract like the others.

No other test, snapshot, golden file or stored figure changed. A plan with no `patterns` reads,
draws, checks and exports exactly as before: every new path starts with "no patterns, nothing to
do".

## For the owner

Each of these is reversible; I took the option that keeps the format and the exports as they are.

1. **Sides: the drawing's four, north = its top.** `north`, `east`, `south`, `west`, as `grid
   describe`, rooms text and the 3D view's `from` name them; not the stated north, which only adds
   the caption "facing west by the plan's north". No diagonals: a building drawn square to the page
   has nothing that faces north-east, and a turned one is seen whole from its nearest side (a face
   turned up to about 89° is drawn, foreshortened). Adding the diagonals is a table entry.
2. **Where the pattern lives: a top-level `patterns` list**, not inside `openings`, so no reader of
   openings changes. The template is nested (`opening`), margins are `{ start, end }` along the
   wall's axis (C2), `floors` lists floor ids. Facts on a pattern's openings (`properties`) are not
   held yet: it would need a `FACT_FIELDS` entry and a sheet decision.
3. **Placement semantics.** `count` alone: first at the start margin, last ending at the end margin,
   equal gaps between (one alone centred). `spacing`: from the start margin, centre to centre, as
   many as fit (or `count`). The other reading of a spacing, a group centred between the margins,
   is a one-line change if a person's habit is that.
4. **Expanded at load, for every reader; kept as patterns by every writer.** Checks, drawings,
   schedules, describe and exports see the openings; `grid write`, `grid tidy` and the edit tools
   read the plan whole and keep `patterns` untouched, and never write a pattern's opening out. The
   cost: an edit tool does not see a pattern's openings (its answer's door list and "would break"
   check leave them out), and an edit that cuts or renames the pattern's wall leaves the pattern
   naming a wall that is gone, which `grid check` then says (`pattern/unknown-wall`). Carrying
   patterns through edits (as facts are) is a follow-up.
5. **Ids `<pattern>-<floor>-<n>`** on every floor, the pattern's own floor included, so the ids do
   not change when `floors` is added. Kept stable for the IFC's identities (QAR-5).
6. **Rooms text holds no `pattern` statement.** `grid write` keeps `patterns` as the file has it;
   `describe --as rooms` says so in a comment line. A `pattern` line in rooms text is a later step.
7. **Line weights.** Ground: cut pen; outline: medium; front plane: fine; set back: finest; further
   back: finest in the soft label colour; openings and level marks: finest. Screen: 3, 2, 1.25,
   0.75, 0.5, 0.75 px. Three new tolerances: `facadeFacing` 0.0175 (sine), `facadeOnFace` 0.01 m,
   `facadeSameDepth` 0.05 m.
8. **What a facade does not show yet**: stairs (inside), garden walls with no room behind them (no
   outline encloses them), the sketch layer, fixtures, rooflights and dormers (LVL-6 draws no
   dormer either), a ground that varies along a slope (LVL-4 has one level per site), dimensions
   and level heights other than the floor marks. Below the ground is covered, not drawn dashed. A
   sloped roof's planes are ordered by their middle's depth, which is right for gable, hip and
   mono-pitch roofs over one rectangle; two roofs crossing could be drawn in the wrong order.
9. **The tool's shape**: `side` is its own argument, not `from`, because `from` takes the eight
   compass points and `above` for the 3D model, and a facade takes four. `look` works as for a plan
   (working by default for an agent; the command's default is technical, as for every `grid draw`).
10. **The sheet does not add facade pages.** `grid sheet` is unchanged; a facade page per side is a
    small follow-up (`pages.ts`), left for a decision on the page count.

## Checks run

(Filled in below after merging main.)
