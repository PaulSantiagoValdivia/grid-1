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
- `packages/floorplan/src/rooms/` (WRT-2): writing a plan rooms first and reading any plan back
  as rooms text. `compile.ts` works out the walls, their kinds, the room boundaries and the
  openings' places from rooms text (the language is in its header); `read.ts` reads a plan back
  and checks the reading by writing it again, so it loses nothing; `stamp.ts` keeps what the
  plan records about how it was written (`written`). The plan file is the source of truth and
  rooms text a way of writing and reading it. `fixtures/rooms/` holds the lab's eight buildings
  as rooms text with their originals; `rooms/__tests__/buildings.test.ts` holds them to it.
- `packages/floorplan/src/geometry/items.ts` (CNT-12): the plan's fixtures (`items`, C6 in
  `types/floorplan.ts`): their footprints, symbols, rooms, the floor they take and their checks.
  CNT-11 decided fixtures now and furniture later, so `ITEM_KINDS` holds fixtures only; a new kind
  needs its symbol there and a decision first. A fixture is never a wall or a room.
- `packages/rules`: the checks that apply a figure from a building code, and the figures,
  each with where it was read and how far it has been checked. See its `README.md` before
  adding or changing a rule. It also holds the front door, `inspectPlan` (MSG-1,
  `src/result/`): one call that never throws and returns one record, one list with one count,
  for `grid check` and `grid_check`. `docs/result-contract.md` is the record's contract, and a
  test fails when it and `src/result/catalogue.ts` list different codes. A new message code
  gets its one wording, what is needed and the fix in that catalogue, and a line in the
  contract's code table and changelog.
- `packages/viewer`: the 2D and 3D views. It draws what the core gives it and never
  computes geometry of its own.
- `packages/cli`: the `grid` command (`ongrid` runs the same file): `init`, `write`, `check`,
  `describe`, `draw`, `export`, `sheet`, `tidy`, `serve` and `mcp`, in `src/command/`. `write`
  (WRT-2) writes a plan from rooms text, the main way to write one; `describe --as rooms` reads
  it back. `tidy` (MSG-12) lists the
  library's wall faults and makes the chosen fixes on the plan file as read. `describe` (VEW-5, `src/describe/`)
  prints the plan in three lengths, for a person (never an id) or an agent (`--for agent`). A
  folder holding `grid.json` (`grid init` writes it) is a Grid project: there `check`,
  `describe`, `draw`, `export` and `sheet` read its `plan.json` when no plan is named. `npm run build` bundles it with esbuild into
  `packages/cli/dist/grid.mjs`, which is git-ignored. The `grid` and `ongrid` bins point to
  `bin/grid.mjs`, a committed launcher that runs it, because npm links bins at install time. Its end-to-end tests run that file as a
  child process; `npm test` builds it first. Every option is strict: an unknown, repeated or
  meaningless one is refused by name.
- `grid serve` (CMD-5, `packages/cli/src/mcp/`) is the tool server an agent uses: 15 tools named
  `grid_…`, in a fixed order (reading tools by the requests they answer, then the preview, the
  export, the sheet, and the tools that change the plan). Each is written once in `readTools.ts` or
  `writeTools.ts`; `toolkit.ts` turns its argument list into both the input schema and the
  check. The measuring is in `src/quantities/`, the changes in `src/edit/`, the views in
  `src/draw/views.ts`. `src/mcp/__tests__/tools.test.ts` fails when a tool loses its prefix,
  title, hint, examples or output schema, or when the order changes; `replay/replay.test.ts`
  replays the lab's five Y conversations and holds the score. A description starts "Use this
  when…" and says when not to use the tool.
- `grid mcp` is the same server under the name agents start it by: `npx -y ongrid mcp` (CMD-9).
  `src/mcp/protocol.ts` answers both eras of the protocol: `initialize` for older clients, and
  for 2026-07-28 clients the version in each request's `_meta` and `server/discover`; a version
  it does not speak is refused with the ones it does. It keeps no state between lines.
- `grid sheet` (VEW-7, `src/sheet/`) writes an A3 PDF of the plan: `pages.ts` decides what
  is on each page from existing code (`planAreas`, `floorElevations`, `planFacts`, `checkPlan`),
  `pdf.ts` lays it out, and the pictures come from `drawPlan` and `drawStill`. The sheet never
  draws or measures a part of its own. `coverage.ts` says what it does with each top-level part
  of `FloorPlan`; a part added to the schema fails the type check there until it is placed.
  Its fonts, Source Serif 4 and Source Sans 3 (OFL 1.1), are in `packages/cli/fonts/`.
- Every way Grid is installed comes from one file, `packages/cli/src/distribution/listing.ts`:
  the npm package's manifest, the registry's `server.json`, the plugin folder for Claude Code
  and Codex with its marketplaces, the Cursor link, the set-up lines and the `.mcpb` manifest.
  `npm run pack:local --workspace ongrid` (`pack.mjs`, after a build) writes them all into
  `packages/cli/dist/release/` and publishes nothing; `src/distribution/__tests__/install.e2e.test.ts`
  installs each from the packed tarball, offline, in an empty folder and makes a call. The README's
  install section must match `installText()`: a test checks it. Publishing waits on CMD-8.
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
  in `packages/cli` imports `fs`: `src/__tests__/fileAccess.test.ts` fails if it does. It
  writes through Grid's one atomic writer, `packages/rules/src/store/atomicWrite.ts`, which the
  rules store uses too.

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
