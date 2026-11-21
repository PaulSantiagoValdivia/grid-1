# VEW-7: `grid sheet`, the plan as a PDF for people

Agreed with the owner on 2026-11-21. Started from a PDF another agent made on top of Grid: it
used Grid for the geometry and its own code for the pages. This puts the pages in Grid, so the
figures, the label and the limits are the same every time.

## What it is

`grid sheet` makes an A3 landscape PDF of a plan, in one of two layouts:

- `client`: a presentation for the person the house is for.
- `check`: a working set for the person checking the plan.

The sheet arranges pages. It draws no plan part of its own and computes no figure of its own:
every picture and figure comes from code that already exists, so a part Grid learns to draw
reaches the sheet without a change to the sheet.

| On the sheet | Comes from |
|---|---|
| Floor drawings | `drawPlan`, as `grid draw` |
| Cover picture | `planStill`, as `grid draw --3d` |
| Area tables and area figures | `planAreas` (`src/quantities/areas.ts`), as `grid_quantities` |
| Plain-words summary | the facts `describe` uses (`src/describe/facts.ts`) |
| Findings | what `grid check` finds |
| Words of the client layout | `sheet.json`, written by the author |

Not on the sheet: furniture, landscape, stairs, or anything else the plan cannot hold. Furniture
may come later as its own roadmap item, once the plan schema holds it; the sheet then shows it
through `drawPlan` and `planStill`.

## Pages

Both layouts:

- A3 landscape. No other paper size for now.
- Two bundled fonts, embedded: Source Serif 4 for headings, Source Sans 3 for everything else.
- A top line (the name, then the page's subject), and a footer with the page number, the page
  count and the date.
- The footer holds "General guidance, not your local rules" on every page. `sheet.json` cannot
  remove or change it. No page says a plan complies or is approved.
- One drawing scale for every floor page of a sheet: the largest at which every floor fits its
  box. One floor is never drawn smaller than the others, and no floor is ever cut off.

### Client layout

- Cover:
  - the name, the headline and the intro paragraphs from `sheet.json`
  - the 3D picture of the whole building
  - four figures:
    - the gross area
    - the number of floors
    - the number of rooms whose use is `bedroom`
    - the floor-to-floor height, as the geometry derives it, or the range when the floors differ
- One page per floor, lowest first:
  - the drawing
  - the room-area table, with Grid's sentence on how the areas are measured
  - the floor's paragraphs from `sheet.json`
  - a short limits note from Grid: what the plan cannot show, for example a stair connection
- Without `sheet.json`, the name is the plan file's project name and the word spaces stay
  empty. Grid writes no words in the author's place.

### Check layout

- Summary page:
  - the plan in plain words, from `describe`'s facts
  - the number of findings
  - net, gross internal and gross external area
- One page per floor, lowest first:
  - the drawing with every room, door and window id (the `--ids` view, VEW-2)
  - the area table by room, with each room's use
  - every finding on that floor, by id
- Takes no words from `sheet.json`.

## `sheet.json`

It sits beside `plan.json` in the project.

```json
{
  "version": "1",
  "name": "Solace House",
  "headline": "A private retreat for one",
  "intro": ["A two-storey home for everyday comfort, work and hosting."],
  "floors": {
    "ground": ["A dedicated study sits beside the entry.", "Wide garden openings lead out."]
  }
}
```

- Every field is optional except `version`. An unknown field is refused by name.
- `floors` is keyed by the plan's floor ids. A key the plan does not have is refused, with the id
  quoted. A floor with no entry gets no paragraph.
- Every string follows the plan's text rule (MSG-9, `UNSAFE_TEXT`): no line break, control
  character, direction character or lone surrogate. One paragraph is one string.
- Limits:
  - `name`: `NAME_MAX` (120) characters
  - `headline`: 200 characters
  - each paragraph: 1,200 characters
  - `intro` and each floor: at most 3 paragraphs
- A refusal names the field and the limit, never the text.
- The words are the author's. Grid does not scan them for claims. The label stays on every
  page, and the check layout ignores the file.
- The schema lives in `packages/floorplan/src/types/sheet.ts` (pure). `packages/cli` reads the
  file through `projectFiles.ts`.

## The command

```
grid sheet [plan] --layout client|check [--sheet <file>] [--out <file>.pdf]
```

- `--layout` is required. Leaving it out is refused, with both layouts named.
- `--sheet` only works with `--layout client`. With `check` it is refused by name.
- In a project, with no plan named, it reads `plan.json`. With `--layout client` and no `--sheet`,
  it reads `sheet.json` beside the plan when there is one.
- `--out` must end in `.pdf`. Without it, the file goes to `exports/` beside the plan, named as
  `export` names files, ending `-client.pdf` or `-check.pdf`.
- A plan that does not validate is refused, as `draw` refuses one. With `--layout check`,
  findings do not stop the sheet: showing them is its job.
- Every option is strict, as for every command.
- `@napi-rs/canvas` stays optional. Without it, `sheet` fails with the one-line message a PNG
  gives (`CanvasMissing`).

## The tool

- `grid_sheet`, written once in the tool server, takes `plan` and `layout`, and writes into
  `exports/` as `grid_export` does (no `out`).
- It takes the words directly as a `sheet` object, so an agent can try wording without writing a
  file; without one, it reads `sheet.json` beside the plan. `sheet` with the check layout is
  refused. The tool server's argument kit
  gains an `object` kind for it: its JSON Schema and its check both come from the sheet schema.
- It returns the file's path, the page count and, for each page, what is on it. It never
  returns the PDF's bytes.
- It goes after `grid_export` in the fixed order: it writes a file and does not change the plan.
- The description starts "Use this when…" and says when not to use it (a single picture is
  `grid_view`; a file for another program is `grid_export`).
- The tool count goes from 13 to 14 in the README and `AGENTS.md`.

## Keeping up with the plan: the coverage table

`packages/cli/src/sheet/coverage.ts` holds one entry for each top-level part of `FloorPlan`,
saying what the sheet does with it:

| Part | Coverage |
|---|---|
| `walls`, `openings` | drawn |
| `rooms` | drawn and tabled |
| `floors` | one page each |
| `version`, `units` | not shown: they describe the file format |
| `referenceImage` | not shown: a tracing aid, not part of the building |

- The table is typed with `satisfies Record<keyof FloorPlan, Coverage>`, so a new part in the
  schema (furniture, say) fails the type check until someone decides what the sheet does with
  it.
- `coverage.test.ts` also compares the table's keys with `FloorPlanSchema.shape`, so `npm test`
  fails on the same gap.

## Code layout

| File | What it does |
|---|---|
| `packages/floorplan/src/types/sheet.ts` | the `sheet.json` schema and its limits |
| `packages/cli/src/sheet/pages.ts` | pure: plan, words and layout in; a list of pages out, each a list of blocks (text, table, picture box, footer) with every figure already looked up |
| `packages/cli/src/sheet/pdf.ts` | draws the page list with `PDFDocument` from `@napi-rs/canvas`, placing `drawPlan` and `planStill` pictures in their boxes |
| `packages/cli/src/sheet/fonts.ts` | registers the bundled fonts with `GlobalFonts` |
| `packages/cli/src/sheet/coverage.ts` | the coverage table |
| `packages/cli/src/command/sheet.ts` | the command |
| the tool server's tool file | `grid_sheet`, after `grid_export` |
| `packages/cli/fonts/` | the four font files (Regular and Semibold of each) and their OFL licence files |

The build copies `fonts/` into `dist/`. `listing.ts` adds `fonts/` to the package's `files`.
`NOTICE` names the fonts and their licence. The canvas reads the font files itself, so nothing
new imports `fs` and `fileAccess.test.ts` holds. Characters the fonts lack fall back to the
system's fonts.

## Tests

- `sheet.json`: each limit, an unknown field, an unknown floor id, unsafe characters, and that
  no refusal repeats the text.
- The page list, for both layouts, on the two-floor house fixture and the lab's plans:
  - every room is in its floor's table
  - the figures equal `planAreas`
  - the label is on every page
  - every finding is on its floor's page
  - nothing from `sheet.json` is in the check layout
  - every floor page is drawn at the same scale
- Coverage: the table's keys equal the schema's keys.
- End to end, on the built `grid.mjs`:
  - a PDF is written with the expected page count
  - the same plan gives the same page list twice
  - the option refusals
- Tool server: `tools.test.ts` (prefix, title, hint, examples, output schema, order), and the
  replay score holds.
- Install: `install.e2e.test.ts` finds the fonts in the packed tarball and makes a `grid_sheet`
  call.
- Scoreboard: no count moves; the sheet only reads.

After the type check, the tests and the scoreboard pass, a separate session tests the feature
without this conversation:
- makes both layouts from the lab's plans
- looks at the pages as pictures
- compares the PDF's text with `grid check` and the area figures
- tries to break `sheet.json`
- reports back

## Docs

- The README: the command, and the tool in the tool table.
- `AGENTS.md`: the layout lines for `src/sheet/`, and the rule that the sheet arranges pages and
  never draws geometry of its own.

## Left out for now

- Paper sizes other than A3, and portrait pages.
- Choosing which pages to print.
- Logos, colours and brand settings.
- Furniture, landscape and stairs (see above).
