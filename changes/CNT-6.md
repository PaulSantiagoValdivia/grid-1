# 2026-11-22: a plan that is part of a larger building: separating walls, what lies beyond, buildings and context (CNT-6)

## For people

- A plan can say it is part of a larger building (CNT-6). Mark a party wall, or a wall to a
  shared landing, `separating`, and say what lies `beyond` a wall where nothing is drawn: the
  outside, a common part or a neighbour. A flat entered from a landing no longer gets a note that
  its door "leads to a space that is not drawn"; a door cut through to another flat is named and
  never counted as a way out; an open side of a stand is no longer a door. A floor can say what
  lies above and below it, so a fourth-floor flat gets no roof and no ground slab in the
  take-off. A plan can name several buildings, each with its own floors, areas and height, and
  draw its neighbours as context shapes, which add nothing to any area. A separating wall counts
  to its middle in the gross external area.

## For agents

- Plan format (C23): wall `kind: "separating"`; wall `beyond` (`outside`, `common`,
  `neighbour`); floor `above` (`outside`, `common`, `neighbour`) and `below` (`ground`,
  `outside`, `common`, `neighbour`); `buildings` (`id`, `name`, `floors`); `context` (`id`,
  `name`, `floor`, `points`, `height`). All optional and never defaulted; version 1.
- New finding `opening/between-homes`: a door, a doorless opening or an open side between rooms
  of two different flats, or a door through a wall with a neighbour beyond it. Its `also` holds
  the other home's room. It is never a route, so the rooms behind it may also get
  `room/no-route-out`.
- New finding `flat/no-front-door`: a flat none of whose doors opens onto a room in no flat, a
  common part not drawn, a space not drawn or the outside. Its thing is the flat.
- New not-checked line `floor/not-checked-way-out-common-parts`: the floor's ways on are all onto
  common parts the plan does not draw (a flat's front door through a separating wall, a stand's
  open side with a common part beyond). It takes the place of
  `floor/not-checked-way-out-not-drawn` there, and no `opening/to-undrawn-space` line is given for
  those doors. A rule's `skipped` names the floor under `way_out_through_common_parts`.
- A virtual wall with a room on one side only is an open edge, never a door: one into floor no
  room claims no longer gives `opening/to-undrawn-space`.
- `opening/door-out-above-ground` on a floor that is above the ground only because it states
  something other than `ground` below it says no height (`found` reads "a floor with more of the
  building below it"), and its `values.height` is 0.
- New warnings `plan/building-unknown-floor`, `plan/building-floor-in-two`,
  `plan/building-duplicate-id`: the buildings list's own faults; the building is read without
  what they name.
- `grid_areas` adds `buildings` on a plan that names them: each building's `floors`, `net`,
  `grossInternal`, `grossExternal` and `height`. Each building stacks its own floors from 0.
- A separating stretch of wall reads `separating` in `wallSides`; such a wall is not external in
  the IFC, never a way out or an escape window, and is taken off the gross internal area as an
  outside wall is. The gross external area takes off the half past its middle.
- The describe card's agent form writes a separating wall's kind as `s`.

## Codes

| `opening/between-homes` | {wording} | each home left through its own front door, never through another home |
| `flat/no-front-door` | {wording} | a front door onto a common part of the building, or to the outside |
| `floor/not-checked-way-out-common-parts` | The way out of "{floor}" was not checked: it goes on through the building's common parts, which are not drawn | the common parts drawn as rooms, as far as a way out |
| `plan/building-duplicate-id` | A building is listed more than once | an id of its own on every building |
| `plan/building-unknown-floor` | A building names a floor the plan does not have | floors of the plan, by id |
| `plan/building-floor-in-two` | A floor is named by two buildings | each floor in one building at most |
