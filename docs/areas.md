# Measuring areas

Read this to know what an area figure measures, which gross area comes first where, how the
room and opening schedules are made, and how the quantities for a first estimate are measured
and priced from your own rates.

Grid gives three areas, per floor and per use, from the spaces the walls enclose. Each is
described in Grid's own words by what it measures, and no figure is said to follow a published
standard: a standard's rule would come in only as a figure record, with its document, edition,
clause, place, day read and status, and none is carried yet.

| Measure | What it measures | Not taken off | What the plan cannot say |
|---|---|---|---|
| Net area | Net area is the floor inside each room, measured to the faces of its walls, less any hole in it and any room drawn inside it; a stair drawn as a room on floor after floor counts once, on the floor it rises from. | Nothing inside a room is taken off: fixed units, a column drawn without walls and floor under a low ceiling all count. | The plan cannot say which rooms the reader counts: a balcony or a store drawn as a room counts unless it is named as outside. |
| Gross internal area | Gross internal area is the floor inside the inside face of the walls that face outside, with the inner walls and partitions counted. | Inner walls, partitions, stairs and floor no room claims are not taken off. | Which walls face outside is worked out from the rooms beside them; the plan cannot say whether floor no room claims, such as a courtyard or a light well, is covered, so it counts. |
| Gross external area | Gross external area is the floor inside the outside face of the walls, every wall counted. | Outer walls, inner walls and floor no room claims are not taken off. | The plan cannot say which walls are shared with a neighbour, so a shared wall counts in full, and a wall standing apart counts too. |
| Area by headroom | Area by headroom is the floor of each room with at least 1.5 m, and with at least 2.2 m, of height over it, from the room's floor to its ceiling or to the underside of the roof its floor states, whichever is lower. | It is part of the net area: nothing standing in the room is taken off, and floor under a lowered zone of the ceiling counts by that zone's height. | The plan cannot say how deep the roof is built up or where a low slope is boxed in, so the height is taken to the roof's underside as stated, from its eaves on the outside walls' lines. |

On every floor the gross external area is the net area, plus the rooms named outside, the walls
and the floor no room claims, to a millionth of a square metre. Where rooms overlap, or run over
walls or outside them, the answer says how much floor that is, and the sum takes it off. The
gross internal area leaves out the walls that face outside, stretch by stretch, as Grid works
them out from the rooms beside them, with the corners between them; a floor with no such wall
has none. A room Grid could not draw is named and left out of every figure.

Under a sloped roof (LVL-6) a room's floor is also given by headroom band: how much of it has at
least 1.5 m (`headroomLow`) and at least 2.2 m (`headroomFull`) of height over it, Grid's own
figures, not a code figure ([tolerances.md](tolerances.md)). The height is measured from the room's
floor to the lower of its ceiling (its own `height`, else its storey's, with any lowered zone) and
the underside of the roof its floor states ([plan-file.md](plan-file.md#sloped-roofs-and-ceilings)).
`grid_areas` gives the bands for each room on such a floor, with its lowest and highest height,
and adds them up per floor and in all; a floor that states no roof gets none, since its ceilings
are level. In the library: `roomHeadroom(plan, room)`. No band is checked against a figure: the
bands are reported, and nothing says a room is high enough.

A stair is counted once (SHT-11, lab DR-5). Where rooms used as a stair lie one over the other
on neighbouring floors, joined as the way-out check joins them (they share at least half of the
smaller one), they are one stair, and its floor is counted on the floor it rises from: the
lowest of them. The stair rooms over it keep their own area in the room list, marked with the
room they are counted with (`countedWith`), and are in no net figure, no area by use and no
circulation figure; the answer says so in a note. The gross areas still hold them, so on every
floor the gross external area is the net area plus those stair rooms (`overStairs`), the rooms
named outside, the walls and the floor no room claims. The same holds when only some floors are
asked for: a floor's stair room over the stair below is counted on the floor below. A stair the
plan states (`stairs`) adds no floor of its own: its flights stand in rooms already measured. A
lift shaft drawn on every floor is still counted on every floor.

Which gross area comes first follows the country the plan will be built in: the inside face of
the outer walls in the UK and most of Europe, the outside face for homes in the US. With no
country, or one Grid has no usual measure for, both are given; either or both can be asked for.
In the library: `planAreaFigures(plan, options)`, `MEASURES` and `usualGross(country)`. The
`grid_areas` tool ([tool-server.md](tool-server.md)) prints each figure with its rule, takes
`country` and `gross`, and marks each figure's state ([result-contract.md](result-contract.md)).

A floor may state its outline before any wall (BRF-4,
[plan-file.md](plan-file.md#a-floor-outline-before-the-walls)). On a floor with walls the outline is
joined with what they enclose, and floor inside it that no wall encloses is floor no room claims,
in both gross figures. A floor with an outline and no walls is massing: its gross external area
is the area inside its outline, and it has no net area and no gross internal area, since there is
no inside face of walls to measure to; the answer names the massing floors. `grid_areas` also
counts the storeys, by level, from the floors that hold an outline or walls that close one.

The site's things (BRF-3: fences, gates, paths, paving, trees and pools) are in no area: they are
never rooms. The plot coverage, the building's shape seen from above against the plot's area, is
not one of these figures: `grid_measure` with `what=site` gives it, from the outside face of every
floor at or above the ground floor ([tool-server.md](tool-server.md#the-plot-distances-to-the-boundary-and-the-coverage)).
A floor area ratio the person gives is measured there too, by the gross measure they name: the
figure's name and what it measures are said with it.

## Schedules

Two schedules are built on these areas (ARE-12), as data first: the text of `grid_schedule`,
its CSV and the tables on the check set are all written from the same rows, so no part reads
another's printed text.

- **The room schedule** (`grid_schedule` with `of=rooms`): one row per room, with its number,
  name, use, net area, height and floor, then each floor's total, named by its floor, and the
  total of all floors. Grid numbers the rooms 1, 2, 3… floor by floor from the lowest, then by
  id, so the schedule is the same whatever the order of the file. A room that states its number
  in the plan (CNT-9) is given that number, and the rooms that state one come first on their
  floor, in its order; each row carries the room's facts of the person's own, and the CSV has a
  column for each ([Facts of your own](plan-file.md#facts-of-your-own-and-room-numbers)).
  The height follows the rule in [tool-server.md](tool-server.md) (a height the room states, or
  the lowest solid wall round it). A room Grid could not draw is listed with no area, and the
  totals say they leave it out.
- **The opening schedule** (`grid_schedule` with `of=openings`): every door, window and doorless
  opening once, numbered by floor, then doors, doorless openings and windows, each by id, with
  its size (the hole in the wall) and what lies on its two sides: a room's name, `outside`,
  `nothing drawn` or `a room left out`. A door between two rooms is one row, not one for each
  room. Each row carries the opening's facts of the person's own, a fire rating say, and the CSV
  has a column for each. Without `of`, `grid_schedule` groups the openings by type and size, as
  before.

With `format=csv`, numbers are bare (a dot for decimals, no units in the cell, never a negative
zero), so a spreadsheet reads them as numbers; the units are in the column names. A row that
cannot be written, a missing name or an area that is not a number, stops the schedule with an
error naming the row; it is never left out in silence. `grid sheet --layout check` ends with
both schedules as tables.


## Quantities for a first estimate

`grid_takeoff` with `for=estimate` (ARE-13) turns the plan into the lines a first estimate
needs. Each line has a key, a quantity in m², m or nr, its rule in one sentence and an
`assumed` mark. They are built on the measuring above: the rooms' take-off, the gross internal
area, each opening once as the schedule counts it, and each floor's outline.

| Key | Line | Assumed |
|---|---|---|
| `floor:<use>` | Floor finish: the net area of the rooms of that use, so a stair is counted once, on the floor it rises from. The plan holds no finishes, so the person decides which finish a use gets, by the key they price | no |
| `ceiling` | Ceilings: a flat ceiling as big as the floor below it | yes |
| `wall_finish:<use>` | Inside wall faces of the rooms of that use, at the height of each wall, less every door, window and opening at full size; both faces of an inside wall count | no |
| `skirting` | Each room's inside perimeter less the width of its doors and doorless openings | no |
| `reveals` | Round each door and window, its sides and head, and its sill when it has one, times its wall's thickness | no |
| `wall:<kind>:<thickness>` | Walls by the kind the plan states and their thickness: centre-line length times height, less openings | no |
| `external_finish` | The outer edge of each floor's outline, corners in, times the height of the wall it runs along, less openings | no |
| `door:<w>x<h>`, `window:<w>x<h>` | Doors and windows by the size of their hole in the wall, each counted once | no |
| `slab` | A slab under the lowest floor's outline | yes |
| `upper_floor` | Each upper floor's gross internal area, less the footprint of every stair the plan states arriving on it | yes |
| `roof` | A flat roof over every part of a floor's outline that no floor above covers, so a single-storey part has its roof | yes |
| `gross_internal` | The gross internal area, for a rate for the whole building: an alternative to the other lines, never added to them | no |

The plan holds no slab, floor structure, roof or ceiling yet, so those lines are worked out from
the outlines and say so. A floor that is part of a larger building cannot say what is above or
below it, so it gets a slab and a roof like any other. A room Grid could not draw is left out
of the room lines, and the answer names it.

A cost comes only from the person's own rates, in a file of their own beside the plan:
`rates.json`, or the file passed as `rates`, inside the project folder. Grid has no prices.

```json
{
  "label": "Where these rates come from",
  "currency": "EUR",
  "rates": {
    "floor": { "rate": 40, "unit": "m2" },
    "floor:bathroom": { "rate": 85, "unit": "m2", "waste": 0.1 },
    "wall:exterior": { "rate": 120, "unit": "m2" },
    "door": { "rate": 350, "unit": "nr" }
  },
  "orders": {
    "Plasterboard": { "for": ["wall_finish", "ceiling"], "covers": 2.88, "waste": 0.1, "pack": "sheets of 1.2 x 2.4 m" },
    "Paint": { "for": ["wall_finish", "ceiling"], "covers": 50, "coats": 2, "pack": "tins of 5 l" }
  }
}
```

- A rates file that names no currency is refused, and so is a rate below 0 or in a unit other
  than `m2`, `m`, `nr`, `ft2` or `ft`. A field Grid does not read is refused by name.
- A rate prices the lines whose key it is, or begins with followed by a colon: `wall:exterior`
  prices every outside wall thickness, `door` every door size, and an exact key wins over a
  shorter one. A rate per ft² or ft is turned into one per m² or m.
- A rate's `waste` is a share added to the quantity before it is priced.
- A line with no rate, or with a rate left `null`, is listed and never filled. A rate in another
  unit than its line's is not used, and is listed apart from the lines with no rate. A rate that
  prices no line of the plan is named, so a mistyped key shows.
- The total adds up the priced lines only, and says when it is not the whole cost.
- An order says which lines it is for, how much one pack covers in their unit, the coats and
  the waste; Grid gives the whole packs needed. Every figure in it is the person's.

With no rates file the answer holds no money: it is a rate card, every line with its key and
unit, and the data's `rateCard` is a rates file ready to fill in. With `format=csv` the bill is
one row per line with its rule and assumed mark, then the total and the orders; amounts are
values, not formulas.
