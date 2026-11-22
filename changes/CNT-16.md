# 2026-11-22: columns and a structural grid (CNT-16)

## For people

- A plan can hold columns as things of their own, square or round, instead of very short walls
  (CNT-16). Each comes off the net area of the room it stands in, and the area says so: an open
  office with three columns measures what it measures by hand. Columns are drawn cut through, as
  walls are, and export as columns: IfcColumn in the IFC, a layer of their own in the DXF, a solid
  each in the OBJ and the GLB, on the sheet, in the take-off and in the description. A column can
  rise through several floors as a wall can. A plan can also name a structural grid: its lines
  are drawn with their names (1, 2, 3 and A, B, C unless you name them) and their spacing
  dimensioned, on screen, on the sheet and in the DXF.

## For agents

- Plan format (C25): `columns` (`id`, `shape` `square` or `round`, `width`, `depth` for a square
  one only, `at`, `turn`, `height`, `floor`, `through`, `label`) and `grids` (`id`, `name`,
  `origin`, `turn`, `floors`, `x` and `y`, each `spacing` and `names`). All optional and never
  defaulted; version 1. A round column with a `depth`, a set of grid lines whose `names` do not
  match its lines, more than 100 lines in a set and two lines of one grid with one name are
  refused by the schema.
- A room's net area is less the floor its columns cover (inside its outline); the net area's rule
  (`MEASURES.net`, and the IFC's `AreaRule` and `NetFloorArea` description) now says so.
  `grid_areas` gives each room's `columns` (`area` and `ids`) and each floor's `columns`, and a
  note when columns are taken off. On every floor the gross external area is the net area plus
  the floor under columns, the stair rooms counted below, the rooms named outside, the walls and
  the floor no room claims, less what is off its space.
- New left-out lines `plan/column-too-large`, `plan/column-duplicate-id` and
  `plan/column-unknown-floor`: the column is in no view, measure or export. New warnings
  `plan/column-through-floor` (its `through` reaches no floor above its own: it stands on its own
  floor only) and `plan/grid-unknown-floor` (a grid names a floor the plan does not have; it is
  drawn on the others). Each line's thing is the plan, its `also` the column's or the grid's id.
- `grid_takeoff` adds `columns`: per shape the count, the metres of column and the volume, with
  its rule. The describe card says each floor's columns; its agent form writes them as
  `COLUMNS id shape size @x,y`.
- The DXF has two new layer categories, `columns` (`GRID-COLUMNS`) and `structural-grid`
  (`GRID-STRUCTURAL-GRID`, a chain line), which a DXF profile may name. The OBJ and GLB name each
  column `column_<id>`. Dimensions of kind `grid` measure a structural grid's spacing.

## Codes

| `plan/column-too-large` | A column is too large, or too far out, for Grid to build | a column's size and place in metres, within the largest Grid accepts |
| `plan/column-duplicate-id` | A column has an id another part of the plan has too | an id of its own on every column |
| `plan/column-unknown-floor` | A column stands on a floor the plan does not have | a floor of the plan |
| `plan/column-through-floor` | A column rises through a floor that is not above its own, so it stands on its own floor only | through naming a floor above the column's own, from the plan's floors |
| `plan/grid-unknown-floor` | A structural grid names a floor the plan does not have | floors of the plan, by id |
