# Commands

Read this to run Grid from a shell: what each command does, its options and exit codes, and the
folder it reads and writes. `grid` and `ongrid` are the same command. To write a plan, start
with [rooms-first.md](rooms-first.md); an agent calls the same work as tools, in
[tool-server.md](tool-server.md).

- [The commands](#the-commands)
- [Options and exit codes](#options-and-exit-codes)
- [Starting a project: `grid init`](#starting-a-project-grid-init)
- [The project folder](#the-project-folder)
- [The report, short or full, and notes seen: `grid check`](#the-report-short-or-full-and-notes-seen-grid-check)
- [Describing a plan: `grid describe`](#describing-a-plan-grid-describe)
- [What a change did: `grid mark` and `grid diff`](#what-a-change-did-grid-mark-and-grid-diff)
- [Walls that do not meet: `grid tidy`](#walls-that-do-not-meet-grid-tidy)
- [What went wrong, on the drawing: `grid draw`](#what-went-wrong-on-the-drawing-grid-draw)
- [What a drawing shows: `--hide`, `--colour` and `--key`](#what-a-drawing-shows---hide---colour-and---key)
- [Stairs, lifts and the floor above on the drawing](#stairs-lifts-and-the-floor-above-on-the-drawing)
- [The 3D model as a picture: `grid draw --3d`](#the-3d-model-as-a-picture-grid-draw---3d), and a saved view: `--view`
- [Sections, and the marks on a plan: `grid draw --section` and `--marks`](#sections-and-the-marks-on-a-plan-grid-draw---section-and---marks)
- [A facade: `grid draw --facade`](#a-facade-grid-draw---facade)
- [A sheet for people: `grid sheet`](#a-sheet-for-people-grid-sheet)
- [Who sits where: `grid occupancy`](#who-sits-where-grid-occupancy)

## The commands

| Command | What it does |
|---|---|
| `grid init [<folder>]` | Starts a project folder: `grid.json`, a starter `plan.json` and `exports/` (see below) |
| `grid write <plan.rooms> [--plan <plan.json>] [--replace] [--json]` | Writes a plan from rooms text, the main way to write one: Grid works out the walls (see [Writing a plan rooms first](rooms-first.md)). With a brief beside the plan, it says each line met or missed ([the brief](brief.md)) |
| `grid check [<plan>] [--floor <id>] [--country <place>] [--full] [--json] [--seen <n> --reason <text> --by <name> \| --unseen <n>]` | Prints the report, short and about this plan unless `--full`. Every report is labelled "General guidance, not your local rules". `--country` names the place for this check, in place of the plan's `site.country`. `--seen` sets a note aside as seen (see below) |
| `grid describe [<plan>] [--length line\|rooms\|walls] [--for person\|agent] [--as rooms]` | Describes the plan in a few lines: its rooms, which rooms each opening joins, and with `--length walls` its walls (see below). `--as rooms` reads it back as rooms text |
| `grid draw [<plan>] [--png \| --3d \| --view <name>] [--facade <side>] [--look <name>] [--hide <parts>] [--colour use] [--key] [--marks <marks>] [--section <x1,y1:x2,y2> [--toward left\|right]] [--out <file>] [--floor <id>] [--scale <n>]` | Draws one floor as SVG, or PNG with `--png`, or the 3D model as PNG with `--3d`, or a saved view with `--view`, or one side of the building in elevation with `--facade north` (`east`, `south`, `west`), or with `--section` a section along a line through every floor; to standard output unless `--out` names a file. In the technical look (black on white, lines in millimetres on paper) unless `--look working` or `dark`. `--hide`, `--colour` and `--key` choose what it shows, `--marks` adds level, elevation and section marks to a plan (see below) |
| `grid export [<plan>] --format dxf\|ifc\|glb\|obj [--floor <id>] [--out <file>]` | Writes an export into `exports/` beside the plan, unless `--out` names a file |
| `grid sheet [<plan>] --layout client\|check [--sheet <sheet.json>] [--out <file.pdf>]` | Writes the plan as an A3 PDF for people: `--layout client`, with the words of `sheet.json`, or `--layout check`, with ids and findings (see below) |
| `grid edit <verb> [<plan>] [options]` | Changes the plan, one sentence of request a command: `opening`, `move-side`, `merge`, `split`, `add-room`, `stretch`, `rename`, `mirror` (`--how left-right`, or `--turn 90` to turn the plan a quarter, counter-clockwise as Grid draws it), `square` (squares a scanned plan and says how far each wall moved), each the tool of that name in [the tool server](tool-server.md) with the same options (`grid edit <verb> --help`), and the same lines of [the brief](brief.md) |
| `grid mark [<name>] [--plan <plan.json>] [--remove]` | Keeps the plan as it is now under a name, `start` unless named, in `plan.markers.json` beside it, for `grid diff` to compare with: no git needed. At most 5 (see below) |
| `grid diff [<plan>] [--since <name>\|git] [--rooms <ids>] [--show all\|summary\|changes\|issues] [--picture <file.png>] [--floor <id>] [--json]` | Says what changed since a marker or the last commit, by what stands where, not by ids: issues first, then the verdict room by room, then each change (see below) |
| `grid occupancy [<plan>]` | Lists who sits where, by room, from the occupancy file beside the plan; no export carries it (see below) |
| `grid serve` | Starts the tool server on standard input and output, with the 30 tools in [the tool server](tool-server.md) |
| `grid mcp` | The same as `grid serve`, under the name agents start it by (`npx -y ongrid mcp`) |

## Options and exit codes

Every command also takes `--project <folder>` (see below). An unknown, repeated or
meaningless option is refused by name. The command exits 0 when it did its work, 1 when the
plan or a path was refused or a file could not be written, and 2 when the command line was
refused. A refusal is one line on standard error. Findings in a report are not a refusal:
`grid check` still exits 0.

## Starting a project: `grid init`

```bash
npx --no grid init demo
cd demo
npx --no grid check
npx --no grid export --format dxf
```

`grid init demo` makes the folder `demo` (the folder above it must exist) and writes:

| Path | What it is |
|---|---|
| `grid.json` | Marks the folder as a Grid project, and holds the project's id |
| `plan.json` | A starter plan: a two-room flat with its room uses and door swings stated, to change. It stores the same project id |
| `exports/` | Where `grid export` writes |
| `.gitignore` | The line `exports/`, added when it isn't there |

With no folder, `grid init` starts the project in the folder it runs in. A folder is a Grid
project when it holds `grid.json`. In a Grid project (the folder Grid runs in, or the one
named with `--project`), `check`, `describe`, `draw`, `export` and `sheet` read `plan.json` when no
plan file is named, and `export` writes into `exports/`. A plan file named on the command line is used
instead. Outside a Grid project a plan file must be named.

`grid init` never replaces a file. It refuses, changing nothing, a folder that already
holds `grid.json` (a second `grid init`) or `plan.json`, or a file named `exports`. Any
other folder is fine, empty or not: `grid init` only adds its own files.

The rules store (`@ongrid/rules/store`) keeps a project's build location and rules sheet on
this computer, outside the project folder, so a copy of the project never carries them. It
names them by the id in `grid.json`.

## The project folder

Grid reads and writes files only inside one folder, the project folder:

- the folder named with `--project <folder>`, or else the folder Grid runs in;
- never the top of a disk (`/`, `C:\`) or the home folder, where "inside" would mean almost
  anywhere. Run Grid in the folder that holds the plan, or name that folder with `--project`.

A relative path on the command line starts from the folder Grid runs in, as in any shell. A
path given to a tool of `grid serve` starts from the project folder, since a host may start
the server anywhere. `grid serve` started at the top of a disk or in the home folder still
runs, and each tool answers that it needs `--project`.

Symbolic links are followed, for the file and every folder above it, and the real path must
be inside the real project folder. Refused, with a message naming the path and the project
folder:

- a path outside the project, by `..`, as an absolute path or through a link;
- web addresses and other schemes (`https:`, `file:`, `data:`, `javascript:` ...);
- network and device paths (`\\server\share`, `\\?\C:\`);
- names Windows keeps for devices, with or without an extension (`CON`, `NUL`, `AUX`, `PRN`,
  `COM1` to `COM9`, `LPT1` to `LPT9`), hidden data streams (`plan.json:stream`), names
  ending in a dot or a space, and control or direction-override characters.

These hold on every system, so a path in a plan means the same wherever the plan goes; `\`
and `/` both separate folders. Grid creates no folder on the way, except `exports/` and the
one folder `grid init` is asked to make.

An export's file name comes from the plan file's name, never from text inside the plan.
Grid sanitises it rather than refusing it, and says so on standard error: a name Windows
keeps for a device gets `plan-` in front (`plan-con.dxf`); a name longer than five words or
40 characters, or one that reads as a claim about the plan or an instruction, becomes
`floor-plan`; one floor of several is named by its place in the plan (`house-floor-2.dxf`).

Every export writes the plan's walls, rooms and openings in id order (`w2` before `w10`), so the
same building gives the same bytes whatever order its file lists them in, and two exports can be
compared line by line. The IFC gives each element an identity made from the plan's `projectId`
with the element's kind, floor and id, so a re-export is recognised as the same model whatever
the plan file is called; keep those ids stable. A plan with no `projectId` falls back to the
plan file's name.

### What an export leaves out (HND-6)

An export holds what the views draw, and leaves out the parts validation says cannot be drawn:
a zero-length wall, the rooms and openings that rest on it, an opening on a wall whose id is
used on several floors. It leaves out the parts the reader left out too (MSG-6): an id used
twice, a value a part cannot do without. Each file says so, and so does the command:

- On standard error, one line: how many parts, of which kinds, the first few by id (or by their
  place in the file, `openings[4]`, when the reader could not read the id), and that
  `grid check` says why.
- In the file, only when something was left out, so the file of a sound plan is as it was:
  - IFC: the property set `Grid_LeftOut` on the building, with `Parts` (how many), `Note` (in
    words), and for each kind a count and its ids (`Openings`, `OpeningIds`, `Rooms`, `RoomIds`,
    `Walls`, `WallIds`, `Fixtures`, `FixtureIds`, `Floors`, `FloorIds`).
  - DXF: the layer `GRID-LEFT-OUT`, with the same note as text under the drawing: a line that
    says how many, then a line or more per kind with the ids.
  - OBJ: the same note as comment lines after the header.
  - GLB: `asset.extras.gridLeftOut`, with `count`, `note` and `parts` (each part as the tool
    server's receipt gives it).
- An id that several parts share is named once, with how many (`"bath" 4 times`).

DXF, OBJ and GLB hold one floor: they name what is left out of that floor, every opening no
floor holds, and every part the reader left out, which Grid cannot place on a floor. The IFC
names what is left out of every floor.

The views validate each floor on its own, so a wall id written on two floors is drawn and
exported on each, while `grid check`, which validates the whole plan, says the id is used twice
(`plan/duplicate-id`). The export names what its file leaves out, not every line `grid check`
gives.

An export that would hold nothing of the plan (no wall, room or fixture that can be drawn, on
the floor asked for) is refused with exit code 1, and no file is written: `Nothing to export:
plan.json has no wall, room or fixture that can be drawn.` It names what is left out, when
anything is.

### What the DXF holds (HND-1)

The DXF is written for a drafter to go on working in: one floor, in metres, in layers an office
can name and pen its own way.

- **Version and units.** AutoCAD 2013's DXF (`AC1027`), whose text is UTF-8, so a room called
  "Baño" or "寝室" is stored as it is written and every reader shows it so. `$INSUNITS` is 6
  (metres) and `$MEASUREMENT` metric; the plan's own axes, 1:1, +Y up. A backslash, a caret and
  `%%` in a name are written so that a CAD program does not read them as codes.
- **Walls** are closed outlines, one per solid piece between openings, with their corners joined
  as the drawing joins them, on `GRID-WALLS-EXTERIOR` or `GRID-WALLS-INTERIOR`. Each wall is
  filled by a solid hatch on `GRID-WALLS-FILL`. A dividing line is one dashed line on
  `GRID-WALLS-VIRTUAL`.
- **Doors, windows and doorless openings are blocks**, one per kind and size, named by width and
  wall thickness in millimetres (`GRID-WINDOW-1200x200`), inserted on `GRID-DOORS`,
  `GRID-WINDOWS` or `GRID-OPENINGS` and turned along their wall, so they can be counted and
  swapped. A block is drawn along +X from its insertion point. A door that states its hinge and
  swing has a block per hand: `-L` opens towards +Y of the block and `-R` towards −Y, each hung at
  the insertion point; a door hung from its other jamb is the same block turned half round. Its
  leaf and swing are on `GRID-DOOR-SWINGS` inside the block. A door that states neither has a
  block of its own with no swing (`GRID-DOOR-900x200`).
- **Dimensions** are dimension entities on `GRID-DIMENSIONS`, in the style `GRID` (ticks, metres
  to two places): the chains outside the plan and the room sizes inside it that the drawing
  shows ([the sizes on a drawing](#the-sizes-on-a-drawing)).
- **Room tags.** Each room gets the block `GRID-ROOM-TAG` on `GRID-ROOM-TAGS`, with the attributes
  `NUMBER` (the number the room states, else Grid's count, as in the schedule), `NAME` and `AREA`
  (the net area, `12.40 m²`).
- **A sheet.** Besides the model, the layout `Sheet` is an A3 sheet across, in millimetres, with
  a border, one viewport (on `GRID-VIEWPORT`, which does not plot) showing the plan at the
  profile's scale, 1:100 unless it says otherwise, and the scale and the label under it. Text
  and dimensions are sized for that scale: names 2.5 mm, other text 2 mm on paper.
- **Also on their own layers**, as before: the fixtures (`GRID-FIXTURES`), the sketch
  (`GRID-SKETCH-` and the category), the notes (`GRID-NOTES`), the facts (`GRID-FACTS`), what the
  file leaves out (`GRID-LEFT-OUT`, under the dimensions) and the label, "General guidance, not
  your local rules", above the dimensions (`GRID-LABELS`). A layer is listed only when something
  is drawn on it. Stairs, lifts, steps and the floor above are not in the DXF yet.

#### An office's own layers and pens: `dxf-layers.json`

With no profile the DXF uses Grid's own: the `GRID-` layers above, every line in the drawing's
foreground colour (7, the fill in 8), line weights from 0.13 mm to 0.5 mm, and the scale 1:100.
An office that wants its own writes them once in `dxf-layers.json` in the project folder, beside
`grid.json`; `grid export` and `grid_export` read it for every DXF and say so (`Layers and pens
from dxf-layers.json.`). A category the file leaves out keeps Grid's pen:

```json
{
  "scale": 50,
  "layers": {
    "walls-outside": { "layer": "WALLS-OUT", "colour": 7, "lineweight": 0.5 },
    "doors": { "layer": "DOORS", "colour": 3, "lineweight": 0.25, "linetype": "continuous" },
    "dividing-lines": { "linetype": "dash-dot" }
  }
}
```

- `scale`: a whole number from 1 to 1000; 50 is 1:50. It sets the sheet's viewport and every text
  and dimension size, and the length of the dashes.
- The categories: `walls-outside`, `walls-inside`, `dividing-lines`, `wall-fill`, `rooms`,
  `room-tags`, `doors`, `door-swings`, `windows`, `openings`, `fixtures`, `dimensions`, `notes`,
  `sketch` (a prefix: each category goes on it, a dash and its name), `facts`, `left-out`,
  `label`, `sheet` and `viewport`.
- Each takes `layer` (1 to 255 characters, none of `< > / \ " : ; ? * | = ,` or a backtick),
  `colour` (a drawing colour number, 1 to 255), `lineweight` (in millimetres, one of those the
  format holds: 0, 0.05, 0.09, 0.13, 0.15, 0.18, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.53, 0.6, 0.7,
  0.8, 0.9, 1, 1.06, 1.2, 1.4, 1.58, 2 or 2.11) and `linetype` (`continuous`, `dashed`, `dotted`
  or `dash-dot`).
- Two categories may share a layer only with the same pen.

A profile that is there and wrong refuses the export with exit code 1, naming every part that is
wrong and never repeating what it holds, and no file is written: `dxf-layers.json in the project
folder is not a profile Grid can use: layers.doors.colour must be a whole number from 1 to 255
…`. It is read as every file is, inside the project: one reached through a link out of it is
refused.

### What the IFC holds (HND-2)

The IFC is written so that a BIM program can schedule and take off from it. Everything in it is
something the plan already says, put in the field IFC has for it; where the plan says nothing,
the file says that too.

- **Rooms.** Each room is a space whose name is its number and whose long name is the room's
  name. Numbers are the room schedule's (`grid_schedule`): the number a room states in the plan
  (`number`, CNT-9), else Grid's count: floors by level, then by id, on each floor the rooms that
  state a number first, by it, then the others by id, 1, 2, 3… across the floors. The use, when
  the plan states one, is the space's object type and `Category` in `Pset_SpaceCommon`, whose
  `Reference` is the number. Grid's own set
  `Grid_Space` holds `Id`, `Number` (text when the room states it, else Grid's count), `Use`
  (`not said` when the plan states none), `Area`, and
  `AreaMeasure` and `AreaRule`, which name the measure and its rule: the net area as
  `grid_areas` measures it.
- **Base quantities**, as `Qto_…BaseQuantities` sets:
  - spaces: height, perimeter, footprint (`GrossFloorArea`), net area (`NetFloorArea`), volume;
  - walls: length on the axis, thickness, height, footprint with corners joined, side area and
    volume, gross and less every opening in the wall;
  - slabs, roof slabs and stair landings: thickness, perimeter, area and volume, and for a slab
    a stair, lift shaft or void opens, its net area and volume too (IFC2x3 has no roof set: the
    roof's slab carries it);
  - doors and windows: width, height and area of the hole in the wall; a doorless opening the
    same, with its depth; an opening in a slab its depth and area;
  - ceilings (`Qto_CoveringBaseQuantities`): their area; parapets: height, footprint and volume.
  - under a roof the floor states (LVL-6), each is measured as written, cut to the roof: a wall's
    and a space's height is its highest point, and their side area and volume are under the
    slope; a sloped roof slab's area is on the slope, its thickness measured upright, and with
    rooflights its net area and volume are the roof less them.
- **Slabs.** They are the ones the 3D view draws ([Slabs, roofs, ceilings and the
  ground](plan-file.md#slabs-roofs-ceilings-and-the-ground)): one per floor over its outline, a
  piece of its own under a room set above or below its storey, and a flat roof over every part
  with nothing above. The plan states no slab or roof outline, so each is Grid's and says so in
  `Grid_Slab`: `Assumed`, `ThicknessStated` (whether the floor states its slab's thickness) and
  a `Note` on what Grid took. A roof the floor states is still laid out by Grid (its outline, its eaves on the
  outside walls' lines, its thickness), so it is `Assumed` too, and its `Note` says which parts
  are the plan's.
- **Walls** are typed by the kind the plan states and their thickness (`Exterior wall 0.3 m`),
  the same grouping the estimate prices (`wall:exterior:0.3` is the type's tag). Each type
  carries a one-layer material set, with one material per kind; its walls carry the set's
  usage. The plan holds no build-up, and the type's description says so.
- **Doors and windows** are typed by size, and doors by handing too (`Door 0.9 x 2.1 m, single
  swing, left`), tagged as the estimate keys them (`door:0.9x2.1`). A door whose swing the plan
  does not state is typed by its size alone.
- **Flats** are not written as zones: the plan format holds no flats yet.
- **Where it stands.** A plan that reaches more than 500 m from the origin (`farFromOrigin`) is
  moved, in whole steps of that distance, to near the origin, and the move is the site's
  placement: everything keeps its place, and its own coordinates stay small. A plan that states
  its `site` keeps the site's origin on that point (CNT-3), and the building's placement holds
  the rest of the move. There is always at least one storey.

## The report, short or full, and notes seen: `grid check`

`grid check` prints a short report about this plan (MSG-10): the label, each line to look at
with what was found, what was needed and the fix, the figures those lines used (each as the
figure used here, with its document, edition, clause and status), what each check looked at in
counts, with the parts it could not look at and why, and one line on what `--full` adds.
`--full` prints the whole report: the checks run, every figure, each part each check looked at
or skipped, and what these checks never look at. `--json` always gives the whole check.

The line after the label says the place the figures were for and where it came from (COD-3).
The plan states its place in `site.country` ([the place](plan-file.md#the-place)); `--country`
names another for this check: a country's name or its two- or three-letter code, such as `US`,
`USA`, `United States` or `Spain`, in any case. A place not on Grid's list is refused with exit
code 2, naming `--country` and never the text. With no place stated, no figure is applied, and
the line says how many lines the US figures would have given: `--country US` checks against
them for one run.

```text
General guidance, not your local rules
No place is stated, so no figure was applied: the US figures would have given no lines. State it in the plan as site.country, or give --country.
```

A note you have looked at can be set aside as seen, with why and who:

```bash
grid check --seen 3 --reason "A box room, kept small on purpose" --by "Owner"
grid check --unseen 3
```

The number is the note's in the report of the whole plan (with `--country`, give the same
country). The mark is written to the marks file beside the plan, `plan.seen.json` beside
`plan.json`, and the report follows. A seen note is still listed, under "Seen", with its reason,
who marked it and the day, and the count says how many are seen. When one of the parts it is
about changes (the room or its walls, the door or its wall, the floor, or the plan for a note
about the plan), the note is listed as new again, saying it was seen before and what changed.
`--reason` and `--by` go with `--seen` only. Who marked it is the name or role you give: it is
kept only in the marks file, which no export, sheet or drawing reads.

## Describing a plan: `grid describe`

`grid describe` is a short account of the plan, for an agent to check its own work without
reading the file: a front door that opens into a bedroom, or a bathroom reached only through
the study, shows on the first read. It answers in three lengths:

| `--length` | What it holds |
|---|---|
| `line` | One line: floors, rooms, bedrooms and bathrooms (by the `use` a room states, never its name), the area inside, and which rooms the doors from outside lead into |
| `rooms` (the default) | The line, then each room's inside size, position and the rooms next to it, and every opening in it with the room on its other side and its distance to the two inside corners of that side |
| `walls` | The rooms, then every wall with its openings, each with the rooms on its two sides |

`--for person` (the default) names rooms and floors by their names and never prints an id.
`--for agent` is terse and carries every id, the offsets along each wall and a key line, so an
agent can edit the plan from it. A floor laid out like an earlier one is said once. Wall and
sill heights are one line: the usual height and the exceptions. What the plan cannot say,
such as where north is, the kind of building when the plan does not say it, how floors connect
when no stair joins them and which rooms make each flat, is said as such; a kind the plan states
is said after the first line. The stairs that join the floors are one line, with the risers and
going Grid worked out. Directions are on the drawing, with north at the top. A plan that states
its real north or its front gets a few more lines: that north, which way each side of the drawing
really faces, and which rooms face each way
([plan-file.md](plan-file.md#north-front-and-where-the-building-is)). A plan whose site states
the plot gets a line on it: its area, how much of it the building covers, and the edge of the
boundary the building comes nearest, with the set-back asked for it
([plan-file.md](plan-file.md#the-plot-its-boundary-set-backs-and-what-is-on-it)). The card checks nothing and
says so; its first line is the label "General guidance, not your local rules", as for every
report (MSG-3). `--as rooms` starts with the label as a comment, which `grid write` ignores, and
`grid draw` puts it in the drawing's top-left corner.

## What a change did: `grid mark` and `grid diff`

`grid mark` keeps the plan as it is now, under a name (`start` unless you name another), in a
file of its own beside the plan: `plan.markers.json` beside `plan.json`. The plan knows nothing
of it, and no export, sheet or drawing reads it. A plan keeps at most 5 markers; marking a name
again replaces it, and `--remove` takes one off. `git` is not a marker's name: it means the
version last committed.

`grid diff` compares the plan with an earlier version of itself: the marker `--since` names, or
with `--since git` the version last committed in the project's own git folder. With neither, it
compares with the marker `start` when the plan has one, else with the last commit. Grid reads
git's own files, through the same project folder rules as every other file, and runs no
program: a `.git` folder in the project folder itself, a SHA-1 repository, the branch `HEAD`
names. A repository whose `.git` is above the project folder is outside it, and is not read.

The two versions are compared by what stands where in the building, not by ids. The earlier
plan is laid on the later one, moved to its origin when that lines up more walls; each wall is
paired with the wall standing in its place, either way round, its ends within `diffPlace`
(5 cm) of each other ([tolerances](tolerances.md)), each opening with the opening at its place and
each room with the room on the same walls or the same floor; what is left is paired by id. A
point that slipped by less than a centimetre has not moved. A room's walls are compared as a
ring: the same walls from another wall, or the other way round, are the same room. A plan
written rooms first in both versions is compared by its rooms and openings, whose names you
chose: a room that kept its size and moved is said to have moved, and an opening that kept its
place along its wall in one of its rooms is said to have stayed where it was.

Before anything is paired, the later plan is tried as the earlier one mirrored left to right or
top to bottom, turned a quarter either way or half round, or mirrored across a diagonal. When
one of these stands more walls in their place than the plain way, and at least half of them, the
plan is that turn of the earlier one: the line after "Compared with" says so, with whether every
room kept its size, and everything else is compared from there. After `grid edit mirror --how
left-right` it reads `The plan is mirrored left to right (east and west swap), and every room
keeps its size.`, and a flat whose y was entered running down the page reads as the flat mirrored
top to bottom. A plan that is the same whichever way it is turned, a square room, is not called
turned.

The answer, in this order:

- **Issues**: a door that now joins other rooms, a wall added or moved that now meets another
  wall inside an opening, a room that no longer closes, and the notes of `grid check` that came
  and went.
- **Verdict**: room by room, how many ids were only renamed, and with `--rooms` how many changes
  are outside the rooms named. The same building under new ids reads `Same building, 28 ids
  renamed (9 walls, 13 openings, 6 rooms): every room, wall and opening stands where it stood.`
- **Rooms** that changed, moved, came or went, with their old and new net area.
- **Changes**, one line each; walls changed the same way are one line
  (`9 walls height 2.60 → 2.70 m: …`). Then the openings that kept their place though their
  wall changed or their room moved.

`--show summary` stops after the rooms, `--show issues` gives the issues alone, and `--json` the
same as data. `--picture d.png` writes the comparison as a picture of one floor (the first with
a change, or `--floor`): what was removed in red, what was added in green, the rooms that
changed in amber with their old and new area, and the rest pale. When nothing changed it draws
nothing and says so.

## Walls that do not meet: `grid tidy`

`grid tidy [plan.json]` lists the faults where walls meet (a wall short of its corner, a gap in a
straight side, a wall running past its last corner, a copy lying on its original, a dividing
line on a solid wall, a wall listed twice, a wall across a room that does not list it, walls
standing inside a room), each with the fix Grid offers or why it offers none. A fix is offered
only after it was tried and left every room it touches with an outline. `grid tidy --apply
<id>,<id>` makes the fixes named, and `--apply all` every one offered; the faults are looked for
again before each fix, and one an earlier fix took care of is skipped and said so. The plan file
is changed as read, keys Grid does not know included; `--out <file.json>` writes the tidied plan
there instead. `--json` prints the list or what was applied as JSON.

## Units on the drawing: `grid draw --units`

`grid draw --units m|cm|mm|ft-in` writes the drawing's room areas and dimensions in those
units, and `--decimal point|comma` with that decimal mark: `--units ft-in` draws `12'-6"`,
`--units mm` draws `2860`. Left out, the plan's own `display` is used, or metres. A length typed
on `grid edit` may carry its unit (`--by "12'6\""`, `--width "900 mm"`) and, with
`--decimal comma`, a decimal comma (`--by 0,3`). The plan file stays in metres either way; see
[Units](plan-file.md#units).

## Grid's words in your language: `--lang`

`grid check`, `grid describe`, `grid draw` and `grid sheet` take `--lang en|es`: the language
Grid writes its own words in, the label first. Left out, the plan's own `display.language`, or
English. Spanish writes figures with a decimal comma unless the plan's `display.decimal` says
`point`. Room names stay as the plan writes them, and the codes in brackets stay as they are. The
Spanish words are a draft translation, not reviewed yet; see [Languages](languages.md). A
language Grid does not write is refused by name. `grid draw --section` and `--facade` take it too:
the section's title, level names, list of what Grid took and the line on standard error follow it,
and the level marks keep their decimal point.

## What a drawing shows: `--hide`, `--colour` and `--key`

A floor plan picture shows the plan's title and key in a band under the drawing, its notes, tags
and symbols, its sketch, the sizes, the room areas, the door swings and the warnings (the
plan file's writing is in [plan-file.md](plan-file.md#writing-on-the-drawing-and-the-sketch-layer)).
`--hide` leaves parts off, named and joined by commas: `title`, `key`, `notes`, `sketch`,
`dimensions`, `areas`, `swings`, `warnings`, `above`. `--colour use` fills each room by its use and lists
the uses in the key. `--key` adds a key where the plan asks for none. A word Grid does not know
is refused by name, and none of the three is taken with `--3d`. `grid_view` takes the same as
`hide`, `colour` and `key`.

## The sizes on a drawing

A floor plan picture's sizes run along the walls, in the plan's own two main directions (the
way most of its outside walls run), so a house drawn turned is dimensioned along its walls, not
by the box it makes on the page.

- Inside each room: a room with four square corners gets its width and depth, between its
  walls' faces. Any other room (an L, a room with a bay, a skewed one) gets one size per side,
  a little in from that side, and every line stays inside its room.
- Outside the plan, on each side that has them, three chains, nearest first: the openings
  (from the corner to each edge of a door or window in the walls facing that side), the walls
  (each wall's faces where it meets that side, and the corners) and the overall size. Each
  chain runs between the same two outer faces, so it adds up to the overall size. The overall
  width is always below the plan and the overall depth to its left; above and to the right
  there is one only where a chain is.
- Every size measures to a wall's face, or to the line of a dividing line, which has no
  faces. A plan records no finishes, so none measures to a finish yet. In an SVG each
  dimension's `data-measured-to` says it, for its two ends: `face`, `centre-line` or `finish`.

In the technical look each dimension line ends in a 45-degree tick and its number runs along
it; the working look keeps plain ends and upright numbers. `--hide dimensions` leaves them all
off.

## Stairs, lifts and the floor above on the drawing

A floor plan is drawn as an architect expects it (SHT-11), from shapes the core works out and the
look only strokes:

- **A stair the plan states** is drawn on both floors it joins, with a line at every riser and
  its walking line ending in an arrow head pointing up. On the floor it rises from, the plan is
  cut 1.2 m above the floor (`planCutHeight` in [tolerances.md](tolerances.md)): the stair is
  solid up to the break line across the flight there, and dashed above it. On the floor it
  arrives on, it lies wholly below the cut and is drawn solid. A stair drawn only as a room used
  as a stair has no stair object, so it gets no treads: state it in `stairs`
  ([plan-file.md](plan-file.md#stairs-that-join-two-floors)).
- **A lift shaft**, a room used as a `lift`, gets a cross in it, corner to corner, on every floor.
- **The floor above** shows as a dashed outline: the outline of the floors at the next level up,
  the one whose area is the gross external area, less the stretches that lie on this floor's own
  outline. What is left is an overhang past the walls, a loft or a floor that steps back inside
  them. A stretch over an inner wall is hidden by the wall. `--hide above` leaves it off. The
  plan cannot say where a floor has a void, so a void inside the walls above is not told apart.

The working look draws all three in thin lines, dashed 4 on 3 pixels; the technical look with its
finest pen (the floor above with the fine pen), dashed 1.5 on 1 mm on paper. The key, where the
picture has one, names the floor above. The app's 2D view and `grid draw` draw the same shapes.
The DXF does not draw them yet.

## What went wrong, on the drawing: `grid draw`

`grid draw` and `grid_view` show what went wrong on the drawing. Every line `grid check` prints
for the floor drawn has its number from that list in a small mark on the room, door, window,
wall or fixture it is about, with its words beside it; a line about the whole floor has its mark
in the top-left corner. The same lines are listed by number under the drawing. A room that
cannot be drawn is not left blank: it is the dashed box round its walls, with its name and the
reason. `docs/result-contract.md` says how the numbers are given.

## The 3D model as a picture: `grid draw --3d`

`grid draw --3d` takes the 3D model as the app opens it: the same scene, from the same camera
(south-east, about 29.5 degrees down, through a 45 degree lens). It needs no browser and no
graphics card: the scene is drawn in software, each face lit flat, without shadows. With
`--floor`, that floor is shown as a cutaway, as in the app; without it, the whole building.
The PNG is 1200 by 800 pixels, times `--scale` (up to 4).

`grid draw --view <name>` draws a view saved with the plan (VEW-3, `grid_save_view`): the 3D
model through that view's camera, with the floor it was saved with cut away, the same picture
`grid_view view=<name>` gives an agent. The name is matched whatever its capitals; a name the
plan has no view for is refused with the views it has. Not with `--floor`. The views and their
camera record are in [the plan file](plan-file.md#saved-views-and-the-camera-record).

## Sections, and the marks on a plan: `grid draw --section` and `--marks`

`grid draw --section x1,y1:x2,y2` draws a section instead of a floor plan: a cut along the line
from the first point of the plan to the second, in metres, through every floor, looking to the
left of the line as you walk from the first point to the second, or to the right with
`--toward right`. A person standing on the line and looking that way sees the section's left on
the picture's left.

```bash
grid draw plan.json --section 4.9,-2:4.9,13 --png --out section.png
```

Everything on it is the model's own, as the 3D view, the IFC and the take-off read it (LVL-9):

- **What the line cuts** is drawn solid in the walls' tone, under the heavy outline the plan's cut
  walls have: the walls, with the sill and lintel round each door and window, the slab of each
  floor (open over a stair, a lift shaft or a void), the roof and any parapet, the treads and
  landings of a stair the plan states, and the floor of a raised room. Parts that touch are one
  shape, not a rectangle each.
- **What lies beyond the cut** is drawn in a lighter line, the one a facade draws its faces set
  back in: the faces of walls, slab and roof edges and stairs that face you, with their doors and
  windows open, each hiding what is behind it.
- **The ground** is a facade's ground line, the heaviest pen, outside the building, running 1 m
  past it on each side (`sectionGroundRun` in [tolerances.md](tolerances.md)), at the site's
  ground level, or at the ground floor's level when the site states none.
- **The levels** stand beside the drawing, in a facade's level-mark line: each floor's on the
  left, each roof's and the ground's on the right, in metres from the ground floor's floor level,
  as `±0.000`, `+2.950`.
- **Each room cut** carries its name and its height, floor to ceiling: its own `height` when it
  states one, else up to the slab or roof over its storey.
- **What the plan does not state and Grid takes** is listed under the drawing, and hatched where
  it is cut: a slab whose thickness the floor does not state, every roof (flat, as LVL-4 takes
  it), a wall whose height nothing states or that the plan marks assumed. A level worked out from
  the floors below, a ground level the site does not state, a room height taken from the storey,
  a stair room with no stated stair and a stair's worked-out risers are listed, not hatched.
  `grid draw` says on standard error how many it hatched and listed.
- **A roof the floor states** (`floors[].roof`, LVL-6) stands at its eaves. A section does not
  draw a sloped roof's slope yet, nor cut the walls under it to the roof: it draws the roof flat
  at its eaves, hatched, and says so in the list.

A section cuts every floor and writes its levels in metres, so `--floor`, `--hide`, `--colour`,
`--key`, `--ids`, `--units` and `--decimal` are refused with it, by name; so are `--3d`,
`--view` and `--facade`, and `--marks` with any of them.

`--marks` adds the marks for the plan's other drawings to a floor plan, joined by commas:

- `levels`: each room's floor level under its name, worked out as for the section;
- `elevations`: a mark outside each of the plan's four main sides, 1.2 m beyond the drawing and
  its dimensions (`elevationMarkOffset`), its arrow at the side it shows, named by the way that
  side faces: by the north the plan states, else with north at the top of the drawing. Each is
  the side `grid draw --facade` draws from the drawing's side nearest it, north at its top;
- `section`: the line of `--section` as a chain line, heavy at its ends, with an arrow at each end
  looking the way the section looks, named A. With `section` in `--marks`, `--section` marks the
  plan instead of drawing the section.

```bash
grid draw plan.json --floor first --marks levels,elevations,section --section 4.9,-2:4.9,13
```

A plan drawn without `--marks` is drawn as before.

## A facade: `grid draw --facade`

`grid draw --facade <side>` draws one side of the building in elevation (LVL-8): what a person
standing outside that side sees, looking straight at it, every floor stacked at its level. The
sides are the drawing's, as `grid describe` names them: `north` is the top of the drawing,
whatever north the plan states; the caption says which way that side faces on the earth when the
plan states its north.

It draws each wall's outside face from its floor's level to its height, with its doors and
windows at their sills and heads, the edge of the slab each floor stands on, the edge of each
roof over the parts with nothing above and its parapet, and the ground: at the level the
site states (`site.ground`), else at the ground floor's floor level, and nothing below it. Each
floor is marked at its level on the right. A plan's opening patterns are drawn as the openings
they place ([opening patterns](plan-file.md#opening-patterns)).

The lines are the look's own, as a plan's are: in the technical look, the default, millimetres on
paper from the pen set for the picture's scale; in the working look, pixels. The ground line is
the heaviest, the outline of the building against the sky the next, then the edges of the faces
on the front plane, and lighter again the faces set back from it (by more than `facadeSameDepth`,
[tolerances.md](tolerances.md)); doors, windows and the floor marks are the finest. A nearer face
hides what stands behind it.

It takes `--png`, `--out`, `--look` and `--scale` (PNG only), as a plan does, and the label in its
corner. It refuses `--3d`, `--view`, `--section` and `--floor` (a facade shows every floor) and
what belongs to a floor plan (`--ids`, `--hide`, `--colour`, `--key`, `--units`, `--decimal`,
`--marks`), by name. Stairs
stand inside and are not seen; a garden wall with no room behind it is not drawn. Under a roof a
floor states (LVL-6), each wall is drawn to the top the roof leaves it, so a gable end is a
gable, the roof's edges follow its slope, and each plane of it that comes down toward the side is
drawn as a surface.

## A sheet for people: `grid sheet`

`grid sheet [plan.json] --layout client|check` writes the plan as an A3 landscape PDF into
`exports/` beside the plan (`<name>-client.pdf` or `<name>-check.pdf`), or to the `.pdf` that
`--out` names.

- `client` is a presentation for the person the house is for: a cover with the name, a headline,
  a few paragraphs, the 3D picture and four figures (gross area, floors, bedrooms, floor-to-floor
  height), then a page per floor with its drawing, its room areas and its own paragraphs.
- `check` is a working set for the person checking the plan: a summary in plain words with the
  number of findings and the three areas, then a page per floor with every room, door and window
  id on the drawing, the area of each room with its use, and every finding on that floor.

The words of a client sheet are the author's, in `sheet.json` beside the plan, or the file
`--sheet` names:

```json
{
  "version": "1",
  "name": "Solace House",
  "headline": "A private retreat for one",
  "intro": ["A two-storey home for everyday comfort, work and hosting."],
  "floors": {
    "ground": ["A dedicated study sits beside the entry.", "Wide garden openings lead out."]
  }
}
```

Every field but `version` is optional. `floors` is keyed by the plan's floor ids. A name holds
120 characters, a headline 200, a paragraph 1,200, and `intro` and each floor at most 3
paragraphs. Each string follows the plan's text rule. Without the file, the sheet carries the
plan's name and no words: Grid writes none in the author's place. A check sheet takes no words.

Grid draws only what the plan holds: no furniture or landscape, and no stair treads but for the
stairs the plan states. Every figure comes from
the same code as `grid check` and the area tools, and every page keeps the label "General
guidance, not your local rules". The pages use Source Serif 4 and Source Sans 3, under the SIL
Open Font Licence 1.1, which ship with Grid in `fonts/`. A sheet needs the canvas a PNG needs.

## Who sits where: `grid occupancy`

`grid occupancy [plan.json]` reads the occupancy file beside the plan, `plan.occupancy.json`
beside `plan.json`, and prints each seat by its room's name, with its desk and the people at it.
A seat whose room the plan no longer has, after a room was renamed in its id or taken out, is
named by its place in the file (`seats[2]`), with the id it names. Without the file, the command
is refused and says where the file goes.

The file is kept apart from the plan so that people's names never travel with it: no export,
sheet or tool of the tool server reads it, and the tool server has no tool for it. Its format is
in [People are kept out of the plan](plan-file.md#people-are-kept-out-of-the-plan).
