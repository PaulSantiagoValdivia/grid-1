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

Grid has not been released yet. The first release will hold:

- `grid write` writes a plan from rooms text, with each room's size and neighbours, and works
  out the walls; `grid describe --as rooms` reads any plan back the same way.
- `grid check` gives one list of what to look at in a plan, with one count: parts that cannot
  be drawn, parts very likely wrong, what the checks found, and what they could not check.
- Every report, `grid_check` and the check sheet list what the checks never look at, ceiling
  height and which walls carry load among them.
- `grid tidy` lists the walls that do not meet and makes the fixes you choose.
- Every note and pass that used a figure says which kind of building the figure was read for:
  today, homes. A plan cannot say yet what kind of building it is, so a café or a hotel is
  measured with a home's figures, and the report now says so.
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
- Plans can hold several floors at their levels, steps inside a floor, rooms inside rooms and
  rooms with holes, such as a courtyard.
