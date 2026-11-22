# COD-2: home figures, and saying so wherever one was used

What changed, every test whose expected value changed and why, and what is for the owner.

## What changed

Grid cannot yet run a figure only in the kind of building it was read for: a plan does not say
what kind of building it is, and its room uses are too coarse (that is CNT-5, not built here).
So this step does the other half of the card: every note and every pass that used a figure says
which kind of building the figure was read for.

- **The figures record it.** Each figure's provenance (`packages/rules/src/checks/figures.ts`)
  gains `readFor`, beside its document, edition, clause, day read and status. Every figure today
  was read for homes, so every one is `homes`. Every applied figure carries it, a looked-up one
  too (the lookup asks for the figure for homes, `lookup/prompt.ts`).
- **The notes say it.** Each note on a plan that used a figure (`notes/notes.ts`) ends: "This
  check's figures were read for homes (houses and flats people live in); the plan does not say
  what kind of building it is, so Grid applied them as they are." A bedroom with no escape
  opening at all, which compares no number but is held to the escape rule, says it too.
- **The result lines say it.** `needed` on `room/too-small`, `room/no-escape-opening`,
  `room/escape-window-too-small` and `room/escape-window-too-high` ends "; this check's figures
  were read for homes (houses and flats people live in)". `grid check` prints `needed` already;
  `grid_check` now prints `Needed:` on those lines (and only those), and the check sheet's
  finding lines add the sentence.
- **The passes say it (CH-2).** A figure check that looked at something carries `readFor` in
  the record's `coverage`. `grid check` prints it after that check's count of findings, and
  `grid_check` on that check's line: the café's seating, which no finding names, now reads
  "Rooms people live or sleep in have a minimum floor area: looked at 1 room; 0 findings; its
  figures were read for homes (houses and flats people live in)." `grid check`'s "Figures used"
  adds "read for homes …" to each figure.
- A check that looked at nothing used no figure and says nothing of one.
- No message code was added or changed in meaning; `resultVersion` stays. The contract's
  changelog for agents, its `figures` and `coverage` fields, `CHANGELOG.md` and the rules
  package's README say it.

How the done-when reads:

| Done when | Where it is held |
|---|---|
| The café's 48.63 m² seating is no longer measured against a home's figure without a line (CH-2) | `packages/cli/src/command/__tests__/coverage.test.ts`, "the café's seating … is never passed without a line": lab plan `C/scenarios/cafe.json` |
| Every note or pass that used a figure says which kind of building the figure was read for | The same file, "the hotel: each of its twelve sill notes …" (lab plan `AU1/scenarios/MS-14/hotel-ground-fixed-glazing.json`: 12 `room/escape-window-too-high`, every one says it, and no line that used no figure does); `notes.test.ts` for every note kind |

The card's hotel (Room 301 to 312 on the third floor) no longer gets those notes since MSG-2:
its bedrooms are above the escape figures' storeys and are named as not checked. The ground
floor version of the lab's hotel still gets twelve, so the test uses it.

## Tests whose expected value changed

- `packages/rules/src/checks/__tests__/rules-figures.test.ts` (two `resolveFigure` cases),
  `rules-lookup-figures.test.ts` (three) and `rules-room-size.test.ts` (one): each applied figure
  they compare whole now has `readFor: 'homes'`.
- `packages/rules/src/notes/__tests__/notes.test.ts` (five notes: room size, room size with a
  looked-up figure, no escape opening, window too small, sill too high): each detail ends with
  the sentence above (`READ_FOR` in the test).

No snapshot and no scoreboard figure changed.

## For the owner

Choices that were yours, each taken the reversible way:

1. **The figures are still applied to every plan.** The card's gate needs the plan's building
   type (CNT-5). Until then a café or a hotel is still measured against home figures, and only
   told so. Turning them off for every plan that is not plainly a home would hide real findings
   in homes whose rooms are named loosely.
2. **The wording.** "Homes (houses and flats people live in)" is Grid's own description, not a
   code's definition of a dwelling. The escape figures in the IBC also reach some non-home
   sleeping rooms; the figures here were read for homes, and that is what is said. One table,
   `BUILDING_KIND_TEXT` in `figures.ts`, holds it.
3. **Where the sentence goes in the record.** It is appended to `needed`, not a new field on a
   line and not the line's `message`, so a line's one wording stays the finding's wording (MSG-1).
   The kind is also in `figures[].readFor` and `coverage[].readFor` as data.
4. **`grid_check` prints `Needed:`** only on lines that used a figure, so its other lines read as
   before.
5. **A bedroom with no escape opening** compares no number, but is held to the escape rule, so it
   says the rule was read for homes too.

## Checks run

- Before merging `main`: `npm run build`, `npm run typecheck`, `npm run lint` clean; full suite
  (two workers) 4,380 of 4,380 passed; `npm run scoreboard` the same as the stored figures.
- After merging `main` at 89f1f15 (MSG-6, HND-9; the contract's changelog kept every section
  from both sides): build, typecheck and lint clean; the affected tests (rules, coverage, the
  `grid` end-to-end tests, the tool server, the sheet) 712 of 712 passed.
