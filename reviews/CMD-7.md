# CMD-7: a guide for agents, sample plans, a quick-start and the plan's structure as a schema

Branch `claude/cmd-7-663a00`. Evidence used: the card's WR-11, F5, F6, F7, Z-11 and OT-6, and
tonight's test campaign: T-app-integrator-4 and T-estate-agent-listings-3 (the server's
instructions never reach today's hosts), T-app-integrator-9 (no machine-readable plan schema; the
rooms language only in a source file) and T-estate-agent-listings-22 (the docs are not in the
package or reachable over MCP).

## What changed

- **One source for what Grid tells an agent** (`packages/cli/src/guide/paragraphs.ts`). Nine
  paragraphs: what the tools work on, the brief first, the units, rooms first, the plan file as
  source of truth, the answers to the first questions (new, WR-11), where the guide and schema
  are (new), room names travel, the label and retelling. The server's instructions are these nine
  joined, in order; the skill, the guide and the README's quick-start carry the ones `SHARED`
  lists for them. `UNITS_RULE` and `ROOM_NAMES_TRAVEL` moved here from `mcp/protocol.ts`, which
  re-exports them. The skill's own rooms-first wording, which differed from the instructions',
  is now the shared paragraph.
- **The guide for agents** (`packages/cli/src/guide/guide.ts` → `docs/agent-guide.md`, the
  resource `grid://guide`, `guide.md` in the package). Rooms first, then the raw-wall form, then
  the questions: a stair, the use words (the table of uses and the words read as each is made
  from `ROOM_USES` and `USE_WORDS`), inside or outside, dividing lines, L-shaped rooms. Every rooms
  text in it is compiled by a test with no rooms problem and no drawing error, and its hand-written
  plan file is read with no drawing problem and a 12 m² room, as it says.
- **The conventions page** (`docs/conventions.md`, five SVG drawings in `docs/conventions/`):
  C1 to C5 each with a section and a drawing, and a row for each later convention in the header,
  linking to its plan-file section. A test fails when a convention in the header has no row.
- **The plan's JSON Schema** (`packages/floorplan/src/types/planSchema.ts`): worked out from
  `FloorPlanSchema` by walking the zod schema, draft-07, with the format version in `$id`
  (`urn:ongrid:plan:1`), the title and `version`'s `const`. It describes the file as written:
  what the reading fills (a wall's thickness and height, an opening's size from its type, a stair's
  walking line from its two ends) is not required, and what only the reading records (`placedBy`,
  `unstated`, `typed`) is left out. `npm run build` writes it to `packages/cli/dist/plan.schema.json`;
  `pack.mjs` puts it in the package; the tool server serves it as `grid://schema/plan`.
- **Three sample plans** (`docs/samples/`): a ground-floor flat with the block's entrance hall and
  stair, a two-storey house with a dog-leg stair through both floors, and an open-plan home. Each
  is rooms text and the plan file `grid write` wrote from it, plus a site (plot, ground level and
  place), which rooms text has no words for; writing the rooms again keeps the site.
- **The quick-start** at the top of the README, `quickStart()` word for word: five steps and the
  smallest plan, then the rooms-first and first-questions paragraphs. Tried as written in a fresh
  folder: `grid init`, `grid write plan.rooms`, `grid check` and `grid draw --out plan.svg` all
  work. The README's documentation table has rows for the guide, the conventions and the samples.
- **The tool server** sends its instructions on `initialize` as well as on `server/discover`
  (T-app-integrator-4, T-estate-agent-listings-3), and lists the two new resources after the
  preview page. Found on the way: the capabilities' MCP Apps extension listed every resource's
  type; it now lists only an app page's (`text/html;profile=mcp-app`), so the guide and the
  schema do not claim to be apps.
- Docs: `tool-server.md` has a section on the two resources, `plan-file.md` points to the schema
  and the conventions, `rooms-first.md` to the guide and the samples.
- `ajv` (MIT, 6.x, already in the lock file through eslint) is a root dev dependency, for the
  schema test.

## The "done when" lines

1. **The JSON Schema is generated on every build, carries the format version, and every lab plan
   that parses validates (at least 200).** Met. `planSchema.test.ts` validates all 1,100 lab plans
   `parseFloorPlan` reads (of 1,131) with Ajv; none is refused. A one-off run on the 2,300 generated
   plans also had none refused. It also refuses what is not a plan (a wall with no end, a 3D point,
   another version or unit, an unknown opening type or wall kind, a boundary that is not a list).
2. **The README's smallest plan and the three samples are accepted by `parseFloorPlan`, and every
   check reports coverage of more than 0 on each.** Met. `samples.test.ts`: each sample is read,
   has no drawing problem and no line but "not checked", matches what its rooms text writes, and
   all 9 checks have `lookedAtCount > 0` (for example the house: 2 floors, 12 rooms, 12 doors,
   2 stair rooms, 20 openings above ground, 4 plot edges, 3 rooms sized, 2 bedrooms with an escape).
   `guide.test.ts` compiles and reads the README's smallest plan.
3. **README, guide, skill and server instructions from one source; a test fails if their shared
   paragraphs differ.** Met. `oneSource.test.ts` checks every shared paragraph in every place
   `SHARED` names (whitespace aside), that the instructions are exactly the nine in order, and that
   the page is the guide the server serves.
4. **A scripted WR-11 question set is answered correctly from the guide alone by a fresh agent.**
   Met. `wr11.ts` holds the six questions (stair; the use for "my office"; the use for "the loo";
   inside or outside and how to write an outside size; a dividing line's thickness and how to write
   it; an L-shaped room) with what a right answer must and must not say. A fresh Claude Haiku
   subagent, told to read only `docs/agent-guide.md` and nothing else, answered all six right; its
   answers are kept in `wr11-answers.json` and scored by `wr11.test.ts`, which also checks that each
   question's own section of the guide says what a right answer says. The run is not repeated by the
   test (it needs a model); re-run it after changing the guide's answers.

## Tests whose expected value changed

- `mcp/__tests__/preview.test.ts`, "serves the page…": `resources/list` was exactly the preview
  page; now the page first, then `grid://guide` and `grid://schema/plan`.
- `distribution/__tests__/install.e2e.test.ts`, "installs the one bundled file and nothing else":
  the package now also holds `guide.md` and `plan.schema.json`.
- `__tests__/ownWords.test.ts`: `distribution/listing.ts` 84 → 81 and `mcp/protocol.ts` 23 → 14
  (their paragraphs moved to `guide/paragraphs.ts`); new entries for `guide/guide.ts` (98),
  `guide/paragraphs.ts` (16) and `guide/resources.ts` (3), written for the agent, and
  `floorplan/src/types/planSchema.ts` (3, the schema's title and description and a programming
  error).

- `command/__tests__/grid.e2e.test.ts`, "starts with a shebang and is one file": the bundle's cap
  goes from 700 kB to 750 kB. The guide, which the tool server serves from the bundle, and the
  schema writer take it to 717,520 bytes, with no new dependency.

## Check results

- Full suite (`timeout 1500 npx vitest run --exclude '.claude/**' --maxWorkers=2 --minWorkers=1`):
  6,274 passed, 4 skipped, 2 failed, both in `grid.e2e.test.ts`: the bundle's size cap (raised
  above) and "answers grid check on the sample flat in under 500 ms", a timing test under the
  machine's load. Run alone afterwards, the file's 98 tests all pass.
- `npm run typecheck`: clean. `npm run lint`: clean.
- `npm run scoreboard`: every count the same as stored (rooms measured wrong 197, damage that
  passes in silence 277, turns answered 23, design mistakes named 5, checks the plan can feed 25,
  and the two guards 735 and 95). No count moves.

## For the owner

- **The samples name the United States as their place.** Grid's only figures today are US model
  codes, so a sample anywhere else leaves the room-size and escape checks at 0 rooms, which the
  card does not allow. Change `site.country` when figures for another place land.
- **The open-plan sample is a home, not an office.** An office floor leaves the same two checks at
  0 (their figures are read for homes); the guide still shows an office's use words.
- **The schema allows fields Grid does not know**, as the reading does (it reads past them and names
  them, `plan/unknown-field`). Refusing them would refuse 19 of the 1,100 lab plans, all of them
  agents' made-up fields. A strict copy is one keyword away if you want one for validation.
- **The schema is not committed**, only built (`packages/cli/dist/plan.schema.json`, git-ignored)
  and served: a committed copy would conflict with every change to the format. Its `$id` is
  `urn:ongrid:plan:1`, an address that names the version without claiming a web address.
- **The guide is written in TypeScript and the page is generated** (`GRID_WRITE_GUIDE=1 npx vitest
  run packages/cli/src/guide`), so the server can carry it in the bundle without reading a file.
- **Instructions on `initialize`.** Done here because the guide is "served by the tool server" and
  T-app-integrator-4 showed no current host reads `server/discover`. The instructions now carry
  nine paragraphs, two of them new (the first questions, and where the guide and schema are).
- **`ajv` 6** is the validator in the test because it was already installed; Ajv 8 would read newer
  drafts if you want the schema at 2020-12 later.
- **The conventions table** must get a row for every new convention (CNT-19 or CNT-20 may add one
  tonight): the test names the missing number.
- **No convention number taken.**
