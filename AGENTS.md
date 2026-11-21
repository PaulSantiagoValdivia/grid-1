# Working on Grid

Notes for agents and people changing this repository.

## Names

- Write "Grid" in sentences and `ongrid` in code.
- The commands will be `grid` and `ongrid`. They do the same thing.
- Internal packages use the `@ongrid/` scope. The scope is provisional. It appears in the
  package names under `packages/` and in imports between packages, and nowhere else.

## Layout

- `packages/floorplan`: the plan schema, geometry, validation and exporters. It stays pure: no
  React, no Three.js, no DOM and no network. Every tolerance and limit a check uses lives in one
  table, `src/geometry/tolerances.ts` (MSG-15), and is read through `tolerance()` or `limit()`;
  `src/geometry/__tests__/tolerances.test.ts` fails on a tolerance literal anywhere else in the
  geometry, validation or schema, and when the README's table no longer matches it. Its figures
  are Grid's own drawing checks and cite no document.
- `packages/rules`: the checks that apply a figure from a building code, and the figures,
  each with where it was read and how far it has been checked. See its `README.md` before
  adding or changing a rule.
- `packages/viewer`: the 2D and 3D views. It draws what the core gives it and never
  computes geometry of its own.
- `packages/cli`: the `grid` command (`ongrid` runs the same file): `init`, `check`,
  `describe`, `draw`, `export` and `serve`, in `src/command/`. `describe` (VEW-5, `src/describe/`)
  prints the plan in three lengths, for a person (never an id) or an agent (`--for agent`). A
  folder holding `grid.json` (`grid init` writes it) is a Grid project: there `check`,
  `describe`, `draw` and `export` read its `plan.json` when no plan is named. `npm run build` bundles it with esbuild into
  `packages/cli/dist/grid.mjs`, which is git-ignored. The `grid` and `ongrid` bins point to
  `bin/grid.mjs`, a committed launcher that runs it, because npm links bins at install time. Its end-to-end tests run that file as a
  child process; `npm test` builds it first. Every option is strict: an unknown, repeated or
  meaningless one is refused by name.
- `grid serve` (CMD-5, `packages/cli/src/mcp/`) is the tool server an agent uses: 13 tools named
  `grid_…`, in a fixed order (reading tools by the requests they answer, then the preview, the
  export, and the tools that change the plan). Each is written once in `readTools.ts` or
  `writeTools.ts`; `toolkit.ts` turns its argument list into both the input schema and the
  check. The measuring is in `src/quantities/`, the changes in `src/edit/`, the views in
  `src/draw/views.ts`. `src/mcp/__tests__/tools.test.ts` fails when a tool loses its prefix,
  title, hint, examples or output schema, or when the order changes; `replay/replay.test.ts`
  replays the lab's five Y conversations and holds the score. A description starts "Use this
  when…" and says when not to use the tool.
- `scoreboard/`: the lab's plans, damage sets and expected figures, and the runner behind
  `npm run scoreboard`. It prints five counts and fails when one is worse than
  `scoreboard/current.json`. Its `README.md` defines the counts. A change that moves a count
  stores the new figures in the same commit.
- A plan file is read one way (MSG-9): `src/fs/textEncoding.ts` turns its bytes into text
  (byte-order mark, UTF-16, strict UTF-8) and `src/command/planText.ts` limits and cleans its
  names, ids and lists before the schema. The tool server's arguments use the same character
  rule. A refusal names the part and the limit, never the text.
- Every file the command or the tool server reads or writes goes through
  `packages/cli/src/fs/projectFiles.ts`, which keeps it inside the project folder. Nothing else
  in `packages/cli` imports `fs`: `src/__tests__/fileAccess.test.ts` fails if it does.

## Commands

```bash
npm install
npm run build
npm run typecheck
npm run lint
npm test
npm run scoreboard
```

Run the type check, the tests and the scoreboard before calling a change done.

## Rules

- Node 22, npm, TypeScript in strict mode.
- English in code, comments and docs.
- Conventional commits.
- Grid is licensed under Apache-2.0. See `LICENSE` and `NOTICE`.
- Every `package.json` has `"license": "Apache-2.0"` and keeps `"private": true` until
  publishing is approved. A test checks both.
- No dependency may be under a GPL, LGPL, AGPL, MPL or EPL licence. `npm run check:licenses`
  checks `package-lock.json`, and CI runs it.
- Never commit secrets, `.env` files, personal data or paths from your own machine.

## Rules and standards

The checks in `packages/floorplan` are checks on the drawing and cite no document. The checks in
`packages/rules` apply figures from building codes. Keep what is stored here to facts and our
own words.

- A check may state a figure and say where it comes from: the document, its edition and the
  clause number.
- Never copy text from a standard, a code or a regulation into this repository. No sentences,
  tables, definitions or images of them. Describe a rule in your own words.
- Only cite a source you were allowed to read.
- Every figure records its document, edition, clause, where it applies, the day it was read
  and a status. A figure an AI found is `ai-found` until a named person has checked it
  against the document. An AI is never recorded as the one who verified a figure.
- A rule that holds only for some buildings or places runs only there, and says so.
- Do not add collections of rules gathered from a publisher's website.
- Every report keeps the label "General guidance, not your local rules". No message says a
  plan complies or is approved.
- A short quote that a rules lookup collects, with its address, is saved in the user's own
  project. It never belongs in this repository.
- Do not copy code from another project unless its licence allows it. When you do, say where
  it came from and under which licence. Copied code keeps its own licence and copyright
  notice: leave its header in place, and add the notice to `NOTICE` when its licence asks
  for that.
