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
`count` and `lines` beside the older lists, which it keeps for now. Both print a short report by
default, and the whole one on request (MSG-10, see "The short report, and seen notes").

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
| `figures` | Every figure a check applied, with its document, edition, clause, place, day read, status and `readFor`, the kind of building it was read for (`homes` for every figure today). The figures of a check that looked at nothing are not listed. |
| `limits` | What these checks never look at, whatever the plan. The same lines every time. |

### A line

| Field | What it holds |
|---|---|
| `code` | Stable: `<thing>/<what>`, lowercase words joined by dashes. One of the codes below. |
| `kind` | `refused`, `left-out`, `worth-a-look`, `finding` or `not-checked`. |
| `thing` | `{ kind, id }`: the plan (id `""`), a floor, a wall, a room, an opening, a fixture (`item`, CNT-12) or a stair (LVL-3). |
| `floor` | The id of the floor the thing is on. `null` for the plan as a whole, and for an opening on a wall the plan does not have. |
| `also` | The ids of the other parts the line names: the wall a door hits, the rooms a finding names. |
| `message` | The one wording of the code, with the plan's names in quotes and the figures filled in. |
| `found` | What was found, in words and figures. For a problem in the drawing it is the check's own sentence. |
| `needed` | What would be right. |
| `fix` | What to change. A suggestion: the plan is the author's. |
| `figures` | Only on a finding that compared the plan with a figure: those figures, as in `figures` above. |
| `fixes` | Only where a change to one part would clear the line (MSG-7): each such change as data, `{ part: "opening", id, width \| offset \| height \| sill \| wall }`. Several when more than one would do. `width` keeps the opening's start; `wall` is the id most likely meant. In `grid_check`, each line with fixes also carries `calls`: the same changes as calls to `grid_change_opening`, with the plan argument, ready to send. A `wall` fix has no call: no tool sets an opening's wall. |

### The kinds, in list order

1. `refused`: the plan could not be read. Nothing else was checked.
2. `left-out`: a part that cannot be drawn. Every view, measure and export skips it.
3. `worth-a-look`: a part that is drawn and is very likely a mistake, door sweeps among them;
   and first, what the file says that Grid does not read (below).
4. `finding`: what a plan check found: a way out, a door, a room's size, an escape window.
5. `not-checked`: what a check could not look at in this plan, and why.

### A line's number

A line's number is its place in `lines`, counting from 1. `grid check` prints it before the line,
and keeps it when only one floor is shown (`--floor`), so a floor's lines can skip numbers.
`grid draw` and `grid_view` mark each line with the same number on the part it is about, and
list them under the drawing (MSG-8). The numbers follow the record the drawing was made from:
`grid check --country` can add lines, and with them change the numbers after them.

### One wording per code

A line's `message` is made by its code's wording in `catalogue.ts`, and nowhere else. A
finding's wording is its check's own (`checks/messages.ts`, and `planCheckWordings` in
`@ongrid/floorplan`), so the report's `message`, the notes a person reads and the record say
the same words. A test fails when one code is worded two ways (AU4-1).

### The label, and words no line uses

The label "General guidance, not your local rules" is the first line of every report and every
list Grid prints or a tool answers, and every tool answer carries it as `label` in its data
(MSG-3). Drawings carry it in their top-left corner, and every export file in a place its
format keeps: a text over the plan in DXF, the header and the project's description in IFC,
`asset.extras.label` in GLB, the first comment in OBJ, the first cell of a CSV, a comment on
the first line of rooms text, and the footer of every sheet page.

No line Grid writes holds pass, complies, compliant, approved, meets code or their kin, outside
the user's own quoted text (`approvalWords` in `@ongrid/rules`; message codes in brackets are
identifiers and are left out). A figure is given as the figure used here, with its basis (the
document, edition and clause, or where it was looked up) and its status, never as what the
plan or the reader needs. A check that looked at nothing says "Nothing was checked for …".
`scoreboard/__tests__/approvalWords.test.ts` holds the reports and the exports of the lab's
plans to this, and `src/__tests__/label.test.ts` in `packages/cli` holds every output to the
label.

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
| `plan/unknown-field` | {thing} has a field Grid does not know, "{field}" | one of the fields of {part}: … |
| `plan/note-no-place` | Note "{id}" names a room the plan does not have, so it is not drawn | a room id from the plan, or a point (at) |
| `plan/front-not-said` | The front names wall "{id}", which the plan does not have, so no front is said | a wall that faces outside, or an opening in one, such as the front door |
| `plan/y-down` | The plan says its y runs down the page, so every drawing and export shows the building mirrored; which way its walls face is read the right way round | a plan whose y runs up the page, as Grid draws it |
| `plan/unknown-use` | Room "{name}" has a use Grid does not know, "{use}" | one of the uses Grid knows: bedroom, living, … |
| `plan/empty` | The plan has nothing in it: no walls, rooms or openings | walls, and the rooms and openings they hold |
| `plan/unfinished-merge` | The plan holds an unfinished git merge | one plan, with the merge finished |
| `plan/part-left-out` | {thing} is left out: a value it needs cannot be read | {wanted} at {place} |
| `plan/value-left-out` | {thing} has a value the format cannot read, and is read without it | {wanted} at {place} |
| `plan/read-as-meant` | {thing} has a value written another way, and it is read as meant | {wanted} at {place} |
| `plan/blank-id` | {thing} is left out: its id is blank | an id of its own on every part, with more than spaces in it |
| `plan/id-clash` | {thing} is left out: another part has the same id | every id on one part only, across the whole plan |
| `plan/similar-id` | {thing} is left out: its id differs from another part's only in capitals or spaces | ids that differ in more than capitals or spaces |
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
| `wall/ends-in-opening` | {thing} ends on another wall inside one of its openings | a wall that meets another clear of its doors and windows |
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
| `opening/door-hits-item` | {thing} hits {the fixtures, by kind and id} when it opens | floor clear of fixtures where its leaf swings |
| `opening/doors-collide` | {thing} hits another door when they open | door sweeps that do not overlap |
| `opening/crosses-wall` | {thing} runs into a wall that meets its wall | an opening within the clear run of its wall, between the walls that meet it |
| `opening/fills-wall` | {thing} is as long as its wall | some wall left beside an opening |
| `opening/on-dividing-line` | {thing} is on a dividing line | a door or window in a wall |
| `opening/window-between-rooms` | {thing} has rooms on both sides | a window in a wall with the outside on one side, unless it is a borrowed light |
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
| `stair/unknown-floor` | {thing} joins a floor the plan does not know | the ids of two floors the plan has |
| `stair/same-floor` | {thing} starts and ends on one floor | two different floors |
| `stair/no-rise` | {thing} joins floors that stand at one height | two floors at different heights |
| `stair/run-too-short` | {thing} has a stretch of its walking line too short for a flight | stretches long enough for a tread, once the landings are taken off |
| `stair/too-few-risers` | {thing} states fewer risers than its flights need | at least two risers on each flight |
| `stair/end-in-no-room` | {thing} starts or ends in no room, so it joins nothing there | each end of its walking line in a room |
| `stair/duplicate-id` | {thing} shares its id with another stair | an id of its own for each stair |
| `item/too-large` | {thing} has a number Grid does not accept | finite numbers within the size Grid accepts |
| `item/no-size` | {thing} has no size | a width, a depth and a height above 0 |
| `item/unknown-kind` | {thing} is a kind the plan does not hold yet | a fixture kind: "toilet", "basin", "shower", "bath" or "kitchen-run" |
| `item/duplicate-id` | {thing} has an id another part of the plan has too | an id of its own on every item |
| `item/unknown-floor` | {thing} is on a floor the plan does not have | a floor of the plan |
| `item/outside-rooms` | {thing} stands in no room | its middle inside a room on its floor |
| `item/into-wall` | {thing} runs into a wall | its footprint clear of the walls, against their faces at most |
| `item/too-tall` | {thing} is taller than the room it stands in | a fixture no higher than its room |
| `item/blocks-doorway` | {thing} stands in front of the doorway of {opening}, an indicator | the floor in front of a doorway clear of fixtures, within Grid's own approach depth |
| `item/blocks-window` | {thing} stands in front of window {window}, higher than its sill, an indicator | a fixture in front of a window no higher than its sill, within Grid's own approach depth |
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
| `opening/door-out-above-ground` | A door from "{name}" leads outside {height} m above the ground, so it is not a way out | a way out at ground level, or a stair down to one |
| `opening/below-ground` | The {window} in "{name}" lies wholly below the ground: its top is {depth} m under the ground level the site states (partly: its sill, threshold or foot) | a door or window above the ground outside, or a light well or an outside stair in front of it |
| `room/stair-out-of-line` | The stair "{name}" on "{floor}" does not lie over "{room}" on "{floor}", so it does not join the two floors | the stair room over the one on the floor below |
| `room/lift-out-of-line` | The lift shaft "{name}" on "{floor}" does not lie over "{room}" on "{floor}", so the shaft is out of line | the shaft over the one on the floor below |
| `opening/too-small-to-pass` | An opening from "{name}" is too small for a person to get through, so it is not a way through | at least {width} m wide or {height} m high, or a sill no more than {sill} m above the floor: Grid's own size for a person to get through, not a code figure |
| `room/too-small` | "{name}" is under {minimum} m² | the figure used here, at least {minimum} m² ({basis}, status {status}); this check's figures were read for {kinds} |
| `room/no-escape-opening` | "{name}" has no window or door to escape through | a window or door to the outside that someone can climb through |
| `room/escape-window-too-small` | The window of "{name}" is too small to escape through | the figures used here, at least {area} m², {width} m wide, {height} m high ({basis}, status {status}); a window someone can climb through when no figure applied; this check's figures were read for {kinds} |
| `room/escape-window-too-high` | The window of "{name}" is too high to escape through | the figure used here, a sill at most {maximum} m above the floor ({basis}, status {status}); a lower sill when no figure applied; this check's figures were read for {kinds} |
| `floor/not-checked-no-stairs` | The way out of "{floor}" was not checked: no stair joins it to the ground floor | a stair joining it, through the floors between, to the ground floor |
| `floor/not-checked-way-out-not-drawn` | The way out of "{floor}" was not checked: its only door out leads to a space that is not drawn | the space beyond its doors drawn as a room, or a door to the outside |
| `floor/not-checked-rooms-not-drawn` | On "{floor}", rooms that could not be drawn were not checked: "{room}", … | rooms that can be drawn |
| `floor/not-checked-doors-not-drawn` | On "{floor}", some doors could not be drawn and were not checked | doors that can be drawn |
| `floor/sketch-drawn-only` | On "{floor}", the sketch is drawn only: {count} sketch items, not measured or checked, and never taken as a wall or a room | nothing: a sketch is for the drawing. A part Grid understands is written as one: a wall, a room, a door, a fixture |
| `floor/not-checked-no-use` | On "{floor}", room sizes were not checked in rooms with no use stated: {count} | a use on every room (bedroom, living, dining and so on) |
| `plan/not-checked-sizes-for-place` | Room sizes were not checked: the figures here are from US model codes, and this plan is for {country} | figures for the place, looked up and given to the check |
| `plan/not-checked-escapes-for-place` | Escape openings were not checked: the figures here are from US model codes, and this plan is for {country} | figures for the place, looked up and given to the check |
| `plan/not-checked-sizes-for-building` | Room sizes were not checked: the figures here were read for homes (houses and flats people live in), and the plan says this is {an office} | figures read for {an office}; the ones here were read for homes (…) |
| `plan/not-checked-escapes-for-building` | Escape openings were not checked: the figures here were read for homes (houses and flats people live in), and the plan says this is {an office} | figures read for {an office}; the ones here were read for homes (…) |
| `floor/not-checked-sizes-for-building` | On "{floor}", room sizes were not checked: the figures here were read for homes (houses and flats people live in), and the plan says this floor is {a shop} | figures read for {a shop}; the ones here were read for homes (…) |
| `floor/not-checked-escapes-for-building` | On "{floor}", escape openings were not checked: the figures here were read for homes (houses and flats people live in), and the plan says this floor is {a shop} | figures read for {a shop}; the ones here were read for homes (…) |
| `floor/not-checked-above-escape-storeys` | On "{floor}", escape openings were not checked in bedrooms: the figures here cover bedrooms up to the third storey: {count} | figures for escape from bedrooms above the third storey, which these checks do not carry |
| `plan/not-checked-no-rooms` | No check that looks at rooms ran: the plan has no rooms | the rooms drawn on the walls, each with the walls round it and its use |

### Words Grid does not read

A plan with a field Grid does not know, or a room use it does not know, is still read: without
that field, and with that room's use not stated. Each is a line worth a look, about the part it
is on, with the nearest word Grid knows when one was most likely meant: `thick` on a wall gives
`plan/unknown-field`, whose `found` and `fix` name `thickness` ("Did you mean "thickness"?"). A
use is read whatever its capitals, so `Bedroom` is `bedroom` and gives no line; and a word that
plainly means a use is read as it (CNT-5, `USE_WORDS` in the plan format), so `WC` is `toilet` and
gives no line. No word is read as `bedroom`, `living` or `dining`, the uses the figure checks look
at: `lounge` gives a line that suggests `living`. A plan with no
walls, rooms or openings, `{}` among them, gives `plan/empty`. A field name or a use that breaks
the text rule (MSG-9) is never repeated: the line says it is not. The fields each part has are
read from the format itself (`readingNotes` in `@ongrid/floorplan/types/reading`), so a field
added to the format is never named as unknown.

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
| `readFor` | Only on a figure check that looked at something: the kinds of building its figures were read for, as `["homes"]` (COD-2). |
| `uses`, `buildings` | Only on a figure check: the room uses it looks at, as `["bedroom"]`, and the kinds of building it runs in, as `["home"]` (CNT-5). It runs too where the plan does not say what kind of building it is. |

A check that looks at rooms has every room of the plan under `lookedAt` or under `skipped`,
so a record with no findings says what it is: these parts were looked at and nothing was
found in them. A `reason` is one of:

| Reason | Why |
|---|---|
| `not_for_building` | the figures were read for homes (houses and flats people live in), and the plan says this is {an office}: the plan, or that floor, is a kind of building the check does not run in (CNT-5) |
| `no_figures_for_place` | no figures for the place the plan is for: the ones here are from US model codes |
| `no_rooms` | no rooms on the floor |
| `cannot_be_drawn` | could not be drawn |
| `no_stairs` | on a floor Grid cannot follow down to the ground floor |
| `way_out_not_drawn` | the floor's only door out leads to a space that is not drawn |
| `alone_off_ground` | the only room on a floor off the ground, reached by a stair the plan does not draw |
| `above_escape_storeys` | above the third storey, where the figures here stop |
| `no_ground_level` | the plan states no ground level for the site (LVL-4: the check of doors and windows below the ground) |
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

## The short report, and seen notes

`grid check` and `grid_check` print a short report by default, sized to the plan (MSG-10): the
label first; the lines, each with what was found and needed and the fix; the figures those
lines used, each as the figure used here with its document, edition, clause and status; what
each check looked at, in counts (the rooms looked at by at least one check, each check's count,
and the parts it could not look at, with the reason); and one line on what the whole report
adds. A check that looked at nothing still says "Nothing was checked for …". `grid check --full`
and `grid_check` with `full: true` add the checks run, every figure the checks applied, each
check's parts one by one, and what these checks never look at (`limits`). The data is the same
either way: `grid check --json` gives the whole check, and `grid_check`'s data keeps `coverage`
and `limits`. For the lab's 62.65 m² flat the short text is 1,201 bytes from `grid check` and 1,184
from `grid_check` (`packages/cli/src/command/__tests__/shortReport.test.ts`): 988 and 973 without
the line saying the plan states no ground level (LVL-4).

A person can set a note aside as seen, with a reason and the name or role they give, through
`grid check --seen <n> --reason <text> --by <name>` or `grid_mark_seen`. A seen note is never left
out and never called dealt with: it is listed under "Seen", with its reason, who marked it and
the day, and the count of lines says how many are seen. The mark is keyed to the note (its
`code`, `thing` and `also`) and to the content of the parts it is about: the thing and the
`also` ids, a room with the walls of its outline, an opening with its wall, a floor with
everything on it, and the whole plan for a line about the plan that names no part. When one of
them changes, the mark no longer holds and the line is listed with the others again, saying it
was seen before and which part changed since.

The marks are kept beside the plan, in `<plan>.seen.json` (`plan.seen.json` beside
`plan.json`), read and written only through the project's resolver. No export, sheet or drawing
reads them. A file that is there and cannot be read is said in the report, every note is then
listed as new, and no mark is written over it.

```json
{
  "version": "1",
  "marks": [
    {
      "code": "room/too-small",
      "thing": { "kind": "room", "id": "bed2" },
      "also": [],
      "parts": [{ "kind": "room", "id": "bed2", "hash": "…" }, { "kind": "wall", "id": "w3", "hash": "…" }],
      "reason": "A box room, kept small on purpose",
      "by": "Owner",
      "at": "2026-11-22T10:00:00.000Z"
    }
  ]
}
```

In `grid_check`'s data, a line with a mark carries `seen`: `{ state, reason, by, at }`, `state`
`seen` while the mark holds, and `back`, with `changed` (each part as `{ kind, id }`), when one
of its parts changed since. `seenCount` is how many lines are seen, `marksFile` the marks file
in the project, and `marksProblem` why it could not be read, or null. `grid check --json` gives
the same as `seen` (`file`, `problem`, and `states`, one per line of `result.lines`) once a line
has a mark or the marks file cannot be read, and `marked` after `--seen` or `--unseen`; a plan
no one has marked gives the same JSON as before.

## Refusals

A plan is refused when it is not JSON, not a JSON object, holds an unfinished git merge, or
does not fit the plan format at its top level (a version Grid does not read, a list of parts
that is not a list).

A fault inside a part refuses nothing (MSG-6). The plan is read part by part, with the
format's own rules, and each wall, room, opening, floor and fixture that cannot be read as
written gets a line by its id (or, with no id that can be read, its place) and its place in
the file:

- `plan/read-as-meant` (`worth-a-look`): a number written as text (`"2.5"`, `"0.9 m"`),
  `"true"` for true, a word that differs from one the format knows only in its capitals or
  spaces (`"Exterior"`), a whole number where an id goes. It is read as meant.
- `plan/value-left-out` (`worth-a-look`): a value the format cannot read in a field the part can
  do without. The field's default is used, or the field is read as not stated; the line says
  which. A unit other than metres is read so: every length is read in metres.
- `plan/part-left-out` (`left-out`): a value the part cannot do without that cannot be read. The
  part is left out of every view, measure and export, and a room or opening that rests on a wall
  left out is left out with it (`room/broken-wall`, `opening/broken-wall`, naming the wall).
- `NaN`, `Infinity` and a number with a decimal comma inside an object (`"offset": 3,45`) are
  not JSON. They are read as a value that is not there, at their place, and the line names
  them for what they are. A comma inside a list is JSON, so `[4,6,3,3]` for a point is read as
  four numbers, and the line says a decimal comma most likely split them.
- Ids are unique across the whole plan. A blank id (`plan/blank-id`) and an id that differs
  from an earlier one only in capitals or spaces (`plan/similar-id`) leave the part out; the
  earlier keeps its id, in the order walls, rooms, openings. Of two parts with one id, only the
  clash is left out (`plan/id-clash`): a wall keeps its id, since rooms and openings name walls,
  and otherwise the first in the order walls, rooms, openings, fixtures does. Two walls with one id are both left out (`plan/duplicate-id`): a room that
  names it could mean either. The lines name both parts, and `plan/id-clash` and
  `plan/duplicate-id` an id to rename one to.

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
| `grid_export` | `written` (the file, inside the project), `format`, `leftOut` (how many parts of the plan the file leaves out), `leftOutParts` (each of them: `kind` `wall`, `room`, `opening`, `item` or `floor`; `id`, null when the reader could not read one; `place` in the plan file, `openings[4]`, for a part left out when the plan was read, else null; `floor`, null when not known; `code`, the line that leaves it out, as `grid_check` gives it, or null), `note`. An export that would hold no wall, room or fixture is refused. |
| `grid_sheet` | `written`, `layout`, `pages` (kind, title, floor), `leftOut`, `note`. |
| `grid_preview` | `floor`, `view`, `room`, `note`. It writes nothing. |
| `grid_mark_seen` | `written` (the marks file, inside the project), `line` and `code` (the note marked), `unmarked` (true when a mark was taken off), `mark` (`reason`, `by`, `at` and `parts`, each `{ kind, id }`; null when `unmark` found none). It never writes the plan. |
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

### 2026-11-22: facts of the person's own, and asking across them (CNT-9)

- Three new reading tools, after `grid_schedule`: `grid_fields` (what can be asked: `kinds`,
  `fields` with their `unit`, and `facts` with `count`, `kinds`, `type` and `values`),
  `grid_find` (`count`, `ids`, `rows` holding `id` and only the fields named, `more`, `floors`,
  `view`, `rule`) and `grid_count` (`by`, `groups` each with `value`, `count`, `sums`, `missing`
  and `ids`, `total`, `units`, `view`, `rule`). `view` holds the arguments of `grid_view` that
  show the answer. A field or fact the plan does not have is refused with the nearest name.
  The tools are 25.
- `grid_view` takes `highlight` (ids to pick out) and a field or fact in `colour` (any name
  besides `use`), and then answers `painted`: each colour with what it stands for and its ids.
  `colour` is now text of at most 120 characters, no longer only `use`.
- `grid_schedule` with `of=rooms`: each row has `roomNumber` (the plan's, or null) and
  `properties`; a room that states its number is listed first on its floor and shown by it, in
  the text and the CSV's `number` column. `number` is still Grid's count. With `of=openings`,
  each row has `properties`. The CSVs add a column per fact, after the others.
- Edits keep the facts: `grid_split_room` gives the new room the room's facts (not its number),
  and `grid_merge_rooms` says in `notKept` what the second room said otherwise and the number
  that is gone. `grid_write_rooms` keeps each part's facts and number by id, and says so.
- No new message code: a fact the format cannot read is `plan/value-left-out`, at its own place
  (`walls[0].properties.<name>`), and the part keeps its other facts.

### 2026-11-22: slabs, roofs, ceilings and the ground (LVL-4)

- New finding `opening/below-ground`, under the new plan check `openings-above-ground`: a door,
  window or doorless opening in an outside wall that lies below the ground level the site states
  (`site.ground`, beside CNT-3's fields of `site`), wholly or in part. The finding carries `belowGround` (`foot`, `top`, in metres
  under the ground, and `wholly`). With no ground stated the check skips every door and window with
  the new reason `no_ground_level` and is not among the checks run; every report's limits gain one
  line saying so.
- With a ground level stated, the ground floor is the floor nearest it, and a floor stands above the
  ground by its height over that level: `opening/door-out-above-ground` gives that height.
  Unstated, both are as before.
- A room marked `void` needs no door and has no route to check: it is no room to stand in.
- `grid_takeoff` answers `envelope`: per floor the slab (as built, less its openings over stairs,
  lifts and voids), the roof over every part with nothing above, and each figure's `assumed` list,
  what Grid took that the plan does not state. Room lines gain `ceilingHeight` and `lowered`.
- The 3D still (`grid_view`) and the exports draw a slab under every floor and a roof over every
  part with nothing above; a still of one floor alone still has no roof.

### 2026-11-22: use indicators round the fixtures (CNT-13)

- A fixture is an obstacle to a door's swing: `opening/door-hits-item` (worth a look) names the
  door, has the fixtures' ids in `also`, and words each by its label, kind and id:
  `Door "d1" hits "Table 2" (kitchen run "table-2") when it opens`. A wall in the way is still
  `opening/door-blocked`.
- New codes, worth a look, about a fixture (`thing.kind` `item`) with the opening's id in
  `also`: `item/blocks-doorway`, a fixture within `useApproachDepth` (0.3 m) in front of a
  doorway's hole, and `item/blocks-window`, one higher than a window's sill in front of it. Each
  `found` says what was measured, with what depth, and that it is an indicator, not a rule. A
  plan without fixtures gets none of them.
- `grid_measure` takes `what=use` (with `room`, and optionally `width`, `diameter` and the new
  `clearance`): `answer.indicators` lists each indicator as `{ code, about, measured, figure:
  { value, from: "person" | "grid" }, under, at?, detail? }`, with `code` one of
  `use/turning-space`, `use/doorway-clear-width`, `use/passage-width`, `use/space-by-fixture`
  and `use/window-blocked`. Each text line starts `Indicator,`.
- `what=route` takes `width`, a body or a trolley: `answer` holds `through`, `width`, `figure`,
  `way` (the way it gets through by, or null), `shortest` (the way with the fewest rooms,
  measured: each room's `width` with `at`, `beside` and `atDoorway`, each step's `clear` width
  and `narrowedBy`) and `narrower` (what on it is narrower than `width`). Without `width`, the
  route answer is as before.

### 2026-11-22: stairs counted once, and the drawing's symbols (SHT-11)

- `grid_areas`: rooms used as a stair that lie one over the other on neighbouring floors are one
  stair, counted once, on the floor it rises from. Each stair room over it keeps its own `net`
  and gains `countedWith` (`floor`, `room`: the lowest stair room); it is in no net total, area by
  use or circulation figure. Each floor gains `overStairs`, their area. A note names the stair and
  the floors over it, the text says "counted once with …" on each such room, and the CSV's
  `counted` column says `with the stair below`. The net rule's sentence says so. A plan with no
  stair rooms stacked so is unchanged. `grid sheet`'s area table prints "counted below" for them.
- `grid_takeoff` with `for=estimate`: the `floor:<use>` lines leave those stair rooms out as the
  net area does, so `floor:stair` counts the stair once; the `floor` rule's sentence says so. The
  wall faces, skirting and ceilings still count every room.
- `grid_view` (kind plan) and `grid draw` take `above` in `hide`: the dashed outline of the floor
  above. No code is added and no check changes.

### 2026-11-22: what kind of building it is, and more room uses (CNT-5)

- A plan may say what kind of building it is (`building`: `home`, `office`, `shop`, `food`,
  `hotel`, `school`, `health`, `sport`, `assembly`, `industry`, `warehouse`, `parking` or
  `other`), and a floor may say otherwise for itself (`floors[].building`). Unstated, nothing
  changes.
- The figure checks (room size, escape openings) run only where the building, or its floor, is
  a home, or where the plan does not say. Elsewhere their rooms are skipped as
  `not_for_building`, and one line says so: about the plan (`plan/not-checked-sizes-for-building`,
  `plan/not-checked-escapes-for-building`) when the plan's own kind is the reason on every
  floor, else about each floor (`floor/not-checked-sizes-for-building`,
  `floor/not-checked-escapes-for-building`). New codes and a new reason, all `not-checked`;
  `resultVersion` stays.
- `coverage` adds `uses` and `buildings` on each figure check: the room uses it looks at and the
  kinds of building it runs in.
- Room uses run to 27: `toilet`, `utility`, `study`, `office`, `meeting`, `reception`, `retail`,
  `classroom`, `treatment`, `waiting`, `sport`, `changing`, `staff`, `worship`, `assembly`,
  `plant` and `parking` join the ten (LVL-3 added `lift`), and `other` is listed last. A drawing
  coloured by use (SHT-7) gives each its own pale fill. A word that plainly means a use
  (`WC`, `staff room`, `warehouse`, `bryggers`) is read as it and gives no `plan/unknown-use`
  line; no word is read as `bedroom`, `living` or `dining`. The tools' `use` arguments take the
  new uses.
- A room may say who it is for (`tenure`: `private`, `shared`, `common` or `commercial`) and carry
  the firm's own room type (`roomType`). No check reads either yet.
- A note or sheet line that used a figure, on a floor the plan says is a home, ends "and the plan
  says this is a home" instead of COD-2's "the plan does not say what kind of building it is, so
  Grid applied them as they are", which stays where the plan does not say.

### 2026-11-22: a short report, and notes set aside as seen (MSG-10)

- `grid_check`'s text is short by default: the label, the lines, what each check looked at in
  counts, and one line on what `full: true` adds. `full: true` adds the checks run, every figure
  (as "The figure used here for …", with its basis and status), each check's skipped parts and
  what these checks never look at. Before, the text always ended with the never-looked-at lines;
  they are still in `limits` in the data, which is unchanged but for the fields below.
- `grid_check` takes `full`, and its data gains `seenCount`, `marksFile`, `marksProblem`, and
  `seen` on each line the person marked: `{ state: "seen" | "back", reason, by, at, changed? }`.
- A new tool, `grid_mark_seen`, sets a note aside as seen with the person's reason and the name
  or role they give, or takes the mark off (`unmark`). It takes the note's number and code as
  `grid_check` gave them, and refuses a number that now names another code. It writes only
  `<plan>.seen.json` beside the plan. The tools are 22.
- A seen note is listed under "Seen" in the text, and still counted. When one of its parts
  changes, it is listed with the others again, saying so.

### 2026-11-22: north, front and where the building is (CNT-3)

- The plan may hold `north`, `yAxis`, `front` and `site` ([plan-file.md](plan-file.md#north-front-and-where-the-building-is)).
  A plan that states none gets every answer as before.
- `grid_measure` takes `what=facing`, with `room` for one room: `answer` holds `north` (`stated`,
  and `degrees` counter-clockwise from the top of the drawing, or the `assumed` north), `yAxis`,
  `front`, and `rooms`, `walls` and `openings`, each with the compass point it `faces`
  (`north`, `north-east`, … `north-west`) and, for walls and openings, its `bearing` in degrees
  clockwise from north. A plan that states no north is answered with north as the top of the
  drawing, and the text's first line says so.
- New codes, worth a look: `plan/front-not-said`, a front that names a part the plan does not
  have or a wall that does not face outside, naming it in `also`; `plan/y-down`, a plan whose y
  runs down the page.
- `grid_view`'s text for a plan that states its north says where the north arrow points, in
  place of "the plan holds no real north". `grid_describe` adds a few lines on north and the
  ways the rooms face for a plan that states its north or its front, and leaves "north" out of
  what is not in the plan. `grid_mirror` mirrors the stated north and the site's origin, and
  says so in `changed`.
- The IFC export writes the stated north as `TrueNorth`, and none for a plan that states none
  (it wrote +y before), and the site's origin, latitude, longitude and elevation when stated.

### 2026-11-22: sizes along the walls, in chains (SHT-4)

- No line, code or wording of the record changes.
- The floor plan picture (`grid draw`, `grid_view` kind plan, the sheet) dimensions each room
  along its walls' faces: width and depth for a room with four square corners, one size per
  side for any other, each line inside its room. Outside the plan, each side has a chain of
  openings, a chain of walls and the overall size, along the plan's own main directions, and
  each chain adds up to the overall size. In the technical look the lines end in 45-degree
  ticks with the numbers along them.
- In an SVG, each dimension's group carries `data-measured-to`, what its two ends measure to
  (`face`, `centre-line` or `finish`), and `data-kind` is `overall`, `wall`, `opening` or
  `room`.

### 2026-11-22: quantities for a first estimate (ARE-13)

- `grid_takeoff` takes `for` and `rates`. With `for=estimate` its data holds `label`, `lines`
  (each with `key`, `what`, `quantity`, `unit` of `m2`, `m` or `nr`, `rule`, `assumed`, and
  `floors` for the slab, upper floors and roof), `notes` and `rules`; then either `rateCard`
  (no rates file: `{label, currency, rates: {key: {rate: null, unit}}}`, ready to fill) or `cost`
  (`file`, `label`, `currency`, `total`, `complete`, `missing`, `wrongUnit`, `unused`,
  `wholeBuilding`) with `orders` and `orderProblems`, and each line adds `state` (`priced`,
  `no rate`, `wrong unit`, `alternative`), `rateKey`, `given`, `rate`, `priced` and `amount`.
  `format=csv` gives the bill as one table. Without `for` the answer is as before, with one more
  line saying `for=estimate` exists.
- The rates file is `rates` (a path inside the project) or `rates.json` beside the plan. One
  that names no currency, holds a negative rate, a unit Grid does not take, a key that is not a
  key or a field Grid does not read is refused (`isError: true`, one line naming the file and the
  part). `rates` without `for=estimate`, and `rooms` with it, are refused.

### 2026-11-22: the label first, and no line reads as approval (MSG-3)

- Every tool answer leads with the label, and its data carries `label`; every output schema
  lists it as required. A CSV's first row is the label in one cell; rooms text from
  `grid_describe` as=rooms starts with it as a comment, which writing it back ignores.
- `needed` on `room/too-small`, `room/escape-window-too-small` and `room/escape-window-too-high`
  gives the figure as "the figure used here", with its basis and status.
- `opening/too-small-to-pass` keeps its code; its wording, `needed` and `fix` say "get through".
- `grid check` gives each figure as "The figure used here for … is …", with its basis and
  status, and a check that looked at nothing as "Nothing was checked for …". `grid_check` says
  the same in its text.
- The tool server's instructions tell an agent how to retell a report: the label first, none of
  the forbidden words, and each figure with its basis and status.

### 2026-11-22: where each opening stands (MSG-16)

- Five new warnings, `worth-a-look`, in `grid check` and `grid_check`. None of them leaves
  anything out: the opening is still drawn, cut through its own wall only.
  - `opening/crosses-wall`: the opening runs into the body of a wall that meets its wall (a
    corner, a junction, a wall passing through). `also` names that wall and the opening's wall;
    the line gives the offsets that keep it clear.
  - `wall/ends-in-opening`: a wall ends on another inside one of its openings. The line is about
    the wall that ends; `also` names the opening and the wall it lands on.
  - `opening/fills-wall`: the opening is as long as its wall.
  - `opening/on-dividing-line`: a door or a window on a dividing line. `also` names the line.
  - `opening/window-between-rooms`: a window in a wall with rooms on both sides, which may be a
    borrowed light. `also` names the wall and the two rooms.
- `grid_split_room` refuses a new wall whose end would land inside a door or window of the wall
  it meets, and names the nearest place along the room where it would not.

### 2026-11-22: units at the edge (WRT-7)

- Every length argument takes a number in metres, or text with its unit (`"12'6\""`, `"900 mm"`,
  `"381 cm"`); with `decimal: "comma"`, a decimal comma (`"3,81"`). Its schema is
  `["number", "string"]`. A length Grid cannot read is refused by the argument's name.
- `grid_areas`, `grid_takeoff`, `grid_schedule`, `grid_measure` and `grid_view` take `units`
  `m`, `cm`, `mm` or `ft-in` (`ft` is the same as `ft-in`) and `decimal`; left out, the plan's
  `display`. Feet and inches are written `12'-6"` (they were `12' 6"`), a window's sill in inches.
- A plan file with `"units": "mm"`, `"cm"`, `"ft"` or `"in"` is read in that unit, with a
  `plan/read-as-meant` line, and a change writes it in metres. No new code.

### 2026-11-22: what would be right (MSG-7)

- A line gets `fixes` where a change to one part would clear it, and in `grid_check` the
  `calls` that make them, ready to send: `opening/out-of-wall` (the offset that fits keeping its
  width, and the width that fits keeping its offset), `opening/too-tall` (the height that fits at
  its sill), `opening/negative-sill` (a sill of 0) and `opening/missing-wall` (the wall most
  likely meant, as data only). `grid_check`'s text says how many lines carry a call.
- Wordings changed, each in `found` (the check's sentence) and, where named, in `needed` and `fix`:
  - `wall/zero-length`: "starts and ends at the same point, (x, y), so it has no length", in
    place of "has start === end".
  - `opening/missing-wall` and `room/unclosed` for a wall the plan does not have: "which is not
    in the plan", with ": did you mean "…"?" when one is near, in place of "which does not
    exist". `needed` and `fix` name the wall meant.
  - `opening/out-of-wall`: `found` adds "at its offset of 0.50 m, a width up to 3.80 m fits";
    `needed` and `fix` give the offset and width that fit, in metres, in place of "as the line
    found says".
  - `opening/too-tall`: `found` adds the height that fits at its sill; `needed` and `fix` give it.
  - `opening/negative-sill`: `found` says how far below the floor, and that a sill of 0.00 m or
    above fits.
  - `room/escape-window-too-small`: `found` names the measure that fails against what it needs
    first ("0.6 m high, under the 0.61 m needed"), then the ones that are enough. The figures,
    their sources and status, and the label are unchanged.
- The nearest id is worked out one way everywhere (`likelyMeant`, `likelyId` and `closestId` in
  `@ongrid/floorplan/types/nearest`): MSG-4's unknown words, the drawing check's walls, the
  floor ids, and the tool server's refusals. A refusal now names "the nearest known id" only when
  one is near (a shortening, other capitals or joins, or one slip); `grid_measure`'s refusal of a
  wall that is not there lists the plan's walls when none is near.

### 2026-11-22: writing on the drawing, and the sketch layer (SHT-7)

- The plan may hold `title`, `annotations` and `sketch`. None of them changes an area, a check or
  a wall count. A field the format does not have on a note or a sketch item is a
  `plan/unknown-field` line, as on any other part.
- New code, not checked: `floor/sketch-drawn-only`, one line per floor with a sketch, naming its
  items in `also`: the sketch is drawn and exported, and never measured or checked.
- New code, worth a look: `plan/note-no-place`, a note in a room the plan does not have, naming
  the note and the room in `also`. The note is not drawn.
- `grid_view` (kind plan) takes `hide`, `colour` and `key`.

### 2026-11-22: a problem report the person files (CMD-13)

- New tool `grid_report_problem`, read-only, last of the reading tools: a draft issue from a
  failure you met, with the call, its answer, the record's line for a code you pass, Grid's
  version and the smallest plan that shows it, cleared of names, ids, addresses and paths. It
  returns `title`, `body`, `labels`, `link` (the issue form), `linkHasBody`, `code`, `plan`,
  `kept` and `sent: false`. Grid sends nothing: show the person the draft.
- A tool call now sees the protocol version a 2026-07-28 request names. No other answer changes.

### 2026-11-22: an export says what it leaves out (HND-6)

- `grid_export` adds `leftOutParts`: each part of the plan the file leaves out, with its kind,
  id, place, floor and the code of the line that leaves it out. The file says it too: the
  property set `Grid_LeftOut` in an IFC, the layer `GRID-LEFT-OUT` in a DXF, comment lines in an
  OBJ, `asset.extras.gridLeftOut` in a GLB. A file that leaves nothing out is as it was.
- `leftOut` counts what this file leaves out: the parts the reader left out (`plan/id-clash`,
  `plan/part-left-out`) and the parts its floors cannot draw. Before, it counted the ids
  `grid_check` calls broken in the whole plan, which named walls a file holds (a wall id used
  on several floors is drawn on each) and missed parts the reader left out.
- An export that would hold no wall, room or fixture is refused (`isError: true`, one line that
  starts "Nothing to export"), and nothing is written. Before, it wrote a valid empty file.

### 2026-11-22: schedules (ARE-12)

- `grid_schedule` takes `of`: `rooms` gives the room schedule, `openings` each door, window and
  doorless opening once. Its data then holds `rows` (each numbered by Grid, in one order whatever
  the file's), and for rooms `floors` (each floor's total, with its name) and `total` (all floors),
  each total with its state, and `rules`. Without `of` the answer is as before. With `of`, `types`
  and `narrower_than` are refused. A row that cannot be written is an error naming the row.
- `grid sheet --layout check` ends with two pages, "Room schedule" and "Door and window schedule".

### 2026-11-22: which kind of building a figure was read for (COD-2)

- Every figure, in `figures` and on a finding, adds `readFor`: the kind of building it was read
  for. Every figure today is `homes`. A plan cannot say yet what kind of building it is, so a
  figure is applied whatever the building, and every note and pass that used one says so.
- `coverage` adds `readFor` on a figure check that looked at something, so a pass with no
  finding says it (lab CH-2: a café's seating marked "dining" passed against a home's figure
  without a line).
- `needed` on `room/too-small`, `room/no-escape-opening`, `room/escape-window-too-small` and
  `room/escape-window-too-high` ends "; this check's figures were read for homes (houses and
  flats people live in)". No code changes meaning, so `resultVersion` stays.
- `grid check` prints it after each such check's findings and on each figure used; `grid_check`
  prints `Needed:` on those lines and the kind on each such check; the notes on a plan and the
  check sheet add the sentence.

### 2026-11-22: version 1 (WRT-3)

- Five changes to the plan are new tools and `grid edit` verbs: `grid_merge_rooms`,
  `grid_split_room`, `grid_add_room`, `grid_stretch` and `grid_rename_room`.
  `grid_change_opening` moves and places an opening (`room`, `side`, `from`, `distance`);
  `grid_move_room_side` takes an inside size (`to`).
- Every edit receipt adds `guessed` and `couldNotKeep`. No new message code: refusals of an
  edit are one line, as before.
- An opening may state `anchor` in the plan file: what Grid's edits keep its place from.

### 2026-11-22: version 1 (MSG-4)

- New codes, all worth a look: `plan/unknown-field`, `plan/unknown-use` and `plan/empty`. A
  field or a use Grid does not read was dropped in silence before. `{}` gives `plan/empty`,
  beside MSG-2's `plan/not-checked-no-rooms`.
- A room use is read whatever its capitals: `Bedroom` is `bedroom`.
- `grid check` and `grid_check` read the plan file as written, so they name these words. The
  edit tools' `toLookAt` counts the file as written, before and after: a change keeps a field
  Grid does not know, and it is counted on both sides.

### 2026-11-22: a fault stays local (MSG-6)

- A value Grid cannot read inside a wall, room, opening, floor or fixture no longer refuses the
  plan. Each line's `found` says the place and the value as read (`-0.3 at openings[1].offset`,
  `NaN, which JSON does not hold as a number at …`), and `needed` what the format takes there.
  The plan is read part by part: new codes `plan/part-left-out` (`left-out`),
  `plan/value-left-out` and `plan/read-as-meant` (`worth-a-look`). The record is `read: true`,
  and every check runs on the rest. Of the scoreboard's 3,000 damaged plans, the 504 the format
  refused are each read now, with the damaged value named by its part and place.
- New refusal `plan/unfinished-merge`: a file with git's conflict markers is named as an
  unfinished merge, with the line of the first conflict and what each side adds or changes, by
  id. `plan/not-json` now says the line and column where the text stops being JSON.
- New `plan/blank-id`, `plan/similar-id` and `plan/id-clash` (`left-out`). A room and a wall that
  share an id now leave out only the room; the rooms on the wall are measured. Before, both were
  left out with every room on the wall.
- `plan/duplicate-id` (two walls with one id) names how many parts share the id and an id to
  rename one to. `room/broken-wall` and `opening/broken-wall` name the wall when it was left out
  when the plan was read.
- The `plan/missing-field`, `plan/wrong-type`, `plan/unknown-word`, `plan/out-of-range` and
  `plan/not-in-format` refusals are now only given for the plan's top level.

### 2026-11-22: people kept out of hand-over files (HND-9)

- The server's instructions and the descriptions of `grid_write_rooms`, `grid_export` and
  `grid_sheet` say that room names and ids go into every export and sheet: never put a
  person's name in one. Who sits where belongs in `plan.occupancy.json` beside the plan, which
  no tool reads and no export carries. No answer changes.

### 2026-11-22: what is never looked at (COD-4)

- `limits` adds two lines: "Ceiling height is not checked, in any room or under a sloping
  roof" and "Which walls carry load is not known: the plan does not record it, so nothing here
  looks at structure". There are eight lines now. A ceiling-height check, when there is one,
  takes the first away.
- `grid_check` returns `limits` and ends its text with "Never looked at, whatever the plan (N):"
  and the lines.

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

### 2026-11-22: what went wrong, on the drawing (MSG-8)

- No field changed. `grid check` and `grid_check` print each line's number, its place in
  `lines` from 1, in place of a dash; `grid check --json` adds `numbers`, each line's number,
  which on one floor is still its place in the whole record.
- `grid draw` and `grid_view` (kind plan) mark every line of the floor drawn with its number on
  its part, print its words beside the mark, and list the floor's lines under the drawing. A
  room that cannot be drawn is the dashed box round its walls with its name and the reason.

### 2026-11-22: stairs (LVL-3)

- New codes: `stair/unknown-floor`, `stair/same-floor`, `stair/no-rise`, `stair/run-too-short`,
  `stair/too-few-risers`, `stair/duplicate-id` (left out) and `stair/end-in-no-room` (worth a
  look), on a new thing kind `stair`; findings `room/stair-out-of-line` and `room/lift-out-of-line`.
- `floor/not-checked-no-stairs` now reads "no stair joins it to the ground floor": a floor a stair
  joins to the ground floor is checked down the stair.

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
