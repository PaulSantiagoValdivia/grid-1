# QAR-1: the scoreboard

The scoreboard was built on 2026-11-20 (commits `72e2945` T-9 safety tests, `aae3c4e` data and
scan, `b324c7e` runner, `feb0e03` CI) and has been on `main` since. This change checks each
"done when" line against `main` as it is (`ce236f72`), adds what proves the one line CI did not
hold, and removes a stale copy of the counts.

## The "done when" lines, checked

1. **`npm run scoreboard` runs the lab plans, the damage sets rebuilt from their seeds and the
   442 sound plans against stored referee numbers and prints the five counts.** Already met.
   - `npm run scoreboard` on this branch: 1,121 lab plans and 2,300 generated plans against
     `data/referee.json.gz`, 3,000 damaged plans, 442 sound plans (400 with their true room
     areas); prints the five counts and the two guards beside the baseline and the stored
     figures, and "Plans with no referee figure: 10 (listed in scoreboard/README.md)". Exit 0,
     "Same as the stored figures."
   - Held by `scoreboard/__tests__/scoreboard.test.ts`: "rebuilds the 42 sound bases exactly as
     the lab built them" (sha256), "rebuilds every one of the 3,000 damaged plans from the seed",
     "has the 442 sound plans, 400 of them with their true room areas", "has the lab's 67 turns,
     42 checks and 9 mistakes".
   - The 10 plans with no referee figure (4 over 1,200 rooms, V-11; 6 broken on purpose) are
     listed in `scoreboard/README.md`, "Plans with no referee figure".
   - The ready cases T-9 left are `packages/floorplan/src/__tests__/safety.test.ts` and
     `packages/cli/src/export/__tests__/projectExports.test.ts` (the export writer refusing names and links that leave the exports folder); `safety.test.ts` passes, 7 tests.

2. **It runs in CI within 10 minutes, its first run on 76caeb8 is stored as the baseline, and a
   count that gets worse fails the build.** Met in part; now met.
   - Baseline: `scoreboard/baseline.json`, commit `76caeb8`, printed in the "baseline" column.
   - Worse fails: "npm run scoreboard > passes on the stored figures and fails when one count is
     worse than stored" runs the built runner against doctored figures (`--against`) and expects
     exit 1; "calls a count worse when it moves the wrong way, and only then".
   - CI: `.github/workflows/ci.yml` runs `npm run scoreboard` on Ubuntu and Windows. **Gap:**
     QAR-4 had raised that step's limit from 10 to 15 minutes, so CI did not hold the card's 10.
     It is 10 again, and `scripts/__tests__/ci-workflow.test.ts` now fails when the scoreboard
     step has no limit of its own or one over 10 minutes.
   - Time: 124 s on this Mac with ten sessions running (areas 3.3 s, damage and sound plans
     120.7 s). The first run took 7.5 s; the damage and sound plans now run every check added
     since. Windows CI has not run yet (nothing is pushed), so its time is not measured.

3. **The data added to the repository is under about 25 MB and a CI scan finds no paths from
   anyone's machine and no personal data.** Already met.
   - `du -sh scoreboard/data`: 1.7 MB. "the stored data > stays under 25 MB" holds it.
   - `npm run check:data`: "no machine paths and no personal data", a CI step before the
     scoreboard; `scripts/__tests__/check-data.test.ts` (18 tests) holds the scan, compressed
     files included.

## What changed

- `.github/workflows/ci.yml`: the scoreboard step's limit is 10 minutes, as the card asks.
- `scripts/__tests__/ci-workflow.test.ts`: new test, "gives the scoreboard 10 minutes at most
  (QAR-1)". No expected value of an existing test changed.
- `scoreboard/README.md`, "The figures": the "Current (after SHT-2)" column is gone. It showed
  386 silent, 15 turns, 2 mistakes, 5 checks and 724 rooms not measured while `current.json`
  holds 277, 23, 5, 25 and 735, because the merges since SHT-2 store their counts in
  `current.json` and not here. The table keeps the baseline and the lab's figures and says the
  figures now are `current.json`, as the runner prints them.

No changelog fragment: nothing people use or a tool answers changes. No convention number.

## Counts

None moved: 197, 277, 23, 5, 25; guards 735 and 95. Same as `scoreboard/current.json`.

## Check results

Run on this branch after merging `main` at `739066d0`, on a Mac with ten sessions running (load
average 200 to 300).

- `npm run typecheck`, `npm run lint`: pass. `npm run scoreboard`: pass, 124 s, same as stored.
- The scoreboard, data scan, CI workflow and T-9 safety tests: 55 of 55 pass.
- The full suite (`timeout 1500 npx vitest run --exclude '.claude/**' --maxWorkers=2`) did not
  finish inside 25 minutes under that load, so it was run in three parts. Every file passed
  except two that check time on the clock:
  - `grid preview (VEW-4)` (two tests): failed in the full run, 5 of 5 pass on their own.
  - `diff-size.test.ts`, "diffs 1,000 entities ... well inside a second": took 55 s at load
    about 300 and failed again alone at load 200. It is a wall-clock bound in
    `packages/floorplan`, which this branch does not touch.
- After the merge: `grid.e2e.test.ts` (CMD-4's tests) 98 of 98 and `ci-workflow.test.ts` 12 of
  12 pass.

## For the owner

- **10 minutes, not 15, for the scoreboard step in CI.** The card says 10; QAR-4 gave it 15
  with no reason recorded. If Windows CI runs it slower than 10 minutes, the red step is the
  card's line failing, and the choice is to make the run faster (the damage set is where the
  time goes) or to accept a longer limit and change the card. Reverting is one line and the
  test's figure.
- **The README no longer copies the current counts.** It points at `current.json` instead, so
  the merge step has one place to store them. If you want the figures readable on GitHub
  without running anything, the alternative is to have `--write-current` rewrite that table
  too.
- Open from the first build and still open: mistakes 8 and 9 are our reading (the lab does not
  list the nine); W-3's ~223 "not mistakes" are inside the silent count.

General guidance, not your local rules.
