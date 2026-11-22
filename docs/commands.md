# Commands

Read this to run Grid from a shell: what each command does, its options and exit codes, and the
folder it reads and writes. `grid` and `ongrid` are the same command. To write a plan, start
with [rooms-first.md](rooms-first.md); an agent calls the same work as tools, in
[tool-server.md](tool-server.md).

- [The commands](#the-commands)
- [Options and exit codes](#options-and-exit-codes)
- [Starting a project: `grid init`](#starting-a-project-grid-init)
- [The project folder](#the-project-folder)
- [The report, short or full, and notes seen: `grid check`](#the-report-short-or-full-and-notes-seen-grid-check)
- [Describing a plan: `grid describe`](#describing-a-plan-grid-describe)
- [Walls that do not meet: `grid tidy`](#walls-that-do-not-meet-grid-tidy)
- [What went wrong, on the drawing: `grid draw`](#what-went-wrong-on-the-drawing-grid-draw)
- [What a drawing shows: `--hide`, `--colour` and `--key`](#what-a-drawing-shows---hide---colour-and---key)
- [Stairs, lifts and the floor above on the drawing](#stairs-lifts-and-the-floor-above-on-the-drawing)
- [The 3D model as a picture: `grid draw --3d`](#the-3d-model-as-a-picture-grid-draw---3d)
- [A sheet for people: `grid sheet`](#a-sheet-for-people-grid-sheet)
- [Who sits where: `grid occupancy`](#who-sits-where-grid-occupancy)

## The commands

| Command | What it does |
|---|---|
| `grid init [<folder>]` | Starts a project folder: `grid.json`, a starter `plan.json` and `exports/` (see below) |
| `grid write <plan.rooms> [--plan <plan.json>] [--replace] [--json]` | Writes a plan from rooms text, the main way to write one: Grid works out the walls (see [Writing a plan rooms first](rooms-first.md)) |
| `grid check [<plan>] [--floor <id>] [--country <code>] [--full] [--json] [--seen <n> --reason <text> --by <name> \| --unseen <n>]` | Prints the report, short and about this plan unless `--full`. Every report is labelled "General guidance, not your local rules". `--seen` sets a note aside as seen (see below) |
| `grid describe [<plan>] [--length line\|rooms\|walls] [--for person\|agent] [--as rooms]` | Describes the plan in a few lines: its rooms, which rooms each opening joins, and with `--length walls` its walls (see below). `--as rooms` reads it back as rooms text |
| `grid draw [<plan>] [--png \| --3d] [--look <name>] [--hide <parts>] [--colour use] [--key] [--out <file>] [--floor <id>] [--scale <n>]` | Draws one floor as SVG, or PNG with `--png`, or the 3D model as PNG with `--3d`; to standard output unless `--out` names a file. In the technical look (black on white, lines in millimetres on paper) unless `--look working` or `dark`. `--hide`, `--colour` and `--key` choose what it shows (see below) |
| `grid export [<plan>] --format dxf\|ifc\|glb\|obj [--floor <id>] [--out <file>]` | Writes an export into `exports/` beside the plan, unless `--out` names a file |
| `grid sheet [<plan>] --layout client\|check [--sheet <sheet.json>] [--out <file.pdf>]` | Writes the plan as an A3 PDF for people: `--layout client`, with the words of `sheet.json`, or `--layout check`, with ids and findings (see below) |
| `grid edit <verb> [<plan>] [options]` | Changes the plan, one sentence of request a command: `opening`, `move-side`, `merge`, `split`, `add-room`, `stretch`, `rename`, `mirror`, `square` (squares a scanned plan and says how far each wall moved), each the tool of that name in [the tool server](tool-server.md) with the same options (`grid edit <verb> --help`) |
| `grid occupancy [<plan>]` | Lists who sits where, by room, from the occupancy file beside the plan; no export carries it (see below) |
| `grid serve` | Starts the tool server on standard input and output, with the 23 tools in [the tool server](tool-server.md) |
| `grid mcp` | The same as `grid serve`, under the name agents start it by (`npx -y ongrid mcp`) |

## Options and exit codes

Every command also takes `--project <folder>` (see below). An unknown, repeated or
meaningless option is refused by name. The command exits 0 when it did its work, 1 when the
plan or a path was refused or a file could not be written, and 2 when the command line was
refused. A refusal is one line on standard error. Findings in a report are not a refusal:
`grid check` still exits 0.

## Starting a project: `grid init`

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

## The project folder

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

### What an export leaves out (HND-6)

An export holds what the views draw, and leaves out the parts validation says cannot be drawn:
a zero-length wall, the rooms and openings that rest on it, an opening on a wall whose id is
used on several floors. It leaves out the parts the reader left out too (MSG-6): an id used
twice, a value a part cannot do without. Each file says so, and so does the command:

- On standard error, one line: how many parts, of which kinds, the first few by id (or by their
  place in the file, `openings[4]`, when the reader could not read the id), and that
  `grid check` says why.
- In the file, only when something was left out, so the file of a sound plan is as it was:
  - IFC: the property set `Grid_LeftOut` on the building, with `Parts` (how many), `Note` (in
    words), and for each kind a count and its ids (`Openings`, `OpeningIds`, `Rooms`, `RoomIds`,
    `Walls`, `WallIds`, `Fixtures`, `FixtureIds`, `Floors`, `FloorIds`).
  - DXF: the layer `GRID-LEFT-OUT`, with the same note as text under the drawing: a line that
    says how many, then a line or more per kind with the ids.
  - OBJ: the same note as comment lines after the header.
  - GLB: `asset.extras.gridLeftOut`, with `count`, `note` and `parts` (each part as the tool
    server's receipt gives it).
- An id that several parts share is named once, with how many (`"bath" 4 times`).

DXF, OBJ and GLB hold one floor: they name what is left out of that floor, every opening no
floor holds, and every part the reader left out, which Grid cannot place on a floor. The IFC
names what is left out of every floor.

The views validate each floor on its own, so a wall id written on two floors is drawn and
exported on each, while `grid check`, which validates the whole plan, says the id is used twice
(`plan/duplicate-id`). The export names what its file leaves out, not every line `grid check`
gives.

An export that would hold nothing of the plan (no wall, room or fixture that can be drawn, on
the floor asked for) is refused with exit code 1, and no file is written: `Nothing to export:
plan.json has no wall, room or fixture that can be drawn.` It names what is left out, when
anything is.

### What the IFC holds (HND-2)

The IFC is written so that a BIM program can schedule and take off from it. Everything in it is
something the plan already says, put in the field IFC has for it; where the plan says nothing,
the file says that too.

- **Rooms.** Each room is a space whose name is its number and whose long name is the room's
  name. Numbers are the room schedule's (`grid_schedule`): floors by level, then by id, rooms by
  id, 1, 2, 3… across the floors. The use, when the plan states one, is the space's object type
  and `Category` in `Pset_SpaceCommon`, whose `Reference` is the number. Grid's own set
  `Grid_Space` holds `Id`, `Number`, `Use` (`not said` when the plan states none), `Area`, and
  `AreaMeasure` and `AreaRule`, which name the measure and its rule: the net area as
  `grid_areas` measures it.
- **Base quantities**, as `Qto_…BaseQuantities` sets:
  - spaces: height, perimeter, footprint (`GrossFloorArea`), net area (`NetFloorArea`), volume;
  - walls: length on the axis, thickness, height, footprint with corners joined, side area and
    volume, gross and less every opening in the wall;
  - slabs, roof slabs and stair landings: thickness, perimeter, area and volume, and for a slab
    a stair, lift shaft or void opens, its net area and volume too (IFC2x3 has no roof set: the
    roof's slab carries it);
  - doors and windows: width, height and area of the hole in the wall; a doorless opening the
    same, with its depth; an opening in a slab its depth and area;
  - ceilings (`Qto_CoveringBaseQuantities`): their area; parapets: height, footprint and volume.
- **Slabs.** They are the ones the 3D view draws ([Slabs, roofs, ceilings and the
  ground](plan-file.md#slabs-roofs-ceilings-and-the-ground)): one per floor over its outline, a
  piece of its own under a room set above or below its storey, and a flat roof over every part
  with nothing above. The plan states no slab or roof outline, so each is Grid's and says so in
  `Grid_Slab`: `Assumed`, `ThicknessStated` (whether the floor states its slab's thickness) and
  a `Note` on what Grid took.
- **Walls** are typed by the kind the plan states and their thickness (`Exterior wall 0.3 m`),
  the same grouping the estimate prices (`wall:exterior:0.3` is the type's tag). Each type
  carries a one-layer material set, with one material per kind; its walls carry the set's
  usage. The plan holds no build-up, and the type's description says so.
- **Doors and windows** are typed by size, and doors by handing too (`Door 0.9 x 2.1 m, single
  swing, left`), tagged as the estimate keys them (`door:0.9x2.1`). A door whose swing the plan
  does not state is typed by its size alone.
- **Flats** are not written as zones: the plan format holds no flats yet.
- **Where it stands.** A plan that reaches more than 500 m from the origin (`farFromOrigin`) is
  moved, in whole steps of that distance, to near the origin, and the move is the site's
  placement: everything keeps its place, and its own coordinates stay small. A plan that states
  its `site` keeps the site's origin on that point (CNT-3), and the building's placement holds
  the rest of the move. There is always at least one storey.

## The report, short or full, and notes seen: `grid check`

`grid check` prints a short report about this plan (MSG-10): the label, each line to look at
with what was found, what was needed and the fix, the figures those lines used (each as the
figure used here, with its document, edition, clause and status), what each check looked at in
counts, with the parts it could not look at and why, and one line on what `--full` adds.
`--full` prints the whole report: the checks run, every figure, each part each check looked at
or skipped, and what these checks never look at. `--json` always gives the whole check.

A note you have looked at can be set aside as seen, with why and who:

```bash
grid check --seen 3 --reason "A box room, kept small on purpose" --by "Owner"
grid check --unseen 3
```

The number is the note's in the report of the whole plan (with `--country`, give the same
country). The mark is written to the marks file beside the plan, `plan.seen.json` beside
`plan.json`, and the report follows. A seen note is still listed, under "Seen", with its reason,
who marked it and the day, and the count says how many are seen. When one of the parts it is
about changes (the room or its walls, the door or its wall, the floor, or the plan for a note
about the plan), the note is listed as new again, saying it was seen before and what changed.
`--reason` and `--by` go with `--seen` only. Who marked it is the name or role you give: it is
kept only in the marks file, which no export, sheet or drawing reads.

## Describing a plan: `grid describe`

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
such as where north is, the kind of building when the plan does not say it, how floors connect
when no stair joins them and which rooms make each flat, is said as such; a kind the plan states
is said after the first line. The stairs that join the floors are one line, with the risers and
going Grid worked out. Directions are on the drawing, with north at the top. A plan that states
its real north or its front gets a few more lines: that north, which way each side of the drawing
really faces, and which rooms face each way
([plan-file.md](plan-file.md#north-front-and-where-the-building-is)). The card checks nothing and
says so; its first line is the label "General guidance, not your local rules", as for every
report (MSG-3). `--as rooms` starts with the label as a comment, which `grid write` ignores, and
`grid draw` puts it in the drawing's top-left corner.

## Walls that do not meet: `grid tidy`

`grid tidy [plan.json]` lists the faults where walls meet (a wall short of its corner, a gap in a
straight side, a wall running past its last corner, a copy lying on its original, a dividing
line on a solid wall, a wall listed twice, a wall across a room that does not list it, walls
standing inside a room), each with the fix Grid offers or why it offers none. A fix is offered
only after it was tried and left every room it touches with an outline. `grid tidy --apply
<id>,<id>` makes the fixes named, and `--apply all` every one offered; the faults are looked for
again before each fix, and one an earlier fix took care of is skipped and said so. The plan file
is changed as read, keys Grid does not know included; `--out <file.json>` writes the tidied plan
there instead. `--json` prints the list or what was applied as JSON.

## Units on the drawing: `grid draw --units`

`grid draw --units m|cm|mm|ft-in` writes the drawing's room areas and dimensions in those
units, and `--decimal point|comma` with that decimal mark: `--units ft-in` draws `12'-6"`,
`--units mm` draws `2860`. Left out, the plan's own `display` is used, or metres. A length typed
on `grid edit` may carry its unit (`--by "12'6\""`, `--width "900 mm"`) and, with
`--decimal comma`, a decimal comma (`--by 0,3`). The plan file stays in metres either way; see
[Units](plan-file.md#units).

## Grid's words in your language: `--lang`

`grid check`, `grid describe`, `grid draw` and `grid sheet` take `--lang en|es`: the language
Grid writes its own words in, the label first. Left out, the plan's own `display.language`, or
English. Spanish writes figures with a decimal comma unless the plan's `display.decimal` says
`point`. Room names stay as the plan writes them, and the codes in brackets stay as they are. The
Spanish words are a draft translation, not reviewed yet; see [Languages](languages.md). A
language Grid does not write is refused by name.

## What a drawing shows: `--hide`, `--colour` and `--key`

A floor plan picture shows the plan's title and key in a band under the drawing, its notes, tags
and symbols, its sketch, the sizes, the room areas, the door swings and the warnings (the
plan file's writing is in [plan-file.md](plan-file.md#writing-on-the-drawing-and-the-sketch-layer)).
`--hide` leaves parts off, named and joined by commas: `title`, `key`, `notes`, `sketch`,
`dimensions`, `areas`, `swings`, `warnings`, `above`. `--colour use` fills each room by its use and lists
the uses in the key. `--key` adds a key where the plan asks for none. A word Grid does not know
is refused by name, and none of the three is taken with `--3d`. `grid_view` takes the same as
`hide`, `colour` and `key`.

## The sizes on a drawing

A floor plan picture's sizes run along the walls, in the plan's own two main directions (the
way most of its outside walls run), so a house drawn turned is dimensioned along its walls, not
by the box it makes on the page.

- Inside each room: a room with four square corners gets its width and depth, between its
  walls' faces. Any other room (an L, a room with a bay, a skewed one) gets one size per side,
  a little in from that side, and every line stays inside its room.
- Outside the plan, on each side that has them, three chains, nearest first: the openings
  (from the corner to each edge of a door or window in the walls facing that side), the walls
  (each wall's faces where it meets that side, and the corners) and the overall size. Each
  chain runs between the same two outer faces, so it adds up to the overall size. The overall
  width is always below the plan and the overall depth to its left; above and to the right
  there is one only where a chain is.
- Every size measures to a wall's face, or to the line of a dividing line, which has no
  faces. A plan records no finishes, so none measures to a finish yet. In an SVG each
  dimension's `data-measured-to` says it, for its two ends: `face`, `centre-line` or `finish`.

In the technical look each dimension line ends in a 45-degree tick and its number runs along
it; the working look keeps plain ends and upright numbers. `--hide dimensions` leaves them all
off.

## Stairs, lifts and the floor above on the drawing

A floor plan is drawn as an architect expects it (SHT-11), from shapes the core works out and the
look only strokes:

- **A stair the plan states** is drawn on both floors it joins, with a line at every riser and
  its walking line ending in an arrow head pointing up. On the floor it rises from, the plan is
  cut 1.2 m above the floor (`planCutHeight` in [tolerances.md](tolerances.md)): the stair is
  solid up to the break line across the flight there, and dashed above it. On the floor it
  arrives on, it lies wholly below the cut and is drawn solid. A stair drawn only as a room used
  as a stair has no stair object, so it gets no treads: state it in `stairs`
  ([plan-file.md](plan-file.md#stairs-that-join-two-floors)).
- **A lift shaft**, a room used as a `lift`, gets a cross in it, corner to corner, on every floor.
- **The floor above** shows as a dashed outline: the outline of the floors at the next level up,
  the one whose area is the gross external area, less the stretches that lie on this floor's own
  outline. What is left is an overhang past the walls, a loft or a floor that steps back inside
  them. A stretch over an inner wall is hidden by the wall. `--hide above` leaves it off. The
  plan cannot say where a floor has a void, so a void inside the walls above is not told apart.

The working look draws all three in thin lines, dashed 4 on 3 pixels; the technical look with its
finest pen (the floor above with the fine pen), dashed 1.5 on 1 mm on paper. The key, where the
picture has one, names the floor above. The app's 2D view and `grid draw` draw the same shapes.
The DXF does not draw them yet.

## What went wrong, on the drawing: `grid draw`

`grid draw` and `grid_view` show what went wrong on the drawing. Every line `grid check` prints
for the floor drawn has its number from that list in a small mark on the room, door, window,
wall or fixture it is about, with its words beside it; a line about the whole floor has its mark
in the top-left corner. The same lines are listed by number under the drawing. A room that
cannot be drawn is not left blank: it is the dashed box round its walls, with its name and the
reason. `docs/result-contract.md` says how the numbers are given.

## The 3D model as a picture: `grid draw --3d`

`grid draw --3d` takes the 3D model as the app opens it: the same scene, from the same camera
(south-east, about 29.5 degrees down, through a 45 degree lens). It needs no browser and no
graphics card: the scene is drawn in software, each face lit flat, without shadows. With
`--floor`, that floor is shown as a cutaway, as in the app; without it, the whole building.
The PNG is 1200 by 800 pixels, times `--scale` (up to 4).

## A sheet for people: `grid sheet`

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

Grid draws only what the plan holds: no furniture or landscape, and no stair treads but for the
stairs the plan states. Every figure comes from
the same code as `grid check` and the area tools, and every page keeps the label "General
guidance, not your local rules". The pages use Source Serif 4 and Source Sans 3, under the SIL
Open Font Licence 1.1, which ship with Grid in `fonts/`. A sheet needs the canvas a PNG needs.

## Who sits where: `grid occupancy`

`grid occupancy [plan.json]` reads the occupancy file beside the plan, `plan.occupancy.json`
beside `plan.json`, and prints each seat by its room's name, with its desk and the people at it.
A seat whose room the plan no longer has, after a room was renamed in its id or taken out, is
named by its place in the file (`seats[2]`), with the id it names. Without the file, the command
is refused and says where the file goes.

The file is kept apart from the plan so that people's names never travel with it: no export,
sheet or tool of the tool server reads it, and the tool server has no tool for it. Its format is
in [People are kept out of the plan](plan-file.md#people-are-kept-out-of-the-plan).
