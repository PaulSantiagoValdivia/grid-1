# QAR-10 review: a release process

For the owner. Nothing was published, pushed, tagged or run on GitHub, and no token or secret
was made. Every `package.json` stays `"private": true`, and so does the packed one.

## What it adds

- **`RELEASING.md`**: the one written way to release. The version rule, the two changelogs,
  provenance, the release step, the checklist, what waits on CMD-8, and a table where each of
  your yeses is recorded before the step it allows.
- **`CHANGELOG.md`**, for people, with an "Unreleased" section that says what the first release
  will hold. The changelog for agents stays where MSG-1 put it, the last section of
  `docs/result-contract.md`; its opening paragraph now says how a release marks it.
- **The release step**, `npm run release -- <version> [--dry-run]` (`scripts/release.mjs`,
  with `scripts/release/prepare.mjs` and `scripts/release/gates.mjs`). One run:
  1. checks the version against the rule and that every package holds the same version;
  2. writes the version into the five `package.json` files and the lock file, turns
     "Unreleased" into `## <version> (<day>)` with the result and plan format versions it
     carries, and puts `### Release <version> (<day>): result version <n>` above the entries
     for agents written since the last release (or says there were none);
  3. runs the gates in order on what it wrote: build, type check, lint, the label test, the
     licence check, the data check, the full tests, the scoreboard gate. The first that fails
     stops it by name, and every file it wrote is put back;
  4. packs with the existing `packages/cli/pack.mjs` into `dist/release/<version>/pack/` (git
     ignores `dist/`), and refuses a tarball with the wrong version, not private, or without
     its provenance settings;
  5. writes `release.json`: the commit and whether the tree was clean, the Node version, the
     tarball's sha512 integrity, the gates passed, `published: false`, and the publish command
     that waits on you. Then it stops.
  `--dry-run` puts back every file it wrote and leaves copies of both changelogs beside the
  tarball. Without it the tree must be clean and the changes stay to be committed.
- **The version rule.** The breaking number (the major, or the minor while the major is 0)
  must rise when `RESULT_VERSION` or the plan format's `version` has risen since the last
  release; the step reads both from the code and refuses otherwise, naming the version to use.
  The plan format is versioned apart from the packages (CNT-1). A preview, `-preview.N`, gets
  the npm tag `preview`.
- **Provenance settings.** The packed manifest now holds `publishConfig: { access: "public",
  provenance: true }` (`listing.ts`), beside the `repository` npm compares the signed record
  with.
- **The label test**, `packages/cli/src/__tests__/label.test.ts`, the gate named "label": the
  label reads "General guidance, not your local rules" in the result record (eight fixture
  plans, with and without a country, and refused plans), the rules report, `grid check` run as
  a person runs it (text and `--json`), `grid_check`, the package README and the plugin skill,
  and no line of any of them reads as approval.
- **The release workflow**, `.github/workflows/release.yml`, "Release (dry run)": by hand only
  (`workflow_dispatch`, with the version), `contents: read`, no `id-token`, no secret, no
  publish step. It runs `node scripts/release.mjs "$VERSION" --dry-run` and prints
  `release.json`. The version comes in through the environment, never into the script.
- Pointers in `AGENTS.md` (Rules) and `CONTRIBUTING.md`.

## done_when

1. **A dry run of the release workflow on a branch produces a packed tarball with provenance
   settings and stops before publishing.** The workflow runs the release step as a dry run, so
   locally the same command is the dry run: see "Checks run" for what it printed. The workflow
   itself was not run (no push, no GitHub run). `scripts/__tests__/release.test.ts` holds the
   workflow to it: started by hand only, runs the step with `--dry-run`, no publish, push or
   tag command, no `continue-on-error`, no `if:`, no token.
2. **The workflow fails if the scoreboard gate, the label test or the licence check fails.**
   Each is a gate of the release step, which exits 1 on the first that fails. Tested for each
   of the three on a copy of the files: the step stops at that gate, runs none after it, packs
   nothing, and leaves every file as it was. A failed step fails the job.
3. **CHANGELOG.md and the agent changelog are updated by the same release step.** Step 2
   writes both, before the gates, which run on them (tested); the dry run leaves both as they
   were and copies of each beside the tarball.

## What you must decide before a real release

1. **Where Grid lives.** `listing.ts` names `github.com/ongrid-arch/grid`, as the git remote
   does. npm provenance needs that repository to be the one the workflow runs in, and public.
   If the home is to be elsewhere, change `REPOSITORY` and `MCP_NAME` before the first publish.
2. **The npm side** (CMD-8): an npm account or organisation for `ongrid`, and trusted
   publishing for this repository's release workflow, so no token is stored. `RELEASING.md`
   lists the publish job to add then (on a `v*` tag, in a protected environment you approve,
   with `id-token: write`) and taking `private` out of the packed manifest.
3. **The first version.** QAR-1 asks for a version marked as a preview; the rule gives
   `0.1.0-preview.1` under the tag `preview`. Say which.
4. **The scoreboard gate's bar.** The gate today is QAR-1's: no count worse than
   `scoreboard/current.json`. QAR-1's wave-one bar is stricter (0 rooms measured wrong on the
   lab plans with a referee figure, under 5% of the damage set passing in silence), and today's
   figures do not meet it (`current.json`: 197 rooms wrong, 386 of 3,000 silent). Say whether
   the first publish waits on that bar; if so, it becomes a gate of its own.
5. **What else a release ships.** The step packs and checks the npm tarball, which is what npm
   provenance covers. `pack.mjs` also writes `server.json`, the marketplace folder and a `.mcpb`
   for the packing computer only. Publishing the registry entry, the plugin and a `.mcpb` per
   platform are separate outward steps (CMD-8), each needing its own yes.
6. **Whether the dry run keeps its tarball.** The workflow does not upload it as a run artefact,
   since on a public repository anyone could download it. Say if you want it kept.
7. **The wording of the first release's notes**, under "Unreleased" in `CHANGELOG.md`, which I
   wrote from the README.

## Limits

- The workflow was not run on GitHub; the tests read it as text, and the local dry run runs
  the same command.
- One version for every package, though only `ongrid` is packed; the `@ongrid/` packages are
  bundled into it and the scope is provisional.
- The step reads `RESULT_VERSION` and the plan format's version from their source lines; a
  test fails if either line moves out of reach.
- `release.json`'s commit is the one checked out. On a dry run with changes not committed it
  says so (`workingTreeClean: false`); a real cut refuses a tree with changes.

## Checks run

After merging `main` (at `fc78ff7`):

- `npm run build`: exit 0.
- `npm run typecheck`: exit 0 (every workspace, `scripts`, `scoreboard`).
- `npm run lint`: exit 0, no warnings.
- `npm run check:licenses`: "Checked 363 licences in package-lock.json: none is GPL, LGPL,
  AGPL, MPL, EPL."
- Full suite: `timeout 1500 npx vitest run --exclude '.claude/**' --maxWorkers=2` ran no
  tests. vitest 2.1.9 refuses it ("options.minThreads and options.maxThreads must not
  conflict") on a 12-core machine, so `--minWorkers=1` was added, as the release step's
  `--max-workers` now does. Then: 201 files, 4,288 tests, 4,287 passed in 1,312 s. The one
  failure was `packages/cli/src/mcp/__tests__/cropView.test.ts`, "boxes on the picture",
  timing out at 5 s with ten sessions on the machine. Run alone, it passes (3 of 3, 2 s). It is
  VEW-6's test; nothing here touches it.
- `npm run scoreboard`: "Same as the stored figures." Rooms measured wrong 197, damage silent
  386, turns 15, mistakes 2, checks 5; guards 727 and 95. 199 s.
- The release step as a dry run, `0.1.0-preview.1`, on this tree. The build, type check, lint,
  label, licence and data gates ran inside the step; the full tests and the scoreboard were
  left out because they had just run, as above. It cut both changelogs and every version, packed
  `dist/release/0.1.0-preview.1/pack/ongrid-0.1.0-preview.1.tgz` (git ignores it) with
  `publishConfig.provenance: true` and `private: true`, wrote `release.json` (commit, integrity,
  `published: false`, publish command with `--tag preview`), printed "Stopped before
  publishing", and left every tracked file as it was.
- `scripts/__tests__/release.test.ts`: 24 tests. `label.test.ts`: 36 tests. `listing.test.ts`:
  25 tests.
