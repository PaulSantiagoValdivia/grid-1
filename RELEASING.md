# Releasing Grid

This is the one way Grid is released (QAR-10). One step cuts a version, writes both changelogs,
runs every gate, packs the package with its provenance settings and stops. Publishing is a
separate step, and it waits on the owner's yes.

**Nothing has been published.** Every outward step (a published package, a registry entry, a
tag pushed, a new account, money, or anything the public can see) needs the owner's yes, one
step at a time, recorded at the end of this file before it happens (CMD-8). Until then every
`package.json` keeps `"private": true`, and a test checks it.

## Versions

All the packages carry one version, written by the release step: the workspace, `@ongrid/floorplan`,
`@ongrid/rules`, `@ongrid/viewer` and `ongrid`. A version is three numbers, `MAJOR.MINOR.PATCH`,
with an optional preview part, as in `0.1.0-preview.1`.

The numbers keep the promise of the result contract ([docs/result-contract.md](docs/result-contract.md),
"What may change"): tool names, codes, field names and kinds keep their meaning within a major
version.

- **The breaking number** is the major, or the minor while the major is 0. Raise it when a code
  or a field changes meaning or is taken away, when a tool is renamed or taken away, or when
  a plan file that was read is now refused.
- **The minor** (the patch while the major is 0): a new tool, code, field, kind, command or
  option.
- **The patch**: a fix, or a better wording. Agents match on `code`, never on a message.
- **A preview** (`-preview.N`) is published under the npm tag `preview`, never `latest`.

Two versions are kept apart from the packages', and the release records both:

- **The result version**, `resultVersion` in every record (`RESULT_VERSION` in
  `packages/rules/src/result/types.ts`). It rises only when a field changes meaning or is taken
  away.
- **The plan format version**, `version` in every plan file (the plan schema in
  `packages/floorplan/src/types/floorplan.ts`, CNT-1). It rises only when a plan written before
  would be read differently.

When either has risen since the last release, the release step refuses any version that does
not raise the breaking number, and names the one to use.

## The two changelogs

- [CHANGELOG.md](CHANGELOG.md) is for people. The release step refuses to cut a version while
  "Unreleased" is empty, after the fragments are in it.
- The changelog for agents is the last section of [docs/result-contract.md](docs/result-contract.md),
  each entry under a heading with the day, what changed and the feature, such as
  `### 2026-11-22: a first layout from the brief (BRF-6)`.

Neither is edited by a change. Each change writes its own fragment, `changes/<ID>.md`
([changes/README.md](changes/README.md) has the form): its line for people, its entry for
agents and the code table's row for any new code. Features built at the same time then never
edit the same lines. The release step combines the fragments first: each line for people goes
at the top of "Unreleased", each entry for agents at the top of their changelog under the
fragment's heading, newest first, and each code row into the contract's code table after the
last code of its kind. Then it deletes the fragments. A fragment it cannot read stops the
release before anything is written, naming the file and the fault; `npm test` reads every
fragment the same way, so that is found before a release.

Then it updates both in the same run: "Unreleased" becomes `## <version> (<day>)`,
which says the result and plan format versions it carries, and the changelog for agents gets
`### Release <version> (<day>): result version <n>` above the entries written since the last
release (or a line saying there were none).

## Provenance

A user can tell a package came from this repository in two ways.

- **npm provenance.** The packed `package.json` holds `publishConfig: { "access": "public",
  "provenance": true }` and `repository` pointing at this repository (written by
  `packages/cli/src/distribution/listing.ts`). Published from the release workflow on GitHub,
  npm signs a statement naming the repository, the workflow run and the commit, and shows it on
  the package's page; `npm audit signatures` checks it. npm signs only from a CI run, so the
  package is never published from a laptop.
- **`release.json`.** The release step writes it beside the tarball: the commit it was built
  from and whether the working tree was clean, the Node version, the tarball's `sha512`
  integrity (the figure npm records), the gates passed, and the publish command that waits.

## The release step

```bash
npm run release -- 0.1.0 --dry-run
```

`scripts/release.mjs <version>` does, in order:

1. checks the version against the rule above, and that every package carries the same one;
2. combines the fragments in `changes/` into both changelogs and deletes them, updates both
   changelogs for the release, and writes the version into every `package.json` and the lock
   file;
3. runs the gates in `scripts/release/gates.mjs`, in order: build, type check, lint, the label
   test (`packages/cli/src/__tests__/label.test.ts`), the licence check, the data check, the full
   tests and the scoreboard gate. The first that fails stops the release by name, and every
   file the release wrote is put back;
4. packs the package with `packages/cli/pack.mjs` into `dist/release/<version>/pack/`, which git
   ignores, and checks that the tarball holds the version, is still private, and has its
   provenance settings;
5. writes `dist/release/<version>/release.json`, and stops. Nothing is published, pushed or
   tagged.

With `--dry-run` it also puts back every file it wrote, the fragments it deleted among them, and
leaves copies of both changelogs beside the tarball to read, so you can check how the fragments
were combined. Without it, the working tree must be clean, and the changes stay
for you to commit. `--date YYYY-MM-DD` sets the release's day (default today, UTC);
`--out <folder>` packs elsewhere; `--max-workers <n>` runs the tests on fewer cores.

The release workflow, [.github/workflows/release.yml](.github/workflows/release.yml), runs the
same step as a dry run on GitHub. It starts only by hand (Actions, "Release (dry run)", Run
workflow, on any branch, with the version), asks for no token and has no publish step.

## The checks on GitHub

Every pull request, and every push to `main`, runs one workflow (QAR-4),
[.github/workflows/ci.yml](.github/workflows/ci.yml), on Linux and on Windows, on Node 22 (the
version in `.nvmrc`). It installs with `npm ci` and runs, each as its own step:
`npm run build`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run check:licenses`,
`npm run check:data` and `npm run scoreboard`. Any step that fails turns the pull request's check
red; the two systems run apart, so a failure on one still lets the other finish.

The workflow can read the repository and nothing else (`contents: read`). It uses no secret,
keeps no git credentials on the runner, and pins every action to a commit, with its release in a
comment beside it. Every text file is checked out with LF line endings, Windows too
(`.gitattributes`), so the tests read the same bytes everywhere. `scripts/__tests__/ci-workflow.test.ts`
holds the workflow to all of this.

Windows is where the file-name rules are real (T-4: `CON`, `NUL`, a name ending in a dot, `\`
between folders); tests that need a symbolic link to a file, or Unix file modes, are skipped
there and say why.

To run what the workflow runs, on your own computer:

```bash
npm ci
npm run build
npm run typecheck
npm run lint
npm test
npm run check:licenses
npm run check:data
npm run scoreboard
```

A red check only stops a merge when the repository requires it: that is a branch protection
setting on GitHub (require the two `Typecheck, lint and test` checks to pass before merging into
`main`), and it is the owner's to set.

## The checklist

Each release, in order. Tick each line in the release's issue or pull request.

1. [ ] The owner's yes for this release is recorded below: the day, the version and the steps
   it covers.
2. [ ] The fragments in `changes/`, with "Unreleased" in CHANGELOG.md, say what changed for
   people, and there is an entry for agents for each change to what a tool answers. The dry
   run's copies of both changelogs show them combined.
3. [ ] `npm run release -- <version> --dry-run` passes on a clean checkout of `main`: every gate,
   the scoreboard gate, the label test and the licence check among them.
4. [ ] The release workflow's dry run passes on `main` for the same version.
5. [ ] `npm run release -- <version>` on a clean checkout of `main`; read the diff, the deleted
   fragments among it; commit it as `chore(release): <version>`.
6. [ ] Tag the commit `v<version>`. Pushing the commit and the tag is an outward step: only with
   the owner's yes for it.
7. [ ] Publish from the release workflow only, once the publish job exists (below): an outward
   step, only with the owner's yes for it.
8. [ ] Check the package's page shows the provenance and the version, and `npm audit signatures`
   passes in an empty folder that installed it.

## When publishing is approved (CMD-8)

These wait on the owner, and none is done yet:

- remove `"private": true` from the packed manifest (`packageManifest` in `listing.ts`) and the
  test that holds it, for `ongrid` only;
- set up npm for the package (an account or organisation, and trusted publishing for this
  repository's release workflow, so no token is stored);
- add a publish job to the release workflow that runs after the dry-run job on a `v*` tag only,
  in a protected GitHub environment that needs the owner's approval, with `permissions:
  id-token: write` and `contents: read`, and runs the `publishing.command` that
  `release.json` names (`npm publish <tarball> --provenance --access public --tag <tag>`).

## The owner's yes

One row per outward step, written before the step happens. A step with no row does not happen.

| Day | Version | Step | Recorded by |
|---|---|---|---|
