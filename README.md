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
| `packages/viewer` | `@ongrid/viewer` | 2D and 3D views of a plan, and `planToSvg`: a picture of a plan as an SVG file, with no browser |
| `packages/cli` | `ongrid` | The `grid` command (`ongrid` does the same): `check`, `draw`, `export` and `serve` (the preview tool server). Also CAD program lookup and `drawPlan` (a plan as SVG or PNG) |

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
| `grid check <plan> [--floor <id>] [--country <code>] [--json]` | Prints the report. Every report is labelled "General guidance, not your local rules" |
| `grid draw <plan> [--png] [--out <file>] [--floor <id>] [--scale <n>]` | Draws one floor as SVG, or PNG with `--png`; to standard output unless `--out` names a file |
| `grid export <plan> --format dxf\|ifc\|glb\|obj [--floor <id>] [--out <file>]` | Writes an export into `exports/` beside the plan, unless `--out` names a file |
| `grid serve` | Starts the preview tool server on standard input and output |

An unknown, repeated or meaningless option is refused by name. The command exits 0 when it
did its work, 1 when the plan was refused or a file could not be written, and 2 when the
command line was refused. A refusal is one line on standard error. Findings in a report are
not a refusal: `grid check` still exits 0.

## Licence

Grid is licensed under the [Apache License 2.0](LICENSE) (`Apache-2.0`). See also
[NOTICE](NOTICE). To suggest a change, see [CONTRIBUTING.md](CONTRIBUTING.md).
