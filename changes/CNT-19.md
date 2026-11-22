# 2026-11-22: parking bays and ramps (CNT-19)

## For people

- A plan can hold parking bays and ramps as things of their own (CNT-19), instead of bays drawn as
  rooms closed by dividing lines and a ramp as a flat room with its slope in its name. Each bay has
  its size and its number, and each floor counts its bays by number. A ramp joins two floors and
  Grid works out its slope from their levels and its length, in percent and as "1 in n", beside the
  slope the plan states, and says when the two differ. A ramp opens the slab of the floor above it.
  Bays are drawn with their numbers and ramps with an arrow pointing up and their slope, on screen,
  on the sheet and in `grid draw`; `grid_takeoff` and `grid describe` give the counts and the
  slopes. Whether a car can turn in is a swept-path check Grid does not make.

## For agents

- Plan format (C29): `bays` (`id`, `number`, `at`, `width` across, `length` along, `turn`,
  `floor`) and `ramps` (`id`, `name`, `from`, `to`, `width`, `run` or `start` and `end`, `slope` in
  percent). All optional and never defaulted; version 1. A ramp's `run` with more than 64 points is
  refused by the schema, as a stair's is.
- `grid_takeoff` adds `bays` (per floor: `floor`, `floorName`, `count`, `numbers` in number order,
  `unnumbered`) and `ramps` (`id`, `name`, `from`, `to`, `lower` and `upper` each `{ floor, level }`
  in metres, `width`, `rise`, `length`, `slope` in percent, `oneIn`, `statedSlope`), and the rule
  `takeoff.rule.parking`, only on a plan that states bays or ramps. Its description says so.
- A ramp opens its upper floor's slab: a slab opening of the new kind `ramp`, its `via` the ramp's
  id. The IFC names that opening "Ramp".
- `grid describe` says each floor's bays (`Parking bays (16): 1 to 16.`; agent form
  `BAYS 16 numbers 1-16`) and ramps (`RAMP id lower->upper rise <m> length <m> slope <percent>%`).
- New left-out lines (errors; the bay or ramp is in no view, count or export):
  `plan/bay-too-large`, `plan/bay-duplicate-id`, `plan/bay-unknown-floor`, `plan/ramp-too-large`,
  `plan/ramp-duplicate-id`, `plan/ramp-unknown-floor`, `plan/ramp-same-floor`,
  `plan/ramp-no-rise`, `plan/ramp-no-run`. New warnings: `plan/bay-number-repeated`,
  `plan/bays-overlap` (both bays are still counted) and `plan/ramp-slope-differs` (both slopes are
  kept). Each line's thing is the plan, its `also` the bay's or the ramp's id.
- `grid_measure what=access` now says, in the list of what it does not look at, that a ramp the
  plan states between floors is for vehicles and is not measured there.

## Codes

| `plan/bay-too-large` | A parking bay is too large, or too far out, for Grid to build | a bay's size and place in metres, within the largest Grid accepts |
| `plan/bay-duplicate-id` | A parking bay has an id another part of the plan has too | an id of its own on every bay |
| `plan/bay-unknown-floor` | A parking bay is on a floor the plan does not have | a floor of the plan |
| `plan/bay-number-repeated` | Two parking bays on one floor have one number | a number of its own on each bay of a floor |
| `plan/bays-overlap` | Two parking bays overlap, so the floor holds fewer bays than it counts | bays that do not share floor |
| `plan/ramp-too-large` | A ramp is too large, or too far out, for Grid to build | a ramp's width, slope and middle line in metres, within the largest Grid accepts |
| `plan/ramp-duplicate-id` | A ramp has an id another part of the plan has too | an id of its own on every ramp |
| `plan/ramp-unknown-floor` | A ramp joins a floor the plan does not have | from and to naming floors of the plan |
| `plan/ramp-same-floor` | A ramp starts and ends on one floor | from and to naming two different floors |
| `plan/ramp-no-rise` | A ramp joins two floors at one level, so it has no slope | the two floors' levels in metres, one higher than the other |
| `plan/ramp-no-run` | A ramp's middle line has no length, so it has no slope | a middle line from the ramp's edge on one floor to its edge on the other |
| `plan/ramp-slope-differs` | A ramp's stated slope is not the one its levels and its run give | a slope that matches the rise between the two floors over the ramp's length |
