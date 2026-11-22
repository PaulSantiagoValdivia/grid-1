# The plan file

Read this when you write or change a plan file by hand, or need to know what a drawing check's
code means. Each section says what the plan may state; the list below names the codes each
section explains. Rooms text, the main way to write a plan, is in
[rooms-first.md](rooms-first.md); the figure behind each check is in
[tolerances.md](tolerances.md).

- [What a plan file may hold](#what-a-plan-file-may-hold)
- [What kind of building it is, and what each room is for](#what-kind-of-building-it-is-and-what-each-room-is-for): `plan/not-checked-sizes-for-building`, `plan/not-checked-escapes-for-building`, `floor/not-checked-sizes-for-building`, `floor/not-checked-escapes-for-building`, `plan/unknown-use`
- [Floor levels and heights](#floor-levels-and-heights): `plan/level-gap`, `plan/same-level`, `floor/empty-top`, `wall/above-storey`, `floor/size-question`, `wall/unknown-floor`, `room/unknown-floor`
- [A step inside a floor](#a-step-inside-a-floor): `room/offset-question`
- [Stairs that join two floors](#stairs-that-join-two-floors): `stair/unknown-floor`, `stair/same-floor`, `stair/no-rise`, `stair/run-too-short`, `stair/too-few-risers`, `stair/duplicate-id`, `stair/end-in-no-room`, `room/stair-out-of-line`, `room/lift-out-of-line`
- [Floor no room claims](#floor-no-room-claims): `floor/unclaimed`, `room/space-mismatch`, `room/not-enclosed`, `floor/spaces-unknown`
- [Rooms that overlap, and rooms inside rooms](#rooms-that-overlap-and-rooms-inside-rooms): `room/overlap`, `room/inside-no-host`, `room/overlap-unknown`, `floor/overlaps-unknown`
- [Rooms with holes](#rooms-with-holes): `room/hole-outside`, `room/holes-overlap`, `room/unclosed`, `room/out-of-order`, `room/inside-out`
- [Fixtures](#fixtures): `item/unknown-kind`, `item/too-large`, `item/no-size`, `item/duplicate-id`, `item/unknown-floor`, `item/outside-rooms`, `item/into-wall`, `item/too-tall`
- [Writing on the drawing, and the sketch layer](#writing-on-the-drawing-and-the-sketch-layer): `floor/sketch-drawn-only`, `plan/note-no-place`
- [Wall faults, each with its fix](#wall-faults-each-with-its-fix): `wall/short`, `wall/gap`, `wall/overrun`, `wall/duplicate`, `wall/line-on-wall`, `room/wall-listed-twice`, `wall/crosses-room`, `wall/stands-in-room`
- [Inside and outside walls](#inside-and-outside-walls): `wall/kind-differs`
- [North, front and where the building is](#north-front-and-where-the-building-is): `plan/front-not-said`, `plan/y-down`
- [People are kept out of the plan](#people-are-kept-out-of-the-plan): who sits where, in a file of its own

## What a plan file may hold

The command and the tool server read a plan file one way (`packages/cli/src/fs/textEncoding.ts`
and `packages/cli/src/command/planText.ts`). The file may be UTF-8, with or without a byte-order
mark, or UTF-16; anything else is refused with the first byte that is not UTF-8, so a Latin-1
file never reaches the exports with its letters turned into question marks. A file larger than
64 MB is refused before it is read. Then, before the schema:

| Text | At most | Also refused |
|---|---|---|
| a room, floor or stair name, a fixture's label, the plan's title, a note's or a sketch's text | 120 characters | line breaks of any kind, control characters, characters that change the direction text is shown in, and half of a character pair |
| an id: of a wall, room, opening, floor or stair, a wall a room or an opening names, a part's floor, the floors a stair joins | 64 characters | the same |
| the trace image's path | 1,024 characters | the same |
| the place, `site.country` | 120 characters, and then a name or a code on Grid's list ([the place](#the-place)) | the same |
| walls, rooms, openings, floors, items, stairs, annotations or sketch items | 50,000 of each | |
| the points of one sketch line or shape | 2,000 | |
| the walls a room lists | 2,000 | |

A refusal names the part and the limit (`rooms[0].name holds a line break (U+000A); it must be
one line`) and never repeats the text. Markup in a name is allowed: it is drawn as text. The
ids in `grid check`'s drawing problems are quoted, and `grid_check` returns the rooms a finding
is about, by id and name, apart from its message.

## A fault stays where it is

A value Grid cannot read inside one part no longer refuses the whole plan (MSG-6). The plan is
read part by part with the format's own rules (`packages/floorplan/src/types/readParts.ts`), and
`grid check` gives one line for each part or value it could not read as written, by the part's
id (or its place, when it has no id that can be read) and its place in the file:

| What the file holds | What Grid does | Line |
|---|---|---|
| a number written as text (`"2.5"`, `"0.9 m"`), `"true"`, a word in other capitals (`"Exterior"`, `"Door"`, units `"M"`) | reads it as meant | `plan/read-as-meant` |
| a value a field can do without that cannot be read (a hinge `"left"`, a `null` thickness, units `"furlong"`) | uses the field's default, or reads it as not stated; a unit Grid has no word for is read as metres | `plan/value-left-out` |
| units `"mm"`, `"cm"`, `"ft"` or `"in"` | reads every length in that unit, and writes the plan back in metres when it changes it (see [Units](#units)) | `plan/read-as-meant` |
| a value the part needs that cannot be read (a negative offset, a missing start, an opening type `"gate"`) | leaves the part out, and the rooms and openings on a wall left out with it | `plan/part-left-out` |
| a wall's thickness or height, or an opening's sill, stated out of range or as a word | leaves the part out: a default would change what is drawn and measured | `plan/part-left-out` |
| `NaN`, `Infinity`, or a number with a decimal comma in an object (`"offset": 3,45`) | reads it as a value that is not there, and names it for what it is | as above |
| git's conflict markers | refuses the plan as an unfinished merge, with the line and what each side adds | `plan/unfinished-merge` |

Ids are unique across the whole plan. Of two parts that share an id, only the clash is left out
(`plan/id-clash`): the wall keeps its id, since rooms and openings name walls, so the rooms on it
are still measured. Two walls with one id are both left out (`plan/duplicate-id`), with an id to
rename one to. A blank id, and an id that differs from an earlier one only in capitals or spaces,
leave the part out (`plan/blank-id`, `plan/similar-id`). What is wrong at the plan's top level (a
version Grid does not read, `walls` that is not a list) still refuses the plan.

`grid check`, `draw`, `export`, `describe` and the reading tools read a plan this way. `grid tidy`,
`grid write` and the tools that change the plan write it back, so they read it whole and refuse a
plan with anything left out, naming the first. The record's codes are in
[the result contract](result-contract.md).

## What kind of building it is, and what each room is for

A plan may say what kind of building it is with `building`, and a floor may say otherwise for
itself with its own `building`: the shop on the ground floor of a block of flats (CNT-5). Both
are optional; unstated, a floor is the plan's kind, and a plan that says nothing is read and
checked as before.

```json
{ "version": "1", "building": "home", "floors": [{ "id": "ground", "name": "Ground floor", "level": 0, "building": "shop" }, …] }
```

| `building` | What it is |
|---|---|
| `home` | a house or a flat people live in |
| `office` | an office |
| `shop` | a shop |
| `food` | a café, restaurant or bar |
| `hotel` | a hotel or hostel |
| `school` | a school |
| `health` | a health building, such as a clinic |
| `sport` | a sports building |
| `assembly` | a building people gather in, such as a hall |
| `industry` | a workshop or factory |
| `warehouse` | a warehouse |
| `parking` | a car park |
| `other` | another kind of building |

A check that applies a figure runs only in the kinds of building its figures were read for, or
where the plan does not say. Every figure Grid carries today was read for homes, so the room-size
and escape checks run on a floor that is a `home` or says nothing, and on no other: their rooms
are skipped (`not_for_building`), and one line says so. It is about the whole plan when the
plan's own kind is the reason on every floor (`plan/not-checked-sizes-for-building`,
`plan/not-checked-escapes-for-building`), and about the floor otherwise
(`floor/not-checked-sizes-for-building`, `floor/not-checked-escapes-for-building`). Each check in
the record's `coverage` says the uses it looks at and the kinds of building it runs in. A floor
the plan says is a home gets the figure checks, and their notes say the plan says it is a home.

A room says what it is for with `use`, one of 27:

| Group | Uses |
|---|---|
| A home | `bedroom`, `living`, `dining`, `kitchen`, `bathroom`, `toilet`, `utility`, `study` |
| Work, trade, learning, care, sport | `office`, `meeting`, `reception`, `retail`, `classroom`, `treatment`, `waiting`, `sport`, `changing`, `staff`, `worship`, `assembly` |
| Moving about | `corridor`, `stair`, `lift` |
| Services | `storage`, `plant`, `parking` |
| Anything else | `other` |

The person's own word for a room is its `name`: "Pooja room", "Bryggers", "Open office (12
desks)". A use is read whatever its capitals, and a word that plainly means a use is read as it
(`USE_WORDS` in `packages/floorplan/src/types/floorplan.ts`): `WC` is `toilet`, `staff room` is
`staff`, `warehouse` is `storage`, `bryggers` is `utility`, `pooja room` is `worship`. No word
is read as `bedroom`, `living` or `dining`, the uses the figure checks look at, so a room comes
under them only by its author's choice: `lounge` and `living room` give a `plan/unknown-use`
line that suggests `living`. A word that means two things (`hall`, `studio`) is not read either.
Any other word is read as no use stated, with a line that names it.

A room may also say:

| Field | What it states |
|---|---|
| `tenure` | Who it is for: `private` (one household's or one tenant's own), `shared` (some households' or tenants', not all), `common` (the building's, for everyone in it, such as the stair or the bin store) or `commercial` (let or run as a business) |
| `roomType` | The firm's own type for the room, as its room data sheets name it ("B2 double bedroom"), beside the fixed use. At most 120 characters, one line. Grid keeps it and reads nothing from it |

No check reads `tenure` or `roomType` yet. Rooms text writes all of these: `building office`,
`floor ground "Ground floor" building shop`, and `tenure common` and `type "B2"` on a room line
([rooms-first.md](rooms-first.md)).

## Units

The plan file stores metres, always (WRT-7). The person's own units are read and written at
the edge, chosen per person:

- **Reading.** Every length a tool or `grid edit` takes is a number in metres, or text with its
  unit: `3.81`, `3.81 m`, `381 cm`, `3810 mm`, `12'6"`, `12' 6"`, `12'-6"`, `12 ft 6 in`, `150"`,
  `6 1/2"`. With the call's `decimal` set to `comma` (`--decimal comma`), `3,81` is 3.81 m; without
  it, `3,81` is refused with one line that names the decimal comma. A length past Grid's largest,
  or text Grid cannot read, is refused in words, by the argument's name. A plan file that states
  `"units": "mm"` (or `cm`, `ft`, `in`) is read in that unit and written back in metres.
- **Writing.** A plan may say how its person reads lengths, in `display`. It changes no stored
  number:

  ```json
  "display": { "length": "ft-in", "area": "ft2", "decimal": "point", "precision": 0 }
  ```

  | Field | Takes | Left out |
  |---|---|---|
  | `length` | `m`, `cm`, `mm` or `ft-in` | (required in `display`) |
  | `area` | `m2` or `ft2` | `ft2` with `ft-in`, else `m2` |
  | `decimal` | `point` (2.40) or `comma` (2,40) | `point` |
  | `precision` | decimals shown, 0 to 5; in feet and inches, the inch in 2^n parts (0 whole inches, 3 eighths) | 2 for m, 1 for cm, 0 for mm and ft-in |

  A call's `units` and `decimal` (`--units`, `--decimal` on `grid draw`) win over the plan's
  `display`. In feet and inches a length is written `12'-6"` and a sill `48"`; in millimetres,
  `2860`. The drawing's room areas and dimensions, and the figures of `grid_areas`,
  `grid_takeoff`, `grid_schedule`, `grid_measure` and `grid_view` follow the display. The check's
  report, the sheet, the edit answers and the exports stay in metres for now.

## Floor levels and heights

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

## A step inside a floor

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

## Stairs that join two floors

A stair is stated once, in the plan's `stairs` list, across the two floors it joins. The plan
says what is meant and Grid works out the rest:

```json
{ "id": "s1", "name": "Main stair", "from": "ground", "to": "first", "width": 0.9, "run": [[0.6, 0.6], [0.6, 3.4]] }
```

| Field | What it states |
|---|---|
| `from`, `to` | The floor the walking line starts on and the floor it ends on. Either may be the higher |
| `width` | The width of the flight, in metres |
| `run` | The walking line, down the middle of the flight: from the stair's edge on `from` to its edge on `to`. Each point between is a turn, with a square landing as wide as the flight. A straight stair may give its two ends as `start` and `end` instead |
| `risers` | Optional: how many risers, when the design has chosen. Unstated, Grid takes the number that brings twice the riser plus the going nearest 0.63 m |
| `name` | Optional |

From the two floors' levels (and the floor offset of the rooms the stair starts and ends in),
Grid works out the rise, the number of risers and their height, the going and the pitch, and
which room the stair leaves from and arrives in (`planStairs`). For the stair above: a 2.95 m
rise in 14 risers of 0.211 m, treads of 0.215 m. `grid describe` says them. The 2D drawing
shows the stair on both floors, with a line at every riser and its walking line ending in an
arrow pointing up; 3D, the OBJ and glTF files and the IFC file (an `IfcStair` of
`IfcStairFlight`s and landing slabs) draw a block per tread. The stair adds no floor of its own:
its area is counted once, in the rooms it stands in. Nothing here judges a riser, a going or a
width.

The way-out check follows routes up and down the stair, so an upper floor or a basement is
checked through it down to a door. Rooms used as a stair on neighbouring floors that lie one over
the other (sharing at least half of the smaller one) are taken as a stair too, as agents already
draw them; where both floors have stair rooms and none lies over another, they are named as out
of line (`stair_out_of_line`), and so are lift shafts (rooms used as a `lift`,
`lift_out_of_line`). A lift is never taken as a way out. A floor no stair joins to the ground floor
is said not to be checked. A stair that cannot be laid out is said and left out
(`stair/unknown-floor`, `stair/same-floor`, `stair/no-rise`, `stair/run-too-short`,
`stair/too-few-risers`, `stair/duplicate-id`), and one whose end stands in no room joins nothing
(`stair/end-in-no-room`, a warning).

## Floor no room claims

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

## Rooms that overlap, and rooms inside rooms

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

## Rooms with holes

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

## Fixtures

A plan may list its fixed fixtures in `items`: a toilet, a basin, a shower, a bath or a kitchen
run (base units with their worktop). Each has a `kind`, `at` (the middle of its footprint), a
`size` (its width along its back and its depth to its front), a `height`, and may have a `turn`
(degrees, counter-clockwise; unturned, its back faces down the drawing), a `label` and a
`floor`. Every figure is the author's: Grid gives a fixture no size of its own.

```json
{ "id": "wc", "kind": "toilet", "at": [9.575, 5], "size": [0.4, 0.65], "height": 0.8, "turn": 90, "label": "WC" }
```

A fixture is never a wall and never a room: it adds no floor area and no finding, and the room
it stands in is the one that holds its middle. The 2D drawing, the sheet and the DXF (layer
`GRID-FIXTURES`) draw its symbol to scale inside its footprint; the IFC file holds it as an
`IfcFurnishingElement` on its storey. `grid_schedule` counts the fixtures by kind with their
rooms, `grid_areas` gives each room with fixtures its free floor (its net area less the floor
they stand on), `grid_measure` measures between fixtures and fits a box clear of them, and
`grid check` names a fixture that runs into a wall or is taller than its room. This version holds
fixtures only: loose furniture, points (a hydrant, a camera) and seats come later, in the same
shape. A kind it does not hold yet is left out with a note, and the rest of the plan is drawn.

| Code | What it says |
|---|---|
| `item/unknown-kind` | A kind the plan does not hold yet, such as a table. The item is left out |
| `item/too-large`, `item/no-size` | A number Grid does not accept, or no size. The item is left out |
| `item/duplicate-id`, `item/unknown-floor` | An id another part has, or a floor the plan does not have. The item is left out |
| `item/outside-rooms` | Its middle is in no room on its floor |
| `item/into-wall` | It reaches more than 5 mm into a solid wall |
| `item/too-tall` | It is higher than the room it stands in |

## Writing on the drawing, and the sketch layer

A plan may carry writing for its drawings (SHT-7). None of it is measured or checked, and none
of it changes an area, a check or a wall count.

- `title`: one line, drawn in the band under every floor's picture. The sheet leaves it off,
  because each page has its own title.
- `annotations`: notes, tags, symbols and a key. Each has an `id` and a `kind`:
  - `note`: `text`, drawn as it is;
  - `tag`: `text` in a box;
  - `symbol`: `symbol`, `north` (an arrow pointing up the drawing, turned by `turn` degrees
    counter-clockwise) or `entrance`, with `text` under it if given;
  - `key`: the drawing's key, in the band under it. It lists only what the drawing shows: the
    kinds of wall, windows, doors with their swing, the room uses when rooms are coloured by
    use, each sketch category, and the marks of what went wrong.

  A note, tag or symbol is placed `at` a point, `[x, y]` in metres, on its `floor` (unstated,
  the ground floor), or in a `room`, by id, where it goes under the room's name. Both at once is
  refused. A note in a room the plan does not have is not drawn (`plan/note-no-place`).
- `sketch`: lines, arcs, rectangles, shapes and text, each with an `id`, a `kind`, a `category`
  (the author's word for it: `garden`, `street`, `fence`) and a `floor` (unstated, the ground
  floor). Each kind needs its own fields:

  | Kind | Fields |
  |---|---|
  | `line` | `points`, two or more |
  | `shape` | `points`, three or more, closed back to the first |
  | `rect` | `from` and `to`, two opposite corners |
  | `arc` | `at` (its centre), `radius`, and `start` and `end` in degrees counter-clockwise from +x; it runs counter-clockwise |
  | `text` | `at` and `text` |

  A sketch is drawn in a soft line in every plan picture, the app's 2D view and the sheet, under
  the walls, and framed with the plan. A DXF puts each category on a layer of its own,
  `GRID-SKETCH-` and the category in capitals. Grid never takes a sketch as a wall, a room or
  anything it understands, and the record says so once per floor, as a line not checked
  (`floor/sketch-drawn-only`). Where a sketch is something Grid holds, such as a fixture, write
  it as that instead; furniture and site parts will be offered the same way once Grid holds them.

A field the format does not have, on a note or a sketch item, is named like any other
(`plan/unknown-field`). The 3D views do not show the sketch yet.

## Wall faults, each with its fix

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

## Inside and outside walls

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

## North, front and where the building is

The drawing's sides have names of their own: its top is called north, as rooms text, the
anchors, `grid describe` and the edits call it. A plan may also say how it sits on the earth
(CNT-3). All four fields are optional; a plan that states none reads, draws and exports as
before, with no north and y up the page.

```json
{ "north": 30, "yAxis": "up", "front": { "opening": "entry" }, "site": { "origin": [0, 0], "latitude": 40.4168, "longitude": -3.7038, "elevation": 650 } }
```

| Field | What it states |
|---|---|
| `north` | Where north lies on the drawing, in degrees counter-clockwise from its top (+y), as a north symbol's `turn` is: 0 is up the drawing, 90 to the left (-x), -90 or 270 to the right (+x) |
| `yAxis` | Which way +y runs on the page with +x to the right: `up`, as Grid draws every plan, or `down`, as a screen or an image's pixels run. Unstated, it is `up` |
| `front` | The part whose outside face is the front of the building: `wall`, a wall's id, or `opening`, an opening's id such as the front door, by the wall it is in. One of the two |
| `site` | Where the building sits: `origin`, a point of the plan in metres, and, if known, where that point is on the earth: `latitude` and `longitude` in degrees (north and east positive, given together) and `elevation`, metres above sea level. Each is optional, but nothing is placed on the earth without `origin`; a field Grid does not hold yet, such as a plot boundary, is named and read without. `country` is [the place](#the-place) the figure checks are for |

North is drawn and written where the plan states it:

- **The drawing.** Each floor's plan, in `grid draw`, `grid_view` and the sheet, shows a north
  arrow in the top-right corner of its view, turned to the stated north: the north symbol of
  [the writing on the drawing](#writing-on-the-drawing-and-the-sketch-layer), on a disc. A
  floor that places a north symbol of its own gets no second arrow, and a north symbol that
  states no `turn` points to the stated north. The 3D views name their sides by the drawing,
  as before.
- **The IFC file.** The model's `TrueNorth` is the stated north, as a direction in the plan's
  x and y. A plan that states none gets none: `TrueNorth` is left empty, where Grid wrote +y
  for every plan before. A program that reads IFC takes an empty `TrueNorth` as +y, so the
  model lands the same; the file only stops claiming a north it was never told. A plan with a
  `site` puts the IFC site's origin on that point, with its latitude, longitude and elevation
  (`RefLatitude`, `RefLongitude`, `RefElevation`); the building keeps the plan's coordinates.
- **Which way the rooms face.** `grid_measure` with `what=facing` says which way each outside
  wall, each opening in one and each room behind them faces: the normal of the wall's outside
  face, the one with no room on it ([inside and outside walls](#inside-and-outside-walls)),
  turned into a compass point by the stated north. A room faces each way its outside walls do,
  longest first, and lists the ways its windows face. So "which rooms face east" has an answer.
  For a 6 × 4 m house of two rooms, the living room to the west and the kitchen to the east,
  with `"north": 30` and the front door named as its front:

  ```text
  North, as the plan states it: 30° counter-clockwise from the top of the drawing (north 30).
  Rooms by the way their outside walls face:
    north-east: "Living" (living, window), "Kitchen" (kitchen)
    south-east: "Kitchen" (kitchen, window)
    south-west: "Living" (living), "Kitchen" (kitchen)
    north-west: "Living" (living)
  The front, opening "entry", faces south-west (bearing 210°).
  ```

  A plan that states no north is answered with north taken as the top of the drawing, and the
  answer says first that this is not known to be north. `grid describe` adds the same in a few
  lines, with which real way each side of the drawing faces, for a plan that states its north
  or its front.

A rotation cannot undo a mirror: a plan drawn with its y running down the page is the
building's mirror image, and no north makes it right. So the plan says which way its y runs.
Grid draws and exports the coordinates as the file holds them, with y up, and `grid check`
says that the drawings are mirrored (`plan/y-down`); the ways the rooms face are read the right
way round.

`grid_mirror` makes a new design, the old one mirrored. The stated north is mirrored with it,
to minus itself, so the swap it promises is the real one: left to right, what faced east faces
west, whichever way the drawing is turned. The site's origin is mirrored with the walls, the
front stays the part it names, and `yAxis` is kept.

| Code | What it says |
|---|---|
| `plan/front-not-said` | The front names a part the plan does not have, or a wall that does not face outside: no front is said |
| `plan/y-down` | The plan says its y runs down the page, so every drawing and export shows the building mirrored |

## The place

The figure checks apply figures from building codes, and a figure holds only where its code
does. So the plan says where it will be built, in `site.country` (COD-3):

```json
{ "site": { "country": "United States" } }
```

The place is a country's name or its two- or three-letter code (ISO 3166-1), as Grid's own list
has it (`packages/floorplan/src/types/places.ts`): every country and territory with a code, its
short English name, and a few other names people use, such as `USA`, `United States of America`,
`UK`, `Great Britain`, `Holland` or `Ivory Coast`. Capitals, accents, dots and the spaces round
it do not matter: `US`, `usa`, ` United States ` and `U.S.A.` are one place. A name that could
mean two places (`Congo`, `Korea`) and a part of a country (`England`) are not on the list:
write the code. It is kept as written, and every report names it by Grid's name for it, never
by the text in the file. Anything else is not a place: the plan is read without it, the rest of
the `site` kept, and `grid check` says so with a `plan/value-left-out` line at `site.country`
that names the field and never repeats the text.

- **The US.** The figure checks run on the figures carried here, from US model codes.
- **Another place.** No US figure is applied; `grid check` says which checks did not run for
  want of figures for the place.
- **No place stated.** No figure is applied, and the report says so on its first line after the
  label, with how many lines the US figures would have given.

`grid check --country` and `grid_check`'s `country` name another place for one check, in place
of the plan's; the report says which was used ("from the plan", "from --country"). `grid write`
keeps `site` as the file has it, so rooms text, which holds the walls, rooms and openings, loses
nothing of the place. The sheet does not print it.

## People are kept out of the plan

A plan travels. Room names and ids go into every export and sheet: the DXF writes each room's
name, the IFC its name and id, OBJ and GLB its id, and the sheet its name (its `check` layout its
id too). Whoever is handed the plan file reads both. So a room is named for what it is
(`Office 2`, `bed1`), never for a person, in its name or its id. The same holds for a floor's
name and a fixture's label.

Who sits where is kept in a file of its own beside the plan, named after it:
`plan.occupancy.json` beside `plan.json`. The plan knows nothing of it, and no export, sheet or
tool of the tool server reads it.

```json
{
  "version": "1",
  "seats": [
    { "room": "bedroom", "occupants": ["A. Person"] },
    { "room": "office", "desk": "Desk 2", "occupants": ["B. Person", "C. Person"] }
  ]
}
```

| Field | What it states |
|---|---|
| `room` | The id of a room of the plan. The seat is linked to it |
| `desk` | Optional: a desk in that room, by a label of this file's own. The plan has no desks: Grid keeps fixtures now and furniture later |
| `occupants` | The people at that seat, at most 100 |

Ids, desk labels and names follow the plan's text rule: an id at most 64 characters, a label or
name 120, each one line. A file that is wrong is refused naming the place (`seats[2].occupants[0]`)
and never the text, which is a person's name. `grid occupancy` lists who sits where by room name
and names any seat whose room the plan no longer has ([commands.md](commands.md#who-sits-where-grid-occupancy)).
Keep the file out of what you hand over: an export or a sheet never needs it.
