# Measuring areas

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
