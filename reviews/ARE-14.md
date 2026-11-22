# ARE-14: areas for party walls, outdoor space, free floor and per flat or zone

Branch `claude/are-14-0f379d`, cut from main at 3bb2236e, with main merged in at 67f4f6ea (VEW-1). No plan-format convention: C28 is left
unused (ARE-14 reads flats, outdoor space and fixtures as they are; it adds nothing to the file).
Changelog fragment `changes/ARE-14.md`. Docs: `docs/areas.md` (two rows of the measures table, a
new "A flat to the middle of its party walls" part, the outdoor-rule paragraph rewritten, a new
"Free floor" section), a line each in `docs/plan-file.md` and `docs/tool-server.md`'s `grid_areas`
row, and one line in `AGENTS.md` for the new file. No new message code.

## What changed

**A flat to the middle of its party walls (`geometry/partyWalls.ts`, new; lab R-1).**
`partyWallArea(rooms, sides)` takes a group of rooms on one floor and pushes each side of each
room's floor across the wall it lies on: by half that wall where anything of the building lies
beyond it (another room of the flat, another flat, the common parts, or a neighbour behind a wall
marked separating, CNT-6), and by none of it or all of it where the wall faces outside, as
`exposure.ts` works that out stretch by stretch (a wall stated exterior faces outside along all of
it, as the gross areas read it). The corner between two pushed sides is filled to where their
outer lines meet; a hole's sides are pushed into the hole. The pieces are joined
(`polygon-clipping`), so a wall inside the flat is counted once. Two figures come out, to the
inside face (`grossInternal`) and to the outside face (`grossExternal`) of the outer walls, the
same two kinds as the floor's gross areas.

**Areas (`geometry/areas.ts`).** `MEASURES` gains `partyWall` ("Area to the party walls") and
`freeFloor` ("Free floor"), their sentences in the message files (MSG-11; `es.ts` drafts, not
reviewed). `planAreaFigures` groups each listed flat's rooms, and the rooms in no flat, floor by
floor (a duplex is added up, never joined across floors), leaving out zones (in their room),
outdoor space (the outside) and rooms named outside; a stair counts on each floor it stands on, as
the gross areas count it. `FlatAreaFigure.toPartyWalls` and `PlanAreaFigures.notInFlatsToPartyWalls`
carry the figures (null with no flats, or when the join fails). A flat that holds outdoor space
gets `outdoor: { area, weighted }`, and `outdoor.weighted` gains `kinds` (each kind a stated rule
counts, with its share and what it counts) and `withNet`.

**The CLI (`quantities/areas.ts`, `quantities/fixtures.ts`).** Free floor beside the net for each
floor, each flat and the plan (`fixtures`, `free`), from the rooms the net counts. `planFixtures`
gains `zoneTaken`: a zone's fixtures are those whose middle is in it, within it; its room's free
floor still holds them. `FIXTURE_RULES.free` is now `MEASURES.freeFloor.measures`, the same words.

**`grid_areas` (`mcp/readTools.ts`, `mcp/outdoorRulesArg.ts`, new).** A new `outdoor_rules`
argument: by kind of outdoor space, `{ share, rule }`. Each flat's line gains its area to the party
walls in the gross measures the reader asked for, its free floor and its outdoor space; "In no
flat" gains the common parts' figure; the party-wall rule's sentence follows the flats. After the
outdoor space the text says either that no stated rule counts it and it is left out of every
total, or each kind counted at what share by the person's rule ("Grid has not checked it"), the
kinds no rule counts, and the net with the counted floor. A free-floor total line with its rule.
The data gains `toPartyWalls`, `notInFlatsToPartyWalls`, `fixtures`, `free` and `outdoor` (it was
not in the data before, though CNT-7's fragment says it was).

## Done when

| Done when | What shows it | Where |
|---|---|---|
| The four-flat floor gives an area per flat to the middle of party walls, with the rule sentence | Flat A 72.95 m² to the inside face (9.825 × 7.425: the middle of the stair and corridor walls at x 10, y 7.6, the 0.35 m outer walls' inside face at 0.175) and 79.11 m² to the outside face, beside 68.27 m² net; C and D 105.49 and 112.98 m². The flats and the common parts add up to the floor's 452.72 m² gross internal and 483.52 m² gross external to 1e-6. The text gives each with "Area to the party walls: …". | `floorplan/…/__tests__/partyWalls.test.ts`, `cli/…/mcp/__tests__/areaMeasures.test.ts` |
| A balcony is left out of the floor total, or counted by a rule the person stated, and the report says which | Without a rule: in no net, no flat's net and no party-wall figure, listed with its flat, and "No rule you stated counts any of it, so it is left out of every total." With `outdoor_rules: { balcony: { share: 0.5, rule } }`: the net unchanged, "Your rule counts 50% of each balcony, and Grid has not checked it (rule): 2.25 m²." and "Net with the outdoor space your rules count: 78.59 m²", and the flat's line "of which your rules count 2.25 m²: 78.59 m² with it". | both test files above |
| The shop's floor area with and without fixtures differs as in S-6 and both are labelled | A 10 × 6 m shop: "Net: 60.00 m²" and "Free floor: 45.00 m², the net less the 15.00 m² its fixtures stand on. Free floor is …", a quarter apart, and the room's line "60.00 m², free floor 45.00 m² (fixtures stand on 15.00 m²)". Its till, a zone holding the counter, has 15 m², 5 m² of fixtures and 10 m² free. | `areaMeasures.test.ts` |

## Tests whose expected values changed

- `floorplan/…/__tests__/outdoor.test.ts`, "reads true as outdoor space of no named kind, and
  weights it only by a rule the caller states": `outdoor.weighted` compared whole with `toEqual`,
  so it now lists the two fields ARE-14 adds (`kinds`, `withNet`). The area and rules are as before.
- `floorplan/…/__tests__/areas.test.ts`, "is in docs/areas.md in the same words as MEASURES": the
  row filter also takes "Area to the party walls" and "Free floor", the two new measures.
- `cli/…/mcp/__tests__/flats.test.ts`, the four-flat floor: the "In no flat" line now carries the
  common parts' area to the party walls (95.85 m² and 99.35 m²) after its 84.49 m².
- `cli/src/__tests__/ownWords.test.ts`: `readTools.ts` 315 → 316 (one sentence in `grid_areas`'
  description), `quantities/fixtures.ts` 2 → 1 (the free-floor rule moved to the message files),
  and `mcp/outdoorRulesArg.ts` listed with 12 (the new argument's description, schema and checks,
  English by design like every tool's).

No other expected value changed.

## Scoreboard

See "Check results". ARE-14 adds no probe; the counts are compared with `scoreboard/current.json`
below, and `current.json` is not edited.

## For the owner

1. **Shop fixture kinds are not added.** The S-6 shop is drawn with CNT-11's fixture kinds: its
   counter and its shelving runs are `kitchen-run` items with their own labels. AGENTS.md says a
   new kind needs a decision first, and CNT-11 decided fixtures now, furniture later. `docs/areas.md`
   says so. If shop counters, shelving and racks should be kinds of their own (and whether they are
   fixtures or furniture), that is a decision for CNT-11's line; the free floor would read them
   with no change.
2. **Two kinds of the party-wall figure, following the reader's gross measure.** The developer's
   figure runs to the middle of party walls; what it does at the outer walls differs by place. Grid
   gives both, to the inside face and to the outside face, in the data always, and in the text in
   the order `country` or `gross` picks (both with neither). A third kind, to the middle of every
   wall (the line SHT-11 draws round a flat), is not given.
3. **What a flat's party-wall figure holds.** Its rooms as the flats list names them, with its own
   inner walls and partitions, and its stair on each floor it stands on (as the gross areas count
   a stair; the net counts it once). Zones are in their room, outdoor space is the outside, rooms
   named outside are left out, and floor no room claims is in no flat. A wall with no room drawn
   beyond it counts to its middle only when the plan marks it separating or states what is beyond.
4. **An outdoor rule is by kind only**, as CNT-7's library option already was: half of every
   balcony, not of this balcony, and not roofed against open. A rule keyed by roofed or open (some
   places count a covered terrace and not an open one) would be a small follow-up.
5. **The counted outdoor floor is never in the net.** It is given beside it, as `withNet` and per
   flat, and the text says every other figure leaves it out. A share is held from 0 to 1.
6. **A zone's free floor** takes the fixtures whose middle is in the zone, as a room takes them; a
   fixture straddling the zone's line counts all its in-zone floor only when its middle is in the
   zone.
7. **No named local rule is carried.** Grid states no outdoor share of its own; a rule comes only
   from the person, said as theirs and "not checked". No figure record was added, so nothing is
   `ai-found`.

## Check results

- Before the merge (47190f3a on 3bb2236e): full suite
  `npx vitest run --exclude '.claude/**' --maxWorkers=2 --minWorkers=1`: 380 files, 6,165 passed,
  4 skipped, 0 failed. `npm run typecheck` and `npm run lint` clean.
- `npm run scoreboard`: the same as the stored figures. Rooms measured wrong 197, damage that
  passes in silence 277, turns answered 23, design mistakes named 5, checks the plan can feed 25;
  guards 735 and 95. No count moved.
- Main merged at 67f4f6ea (VEW-1; only `AGENTS.md` shared, on other lines, no conflict). After it:
  the ten affected test files (party walls, areas, outdoor, flats in the core and the tool
  server, fixtures, the tool list, own words, the release fragments, the new tool test) 141 of 141
  passed; type check and lint clean.
