# CMD-4: run `grid check`, `grid draw` and `grid export` from a copy of the repository

CMD-4 was built earlier (the library in `packages/cli/src/command/`, the esbuild bundle
`packages/cli/dist/grid.mjs`, the launcher `packages/cli/bin/grid.mjs` named by the `grid` and
`ongrid` bins, the strict option parser in `options.ts`). This pass checked every "done when"
line against `main` at `ce236f72`, with evidence, and added only the two tests that the
existing ones left out.

## The "done when" lines

All four were already met on `main`. Evidence is from a fresh `git clone` of `main` into a
scratch folder, `npm ci --prefer-offline` (305 packages, 3 s) and `npm run build`, then the
commands below run from a separate folder with the clone's `node_modules/.bin` on `PATH`.

1. **Fresh clone, byte-identical `node dist/grid.mjs check` and `ongrid check`.** Met.
   On the sample flat (`packages/cli/fixtures/two-bed-flat.json`) `node …/dist/grid.mjs check`,
   `ongrid check` and `grid check` all exit 0 with the same 1,194 bytes (one SHA-1 for all
   three). On the lab's own two-bedroom flat (`twoBedFlat` in
   `scoreboard/data/bench-examples.json`, which is not the same plan as the sample: 9 walls,
   6 rooms, 13 openings against 8, 5, 10) the same, 1,196 bytes. No test runner is involved.
   Held by `grid.e2e.test.ts` "gives the same bytes through node, grid and ongrid" (sample
   flat) and, new here, "… on the lab's two-bedroom flat". CI (`.github/workflows/ci.yml`)
   runs `npm ci` then `npm run build` on a clean checkout, so every CI run repeats the clone.
2. **check, draw (SVG, PNG) and export (dxf, ifc, glb, obj) exit 0 on the sample, non-zero
   with one line on a refused plan.** Met. On both flats every one exits 0 and writes its file
   (SVG; PNG 1200 × 1015; 3D still 1200 × 800; DXF 2013, IFC, GLB v2, OBJ). On a plan that is
   not JSON, `check`, `draw` (SVG, `--png`, `--3d`) and `export` in all four formats each exit
   1 with nothing on standard output and one line on standard error,
   `grid: bad.json is not JSON: it ends before the JSON does.` Held by the "the sample flat",
   "grid export: writing into exports/", "grid draw --out" and "a refused plan" tests; the
   refused-plan cases there tried only SVG and DXF, so the new test "is refused the same way as
   a PNG, a 3D still and in every export format" covers the rest.
3. **A repeated or unknown option is refused by name.** Met.
   `grid check plan.json --floor a --floor b` exits 2 with
   `grid: --floor was given more than once. Give it once.`; `--flor x` exits 2 naming
   `"--flor"` and listing check's options. Held by "options: each command refuses what it does
   not take, by name" (including "names the unknown option first when several are wrong").
4. **End-to-end tests call the command; median under 0.5 s on the lab flat.** Met. Every test in
   `grid.e2e.test.ts` spawns `dist/grid.mjs` or the linked bins as a child process; none calls
   the library. Median of 21 runs of `grid check` from the clone through the linked bin:
   0.199 s on this machine with nine other sessions running (the earlier hand-over measured
   0.036 s quiet). Held by "speed", median of 7 under 500 ms (1,500 ms on Windows, QAR-4).

## What changed

- `packages/cli/src/command/__tests__/grid.e2e.test.ts`: two new tests, named above. No
  existing test's expected value changed.
- `reviews/CMD-4.md`: this note.

No code, docs or plan-format change, so no changelog fragment (`changes/CMD-4.md`) and no
convention number. The docs already describe the feature: the README's "Running Grid from a
copy of the repository" and `docs/commands.md` "Options and exit codes".

## Checks

On the branch with `main` at `ce236f72` merged (nothing newer on `main`): `npm run typecheck` 0,
`npm run lint` 0, the full suite (`vitest run --exclude '.claude/**' --maxWorkers=2`) 382 files,
6,204 passed and 4 skipped, and `npm run scoreboard` "Same as the stored figures" (turns 23 of
67, checks 25 of 42, mistakes 5 of 9). No count moves: the change adds tests only.

## For the owner

- I read "the lab's two-bedroom flat" as the bench flat in
  `scoreboard/data/bench-examples.json` and held it to byte-identity alongside the sample
  flat, rather than replacing the sample. Removing either test is safe.
- The "fresh clone" step is proved by CI's clean `npm ci && npm run build` and by the manual run
  above, not by a test that clones the repository: a test that runs `npm ci` would need the
  network or a warm cache and take seconds to minutes.
- Left as the first build made them, not part of this card: exported files are written with
  mode 0600 (Grid's one atomic writer), the IFC timestamp is the time of export, and no command
  reads a plan from standard input. CI runs on Ubuntu and Windows; this session ran macOS only.
