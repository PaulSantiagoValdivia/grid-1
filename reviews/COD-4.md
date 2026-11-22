# COD-4: ceiling height listed as not checked until it is

Card: add ceiling height, and "which walls carry load is not known", to the report's list of
what the checks never look at, wherever that list appears. No figure and no ceiling-height
check yet: that comes later, with a figure a named person has confirmed.

Most of this was already on main. Commit 79ec6b0 (2026-11-20) added both lines and their
tests, and MSG-2 left them as they were. This session found one place that still lacked them
(`grid_check`), filled it, and wrote the changelogs and this review.

## Where the list lives

There is one list, made of two constant lists. Nothing was refactored.

- `packages/floorplan/src/geometry/rules/catalogue.ts`, `LIMITS`: the plan checks' four lines.
  The fourth is "Which walls carry load is not known: the plan does not record it, so nothing
  here looks at structure". It sits in the core because the plan file records no structure, so
  the core's own report (`checkPlanSanity`) says so too.
- `packages/rules/src/checks/catalogue.ts`, `FIGURE_LIMITS`: the figure checks' four lines. The
  fourth is "Ceiling height is not checked, in any room or under a sloping roof". A
  ceiling-height check, when it comes, should remove this line.
- The full report's `limits` is `[...LIMITS, ...FIGURE_LIMITS]` (`rules/src/checks/check.ts`),
  so each line appears once. `inspectPlan` puts it on the record (`GridResult.limits`).

## Where the list is shown

- `grid check` prints it as "What these checks never look at (8)" (already, from 79ec6b0).
- The check sheet (`grid sheet --layout check`) puts it in the summary page's notes (already,
  through `whole.report.limits`). The client sheet's note says what is not drawn, not what is
  not checked, so it is unchanged.
- **`grid_check` (new here).** It returned neither `limits` nor any text about what is never
  looked at, though its description says the answer says what was not checked. It now returns
  `limits` (in its output schema too) and ends its text with "Never looked at, whatever the plan
  (8):" and the eight lines (`packages/cli/src/mcp/readTools.ts`).

## Tests

Added in 79ec6b0:

- `floorplan/src/geometry/__tests__/rules-catalogue.test.ts`: the core report says it does not
  know which walls carry load.
- `rules/src/checks/__tests__/rules-catalogue.test.ts`: the full report lists both lines, once
  each.
- `cli/src/command/__tests__/grid.e2e.test.ts`: the built `grid check` prints both under "What
  these checks never look at".

Added here:

- `cli/src/command/__tests__/oneList.test.ts`: `grid_check` returns the record's `limits`, both
  lines are in it, and its text lists them.
- `cli/src/sheet/__tests__/pages.test.ts`: the check sheet's summary notes hold both lines.

No test was changed or removed.

## Docs

- `CHANGELOG.md`, Unreleased: one line.
- `docs/result-contract.md`, changelog for agents: the two new `limits` lines and `grid_check`'s
  new `limits` field and text.
