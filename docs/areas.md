# Measuring areas

Read this to know what an area figure measures, which gross area comes first where, and how the
room and opening schedules are made.

Grid gives three areas, per floor and per use, from the spaces the walls enclose. Each is
described in Grid's own words by what it measures, and no figure is said to follow a published
standard: a standard's rule would come in only as a figure record, with its document, edition,
clause, place, day read and status, and none is carried yet.

| Measure | What it measures | Not taken off | What the plan cannot say |
|---|---|---|---|
| Net area | Net area is the floor inside each room, measured to the faces of its walls, less any hole in it and any room drawn inside it. | Nothing inside a room is taken off: fixed units, a column drawn without walls and floor under a low ceiling all count. | The plan cannot say which rooms the reader counts: a balcony or a store drawn as a room counts unless it is named as outside. |
| Gross internal area | Gross internal area is the floor inside the inside face of the walls that face outside, with the inner walls and partitions counted. | Inner walls, partitions, stairs and floor no room claims are not taken off. | Which walls face outside is worked out from the rooms beside them; the plan cannot say whether floor no room claims, such as a courtyard or a light well, is covered, so it counts. |
| Gross external area | Gross external area is the floor inside the outside face of the walls, every wall counted. | Outer walls, inner walls and floor no room claims are not taken off. | The plan cannot say which walls are shared with a neighbour, so a shared wall counts in full, and a wall standing apart counts too. |

On every floor the gross external area is the net area, plus the rooms named outside, the walls
and the floor no room claims, to a millionth of a square metre. Where rooms overlap, or run over
walls or outside them, the answer says how much floor that is, and the sum takes it off. The
gross internal area leaves out the walls that face outside, stretch by stretch, as Grid works
them out from the rooms beside them, with the corners between them; a floor with no such wall
has none. A room Grid could not draw is named and left out of every figure.

Which gross area comes first follows the country the plan will be built in: the inside face of
the outer walls in the UK and most of Europe, the outside face for homes in the US. With no
country, or one Grid has no usual measure for, both are given; either or both can be asked for.
In the library: `planAreaFigures(plan, options)`, `MEASURES` and `usualGross(country)`. The
`grid_areas` tool ([tool-server.md](tool-server.md)) prints each figure with its rule, takes
`country` and `gross`, and marks each figure's state ([result-contract.md](result-contract.md)).

## Schedules

Two schedules are built on these areas (ARE-12), as data first: the text of `grid_schedule`,
its CSV and the tables on the check set are all written from the same rows, so no part reads
another's printed text.

- **The room schedule** (`grid_schedule` with `of=rooms`): one row per room, with its number,
  name, use, net area, height and floor, then each floor's total, named by its floor, and the
  total of all floors. The plan holds no room numbers: Grid numbers the rooms 1, 2, 3… floor by
  floor from the lowest, then by id, so the schedule is the same whatever the order of the file.
  The height follows the rule in [tool-server.md](tool-server.md) (a height the room states, or
  the lowest solid wall round it). A room Grid could not draw is listed with no area, and the
  totals say they leave it out.
- **The opening schedule** (`grid_schedule` with `of=openings`): every door, window and doorless
  opening once, numbered by floor, then doors, doorless openings and windows, each by id, with
  its size (the hole in the wall) and what lies on its two sides: a room's name, `outside`,
  `nothing drawn` or `a room left out`. A door between two rooms is one row, not one for each
  room. Without `of`, `grid_schedule` groups the openings by type and size, as before.

With `format=csv`, numbers are bare (a dot for decimals, no units in the cell, never a negative
zero), so a spreadsheet reads them as numbers; the units are in the column names. A row that
cannot be written, a missing name or an area that is not a number, stops the schedule with an
error naming the row; it is never left out in silence. `grid sheet --layout check` ends with
both schedules as tables.

