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
| `packages/cli` | `ongrid` | Building blocks for the `grid` and `ongrid` commands: the preview tool server, CAD program lookup, export helpers and `drawPlan` (a plan as SVG or PNG). The commands themselves are not built yet |

## Development

Grid needs Node 22 and npm.

```bash
npm install
npm run typecheck
npm run lint
npm test
```

## Licence

Grid is licensed under the [Apache License 2.0](LICENSE) (`Apache-2.0`). See also
[NOTICE](NOTICE). To suggest a change, see [CONTRIBUTING.md](CONTRIBUTING.md).
