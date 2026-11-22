# MSG-6: a fault stays local

Card: "A wrong value no longer refuses the whole plan: Grid reads part by part, names each bad
value by its id, its place and what was expected, sets it aside or reads it as meant, and still
draws and checks the rest. A file that is not plain plan data, an id used twice, and an id Grid
had to change are each named for what they are." Lab evidence MS-6, W-11, U-10, MS-9, AB-7.
Decision of 20 November 2026 (owner): ids stay unique across the whole plan.

## What changed

- **A reader that reads part by part**, `readPlanParts` in
  `packages/floorplan/src/types/readParts.ts` (pure). Each wall, room, opening, floor and fixture
  is checked with the schema's own rules (`WallSchema`, `RoomSchema`, …); a sound plan costs one
  parse, as before. For each value a part cannot be read with, in this order:
  - **read as meant** (`plan/read-as-meant`, worth a look): a number written as text (`"2.5"`,
    `"0.9 m"`), `"true"`/`"false"` for a yes or no, a word that differs from one the format knows
    only in capitals, spaces, dashes or underscores (`"Exterior"`, `"Door"`, `"Start"`, units
    `"M"`), a whole number where an id goes, and `version: 1`.
  - **value left out** (`plan/value-left-out`, worth a look): a field the part can do without.
    Its default is used, or it is read as not stated, and the line says which. A unit other than
    metres (`"mm"`, `"ft"`) is read so: every length is read in metres. That is the reading the
    plan files in the lab had (their numbers were metres) and WRT-7 is where units are read.
  - **part left out** (`plan/part-left-out`, left out): a value the part cannot do without.
  - **never a default for a stated size.** A wall's thickness or height or an opening's sill
    stated out of range, as NaN, with a decimal comma or as a word leaves the part out; only a
    `null` takes the default. Without this rule, a wall stated −0.3 m thick was drawn 0.2 m thick
    and six lab rooms were measured wrong (see the scoreboard below). A floor's `level` is not
    one of these sizes: it only orders the floors, and leaving a floor out would leave out
    everything on it, so an unreadable level takes 0, with its line.
  - What is still wrong at the plan's top level (a `version` Grid does not read, `walls` that is
    not a list, a list past `PARTS_MAX`) refuses the plan with the schema's own refusals, as
    before.
- **The text first**, `readPlanText` in `packages/floorplan/src/types/jsonText.ts` (pure):
  - git's conflict markers (a whole conflict, each marker at the start of a line) give
    `plan/unfinished-merge` (refused): how many conflicts, the line of the first, each side's
    label, and what each side adds or changes, by id (each side read as a whole plan when it is
    one, else the ids on its lines).
  - `NaN`, `Infinity` and a decimal comma inside an object (`"offset": 3,45`) are read as a value
    that is not there, at their place, and the part's line names them ("NaN, which JSON does not
    hold as a number", "3,45, written with a decimal comma"). A comma inside a list is JSON
    (`[4,6,3,3]` is four numbers); a point with four whole numbers says that a decimal comma most
    likely split them. The scan runs only when `JSON.parse` refuses the text, so a sound file
    costs nothing more.
  - `plan/not-json` says the line and column where the text stops being JSON, also when Node's
    message gives no position.
- **Ids** (lab MS-9):
  - Of two parts with one id, only the clash is left out (`plan/id-clash`, in the reader): a wall
    keeps its id because rooms and openings name walls, otherwise the first in the order walls,
    rooms, openings, fixtures. This has to be the reader's job: `validatePlan` marks what it skips
    in one flat set of ids, so it cannot skip a room `x` without skipping wall `x`.
  - Two walls with one id stay `validatePlan`'s (`plan/duplicate-id`, both skipped: a room naming
    the id could mean either). Its line now says how many parts of which kinds share the id and
    an id to rename one to (`"hk-2"`).
  - A blank id (`plan/blank-id`) and an id that differs from an earlier one only in capitals or
    spaces (`plan/similar-id`) are refused in `validatePlan`, so plans built in code get them too:
    the later part is skipped and named with the one it looks like; the earlier keeps its id.
- **`validatePlan(plan, index, { leftOutWalls })`**: the walls the reader left out. A room or an
  opening on one is skipped, and its line names the wall and says it was left out when the plan
  was read, not that it "rests on an invalid wall".
- **The rooms-first writer** (AB-7): an id written once is already kept as written; an id written
  on more than one floor takes its floor's id in front, as before, and now a warning
  `rooms/id-changed` gives the map ("'bath' is 'ground-bath' on floor 'ground' and 'first-bath'
  on floor 'first'"), printed by `grid write` and `grid_write_rooms`.
- **The front door** (`inspectPlan`) reads text with `readPlanText` and every plan with
  `readPlanParts`; the reading lines lead the record. `grid check` gives the record the file's
  text (`LoadedPlan.text`), so the record says what the reader did.
- **The command** (`loadPlan`): reads part by part, names an unfinished merge, and keeps its old
  messages for text that is not JSON (the paths tests pin them). `draw`, `export` and the views
  say on standard error how many parts were left out (by id, or place) and how many values were
  read otherwise than written. **`grid tidy`, `grid write` and every tool that changes the plan
  read it whole** (`loadPlan(…, { whole: true })`): they write the file back, and reading it
  part by part would drop what the reader left out. They refuse as before, with the schema's
  words, or for an id clash or NaN with the reader's.
- **The scoreboard** runner reads plans with `readPlanParts` (and lab plans' text with
  `readPlanText`), as Grid's commands and front door do. Its comment says the reference commit
  needs `parseFloorPlan` there.
- The contract (`docs/result-contract.md`): seven codes in the table, a paragraph under
  "Refusals" and a changelog entry. Catalogue entries in `packages/rules/src/result/catalogue.ts`.
  Each new code has one wording: the value and its place are in `found`, what the format takes in
  `needed`, as the refusal codes already do, so the front door's "one wording per code" test holds.

## The lab cases, before and after

| Case | Before | After |
|---|---|---|
| MS-6, W-11: the 504 damaged plans the schema refused | refused, a position | each read; the damaged value named by id and place (504 of 504 in a probe of the damage set); the rest checked |
| MS-6: f09 negative offset, f17 "0.9 m", f17b NaN, f17c null, c-comma in quotes | refused | read; the opening left out, or the value read as meant or defaulted, each said |
| U-10: a file with conflict markers | "Unexpected token <" | `plan/unfinished-merge`: one conflict between "agent-a" and "agent-b", the first at line 1, and what each adds |
| MS-9: townhouse room and wall sharing an id | 6 rooms unmeasured per copy | only the clashing room left out; the three landings measured, and right against the referee |
| MS-9: ids "s" and "s " or "S" | both read, nothing said | the later refused (`plan/similar-id`), named with the first |
| MS-9: a blank room id | read | refused (`plan/blank-id`) |
| AB-7: rooms text on two floors | ids changed in silence | unique ids kept; the changed ones listed (`rooms/id-changed`) |

## Expected figures and texts changed, and why

- `packages/floorplan/src/geometry/__tests__/validation.test.ts`: the known failure `MS-9 two ids
  that differ only by a trailing space are reported` passes now. Its `it.fails` became `it`, in a
  block "lab failures fixed by MSG-6", and it asserts the one error (`plan/similar-id` on `w1 `)
  and that only `w1 ` is skipped. Noted in `test-support/pinned-tests.md`, with why the pinned
  `catches a collision between two different kinds of entity` stays as it is (it holds for
  plans built in code; read plans have the clash taken out first).
- `packages/rules/src/result/__tests__/result.test.ts`:
  - "never throws": the odd input `{ walls: [{ id: 3 }] }` is read now (the wall is left out),
    so it is replaced by `{ version: '2' }`, which is still refused.
  - "refuses a plan the format refuses by place and thing": a wall with `thickness: 'thick'` and
    `kind: 'Exterior'` is read now. The test became two: a refusal at the top level (version and
    `walls` not a list, never repeating the text), and the wall read part by part (`null`
    thickness takes the default, `Exterior` read as `exterior`).
- `packages/cli/src/mcp/__tests__/contract.test.ts`: its "plan the format refuses" had a wall
  with thickness −1, which is now read with the wall left out. It states `version: '2'` too.
- `packages/cli/src/__tests__/safety.test.ts`: `refuses 100,000 levels of nesting with an
  ordinary message` became `reads 100,000 levels of nesting as a part it leaves out`: the nested
  list is `walls[0]`, which is left out, and the plan is read. It adds the same depth inside a
  part (no deep copy is made: `structuredClone` overflowed the stack there, so the reader copies
  only along the path it changes), and that a whole read still refuses it.
- `scoreboard/__tests__/frontDoor.test.ts`: plans refused 504 → 0. Its wording check also folds
  "The wall at walls[N]", the name of a part whose id cannot be read, into the thing.
- `plan/duplicate-id`'s sentence (validatePlan) now names the parts and a rename; no test pinned
  the old one. `room/broken-wall` and `opening/broken-wall` keep their sentences for a wall that
  cannot be drawn.

## The scoreboard

SCOREBOARD_FIGURES

## For the owner

- **A unit other than metres is read as metres, with a line.** The alternative, refusing the
  plan, would keep the 25 damaged plans with `units` "mm", "cm" or "ft" refused, against the
  card. Converting the numbers is WRT-7's.
- **A stated size is never replaced by a default** (see above). The lab's own layer (W-11) used
  the default; doing so here measured six lab rooms wrong, so the part is left out instead. A
  `null` still takes the default.
- **A required name that cannot be read leaves the room out** (a name with a line break, a
  missing name). Reading the id as the name would invent text the plan did not write.
- **Blank and near-equal ids leave the later part out**, as the card asks ("refused"). On the lab
  plans that costs 11 rooms that were measured before (walls `s` and `S`, `s` and `s `, a room
  with id `""`).
- **Wall kinds `"external"`, `"outer"`** are read as not stated (interior), with a line. They are
  not one letter away from `"exterior"`, so they are not read as meant; MSG-13 works out the kind
  from the rooms on each side anyway.
- **Commands that write the plan read it whole.** A plan with a part left out can be checked,
  drawn and exported, but not tidied, rewritten or changed by a tool until the part is fixed by
  hand. Reading part by part there would write the file back without it.

## For the other sessions

- **MSG-4** (`claude/cranky-newton-bf5800`) changes the same lines: `readPlan` in
  `packages/rules/src/result/inspect.ts`, `LoadedPlan` in `packages/cli/src/command/plan.ts`
  (`raw`), `check.ts` (`inspectPlan(loaded.raw ?? plan, …)`) and `writeTools.ts`. Merging: keep
  MSG-6's `readPlan` (text first, part by part), and run MSG-4's `readingLines` on the same raw
  value when the plan was read; `check.ts` can pass `loaded.text ?? plan` (it carries the marks
  as well as the raw fields). The `writeTools.ts` change is the same in both.
- `ReadFault` and `PartRef` are exported from `@ongrid/floorplan/types/readParts`, `readPlanText`
  from `@ongrid/floorplan/types/jsonText`.

## Checks run

CHECKS_RUN
