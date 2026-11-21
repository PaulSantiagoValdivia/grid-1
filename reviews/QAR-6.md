# QAR-6 review: one schema library, no 3D helper library, code kept once

For the owner. QAR-6 (step 5) is on its own branch, waiting to be merged. Below: what it changes,
the results against the card, the decisions made without you, the tests that changed, and what
is still open.

## What QAR-6 changes

**One copy of zod.** The root `package.json` now has `"overrides": { "zod": "3.25.76" }`. Before,
floorplan and rules each had their own zod 3.25.76 under `packages/*/node_modules`, and the root
held zod 4.6.7, brought in by `eslint-plugin-react-hooks` (and its `zod-validation-error`). Now
`npm ls zod` shows 3.25.76 everywhere, one copy at the root, and the `grid` bundle holds that one
copy (`../../node_modules/zod` is the only zod in esbuild's inputs). The lint plugin accepts
`^3.25.0 || ^4.0.0`, so it runs on 3.25.76; `npm run lint` passes. A new package that imports zod
without declaring it now gets the version the plan schema uses.

**The error type from floorplan.** `@ongrid/floorplan/types/floorplan` re-exports zod's error as
`PlanSchemaError` and one problem as the type `PlanSchemaIssue`. `grid`'s plan reader
(`packages/cli/src/command/plan.ts`) uses `PlanSchemaIssue` in place of the type it worked out
from the schema. Only floorplan and rules import zod, and both declare it.

**No 3D helper library.** `@react-three/drei` is gone from `packages/viewer`. The 3D view used two
things from it:

- the orbit controls: `packages/viewer/src/canvas3d/OrbitControls.tsx` takes three's own
  `OrbitControls` from `three/examples/jsm`, with damping on as drei had it, makes them the
  canvas's default controls (what drei's `makeDefault` did, which `BuildingCamera` relies on) and
  sets the pivot once;
- the ground grid: `Canvas3D` now draws it with three's `GridHelper` twice, a line every metre and
  one every 5 m, 40 m across and centred under the building, from the same `GROUND_GRID` figures.

The still (`grid draw --3d`, the sheet's pictures) never used drei: it draws the grid itself. Its
code is unchanged; only comments that named drei were reworded.

**The test setup.** The comment in `viewer/src/canvas2d/__tests__/selection.test.ts` that named
Vitest's environment switch is reworded, so the file now runs in Node as it says (Vitest reports
0 ms of environment set-up for it). `scripts/__tests__/test-environment.test.ts` fails when any test
file names the switch anywhere but its first line.

**Code kept once.**

- The atomic writer: `packages/rules/src/store/atomicWrite.ts` is the one copy. The rules store
  and `grid`'s project resolver (`packages/cli/src/fs/projectFiles.ts`) both write through it; the
  resolver's own 20-line copy is gone. The writer is the resolver's version (a short temporary
  name, `.grid-<12 hex>.tmp`, so a long file name still fits). Rules exports it as
  `@ongrid/rules/atomicWrite`.
- The shared test plans: the 164 lines kept in both `floorplan/src/geometry/__tests__/rules-fixtures.ts`
  and `rules/src/checks/__tests__/fixtures.ts` are now one file,
  `packages/floorplan/src/test-support/plans.ts`, exported as `@ongrid/floorplan/test-support/plans`
  for the rules tests. The rules copy's own "the fixtures parse" test went with it: floorplan's
  `every-plan-parses.test.ts` checks the same plans, including every wall made a dividing line.

## Results

| done_when | Result |
|---|---|
| `npm ls zod` shows one major version and the bundle holds one copy; floorplan re-exports the error type. | **Met.** One version, 3.25.76, deduped to one copy; one zod in the bundle; `PlanSchemaError` and `PlanSchemaIssue` from floorplan. `scripts/__tests__/dependencies.test.ts` fails if the lock file gets a second zod or a zod that is not version 3. |
| The 3D helper library is gone, the shipped package count is well under 85 (Z-3), and its Apache-2.0 notices are no longer needed. | **Met.** Shipped packages, counted as `npm ls --omit=dev --all --parseable` lines under `node_modules`: 94 before, 33 after (29 of them not Grid's own). 50 entries left the lock file (48 with drei, and the two nested zod copies with the override), among them a second three (0.170.0), two of the three copies of zustand (4.5.7 and 5.1.0; fiber's 3.7.2 stays), `three-stdlib`, `hls.js`, `@mediapipe/tasks-vision` and `draco3d`. No third-party Apache-2.0 package ships now: the four that did (`@mediapipe/tasks-vision`, `draco3d`, `hls.js`, `promise-worker-transferable`) all came with drei. The same test fails if drei comes back. |
| The atomic writer and the shared test plans exist once. | **Met**, as above. |

The card counted 85 shipped packages; the same command on main gave 94 before this change, so
the tree had grown since the audit. 33 is well under either.

**NOTICE and LICENSE.** Neither changes. `NOTICE` never carried the Apache-2.0 notices of the four
packages drei brought in, so there was nothing to remove; with them gone, nothing needs adding
either. The packages left are MIT, BSD-3-Clause (`ieee754`) and the Unlicense (`robust-predicates`,
already in `NOTICE`). three's MIT notice for the tone-mapping port stays as it is. The orbit
controls are imported from the `three` package, not copied, so they need no notice of their own.

**The runs.** `npm run build`, `npm run typecheck`, `npm run lint` and `npm run check:licenses`
pass (the licence check read 363 licences in `package-lock.json`, none GPL, LGPL, AGPL, MPL or
EPL). `npx vitest run --exclude '.claude/**'`: 180 files, 4,019 tests, all passed.
`npm run scoreboard`: every count as stored ("Same as the stored figures"), so `current.json` is
unchanged.

## Decisions made without you

- **zod 3 by an override, not a move to zod 4.** The card allowed either. Moving to 4 would
  change floorplan's schema and its JSON Schema walker in `types/sheet.ts`, which reads zod 3's
  internals, and the wording of schema messages the command and the damage counts rely on. The
  override changes no code. A move to zod 4 can be its own card.
- **The writer lives in rules.** floorplan must stay pure and the command depends on rules, so
  rules is the only package both users can share it from. CMD-15's test of what the command runs
  now allows exactly two files to reach Node's file module, the resolver and this writer, and
  checks that only the resolver imports the writer. The scan of the command's source still
  refuses any call to the writer outside the resolver.
- **The app's ground grid is 40 m across and does not fade.** drei's grid was an infinite grid
  that faded out 45 m from the point under the camera. three's grid helper draws plain one-pixel
  lines of a fixed size, so the app now shows a 40 m square (the grid's stated size) and its lines
  carry the strength the still gives them (cell lines at a fifth, section lines full). The still
  keeps its fading grid. The two now differ at the grid's edge; if that matters, a small shader
  of our own would bring the fade back.
- **The orbit controls set the pivot once.** drei applied `target` as a prop on every render;
  `Canvas3D` passes the same array every render, so the effect is the same.

## Tests that changed

- New: `scripts/__tests__/dependencies.test.ts` (one zod, no drei),
  `scripts/__tests__/test-environment.test.ts` (Z-15), and in `floorplan.test.ts` a check that
  `parseFloorPlan` throws `PlanSchemaError`.
- `cli/src/__tests__/fileAccess.test.ts`: the import-graph check allows the shared writer beside
  the resolver, as above; the "old atomic writer" pattern is renamed, not loosened.
- `viewer/src/still/__tests__/sameCamera.dom.test.tsx`: finds Grid's own `OrbitControls` among
  the canvas's children in place of a mocked drei.
- Removed: `rules/src/checks/__tests__/fixtures-parse.test.ts`, with the copy of the plans it
  checked.
- Fifteen test files import the plans from their new place; nothing else in them changed.

## Still open

- **Not seen in a browser.** No app in this repository mounts `Canvas3D`, so the new orbit
  controls and grid were checked by the type check and the camera test only, not by orbiting a
  model. Worth a look when the app that uses the viewer next runs.
- zod 4, if wanted, as its own card (see above).
