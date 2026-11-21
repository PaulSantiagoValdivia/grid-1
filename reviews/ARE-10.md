# ARE-10 review: lengths, distances and a room's height on request

For the owner. ARE-10 (step 4) answers measuring questions directly, from faces, as a person
with a tape measures, so an agent no longer subtracts half a wall by hand (lab entry AR-8, F-9).
Below: what it adds, the change to the plan file (which needs your check), the done_when
results, the decisions made without you, and what is still open.

## What ARE-10 adds

All of it is in the existing measuring tool, `grid_measure` (no new tool: there are still 14).

| Call | Answers |
|---|---|
| `what=between`, `from`, `to` | The clear distance between two walls, doors, windows, openings or rooms, by id, outline to outline: a wall by its faces, an opening by the edges of its hole in the wall, a room by its inside outline. With the nearest point of each and which way the second lies on the drawing. Two things that touch or overlap get 0 and say so |
| `what=between`, `from`, `x`, `y` | The same to a free point: the plan names no points, so a point is given by its coordinates |
| `what=wall`, `wall` | A wall's length on its centre line, its thickness and height, and the length of its face in each room beside it |
| `what=room`, `room` | As before, plus the room's height and where it comes from |

The odd house, as the lab wrote it (`F/scenarios/odd-house.json`, read from the scoreboard's
data in the test):

```
From door "entrance" to wall "g-w": 0.85 m clear, W on the drawing, from (1.00, 0.15) to (0.15, 0.15).
Wall "g-s": 10.00 m on its centre line, 0.30 m thick, 2.70 m high. Along its face in each room: "Hall and stair" 2.79 m, "Living" 6.79 m.
Height 2.70 m, the height of its walls; the plan states none for the room.
```

A room, wall, door or window that the plan does not have is now refused with the nearest id it
does have, by the number of letters that differ, ignoring case: `What from names is no wall,
door, window, opening or room of this plan. The nearest known id is "entrance".` The id that was
sent is never repeated (MS-19). The same sentence now comes first in the refusal for every
room and opening argument in the tool server (`roomArg` and `openingArg` in
`packages/cli/src/mcp/toolkit.ts`), ahead of the list of ids those refusals already gave. Floors
are left alone: LVL-1 owns the unknown-floor message.

## The change to the plan file (needs your check)

One new optional field on a room, in `packages/floorplan/src/types/floorplan.ts`:

```json
{ "id": "loft", "name": "Loft room", "boundary": ["l1", "l2", "l3", "l4"], "height": 2.3 }
```

- `height` is the room's height, floor to ceiling, in metres. It must be a finite number above 0;
  0, a negative number or text is refused, naming `rooms.N.height`.
- It is optional and never defaulted, so a plan that does not state it reads byte for byte as
  before, with no key added.
- **The version rule (CNT-1).** The card names CNT-1 as a need, and CNT-1 is not built: the
  version is still the fixed text `"1"`. As ARE-5 did with `inside`, the field is added as
  optional to version 1. Whether it should wait for version 2 is yours to decide.
- **LVL-1.** LVL-1 owns the floors' levels and heights, and runs at the same time. This field is
  on rooms, not floors, and touches no line of `FloorSchema` or `WallSchema`.
- The plan comparison in `@ongrid/floorplan` (`diffPlans`) reports a room height stated, changed
  or taken out, with a summary line such as `"Left room" height not stated → 2.40 m`, and nothing
  below its length tolerance.

## The rule for a room's height

In the README ("Measuring from faces, and a room's height") and in every `what=room` answer:

1. A height the room states wins, whatever its walls stand; the answer gives their heights beside it.
2. Otherwise, when the solid walls round the room all stand one height, the room is that high.
3. When they differ, the room is as high as the lowest of them, because a level ceiling rests on
   every wall round it. The answer names the lowest walls and the highest height.
4. Dividing lines stand no height and are left out. With no solid wall round it, the height is
   not known.

Tested on a 4 × 3 m room with three walls at 2.70 m and one at 2.40 m (2.40 m, from the lowest
wall, naming it), the same room stating 2.55 m (2.55 m, walls 2.40 m to 2.70 m), a room whose
walls agree, and both floors of the odd house (2.70 m and 2.50 m).

## done_when

| Condition | Result |
|---|---|
| The measure call between two named things answers from faces: the odd house's entrance is 0.85 m from the inside face of its side wall (AR-8) | Met. `what=between from=entrance to=g-w` gives 0.85 m, either way round; the door's other edge to the partition is 0.94 m, the hall 2.79 m face to face, two rooms across a 0.12 m wall 0.12 m, and the inside corner as a point 0.85 m (`packages/cli/src/mcp/__tests__/measureBetween.test.ts`) |
| A room height is stored and returned; the rule for which height wins when the walls round a room differ is in the guide and tested on such a room | Met. Stored as `rooms[].height`, returned by `what=room`; the rule is in the README, and a test checks the README states it |
| An unknown name is refused with the nearest known id | Met for walls, openings and rooms in `grid_measure`, and for room and opening arguments in every tool |

## Decisions made without you

- **One tool, not a new one.** The card's measure call is `what=between` on `grid_measure`, as
  the brief asked. `what=wall` was added for "a wall's length" in the card's first sentence.
- **Lowest wall wins.** When the walls round a room differ and the room states no height, the
  lowest wins. The other choices were the most common height (which can report a ceiling above
  a wall that holds it) and the highest (which reads a parapet as headroom). The lowest is the
  height a person can count on.
- **The shortest distance, outline to outline.** `between` gives the shortest clear distance,
  not a distance along a chosen direction. For a door and the wall at its corner, and for two
  parallel walls facing each other, that is the distance a person measures. For things at an
  angle it is the nearest gap, and the answer gives both end points so the agent can see where it
  was taken.
- **An opening is its hole through the wall**, from its near edge to its far edge, face to face.
  A door's leaf and frame are not in the plan.
- **An id two kinds share** (a wall and a room both called `hall`) is read as a wall, then an
  opening, then a room. The schema does not forbid shared ids across kinds.
- **A tie for the nearest id** goes to the first in the plan: walls, then openings, then rooms.
- **Two floors.** A measure between things on different floors is refused: the plan holds no
  height between floors until LVL-1 lands.
- **Compass letters** (`W on the drawing`), as the room sides in `what=room` already give them.
- **A point's range.** `x` and `y` take the plan's own limit, `largest` in `tolerances.ts`.

## What should use LVL-1's fields later

- A wall that states no height gets 2.7 m, which cannot be told from a stated 2.7 m (AU3). Once
  LVL-1 lets a wall follow its floor's height, the room height rule should read: the room's own
  height, else its floor's stated height when its walls follow the floor, else the lowest wall.
  `roomHeight` in `packages/cli/src/quantities/measure.ts` is the one place to change.
- A room stated taller than its storey, or taller than the walls round it, gets no warning here.
  LVL-1's "object taller than its storey" warning (S-2) is the place for it.
- A measure between floors could give the vertical distance once floors state their levels.

## Not done, for a later card

- The room height is not drawn, not exported (the IFC space could carry it) and not in
  `grid describe` or `grid sheet`. CNT-1's new-field checklist (geometry, drawing, exporters,
  comparison, guide, rooms-first spelling) would name these; only the comparison and the guide
  are done.
- `grid_compare` compares rooms by name and area (`packages/cli/src/quantities/compare.ts`), not
  through `diffPlans`, so it does not report a changed room height.
- When `grid tidy` splits a room along a wall (`wall/crosses-room`), the new part does not carry
  the room's stated height.

## Tests

New: `packages/cli/src/mcp/__tests__/measureBetween.test.ts` (18), three in
`packages/floorplan/src/types/__tests__/floorplan.test.ts` and one in
`packages/floorplan/src/geometry/__tests__/diff-rooms-floors.test.ts`. No existing expected
figure or message was changed, and no `it.fails` was flipped.

## Files touched

- `packages/floorplan/src/types/floorplan.ts`: `RoomSchema.height`.
- `packages/floorplan/src/geometry/diff/props.ts`, `diff.ts`, `scope.ts`, `summary.ts`: a room's height in the comparison.
- `packages/cli/src/quantities/measure.ts`: `roomHeight`, `wallLengths`, `distanceBetween` and the things it measures.
- `packages/cli/src/mcp/readTools.ts`: `what=between`, `what=wall`, the height in `what=room`, the description.
- `packages/cli/src/mcp/toolkit.ts`: `nearestIdText`, `wallArg`, `thingArg`; the nearest id in `roomArg` and `openingArg`.
- `README.md`: the tool's row, the nearest id, and "Measuring from faces, and a room's height".
- The three test files above, and this review.
