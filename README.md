# Grid

Grid (ongrid): floor plans and plan checks for architects

Grid lets architects design and check floor plans by describing them to an AI agent.
One structured plan file (walls, rooms and openings, in metres) is the source of truth.
A geometry core reads it, validates it, draws it in 2D and 3D, and feeds the exporters.

## Status

This repository is being set up. The packages hold working code with tests, but nothing
is published yet and there is no release to install.

## Layout

| Path | Package | Contents |
|---|---|---|
| `packages/floorplan` | `@ongrid/floorplan` | Plan schema, geometry, validation, plan checks and exporters |
| `packages/rules` | `@ongrid/rules` | Checks that apply figures from building codes, with each figure's source |
| `packages/viewer` | `@ongrid/viewer` | 2D and 3D views of a plan, `planToSvg` (a picture of a plan as an SVG file) and `planStill` (a still of the 3D model as pixels), with no browser |
| `packages/cli` | `ongrid` | The `grid` command (`ongrid` does the same): `init`, `check`, `draw`, `export` and `serve` (the preview tool server). Also CAD program lookup, `drawPlan` (a plan as SVG or PNG) and `drawStill` (the 3D model as PNG) |

## Development

Grid needs Node 22 and npm.

```bash
npm install
npm run build
npm run typecheck
npm run lint
npm test
```

## Running Grid from a copy of the repository

```bash
npm ci
npm run build
npx --no grid check packages/cli/fixtures/two-bed-flat.json
```

`npx --no ongrid` runs the same command, and so does `node packages/cli/dist/grid.mjs`. Keep
the `--no`: without it, npx fetches a package of the same name from the registry when the
local one is missing.

| Command | What it does |
|---|---|
| `grid init [<folder>]` | Starts a project folder: `grid.json`, a starter `plan.json` and `exports/` (see below) |
| `grid check [<plan>] [--floor <id>] [--country <code>] [--json]` | Prints the report. Every report is labelled "General guidance, not your local rules" |
| `grid describe [<plan>] [--length line\|rooms\|walls] [--for person\|agent]` | Describes the plan in a few lines: its rooms, which rooms each opening joins, and with `--length walls` its walls (see below) |
| `grid draw [<plan>] [--png \| --3d] [--out <file>] [--floor <id>] [--scale <n>]` | Draws one floor as SVG, or PNG with `--png`, or the 3D model as PNG with `--3d`; to standard output unless `--out` names a file |
| `grid export [<plan>] --format dxf\|ifc\|glb\|obj [--floor <id>] [--out <file>]` | Writes an export into `exports/` beside the plan, unless `--out` names a file |
| `grid serve` | Starts the tool server on standard input and output: the preview tool and `grid_export` |

`grid draw --3d` takes the 3D model as the app opens it: the same scene, from the same camera
(south-east, about 29.5 degrees down, through a 45 degree lens). It needs no browser and no
graphics card: the scene is drawn in software, each face lit flat, without shadows. With
`--floor`, that floor is shown as a cutaway, as in the app; without it, the whole building.
The PNG is 1200 by 800 pixels, times `--scale` (up to 4).

### Describing a plan: `grid describe`

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
such as where north is, the kind of building, how floors connect when it holds no stairs and
which rooms make each flat, is said as such. Directions are on the drawing, with north at the
top. The card checks nothing; it ends with the label "General guidance, not your local rules".

Every command also takes `--project <folder>` (see below). An unknown, repeated or
meaningless option is refused by name. The command exits 0 when it did its work, 1 when the
plan or a path was refused or a file could not be written, and 2 when the command line was
refused. A refusal is one line on standard error. Findings in a report are not a refusal:
`grid check` still exits 0.

### Floor no room claims

Besides the findings, `grid check` lists problems in the drawing. Some of them come from the
spaces the walls enclose: once per floor, Grid joins the wall footprints and takes the spaces
they close off, without looking at any room, and then sets each room's outline against them.
Each of these is a warning ("worth a look"); nothing is left out because of it.

| Code | What it says |
|---|---|
| `floor/unclaimed` | Enclosed floor that no room claims: its area, a point inside it and the walls around it. A forgotten room no longer makes the total smaller in silence |
| `room/space-mismatch` | A room whose outline is not the space its walls enclose: how much of it lies on walls it does not list (a pod, a column, furniture drawn as walls), outside the walls, or across a wall or dividing line into another space |
| `room/not-enclosed` | A room its walls do not close off at all, because they leave a gap |
| `floor/spaces-unknown` | A floor whose spaces could not be worked out, with the reason |

The joining uses `polygon-clipping` (MIT), named in `NOTICE`.

### Rooms that overlap, and rooms inside rooms

Grid also sets the rooms of each floor against each other. Two rooms that cover the same floor,
0.01 m² of it or more, get a warning naming both rooms and the floor they share, because that
floor is counted twice: a room that names one wrong wall and grows over its neighbour, or a room
listed twice. Rooms that meet face to face, across a wall or along a dividing line, share no
floor and get nothing.

A wardrobe pod, a lift shaft or an en-suite drawn inside a bigger room is said with
`"inside": true` on the inner room:

```json
{ "id": "ward", "name": "Wardrobe pod", "boundary": ["pod0", "pod1", "pod2", "pod3"], "inside": true }
```

Grid finds the room it sits in from the outlines: the smallest room on the same floor that
holds it. The inner room's floor, with its own walls, is taken off that room, so each square
metre is counted once, in the area of every room, the 2D drawing, the size check and the
comparison of two plans. A door in the inner room's walls opens into the room around it. The
outline of the room around it stays whole; only its area changes.

| Code | What it says |
|---|---|
| `room/overlap` | Two rooms on one floor share floor: both names, each one's area, the shared area and a point inside it. On the larger room, or the later of two copies |
| `room/inside-no-host` | A room marked `inside` that no room on its floor holds, with how much of it lies outside the room that holds most of it. It is counted on its own |
| `room/overlap-unknown` | Two rooms that could not be compared, with the reason |
| `floor/overlaps-unknown` | A floor whose rooms were not all compared: the plan has more than 200,000 pairs of rooms lying over each other (thousands of copies piled in one place), and Grid stopped there |

### Starting a project: `grid init`

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
| `plan.json` | A starter plan: a two-room flat with its room uses and door swings stated, to change |
| `exports/` | Where `grid export` writes |
| `.gitignore` | The line `exports/`, added when it isn't there |

With no folder, `grid init` starts the project in the folder it runs in. A folder is a Grid
project when it holds `grid.json`. In a Grid project (the folder Grid runs in, or the one
named with `--project`), `check`, `describe`, `draw` and `export` read `plan.json` when no
plan file is named, and `export` writes into `exports/`. A plan file named on the command line is used
instead. Outside a Grid project a plan file must be named.

`grid init` never replaces a file. It refuses, changing nothing, a folder that already
holds `grid.json` (a second `grid init`) or `plan.json`, or a file named `exports`. Any
other folder is fine, empty or not: `grid init` only adds its own files.

The rules store (`@ongrid/rules/store`) keeps a project's build location and rules sheet on
this computer, outside the project folder, so a copy of the project never carries them. It
names them by the id in `grid.json`.

### The project folder

Grid reads and writes files only inside one folder, the project folder:

- the folder named with `--project <folder>`, or else the folder Grid runs in;
- never the top of a disk (`/`, `C:\`) or the home folder, where "inside" would mean almost
  anywhere. Run Grid in the folder that holds the plan, or name that folder with `--project`.

A relative path on the command line starts from the folder Grid runs in, as in any shell. A
path given to a tool of `grid serve` starts from the project folder, since a host may start
the server anywhere. `grid serve` started at the top of a disk or in the home folder still
runs: the preview works, and each file tool answers that it needs `--project`.

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

## Licence

Grid is licensed under the [Apache License 2.0](LICENSE) (`Apache-2.0`). See also
[NOTICE](NOTICE). To suggest a change, see [CONTRIBUTING.md](CONTRIBUTING.md).
