# The result contract

This is what Grid tells an agent about a plan, written down before more is built on it
(MSG-1). It covers the result record, refusals, the receipts of the tools that change or
write something, the promise about what may change, and a changelog for agents. A new entry
goes at the top of that changelog; the release step puts the release's heading above the
entries it ships, so an entry under a release heading shipped in that release (QAR-10,
RELEASING.md).

Every record, every rendering of it and every report starts with the label "General
guidance, not your local rules". No line says a plan complies, passes or is approved: a
record with no lines only means these checks found nothing.

The code is `packages/rules/src/result/` (`types.ts` for the record, `catalogue.ts` for the
codes, `inspect.ts` for the front door). Tests hold the code to this file:
`packages/rules/src/result/__tests__/contract.test.ts` fails when a code is in one and not
the other.

## The front door

```ts
import { inspectPlan } from '@ongrid/rules'

const result = inspectPlan(raw, { country: 'ES' })
```

`inspectPlan(raw, options?)` takes the plan as parsed JSON, or as its text, and the options of
the full check (`country`, `figures`). It reads the plan, runs every check, and returns one
record. It never throws: a check that fails inside Grid becomes a line
(`plan/check-failed`), and the other checks still run. Run over the 3,000 damaged plans and
442 sound plans of the scoreboard, it gives 0 exceptions and 0 failed checks
(`scoreboard/__tests__/frontDoor.test.ts`).

`grid check` prints the record (`--json` gives it as `result`), and `grid_check` returns its
`count` and `lines` beside the older lists, which it keeps for now.

## The record

| Field | What it holds |
|---|---|
| `resultVersion` | `1`. Raised only when a field changes meaning or is taken away. |
| `label` | "General guidance, not your local rules". |
| `read` | `false` when the plan was refused. Then the lines are its refusals and nothing else ran. |
| `count` | How many lines there are: the one number for how much there is to look at. |
| `counts` | The same lines by kind. They add up to `count`. |
| `lines` | Every line, in the order of the kinds below. Lines of one kind keep the order their check gave them. |
| `basis` | `general-baseline`, or `local-lookup` once a looked-up figure was applied. |
| `lookupNotice` | Only with `local-lookup`: the figures were found by an AI and not checked by a person. |
| `checks` | Every check that ran and looked at something, with where its figures come from. A check that looked at no room, floor or door is not listed (MSG-2). Empty when the plan was refused. |
| `coverage` | What each check looked at and skipped, one entry per check Grid has, whether it ran or not. See "What each check looked at". Empty when the plan was refused. |
| `figures` | Every figure a check applied, with its document, edition, clause, place, day read and status. The figures of a check that looked at nothing are not listed. |
| `limits` | What these checks never look at, whatever the plan. The same lines every time. |

### A line

| Field | What it holds |
|---|---|
| `code` | Stable: `<thing>/<what>`, lowercase words joined by dashes. One of the codes below. |
| `kind` | `refused`, `left-out`, `worth-a-look`, `finding` or `not-checked`. |
| `thing` | `{ kind, id }`: the plan (id `""`), a floor, a wall, a room or an opening. |
| `floor` | The id of the floor the thing is on. `null` for the plan as a whole, and for an opening on a wall the plan does not have. |
| `also` | The ids of the other parts the line names: the wall a door hits, the rooms a finding names. |
| `message` | The one wording of the code, with the plan's names in quotes and the figures filled in. |
| `found` | What was found, in words and figures. For a problem in the drawing it is the check's own sentence. |
| `needed` | What would be right. |
| `fix` | What to change. A suggestion: the plan is the author's. |
| `figures` | Only on a finding that compared the plan with a figure: those figures, as in `figures` above. |

### The kinds, in list order

1. `refused`: the plan could not be read. Nothing else was checked.
2. `left-out`: a part that cannot be drawn. Every view, measure and export skips it.
3. `worth-a-look`: a part that is drawn and is very likely a mistake, door sweeps among them.
4. `finding`: what a plan check found: a way out, a door, a room's size, an escape window.
5. `not-checked`: what a check could not look at in this plan, and why.

### One wording per code

A line's `message` is made by its code's wording in `catalogue.ts`, and nowhere else. A
finding's wording is its check's own (`checks/messages.ts`, and `planCheckWordings` in
`@ongrid/floorplan`), so the report's `message`, the notes a person reads and the record say
the same words. A test fails when one code is worded two ways (AU4-1).

## The codes

`{thing}` is the part as a line names it: `Wall "w1"`, `Door "d1"`, `Room "Kitchen"`, `Floor
"Ground floor"`, a fixture by its kind (`Toilet "wc1"`, CNT-12) or `The plan`. Names in quotes are the plan's own text.

| Code | Wording | Needed |
|---|---|---|
| `plan/not-json` | The plan is not JSON | a plan file in JSON |
| `plan/not-an-object` | The plan is not a JSON object | one JSON object with walls, rooms and openings |
| `plan/missing-field` | {thing} is missing a field the format needs | {wanted} at {place} |
| `plan/wrong-type` | {thing} has a field of the wrong type | {wanted} at {place} |
| `plan/unknown-word` | {thing} has a word the format does not know | {wanted} at {place} |
| `plan/out-of-range` | {thing} has a value out of range | {wanted} at {place} |
| `plan/not-in-format` | {thing} has a field the format cannot read | {wanted} at {place} |
| `plan/check-failed` | A check could not run on this plan: something went wrong inside Grid | the check to run to the end |
| `plan/far-from-origin` | The plan reaches more than 500 m from the origin | every point within 500 m of the origin (0, 0) |
| `plan/duplicate-id` | Id {thing} names more than one wall, room or opening | every id on one wall, room or opening only |
| `plan/similar-floor-id` | {thing} has an id that differs from another floor's only in capitals or spaces | floor ids that differ in more than capitals or spaces |
| `plan/duplicate-floor` | {thing} is listed more than once | each floor listed once |
| `plan/units-question` | The plan may not be in metres | every length in metres |
| `plan/level-gap` | The plan skips a floor level | floor levels with no gap, or an elevation in metres on each floor |
| `plan/same-level` | {thing} is at the same level as another floor | each floor at its own level, or an elevation in metres on each |
| `wall/too-large` | {thing} has a number Grid does not accept | finite numbers within the size Grid accepts |
| `wall/zero-length` | {thing} has no length | a start and an end at different points |
| `wall/no-thickness` | {thing} has no thickness | a thickness above 0, or a virtual wall for a line with no substance |
| `wall/no-height` | {thing} has no height | a height above 0, or a virtual wall for a line with no substance |
| `wall/unknown-floor` | {thing} is on a floor the plan does not list | a floor from the plan's floors |
| `wall/kind-differs` | {thing} is stated as one kind, but the rooms on its sides show another | a kind that matches the rooms on its sides |
| `wall/size-question` | {thing} has a size that may not be meant | the size of a wall in a building |
| `wall/short` | {thing} stops short of a corner | wall ends that meet at the corner |
| `wall/gap` | {thing} leaves a gap in a straight side of a room | the walls of a side meeting end to end |
| `wall/overrun` | {thing} runs past its corner | a wall that ends at its corner |
| `wall/duplicate` | {thing} lies over another wall | each wall drawn once |
| `wall/line-on-wall` | {thing} is a dividing line drawn over a wall | a wall or a dividing line, not both |
| `wall/crosses-room` | {thing} runs across a room that does not list it | every wall across a room listed by the rooms on its sides |
| `wall/stands-in-room` | {thing} stands inside a room that does not list it | a wall inside a room drawn as part of a room |
| `wall/above-storey` | {thing} is higher than the storey its floor states | walls no higher than their floor's stated height |
| `opening/too-large` | {thing} has a number Grid does not accept | finite numbers within the size Grid accepts |
| `opening/broken-wall` | {thing} is on a wall that cannot be drawn | a wall that can be drawn |
| `opening/missing-wall` | {thing} is on a wall that is not in the plan | the id of a wall in the plan |
| `opening/degenerate` | {thing} has no size | a width and a height above 0 |
| `opening/out-of-wall` | {thing} runs off its wall | its offset and width within the wall's length |
| `opening/too-tall` | {thing} reaches above the top of its wall | its sill and height together no higher than the wall |
| `opening/negative-sill` | {thing} has its sill below the floor | a sill at 0 or above |
| `opening/overlap` | {thing} overlaps another opening on its wall | openings on one wall that share no part of it |
| `opening/size-question` | {thing} has a size that may not be meant | the size of a door or window in a building |
| `opening/swing-without-hinge` | {thing} says which way it opens but not which side it hangs on | both its hinge ("start" or "end") and its swing ("left" or "right") |
| `opening/hinge-without-swing` | {thing} says which side it hangs on but not which way it opens | both its hinge ("start" or "end") and its swing ("left" or "right") |
| `opening/door-blocked` | {thing} hits a wall when it opens | floor clear of walls where its leaf swings |
| `opening/doors-collide` | {thing} hits another door when they open | door sweeps that do not overlap |
| `room/unknown-floor` | {thing} is on a floor the plan does not list | a floor from the plan's floors |
| `room/cross-floor` | {thing} rests on a wall of another floor | every wall it lists on its own floor |
| `room/broken-wall` | {thing} rests on a wall that cannot be drawn | walls that can be drawn |
| `room/empty` | {thing} encloses no floor | walls that enclose some floor |
| `room/unclosed` | {thing} cannot be closed from the walls it lists | at least three walls in the plan, each meeting the next, round the room |
| `room/out-of-order` | {thing} lists its walls out of order | its walls in order round the room, each meeting the next |
| `room/inside-out` | {thing} has walls thicker than the gap between them | inner wall faces that do not cross |
| `room/hole-outside` | {thing} has a hole that does not lie inside it | a hole inside the room, with floor all round it |
| `room/holes-overlap` | {thing} has two holes that overlap or touch | floor between any two holes |
| `room/derived-edited` | {thing}'s boundary was changed by hand in a plan written rooms first | walls worked out from the rooms text |
| `room/not-enclosed` | {thing} is not enclosed by its walls | walls that reach each other round the room |
| `room/space-mismatch` | {thing} does not match the space its walls enclose | a room that covers the space its walls close off, and no more |
| `room/inside-no-host` | {thing} is marked as inside another room, but no room holds it | a room on its floor that holds it |
| `room/overlap` | {thing} overlaps another room | rooms that share no floor, or one marked inside the other |
| `room/overlap-unknown` | {thing} could not be compared with another room to see whether they overlap | room outlines Grid can compare |
| `room/wall-listed-twice` | {thing} lists a wall more than once | each wall once in its list |
| `room/size-question` | {thing} has a size that may not be meant | the size of a room in a building |
| `room/offset-question` | {thing} stands far above or below its storey's floor | a room's step within what a storey holds, or a floor of its own |
| `item/too-large` | {thing} has a number Grid does not accept | finite numbers within the size Grid accepts |
| `item/no-size` | {thing} has no size | a width, a depth and a height above 0 |
| `item/unknown-kind` | {thing} is a kind the plan does not hold yet | a fixture kind: "toilet", "basin", "shower", "bath" or "kitchen-run" |
| `item/duplicate-id` | {thing} has an id another part of the plan has too | an id of its own on every item |
| `item/unknown-floor` | {thing} is on a floor the plan does not have | a floor of the plan |
| `item/outside-rooms` | {thing} stands in no room | its middle inside a room on its floor |
| `item/into-wall` | {thing} runs into a wall | its footprint clear of the walls, against their faces at most |
| `item/too-tall` | {thing} is taller than the room it stands in | a fixture no higher than its room |
| `floor/unclaimed` | {thing} has enclosed floor that no room claims | every enclosed floor in a room |
| `floor/empty-top` | {thing} is the top floor and has nothing drawn on it | a top floor with something on it |
| `floor/size-question` | {thing} states a height that may not be meant | the height of a storey in a building |
| `floor/spaces-unknown` | The spaces the walls enclose on {thing} could not be worked out | walls Grid can join into spaces |
| `floor/overlaps-unknown` | The rooms on {thing} were not all compared to see whether they overlap | fewer pairs of rooms lying over each other |
| `floor/no-exit` | "{floor}" has no door to the outside | at least one door to the outside |
| `room/no-door` | "{name}" has no door or opening to another space | a door, an opening or an open side to another space |
| `room/no-route-out` | "{name}" has no route to a door to the outside | a route through doors and openings to a door to the outside |
| `room/no-route-to-door-out` | "{name}" has no route to a door to the outside, nor to a door into a space that is not drawn | a route to a door to the outside, or to the door into the space not drawn |
| `opening/to-undrawn-space` | A door from "{name}" leads to a space that is not drawn as a room | a room, or the outside, on the far side |
| `opening/door-out-above-ground` | A door from "{name}" leads outside {height} m above the ground, so it is not a way out | a way out at ground level, or stairs the plan cannot hold yet |
| `opening/too-small-to-pass` | An opening from "{name}" is too small for a person to pass through, so it is not a way through | at least {width} m wide or {height} m high, or a sill no more than {sill} m above the floor: Grid's own size for a person to pass, not a code figure |
| `room/too-small` | "{name}" is under {minimum} m² | at least {minimum} m² |
| `room/no-escape-opening` | "{name}" has no window or door to escape through | a window or door to the outside that someone can climb through |
| `room/escape-window-too-small` | The window of "{name}" is too small to escape through | a window someone can climb through |
| `room/escape-window-too-high` | The window of "{name}" is too high to escape through | a lower sill |
| `floor/not-checked-no-stairs` | The way out of "{floor}" was not checked: the plan has no stairs | stairs, which the plan cannot hold yet |
| `floor/not-checked-way-out-not-drawn` | The way out of "{floor}" was not checked: its only door out leads to a space that is not drawn | the space beyond its doors drawn as a room, or a door to the outside |
| `floor/not-checked-rooms-not-drawn` | On "{floor}", rooms that could not be drawn were not checked: "{room}", … | rooms that can be drawn |
| `floor/not-checked-doors-not-drawn` | On "{floor}", some doors could not be drawn and were not checked | doors that can be drawn |
| `floor/not-checked-no-use` | On "{floor}", room sizes were not checked in rooms with no use stated: {count} | a use on every room (bedroom, living, dining and so on) |
| `plan/not-checked-sizes-for-place` | Room sizes were not checked: the figures here are from US model codes, and this plan is for {country} | figures for the place, looked up and given to the check |
| `plan/not-checked-escapes-for-place` | Escape openings were not checked: the figures here are from US model codes, and this plan is for {country} | figures for the place, looked up and given to the check |
| `floor/not-checked-above-escape-storeys` | On "{floor}", escape openings were not checked in bedrooms: the figures here cover bedrooms up to the third storey: {count} | figures for escape from bedrooms above the third storey, which these checks do not carry |
| `plan/not-checked-no-rooms` | No check that looks at rooms ran: the plan has no rooms | the rooms drawn on the walls, each with the walls round it and its use |

A code is never reused for another meaning. Until the drawing's checks give their figures as
data, `found` for a problem in the drawing is the check's own sentence, and figures are in it.

## What each check looked at

`coverage` has one entry for each check Grid has (MSG-2), in the order of `checks`, the plan
checks first, then the figure checks, whether it ran or not:

| Field | What it holds |
|---|---|
| `ruleId`, `title` | The check, as in `checks`. |
| `looksAt` | What it looks at: `floor`, `room` or `door` (doors and openings). |
| `lookedAt` | The parts it looked at, by floor: `{ floor, ids }`, the ids sorted. |
| `lookedAtCount` | How many parts that is. |
| `skipped` | The parts it did not look at, by floor and reason: `{ floor, ids, reason, why }`. `floor` is `""` for the whole plan. |
| `skippedCount` | How many parts that is. |
| `findings` | How many findings it gave. |

A check that looks at rooms has every room of the plan under `lookedAt` or under `skipped`,
so a record with no findings says what it is: these parts were looked at and nothing was
found in them. A `reason` is one of:

| Reason | Why |
|---|---|
| `no_figures_for_place` | no figures for the place the plan is for: the ones here are from US model codes |
| `no_rooms` | no rooms on the floor |
| `cannot_be_drawn` | could not be drawn |
| `no_stairs` | on a floor Grid cannot follow down to the ground floor |
| `way_out_not_drawn` | the floor's only door out leads to a space that is not drawn |
| `alone_off_ground` | the only room on a floor off the ground, reached by a stair the plan does not draw |
| `above_escape_storeys` | above the third storey, where the figures here stop |
| `no_use` | no use stated |
| `use_not_covered` | the check is not about rooms of its use: only bedrooms are checked for escape, and only bedrooms, living and dining rooms for size |

Every reason but `use_not_covered` is something the check could not look at. Where a whole
floor or plan was skipped for one of those, a `not-checked` line says so too; `coverage` holds
the rest, room by room. `grid check` prints the count of rooms looked at by at least one check
beside the count of lines, then each check with what it looked at and skipped; `grid_check`
returns `coverage` and says the same counts in its text.

## Numbers and their state

Every area Grid gives carries a state (MSG-2, lab AA-12, AC-9), one of:

- `proven`: every room it is made of was measured, and nothing in the drawing questions them.
  A sum of no rooms is 0, and proven.
- `not-proven`: a room it should hold could not be measured, or the drawing questions a room's
  outline (`room/not-enclosed`, `room/space-mismatch`, `room/overlap`, `room/overlap-unknown`,
  `room/inside-no-host`). It names those rooms.
- `not-looked-at`: nothing it would be made of could be measured. A room that cannot be drawn
  has no area (`net: null`), never 0.

`grid_areas` gives each room its `state` and `doubts` (the codes above), and `states` for each
figure of each floor (`net`, `byUse`, `circulation`, `grossInternal`, `grossExternal`) and for
each total (`net`, `circulation`, `grossInternal`, `grossExternal`, `circulationShare`,
`netToGross`). Each holds `state`, `leftOut` and `notProven`, the rooms as `{ floor, id, name }`.
A total that left a room out names it, in `leftOut`, in its text ("not proven: leaves out
"Kitchen", which could not be measured") and in a note. The CSV has a `state` column.

## Refusals

A plan is refused when it is not JSON, not a JSON object, or does not fit the plan format.

- In the record: `read: false`, and one `refused` line for each place the format refuses,
  with the part it is in when its id can be read, the place (`walls[2].thickness`) and what
  the format wants there. A refusal never repeats the text it found: that text is someone
  else's.
- `grid` commands: exit code 1 and one line on standard error that starts `grid: `. A wrong
  command line is exit code 2.
- The tool server: a refusal is a tool result marked as an error (`isError: true`) with one
  line of text. That holds for every tool and every reason: arguments that are not an object,
  an argument the tool does not take, a value out of range, a plan that is not there, a plan
  the format refuses, a change that would break the drawing. JSON-RPC errors are kept for a
  request that is malformed: text that is not JSON (-32700), JSON that is not a request
  (-32600), a method the server does not have (-32601), a tool the server does not have and
  bad parameters to the protocol itself (-32602), and a protocol version Grid does not speak
  (-32022). `packages/cli/src/mcp/__tests__/contract.test.ts` holds the server to this.

## Receipts

What a tool that writes or changes something returns when it has done it. Each also returns
its text, which says the same.

| Tool | Receipt (`structuredContent`) |
|---|---|
| `grid_export` | `written` (the file, inside the project), `format`, `leftOut` (parts that could not be drawn), `note`. |
| `grid_sheet` | `written`, `layout`, `pages` (kind, title, floor), `leftOut`, `note`. |
| `grid_preview` | `floor`, `view`, `room`, `note`. It writes nothing. |
| `grid_change_opening`, `grid_move_room_side`, `grid_mirror`, `grid_merge_rooms`, `grid_split_room`, `grid_add_room`, `grid_stretch`, `grid_rename_room` | `written` (the plan's path in the project, never the full path), `changed` (each change in words), `verdict` (the plan before and after), `drawingProblems` and `toLookAt` (the record's `count`), each `before` and `after`, `doors` (each door that now joins other rooms), `guessed` (what the request left open and Grid chose) and `couldNotKeep` (what the change could not keep as it was). `grid_rename_room` adds `checks`: the ids of the figure rules that now look at the room (`now`) and no longer do (`noLonger`). |

A change that would add a problem that leaves a part out is refused, and nothing is written.

## What may change

- Codes, field names and kinds stay as they are within `resultVersion` 1. A new code, a new
  field or a new kind of thing may be added: read a line by its `code`, and treat a code you
  do not know as worth a look.
- A wording may be improved. It changes in one place and is listed below. Match on `code`,
  never on `message`.
- `found`, `needed` and `fix` may say more as the checks give their figures as data.
- The order of lines within a kind follows the checks and may change.
- A code that changes meaning, or a field taken away, raises `resultVersion`.

## Changelog for agents

### 2026-11-22: version 1 (WRT-3)

- Five changes to the plan are new tools and `grid edit` verbs: `grid_merge_rooms`,
  `grid_split_room`, `grid_add_room`, `grid_stretch` and `grid_rename_room`.
  `grid_change_opening` moves and places an opening (`room`, `side`, `from`, `distance`);
  `grid_move_room_side` takes an inside size (`to`).
- Every edit receipt adds `guessed` and `couldNotKeep`. No new message code: refusals of an
  edit are one line, as before.
- An opening may state `anchor` in the plan file: what Grid's edits keep its place from.

### 2026-11-22: what each check looked at (MSG-2)

- The record adds `coverage`: for each check, the floors, rooms or doors it looked at and those
  it skipped, with the reason and a count (lab CH-1, CH-4).
- `checks` lists only the checks that looked at something, and `figures` only their figures. A
  plan whose rooms state no use no longer lists the room-size and escape checks as applied.
- Two new `not-checked` codes: `floor/not-checked-above-escape-storeys`, for the bedrooms of a
  floor above the third storey, which the escape check used to pass in silence, and
  `plan/not-checked-no-rooms`, for a plan with no rooms (`{}` among them).
- `grid check` prints "Looked at by at least one check: N of M rooms" and what each check
  looked at. `grid_check` returns `coverage`.
- `grid_areas` marks every area and total with a state, and names the rooms a total left out.
  See "Numbers and their state".

### 2026-11-22: MSG-18

- New finding `opening/too-small-to-pass`: a door or doorless opening narrower than 0.4 m,
  lower than 1.2 m, or with its sill more than 0.3 m above its floor is named and is no longer
  a way through. These are Grid's own sizes (`passableWidth`, `passableHeight`,
  `passableSill` in the tolerance table), not code figures. A room or floor that had only such
  an opening now also gets `room/no-door` or `floor/no-exit`. The finding carries `passage`:
  what it falls short of, its size there as drawn and the passable size.
- The limits line "Which way a door opens, and how wide doors and corridors are, are not
  checked" now ends ", beyond whether a person fits through a door at all".

### 2026-11-22: fixtures (CNT-12)

- A line can be about a fixture: `thing.kind` is `item`, its id the item's id, and `{thing}` its
  kind and id (`Toilet "wc1"`). Version 1 still: a kind of thing was added, none changed.
- New codes, all from the plan's `items`: `item/too-large`, `item/no-size`, `item/unknown-kind`,
  `item/duplicate-id` and `item/unknown-floor` leave the fixture out; `item/outside-rooms`,
  `item/into-wall` and `item/too-tall` are worth a look. A kind the plan does not hold yet (a
  table, a chair) is `item/unknown-kind`: the fixture is left out and nothing else changes.
- A refusal inside `items` names the item (`thing.kind` `item`) when its id can be read.

### 2026-11-21: version 1 (MSG-1)

- `inspectPlan` and the record are new. `grid check` prints the record as one list, "To look
  at (N)", in place of the separate "Findings", "Not checked" and "Problems in the drawing"
  sections; door sweeps are in it for the first time. `grid check --json` adds `result`.
- `grid_check` returns `count` and `lines`; its text leads with "To look at". It keeps
  `findings`, `notChecked` and `drawing`, which a later version may remove.
- The edit tools' receipts add `toLookAt`.
- The plan-only check in `@ongrid/floorplan` is now `checkPlanSanity`. Only `@ongrid/rules`
  exports `checkLocalRules`, so importing the wrong one no longer compiles.
- Notes a person reads now carry the report's wording as their title ("has no route to a
  door to the outside", no longer "has no way out").
- Codes from LVL-1 and LVL-7 have their entries: `plan/level-gap`, `plan/same-level`,
  `wall/above-storey`, `room/offset-question`, `floor/empty-top`, `floor/size-question` and
  the finding `opening/door-out-above-ground`. `plan/same-level` is about the floor it names.
- Two notices have one wording for one room or many: "On "Ground floor", rooms that could not
  be drawn were not checked: …" and "On "Ground floor", room sizes were not checked in rooms
  with no use stated: N".
