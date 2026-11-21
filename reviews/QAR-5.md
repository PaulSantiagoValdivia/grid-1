# QAR-5 review: results that do not depend on file order

For the owner. QAR-5 (step 2) is on its own branch, waiting to be merged. Below: what it changes,
the change to the plan file (which needs your check), the results against the card, the
decisions made without you, the tests that changed, and what is still open.

## What QAR-5 changes

**One order for every export.** `packages/floorplan/src/geometry/order.ts` puts a plan's walls,
rooms and openings in id order before an export is written: `exportPlan` does it for DXF, OBJ
and GLB, and `toIfc` does it itself, so a direct caller gets the same. Ids are compared piece by
piece, a run of digits by its value, so `w2` comes before `w10`, and the rest by character code.
Two ids that read as the same number (`w01`, `w1`) fall back to character order, and two parts
with the same id (a fault validation reports) are put in the order of their content, so the
order never depends on the order it was given. The plan passed in is not changed.

**A project id in the plan.** A plan may now say `"projectId": "…"` at its top level. The IFC
builds every element's GlobalId from it with the element's kind, its floor and its id. The id
the plan stores wins over the one the caller passes; a plan with none falls back to the caller's,
which for `grid export` and `grid_export` is the plan file's name, as before. `grid init` writes
one id, the same one, into `plan.json` and `grid.json`.

**The seed of an identity.** It was the text `project:kind:id`. It is now the JSON array
`[project, kind, floor, id]`, with `null` as the floor of what the whole building shares (the
project, the site, the building, a storey, a door style, a wall material). The array keeps two
seeds apart even when an id holds a colon. The hash (`ifcGuid`) is unchanged.

## The change to the plan file

```json
{ "version": "1", "units": "m", "projectId": "6f1c2a9e-0b7d-4c55-9e0a-3d2f1b8c7a64", "walls": [] }
```

- Optional and never defaulted, added to version 1, like `inside` in ARE-5: a plan that does not
  state it reads with no key added. CNT-1's version rule still does not exist in the code, so the
  same question stands: is this a version-1 field or the first of version 2.
- It follows the rule for an id (MSG-9): one line, no control characters, at most the id limit.
  An empty one is refused. `planText.ts` in the command checks it before the schema, as it does
  every id, and names `projectId` in the refusal.
- The sheet does not show it (`coverage.ts`): it names the project to other programs, not the
  building.
- Nothing writes it into an existing plan. `grid export` never changes the plan it reads.

## Results

| done_when | Result |
|---|---|
| Shuffling the order of walls gives byte-identical IFC, GLB, OBJ and DXF on the 64 plans of MS-21. | **Met.** The lab's experiment-5 plans, rebuilt from its seeds, eight shuffles each, every floor of every format: before, all 64 differed in all four formats; now none does. Shuffling rooms (42 before) and openings (1 IFC before) now changes nothing either. |
| IFC identities are built from a stored project id with each element's kind, floor and id; "house" and "House" no longer write the same file name. | **First half met. Second half not changed, on purpose; see below.** |

How the 64 were run: a script outside the repository rebuilt the lab's plans from its generator
and compared the export bytes for every floor, with walls, rooms and then openings shuffled.
The script and the lab's paths are not committed. In the repository,
`scoreboard/__tests__/fileOrder.test.ts` replays the 44 of those plans this folder can rebuild:
the bench's two-bedroom flat, the 40 seeded buildings, the bench's L room, the flat with an
opening listed twice and the flat with a wall id used twice. The other 20 (L, T, U, Z and cross
shapes) come from a generator that is only in the lab. `packages/floorplan/src/export/__tests__/fileOrder.test.ts`
checks the same on a two-floor plan with walls, rooms and openings shuffled together.

The card says the DXF differed in 1 plan of 64 after an audit. Re-run on the main branch as it
was before this change, the DXF differed in all 64 when the walls were shuffled. The difference
does not matter now that it is 0, but the card's figure is not what this run saw.

**The runs.** `npm ci`, `npm run build`, `npm run typecheck`, `npm run lint` and
`npm run check:licenses` pass. `npx vitest run`: 3,972 of 3,973 tests passed; the one that did
not, `cuts a note taller than a page by its lines` (sheet `pdf.test.ts`), went past its 60 s
limit while four sessions ran their suites on one machine, and passed alone in 26 s. QAR-5 does
not reach it. `npm run scoreboard`: every count as stored, so `current.json` is unchanged.

## Decisions made without you

- **"house" and "House" still write `house.ifc`.** The lab's complaint (K-13) was that the two
  wrote one file name with three different sets of identities. Now a plan that stores its id
  gets the same identities under either name, so the one file name holds the same model.
  Changing the file name itself is EX-4's work: `uses the project name, and the floor only when
  the plan has several` in `planExport.test.ts` pins lower-case names, and two EX-4 expected
  failures ask for a different way of turning names into file names. On a Mac or Windows disk
  `House.ifc` and `house.ifc` are one file anyway. If you want the literal reading, it belongs
  with EX-4.
- **A plan with no project id falls back to the file name.** The other choice was one fixed id
  for every such plan, which gives two different projects the same identities when they are
  linked in one BIM tool. The file name is what Grid did before; new projects store their id.
- **Every GlobalId changes once.** The card asks for the floor in the identity, so no existing
  identity could stay. Grid is not published yet (CMD-8), so no one's re-export is broken.
- **The floors list and each room's outline are kept as written.** Floors of one level are
  stacked in the order the list gives, and LVL-1 is changing levels now. A room's outline is
  the room's own description. Both still change the IFC and GLB bytes when reordered (see what
  is open).
- **Which floor an export of DXF, OBJ or GLB takes, when none is named, is still worked out on
  the plan as read.** It is the lowest floor; among floors that the floors list does not name,
  the first one a wall names. Working it out on the sorted plan would make `grid export` name
  the file after one floor (`-floor-2`) and write another.

## Tests that changed

- The four IFC golden files (`geometry/export/__tests__/golden/`) were written again. Every
  GlobalId changed; no other line changed or moved (checked line by line with the identities
  masked). Their plans were already in id order.
- `stays unique inside one document even when the seed repeats` (ifc.test.ts) expects the new
  seed, `["proj","wall",null,"w1"]`, in place of `proj:wall:w1`.
- `makes the folder with grid.json, the starter plan, exports/ and the ignore line` (init.e2e)
  now reads `grid.json` first and expects `plan.json` to be the starter plan with that id.
- No expected figure changed. No `it.fails` was flipped: the lab's file-order entries had none.
  `pinned-tests.md` says so.

## Still open

- **A room's outline started at another wall, or listed the other way round**, still changes the
  IFC and GLB in all 64 plans, and the OBJ and DXF too, with the same areas (lab L-12). The
  shapes are the same; their points start elsewhere. A fix would start each outline at one
  chosen point.
- **Floors of one level listed in another order** would change the IFC storey order: `planFloors`
  keeps the list's order among floors of one level (read from the code). The 64 plans have no two
  floors on one level, and reversing their floors lists changed no export.
- **Which of two openings in one place is reported** still follows the file (L-12); that is a
  message, not an export.
- **A plan without a project id** could be told so by `grid check`, or given one by `grid tidy`.
- **The sheet** (`grid sheet`) was not checked for file order; the card names the four exports.

## Files touched

- `packages/floorplan/src/geometry/order.ts` (new), `geometry/index.ts`
- `packages/floorplan/src/export/planExport.ts`, `geometry/export/ifc.ts`
- `packages/floorplan/src/types/floorplan.ts`
- `packages/cli/src/command/init.ts`, `command/planText.ts`, `sheet/coverage.ts`
- Tests: `packages/floorplan/src/export/__tests__/fileOrder.test.ts` (new),
  `types/__tests__/floorplan.test.ts`, `geometry/export/__tests__/ifc.test.ts`, the four golden
  files, `packages/cli/src/command/__tests__/init.e2e.test.ts`,
  `scoreboard/__tests__/fileOrder.test.ts` (new)
- `README.md`, `packages/floorplan/src/test-support/pinned-tests.md`, this file
