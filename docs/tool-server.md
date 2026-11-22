# The tool server

Read this when you are an agent calling Grid, or set up the host that starts it. `grid serve`
and `grid mcp` start the same server; the lines that install it in an agent are in the
[README](../README.md#installing-grid-in-an-agent).

- [The tools](#the-tools)
- [The label, and retelling a report](#the-label-and-retelling-a-report)
- [Measuring from faces, and a room's height](#measuring-from-faces-and-a-rooms-height)
- [A note set aside as seen](#a-note-set-aside-as-seen)
- [Reporting a problem](#reporting-a-problem)
- [Protocol versions](#protocol-versions)

## The tools

`grid serve` is an MCP server over standard input and output, for an agent's host to start.
Its tools are listed in a fixed order: first those that read the plan, in the order of the
requests people make most, with the problem report last of them, then the preview, the export, the sheet and the seen mark, and last the ten that
change the plan, writing it rooms first leading. Every tool has a title, a read-only or destructive hint, an input schema with an example
and the allowed values of each argument, and an output schema. Each answer is short text with
the same facts as data; a view also returns its picture. Figures are in metres; a length argument also takes text with its unit, and the measuring tools and views write in `units` and `decimal`, or the plan's `display` (see [Units](plan-file.md#units)).

| Tool | Answers |
|---|---|
| `grid_compare` | Options side by side (net, gross internal, gross external, circulation, area by use), and what differs by room name, walls and openings; a plan mirrored or moved is said to be so. With `picture`, one sheet at one scale |
| `grid_areas` | Each room's size and net area, totals by floor and by use, gross internal and gross external area (the one usual in `country` first, or as `gross` asks; see [areas.md](areas.md)), in metres or feet, as text or CSV, each figure with its rule stated |
| `grid_takeoff` | Metres of wall by kind, and per room floor, ceiling, skirting and wall face less openings, with the rules stated; with `for=estimate` the bill of quantities for a first estimate, each line with its key, rule and assumed mark, priced only from the person's rates file or given as a rate card ([areas.md](areas.md#quantities-for-a-first-estimate)); text or CSV |
| `grid_schedule` | Doors, windows and openings by type and size, with the rooms each joins; with `of=rooms` the room schedule (number, name, use, area, height, floor, and the totals), with `of=openings` each opening once ([areas.md](areas.md#schedules)); text or CSV |
| `grid_measure` | A room's sizes, height and widest circle; the clear distance between two walls, doors, windows or rooms, or to a point, from their faces; a wall's length; whether a box or a circle fits; the way between rooms with every door passed; what is narrower than the person's own figure; and which way each room, outside wall and window faces by the plan's north |
| `grid_view` | A floor plan (light, dark or black and white, with or without sizes, and with `ids` the check view: every room, door and window id on the picture and in the text, with areas, what each door joins, counts and the drawing's problems; with `crop` just one room, door, window or wall, by id or a room's name; with `hide`, `colour` and `key` what it shows, as `grid draw --hide`, `--colour` and `--key`; always with each part's box in image pixels), the model from a side, or an eye-level view in a room with the window sills against the eye |
| `grid_describe` | The plan in room terms, as `grid describe`; with `as=rooms`, as rooms text to change and write again |
| `grid_check` | The check, short and about this plan unless `full`, always labelled "General guidance, not your local rules"; the notes the person set aside are listed under Seen |
| `grid_report_problem` | A draft issue about a failure the agent met, for the person to file or not: Grid sends nothing (see below) |
| `grid_preview` | Points the live preview at a floor or room of the plan |
| `grid_export` | Writes DXF, IFC, GLB or OBJ into `exports/`, and says what the file leaves out of the plan (the file says it too); a file that would hold nothing of the plan is refused |
| `grid_sheet` | Writes the plan as an A3 PDF into `exports/`: layout `client` (cover, a page per floor, the words as `sheet`) or `check` (every id, use and finding) |
| `grid_mark_seen` | Sets a note of `grid_check` aside as seen, with the person's reason and the name or role they give, in `plan.seen.json` beside the plan; or takes the mark off (see below) |
| `grid_write_rooms` | Writes the plan from rooms text, as `grid write`: the walls, their kinds, the room boundaries and the openings' places worked out |
| `grid_change_opening` | Changes a door or window (width, height, sill, type, which room it opens into), moves it to a side of a room, places it from a room's side or an end of its wall and keeps it there (its anchor), or removes it |
| `grid_move_room_side` | Moves one side of a room out or in, or to an inside size; walls ending on it follow, and openings keep their anchor or their place in the building |
| `grid_mirror` | Mirrors the plan left to right or top to bottom |
| `grid_merge_rooms` | Knocks two rooms into one, taking out the stretch of wall they share |
| `grid_split_room` | Splits a room with a new wall, the new room taking one side, with a door in it |
| `grid_add_room` | Builds a room against the outside of a side of a room, saying what happens to openings in the wall it covers |
| `grid_stretch` | Makes the whole building wider or longer, at its outside wall or through a room |
| `grid_rename_room` | Renames a room or changes its use, saying which checks now look at it |
| `grid_square_scan` | Squares a scanned plan: turns each wall marked scanned (every wall with `all`) within about 3 degrees of the plan's main directions onto them, and says how far each wall turned and moved ([Where a value came from](plan-file.md#where-a-value-came-from)) |

Every change answers with what it changed, what it guessed and what it could not keep, and
names the plan by its path in the project, so its size does not grow with the building.

A tool that names no plan reads the project's `plan.json` in a folder `grid init` made. A floor
or room the plan does not have is refused with the ones it has, a room, wall, door or window
with the nearest id the plan has, and the word sent is never repeated back. A request line over 1 MiB and an id over 64 characters are refused, naming the
limit. A change that would leave the drawing with a new problem is refused and nothing is
written; otherwise only the change is written back, and keys Grid does not know stay. The
answer to a change also names every door or doorless opening that now joins other rooms, read
from where it stands: `bath-door joined bath and lounge; it now joins kitchen and lounge.`

Room names and ids go into every export and sheet, and travel with the plan file: never put a
person's name in a room's name or id. Who sits where belongs in the occupancy file beside the
plan, which no export, sheet or tool reads ([People are kept out of the plan](plan-file.md#people-are-kept-out-of-the-plan)).
`grid_write_rooms`, `grid_export`, `grid_sheet` and the server's instructions say so.

`grid_export` answers with what its file leaves out (HND-6): `leftOut`, how many parts, and
`leftOutParts`, each part with its `kind`, `id`, `place` (for a part left out when the plan was
read), `floor` and `code` (the line of `grid_check` that leaves it out). The file carries the
same note ([What an export leaves out](commands.md#what-an-export-leaves-out-hnd-6)). An export
that would hold no wall, room or fixture is refused, and nothing is written.

`grid draw --ids` draws the same check view for a person: each room's id in brackets after its
name, and each door's and window's id beside it, upright.

## The label, and retelling a report

Every answer's text starts with "General guidance, not your local rules", and its data carries
it as `label` (MSG-3); the server adds it where it answers, so no tool can leave it out. A
refusal is not an answer about the plan and has no label. The server's instructions tell the
agent how to retell a report (`src/mcp/retelling.ts`): start with the label and keep it; never
say a plan complies, is approved, meets code or has passed anything; give each figure as the
figure used here, with its basis and its status. The plugin's skill carries the same words.
`npm run retell` scores how well a model keeps to them (see the scoreboard's
[README](../scoreboard/README.md#the-retelling-set)).

## Measuring from faces, and a room's height

`grid_measure` measures as a person with a tape does, so an agent does no arithmetic of its own.
`what=between` gives the clear distance from one wall, door, window, opening or room to another,
or to a point given as `x` and `y` (the plan names no points): a wall by its faces, an opening
by the edges of its hole in the wall, a room by its inside outline. A door's distance from the
inside corner is the distance between the door and the wall at that corner: in a house whose
entrance sits 1.00 m along the south wall's centre line, with a west wall 0.30 m thick, the
answer is 0.85 m, not 1.00 m. Two things on different floors are refused. `what=wall` gives a
wall's length on its centre line and the length of its face in each room beside it.

A room may state its height, floor to ceiling, in metres:

```json
{ "id": "loft", "name": "Loft room", "boundary": ["l1", "l2", "l3", "l4"], "height": 2.3 }
```

`what=room` gives the height and where it comes from, by this rule:

1. A height the room states wins, whatever its walls stand; the answer gives their heights beside it.
2. Otherwise, when the solid walls round the room all stand one height, the room is that high.
3. When they differ, the room is as high as the lowest of them, because a level ceiling rests on
   every wall round it. The answer names the lowest walls and the highest height.
4. Dividing lines stand no height and are left out. With no solid wall round it, the height is
   not known.

A wall that states no height gets 2.7 m, which cannot be told from a stated 2.7 m. The plan
comparison in `@ongrid/floorplan` (`diffPlans`) reports a room height stated, changed or taken out.

## A note set aside as seen

`grid_check` answers short by default (MSG-10): the notes, the figures they used, what each
check looked at in counts, and one line on what `full: true` adds (the checks run, every figure
and what these checks never look at). Its data is the whole record either way.

When the person has read a note and asks to set it aside, `grid_mark_seen` marks it: the note's
`line` number and `code` as `grid_check` gave them (with the same `country`), the person's
`reason`, and `by`, the name or role they give. An agent never guesses either, and never marks a
note the person did not ask about. The tool writes `plan.seen.json` beside the plan, never the
plan, and refuses a number that now names a note of another code. A seen note is not dealt
with: `grid_check` still lists it, under Seen, with the reason and who marked it, and lists it as
new again, saying so, as soon as one of its parts changes. `unmark: true` takes a mark off. The
marks file and its format are in the [result contract](result-contract.md#the-short-report-and-seen-notes).

## Reporting a problem

`grid_report_problem` turns a failure an agent met into a draft issue, and sends nothing. It
reads the plan, writes nothing, and is marked read-only. The agent passes the tool it called,
the call's arguments and answer, what it expected, and the code of the result record's line the
problem is about (or the ids of the parts, `parts`), and may pass its client's name. The draft
holds:

- Grid's version, the result record's version, and the protocol version when the request names
  it (a 2026-07-28 client does; after `initialize` the server keeps nothing, so it says so);
- the call, its answer (the first 4,000 characters) and what the agent expected;
- the record's line for that code: its message, what was found and needed, and the fix; for a
  plan the command refuses, the refusal and the record that says so;
- the smallest plan that shows it: the parts the line names, in `also` or quoted in its words,
  and the parts named, with what they touch. A room brings its walls, a door or window its wall,
  and a wall named itself the walls that cross or meet it and its openings. With nothing named,
  the whole plan.

The plan and every text of the draft are cleared before they are shown. Room names are replaced
by their uses (`bedroom`, `bedroom 2`, or `room`), every id by its kind and a number
(`wall-3`, `door-2`), a floor's name by `floor 1`. A fixture's label, the trace image, the
project id, the record of how the plan was written and any field Grid does not know are left
out; only numbers and Grid's own words are kept. Paths, file names, web addresses and email
addresses in the arguments, the answer and what was expected become `<path>`, `<file>`,
`<address>` and `<email>`. What is left follows the plan's text rule. Room names and ids go into
every export, which is why they are never filed as they are
([People are kept out of the plan](plan-file.md#people-are-kept-out-of-the-plan)).

The answer holds the draft (`title`, `body`, `labels`) and `link`, the repository's issue form
with the title, the `agent-drafted` label and, when the link stays under about 8 KB, the body
filled in (`linkHasBody`). The form is `.github/ISSUE_TEMPLATE/agent-drafted.md`. The agent
shows the person the draft exactly as returned; the person opens the link and files it, or not.
An agent never files, posts or sends it.

## Protocol versions

The tool server answers clients of both eras of the protocol: an older client that opens with
`initialize` (2024-11-05, 2025-03-26 and 2025-06-18), and a 2026-07-28 client that sends no
handshake, names its version in each request's `_meta` and starts with `server/discover`. A
version it does not speak is refused with the ones it does. It keeps no state between calls:
the plan file is the only state.
