# 2026-11-22: a way out leads to open air, and a let is left through common parts (MSG-17)

## For people

- A way out must lead somewhere real (MSG-17). A door onto a courtyard closed in on every side is
  no longer a way out unless a gate or a passage leads on from it: an infill house whose only door
  opens into a closed courtyard now gets "no door to the outside", with the courtyard door named.
  A room to let whose only way out goes through another let's room is named, whether a country is
  stated or not: mark the hall or the stair `common`, and each let's room `private`, or list the
  lets as flats. A door to the outside above the ground is now listed as not checked: it is not a
  way out, and where it leads (a balcony, an outside stair) is not looked at.

## For agents

- New finding `opening/into-closed-court` (rule `door-leads-somewhere`): a door or doorless
  opening through a wall stated `exterior` onto outside floor the walls close in on every side and
  no room claims, with no door on from it to open air, on a floor (or floors joined by stairs) that
  has no other way out. It comes with `floor/no-exit`. The door is never a way out, a route never
  leaves through it, and `grid_measure` no longer routes through it. A piece of floor bounded by a
  dividing line, claimed by a room or narrower than `passableWidth` is not a courtyard.
- New finding `room/through-another-let` (rule `room-reaches-exit`): a let whose every route to a
  way out, up and down the stairs, goes through a room another let holds. A let is a flat (CNT-4),
  or a room with `tenure: "private"` in no flat when some room of the plan is `common` or `shared`;
  a private bathroom, toilet, storage or utility room in no flat is no let and no route passes it.
  The thing is the let's first room; `also` holds its other rooms and the rooms it goes through.
  The report's finding carries `lets` (`own`, `through`) and `flat` for a flat.
- `opening/door-out-above-ground` keeps its code, thing and values, and is now a `not-checked`
  line, not a `finding`. Its wording reads "Where a door from "{name}" leads, {height} m above the
  ground, was not checked: it is not taken as a way out" (and "…on a floor with more of the
  building below it…" with no height).
- `tenure` (CNT-5) is now read by one check, the one above.

## Codes

| `opening/into-closed-court` | {wording} | a way on from that space to the open air, or another door to the outside |
| `room/through-another-let` | {wording} | a way out through its own rooms and the common parts only |
