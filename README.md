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
| `grid draw [<plan>] [--png \| --3d] [--out <file>] [--floor <id>] [--scale <n>]` | Draws one floor as SVG, or PNG with `--png`, or the 3D model as PNG with `--3d`; to standard output unless `--out` names a file |
| `grid export [<plan>] --format dxf\|ifc\|glb\|obj [--floor <id>] [--out <file>]` | Writes an export into `exports/` beside the plan, unless `--out` names a file |
| `grid serve` | Starts the tool server on standard input and output: the preview tool and `grid_export` |

`grid draw --3d` takes the 3D model as the app opens it: the same scene, from the same camera
(south-east, about 29.5 degrees down, through a 45 degree lens). It needs no browser and no
graphics card: the scene is drawn in software, each face lit flat, without shadows. With
`--floor`, that floor is shown as a cutaway, as in the app; without it, the whole building.
The PNG is 1200 by 800 pixels, times `--scale` (up to 4).

Every command also takes `--project <folder>` (see below). An unknown, repeated or
meaningless option is refused by name. The command exits 0 when it did its work, 1 when the
plan or a path was refused or a file could not be written, and 2 when the command line was
refused. A refusal is one line on standard error. Findings in a report are not a refusal:
`grid check` still exits 0.

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
named with `--project`), `check`, `draw` and `export` read `plan.json` when no plan file is
named, and `export` writes into `exports/`. A plan file named on the command line is used
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
