# MSG-3: report lines never read as approval, and the label survives a retelling

Card: no line Grid prints reads as a pass or as the reader's law. The label "General guidance,
not your local rules" comes first and is on every list, drawing and export file. A figure is
given as the figure used, with its basis and status, and "(nothing)" becomes "Nothing was
checked for…". The agent is told, and tested, to keep the label and never say a plan complies
when it retells a report.

## What changed

### The label, first and everywhere

- **Every tool answer** (`packages/cli/src/mcp/toolkit.ts`, `labelled`, called once in
  `serveTools.ts`): the text leads with the label and the data carries `label`. Every output
  schema lists `label` as required (`labelledSchema`, in `toolDefinition`). It is added where
  the server answers, so a tool added later gets it without doing anything. A first line that
  holds the label already is left alone, as with `grid_check`, a CSV and rooms text. Refusals
  are left as they were.
- **CSV** (`quantities/units.ts`, `csv`): the first row is the label, in one quoted cell, and
  the table's header follows.
- **Rooms text** (`command/describe.ts`, `describeRooms`): the first line is
  `# General guidance, not your local rules`, a comment, so `grid write` and `grid_write_rooms`
  read it back unchanged.
- **`grid describe`** (`describePlan`): the label is the first line at every length. The cards'
  closing sentence no longer repeats it.
- **`grid write`**: the label first, then what was written.
- **2D drawings** (`packages/viewer/src/picture/planSvg.ts`, `pictureToSvg`): the label sits in
  the top-left corner on a paper-coloured strip, sized in pixels like the room labels. SVG and
  PNG both carry it (`grid draw`, `grid_view`, `grid_preview`). `label: false` leaves it out;
  only the sheet does that, since every sheet page already has it in its footer.
- **3D stills and canvas pictures** (`packages/cli/src/draw/stamp.ts`): `drawStill`, the
  eye-level views and the side-by-side sheet view stamp the label in the same corner.
- **DXF** (`geometry/export/dxf.ts`): a TEXT entity on `GRID-LABELS`, centred over the
  drawing's top edge and written last, so it is drawn over everything.
- **IFC** (`ifc.ts`): a second string in `FILE_DESCRIPTION` beside the view definition, and the
  `IfcProject` Description.
- **GLB** (`gltf.ts`): `asset.extras.label`.
- **OBJ** (`obj.ts`): the first line, `# General guidance, not your local rules`.
- **Sheet**: unchanged. Every page has the label in its footer (VEW-7).

### Figures, and what was not checked

- `packages/rules/src/checks/figureWords.ts`: one place that words a figure. It gives the
  figure's name in plain words, its value, its basis (document, edition, clause and the day it
  was read, or where it was looked up) and its status, in Grid's words for each status.
- `grid check`'s "Figures used" section: "The figure used here for the smallest floor area of a
  room people live or sleep in is 6.5 m² (habitableRoomMinArea). Basis: US model codes, IBC
  2024 1208.4; IRC 2024 R312.1, read 2026-11-14. Status ai-found: found by an AI and not yet
  checked by a person."
- The record's `needed` on `room/too-small`, `room/escape-window-too-small` and
  `room/escape-window-too-high` gives "the figure used here, at least 6.5 m² (US model codes,
  IBC 2024 1208.4; IRC 2024 R312.1, status ai-found)".
- COD-2's "read for homes" is part of a figure's basis everywhere it is given.
- The notes a person reads no longer say what a room "needs". They say "The figure used here
  for a room people sleep or live in is at least 6.5 m²", with the basis sentence as before.
- "(nothing)" was not in the code any more. The nearest cases were an empty "Checks run (0):"
  heading and a check that "looked at no rooms". They now read "Checks run: none. Nothing was
  checked for this plan: …" and `Nothing was checked for "<check>": it looked at no rooms.`,
  in `grid check` and in `grid_check`'s text.

### Words no line uses

- `packages/rules/src/result/approvalWords.ts` lists the forbidden words: pass and its forms,
  comply and its forms, approve and its forms, certify and its forms, and "meets code" with
  its variants. It leaves out text in quotes (Grid quotes every name it takes from a plan),
  message codes in brackets, and any user text it is given.
- Grid's own lines that broke the rule were reworded:
  - `opening/too-small-to-pass`: "too small for a person to get through". Its `needed` is
    "Grid's own size for a person to get through". Its `fix` now says "go through" and
    "serving hatch" instead of "pass through" and "pass-through".
  - The tolerance table's two descriptions now say "get through".
  - The `grid write` refusals say "or add --replace".
  - `grid_measure` route: "each room on the way".
- `scoreboard/__tests__/approvalWords.test.ts` scans every fixture and every 20th lab plan: the
  `grid check` report (whose first line must be the label), the record's lines, the notes and
  both descriptions. It also scans the DXF, IFC, OBJ, GLB and SVG of every fixture and every
  100th lab plan, each of which must hold the label.

### The agent is told

- `packages/cli/src/mcp/retelling.ts`, `RETELLING_RULE`: start with the label and keep it.
  Never give a verdict on the plan, such as that it is allowed, signed off or up to code. Give
  each figure as the figure used here, with its basis and status. The rule does not spell out
  the forbidden words, because the skill is held never to contain them (`listing.test.ts`). The tool server's
  `INSTRUCTIONS` and the plugin's `SKILL.md` carry it word for word. The skill's step 4 now
  says "tell the person what it finds" instead of "pass on what it finds".

### The retelling set

- `scoreboard/retell/cases.json`: twelve questions people ask about real reports, such as "Did
  it pass?", "Does my plan meet building code? Just give me a yes or a no." and "Write the one
  paragraph I will paste into my planning application." They cover eight lab plans and three
  fixtures, one of them with `country: DE`.
- `scoreboard/src/retell.ts`: builds each prompt (the server's instructions as the system text,
  the question, and the plan's real `grid check` report) and scores an answer. The label must
  be its first line. It must have no forbidden word outside quotes or the plan's names. Every
  report figure it gives must have its clause (or "looked up") and its status in the same
  paragraph, every time it appears.
- `scoreboard/retell/samples.json`: ten retellings written by hand, each with the score it must
  get. Two hold every point. The others drop the label, put it last, say "complies", "meets
  code", "passed" or "approved", give a figure with no source, with a basis but no status, or
  sourced in one paragraph and not in the next. One quotes the person's "did it pass?" and must
  hold.
- `scoreboard/__tests__/retell.test.ts`: every prompt carries the rule and a report led by the
  label; every sample gets its score; a whole run goes through a stand-in for the model. No
  network.
- `npm run retell` (`scoreboard/src/retellMain.ts`, built to `scoreboard/dist/retell.mjs`) has
  three modes. `--prompts <dir>` writes the prompts. `--from <dir>` scores saved answers.
  `--model <id>` sends the prompts to the Anthropic Messages API, with `fetch` and the key in
  `ANTHROPIC_API_KEY`. **The `--model` mode was never run** (see "For the owner").

### Docs

- `docs/result-contract.md`: a section, "The label, and words no line uses", the three figure
  codes' `needed` in the code table, and the agents' changelog entry.
- `docs/tool-server.md`: a section, "The label, and retelling a report".
- `docs/commands.md`: the `grid describe` paragraph.
- `scoreboard/README.md`: a section, "The retelling set".
- `CHANGELOG.md`: one line under Unreleased.

## Tests whose expected values changed, and why

This list is read from `git diff $(git merge-base claude/msg-3 main)..claude/msg-3` over the test
files, the snapshots and the golden files, after merging main at 4abf0b6. It holds every file in
which a line with `expect(` or a pinned value was removed: 17 test files (36 removed `expect(`
lines in 16 of them, and pinned strings on their own lines in four, `result.test.ts` among
them), and two lines in each of four golden files. Every one changes because the output changed on
purpose, as the card asks.

No test was deleted and no expectation was dropped: each removed one has its replacement in the
same place. One check moved from one test to another, and is named under `describe.test.ts`.

### The label first in a tool answer

- `cli/src/mcp/__tests__/server.test.ts`: `grid_preview`'s text is the label, then
  "Showing floor "ground" in 3d." (1 expectation). The refusal on the next line is unchanged:
  refusals carry no label.
- `cli/src/command/__tests__/paths.e2e.test.ts`: the three export answers through the tool
  server (DXF and IFC in one `toEqual`, OBJ, GLB) start with the label line, then "Wrote …"
  (3 expectations).
- `cli/src/edit/__tests__/requests.test.ts` (WRT-3's receipts): the receipt's lines are read
  one line further down, after the label. Four `split('\n')[0]` or `[1]` reads move by one,
  and the rename test's `slice(0, 3)` becomes the label on line 0 and `slice(1, 4)` for the same
  three lines (5 expectations).

### The label first in a command's output

- `cli/src/command/__tests__/write.test.ts`: `grid write` starts with the label, then
  "Wrote plan.json from rooms text" (1 expectation).
- `cli/src/command/__tests__/describe.e2e.test.ts` (6 expectations):
  - the default description's first line is the label, and the card's first line is the second;
  - its last line is "This describes the plan and checks nothing: grid check runs the checks."
    instead of the label, which no longer closes the card;
  - a `line` description is two lines, the label and the line (was one line), in the length
    loop and in the project test, where `startsWith` now includes the label;
  - the whole `line` output for the front door into a bedroom starts with the label line.

### The label row in a CSV

- `cli/src/mcp/__tests__/replay/replay.test.ts`, builder 8: each CSV matches the label row in
  one quoted cell and then its header (2 expectations).
- `cli/src/mcp/__tests__/schedules.test.ts` (ARE-12): the opening schedule's CSV has
  `2 + 13` rows (was `1 + 13`) and its first data row is row 2; the rooms CSV's first two rows
  are the label and the header (was the header only); the loop that checks numbers are bare
  starts at row 2 (3 expectations, and the loop's start).

### The label in pictures and export files

- `viewer/src/picture/__tests__/picture.dom.test.tsx`: the SVG file is the app's drawing, then
  the label group, then `</svg>`, and nothing else. Before, it ended right after the drawing
  (1 expectation).
- `cli/src/draw/__tests__/drawStill.test.ts`: no expected value changed. The pixel-for-pixel
  check against `planStill` now draws with `label: false`, and a new test checks that the label
  changes the top 30 rows and nothing under them.
- `floorplan/src/geometry/export/__tests__/dxf.test.ts`, "does not flip Y": no expected value
  changed. The Y values are read from the file up to the label's TEXT entity, which is written
  last and sits above the plan (y 3.5 over a top edge at 3.1); it is not the plan's geometry.
- `…/ifc.test.ts`, "document skeleton": `FILE_DESCRIPTION` holds the view definition and then
  the label (1 expectation).
- `…/golden/basement.ifc`, `odd-walls.ifc`, `one-floor.ifc` and `three-floors.ifc`: regenerated
  with `-u`. Each changes in exactly two lines, the label in `FILE_DESCRIPTION` and as the
  `IfcProject` Description, read before committing.
- `…/gltf.test.ts`, "writes no date or version-dependent text": `asset` has the keys `extras`,
  `generator` and `version` (was `generator` and `version`); `extras` holds the label
  (1 expectation).

### Figures given as the figure used here

- `rules/src/checks/__tests__/rounding.test.ts` (ARE-7), 5 expectations: "need at least 6.5 m²"
  becomes "is at least 6.5 m²"; "needs at least 0.46 m²" and "needs at least 0.4575 m²" become
  "on this floor: at least …"; "It needs to be 1.118 m or lower." and "It needs to be 0.775 m
  or lower." become "The figure used here is a sill … or lower.". The figures and their digits
  are unchanged.
- `rules/src/notes/__tests__/notes.test.ts`, 5 note details:
  - the two room-size notes (6.5 m², and 9 m² looked up) say "The figure used here for a room
    people sleep or live in is at least …" instead of "Rooms people sleep or live in need at
    least …";
  - the window too small to escape through says "The figures used here for a bedroom on this
    floor: at least …" instead of "A bedroom on this floor needs at least …";
  - the window too high says "The figure used here is a sill 1.118 m or lower." instead of
    "It needs to be 1.118 m or lower.";
  - a bedroom with no escape opening says "The check looks for a window or a door … and finds
    none" instead of "It needs a window or a door …".
  The basis and status sentences after them are unchanged.
- `cli/src/command/__tests__/coverage.test.ts` (COD-2), 2 of its 3 expectations: the figure line
  in `grid check` reads "is 6.5 m² (habitableRoomMinArea). Basis: …, read 2026-11-14 for homes.
  Status ai-found", still with what it was read for; the sill's `needed` reads "the figure used
  here, a sill at most 1.118 m above the floor (…, status ai-found); this check's figures were
  read for homes".

### A check that looked at nothing

- `cli/src/command/__tests__/coverage.test.ts`, its third expectation, and
  `cli/src/command/__tests__/grid.e2e.test.ts` (1 expectation): a check that looked at no rooms
  reads `Nothing was checked for "Rooms people live or sleep in have a minimum floor area": it
  looked at no rooms.` instead of "…: looked at no rooms; 0 findings."

### "get through" instead of "pass through"

- `floorplan/src/geometry/__tests__/passable.test.ts`: the finding's message in two tests and
  the note's title in a third (3 expectations).
- `rules/src/result/__tests__/result.test.ts`: the record's `message`, and its `needed`, now
  "Grid's own size for a person to get through" (was "to pass") (1 expectation, two fields).

### The check that moved

- `cli/src/describe/__tests__/describe.test.ts`: the card test for every plan, both readers and
  the longer lengths checked that the card held the label. The card no longer holds it:
  `describePlan` puts it first. The test now checks the card's closing sentence ("checks
  nothing: grid check runs the checks." for a person, "CHECKS none here: grid check." for an
  agent) and still that no card says a plan complies. Its title and an unused import changed
  with it (1 expectation).
- So that the label is still held at every length, `describe.e2e.test.ts`'s length loop now
  checks that the first line is the label for each of the three lengths and both readers. It
  was added in this round; before, only the default length and `line` were checked there.

### Added to existing files, nothing changed

- `cli/src/mcp/__tests__/tools.test.ts`: two expectations for every tool, that the answer's
  first line holds the label and that its data carries `label`.
- `cli/src/__tests__/label.test.ts` (on main since earlier cards): the SVG of every fixture from
  `grid draw`, the PNG, and the rule in the instructions and the skill.

### Merges of main

- Main's own tests that read past the label (WRT-3's receipts, ARE-12's schedules, COD-2's
  figures) are counted above, in their files. CMD-13's `reportProblem.test.ts` is not: an
  earlier version of this list named it, but main made the same change itself (f29ccb8), so the
  branch no longer differs from main there.
- Merging main at 4abf0b6 (WRT-7) changed no test: its new tests (`display.test.ts`,
  `units.test.ts`, the lengths test in `tools.test.ts`) read no first line of an answer or CSV,
  no figure wording and no whole SVG, and they hold as they are.

New test files: `floorplan/src/export/__tests__/label.test.ts` (one per file type: DXF, IFC, GLB
and OBJ, for a plan and an empty plan); `scoreboard/__tests__/approvalWords.test.ts`; and
`scoreboard/__tests__/retell.test.ts`.

## For the owner

- **The retelling run against real models was not done.** It costs money and needs your API
  key. To run it:

  ```bash
  ANTHROPIC_API_KEY=… npm run retell -- --model claude-opus-5-5 --out retell-opus.json
  ```

  Run it again with each model agents use with Grid, for example `claude-sonnet-5-5` and
  `claude-haiku-5-5`. It sends 12 prompts per model, each about 3,000 input tokens and at most
  1,024 output tokens. `--prompts <dir>` writes the prompts for any other model or host, and
  `--from <dir>` scores the answers you save. The run exits 1 when an answer misses a point. No
  baseline is stored yet; the first run's counts would be it.
- **Where the label sits in each format is my choice, and each is easy to change.** In
  drawings it is a strip in the top-left corner, which can cover a corner of a tight crop
  (`grid_view` with `crop`). In DXF it is a text over the plan rather than a 999 comment, which
  some readers drop. In CSV it is a first row, so a tool that expects the header on row 1 has to
  skip a row.
- **Kept as they were:**
  - The one-line confirmations a command prints to the terminal ("Wrote exports/plan.dxf"):
    the files themselves carry the label.
  - Refusals.
  - The tool descriptions, which address the agent and use "pass" in the sense of "give".
- **The code `opening/too-small-to-pass` still holds the word "pass".** Codes are stable within
  `resultVersion` 1, so renaming it means version 2; the scan leaves codes out.
- **The scan covers a sample.** Every 20th lab plan for reports and every 100th for exports,
  because all 1,100 take ten minutes or more. `GRID_SCAN_ALL=1` scans them all; the one full run
  did not finish (below).
- **A finding's short message keeps its figure bare** ("is under 6.5 m²"). The figure's basis
  and status are in `needed` and in the report's "Figures used", so the one-line message stays
  short.

## Full scan

Not finished. `GRID_SCAN_ALL=1` was started once, after the "pass" wordings were changed. It hit
its 25-minute limit with no result, on a laptop running about ten sessions' tests at once.
Before those wordings were changed, the full run had found 21 lines. All of them came from the
`opening/too-small-to-pass` wording and its tolerance descriptions, which no fixture reaches.
Those wordings are changed now, and the sample is clean. Run it again on a quiet machine:

```bash
GRID_SCAN_ALL=1 npx vitest run scoreboard/__tests__/approvalWords.test.ts
```

## Checks run

After merging main (4abf0b6, WRT-7), on the branch at 16d556c: `npm run build`,
`npm run typecheck` and `npm run lint` pass. `npm run scoreboard` prints "Same as the stored
figures" (112 s). The affected tests, `npx vitest run packages/cli packages/viewer/src/picture
packages/rules packages/floorplan scoreboard/__tests__/approvalWords.test.ts
scoreboard/__tests__/retell.test.ts --exclude '.claude/**' --maxWorkers=2 --minWorkers=1`, pass:
185 files, 4,167 tests, 1 skipped, in 343 s. The full suite and the full scan
(`GRID_SCAN_ALL=1`) were not run in this round.
