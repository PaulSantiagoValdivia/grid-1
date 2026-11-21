# VEW-7 `grid sheet` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `grid sheet --layout client|check` writes an A3 landscape PDF of a plan, and the
`grid_sheet` tool does the same for an agent.

**Architecture:** `pages.ts` is pure: it turns a loaded plan, the optional words of `sheet.json`
and a layout into a list of pages. Every figure on a page comes from existing code (`planAreas`,
`floorElevations`, `planFacts`, `checkPlan`). `pdf.ts` lays that list out on A3 pages with
`PDFDocument` from `@napi-rs/canvas`, drawing the floor pictures with `drawPlan` and the cover
with `drawStill`. A coverage table, checked by the type checker and a test, says what the sheet
does with each top-level part of the plan.

**Tech Stack:** TypeScript (strict), Node 22, zod, vitest, `@napi-rs/canvas` 1.1.0 (MIT,
already a dependency), esbuild. Fonts: Source Serif 4 and Source Sans 3 (SIL Open Font
License 1.1).

**Spec:** `docs/superpowers/specs/2026-11-21-grid-sheet-design.md`. Read it before starting.

## Global Constraints

- Node 22, npm, TypeScript in strict mode. English in code, comments and docs.
- Conventional commits ending with the line
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit on `main`. Never push.
- Commit subjects carry `(VEW-7)`.
- `packages/floorplan` stays pure: no React, no Three.js, no DOM, no network, no `fs`.
- Nothing in `packages/cli` imports `fs` except `src/fs/projectFiles.ts`.
  `src/__tests__/fileAccess.test.ts` enforces it.
- Every page holds the label "General guidance, not your local rules", from
  `GENERAL_GUIDANCE_LABEL` in `@ongrid/rules`. No text Grid writes says a plan complies, passes
  or is approved.
- A refusal names the field and the limit, never the text it was given.
- Names and ids Grid prints in its own sentences go through `quoted()` (MSG-9).
- Printed figures go through `areaText`, `metresText` or `sumText` from
  `@ongrid/floorplan/geometry/rounding` (ARE-7). No `toFixed` in new code.
- No dependency under GPL, LGPL, AGPL, MPL or EPL. The fonts are files, not npm packages, and
  their licence is the SIL OFL 1.1.
- Paper: A3 landscape, 1191 × 842 PDF points.
- Text limits of `sheet.json`: `name` 120 characters (`NAME_MAX`), `headline` 200, each
  paragraph 1,200, at most 3 paragraphs in `intro` and in each floor.
- Before calling the work done: `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run scoreboard` and `npm run check:licenses`, all from the repository root.

## Files

| File | Responsibility |
|---|---|
| `packages/floorplan/src/types/sheet.ts` (new) | `SheetWordsSchema`, its limits and `sheetWordsProblem()` |
| `packages/floorplan/package.json` | export `./types/sheet` |
| `packages/cli/src/sheet/coverage.ts` (new) | what the sheet does with each part of the plan |
| `packages/cli/src/sheet/pages.ts` (new) | pure: plan + words + layout → `Sheet` |
| `packages/cli/src/sheet/fonts.ts` (new) | registers the bundled fonts |
| `packages/cli/src/sheet/pdf.ts` (new) | draws a `Sheet` into PDF bytes |
| `packages/cli/src/sheet/sheetFile.ts` (new) | reads `sheet.json` from the project, and writes the PDF into `exports/` |
| `packages/cli/src/command/sheet.ts` (new) | options and checks of `grid sheet` |
| `packages/cli/src/command/main.ts` | registers `sheet` |
| `packages/cli/src/command/export.ts` | `exportBaseOf()` split out of `exportNameOf()` |
| `packages/cli/src/mcp/toolkit.ts` | the `object` argument kind |
| `packages/cli/src/mcp/writeTools.ts` | `grid_sheet`, after `grid_export`; `grid_export`'s description |
| `packages/cli/fonts/` (new) | four font files and `OFL.txt` |
| `packages/cli/build.mjs`, `packages/cli/pack.mjs` | copy `fonts/` into `dist/`, the npm package and the `.mcpb` |
| `packages/cli/src/distribution/listing.ts` | `fonts/` in the package's `files` |
| `NOTICE`, `README.md`, `AGENTS.md` | fonts, the command, the tool, the layout lines |

---

### Task 1: The `sheet.json` schema

**Files:**
- Create: `packages/floorplan/src/types/sheet.ts`
- Modify: `packages/floorplan/package.json` (the `exports` map)
- Test: `packages/floorplan/src/types/__tests__/sheet.test.ts`

**Interfaces:**
- Consumes: `NAME_MAX` and `UNSAFE_TEXT` from `packages/floorplan/src/types/planText.ts`.
- Produces:
  ```ts
  export const SHEET_HEADLINE_MAX = 200
  export const SHEET_PARAGRAPH_MAX = 1200
  export const SHEET_PARAGRAPHS_MAX = 3
  export const SheetWordsSchema // a strict zod object of the fields below
  export interface SheetWords {
    readonly version: '1'
    readonly name?: string
    readonly headline?: string
    readonly intro?: readonly string[]
    readonly floors?: Readonly<Record<string, readonly string[]>>
  }
  /** Null when the words are fine; else one line naming the field and the limit. */
  export function sheetWordsProblem(raw: unknown, floorIds: readonly string[]): string | null
  export function parseSheetWords(raw: unknown, floorIds: readonly string[]): SheetWords // throws SheetWordsRefused
  export class SheetWordsRefused extends Error {}
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// packages/floorplan/src/types/__tests__/sheet.test.ts
import { describe, expect, it } from 'vitest'
import { parseSheetWords, sheetWordsProblem, SHEET_PARAGRAPH_MAX, SheetWordsRefused } from '../sheet'

const floors = ['ground', 'first']
const ok = { version: '1', name: 'Solace House', headline: 'A retreat', intro: ['One.'], floors: { ground: ['Two.'] } }

describe('sheet.json (VEW-7)', () => {
  it('takes good words', () => {
    expect(sheetWordsProblem(ok, floors)).toBeNull()
    expect(parseSheetWords(ok, floors).floors?.['ground']).toEqual(['Two.'])
  })
  it('takes only a version', () => {
    expect(sheetWordsProblem({ version: '1' }, floors)).toBeNull()
  })
  it('refuses a missing or other version', () => {
    expect(sheetWordsProblem({}, floors)).toMatch(/version/)
    expect(sheetWordsProblem({ version: '2' }, floors)).toMatch(/version/)
  })
  it('refuses an unknown field by name', () => {
    expect(sheetWordsProblem({ version: '1', logo: 'x' }, floors)).toMatch(/"logo"/)
  })
  it('refuses a floor the plan does not have, quoting its id', () => {
    expect(sheetWordsProblem({ version: '1', floors: { roof: ['x'] } }, floors)).toMatch(/"roof"/)
  })
  it('refuses a long paragraph, naming the limit and not the text', () => {
    const long = 'secret '.repeat(SHEET_PARAGRAPH_MAX)
    const problem = sheetWordsProblem({ version: '1', intro: [long] }, floors)!
    expect(problem).toMatch(/intro\[0\]/)
    expect(problem).toMatch(String(SHEET_PARAGRAPH_MAX))
    expect(problem).not.toMatch(/secret/)
  })
  it('refuses a fourth paragraph', () => {
    expect(sheetWordsProblem({ version: '1', intro: ['a', 'b', 'c', 'd'] }, floors)).toMatch(/intro.*3/)
  })
  it('refuses line breaks, control and direction characters', () => {
    for (const bad of ['a\nb', 'a\u0007b', 'a‮b']) {
      expect(sheetWordsProblem({ version: '1', headline: bad }, floors)).toMatch(/headline/)
    }
  })
  it('refuses an empty name', () => {
    expect(sheetWordsProblem({ version: '1', name: '' }, floors)).toMatch(/name/)
  })
  it('throws SheetWordsRefused from parseSheetWords', () => {
    expect(() => parseSheetWords({ version: '1', logo: 1 }, floors)).toThrow(SheetWordsRefused)
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run packages/floorplan/src/types/__tests__/sheet.test.ts`
Expected: FAIL, "Cannot find module '../sheet'".

- [ ] **Step 3: Write the schema**

```ts
// packages/floorplan/src/types/sheet.ts
/**
 * VEW-7: the words of a client sheet (`sheet.json`), written by the author, never by Grid.
 *
 * Every string follows the plan's own text rule (MSG-9): no line break, control character,
 * direction character or lone surrogate. One paragraph is one string. A refusal names the
 * field and the limit, never the text.
 */
import { z } from 'zod'
import { NAME_MAX, UNSAFE_TEXT } from './planText'

export const SHEET_HEADLINE_MAX = 200
export const SHEET_PARAGRAPH_MAX = 1200
export const SHEET_PARAGRAPHS_MAX = 3

export interface SheetWords {
  readonly version: '1'
  readonly name?: string
  readonly headline?: string
  readonly intro?: readonly string[]
  readonly floors?: Readonly<Record<string, readonly string[]>>
}

export class SheetWordsRefused extends Error {
  override readonly name = 'SheetWordsRefused'
}

const quoted = (text: string): string => JSON.stringify(text)

function textProblem(where: string, value: unknown, max: number): string | null {
  if (typeof value !== 'string') return `${where} must be text`
  if (value.length === 0) return `${where} is empty`
  if (value.length > max) return `${where} is longer than ${max} characters`
  if (UNSAFE_TEXT.test(value)) return `${where} holds a line break, a control character or a direction character`
  return null
}

function paragraphsProblem(where: string, value: unknown): string | null {
  if (!Array.isArray(value)) return `${where} must be a list of paragraphs`
  if (value.length > SHEET_PARAGRAPHS_MAX) return `${where} has more than ${SHEET_PARAGRAPHS_MAX} paragraphs`
  for (let i = 0; i < value.length; i++) {
    const problem = textProblem(`${where}[${i}]`, value[i], SHEET_PARAGRAPH_MAX)
    if (problem) return problem
  }
  return null
}

const FIELDS = new Set(['version', 'name', 'headline', 'intro', 'floors'])
/** A key Grid may print back: an id-shaped key is quoted, anything else is not repeated. */
const ID_SHAPED = /^[A-Za-z0-9_.-]{1,64}$/

export function sheetWordsProblem(raw: unknown, floorIds: readonly string[]): string | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'it must be a JSON object'
  const given = raw as Record<string, unknown>
  for (const key of Object.keys(given)) {
    if (!FIELDS.has(key)) return ID_SHAPED.test(key) ? `${quoted(key)} is not a field of a sheet` : 'it holds a field a sheet does not have'
  }
  if (given['version'] !== '1') return 'version must be "1"'
  if ('name' in given) { const p = textProblem('name', given['name'], NAME_MAX); if (p) return p }
  if ('headline' in given) { const p = textProblem('headline', given['headline'], SHEET_HEADLINE_MAX); if (p) return p }
  if ('intro' in given) { const p = paragraphsProblem('intro', given['intro']); if (p) return p }
  if ('floors' in given) {
    const floors = given['floors']
    if (typeof floors !== 'object' || floors === null || Array.isArray(floors)) return 'floors must be an object keyed by floor id'
    for (const [id, paragraphs] of Object.entries(floors)) {
      if (!floorIds.includes(id)) return ID_SHAPED.test(id) ? `floors names ${quoted(id)}, which is not a floor of the plan` : 'floors names a floor the plan does not have'
      const p = paragraphsProblem(`floors.${id}`, paragraphs)
      if (p) return p
    }
  }
  return null
}

export const SheetWordsSchema = z.object({
  version: z.literal('1'),
  name: z.string().optional(),
  headline: z.string().optional(),
  intro: z.array(z.string()).optional(),
  floors: z.record(z.array(z.string())).optional(),
}).strict()

export function parseSheetWords(raw: unknown, floorIds: readonly string[]): SheetWords {
  const problem = sheetWordsProblem(raw, floorIds)
  if (problem !== null) throw new SheetWordsRefused(problem)
  return SheetWordsSchema.parse(raw) as SheetWords
}
```

Add to the `exports` map in `packages/floorplan/package.json`, after `./types/floorplan`:

```json
    "./types/sheet": "./src/types/sheet.ts",
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run packages/floorplan/src/types/__tests__/sheet.test.ts`
Expected: PASS, 10 tests.
Then run `npx vitest run packages/floorplan/src/geometry/__tests__/tolerances.test.ts`. It
must still pass. The limits are text limits in `types/`, like `NAME_MAX` in `planText.ts`, not
geometry tolerances. If the test flags `200` or `1200` anyway, see how it treats `planText.ts`'s
limits and treat `sheet.ts` the same way. Do not move text limits into the tolerance table.

- [ ] **Step 5: Commit**

```bash
git add packages/floorplan/src/types/sheet.ts packages/floorplan/src/types/__tests__/sheet.test.ts packages/floorplan/package.json
git commit -m "feat(floorplan): the words of a client sheet, as a schema (VEW-7)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The coverage table

**Files:**
- Create: `packages/cli/src/sheet/coverage.ts`
- Test: `packages/cli/src/sheet/__tests__/coverage.test.ts`

**Interfaces:**
- Consumes: `FloorPlan`, `FloorPlanSchema` from `@ongrid/floorplan/types/floorplan`.
- Produces:
  ```ts
  export type Coverage =
    | { readonly shown: 'drawn' }
    | { readonly shown: 'drawn and tabled' }
    | { readonly shown: 'a page each' }
    | { readonly shown: 'not shown'; readonly why: string }
  export const SHEET_COVERAGE: Readonly<Record<keyof FloorPlan, Coverage>>
  ```

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/src/sheet/__tests__/coverage.test.ts
import { describe, expect, it } from 'vitest'
import { FloorPlanSchema } from '@ongrid/floorplan/types/floorplan'
import { SHEET_COVERAGE } from '../coverage'

describe('the sheet covers every part of a plan (VEW-7)', () => {
  it('has one entry for each top-level part of the schema, and no other', () => {
    expect(Object.keys(SHEET_COVERAGE).sort()).toEqual(Object.keys(FloorPlanSchema.shape).sort())
  })
  it('says why a part is not shown', () => {
    for (const [part, coverage] of Object.entries(SHEET_COVERAGE)) {
      if (coverage.shown === 'not shown') expect(coverage.why.length, part).toBeGreaterThan(10)
    }
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/cli/src/sheet/__tests__/coverage.test.ts`
Expected: FAIL, "Cannot find module '../coverage'".

- [ ] **Step 3: Write the table**

```ts
// packages/cli/src/sheet/coverage.ts
/**
 * VEW-7: what the sheet does with each top-level part of a plan.
 *
 * The sheet draws nothing of its own: a part is drawn by `drawPlan` and `planStill`, and
 * measured by `planAreas`. When the plan schema gains a part (furniture, say), this table no
 * longer has an entry for every key of `FloorPlan` and the type check fails, until someone
 * decides what the sheet does with it. `coverage.test.ts` checks the same against the schema
 * itself, so `npm test` fails too.
 */
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'

export type Coverage =
  | { readonly shown: 'drawn' }
  | { readonly shown: 'drawn and tabled' }
  | { readonly shown: 'a page each' }
  | { readonly shown: 'not shown'; readonly why: string }

export const SHEET_COVERAGE = {
  version: { shown: 'not shown', why: 'It describes the file format, not the building.' },
  units: { shown: 'not shown', why: 'It describes the file format; the sheet prints metres.' },
  walls: { shown: 'drawn' },
  openings: { shown: 'drawn' },
  rooms: { shown: 'drawn and tabled' },
  floors: { shown: 'a page each' },
  referenceImage: { shown: 'not shown', why: 'A tracing aid, not part of the building.' },
} as const satisfies Record<keyof FloorPlan, Coverage>
```

`satisfies Record<keyof FloorPlan, Coverage>` fails the type check when a key of `FloorPlan` is
missing. The test catches a key in the table that the schema no longer has.

- [ ] **Step 4: Run the test and the type check**

Run: `npx vitest run packages/cli/src/sheet/__tests__/coverage.test.ts && npm run typecheck`
Expected: PASS, and no type errors.
To check that the type check really catches a gap, delete the `referenceImage` line, run
`npm run typecheck` and see it fail, then put the line back.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/sheet/coverage.ts packages/cli/src/sheet/__tests__/coverage.test.ts
git commit -m "feat(cli): what a sheet does with each part of a plan (VEW-7)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The page list, client layout

**Files:**
- Create: `packages/cli/src/sheet/pages.ts`
- Create: `packages/cli/fixtures/two-floor-house.json`
- Test: `packages/cli/src/sheet/__tests__/pages.test.ts`

**Interfaces:**
- Consumes:
  - `LoadedPlan` (`file`, `plan`, `issues`, `broken`) from `../command/plan`.
  - `SheetWords` from `@ongrid/floorplan/types/sheet` (Task 1).
  - `planFloors`, `floorElevations`, `type Bounds` from `@ongrid/floorplan/geometry`.
  - `areaText`, `metresText`, `sumText` from `@ongrid/floorplan/geometry/rounding`.
  - `surveyPlan` from `../quantities/survey`, and `planAreas` and `AREA_RULES` from
    `../quantities/areas`.
  - `planFacts` from `../describe/facts` (`stairRooms`).
  - `planPicture` from `@ongrid/viewer/src/picture` (its `view` is the framed viewport, in
    metres).
  - `GENERAL_GUIDANCE_LABEL` from `@ongrid/rules`.
- Produces:
  ```ts
  export type SheetLayout = 'client' | 'check'
  export const SHEET_LAYOUTS: readonly SheetLayout[] = ['client', 'check']
  /** The drawing box on a floor page, in PDF points: what the frames are fitted to. */
  export const PLAN_BOX = { width: 700, height: 640 } as const
  export interface SheetFigure { readonly value: string; readonly label: string }
  export interface SheetRow { readonly name: string; readonly detail: string | null; readonly area: string }
  export interface SheetTable { readonly heading: string; readonly rows: readonly SheetRow[]; readonly total: SheetRow; readonly note: string }
  export type SheetPicture =
    | { readonly kind: 'plan'; readonly floor: string; readonly frame: Bounds; readonly ids: boolean }
    | { readonly kind: 'model' }
  export interface SheetPage {
    readonly kind: 'cover' | 'floor' | 'summary'
    readonly topLine: string
    readonly title: string | null
    readonly subtitle: string | null
    readonly paragraphs: readonly string[]
    readonly figures: readonly SheetFigure[]
    readonly table: SheetTable | null
    readonly picture: SheetPicture | null
    readonly notes: readonly string[]
    readonly footer: { readonly label: string; readonly page: number; readonly pages: number; readonly date: string }
  }
  export interface Sheet { readonly layout: SheetLayout; readonly name: string; readonly pages: readonly SheetPage[] }
  export interface SheetOptions { readonly name: string; readonly date: Date }
  export function sheetPages(loaded: LoadedPlan, words: SheetWords | null, layout: SheetLayout, options: SheetOptions): Sheet
  export function floorFrames(loaded: LoadedPlan): ReadonlyMap<string, Bounds>
  ```

- [ ] **Step 1: Make the two-floor fixture**

The CLI's tests cannot import the floorplan package's test fixtures. Write the two-floor house
to a JSON file once, with esbuild (already a dev dependency):

```bash
cd packages/floorplan
cat > /tmp/two-floor.ts <<'EOF'
import { twoFloorHouse } from './src/geometry/__tests__/rules-fixtures'
process.stdout.write(`${JSON.stringify(twoFloorHouse(), null, 2)}\n`)
EOF
cp /tmp/two-floor.ts ./two-floor.tmp.ts
npx esbuild ./two-floor.tmp.ts --bundle --platform=node --format=esm --log-level=warning | node --input-type=module > ../cli/fixtures/two-floor-house.json
rm ./two-floor.tmp.ts
cd ../..
node -e "const p=require('./packages/cli/fixtures/two-floor-house.json'); console.log(p.floors.map(f=>f.id), p.rooms.map(r=>r.use))"
```

Expected: `[ 'ground', 'first' ]`, and a list of room uses that holds at least one `bedroom`.
If it holds no `bedroom`, the bedroom-count test in Step 2 expects `0`: write the number
you see.

- [ ] **Step 2: Write the failing tests**

```ts
// packages/cli/src/sheet/__tests__/pages.test.ts
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { validatePlan } from '@ongrid/floorplan/geometry'
import { FloorPlanSchema } from '@ongrid/floorplan/types/floorplan'
import { GENERAL_GUIDANCE_LABEL } from '@ongrid/rules'
import type { LoadedPlan } from '../../command/plan'
import { planAreas } from '../../quantities/areas'
import { surveyPlan } from '../../quantities/survey'
import { floorFrames, sheetPages } from '../pages'

function fixture(name: string): LoadedPlan {
  const plan = FloorPlanSchema.parse(JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures', name), 'utf8')))
  const { issues, broken } = validatePlan(plan)
  return { file: name, plan, issues, broken }
}

const house = fixture('two-floor-house.json')
const date = new Date('2026-11-21T12:00:00Z')
const words = { version: '1' as const, name: 'Solace House', headline: 'A retreat', intro: ['Intro.'], floors: { ground: ['Ground words.'] } }

describe('the client layout (VEW-7)', () => {
  const sheet = sheetPages(house, words, 'client', { name: 'two-floor-house', date })

  it('is a cover, then one page per floor, lowest first', () => {
    expect(sheet.pages.map((p) => p.kind)).toEqual(['cover', 'floor', 'floor'])
    expect(sheet.pages.map((p) => p.picture && p.picture.kind === 'plan' ? p.picture.floor : null)).toEqual([null, 'ground', 'first'])
  })

  it('puts the label, the page number and the date on every page', () => {
    sheet.pages.forEach((page, i) => {
      expect(page.footer.label).toBe(GENERAL_GUIDANCE_LABEL)
      expect(page.footer.page).toBe(i + 1)
      expect(page.footer.pages).toBe(3)
      expect(page.footer.date).toBe('21 NOV 2026')
    })
  })

  it('uses the words of sheet.json', () => {
    const [cover, ground, first] = sheet.pages
    expect(cover!.title).toBe('Solace House')
    expect(cover!.subtitle).toBe('A retreat')
    expect(cover!.paragraphs).toEqual(['Intro.'])
    expect(ground!.paragraphs).toEqual(['Ground words.'])
    expect(first!.paragraphs).toEqual([])
  })

  it('takes the area table from planAreas, every room on its floor', () => {
    const areas = planAreas(surveyPlan(house.plan))
    for (const floor of areas.floors) {
      const page = sheet.pages.find((p) => p.picture?.kind === 'plan' && p.picture.floor === floor.floor)!
      expect(page.table!.rows.map((r) => r.name)).toEqual(floor.rooms.map((r) => r.name))
    }
  })

  it('shows four figures on the cover, made by Grid', () => {
    const labels = sheet.pages[0]!.figures.map((f) => f.label)
    expect(labels).toContain('floors')
    expect(labels).toContain('bedrooms')
    expect(sheet.pages[0]!.figures.find((f) => f.label === 'floors')!.value).toBe('2')
  })

  it('writes no words in the author\'s place without sheet.json', () => {
    const bare = sheetPages(house, null, 'client', { name: 'two-floor-house', date })
    expect(bare.pages[0]!.title).toBe('two-floor-house')
    expect(bare.pages[0]!.subtitle).toBeNull()
    expect(bare.pages.every((p) => p.paragraphs.length === 0)).toBe(true)
  })

  it('gives the same pages twice', () => {
    expect(sheetPages(house, words, 'client', { name: 'two-floor-house', date })).toEqual(sheet)
  })
})

describe('one scale for every floor (VEW-7)', () => {
  it('frames every floor at the same size, so every floor page has the same scale', () => {
    const frames = [...floorFrames(house).values()]
    expect(frames.length).toBe(2)
    for (const frame of frames) {
      expect(frame.width).toBeCloseTo(frames[0]!.width, 9)
      expect(frame.height).toBeCloseTo(frames[0]!.height, 9)
    }
  })
})
```

- [ ] **Step 3: Run them and watch them fail**

Run: `npx vitest run packages/cli/src/sheet/__tests__/pages.test.ts`
Expected: FAIL, "Cannot find module '../pages'".

- [ ] **Step 4: Write `pages.ts` (client layout; the check layout comes in Task 4)**

```ts
// packages/cli/src/sheet/pages.ts
/**
 * VEW-7: what is on each page of a sheet. Pure: no file, no canvas. `pdf.ts` lays it out.
 *
 * Every figure comes from code that already exists, never from here: areas from `planAreas`,
 * heights from `floorElevations`, stairs from `planFacts`, findings from `checkPlan`. The
 * pictures are named, not drawn: a floor and its frame, or the model.
 */
import { floorElevations, planFloors, type Bounds } from '@ongrid/floorplan/geometry'
import { areaText, metresText, sumText } from '@ongrid/floorplan/geometry/rounding'
import type { SheetWords } from '@ongrid/floorplan/types/sheet'
import { GENERAL_GUIDANCE_LABEL } from '@ongrid/rules'
import { planPicture } from '@ongrid/viewer/src/picture'
import type { LoadedPlan } from '../command/plan'
import { planFacts } from '../describe/facts'
import { AREA_RULES, planAreas, type FloorAreas } from '../quantities/areas'
import { surveyPlan } from '../quantities/survey'

export type SheetLayout = 'client' | 'check'
export const SHEET_LAYOUTS: readonly SheetLayout[] = ['client', 'check']
export const PLAN_BOX = { width: 700, height: 640 } as const

export interface SheetFigure { readonly value: string; readonly label: string }
export interface SheetRow { readonly name: string; readonly detail: string | null; readonly area: string }
export interface SheetTable { readonly heading: string; readonly rows: readonly SheetRow[]; readonly total: SheetRow; readonly note: string }
export type SheetPicture =
  | { readonly kind: 'plan'; readonly floor: string; readonly frame: Bounds; readonly ids: boolean }
  | { readonly kind: 'model' }
export interface SheetPage {
  readonly kind: 'cover' | 'floor' | 'summary'
  readonly topLine: string
  readonly title: string | null
  readonly subtitle: string | null
  readonly paragraphs: readonly string[]
  readonly figures: readonly SheetFigure[]
  readonly table: SheetTable | null
  readonly picture: SheetPicture | null
  readonly notes: readonly string[]
  readonly footer: { readonly label: string; readonly page: number; readonly pages: number; readonly date: string }
}
export interface Sheet { readonly layout: SheetLayout; readonly name: string; readonly pages: readonly SheetPage[] }
export interface SheetOptions { readonly name: string; readonly date: Date }

type Body = Omit<SheetPage, 'footer'>

/** What a client sheet always says it does not show. Grid's own words. */
export const CLIENT_LIMITS = 'Drawn from the plan alone. Furniture, stairs, structure, services and landscape are not shown.'
export const STAIR_LIMIT = 'Grid cannot show what a stair joins, so the way between floors is not checked.'

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
function dateText(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

/**
 * Each floor's frame, all the same size: the largest framed view of any floor, centred on
 * each floor's own. Drawn into boxes of one size, every floor page has the same scale.
 */
export function floorFrames(loaded: LoadedPlan): ReadonlyMap<string, Bounds> {
  const views = planFloors(loaded.plan).map((floor) => ({
    floor: floor.id,
    view: planPicture(loaded.plan, { floor: floor.id, width: PLAN_BOX.width, height: PLAN_BOX.height }).view,
  }))
  const width = Math.max(...views.map((v) => v.view.width))
  const height = Math.max(...views.map((v) => v.view.height))
  return new Map(views.map(({ floor, view }) => {
    const cx = view.x + view.width / 2
    const cy = view.y + view.height / 2
    const frame: Bounds = { min: { x: cx - width / 2, y: cy - height / 2 }, max: { x: cx + width / 2, y: cy + height / 2 }, width, height }
    return [floor, frame]
  }))
}

function areaTable(floor: FloorAreas, withUse: boolean): SheetTable {
  const shown = sumText(floor.rooms.map((r) => r.net), floor.net, 1)
  return {
    heading: 'Rooms / m²',
    rows: floor.rooms.map((room, i) => ({ name: room.name, detail: withUse ? room.use : null, area: shown.parts[i]! })),
    total: { name: 'Net area', detail: null, area: shown.total },
    note: AREA_RULES.net,
  }
}

/** Floor to floor, from the levels the 3D view stacks; one floor gives its clear height. */
function heightFigure(loaded: LoadedPlan): SheetFigure | null {
  const levels = [...new Set([...floorElevations(loaded.plan).floors.values()].map((s) => s.floorLevel))].sort((a, b) => a - b)
  if (levels.length < 2) {
    const only = [...floorElevations(loaded.plan).floors.values()][0]
    return only ? { value: `${metresText(only.clearHeight)} m`, label: 'clear height' } : null
  }
  const steps = levels.slice(1).map((level, i) => level - levels[i]!)
  const low = Math.min(...steps)
  const high = Math.max(...steps)
  const value = metresText(low) === metresText(high) ? `${metresText(low)} m` : `${metresText(low)}–${metresText(high)} m`
  return { value, label: 'floor to floor' }
}

function clientBodies(loaded: LoadedPlan, words: SheetWords | null, name: string): Body[] {
  const areas = planAreas(surveyPlan(loaded.plan))
  const floors = planFloors(loaded.plan)
  const frames = floorFrames(loaded)
  const facts = planFacts(loaded.plan)
  const bedrooms = loaded.plan.rooms.filter((room) => room.use === 'bedroom').length
  const title = words?.name ?? name
  const figures: SheetFigure[] = []
  if (areas.grossInternal !== null) figures.push({ value: `${areaText(areas.grossInternal, 1)} m²`, label: 'gross internal area' })
  figures.push({ value: String(floors.length), label: 'floors' })
  figures.push({ value: String(bedrooms), label: 'bedrooms' })
  const height = heightFigure(loaded)
  if (height) figures.push(height)

  const limits = facts.stairRooms > 0 ? [CLIENT_LIMITS, STAIR_LIMIT] : [CLIENT_LIMITS]
  const cover: Body = {
    kind: 'cover', topLine: title, title, subtitle: words?.headline ?? null,
    paragraphs: words?.intro ?? [], figures, table: null, picture: { kind: 'model' }, notes: [],
  }
  const pages = floors.map((floor): Body => {
    const floorAreas = areas.floors.find((f) => f.floor === floor.id)
    return {
      kind: 'floor', topLine: `${title} / ${floor.name}`, title: floor.name, subtitle: null,
      paragraphs: words?.floors?.[floor.id] ?? [], figures: [],
      table: floorAreas ? areaTable(floorAreas, false) : null,
      picture: { kind: 'plan', floor: floor.id, frame: frames.get(floor.id)!, ids: false },
      notes: limits,
    }
  })
  return [cover, ...pages]
}

export function sheetPages(loaded: LoadedPlan, words: SheetWords | null, layout: SheetLayout, options: SheetOptions): Sheet {
  // A check sheet takes nothing from sheet.json, not even its name.
  const name = layout === 'client' ? words?.name ?? options.name : options.name
  const bodies = layout === 'client' ? clientBodies(loaded, words, options.name) : checkBodies(loaded, options.name)
  const date = dateText(options.date)
  const pages = bodies.map((body, i): SheetPage => ({
    ...body,
    footer: { label: GENERAL_GUIDANCE_LABEL, page: i + 1, pages: bodies.length, date },
  }))
  return { layout, name, pages }
}

/** Task 4 replaces this. */
function checkBodies(_loaded: LoadedPlan, _name: string): Body[] {
  return []
}
```

Before running the tests, open `packages/floorplan/src/geometry/rounding.ts` and check two
things:
- that `sumText` with `decimals = 1` returns `{ parts, total }` as used here;
- that `rounding.ts` is reachable as `@ongrid/floorplan/geometry/rounding`. The `./geometry/*`
  export maps it.

- [ ] **Step 5: Run the tests and see them pass**

Run: `npx vitest run packages/cli/src/sheet/__tests__/pages.test.ts`
Expected: PASS, 8 tests.
If the frames test fails because `planPicture` adds dimensions outside a frame you pass in,
look at `framingOf` in `packages/viewer/src/picture/planSvg.ts`. Keep the frames in the
coordinate system of `view`, which is what `fitTo` returns for `framed`.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/sheet/pages.ts packages/cli/src/sheet/__tests__/pages.test.ts packages/cli/fixtures/two-floor-house.json
git commit -m "feat(cli): the pages of a client sheet (VEW-7)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The page list, check layout

**Files:**
- Modify: `packages/cli/src/sheet/pages.ts` (replace `checkBodies`)
- Test: `packages/cli/src/sheet/__tests__/pages.test.ts` (add a `describe` block)

**Interfaces:**
- Consumes:
  - `checkPlan(loaded, { floor })` from `../command/check`, which returns
    `{ issues, report: { findings: { floor, message }[] } }`.
  - `describeText(planFacts(plan), 'line', 'person')` from `../describe/card`.
  - `quoted` from wherever MSG-9 put it. Find it with
    `grep -rn "export function quoted" packages`.
- Produces: `sheetPages(…, 'check', …)` gives a summary page, then one `floor` page per floor.
  Its pictures have `ids: true`, its tables have each room's use, and its notes list every
  finding and drawing problem on that floor.

- [ ] **Step 1: Write the failing tests**

Add to `pages.test.ts`:

```ts
import { checkPlan } from '../../command/check'

describe('the check layout (VEW-7)', () => {
  const sheet = sheetPages(house, words, 'check', { name: 'two-floor-house', date })

  it('is a summary, then one page per floor', () => {
    expect(sheet.pages.map((p) => p.kind)).toEqual(['summary', 'floor', 'floor'])
  })

  it('takes nothing from sheet.json', () => {
    const text = JSON.stringify(sheet)
    for (const word of ['Solace House', 'A retreat', 'Intro.', 'Ground words.']) expect(text).not.toContain(word)
  })

  it('draws ids, and gives each room its use', () => {
    const floor = sheet.pages[1]!
    expect(floor.picture).toMatchObject({ kind: 'plan', ids: true })
    expect(floor.table!.rows.every((row) => row.detail !== undefined)).toBe(true)
  })

  it('lists every finding on its own floor', () => {
    for (const page of sheet.pages.slice(1)) {
      const floorId = page.picture!.kind === 'plan' ? page.picture.floor : ''
      const result = checkPlan(house, { floor: floorId })
      for (const finding of result.report.findings) expect(page.notes).toContain(finding.message)
    }
  })

  it('says how many findings there are, and never that the plan passes', () => {
    const summary = sheet.pages[0]!
    expect(summary.figures.map((f) => f.label)).toContain('findings')
    expect(JSON.stringify(sheet)).not.toMatch(/\b(complies|compliant|approved|passes)\b/i)
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run packages/cli/src/sheet/__tests__/pages.test.ts -t "check layout"`
Expected: FAIL. The check layout has no pages yet.

- [ ] **Step 3: Write `checkBodies`**

Replace the placeholder `checkBodies` in `pages.ts`, and add the imports:

```ts
import { checkPlan } from '../command/check'
import { describeText } from '../describe/card'
// quoted: import from where MSG-9 defines it (see Interfaces).

function issueLine(issue: { severity: string; entity: string; id: string; message: string }): string {
  return `${issue.severity === 'error' ? 'Left out' : 'Worth a look'}, ${issue.entity} ${quoted(issue.id)}: ${issue.message}`
}

function checkBodies(loaded: LoadedPlan, name: string): Body[] {
  const areas = planAreas(surveyPlan(loaded.plan))
  const floors = planFloors(loaded.plan)
  const frames = floorFrames(loaded)
  const whole = checkPlan(loaded, {})
  const figures: SheetFigure[] = [
    { value: String(whole.report.findings.length), label: 'findings' },
    { value: String(whole.issues.length), label: 'problems in the drawing' },
    { value: `${areaText(areas.net, 1)} m²`, label: 'net area' },
  ]
  if (areas.grossInternal !== null) figures.push({ value: `${areaText(areas.grossInternal, 1)} m²`, label: 'gross internal area' })
  if (areas.grossExternal !== null) figures.push({ value: `${areaText(areas.grossExternal, 1)} m²`, label: 'gross external area' })
  const summary: Body = {
    kind: 'summary', topLine: `${name} / Check set`, title: 'Check set', subtitle: null,
    paragraphs: [describeText(planFacts(loaded.plan), 'line', 'person').trim()],
    figures, table: null, picture: null,
    notes: [AREA_RULES.net, AREA_RULES.grossInternal, AREA_RULES.grossExternal, ...whole.report.limits],
  }
  const pages = floors.map((floor): Body => {
    const result = checkPlan(loaded, { floor: floor.id })
    const floorAreas = areas.floors.find((f) => f.floor === floor.id)
    const findings = result.report.findings.map((finding) => finding.message)
    return {
      kind: 'floor', topLine: `${name} / ${floor.name}`, title: floor.name, subtitle: null,
      paragraphs: [], figures: [],
      table: floorAreas ? areaTable(floorAreas, true) : null,
      picture: { kind: 'plan', floor: floor.id, frame: frames.get(floor.id)!, ids: true },
      notes: findings.length + result.issues.length === 0
        ? ['These checks found nothing on this floor. That is not a statement that it meets any rule.']
        : [...findings, ...result.issues.filter((i) => i.entity !== 'plan').map(issueLine)],
    }
  })
  return [summary, ...pages]
}
```

`checkPlan` with no `floor` returns the whole report. Check that `report.limits` exists on
`RulesReport`: `checkText` prints it under "What these checks never look at".

- [ ] **Step 4: Run all the page tests**

Run: `npx vitest run packages/cli/src/sheet/__tests__/pages.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/sheet/pages.ts packages/cli/src/sheet/__tests__/pages.test.ts
git commit -m "feat(cli): the pages of a check sheet (VEW-7)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The bundled fonts

**Files:**
- Create: `packages/cli/fonts/SourceSerif4-Regular.otf`, `SourceSerif4-Semibold.otf`,
  `SourceSans3-Regular.otf`, `SourceSans3-Semibold.otf`, `OFL.txt`
- Create: `packages/cli/src/sheet/fonts.ts`
- Modify: `packages/cli/build.mjs`, `packages/cli/pack.mjs`,
  `packages/cli/src/distribution/listing.ts` (`files`), `NOTICE`
- Test: `packages/cli/src/sheet/__tests__/fonts.test.ts`,
  `packages/cli/src/distribution/__tests__/install.e2e.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const SERIF = 'Grid Sheet Serif'
  export const SANS = 'Grid Sheet Sans'
  export class FontsMissing extends Error {}
  /** Registers the four fonts once. Throws FontsMissing, naming the folder looked in. */
  export function useSheetFonts(canvas: typeof import('@napi-rs/canvas')): void
  ```

- [ ] **Step 1: Get the font files (ask the owner first)**

Downloading a file needs the owner's yes. Ask them, naming each file and its source:

- Source Serif 4: https://github.com/adobe-fonts/source-serif/releases (the latest
  `source-serif-*_Desktop.zip`), files `OTF/SourceSerif4-Regular.otf` and
  `OTF/SourceSerif4-Semibold.otf`.
- Source Sans 3: https://github.com/adobe-fonts/source-sans/releases (the latest
  `OTF-source-sans-*.zip`), files `SourceSans3-Regular.otf` and `SourceSans3-Semibold.otf`.
- `LICENSE.md` from either release, saved as `OFL.txt`. Check that it is the SIL Open Font
  License 1.1, and that both releases carry the same text.

Put the five files in `packages/cli/fonts/`. Record the release versions; you need them for
`NOTICE`.

- [ ] **Step 2: Write the failing test**

```ts
// packages/cli/src/sheet/__tests__/fonts.test.ts
import { describe, expect, it } from 'vitest'
import { GlobalFonts } from '@napi-rs/canvas'
import * as canvas from '@napi-rs/canvas'
import { SANS, SERIF, useSheetFonts } from '../fonts'

describe('the sheet fonts (VEW-7)', () => {
  it('registers a serif and a sans under Grid\'s own names', () => {
    useSheetFonts(canvas)
    const families = GlobalFonts.families.map((f) => f.family)
    expect(families).toContain(SERIF)
    expect(families).toContain(SANS)
  })
  it('registers them once', () => {
    useSheetFonts(canvas)
    useSheetFonts(canvas)
    expect(GlobalFonts.families.filter((f) => f.family === SERIF).length).toBe(1)
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run packages/cli/src/sheet/__tests__/fonts.test.ts`
Expected: FAIL, "Cannot find module '../fonts'".

- [ ] **Step 4: Write `fonts.ts`**

```ts
// packages/cli/src/sheet/fonts.ts
/**
 * VEW-7: the sheet's two fonts, Source Serif 4 and Source Sans 3 (SIL Open Font License 1.1,
 * `fonts/OFL.txt`), shipped with Grid so a sheet looks the same on every machine.
 *
 * The canvas reads the files itself, so nothing here imports `fs`. The folder is found from
 * where this code runs: `fonts/` beside the built `grid.mjs`, beside its chunk folder, or two
 * folders up from this source file in tests.
 */
import { fileURLToPath } from 'url'

export const SERIF = 'Grid Sheet Serif'
export const SANS = 'Grid Sheet Sans'

export class FontsMissing extends Error {
  override readonly name = 'FontsMissing'
}

const FILES = [
  ['SourceSerif4-Regular.otf', SERIF],
  ['SourceSerif4-Semibold.otf', SERIF],
  ['SourceSans3-Regular.otf', SANS],
  ['SourceSans3-Semibold.otf', SANS],
] as const

const CANDIDATES = ['./fonts/', '../fonts/', '../../fonts/']
let registered = false

export function useSheetFonts(canvas: typeof import('@napi-rs/canvas')): void {
  if (registered) return
  for (const candidate of CANDIDATES) {
    const folder = fileURLToPath(new URL(candidate, import.meta.url))
    const keys = FILES.map(([file, family]) => canvas.GlobalFonts.registerFromPath(`${folder}${file}`, family))
    if (keys.every((key) => key !== null)) {
      registered = true
      return
    }
  }
  throw new FontsMissing('The sheet fonts are missing from this install of Grid: reinstall it.')
}
```

If `registerFromPath` registers some files from a wrong folder before one fails, that is
harmless: the families get registered again from the right folder.

- [ ] **Step 5: Run the test and see it pass**

Run: `npx vitest run packages/cli/src/sheet/__tests__/fonts.test.ts`
Expected: PASS.

- [ ] **Step 6: Ship the fonts with the build and the package**

In `packages/cli/build.mjs`, after `chmodSync(...)`:

```js
// The sheet's fonts (VEW-7), read by the canvas beside grid.mjs.
cpSync(here('./fonts'), here('./dist/fonts'), { recursive: true })
```

Add `cpSync` to the `node:fs` import there.

In `packages/cli/pack.mjs`:
- after `cpSync(join(cli, 'dist', 'chunks'), join(stage, 'chunks'), …)`, add
  `cpSync(join(cli, 'dist', 'fonts'), join(stage, 'fonts'), { recursive: true })`;
- after `addTree(join(cli, 'dist', 'chunks'), 'server/chunks')`, add
  `addTree(join(cli, 'dist', 'fonts'), 'server/fonts')`.

In `packages/cli/src/distribution/listing.ts`, make the manifest's `files` this:

```ts
    files: ['grid.mjs', 'chunks/', 'fonts/', 'README.md', 'LICENSE', 'NOTICE'],
```

Esbuild chunks sit in `dist/chunks/`. `CANDIDATES` covers code bundled into `grid.mjs`
(`./fonts/`) and into a chunk (`../fonts/`).

- [ ] **Step 7: Name the fonts in NOTICE**

Append to `NOTICE`:

```
The ongrid package ships two fonts for `grid sheet` (packages/cli/fonts), unchanged:

- Source Serif 4 <version> (https://github.com/adobe-fonts/source-serif), Copyright 2014-2021
  Adobe (http://www.adobe.com/), with Reserved Font Name 'Source';
- Source Sans 3 <version> (https://github.com/adobe-fonts/source-sans), Copyright 2010-2020
  Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'.

Both are under the SIL Open Font License, Version 1.1, in packages/cli/fonts/OFL.txt.
```

Replace each `<version>` with the release version from Step 1. Copy the copyright lines from
the `LICENSE.md` of each release, not from this plan.

- [ ] **Step 8: Check the fonts in the install test**

Open `packages/cli/src/distribution/__tests__/install.e2e.test.ts`. Find where it unpacks the
npm tarball, and add a check that the installed package holds `fonts/SourceSans3-Regular.otf`
and `fonts/OFL.txt`. Use the test's own file helpers. Then run:

```bash
npm run build --workspace ongrid && npm run pack:local --workspace ongrid
npx vitest run packages/cli/src/distribution/__tests__/install.e2e.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/cli/fonts packages/cli/src/sheet/fonts.ts packages/cli/src/sheet/__tests__/fonts.test.ts packages/cli/build.mjs packages/cli/pack.mjs packages/cli/src/distribution/listing.ts packages/cli/src/distribution/__tests__/install.e2e.test.ts NOTICE
git commit -m "feat(cli): ship the sheet's two open fonts (VEW-7)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Drawing the PDF

**Files:**
- Create: `packages/cli/src/sheet/pdf.ts`
- Test: `packages/cli/src/sheet/__tests__/pdf.test.ts`

**Interfaces:**
- Consumes:
  - `Sheet`, `SheetPage` and `PLAN_BOX` (Task 3).
  - `useSheetFonts`, `SERIF` and `SANS` (Task 5).
  - `loadCanvas` from `../draw/canvas`. It throws `CanvasMissing` when the canvas is missing.
  - `drawPlan(plan, { format: 'svg', floor, frame, width, height, labels })` from
    `../draw/drawPlan`. `labels: { ids: true }` gives the check view, as `grid draw --ids`
    does.
  - `drawStill(plan, { width, height, scale })` from `../draw/drawStill`.
- Produces:
  ```ts
  export const A3 = { width: 1191, height: 842 } as const
  export async function sheetPdf(plan: FloorPlan, sheet: Sheet): Promise<Uint8Array>
  ```

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/src/sheet/__tests__/pdf.test.ts
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { validatePlan } from '@ongrid/floorplan/geometry'
import { FloorPlanSchema } from '@ongrid/floorplan/types/floorplan'
import { sheetPages } from '../pages'
import { sheetPdf } from '../pdf'

const plan = FloorPlanSchema.parse(JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures/two-floor-house.json'), 'utf8')))
const loaded = { file: 'two-floor-house.json', plan, ...validatePlan(plan) }
const date = new Date('2026-11-21T12:00:00Z')

/** Pages in a PDF, by its page objects. Skia writes each page as its own object. */
function pageCount(pdf: Uint8Array): number {
  return (Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page(?!s)/g) ?? []).length
}

describe('the sheet as a PDF (VEW-7)', () => {
  it('writes one PDF page for each page of the client sheet', async () => {
    const sheet = sheetPages(loaded, { version: '1', name: 'Solace House' }, 'client', { name: 'two-floor-house', date })
    const pdf = await sheetPdf(plan, sheet)
    expect(Buffer.from(pdf.subarray(0, 5)).toString('latin1')).toBe('%PDF-')
    expect(pageCount(pdf)).toBe(sheet.pages.length)
  }, 30_000)

  it('writes one PDF page for each page of the check sheet', async () => {
    const sheet = sheetPages(loaded, null, 'check', { name: 'two-floor-house', date })
    expect(pageCount(await sheetPdf(plan, sheet))).toBe(sheet.pages.length)
  }, 30_000)
})
```

`validatePlan` returns `{ issues, broken }`; spreading it gives the `LoadedPlan` shape. If
`broken` comes back as an array, wrap it in `new Set(...)`, as `loadPlan` does.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/cli/src/sheet/__tests__/pdf.test.ts`
Expected: FAIL, "Cannot find module '../pdf'".

- [ ] **Step 3: Write `pdf.ts`**

```ts
// packages/cli/src/sheet/pdf.ts
/**
 * VEW-7: a sheet drawn as an A3 landscape PDF, with Skia's PDF writer through
 * `@napi-rs/canvas` (MIT). Text and the floor drawings stay vector; the 3D picture is an image.
 *
 * This file only places what `pages.ts` decided. Every picture comes from `drawPlan` or
 * `drawStill`, never drawn here.
 */
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import type { SKRSContext2D } from '@napi-rs/canvas'
import { loadCanvas } from '../draw/canvas'
import { drawPlan } from '../draw/drawPlan'
import { drawStill } from '../draw/drawStill'
import { SANS, SERIF, useSheetFonts } from './fonts'
import { PLAN_BOX, type Sheet, type SheetPage } from './pages'

export const A3 = { width: 1191, height: 842 } as const
const MARGIN = 48
const INK = '#2f2f2b'
const QUIET = '#77746c'
const PAPER = '#f8f7f3'
const RULE = '#d9d6ce'
const SIDE_X = MARGIN + PLAN_BOX.width + 40
const SIDE_WIDTH = A3.width - SIDE_X - MARGIN

type Ctx = SKRSContext2D

function font(ctx: Ctx, family: string, size: number, weight: 400 | 600 = 400): void {
  ctx.font = `${weight} ${size}px "${family}"`
}

/** Wraps a paragraph to a width, by the font's own measure. Returns the y below it. */
function paragraph(ctx: Ctx, text: string, x: number, y: number, width: number, lineHeight: number): number {
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > width && line) {
      ctx.fillText(line, x, y)
      y += lineHeight
      line = word
    } else {
      line = next
    }
  }
  if (line) { ctx.fillText(line, x, y); y += lineHeight }
  return y
}

function footer(ctx: Ctx, page: SheetPage): void {
  const y = A3.height - MARGIN + 18
  ctx.strokeStyle = RULE
  ctx.beginPath(); ctx.moveTo(MARGIN, y - 18); ctx.lineTo(A3.width - MARGIN, y - 18); ctx.stroke()
  font(ctx, SANS, 9)
  ctx.fillStyle = QUIET
  ctx.textAlign = 'left'
  ctx.fillText(page.footer.label, MARGIN, y)
  ctx.textAlign = 'right'
  ctx.fillText(`${String(page.footer.page).padStart(2, '0')} / ${String(page.footer.pages).padStart(2, '0')}  ·  ${page.footer.date}`, A3.width - MARGIN, y)
  ctx.textAlign = 'left'
}

function header(ctx: Ctx, page: SheetPage): number {
  font(ctx, SANS, 10)
  ctx.fillStyle = QUIET
  ctx.fillText(page.topLine.toUpperCase(), MARGIN, MARGIN)
  let y = MARGIN + 40
  if (page.title) { font(ctx, SERIF, 34); ctx.fillStyle = INK; ctx.fillText(page.title, MARGIN, y); y += 22 }
  if (page.subtitle) { font(ctx, SANS, 13); ctx.fillStyle = QUIET; ctx.fillText(page.subtitle, MARGIN, y); y += 16 }
  return y
}

function side(ctx: Ctx, page: SheetPage, top: number): void {
  let y = top
  if (page.table) {
    font(ctx, SANS, 9); ctx.fillStyle = QUIET; ctx.fillText(page.table.heading.toUpperCase(), SIDE_X, y); y += 20
    for (const row of [...page.table.rows, page.table.total]) {
      font(ctx, SANS, 11, row === page.table.total ? 600 : 400)
      ctx.fillStyle = INK
      ctx.fillText(row.detail ? `${row.name} · ${row.detail}` : row.name, SIDE_X, y)
      ctx.textAlign = 'right'; ctx.fillText(row.area, SIDE_X + SIDE_WIDTH, y); ctx.textAlign = 'left'
      ctx.strokeStyle = RULE; ctx.beginPath(); ctx.moveTo(SIDE_X, y + 8); ctx.lineTo(SIDE_X + SIDE_WIDTH, y + 8); ctx.stroke()
      y += 24
    }
    font(ctx, SANS, 9); ctx.fillStyle = QUIET
    y = paragraph(ctx, page.table.note, SIDE_X, y + 6, SIDE_WIDTH, 12) + 12
  }
  font(ctx, SANS, 12); ctx.fillStyle = INK
  for (const text of page.paragraphs) y = paragraph(ctx, text, SIDE_X, y, SIDE_WIDTH, 17) + 8
  font(ctx, SANS, 9); ctx.fillStyle = QUIET
  for (const note of page.notes) y = paragraph(ctx, note, SIDE_X, y, SIDE_WIDTH, 12) + 6
}

async function drawFloorPage(ctx: Ctx, canvas: typeof import('@napi-rs/canvas'), plan: FloorPlan, page: SheetPage): Promise<void> {
  const top = header(ctx, page) + 10
  if (page.picture?.kind === 'plan') {
    const svg = await drawPlan(plan, {
      format: 'svg', floor: page.picture.floor, frame: page.picture.frame,
      width: PLAN_BOX.width, height: PLAN_BOX.height,
      ...(page.picture.ids ? { labels: { ids: true } } : {}),
    })
    const image = await canvas.loadImage(Buffer.from(svg))
    ctx.drawImage(image, MARGIN, top, PLAN_BOX.width, PLAN_BOX.height)
  }
  side(ctx, page, top + 10)
}

async function drawCover(ctx: Ctx, canvas: typeof import('@napi-rs/canvas'), plan: FloorPlan, page: SheetPage): Promise<void> {
  const top = header(ctx, page) + 16
  const width = A3.width - 2 * MARGIN
  const height = 430
  const still = await drawStill(plan, { width: Math.round(width), height, scale: 2 })
  ctx.drawImage(await canvas.loadImage(Buffer.from(still)), MARGIN, top, width, height)
  let y = top + height + 50
  const column = width / Math.max(1, page.figures.length)
  page.figures.forEach((figure, i) => {
    font(ctx, SERIF, 30); ctx.fillStyle = INK; ctx.fillText(figure.value, MARGIN + i * column, y)
    font(ctx, SANS, 11); ctx.fillStyle = QUIET; ctx.fillText(figure.label, MARGIN + i * column, y + 18)
  })
  y += 50
  font(ctx, SANS, 12); ctx.fillStyle = INK
  for (const text of page.paragraphs) y = paragraph(ctx, text, MARGIN, y, width, 17) + 6
}

function drawSummary(ctx: Ctx, page: SheetPage): void {
  let y = header(ctx, page) + 30
  const width = A3.width - 2 * MARGIN
  page.figures.forEach((figure, i) => {
    font(ctx, SERIF, 26); ctx.fillStyle = INK; ctx.fillText(figure.value, MARGIN + i * 200, y)
    font(ctx, SANS, 10); ctx.fillStyle = QUIET; ctx.fillText(figure.label, MARGIN + i * 200, y + 16)
  })
  y += 60
  font(ctx, SANS, 12); ctx.fillStyle = INK
  for (const text of page.paragraphs) y = paragraph(ctx, text, MARGIN, y, width, 17) + 10
  font(ctx, SANS, 9); ctx.fillStyle = QUIET
  for (const note of page.notes) y = paragraph(ctx, note, MARGIN, y, width, 12) + 6
}

export async function sheetPdf(plan: FloorPlan, sheet: Sheet): Promise<Uint8Array> {
  const canvas = await loadCanvas()
  useSheetFonts(canvas)
  const doc = new canvas.PDFDocument({ title: sheet.name, creator: 'Grid', producer: 'Grid' })
  for (const page of sheet.pages) {
    const ctx = doc.beginPage(A3.width, A3.height)
    ctx.fillStyle = PAPER
    ctx.fillRect(0, 0, A3.width, A3.height)
    if (page.kind === 'cover') await drawCover(ctx, canvas, plan, page)
    else if (page.kind === 'summary') drawSummary(ctx, page)
    else await drawFloorPage(ctx, canvas, plan, page)
    footer(ctx, page)
    doc.endPage()
  }
  return new Uint8Array(doc.close())
}
```

Before running, check two things in `node_modules/@napi-rs/canvas/index.d.ts`:
- that `SKRSContext2D` is the name of the 2D context type. If it isn't, use the return type of
  `PDFDocument.beginPage`.
- that `loadImage` takes a `Buffer` of SVG text. `drawPlan` already relies on that.

- [ ] **Step 4: Run the test and see it pass**

Run: `npx vitest run packages/cli/src/sheet/__tests__/pdf.test.ts`
Expected: PASS.
If `pageCount` finds no pages, Skia may have put the page objects in a compressed object
stream. Then set `compressionLevel: 0` in the test only. Do not count pages any other way.

- [ ] **Step 5: Look at it**

Write both sheets of the two-floor house to your scratch folder, and look at every page as a
picture (Quick Look on macOS: `qlmanage -t -s 1600 -o <folder> <file>.pdf`). Check:
- no text runs into the drawing or off the page;
- the side column does not overlap the footer;
- both floor drawings are at the same scale;
- the label is in every footer.

Fix the layout constants above until it holds. The scratch files are not committed.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/sheet/pdf.ts packages/cli/src/sheet/__tests__/pdf.test.ts
git commit -m "feat(cli): draw a sheet as an A3 PDF (VEW-7)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The `grid sheet` command

**Files:**
- Create: `packages/cli/src/command/sheet.ts`, `packages/cli/src/sheet/sheetFile.ts`
- Modify: `packages/cli/src/command/export.ts`, `packages/cli/src/command/main.ts`
- Test: `packages/cli/src/command/__tests__/sheet.e2e.test.ts`,
  `packages/cli/src/command/__tests__/exportName.test.ts`

**Interfaces:**
- Consumes: `sheetPages`, `SHEET_LAYOUTS`, `SheetLayout` (Task 3); `sheetPdf` (Task 6);
  `parseSheetWords`, `SheetWordsRefused` (Task 1); `loadPlan` and `LoadedPlan`;
  `Project.readTextIfThere(file)`; `writeProjectExport(project, folder, fileName, data)` from
  `../export/projectExports`.
- Produces:
  ```ts
  // export.ts
  export function exportBaseOf(planFile: string): { base: string; note?: string }
  // sheetFile.ts
  export const SHEET_FILE = 'sheet.json'
  export interface SheetRequest { readonly layout?: string; readonly sheet?: string; readonly out?: string }
  export function checkSheetRequest(request: SheetRequest): SheetLayout // throws UsageError
  export function readSheetWords(project: Project, planFile: string, loaded: LoadedPlan, given: string | undefined): SheetWords | null
  export interface SheetDone { readonly written: string; readonly pages: readonly { kind: string; title: string | null }[]; readonly note?: string }
  export async function sheetIntoProject(project: Project, planFile: string, layout: SheetLayout, words: SheetWords | null, out?: string): Promise<SheetDone>
  // command/sheet.ts
  export const SHEET_OPTIONS: OptionSpecs
  ```

- [ ] **Step 1: Split the name of an export from its format**

In `export.ts`, move everything in `exportNameOf` up to the floor suffix into
`exportBaseOf(planFile)`. `exportNameOf` then calls it, so it behaves exactly as before:

```ts
/** The plan file's name made safe to name a file after: no claim, no instruction, no device. */
export function exportBaseOf(planFile: string): { base: string; note?: string } {
  let base = exportFileName(projectNameOf(planFile), 'dxf', null).slice(0, -'.dxf'.length)
  let note: string | undefined
  const words = base.split('-')
  const kept = words.find((word) => WORDS_KEPT_OUT.has(word))
  if (base !== NEUTRAL_EXPORT_NAME && (words.length > EXPORT_NAME_MAX_WORDS || base.length > EXPORT_NAME_MAX_LENGTH)) {
    base = NEUTRAL_EXPORT_NAME
    note = `the plan file's name is longer than ${EXPORT_NAME_MAX_WORDS} words or ${EXPORT_NAME_MAX_LENGTH} characters`
  } else if (kept !== undefined) {
    base = NEUTRAL_EXPORT_NAME
    note = "the plan file's name reads as a claim about the plan or as an instruction"
  }
  return note === undefined ? { base } : { base, note }
}

export function exportNameOf(planFile: string, format: ExportFormat, floorNumber: number | null): ExportName {
  const made = exportBaseOf(planFile)
  let base = made.base
  let note = made.note
  if (floorNumber !== null) base = `${base}-floor-${floorNumber}`
  if (WINDOWS_DEVICE.test(base)) {
    note = `${base} is a name Windows keeps for a device`
    base = `plan-${base}`
  }
  const fileName = `${base}.${format}`
  return note === undefined ? { fileName } : { fileName, note: `Named the export ${fileName}: ${note}.` }
}
```

`exportFileName(…, 'dxf', …)` is only used for its slug. The format does not change the base.

Run: `npx vitest run packages/cli/src/command/__tests__/exportName.test.ts`
Expected: PASS, unchanged. Then add one test to that file:

```ts
it('gives the base a sheet is named after (VEW-7)', () => {
  expect(exportBaseOf('My House.json')).toEqual({ base: 'my-house' })
  expect(exportBaseOf('approved-plan.json').base).toBe('floor-plan')
})
```

Run it again. Expected: PASS.

- [ ] **Step 2: Write the failing end-to-end tests**

Model the file on `describe.e2e.test.ts`: the same `beforeAll` check of `dist/grid.mjs`, the same
temporary folder, and the same `grid()` helper. Copy `two-floor-house.json` into the folder.

```ts
// packages/cli/src/command/__tests__/sheet.e2e.test.ts  (helpers as in describe.e2e.test.ts)
describe('grid sheet (VEW-7)', () => {
  it('writes a client sheet into exports/ beside the plan', () => {
    const run = grid(['sheet', 'two-floor-house.json', '--layout', 'client'])
    expect(run.err).toBe('')
    expect(run.status).toBe(0)
    expect(run.out).toMatch(/Wrote exports\/two-floor-house-client\.pdf/)
    expect(readFileSync(join(dir, 'exports', 'two-floor-house-client.pdf')).subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })
  it('writes a check sheet to --out', () => {
    const run = grid(['sheet', 'two-floor-house.json', '--layout', 'check', '--out', 'set.pdf'])
    expect(run.status).toBe(0)
    expect(existsSync(join(dir, 'set.pdf'))).toBe(true)
  })
  it('needs --layout, naming both', () => {
    const run = grid(['sheet', 'two-floor-house.json'])
    expect(run.status).toBe(2)
    expect(run.err).toMatch(/--layout.*client.*check/)
  })
  it('refuses --sheet with the check layout', () => {
    const run = grid(['sheet', 'two-floor-house.json', '--layout', 'check', '--sheet', 'sheet.json'])
    expect(run.status).toBe(2)
    expect(run.err).toMatch(/--sheet/)
  })
  it('refuses an --out that is not a .pdf', () => {
    expect(grid(['sheet', 'two-floor-house.json', '--layout', 'client', '--out', 'x.png']).status).toBe(2)
  })
  it('reads sheet.json beside the plan, and refuses a bad one without repeating it', () => {
    writeFileSync(join(dir, 'sheet.json'), JSON.stringify({ version: '1', floors: { roof: ['secret words'] } }))
    const run = grid(['sheet', 'two-floor-house.json', '--layout', 'client'])
    expect(run.status).toBe(1)
    expect(run.err).toMatch(/"roof"/)
    expect(run.err).not.toMatch(/secret words/)
  })
  it('ignores sheet.json with the check layout', () => {
    writeFileSync(join(dir, 'sheet.json'), '{ not json')
    expect(grid(['sheet', 'two-floor-house.json', '--layout', 'check']).status).toBe(0)
  })
})
```

- [ ] **Step 3: Build and watch them fail**

Run: `npm run build --workspace ongrid && npx vitest run packages/cli/src/command/__tests__/sheet.e2e.test.ts`
Expected: FAIL, `sheet` is not a command.

- [ ] **Step 4: Write `sheetFile.ts`**

```ts
// packages/cli/src/sheet/sheetFile.ts
/**
 * VEW-7: the files of `grid sheet` and `grid_sheet`. The words are read from `sheet.json`
 * beside the plan, or from the file named; the PDF goes into `exports/` beside the plan, or to
 * the file named. Every file goes through the project (`projectFiles.ts`).
 */
import path from 'path'
import { planFloors } from '@ongrid/floorplan/geometry'
import { parseSheetWords, SheetWordsRefused, type SheetWords } from '@ongrid/floorplan/types/sheet'
import { exportBaseOf } from '../command/export'
import { loadPlan, PlanRefused, type LoadedPlan } from '../command/plan'
import { UsageError } from '../command/options'
import { writeProjectExport } from '../export/projectExports'
import type { Project } from '../fs/projectFiles'
import { sheetPages, SHEET_LAYOUTS, type SheetLayout } from './pages'
import { sheetPdf } from './pdf'

export const SHEET_FILE = 'sheet.json'
const SHEET_FILE_MAX_BYTES = 64 * 1024

export interface SheetRequest { readonly layout?: string; readonly sheet?: string; readonly out?: string }

export function checkSheetRequest(request: SheetRequest): SheetLayout {
  const layouts = SHEET_LAYOUTS.join(' or ')
  if (request.layout === undefined) throw new UsageError(`sheet needs --layout: ${layouts}.`)
  if (!(SHEET_LAYOUTS as readonly string[]).includes(request.layout)) throw new UsageError(`--layout takes ${layouts}.`)
  if (request.layout === 'check' && request.sheet !== undefined) {
    throw new UsageError('--sheet gives the words of a client sheet; a check sheet takes none: leave --sheet out.')
  }
  if (request.out !== undefined && path.extname(request.out).toLowerCase() !== '.pdf') {
    throw new UsageError('--out must name a .pdf file.')
  }
  return request.layout as SheetLayout
}

/** The words for a client sheet: the file named, else `sheet.json` beside the plan, else none. */
export function readSheetWords(project: Project, planFile: string, loaded: LoadedPlan, given: string | undefined): SheetWords | null {
  const file = given ?? path.join(path.dirname(planFile), SHEET_FILE)
  const text = given === undefined ? project.readTextIfThere(file) : project.readText(file, SHEET_FILE_MAX_BYTES).text
  if (text === null) return null
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new PlanRefused(`${file} is not JSON.`)
  }
  try {
    return parseSheetWords(raw, planFloors(loaded.plan).map((floor) => floor.id))
  } catch (error) {
    if (error instanceof SheetWordsRefused) throw new PlanRefused(`${file} is not a sheet: ${error.message}.`)
    throw error
  }
}

export interface SheetDone {
  readonly written: string
  readonly pages: readonly { readonly kind: string; readonly title: string | null }[]
  readonly note?: string
}

export async function sheetIntoProject(project: Project, planFile: string, layout: SheetLayout, words: SheetWords | null, out?: string): Promise<SheetDone> {
  const loaded = loadPlan(project, planFile)
  const { base, note } = exportBaseOf(planFile)
  const sheet = sheetPages(loaded, words, layout, { name: base, date: new Date() })
  const pdf = await sheetPdf(loaded.plan, sheet)
  const written = out === undefined
    ? writeProjectExport(project, path.dirname(planFile), `${base}-${layout}.pdf`, pdf)
    : project.writeFile(out, pdf)
  const pages = sheet.pages.map((page) => ({ kind: page.kind, title: page.title }))
  return note === undefined ? { written, pages } : { written, pages, note: `Named the sheet ${base}-${layout}.pdf: ${note}.` }
}
```

`readSheetWords` needs the plan loaded, because the floor ids come from it. The command loads
the plan twice, once for the words and once in `sheetIntoProject`. That is the same as
`exportIntoProject` and keeps one function for both the command and the tool.

- [ ] **Step 5: Register the command**

```ts
// packages/cli/src/command/sheet.ts
/**
 * `grid sheet <plan> --layout client|check`: the plan as an A3 PDF for people (VEW-7).
 * The work is in `src/sheet/`; this file holds the options.
 */
import { PROJECT_OPTION, type OptionSpecs } from './options'

export const SHEET_OPTIONS: OptionSpecs = {
  '--layout': { takesValue: true, help: 'client (a presentation, with the words of sheet.json) or check (a working set with ids and findings).' },
  '--sheet': { takesValue: true, help: 'Client only: the words, as a sheet.json file inside the project. sheet.json beside the plan when left out.' },
  '--out': { takesValue: true, help: 'The PDF to write, inside the project. exports/ beside the plan when left out.' },
  ...PROJECT_OPTION,
}
```

In `main.ts`:
- Add `sheet` to `COMMANDS`, after `export`:
  ```ts
  sheet: {
    usage: 'grid sheet [<plan.json>] --layout client|check [--sheet <sheet.json>] [--out <file.pdf>] [--project <folder>]',
    summary: 'Writes the plan as an A3 PDF for people: client (with the words of sheet.json) or check (ids and findings).',
    options: SHEET_OPTIONS,
  },
  ```
- Add `sheet` to the help sentence that lists which commands read `plan.json`.
- In `runCommand`, before the final `export` code, add:
  ```ts
  if (name === 'sheet') {
    const request = { layout: textOf(parsed, '--layout'), sheet: textOf(parsed, '--sheet'), out: textOf(parsed, '--out') }
    const layout = checkSheetRequest(request)
    const project = openProject(projectOption, io.cwd)
    const words = layout === 'client' ? readSheetWords(project, planFile, loadPlan(project, planFile), request.sheet) : null
    const done = await sheetIntoProject(project, planFile, layout, words, request.out)
    if (done.note) io.stderr(`${done.note}\n`)
    io.stdout(`Wrote ${project.shown(done.written)}\n`)
    return EXIT_OK
  }
  ```
- Import `SHEET_OPTIONS` from `./sheet`, and `checkSheetRequest`, `readSheetWords` and
  `sheetIntoProject` from `../sheet/sheetFile`.
- Check how `runGrid` turns `PlanRefused` into exit code 1 and `UsageError` into 2. The
  refusals above rely on that. Also check whether it catches `CanvasMissing` and `FontsMissing`;
  make it catch `FontsMissing` the same way it catches `CanvasMissing`.

- [ ] **Step 6: Build and run the tests**

Run: `npm run build --workspace ongrid && npx vitest run packages/cli/src/command/__tests__/sheet.e2e.test.ts packages/cli/src/__tests__/fileAccess.test.ts`
Expected: PASS. `fileAccess.test.ts` must still pass: nothing new imports `fs`.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/command/sheet.ts packages/cli/src/sheet/sheetFile.ts packages/cli/src/command/main.ts packages/cli/src/command/export.ts packages/cli/src/command/__tests__/sheet.e2e.test.ts packages/cli/src/command/__tests__/exportName.test.ts
git commit -m "feat(cli): grid sheet writes the plan as an A3 PDF (VEW-7)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The `grid_sheet` tool

**Files:**
- Modify: `packages/cli/src/mcp/toolkit.ts` (the `object` argument kind),
  `packages/cli/src/mcp/writeTools.ts`
- Test: `packages/cli/src/mcp/__tests__/tools.test.ts`,
  `packages/cli/src/mcp/__tests__/sheetTool.test.ts`

**Interfaces:**
- Consumes: `checkSheetRequest`, `readSheetWords` and `sheetIntoProject` (Task 7);
  `parseSheetWords`, `SheetWordsRefused`, `SHEET_*` limits (Task 1); `readPlan`,
  `projectOf`, `ToolRefusal`, `quoted` and `PATH_MAX` from the toolkit.
- Produces:
  - A new `ArgSpec` member:
    ```ts
    | {
        readonly type: 'object'
        readonly description: string
        readonly examples: readonly Record<string, unknown>[]
        /** The JSON Schema `tools/list` shows. */
        readonly schema: Record<string, unknown>
        /** Checks the value; throws ToolRefusal with one line. */
        readonly read: (value: unknown) => unknown
        readonly required?: boolean
      }
    ```
  - `export const SHEET_TOOL_NAME = 'grid_sheet'`. `WRITE_TOOLS` becomes
    `[exportTool, sheetTool, previewTool, changeOpeningTool, moveSideTool, mirrorTool]`.

- [ ] **Step 1: Write the failing tests**

In `tools.test.ts`:
- add `'grid_sheet'` to `ORDER`, right after `'grid_export'`;
- add `grid_sheet: { plan: 'plan.json', layout: 'check' }` to `CALLS`, after `grid_export`;
- add `'grid_sheet'` to the list on line 92 that skips the read-only checks, next to
  `'grid_export'`;
- in the bad-floor test on line 167, `grid_sheet` takes no `floor`: give it
  `{ plan: 'plan.json', layout: 'check' }`, or skip it there the way that test skips other
  tools without a floor. Read the test to choose.

Create `sheetTool.test.ts`. Model it on an existing tool test in
`packages/cli/src/mcp/__tests__/` (for example `cropView.test.ts`), using its helper to run a
tool against a temporary project:

```ts
describe('grid_sheet (VEW-7)', () => {
  it('writes a check sheet and lists its pages', async () => {
    const reply = await call('grid_sheet', { plan: 'plan.json', layout: 'check' })
    expect(reply.data['written']).toMatch(/exports\/.*-check\.pdf$/)
    expect((reply.data['pages'] as unknown[]).length).toBeGreaterThan(1)
  })
  it('takes the words as an object', async () => {
    const reply = await call('grid_sheet', { plan: 'plan.json', layout: 'client', sheet: { version: '1', name: 'Test House' } })
    expect((reply.data['pages'] as { title: string }[])[0]!.title).toBe('Test House')
  })
  it('refuses words with the check layout', async () => {
    await expect(call('grid_sheet', { plan: 'plan.json', layout: 'check', sheet: { version: '1' } })).rejects.toThrow(/sheet/)
  })
  it('refuses bad words without repeating them', async () => {
    await expect(call('grid_sheet', { plan: 'plan.json', layout: 'client', sheet: { version: '1', headline: 'secret\nwords' } }))
      .rejects.toThrow(/headline/)
  })
})
```

If the helper returns refusals as a reply rather than throwing, assert on the reply instead.
Follow whatever the helper does.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run packages/cli/src/mcp/__tests__/tools.test.ts packages/cli/src/mcp/__tests__/sheetTool.test.ts`
Expected: FAIL. The order lacks `grid_sheet`, and the tool is unknown.

- [ ] **Step 3: Add the `object` kind to the toolkit**

In `toolkit.ts`:
- add the `ArgSpec` member from Interfaces;
- in `argSchema`, before `return rest`, add
  `if (rest.type === 'object') return { ...rest.schema, description: rest.description, examples: rest.examples }`;
- in `checkOne`, add
  `case 'object': { if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ToolRefusal(\`${name} takes an object.\`); return spec.read(value) }`.

Then run `npx vitest run packages/cli/src/mcp/__tests__/tools.test.ts -t "examples"`. If the
test that checks every argument's examples walks the arg types, teach it the `object` kind.

- [ ] **Step 4: Write the tool**

In `writeTools.ts`, after `exportTool`:

```ts
// ---------------------------------------------------------------------------------------------
// grid_sheet

export const SHEET_TOOL_NAME = 'grid_sheet'

const sheetTool: GridTool = {
  name: SHEET_TOOL_NAME,
  title: 'Make a PDF sheet',
  hint: 'write-file',
  description:
    'Use this when the person wants the plan as a PDF to read, print or send: layout client for the person the house is for (a cover with the 3D model and key figures, then a page per floor with its drawing and room areas), or layout check for whoever checks the plan (every id, every room\'s use, and what grid check finds on each floor). '
    + 'The words of a client sheet (name, headline, intro, a few paragraphs per floor) are yours to write: pass them as sheet, or Grid reads sheet.json beside the plan. Grid draws only what the plan holds: no furniture or landscape. Every page carries "General guidance, not your local rules". '
    + 'It writes the PDF into the exports folder beside the plan and answers with the path and what is on each page. It never changes the plan. Do not use for a single picture (grid_view) or a file for another program (grid_export).',
  args: {
    plan: { type: 'string', maxLength: PATH_MAX, required: true, description: 'The plan file, as a path inside the project folder.', examples: ['plan.json'] },
    layout: { type: 'string', required: true, enum: ['client', 'check'], description: 'client or check.', examples: ['client', 'check'] },
    sheet: {
      type: 'object',
      description: 'Client only: the words, as sheet.json holds them. sheet.json beside the plan is read when left out.',
      examples: [{ version: '1', name: 'Solace House', headline: 'A private retreat for one', intro: ['A two-storey home for work and rest.'], floors: { ground: ['The study sits beside the entry.'] } }],
      schema: {
        type: 'object',
        properties: {
          version: { const: '1' },
          name: { type: 'string', maxLength: NAME_MAX },
          headline: { type: 'string', maxLength: SHEET_HEADLINE_MAX },
          intro: { type: 'array', maxItems: SHEET_PARAGRAPHS_MAX, items: { type: 'string', maxLength: SHEET_PARAGRAPH_MAX } },
          floors: { type: 'object', additionalProperties: { type: 'array', maxItems: SHEET_PARAGRAPHS_MAX, items: { type: 'string', maxLength: SHEET_PARAGRAPH_MAX } } },
        },
        required: ['version'],
        additionalProperties: false,
      },
      // Checked against the plan's floors in run(), where the plan is known.
      read: (value) => value,
    },
  },
  outputSchema: objectSchema({ written: STRING, layout: STRING, pages: { type: 'array', items: { type: 'object' } }, note: { type: ['string', 'null'] } }),
  async run(args, context) {
    const layoutArg = args['layout'] as string
    const given = args['sheet'] as Record<string, unknown> | undefined
    try {
      const layout = checkSheetRequest({ layout: layoutArg, sheet: given === undefined ? undefined : 'sheet' })
      const { project, file, loaded } = readPlan(context, args['plan'])
      const words = layout === 'check'
        ? null
        : given !== undefined
          ? parseSheetWords(given, planFloors(loaded.plan).map((floor) => floor.id))
          : readSheetWords(project, file, loaded, undefined)
      const done = await sheetIntoProject(project, file, layout, words)
      const written = project.relative(done.written)
      const lines = [`Wrote ${quoted(written)} in the project folder: ${done.pages.length} pages.`]
      if (done.note) lines.push(done.note)
      return { text: lines.join('\n'), data: { written, layout, pages: done.pages, note: done.note ?? null } }
    } catch (error) {
      if (error instanceof SheetWordsRefused) throw new ToolRefusal(`sheet is not a sheet: ${error.message}.`)
      if (error instanceof UsageError) throw new ToolRefusal(error.message.replace(/--(layout|sheet)\b/g, '$1'))
      throw asRefusal(error)
    }
  },
}
```

Then:
- Change `WRITE_TOOLS` as given in Interfaces.
- In `exportTool.description`, replace "PDF and JPG are not made." with
  "For a PDF to read or print, use grid_sheet; JPG is not made."
- Import what is used: `planFloors`, `NAME_MAX` (from `@ongrid/floorplan/types/planText`, or
  wherever it is exported), the `SHEET_*` limits, `parseSheetWords` and `SheetWordsRefused`,
  `checkSheetRequest`, `readSheetWords`, `sheetIntoProject` and `asRefusal`.
- Check whether `run` may be `async` in `GridTool`. Look at `grid_view`, which draws a PNG,
  and do what it does.

- [ ] **Step 5: Run the tool tests and the replay**

Run: `npx vitest run packages/cli/src/mcp`
Expected: PASS, including `replay/replay.test.ts`. The replay score must hold. If a replayed
conversation now picks `grid_sheet` where it used to pick something else, stop and report it
to the owner. Do not change the expected score.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/mcp/toolkit.ts packages/cli/src/mcp/writeTools.ts packages/cli/src/mcp/__tests__/tools.test.ts packages/cli/src/mcp/__tests__/sheetTool.test.ts
git commit -m "feat(cli): grid_sheet, the PDF sheet as a tool (VEW-7)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Docs, then the whole check

**Files:**
- Modify: `README.md`, `AGENTS.md`

- [ ] **Step 1: The README**

- In the command table, add a row after `grid export`:
  `| grid sheet | Writes the plan as an A3 PDF for people: --layout client, with the words of sheet.json, or --layout check, with ids and findings |`.
- Change "with the 13 tools below" to "with the 14 tools below".
- In the tool table, add after the `grid_export` row:
  `| grid_sheet | Writes an A3 PDF of the plan, client or check, into exports/ |`.
- Add a short `grid sheet` section where the README describes `grid export`. Say:
  - what each layout holds;
  - what `sheet.json` looks like, with the example from the spec;
  - that Grid draws only what the plan holds;
  - that every page keeps the label.
- The install section must still match `installText()`. Don't touch it.

- [ ] **Step 2: AGENTS.md**

- In the `packages/cli` line, add `sheet` to the list of commands.
- Change "13 tools named `grid_…`" to "14 tools named `grid_…`".
- Add a bullet after the `grid mcp` one:
  "- `grid sheet` (VEW-7, `src/sheet/`) writes an A3 PDF of the plan: `pages.ts` decides what
  is on each page from existing code (`planAreas`, `floorElevations`, `planFacts`, `checkPlan`),
  `pdf.ts` lays it out, and the pictures come from `drawPlan` and `drawStill`. The sheet never
  draws or measures a part of its own. `coverage.ts` says what it does with each top-level part
  of `FloorPlan`; a part added to the schema fails the type check there until it is placed.
  Its fonts, Source Serif 4 and Source Sans 3 (OFL 1.1), are in `packages/cli/fonts/`."

- [ ] **Step 3: The whole check, from the repository root**

```bash
npm run typecheck
npm run lint
npm test
npm run scoreboard
npm run check:licenses
```

Expected: every one passes. The scoreboard prints the same five counts as `scoreboard/current.json`.
If something fails, fix it in the task it belongs to, with its own commit. Do not fold the fix
into the docs commit.

- [ ] **Step 4: Commit**

```bash
git add README.md AGENTS.md
git commit -m "docs: grid sheet and grid_sheet in the README and AGENTS.md (VEW-7)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Hand over for testing**

Tell the owner the feature is built and every check passed. They asked for a separate session
to test it, so start one (the parent conversation does this, not a subagent). Its brief:
- make both layouts from the lab's plans in `scoreboard/data`;
- look at every page as a picture;
- compare the PDF's text with `grid check` and `grid_quantities` on the same plans;
- try to break `sheet.json` (long text, odd characters, unknown floors, wrong types);
- call `grid_sheet` through `grid serve`;
- report what it found, without changing code.
````
