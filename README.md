# Grid

Grid (ongrid): floor plans and plan checks for architects

Grid lets architects design and check floor plans by describing them to an AI agent.
One structured plan file (walls, rooms and openings, in metres) is the source of truth.
A geometry core reads it, validates it, draws it in 2D and 3D, and feeds the exporters.

## Status

This repository is being set up. The packages hold working code with tests, but nothing
is published yet and there is no release to install.

## Layout

| Path | Package | Contents |
|---|---|---|
| `packages/floorplan` | `@ongrid/floorplan` | Plan schema, geometry, validation, plan checks and exporters |
| `packages/rules` | `@ongrid/rules` | Checks that apply figures from building codes, with each figure's source |
| `packages/viewer` | `@ongrid/viewer` | 2D and 3D views of a plan, `planToSvg` (a picture of a plan as an SVG file) and `planStill` (a still of the 3D model as pixels), with no browser |
| `packages/cli` | `ongrid` | The `grid` command (`ongrid` does the same): `init`, `check`, `describe`, `draw`, `export`, `tidy`, `serve` (the tool server an agent uses) and `mcp` (the same server). Also CAD program lookup, `drawPlan` (a plan as SVG or PNG) and `drawStill` (the 3D model as PNG) |

## Development

Grid needs Node 22 and npm.

```bash
npm install
npm run build
npm run typecheck
npm run lint
npm test
```

## Running Grid from a copy of the repository

```bash
npm ci
npm run build
npx --no grid check packages/cli/fixtures/two-bed-flat.json
```

`npx --no ongrid` runs the same command, and so does `node packages/cli/dist/grid.mjs`. Keep
the `--no`: without it, npx fetches a package of the same name from the registry when the
local one is missing.

| Command | What it does |
|---|---|
| `grid init [<folder>]` | Starts a project folder: `grid.json`, a starter `plan.json` and `exports/` (see below) |
| `grid write <plan.rooms> [--plan <plan.json>] [--replace] [--json]` | Writes a plan from rooms text, the main way to write one: Grid works out the walls (see below) |
| `grid check [<plan>] [--floor <id>] [--country <code>] [--json]` | Prints the report. Every report is labelled "General guidance, not your local rules" |
| `grid describe [<plan>] [--length line\|rooms\|walls] [--for person\|agent] [--as rooms]` | Describes the plan in a few lines: its rooms, which rooms each opening joins, and with `--length walls` its walls (see below). `--as rooms` reads it back as rooms text |
| `grid draw [<plan>] [--png \| --3d] [--look <name>] [--out <file>] [--floor <id>] [--scale <n>]` | Draws one floor as SVG, or PNG with `--png`, or the 3D model as PNG with `--3d`; to standard output unless `--out` names a file. In the technical look (black on white, lines in millimetres on paper) unless `--look working` or `dark` |
| `grid export [<plan>] --format dxf\|ifc\|glb\|obj [--floor <id>] [--out <file>]` | Writes an export into `exports/` beside the plan, unless `--out` names a file |
| `grid sheet [<plan>] --layout client\|check [--sheet <sheet.json>] [--out <file.pdf>]` | Writes the plan as an A3 PDF for people: `--layout client`, with the words of `sheet.json`, or `--layout check`, with ids and findings (see below) |
| `grid serve` | Starts the tool server on standard input and output, with the 15 tools below |
| `grid mcp` | The same as `grid serve`, under the name agents start it by (`npx -y ongrid mcp`) |

### Writing a plan rooms first

The main way to write a plan, for an agent or a person: name the rooms with their inside sizes
and where each goes, and the doors and windows by the rooms they join. Grid works out the walls,
whether each is an outside or an inside wall, each room's boundary and where each opening sits,
and writes them into the plan file.

```
walls outside 0.3 inside 0.1 height 2.6
room living  "Living room" living   4.4 x 4.2
room kitchen "Kitchen"     kitchen  4.4 x 3.0  north of living
room hall    "Hall"        corridor 1.3 x *    east of living until kitchen
door d-living between hall and living, 0.1 from south, 0.8 wide, opens into living
door front    in hall north, centred, 0.9 wide, opens in, hinged east
window w-living in living south, centred, 1.8 wide, sill 0.6, height 1.5
```

- A size is east-west by north-south, to the inside faces. `3 x 4 centre` measures to the walls'
  centre lines and `8 x 10 outside` to the outside faces; `sizes outside` makes that the
  default. The answer states for each room what its size measured to, and its inside size.
- `floor -0.15` on a room line puts its floor that far below its storey's (a genkan; LVL-7),
  `height 2.4` gives its own height.
- `*` stretches a side as far as the room named after `until`. `inside <room> corner ne` cuts a
  room out of another's corner. `unit`, `place`, `repeat` and `mirror` write a group of rooms
  once; `copy <floor>` starts a floor from another.
- Rooms that overlap, that touch with no wall between them (unless one is `open` to the other),
  or that leave a gap that is neither a wall nor a room are refused in plain words naming both
  rooms. Every refusal has a code, such as `rooms/overlap`.
- What rooms cannot say is written raw, one line of the plan file's own JSON:
  `raw wall {...}`, `raw room {...}`, `raw opening {...}`. Free-standing walls, curved or
  out-of-the-way walls and rooms with holes are written that way.
- The full language is in the header of `packages/floorplan/src/rooms/compile.ts`.

**The plan file is the source of truth.** Its walls stay in it, and they can still be changed
there or with the tools; rooms text is a way of writing the plan and of reading it.
`grid describe --as rooms` reads any plan back as rooms text, and writing that text again
changes nothing: the walls line comes with every exception the plan holds (a wall's height,
thickness, kind, id or direction), and a floor that rooms text cannot give back as it is comes in
the plan's own terms. So that nothing is lost unseen, `grid write` refuses, with the difference,
rooms text read from an earlier version of the plan (its `based on` line) and rooms text written
over a plan changed some other way since Grid last wrote it; `--replace` writes over it anyway.

Some parts are derived: Grid works them out and no one writes them. In a plan written rooms
first (it records this in `written`), each room's boundary is derived, and one edited by hand is
refused by the check with its own code, `room/derived-edited`. Grid's own edits keep it derived.
Change the rooms and write them again, or take `written` out to keep the plan as a hand-written
one.

### The tool server

`grid serve` is an MCP server over standard input and output, for an agent's host to start.
Its tools are listed in a fixed order: first those that read the plan, in the order of the
requests people make most, then the preview, the export and the sheet, and last the four that
change the plan, writing it rooms first leading. Every tool has a title, a read-only or destructive hint, an input schema with an example
and the allowed values of each argument, and an output schema. Each answer is short text with
the same facts as data; a view also returns its picture. Units are metres.

| Tool | Answers |
|---|---|
| `grid_compare` | Options side by side (net, gross internal, gross external, circulation, area by use), and what differs by room name, walls and openings; a plan mirrored or moved is said to be so. With `picture`, one sheet at one scale |
| `grid_areas` | Each room's size and net area, totals by use, gross areas, in metres or feet, as text or CSV, with the measuring rule stated |
| `grid_takeoff` | Metres of wall by kind, and per room floor, ceiling, skirting and wall face less openings, with the rules stated; text or CSV |
| `grid_schedule` | Doors, windows and openings by type and size, with the rooms each joins; text or CSV |
| `grid_measure` | A room's sizes, height and widest circle; the clear distance between two walls, doors, windows or rooms, or to a point, from their faces; a wall's length; whether a box or a circle fits; the way between rooms with every door passed; and what is narrower than the person's own figure |
| `grid_view` | A floor plan (light, dark or black and white, with or without sizes, and with `ids` the check view: every room, door and window id on the picture and in the text, with areas, what each door joins, counts and the drawing's problems; with `crop` just one room, door, window or wall, by id or a room's name; always with each part's box in image pixels), the model from a side, or an eye-level view in a room with the window sills against the eye |
| `grid_describe` | The plan in room terms, as `grid describe`; with `as=rooms`, as rooms text to change and write again |
| `grid_check` | The check, short, always labelled "General guidance, not your local rules" |
| `grid_preview` | Points the live preview at a floor or room of the plan |
| `grid_export` | Writes DXF, IFC, GLB or OBJ into `exports/` |
| `grid_sheet` | Writes the plan as an A3 PDF into `exports/`: layout `client` (cover, a page per floor, the words as `sheet`) or `check` (every id, use and finding) |
| `grid_write_rooms` | Writes the plan from rooms text, as `grid write`: the walls, their kinds, the room boundaries and the openings' places worked out |
| `grid_change_opening` | Changes a door or window (width, height, sill, type, which room it opens into) or removes it |
| `grid_move_room_side` | Moves one side of a room out or in; walls ending on it follow |
| `grid_mirror` | Mirrors the plan left to right or top to bottom |

A tool that names no plan reads the project's `plan.json` in a folder `grid init` made. A floor
or room the plan does not have is refused with the ones it has, a room, wall, door or window
with the nearest id the plan has, and the word sent is never repeated back. A request line over 1 MiB and an id over 64 characters are refused, naming the
limit. A change that would leave the drawing with a new problem is refused and nothing is
written; otherwise only the change is written back, and keys Grid does not know stay. The
answer to a change also names every door or doorless opening that now joins other rooms, read
from where it stands: `bath-door joined bath and lounge; it now joins kitchen and lounge.`

`grid draw --ids` draws the same check view for a person: each room's id in brackets after its
name, and each door's and window's id beside it, upright.

### Measuring from faces, and a room's height

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

### Installing Grid in an agent

Not yet: the package is not published, and publishing waits on the owner's approval (CMD-8).
Once it is, one line starts Grid's tool server for any agent that runs tools on the person's
computer, and the lines below are the ones to type. They all come from one file,
`packages/cli/src/distribution/listing.ts`, and a test fails when this list no longer matches it.

Every way below starts Grid's tool server with `npx -y ongrid mcp`.

- Claude Code: `claude mcp add grid -- npx -y ongrid mcp`
- Codex: `codex mcp add grid -- npx -y ongrid mcp`
- VS Code: `code --add-mcp '{"name":"grid","type":"stdio","command":"npx","args":["-y","ongrid","mcp"]}'`
- Copilot CLI: `copilot mcp add grid -- npx -y ongrid mcp`
- Cursor: [Add to Cursor](cursor://anysphere.cursor-deeplink/mcp/install?name=grid&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm9uZ3JpZCIsIm1jcCJdfQ==)
- Claude Code, as a plugin with a skill: `/plugin marketplace add ongrid-arch/grid`, then `/plugin install grid@grid`
- Codex, as a plugin with a skill: `codex plugin marketplace add ongrid-arch/grid`
- Claude's desktop app: open the `.mcpb` file for your computer and pick the project folder.

The tool server answers clients of both eras of the protocol: an older client that opens with
`initialize` (2024-11-05, 2025-03-26 and 2025-06-18), and a 2026-07-28 client that sends no
handshake, names its version in each request's `_meta` and starts with `server/discover`. A
version it does not speak is refused with the ones it does. It keeps no state between calls:
the plan file is the only state.

Until publishing, pack everything from a copy of the repository, and install from the tarball:

```bash
npm run build
npm run pack:local --workspace ongrid
npx -y --package=./packages/cli/dist/release/ongrid-0.0.0.tgz ongrid mcp
```

`pack:local` publishes nothing. It writes into `packages/cli/dist/release/` the npm package as
a tarball (the bundled command and nothing else; the canvas that draws PNGs is an optional
package), the registry's `server.json`, the plugin for Claude Code and Codex with a marketplace
folder that lists it, `install.md` with the lines above, and a `.mcpb` bundle for Claude's
desktop app that carries the canvas for the computer it was packed on. The plugin lines above
name the repository, so they work once its marketplace files are committed at the top (CMD-8).

### Walls that do not meet: `grid tidy`

`grid tidy [plan.json]` lists the faults where walls meet (a wall short of its corner, a gap in a
straight side, a wall running past its last corner, a copy lying on its original, a dividing
line on a solid wall, a wall listed twice, a wall across a room that does not list it, walls
standing inside a room), each with the fix Grid offers or why it offers none. A fix is offered
only after it was tried and left every room it touches with an outline. `grid tidy --apply
<id>,<id>` makes the fixes named, and `--apply all` every one offered; the faults are looked for
again before each fix, and one an earlier fix took care of is skipped and said so. The plan file
is changed as read, keys Grid does not know included; `--out <file.json>` writes the tidied plan
there instead. `--json` prints the list or what was applied as JSON.

`grid draw --3d` takes the 3D model as the app opens it: the same scene, from the same camera
(south-east, about 29.5 degrees down, through a 45 degree lens). It needs no browser and no
graphics card: the scene is drawn in software, each face lit flat, without shadows. With
`--floor`, that floor is shown as a cutaway, as in the app; without it, the whole building.
The PNG is 1200 by 800 pixels, times `--scale` (up to 4).

### A sheet for people: `grid sheet`

`grid sheet [plan.json] --layout client|check` writes the plan as an A3 landscape PDF into
`exports/` beside the plan (`<name>-client.pdf` or `<name>-check.pdf`), or to the `.pdf` that
`--out` names.

- `client` is a presentation for the person the house is for: a cover with the name, a headline,
  a few paragraphs, the 3D picture and four figures (gross area, floors, bedrooms, floor-to-floor
  height), then a page per floor with its drawing, its room areas and its own paragraphs.
- `check` is a working set for the person checking the plan: a summary in plain words with the
  number of findings and the three areas, then a page per floor with every room, door and window
  id on the drawing, the area of each room with its use, and every finding on that floor.

The words of a client sheet are the author's, in `sheet.json` beside the plan, or the file
`--sheet` names:

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

Every field but `version` is optional. `floors` is keyed by the plan's floor ids. A name holds
120 characters, a headline 200, a paragraph 1,200, and `intro` and each floor at most 3
paragraphs. Each string follows the plan's text rule. Without the file, the sheet carries the
plan's name and no words: Grid writes none in the author's place. A check sheet takes no words.

Grid draws only what the plan holds: no furniture, stairs or landscape. Every figure comes from
the same code as `grid check` and the area tools, and every page keeps the label "General
guidance, not your local rules". The pages use Source Serif 4 and Source Sans 3, under the SIL
Open Font Licence 1.1, which ship with Grid in `fonts/`. A sheet needs the canvas a PNG needs.

### Describing a plan: `grid describe`

`grid describe` is a short account of the plan, for an agent to check its own work without
reading the file: a front door that opens into a bedroom, or a bathroom reached only through
the study, shows on the first read. It answers in three lengths:

| `--length` | What it holds |
|---|---|
| `line` | One line: floors, rooms, bedrooms and bathrooms (by the `use` a room states, never its name), the area inside, and which rooms the doors from outside lead into |
| `rooms` (the default) | The line, then each room's inside size, position and the rooms next to it, and every opening in it with the room on its other side and its distance to the two inside corners of that side |
| `walls` | The rooms, then every wall with its openings, each with the rooms on its two sides |

`--for person` (the default) names rooms and floors by their names and never prints an id.
`--for agent` is terse and carries every id, the offsets along each wall and a key line, so an
agent can edit the plan from it. A floor laid out like an earlier one is said once. Wall and
sill heights are one line: the usual height and the exceptions. What the plan cannot say,
such as where north is, the kind of building, how floors connect when it holds no stairs and
which rooms make each flat, is said as such. Directions are on the drawing, with north at the
top. The card checks nothing; it ends with the label "General guidance, not your local rules".

Every command also takes `--project <folder>` (see below). An unknown, repeated or
meaningless option is refused by name. The command exits 0 when it did its work, 1 when the
plan or a path was refused or a file could not be written, and 2 when the command line was
refused. A refusal is one line on standard error. Findings in a report are not a refusal:
`grid check` still exits 0.

### What a plan file may hold

The command and the tool server read a plan file one way (`packages/cli/src/fs/textEncoding.ts`
and `packages/cli/src/command/planText.ts`). The file may be UTF-8, with or without a byte-order
mark, or UTF-16; anything else is refused with the first byte that is not UTF-8, so a Latin-1
file never reaches the exports with its letters turned into question marks. A file larger than
64 MB is refused before it is read. Then, before the schema:

| Text | At most | Also refused |
|---|---|---|
| a room or floor name | 120 characters | line breaks of any kind, control characters, characters that change the direction text is shown in, and half of a character pair |
| an id: of a wall, room, opening or floor, a wall a room or an opening names, a part's floor | 64 characters | the same |
| the trace image's path | 1,024 characters | the same |
| walls, rooms, openings or floors | 50,000 of each | |
| the walls a room lists | 2,000 | |

A refusal names the part and the limit (`rooms[0].name holds a line break (U+000A); it must be
one line`) and never repeats the text. Markup in a name is allowed: it is drawn as text. The
ids in `grid check`'s drawing problems are quoted, and `grid_check` returns the rooms a finding
is about, by id and name, apart from its message.

### Floor levels and heights

A floor in the plan's `floors` list has a `level`, which only orders the floors (0 the ground
floor, 1 the one above, -1 a basement, 0.5 a half level between). Where a floor stands and how
high it is may be stated apart from that order, in metres. All three are optional:

| Field | What it states |
|---|---|
| `elevation` | Where the top of the floor's slab stands, above the ground floor's floor level (0) |
| `height` | The floor's clear height. A solid wall on it that states no height of its own takes it |
| `slab` | The thickness of the slab the floor stands on (0.25 m when not stated) |

A floor that states nothing stands where it always did: its height is its tallest wall, and it
stands on the floor below it, one slab higher. The roof lies on the highest storey top, whichever
floor that is on, so a loft stated inside a taller storey does not pull the roof down. The 3D
view, the IFC export and the sheet all read the floors' heights from this one rule.

The drawing's checks ask about levels that do not add up, as warnings: a missing level
(`plan/level-gap`, a flat on level 3 drawn alone stands on the ground until it states its
elevation), two floors at one level one over the other (`plan/same-level`), an empty top floor
that still counts as a storey (`floor/empty-top`), a wall taller than the height its floor states
(`wall/above-storey`) and a floor height far outside a storey's (`floor/size-question`). A wall
or room on a floor id the plan does not know is an error and is left out, with the nearest id the
plan has (`wall/unknown-floor`, `room/unknown-floor`); with no floor list, only an id spelt like
one more of the plan uses counts as unknown. A door to the outside on a floor more than 2 m above
the ground is named by the plan checks and is never a way out.

### A step inside a floor

A room's floor may stand a little above or below its storey's: a genkan a step down from the
hall, a sunken wet area, a raised stage. The room says so with `floorOffset`, in metres from its
storey's floor level, positive up and negative down. Unstated, the room stands on the storey's
floor.

```json
{ "id": "genkan", "name": "Genkan", "boundary": ["s", "x", "n", "w"], "floorOffset": -0.18 }
```

A platform that covers part of a room, such as a stage, a raised stand floor or a loading dock,
is a room inside that room (`"inside": true`), edged with dividing lines and with its own
`floorOffset`. It is floor, not a wall: its area is counted at its own level and taken off the
room around it.

Where two rooms at different levels meet, the 2D drawing shows the step as a solid line: across
each door or doorless opening between them, on the lower room's face of the wall, and over a
dividing line between them. A window gets none. In 3D, in the OBJ and glTF files and in the IFC
file, the room's floor and space stand at its own level, and a raised room is solid down to the
storey's floor. A room set more than 1.5 m off its storey, or raised to the height its floor
states, is asked about (`room/offset-question`): so far off, it is more likely a floor of its own.

### Floor no room claims

Besides the findings, `grid check` lists problems in the drawing. Some of them come from the
spaces the walls enclose: once per floor, Grid joins the wall footprints and takes the spaces
they close off, without looking at any room, and then sets each room's outline against them.
Each of these is a warning ("worth a look"); nothing is left out because of it.

| Code | What it says |
|---|---|
| `floor/unclaimed` | Enclosed floor that no room claims: its area, a point inside it and the walls around it. A forgotten room no longer makes the total smaller in silence |
| `room/space-mismatch` | A room whose outline is not the space its walls enclose: how much of it lies on walls it does not list (a pod, a column, furniture drawn as walls), outside the walls, or across a wall or dividing line into another space |
| `room/not-enclosed` | A room its walls do not close off at all, because they leave a gap |
| `floor/spaces-unknown` | A floor whose spaces could not be worked out, with the reason |

The joining uses `polygon-clipping` (MIT), named in `NOTICE`.

### Rooms that overlap, and rooms inside rooms

Grid also sets the rooms of each floor against each other. Two rooms that cover the same floor,
0.01 m² of it or more, get a warning naming both rooms and the floor they share, because that
floor is counted twice: a room that names one wrong wall and grows over its neighbour, or a room
listed twice. Rooms that meet face to face, across a wall or along a dividing line, share no
floor and get nothing.

A wardrobe pod, a lift shaft or an en-suite drawn inside a bigger room is said with
`"inside": true` on the inner room:

```json
{ "id": "ward", "name": "Wardrobe pod", "boundary": ["pod0", "pod1", "pod2", "pod3"], "inside": true }
```

Grid finds the room it sits in from the outlines: the smallest room on the same floor that
holds it. The inner room's floor, with its own walls, is taken off that room, so each square
metre is counted once, in the area of every room, the 2D drawing, the size check and the
comparison of two plans. A door in the inner room's walls opens into the room around it. The
outline of the room around it stays whole; only its area changes.

| Code | What it says |
|---|---|
| `room/overlap` | Two rooms on one floor share floor: both names, each one's area, the shared area and a point inside it. On the larger room, or the later of two copies |
| `room/inside-no-host` | A room marked `inside` that no room on its floor holds, with how much of it lies outside the room that holds most of it. It is counted on its own |
| `room/overlap-unknown` | Two rooms that could not be compared, with the reason |
| `floor/overlaps-unknown` | A floor whose rooms were not all compared: the plan has more than 200,000 pairs of rooms lying over each other (thousands of copies piled in one place), and Grid stopped there |

### Rooms with holes

A ring gallery round a courtyard, or a car park round a core, is one room with a hole in it. Its
`boundary` lists the walls round the outside, as for any room, and `holes` lists the walls round
each hole, one list per hole, in the order they are met going round it:

```json
{ "id": "ring", "name": "Ring gallery", "boundary": ["os", "oe", "on", "ow"], "holes": [["cw", "cn", "ce", "cs"]] }
```

The room's floor is its outline less each hole, measured to the faces of the hole's walls that
look into the room, so those walls are not floor either. That one area is what the room's area,
the 2D drawing, the size check and the comparison of two plans give. Its label goes on its
floor, never in a hole; the 3D floor, the OBJ and GLB floors, the IFC space and slabs (as a
profile with voids) and the DXF (one more closed outline on the rooms layer) all leave each hole
open. A door in a hole's wall leads from the room to whatever is in the hole: a room drawn
there, or the outside. A plan with no `holes` reads and measures as before.

| Code | What it says |
|---|---|
| `room/hole-outside` | A hole that does not lie inside its room with floor all round it: it reaches or crosses the outline. The room is not drawn |
| `room/holes-overlap` | Two holes of one room that overlap or touch. The room is not drawn |

A hole whose wall list cannot close, or is out of order, gets the same codes as an outline
(`room/unclosed`, `room/out-of-order`, `room/inside-out`), and the line names the hole.

### Wall faults, each with its fix

A room's outline is made by crossing the lines of its walls, so where a wall ends does not
change it: a wall 1.5 m short of its corner leaves the room closed and measured as before. Grid
also sets each wall against its corners and against the other walls, and names what an agent's
slip leaves behind at the wall, with the change that would fix it. Each is a warning.

| Code | What it says |
|---|---|
| `wall/short` | At a corner of a room, one of its two walls stops short of where their lines cross: the gap, both points and the move that closes it |
| `wall/gap` | The pieces of one straight side of a room leave a gap between their ends, in whatever order they are listed |
| `wall/overrun` | A wall runs on past the last corner any room makes on it, and its end meets no other wall. A wall longer than one room, or a T-junction, is normal and gets nothing |
| `wall/duplicate` | Two walls, or two dividing lines, on one line lie on top of each other: the drawing and every export show that stretch twice |
| `wall/line-on-wall` | A dividing line lies on top of a solid wall, so that stretch is both open and solid |
| `room/wall-listed-twice` | A room names one wall twice in its wall list |
| `wall/crosses-room` | A wall runs across a room that does not list it, from one side to another, and the room can be split in two along it |
| `wall/stands-in-room` | Walls stand inside a room that does not list them and stop there: a stub, or a pod, a column or furniture drawn as walls. One line per room, with no fix: what they are is for the person to say |

Two walls reach each other when the end of one lies within half the thicker plus `gap` of the
other's line, so walls drawn to centre lines, to faces and 1 mm apart all meet. A fix is offered
only when it has been tried and every room it touches still has an outline; otherwise the line
says what to do instead. In the library, `wallFaults(plan)` gives each fault with an id
(`short:n:start`, `duplicate:copy`), the walls and rooms it is about, the distance, the message
and the fix as plain edits (`move-end`, `remove-wall`, `set-boundary`, `add-room`,
`move-opening`, `remove-opening`). `tidyPlan(plan, ids)` makes the fixes chosen, or every one
on offer when no ids are given, and looks for the faults again before each, so the faults it
fixed are gone afterwards. `applyWallEdits` makes a list of edits on a plan file as read and
keeps every other key in it.

### Inside and outside walls

Whether a wall faces outside is worked out from the rooms on its two sides, stretch by stretch
along it: where an edge of a room's outline runs along one face, that room is on that face. A
stretch with rooms on both faces stands inside; one with a room on one face only faces outside,
unless the walls enclose floor on the other face (a space no room claims is not the outside).
A face with no listed room tries the point just past it, so the walls of a pod marked `inside`
face the room around it. One wall can face an extension for part of its length and the outside
for the rest, without being cut in pieces.

The 2D drawing, the 3D scene, the DXF layers, the IFC `IsExternal` mark, the order a plan is
built in, and the route and escape checks all read this one answer. A wall stated `exterior`
stays an outside wall where rooms lie on both its sides (a courtyard, a balcony or a terrace
drawn as a room). Every other kind is worked out, because `interior` is also what a wall that
states no kind reads as. Where they disagree, one warning says so:

| Code | What it says |
|---|---|
| `wall/kind-differs` | A wall stated exterior with rooms on both sides, kept as an outside wall; or a wall stated a partition that faces outside, treated as an outside wall. With how long, and the rooms |

In the library, `wallSides(index, wallId)` gives the stretches with the rooms on each face, the
worked-out exposure and the one used; `wallExposure(index, wallId)` gives the one used.

### Tolerances and limits

Every check reads one table of tolerances and limits: `TOLERANCES` in
`packages/floorplan/src/geometry/tolerances.ts`, exported from `@ongrid/floorplan/geometry`.
Each figure in it is Grid's own, chosen for checking a drawing. None comes from a building code
or a standard, none cites a document, and none says what a building must be: a limit only
decides when Grid asks whether a size is meant.

A survey or a scan is less exact than a drawing. `validatePlan(plan, index, { tolerances })`, or
`withTolerances(changes, run)` around any other call, loosens the tolerances and limits for that
run, each to a positive number. The arithmetic guards (below a nanometre, what floating-point
numbers can tell apart) cannot be changed.

Every number in a plan must be finite: JSON reads a number too large to hold, such as `1e400`, as
infinity, and the schema refuses it. A coordinate or size past `largest` is refused with
`wall/too-large` or `opening/too-large`, and what rests on it is left out. No export ever holds
"Infinity" or "NaN".

Sizes far outside a building's are asked about as questions, never refused (warnings). A plan
whose typical wall height, thickness and door width read as a building in feet, inches,
centimetres or millimetres, and not in metres, gets one `plan/units-question` instead of a line
per wall. Otherwise a wall, an opening or a room past a limit gets `wall/size-question`,
`opening/size-question` or `room/size-question`, for example "Wall w1 is 27.00 m high, the
others on its floor typically 2.70 m: is that meant?". Where the plan says it is a home (a room
in it is used as a `bedroom` or a `living` room) the home figures apply.

| Entry | Kind | Value | What it decides |
|---|---|---|---|
| `openingOverrun` | tolerance | 0.001 m | How far an opening may run past either end of its wall, below the floor, above its wall or into the next opening, and still fit. A refusal states the overrun and the offset that fits |
| `gap` | tolerance | 0.02 m | A wall reaches the wall it meets when its end is within half the thicker wall plus this. The spaces check lengthens every wall by this much at both ends; the wall faults name a gap or an overrun past it, and two walls on top of each other when their bodies overlap by more than this |
| `wallContact` | tolerance | 0.01 m | Slack past the walls' bodies when a room outline is traced: walls that touch, carry on in a row or reach a corner |
| `strayCorner` | tolerance | 1 m | A room corner further than this from both its walls is not a corner, and the wall list is out of order |
| `nearlyParallel` | tolerance | 0.2588 sine | Neighbouring walls closer to parallel than 15 degrees may be one straight side |
| `sameFace` | tolerance | 0.000001 m | Two faces in a row this close are one face; further apart they are joined by a step |
| `mitreReach` | tolerance | 4 ratio | How far a joined corner may reach along a wall, in half thicknesses of the thicker wall; sharper corners are left cut square |
| `swingContact` | tolerance | 0.01 m | How far a wall must reach into a door's swing, or two swings overlap, to be in the way |
| `stepPastFace` | tolerance | 0.05 m | How far past a wall's face the route check steps through a door |
| `areaReported` | tolerance | 0.01 m² | The smallest area a message names; a room "wholly inside" another may have this much outside it |
| `areaEqual` | tolerance | 0.000001 m² | Two areas closer than this are the same, so an area at a figure a check applies is that figure (ARE-7); a room with less has no floor |
| `wallShare` | tolerance | 0.001 m² | Wall under a room below this is not named wall by wall |
| `touch` | tolerance | 0.002 m | How close a wall must come to a piece of floor to be one of its walls |
| `touchLength` | tolerance | 0.02 m | How long that contact must be |
| `slit` | tolerance | 0.003 m | Half the width of a slit that does not join two spaces |
| `lineInside` | tolerance | 0.05 m | The shortest stretch of a dividing line, or of a wall, inside a room that a message names |
| `roomsWallWidest` | tolerance | 0.6 m | The widest gap between two rooms written rooms first that is still one wall between them; a wider gap that is not a room is refused |
| `roomsTouch` | tolerance | 0.02 m | Rooms written rooms first closer than this touch with no wall between them, refused unless they are open to each other |
| `roomsFaceStep` | tolerance | 0.002 m | Faces of rooms written rooms first further out of line than this are named as sizes that do not add up |
| `diffLength` | tolerance | 0.001 m | Lengths closer than this are unchanged between two versions of a plan |
| `diffMovement` | tolerance | 0.01 m | A change held to a scope that moved less than this is rounding, not an edit |
| `diffSameLine` | tolerance | 0.01 m | A removed and an added wall this close to one line may be the same wall |
| `diffOpeningOffset` | tolerance | 0.05 m | A removed and an added opening this close may be the same |
| `diffWallOverlap` | tolerance | 0.9 ratio | The share of its length a removed wall must share with an added one to be the same |
| `diffRoomAreaShare` | tolerance | 0.1 ratio | A removed and an added room whose areas differ by less than this share may be the same |
| `diffRoomCentre` | tolerance | 0.1 m | And whose centres are this close |
| `wallAboveStorey` | tolerance | 0.001 m | How far a wall may rise past the height its floor states; past it, `wall/above-storey` names both heights |
| `sameLevelOverlap` | tolerance | 0.5 ratio | Two floors at one level whose walls' boxes share more than this of the smaller one stand one over the other (`plan/same-level`) |
| `outsideDoorAboveGround` | limit | 2 m | A door to the outside on a floor higher than this above the ground floor is named and is not a way out |
| `passableWidth` | limit | 0.4 m | Grid's own size, not a code figure: a door or doorless opening narrower than this is named (`opening/too-small-to-pass`) and is not a way through |
| `passableHeight` | limit | 1.2 m | Grid's own size, not a code figure: one lower than this is named and is not a way through |
| `passableSill` | limit | 0.3 m | Grid's own size, not a code figure: one whose sill stands higher than this above its floor is named and is not a way through |
| `sameFloorLevel` | tolerance | 0.005 m | Rooms side by side whose floors stand closer than this in height share a level, and no step is drawn between them |
| `floorOffsetLargest` | limit | 1.5 m | A room set further than this above or below its storey is asked about (`room/offset-question`) |
| `largest` | limit | 10000000 m | The largest coordinate or size Grid accepts (10,000 km); past it the part is refused |
| `farFromOrigin` | limit | 500 m | A plan reaching further from the origin gets a warning |
| `wallThinnest` | limit | 0.02 m | A thinner solid wall is questioned; a line with no substance should be virtual |
| `wallThickest` | limit | 3 m (1.5 in a home) | A thicker wall is questioned |
| `wallLowest` | limit | 0.1 m | A lower solid wall is questioned |
| `wallHighest` | limit | 40 m (10 in a home) | A higher wall is questioned |
| `wallHigherThanTypical` | limit | 4 ratio | A wall this many times higher than the typical one on its floor (with three others or more) is questioned |
| `openingNarrowest` | limit | 0.2 m | A narrower opening is questioned; whether a door is a way through is `passableWidth` |
| `openingLowest` | limit | 0.2 m | A lower opening is questioned |
| `roomLargest` | limit | 50000 m² (1000 in a home) | A larger room is questioned |
| `typicalHeightLowest` | limit | 1.8 m | The units question: the typical wall height of a building, from this… |
| `typicalHeightHighest` | limit | 6 m | …to this |
| `typicalThicknessLowest` | limit | 0.08 m | The typical wall thickness that agrees with a unit, from this… |
| `typicalThicknessHighest` | limit | 1 m | …to this |
| `typicalDoorLowest` | limit | 0.5 m | The typical door width that agrees with a unit, from this… |
| `typicalDoorHighest` | limit | 2.5 m | …to this |

### Starting a project: `grid init`

```bash
npx --no grid init demo
cd demo
npx --no grid check
npx --no grid export --format dxf
```

`grid init demo` makes the folder `demo` (the folder above it must exist) and writes:

| Path | What it is |
|---|---|
| `grid.json` | Marks the folder as a Grid project, and holds the project's id |
| `plan.json` | A starter plan: a two-room flat with its room uses and door swings stated, to change. It stores the same project id |
| `exports/` | Where `grid export` writes |
| `.gitignore` | The line `exports/`, added when it isn't there |

With no folder, `grid init` starts the project in the folder it runs in. A folder is a Grid
project when it holds `grid.json`. In a Grid project (the folder Grid runs in, or the one
named with `--project`), `check`, `describe`, `draw`, `export` and `sheet` read `plan.json` when no
plan file is named, and `export` writes into `exports/`. A plan file named on the command line is used
instead. Outside a Grid project a plan file must be named.

`grid init` never replaces a file. It refuses, changing nothing, a folder that already
holds `grid.json` (a second `grid init`) or `plan.json`, or a file named `exports`. Any
other folder is fine, empty or not: `grid init` only adds its own files.

The rules store (`@ongrid/rules/store`) keeps a project's build location and rules sheet on
this computer, outside the project folder, so a copy of the project never carries them. It
names them by the id in `grid.json`.

### The project folder

Grid reads and writes files only inside one folder, the project folder:

- the folder named with `--project <folder>`, or else the folder Grid runs in;
- never the top of a disk (`/`, `C:\`) or the home folder, where "inside" would mean almost
  anywhere. Run Grid in the folder that holds the plan, or name that folder with `--project`.

A relative path on the command line starts from the folder Grid runs in, as in any shell. A
path given to a tool of `grid serve` starts from the project folder, since a host may start
the server anywhere. `grid serve` started at the top of a disk or in the home folder still
runs, and each tool answers that it needs `--project`.

Symbolic links are followed, for the file and every folder above it, and the real path must
be inside the real project folder. Refused, with a message naming the path and the project
folder:

- a path outside the project, by `..`, as an absolute path or through a link;
- web addresses and other schemes (`https:`, `file:`, `data:`, `javascript:` ...);
- network and device paths (`\\server\share`, `\\?\C:\`);
- names Windows keeps for devices, with or without an extension (`CON`, `NUL`, `AUX`, `PRN`,
  `COM1` to `COM9`, `LPT1` to `LPT9`), hidden data streams (`plan.json:stream`), names
  ending in a dot or a space, and control or direction-override characters.

These hold on every system, so a path in a plan means the same wherever the plan goes; `\`
and `/` both separate folders. Grid creates no folder on the way, except `exports/` and the
one folder `grid init` is asked to make.

An export's file name comes from the plan file's name, never from text inside the plan.
Grid sanitises it rather than refusing it, and says so on standard error: a name Windows
keeps for a device gets `plan-` in front (`plan-con.dxf`); a name longer than five words or
40 characters, or one that reads as a claim about the plan or an instruction, becomes
`floor-plan`; one floor of several is named by its place in the plan (`house-floor-2.dxf`).

Every export writes the plan's walls, rooms and openings in id order (`w2` before `w10`), so the
same building gives the same bytes whatever order its file lists them in, and two exports can be
compared line by line. The IFC gives each element an identity made from the plan's `projectId`
with the element's kind, floor and id, so a re-export is recognised as the same model whatever
the plan file is called; keep those ids stable. A plan with no `projectId` falls back to the
plan file's name.

## Licence

Grid is licensed under the [Apache License 2.0](LICENSE) (`Apache-2.0`). See also
[NOTICE](NOTICE). To suggest a change, see [CONTRIBUTING.md](CONTRIBUTING.md).
