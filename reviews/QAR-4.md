# QAR-4: automatic tests on GitHub

## What changed

- **One workflow, extended.** `.github/workflows/ci.yml` already ran on pull requests and pushes
  to `main`, on `ubuntu-latest` and `windows-latest`, with `contents: read`. It now also:
  - pins `actions/checkout` and `actions/setup-node` to commits (`v4.4.0`, the release beside
    each in a comment), in `release.yml` too;
  - keeps no git credentials on the runner (`persist-credentials: false`);
  - gives the job a 60-minute limit and the scoreboard 15;
  - says why Windows is in the matrix (T-4's file names).

  The steps are unchanged: `npm ci`, then `npm run build`, `typecheck`, `lint`, `npm test`,
  `check:licenses`, `check:data` and `scoreboard`, each its own step, so a failure is a red
  check named by its step. Node 22 comes from `.nvmrc` (`22`), the same file local tools read.
  The matrix keeps `fail-fast: false`, so a Windows failure does not hide the Linux result.
- **Line endings.** `.gitattributes` adds `* text=auto eol=lf`, so a Windows checkout gets the
  same LF bytes as Linux. The tests that read docs, fixtures and sources line by line (`^…$`
  patterns, `split('\n')`) would otherwise read CRLF. The existing binary rules (the scoreboard
  data, the fonts) still win. Every file in the index is already LF, so nothing is renormalised.
- **Time limits.** `vitest.config.ts` keeps Vitest's 5 s per test on a person's computer, with
  30 s on CI and 60 s on Windows. The end-to-end tests start the built command as a new process
  many times, and a Windows runner starts one about three times slower. This is one setting in
  place of a timeout on each of about 30 tests.
- **Tests fixed for Windows:**
  - `packages/cli/src/sheet/__tests__/fonts.test.ts`: the face's name was cut at the last `/`.
    The fonts folder ends in `\` on Windows, so it is now split by either separator.
  - `packages/cli/src/command/__tests__/sheet.e2e.test.ts`: it expected
    `Wrote exports/…-client.pdf`. The command prints the path as the system writes it
    (`Project.shown`), so the expectation is now built with `join`, as the other tests do.
  - `scripts/__tests__/release.test.ts`: the test's packer called `tar` with absolute paths.
    GNU tar, which Git for Windows puts on the path, reads `C:` as a host name, so it now runs
    in the folder with relative names.
  - `packages/cli/src/command/__tests__/grid.e2e.test.ts`, "speed": the median `grid check`
    budget is 500 ms, and 1,500 ms on Windows, where a new Node process starts about three
    times slower.
- **New test.** `scripts/__tests__/ci-workflow.test.ts` (11 tests) holds the workflow to the
  card:
  - the triggers, the two systems and Node 22;
  - every gate in order, each a script of `package.json`;
  - a time limit, and `fail-fast: false`;
  - in every workflow: `contents: read` and no other permission, no `secrets.`, no
    `pull_request_target`, every action pinned to a 40-character commit with its release, and
    no stored credentials;
  - the LF rule.
- **Docs.** `RELEASING.md` has a new section, "The checks on GitHub": what runs, the security
  settings, the Windows notes, the commands to run locally, and branch protection.
  `CONTRIBUTING.md` points to it, and `CHANGELOG.md` has a line under "Unreleased".

### Changed expectations

- `grid.e2e.test.ts` "speed": 1,500 ms on Windows, not 500 ms. It still holds the Linux and
  macOS figure as before.
- `sheet.e2e.test.ts`: the printed path is matched by `join('exports', …)`, not by `exports/`.
- The default time limit is longer on CI and Windows (`vitest.config.ts`). Locally, nothing
  changes.
- `packages/cli/src/mcp/__tests__/reportProblem.test.ts` (CMD-13's): the S-11 draft's answer now
  starts with the path, not ends with it (main made the same change; the merge keeps main's). `grid_check`'s answer has grown on `main` past the 4,000
  characters a draft keeps, so the line holding the path was cut before it was cleared, and the
  test's `<path>` check failed. Nothing leaked: the path was simply not in the draft.

Nothing was removed.

## How it was checked

- GitHub can't run here, and nothing was pushed. Both workflows parse as YAML (PyYAML and the
  `js-yaml` already in `node_modules`), and `ci-workflow.test.ts` checks what they say.
  `actionlint` is not installed on this machine, and I did not download it.
- The workflow's own commands were run here, on macOS with Node 22: build, typecheck, lint,
  `check:licenses`, `check:data`, scoreboard and the full suite. The results are at the end of
  this file.
- I read every test file for what would fail only on Windows: separators, links, file modes,
  POSIX commands, illegal names, open-file locks and timeouts. Links to files are already
  skipped on Windows, folder links use junctions, the `0o600` checks are guarded, the `.cmd`
  shim runs through `shell`, and printed paths are mostly built with `join`. The four tests
  above were the ones that would fail.

## For the owner

1. **The first real run needs your push.** Nothing here has run on GitHub. When a branch is
   pushed and a pull request opened, the two `Typecheck, lint and test` checks run. Expect the
   Windows one to be the first to show what reading the code could not.
2. **Branch protection is yours to set.** A failing step makes the pull request's check red,
   but it stops a merge only if `main` requires it: Settings → Branches → a rule for `main` →
   "Require status checks to pass", with `Typecheck, lint and test (ubuntu-latest)` and
   `Typecheck, lint and test (windows-latest)`. I did not try to set it.
3. **Tests that might fail on Windows**, found by reading, not by running. Each is left as it
   is until a run shows it:
   - `packages/cli/src/fs/__tests__/projectFiles.test.ts`, the 255-byte file name: the
     runner's temporary folder plus 255 characters passes Windows' 260-character path limit.
     Node usually handles it; if not, shorten the name on Windows by the folder's length.
   - `packages/cli/src/__tests__/fileAccess.test.ts`, the esbuild metafile check: on Windows npm
     links the workspace packages as junctions, and if esbuild lists them by the link,
     `../rules/src/store/atomicWrite.ts` reads as `../../node_modules/@ongrid/rules/…`.
   - `packages/cli/src/draw/__tests__/scriptFonts.test.ts` and `sheet/__tests__/fonts.test.ts`,
     the CJK cases: Windows runners have CJK fonts, so these run there for the first time. They
     count on U+E000 and U+E001 drawing as the same missing-glyph box.
   - `packages/cli/src/distribution/__tests__/install.e2e.test.ts`: four `npx` runs through
     `cmd.exe` within 120 s; raise it if it is tight.
4. **The bundle's size budget.** Before the last merge of `main`, `grid.e2e.test.ts` "the built
   file … is one file" failed: the bundle was 459,241 bytes against 450,000. `main` has since
   raised the budget to 500,000 (the bundle is 463,249 bytes now), and it passes. I changed
   nothing there.
5. **The actions are pinned at v4.4.0**, the newest 4.x of each. v7 of both exist. Moving
   major versions is a separate change, and the pins say which release each commit is.
6. **Windows minutes.** Windows runners count double against private-repository minutes, and
   the full suite with the scoreboard takes several minutes per system.

## Results

On macOS, Node 22, at the tip after merging `main` (cae036c):

- `npm run build`, `npm run typecheck` and `npm run lint` pass.
- The affected tests all pass, 151 of them in 6 files: the workflow test, the four tests fixed
  for Windows, CMD-13's report test, and the bundle size test.

One step earlier, before that merge: `check:licenses`, `check:data` and the scoreboard passed,
and the scoreboard was the same as the stored figures. The full suite passed 4,563 of 4,565
tests, with two failures, both since cleared:

- the bundle size, which `main` then raised;
- CMD-13's `<path>` check, fixed on this branch and on `main` alike.
