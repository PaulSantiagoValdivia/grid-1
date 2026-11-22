# Changelog

What changed in Grid, for the people who use it. Agents have a changelog of their own, beside
the result contract in [docs/result-contract.md](docs/result-contract.md), which says what a
tool's answer holds and what may change in it. [RELEASING.md](RELEASING.md) says how a version
is cut.

A change people will notice adds a line under "Unreleased", in plain words: what you can do now,
or what works differently. The release step turns "Unreleased" into the release's section and
records which versions of the result record and the plan format it carries.

Every report Grid gives is labelled "General guidance, not your local rules". No release makes
Grid say that a plan complies with anything.

## Unreleased

- Lengths may be typed in feet and inches, millimetres or centimetres, or with a decimal comma, and are stored in metres. A plan's `display` (or `--units` and `--decimal`) shows areas, dimensions and schedules in the person's units: `12'-6"`, a sill of `48"`, `2860` (WRT-7).

Grid has not been released yet. The first release will hold:

- `grid write` writes a plan from rooms text, with each room's size and neighbours, and works
  out the walls; `grid describe --as rooms` reads any plan back the same way.
- `grid check` gives one list of what to look at in a plan, with one count: parts that cannot
  be drawn, parts very likely wrong, what the checks found, and what they could not check.
- Every report, `grid_check` and the check sheet list what the checks never look at, ceiling
  height and which walls carry load among them.
- "General guidance, not your local rules" comes first in every report, list and tool answer,
  and is on every drawing and in every DXF, IFC, GLB and OBJ file. No line says a plan passes,
  complies or is approved, and a figure is given as the figure used here, with where it comes
  from and how far a person has checked it.
- `grid tidy` lists the walls that do not meet and makes the fixes you choose.
- Every note and pass that used a figure says which kind of building the figure was read for:
  today, homes.
- A plan can say what kind of building it is (a home, an office, a shop, a school…), and a floor
  can say otherwise for itself, such as a shop under flats. The home figures then run only where
  it is a home, or where the plan does not say, and the report says in plain words which checks
  did not apply to an office or a shop. Rooms have 27 uses, from office and classroom to plant
  and parking; a plain word such as "WC" or "staff room" is read as its use, and the person's
  own word stays the room's name. A room can say who it is for (private, shared, common or
  commercial) and carry the firm's own room type.
- `grid describe`, `grid draw`, `grid export` and `grid sheet` describe a plan, draw it, export
  it and lay it out as an A3 sheet in PDF.
- `grid init` makes a folder a Grid project, where the commands read its `plan.json`.
- An agent that meets a problem in Grid can draft an issue about it with `grid_report_problem`:
  the plan cut down and cleared of names and paths. Grid sends nothing; you decide whether to
  file it.
- Every pull request is checked on GitHub, on Linux and on Windows: the type check, the lint,
  the tests, the licence check and the scoreboard.
- Who sits where is kept in a file of its own beside the plan, `plan.occupancy.json`, linked to
  its rooms and desks. No export or sheet carries it; `grid occupancy` lists it by room.
- `grid serve`, or `grid mcp`, is the tool server an agent uses, with 21 tools.
- A room schedule (number, name, use, area, height, floor, with the totals of each floor and of
  all floors) and a door and window schedule that lists each opening once with the two rooms it
  joins, as text, as CSV for a spreadsheet, and as tables at the end of the check sheet.
- Quantities for a first estimate: floor finishes and wall faces by room use, ceilings,
  skirting, reveals, walls by kind and thickness, the outside face, doors and windows by size,
  and the slab, upper floors and roof worked out from the outlines and marked assumed, each line
  with its rule. A cost comes only from your own rates file beside the plan, which must name its
  currency; without one you get a rate card to fill in, and lines with no rate or a rate in the
  wrong unit are listed, never filled.
- Plans can hold several floors at their levels, steps inside a floor, rooms inside rooms and
  rooms with holes, such as a courtyard.
- The door-swing check stays quick on a floor of thousands of rooms, and the 2D view checks
  only the floor it shows.
- `grid check` says where an opening does not fit: a door or window that runs into a wall meeting
  its wall, a wall that ends inside a window, an opening as long as its wall, a door on a dividing
  line, and a window between two rooms (perhaps a borrowed light). `grid_split_room` will not end
  a new wall inside a door or window, and says the nearest size that is clear.
