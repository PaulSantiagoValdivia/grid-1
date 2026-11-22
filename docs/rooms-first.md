# Writing a plan rooms first

Read this first to write a plan. Rooms text names the rooms, doors and windows; Grid works out
the walls. The command is `grid write` ([commands.md](commands.md)) and the tool
`grid_write_rooms` ([tool-server.md](tool-server.md)).

The main way to write a plan, for an agent or a person: name the rooms with their inside sizes
and where each goes, and the doors and windows by the rooms they join. Grid works out the walls,
whether each is an outside or an inside wall, each room's boundary and where each opening sits,
and writes them into the plan file.

```
walls outside 0.3 inside 0.1 height 2.6
room living  "Living room" living   4.4 x 4.2
room kitchen "Kitchen"     kitchen  4.4 x 3.0  north of living
room hall    "Hall"        corridor 1.3 x *    east of living until kitchen
door d-living between hall and living, 0.1 from south, 0.8 wide, opens into living
door front    in hall north, centred, 0.9 wide, opens in, hinged east
window w-living in living south, centred, 1.8 wide, sill 0.6, height 1.5
```

- North, east, south and west are the drawing's sides, north at the top, even in a plan that
  states its real north ([plan-file.md](plan-file.md#north-front-and-where-the-building-is)).
- A size is east-west by north-south, to the inside faces. `3 x 4 centre` measures to the walls'
  centre lines and `8 x 10 outside` to the outside faces; `sizes outside` makes that the
  default. The answer states for each room what its size measured to, and its inside size.
- `floor -0.15` on a room line puts its floor that far below its storey's (a genkan; LVL-7),
  `height 2.4` gives its own height.
- The word after a room's name is its use: one of Grid's uses, a word that plainly means one
  (`wc` is toilet, `bryggers` utility), or `-` for none. The name keeps the person's own word.
  `tenure common` and `type "B2 double"` on a room line say who it is for and the firm's own room
  type. `building office` says what kind of building the plan is, and `building shop` on a
  `floor` line what that floor is ([the plan file](plan-file.md#what-kind-of-building-it-is-and-what-each-room-is-for)).
- `*` stretches a side as far as the room named after `until`. `inside <room> corner ne` cuts a
  room out of another's corner. `unit`, `place`, `repeat` and `mirror` write a group of rooms
  once; `copy <floor>` starts a floor from another.
- Rooms that overlap, that touch with no wall between them (unless one is `open` to the other),
  or that leave a gap that is neither a wall nor a room are refused in plain words naming both
  rooms. Every refusal has a code, such as `rooms/overlap`.
- A door or window line may say its kind (CNT-14): `sliding`, `double`, `folding`, `pocket`,
  `roller`, `garage` or `single` for a door, `single`, `double`, `sliding`, `fixed` or
  `high-level` for a window; `part 0.9` (or `part 0.6 x 1.0`) for the part that opens. A door
  is hinged on a side of the drawing (`hinged east`) or, as a person says it, on the left or
  the right seen from the room it opens into, or from another (`hinged left`, `hinged right seen
  from bedroom`). A sliding, pocket, roller or garage door needs no swing, and none is guessed
  for it ([Kinds of door and window](plan-file.md#kinds-of-door-and-window-their-handing-and-the-part-that-opens)).

  ```
  door d-patio in living south, centred, 2.4 wide, sliding
  door d-bed   between hall and bedroom, 0.1 from west, 0.8 wide, opens into bedroom, hinged left
  ```
- What rooms cannot say is written raw, one line of the plan file's own JSON:
  `raw wall {...}`, `raw room {...}`, `raw opening {...}`. Free-standing walls, curved or
  out-of-the-way walls and rooms with holes are written that way.
- A room's name and its id go into every export and sheet, and travel with the plan file: name
  a room for what it is, never for a person. Who sits where is kept in a file of its own
  ([People are kept out of the plan](plan-file.md#people-are-kept-out-of-the-plan)).
- The full language is in the header of `packages/floorplan/src/rooms/compile.ts`.

**The plan file is the source of truth.** Its walls stay in it, and they can still be changed
there or with the tools; rooms text is a way of writing the plan and of reading it.
`grid describe --as rooms` reads any plan back as rooms text, and writing that text again
changes nothing: the walls line comes with every exception the plan holds (a wall's height,
thickness, kind, id or direction), and a floor that rooms text cannot give back as it is comes in
the plan's own terms. So that nothing is lost unseen, `grid write` refuses, with the difference,
rooms text read from an earlier version of the plan (its `based on` line) and rooms text written
over a plan changed some other way since Grid last wrote it; `--replace` writes over it anyway.

Some parts are derived: Grid works them out and no one writes them. In a plan written rooms
first (it records this in `written`), each room's boundary is derived, and one edited by hand is
refused by the check with its own code, `room/derived-edited`. Grid's own edits keep it derived.
Change the rooms and write them again, or take `written` out to keep the plan as a hand-written
one.
