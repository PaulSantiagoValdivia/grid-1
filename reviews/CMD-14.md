# CMD-14: keep the Grid site in step with the repository

Branch `claude/cmd-14-370044`, cut from main at ce236f72. The work is in the site's own repository,
the site's own repository, on its branch `cmd-14-site-in-step`,
in one pull request for the owner's review:
its pull request. Nothing in Grid changes
but this note: no code, no docs, no changelog fragment (the change people notice is on the site).
Nothing was merged, deployed or published.

## What changed on the site

Two commits on `cmd-14-site-in-step`: `fix: say only what is true of Grid's repository (CMD-14)`
and `ci: check the site against Grid's main branch (CMD-14)`.

**Paths and links.** `packages/core` is `packages/floorplan` in Grid now: the package row, the
footer link and the quick-start prompt name it. The footer's licence link pointed at
`LICENSE-PENDING.md`, which is gone; it links `LICENSE`.

**Status and licence.** Grid is Apache-2.0 (CMD-1), so the line that said the licence had not
been chosen is dropped, and the licence is linked from Status and Links. Publishing still waits on
CMD-8, so the page still says nothing is published and there is no release to install. The
hard-coded "2,044 passing tests" is dropped: it went stale with every merge, and the card brings
counts back once they come from the capability record (CMD-11). "Four packages" and "four formats"
stay, and the check holds both to the checkout.

**The quick-start prompt.** It named `packages/core/src/types/floorplan.ts` and `floor-plan.json`,
and the page said the `grid` command was not built. The prompt now asks the agent to read
`AGENTS.md` and `docs/rooms-first.md`, run `npm ci` and `npm run build`, then `npx --no grid init`,
`grid write` from rooms text, `grid check` and `grid export --format dxf`. I ran that flow on a
fresh build in a scratch folder: init, write, check (labelled, one finding on the test flat) and a
DXF export all worked. The install note now says `npm ci` and `npm run build`, with
`npx --no grid` to run the command, as the README says.

**No claim of correctness; the label.** The headline said "drawing it right" (and the synopsis
"get it drawn right"); both now say "drawn". Every part of the page that mentions checks carries
"General guidance, not your local rules": the head's description, Synopsis, Usage, Workflow and
Packages.

**Wording from Grid's README.** The title ("Floor plans for AI agents"), the description and the
synopsis follow the README's "floor-plan toolkit built for AI agents"; the cli row says it is the
`grid` command and the tool server an agent uses; the floorplan row says "drawing checks", as
AGENTS.md calls them.

**Layout.** The key column of the workflow and package rows is 20ch, so `packages/floorplan` does
not run into its text; `styles.css?v=4`. Checked in a browser at desktop width.

## The check

`scripts/check-grid.mjs <grid checkout>` in the site, Node's own modules only (the site keeps no
build step). It fails when:

1. a link into `ongrid-arch/grid` or a Grid path in the page's text (a token under one of the
   checkout's top-level folders, or a file name with an extension) is missing from the checkout;
   files the person writes, such as `plan.json`, are listed apart;
2. the licence (root `package.json`), the number of packages, the export formats (read from the
   `grid export` row of `docs/commands.md`) or the "nothing is published" line (true only while
   every `package.json` is private) no longer match it;
3. a sentence says a plan is correct, complies or is approved, or the head, a section or the footer
   mentions checks without the label.

`.github/workflows/check.yml` runs it against Grid's `main` on every pull request, on push to the
site's `main` and once a day, since Grid's main moves on its own. Results:

- against this worktree's main (ce236f72): passes, 8 paths and links;
- against GitHub's `main` (3bb2236e, behind local main by 14 commits): passes;
- against the page before the PR: fails with 13 findings (`LICENSE-PENDING.md`, `floor-plan.json`,
  `packages/core`, `packages/core/src/types/floorplan.ts` missing; the licence not named and said
  pending; no `packages/floorplan` link; "drawing it right"; the label missing in five parts).

The workflow ran on the PR against Grid's `main` on GitHub and passed
(its CI run).

## Done when

1. Every repository path and link resolves against Grid's main, by a script in the site's own
   check: done.
2. Status and licence lines match the repository: done. Generated from the capability record:
   waits on CMD-11.
3. No sentence says a plan is correct, complies or is approved; the label wherever checks are
   mentioned: done, and the check holds both.

## Left for later

- **CMD-11.** Generate the status, the counts (tests among them) and "what Grid does not do" from
  the capability record, and have `check-grid.mjs` read it instead of `package.json` and
  `docs/commands.md`. Each is its own pull request on the site.
- **CMD-8.** When Grid is published, the check fails on "nothing is published" until the page's
  Installation and Status say how to install it; the install lines should then come from
  `installText()` like the README's.

## For the owner

- Review and merge its pull request, and
  publish the site yourself; this card deployed nothing.
- The title changes from "Floor plans and plan checks for architects" to "Floor plans for AI
  agents", after Grid's README (anyone can use it, not only architects). Revert that line if you
  want the old audience on the page.
- The headline changes from "drawing it right" to "getting it drawn", so no sentence implies a plan
  is correct. If you want a stronger headline, the check will refuse "right", "correct",
  "complies" and "approved" about a plan.
- The test count is gone from Status and Links until CMD-11 generates it. Say if you want a
  number back sooner; it would go stale with each merge.
- The new `check` workflow runs on a schedule against Grid's public `main`; it will start failing
  when Grid renames a path the site names, which is the point. Turn the schedule off if you would
  rather see that only on the site's own pull requests.
- Compatibility still lists Kimi beside Claude Code, Codex and Cursor; Grid's install lines name
  Claude Code, Codex, VS Code, Copilot CLI, Cursor and Claude's desktop app. Left as is (the page
  means any agent that reads files and runs commands); say if it should follow the install list.
