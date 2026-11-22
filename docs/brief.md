# The brief

Read this when you keep what a person asked for beside their plan, or need to know what a line
met or missed after an edit means.

- [What the brief holds](#what-the-brief-holds)
- [The person's own figures](#the-persons-own-figures)
- [Met and missed after every change](#met-and-missed-after-every-change)
- [A size written in a room's name](#a-size-written-in-a-rooms-name)
- [The first plan with no brief](#the-first-plan-with-no-brief)

## What the brief holds

The brief is what the person asked for, kept in a file of its own beside the plan:
`plan.brief.json` beside `plan.json`, `option-b.brief.json` beside `option-b.json`. It is read
and written only inside the project folder, like the plan. The plan knows nothing of it, and no
export, sheet or drawing reads it.

An agent writes it in one call, `grid_write_brief`, from the person's words, before the first
room is drawn: the plan need not exist yet. The call replaces the whole brief; with no `brief`
it reads the one there and writes nothing. A plan that is there and that Grid refuses is refused
here too, as by every tool, and no brief is written.

```json
{
  "version": "1",
  "rooms": [
    { "name": "Bathroom 1", "area": 4.5, "level": "must", "source": "given", "quote": "a small bathroom, about 4.5 square metres" },
    { "use": "bedroom", "count": 3, "level": "must", "source": "given", "quote": "three bedrooms" },
    { "name": "Kitchen", "inside": [3, 4], "level": "should", "source": "assumed" }
  ],
  "footprint": { "width": 10, "depth": 12, "level": "should", "source": "given", "quote": "the plot takes about 10 by 12" },
  "touch": [{ "rooms": ["Kitchen", "Bathroom 1"], "level": "avoid", "source": "given", "quote": "not the bathroom next to the kitchen" }],
  "figures": {
    "heading": "The person's own figures: theirs, not from any code or standard.",
    "door_width": { "value": 0.8, "level": "must", "source": "given", "quote": "my chair needs 80 cm doors" }
  },
  "open": [{ "quote": "somewhere to work from home", "about": "its size, and which room" }]
}
```

- **A room wish** names one room by the name it has in the plan (`name`, any case, or its id),
  or the rooms of a use (`use`). It may give a `count`, a net area (`area`, about; or `at_least`,
  `at_most`, in m²) and an inside size (`inside`, metres, either way round). With none of them it
  asks only for the room to be there.
- **The footprint** gives the outside sizes (`width` and `depth`, either way round) or the area
  it covers (`area`), or both.
- **Rooms that touch**: two rooms' names that must share a wall (`must`, `should`) or must not
  (`avoid`).
- **Every wish has a level**: `must`, `should`, or `avoid`, a wish for the drawing not to hold
  it (no garage; the bathroom not next to the kitchen). The footprint and the figures take
  `must` or `should`.
- **Every wish says where it came from**, in the words a plan's own marks use: `given` by the
  person, with their words in `quote` (a given wish without them is refused), or `assumed` by the
  agent, for the person to confirm. An assumed figure is written "assumed 4.5", not "asked 4.5".
- **What is still open**: the person's words for something with no figure yet go in `open`, with
  what is still to ask in `about`.

A wish Grid cannot read is refused naming its place (`rooms[2].area must be a number of square
metres above 0…`), never repeating the person's words, and nothing is written.

## The person's own figures

The figures under `figures` are the person's, not a code's or a standard's. The file holds them
under the heading "The person's own figures: theirs, not from any code or standard.", and every
answer lists them under it. Grid knows five, all in metres:

| Figure | Measured as | Short of it |
|---|---|---|
| `door_width` | the hole in the wall of every door and doorless opening; the clear width past a door leaf is less | narrower |
| `corridor_width` | the widest circle each room used as a corridor holds, between its wall faces | less |
| `turning_circle` | the widest circle each room holds, in the empty room; `rooms` names the rooms it is for, every room when left out | less |
| `step` | the sill of every door and doorless opening above its floor; 0 for none | higher |
| `ceiling_height` | each room's height, as `grid_measure` gives it | lower |

A figure Grid does not know is refused with the five it knows. Each door, room or opening short
of a figure is one line; a figure nothing is short of is one line met.

## Met and missed after every change

Every change to the plan answers with the brief beside the plan it read, line by line, against
the plan as it now is: each edit tool, `grid edit`, `grid_write_rooms` and `grid write`. The
answer's data holds the lines as `brief`: `{ file, problem, lines }`, each line with its `state`,
`wish`, `level`, `source`, `quote`, `asked`, `drawn`, `unit`, the `parts` it is about and its
`text`. An edit lists 12 lines, missed first; `grid_write_brief` with no `brief` lists them all.

```text
The brief ("plan.brief.json"), each line measured as the drawing is: …
  missed (must): "Bathroom 1" area asked 4.5, drawn 11.93 m².
  met (must): rooms used as bedroom: asked 3, drawn 3.
  The person's own figures: theirs, not from any code or standard.
    missed (must): door "door-bath" ("Hall" to "Bathroom") width asked at least 0.8, drawn 0.55 m.
  A line met says the drawing holds what the person asked for, and nothing about any rule.
```

- A line is **met**, **missed** or **open** (nothing drawn yet, or a room that cannot be
  measured). It is written in words, asked against drawn, and never as a score.
- **The target and the drawing are measured by the same rule**: a room's net area and inside
  size as [`grid_areas`](areas.md) gives them, to the faces of its walls; widths and circles as
  `grid_measure` gives them; the footprint to the outside face of the lowest floor's walls, its
  area the gross external area.
- An `area` or an `inside` size is met within 5% of the figure asked (`briefAbout` in
  [tolerances.md](tolerances.md)); `at_least` and `at_most` are met at the figure.
- A line met says only that the drawing holds what was asked. It never says a plan is allowed,
  and the answer says so.
- A brief that cannot be read is said in one line, and the change is written as asked.

## A size written in a room's name

Until the brief gives a room a size, a size written in its name is read against the room as
drawn (lab R-14): square metres (`12 m²`, `12 m2`, `12 sqm`), square feet (`120 sq ft`) or mats
(`6 tatami`, `6 jo`, `6畳`). A mat is taken as 0.9 × 1.8 m, Grid's own reading of one, citing no
document. When the drawn size is further than 2% from the size named (`nameSize`), the answer
says so: `differs: "6 tatami room" is named 6 mats; drawn 5.80 mats (9.40 m², a mat taken as
0.90 × 1.80 m), net area.`

## The first plan with no brief

When a plan is first written (`grid_write_rooms` or `grid write` on a plan that is not there, is
empty or is still the starter plan) and no brief is kept beside it, the answer gives one line
saying so, and the plan is written as asked. It is a reminder, never a refusal, and it is not
repeated on the writes after.
