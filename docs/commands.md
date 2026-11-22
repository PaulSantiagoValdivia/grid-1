# Commands

Read this to run Grid from a shell: what each command does, its options and exit codes, and the
folder it reads and writes. `grid` and `ongrid` are the same command. To write a plan, start
with [rooms-first.md](rooms-first.md); an agent calls the same work as tools, in
[tool-server.md](tool-server.md).

- [The commands](#the-commands)
- [Options and exit codes](#options-and-exit-codes)
- [Starting a project: `grid init`](#starting-a-project-grid-init)
- [The project folder](#the-project-folder)
- [Describing a plan: `grid describe`](#describing-a-plan-grid-describe)
- [Walls that do not meet: `grid tidy`](#walls-that-do-not-meet-grid-tidy)
- [The 3D model as a picture: `grid draw --3d`](#the-3d-model-as-a-picture-grid-draw---3d)
- [A sheet for people: `grid sheet`](#a-sheet-for-people-grid-sheet)

## The commands

| Command | What it does |
|---|---|
| `grid init [<folder>]` | Starts a project folder: `grid.json`, a starter `plan.json` and `exports/` (see below) |
| `grid write <plan.rooms> [--plan <plan.json>] [--replace] [--json]` | Writes a plan from rooms text, the main way to write one: Grid works out the walls (see [Writing a plan rooms first](rooms-first.md)) |
| `grid check [<plan>] [--floor <id>] [--country <code>] [--json]` | Prints the report. Every report is labelled "General guidance, not your local rules" |
| `grid describe [<plan>] [--length line\|rooms\|walls] [--for person\|agent] [--as rooms]` | Describes the plan in a few lines: its rooms, which rooms each opening joins, and with `--length walls` its walls (see below). `--as rooms` reads it back as rooms text |
| `grid draw [<plan>] [--png \| --3d] [--out <file>] [--floor <id>] [--scale <n>]` | Draws one floor as SVG, or PNG with `--png`, or the 3D model as PNG with `--3d`; to standard output unless `--out` names a file |
| `grid export [<plan>] --format dxf\|ifc\|glb\|obj [--floor <id>] [--out <file>]` | Writes an export into `exports/` beside the plan, unless `--out` names a file |
| `grid sheet [<plan>] --layout client\|check [--sheet <sheet.json>] [--out <file.pdf>]` | Writes the plan as an A3 PDF for people: `--layout client`, with the words of `sheet.json`, or `--layout check`, with ids and findings (see below) |
| `grid edit <verb> [<plan>] [options]` | Changes the plan, one sentence of request a command: `opening`, `move-side`, `merge`, `split`, `add-room`, `stretch`, `rename`, `mirror`, each the tool of that name in [the tool server](tool-server.md) with the same options (`grid edit <verb> --help`) |
| `grid serve` | Starts the tool server on standard input and output, with the 20 tools in [the tool server](tool-server.md) |
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
such as where north is, the kind of building, how floors connect when it holds no stairs and
which rooms make each flat, is said as such. Directions are on the drawing, with north at the
top. The card checks nothing; it ends with the label "General guidance, not your local rules".

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

Grid draws only what the plan holds: no furniture, stairs or landscape. Every figure comes from
the same code as `grid check` and the area tools, and every page keeps the label "General
guidance, not your local rules". The pages use Source Serif 4 and Source Sans 3, under the SIL
Open Font Licence 1.1, which ship with Grid in `fonts/`. A sheet needs the canvas a PNG needs.
