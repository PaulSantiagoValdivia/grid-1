# Review: features built at the same time stop conflicting

For the owner. On 2026-11-22, ten features built in parallel spent hours re-merging. Most of
that time went to three places every feature edited: the top of both changelogs, the next free
convention number in the plan format, and `scoreboard/current.json`. This change makes the
repo work the way you agreed with the coordinating session. Nothing in Grid's commands, tools or
plan format changes, so it adds no changelog fragment of its own.

## What it changes

- **Changelog fragments, `changes/<ID>.md`.** Each change writes its line for people, its entry
  for agents and any new code's row of the contract's code table in a file of its own. It no
  longer edits `CHANGELOG.md` or the changelog for agents. `changes/README.md` has the form:
  - a first line `# <day>: <what changed> (<ID>)`, which becomes the entry's heading;
  - then any of `## For people`, `## For agents` and `## Codes`.
- **The release step** (`scripts/release.mjs`, with the pure functions in
  `scripts/release/fragments.mjs`). It reads every fragment before writing anything, and refuses
  one it cannot read, naming the file and the fault. Then it:
  - puts each line for people at the top of "Unreleased" and each entry for agents at the top of
    their changelog, newest first;
  - puts each code row in the contract's code table after the last code of its kind;
  - deletes the fragments.

  A dry run, or a failed gate, puts the fragments back with every other file.
- **Tests.**
  - The contract test (`packages/rules/src/result/__tests__/contract.test.ts`) counts the code
    rows waiting in `changes/` with the table's, so a new code can live in its fragment until
    the release.
  - `scripts/__tests__/release.test.ts` has 7 new tests. Among them, it reads every fragment in
    `changes/`, so a broken one fails `npm test` and not a release.
  - `packages/floorplan/src/types/__tests__/conventions.test.ts` fails when two conventions in
    the plan format's header share a number. It does not check order or gaps, because features
    may land in any order.
- **Docs.**
  - `AGENTS.md`: the fragment rule; the convention-number rule (the number the brief gives,
    else the next free one for a change made alone); and the scoreboard rule.
  - `scoreboard/README.md`, "Changing a count": a branch reports the counts it moves, and the
    person who merges runs the scoreboard on `main` and stores `current.json` in a commit of
    their own.
  - `RELEASING.md`, the `CHANGELOG.md` intro, `CONTRIBUTING.md` and the contract's opening
    paragraph now say the same.

The rules read the same for one person in one chat. Nothing here asks anyone to start sessions
or split work.

## done_when

- Typecheck, lint, the full suite and the scoreboard pass: see "Checks run".
- `RELEASING.md` describes the fragment step: "The two changelogs", step 2 of "The release
  step", and checklist lines 2 and 5.
- A dry run of the release step combined a sample fragment and published nothing. The sample,
  `changes/XYZ-1.md`, had a line for people, an entry for agents and a code row,
  `room/sample-only`. The run's copies beside the tarball showed:
  - the line under `## 0.1.0-preview.1 (2026-11-22)` in `CHANGELOG.md`;
  - the entry right under the release heading in the changelog for agents;
  - the row after `room/taped-differs`, the last `room/` code in the table.

  `release.json` said `"published": false`, and every file was back byte for byte afterwards,
  the deleted fragment among them. The sample and the tarball folder were then removed.

## Found on the way (not fixed here)

**A real release cannot pass its own tests gate.** `scripts/__tests__/release.test.ts` reads the
live `CHANGELOG.md` and `docs/result-contract.md` and expects them not yet cut. The release step
runs the gates after it has cut them, so inside a release 11 of those tests fail:

- 10 were already there before this change (QAR-10's);
- 1 is a new fragment test that follows the same pattern.

Run as an extra gate inside a dry run, the file failed and the step stopped and put everything
back. QAR-10's own dry run left the tests gate out, so this was never seen. A fix is for the
tests to read a copy of the changelogs taken before the cut, or fixed texts, not the live files.
That is a change to QAR-10's tests and is left as a follow-up.

## Merging

The coordinator holds this branch until CNT-18, CNT-14 and MSG-11 land, because all three
touch `CHANGELOG.md`, `docs/result-contract.md` and `AGENTS.md`.

- Entries a branch already wrote at the top of either changelog can stay there. The release
  keeps what is under "Unreleased" and in the changelog for agents, and adds the fragments
  above it.
- A code row can stay in the table or move to the fragment, but not both: the release refuses a
  code already in the table.
- After a merge, the person merging runs `npm run scoreboard` on `main` and stores the counts.

## Checks run

On this branch, cut from `main` at 8a0c839e:

- `npm run typecheck` and `npm run lint`: pass.
- `npm test` (after `npm run build`): 348 files, 5,816 tests passed, 4 skipped, in 551 s.
- `npm run scoreboard`: "Same as the stored figures." Rooms measured wrong 197, damage silent
  277, turns 21, mistakes 5, checks 20; guards 735 and 95. No count moves.
- The release step as a dry run, `0.1.0-preview.1`: the build, type check, lint, label, licence
  and data gates ran inside it. The full tests and the scoreboard were left out because they had
  just run, as QAR-10 did, and because of the finding above.
- Once more with `release.test.ts` as an extra gate, to show that finding: it failed as
  described.
- `scripts/__tests__/release.test.ts`: 31 tests. The contract test failed, as it should, when a
  fragment held a code the catalogue does not have.
