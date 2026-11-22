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
| `packages/cli` | `ongrid` | The `grid` command (`ongrid` does the same): `init`, `edit`, `check`, `describe`, `draw`, `export`, `tidy`, `serve` (the tool server an agent uses) and `mcp` (the same server). Also CAD program lookup, `drawPlan` (a plan as SVG or PNG) and `drawStill` (the 3D model as PNG) |

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

Every command, with its options, is in [docs/commands.md](docs/commands.md).

## Installing Grid in an agent

Not yet: the package is not published, and publishing waits on the owner's approval (CMD-8).
Once it is, one line starts Grid's tool server for any agent that runs tools on the person's
computer, and the lines below are the ones to type. They all come from one file,
`packages/cli/src/distribution/listing.ts`, and a test fails when this list no longer matches it.

Every way below starts Grid's tool server with `npx -y ongrid mcp`.

- Claude Code: `claude mcp add grid -- npx -y ongrid mcp`
- Codex: `codex mcp add grid -- npx -y ongrid mcp`
- VS Code: `code --add-mcp '{"name":"grid","type":"stdio","command":"npx","args":["-y","ongrid","mcp"]}'`
- Copilot CLI: `copilot mcp add grid -- npx -y ongrid mcp`
- Cursor: [Add to Cursor](cursor://anysphere.cursor-deeplink/mcp/install?name=grid&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm9uZ3JpZCIsIm1jcCJdfQ==)
- Claude Code, as a plugin with a skill: `/plugin marketplace add ongrid-arch/grid`, then `/plugin install grid@grid`
- Codex, as a plugin with a skill: `codex plugin marketplace add ongrid-arch/grid`
- Claude's desktop app: open the `.mcpb` file for your computer and pick the project folder.

Until publishing, pack everything from a copy of the repository, and install from the tarball:

```bash
npm run build
npm run pack:local --workspace ongrid
npx -y --package=./packages/cli/dist/release/ongrid-0.0.0.tgz ongrid mcp
```

`pack:local` publishes nothing. It writes into `packages/cli/dist/release/` the npm package as
a tarball (the bundled command and nothing else; the canvas that draws PNGs is an optional
package), the registry's `server.json`, the plugin for Claude Code and Codex with a marketplace
folder that lists it, `install.md` with the lines above, and a `.mcpb` bundle for Claude's
desktop app that carries the canvas for the computer it was packed on. The plugin lines above
name the repository, so they work once its marketplace files are committed at the top (CMD-8).

## Documentation

Each page answers one kind of question, so read only the one you need.

| To… | Read |
|---|---|
| Write a plan: name the rooms, doors and windows, and let Grid work out the walls | [docs/rooms-first.md](docs/rooms-first.md) |
| Run a command: `init`, `write`, `edit`, `check`, `describe`, `draw`, `export`, `sheet`, `tidy`, `occupancy`; options, exit codes, the project folder | [docs/commands.md](docs/commands.md) |
| Call Grid as an agent: the `grid_…` tools, measuring from faces, protocol versions | [docs/tool-server.md](docs/tool-server.md) |
| Know what a plan file may hold and what each drawing check's code means: floors, steps, overlapping rooms, holes, fixtures, wall faults, inside and outside walls, and where people's names go instead | [docs/plan-file.md](docs/plan-file.md) |
| Know what an area figure means: net, gross internal and gross external, and which comes first where; the room schedule and the door and window schedule | [docs/areas.md](docs/areas.md) |
| Know the figure behind a check, and when Grid asks whether a size is meant | [docs/tolerances.md](docs/tolerances.md) |
| Read what `grid check` and `grid_check` return: the record and every message code | [docs/result-contract.md](docs/result-contract.md) |
| Add or change a sentence Grid writes, or add a language: the message files, `--lang`, room uses by language | [docs/languages.md](docs/languages.md) |
| Change Grid itself | [AGENTS.md](AGENTS.md) |

## Licence

Grid is licensed under the [Apache License 2.0](LICENSE) (`Apache-2.0`). See also
[NOTICE](NOTICE). To suggest a change, see [CONTRIBUTING.md](CONTRIBUTING.md).
