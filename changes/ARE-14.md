# 2026-11-22: areas to the party walls, outdoor space by a stated rule and free floor (ARE-14)

## For people

- `grid_areas` gives each flat's area to the middle of its party walls beside its net area, to the
  inside face of the outer walls or to their outside face as the gross areas are, with the rule
  said in Grid's own words: on the lab's four-flat floor 72.95 m² for a one-bedroom flat of
  68.27 m² net (ARE-14). A balcony or another outdoor space is left out of every total, and the
  answer now says so; when you state a rule that counts part of it, such as half of each balcony,
  the share it counts is given beside the net and never in it, said as your rule. Where fixtures
  stand, the free floor is given beside the floor area for each room, zone, flat and floor and in
  all: a shop of 60 m² with 15 m² of counters and shelving has 45 m² free.

## For agents

- `grid_areas` takes `outdoor_rules`: by kind of outdoor space (`garden`, `courtyard`, `terrace`,
  `balcony`, `light-well`, `porch`, `carport`, `other`), `{ share, rule }`, the share from 0 to 1
  and the person's rule with where it comes from; an unknown kind, a share outside 0 to 1, an
  empty rule or another field is refused by name.
- Its data gains, on a plan that lists flats, each flat's `toPartyWalls` (`grossInternal`,
  `grossExternal`; null when its rooms could not be joined) and `notInFlatsToPartyWalls` for the
  rooms in no flat; on a flat that holds outdoor space, `outdoor` (`area`, `weighted`). On a plan
  with fixtures it gains `fixtures` and `free`, and so does each floor and flat with fixtures in
  the rooms it counts; a zone (CNT-8) that holds a fixture's middle gives its own `fixtures` and
  `free`. On a plan with outdoor space the data now holds `outdoor`, whose `weighted` adds `kinds`
  (each kind a rule counts: `kind`, `area`, `share`, `counted`, `rule`) and `withNet`.
- `measures` lists `partyWall` ("Area to the party walls") on a plan that lists flats and
  `freeFloor` ("Free floor") on a plan with fixtures; `MEASURES` in the library holds both. The
  text prints each flat's area to the party walls after its net in the gross measures asked for,
  the common parts' after "In no flat", the rule's sentence after the flats, a free floor line,
  and after the outdoor space either "No rule you stated counts any of it, so it is left out of
  every total." or each kind counted by the stated rule and the net with it.
- In the library, `planAreaFigures(plan).flats[].toPartyWalls` and `notInFlatsToPartyWalls`, and
  `partyWallArea` in `geometry/partyWalls.ts`.
- No new code in the record.
