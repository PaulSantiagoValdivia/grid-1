# MSG-13 review: inside or outside, worked out from the rooms on each side of a wall

For the owner. MSG-13 (step 1b) landed on `main` while you were away. Below: what it adds, the
one decision it could not take as the card describes, the results, the tests that changed, what
lane B still has to switch, and what is still open.

## What MSG-13 adds

`packages/floorplan/src/geometry/exposure.ts` works out, for each wall, the rooms on its two
faces along its length:

1. Every room that lists the wall and whose outline closes: an edge of its outline that lies on
   one of the wall's faces puts the room on that face, for that stretch.
2. A face that no listed room covers tries the point just past it (`stepPastFace`): a room that
   holds the point is on that face though it does not list the wall. That is how the walls of a
   pod marked `inside` face the room around them.
3. A point inside another wall's body (where two walls meet) is neither a room nor the outside,
   and nor is floor the walls enclose that no room claims (ARE-4's spaces, worked out only when a
   wall first asks).
4. The wall is cut where any of that changes. Each stretch is `interior` (rooms on both faces),
   `exterior` (one), or `detached` (none). The wall as a whole is `exterior` where any stretch
   longer than `lineInside` faces outside, else `interior` where any stretch has rooms on both
   faces, else `detached`.

`wallSides(index, id)` gives the stretches with their rooms, the worked-out answer and the one
used; `wallExposure(index, id)` gives the one used (it moved here from `room.ts`, with its type).
The one answer is now read by:

| Where | Before | Now |
|---|---|---|
| 2D drawing, 3D scene (`exposure`) | faces from the outline, per wall | worked out per stretch, stated exterior kept |
| DXF wall layer | the drawing's exposure | the same |
| IFC `IsExternal` | the stated kind | the drawing's exposure |
| Build order (outer walls first) | the stated kind | the drawing's exposure |
| Route check: a one-sided door is a way out | stated `exterior` only | stated exterior, or no room and no enclosed floor past it |
| Escape check: a window to the outside | stated `exterior` only | the same rule |

Validation adds one warning, `wall/kind-differs`, where the stated and worked-out kinds disagree
(see below).

## The decision the card left to the code: which stated kind is an exception

The card says to derive the kind and "keep the written kind only for exceptions". The schema
fills a missing `kind` with `interior` (`WallSchema`, `.default('interior')`), so once a plan is
read, a wall stated `interior` cannot be told from one that states nothing. Making `kind`
optional in the parsed plan would change the `Wall` type that `packages/cli` and
`packages/viewer` index tables by (`KIND_LETTER[wall.kind]` in `describe/card.ts`), which is
lane B's code, so I did not.

**Decision:** `exterior`, which is never a default, is the stated exception: a wall stated
exterior stays an outside wall everywhere, even where rooms lie on both its sides. Every other
kind is worked out. Where they disagree, one line:

- "Wall cs is stated exterior, but rooms lie on both its sides along 3.00 m (south and court). It
  is kept as an outside wall, as stated; if it is an inside wall, leave out its kind."
- "Wall e is stated a partition, but faces outside along 2.80 m: room r lies on one side and no
  room on the other. It is treated as an outside wall." (`partition` is never a default either,
  so this one is said; a wall stated `interior` that faces outside gets no line, since every wall
  that states nothing would get one.)

What this leaves out: **a party wall** (stated interior, with the neighbour not drawn) is worked
out as an outside wall, as is a flat's entrance wall onto a landing nobody drew. The card's
`later_uses` gives party walls to CNT-6 as a stated exception; that needs either a `party` kind
or `kind` optional in the parsed plan. Either is a schema change that lane B's code has to follow,
so it is for you to choose, with CNT-6.

## Results

**MS-11, the bench's one-room plan with no kind** (4 × 3 m, a door and a window): before, every
wall read as interior, the door "leads to a space that is not drawn", the bedroom "has no way to
escape", the DXF put the walls on the exterior layer and the IFC marked them not external. Now
all four walls are worked out as outside: the drawing, the DXF layer and the IFC mark agree, the
door is the way out, the window is an escape window, and no line is printed.

**AU1-1, partitions beside an L-shaped room** (6 × 6 m house, bedroom in the notch): both
partitions are inside walls, the living room on one face and the bedroom on the other; the DXF
puts them on the inside layer and the IFC marks them not external. (ARE-1 already read the
drawing's exposure from the outline's faces, commit 794af63; this is where V-7's 387 walls
changed. MSG-13 brings the IFC and the checks to the same answer.)

**WR-5, an extension against part of an outside wall**: the house's east wall stays one wall. It
is inside for the 2.8 m the extension covers and outside above it; the door in the covered
stretch joins the two rooms.

**R-9, a courtyard drawn as a room**: the courtyard's walls, stated exterior, stay outside walls
in the drawing, the DXF and the IFC, and each gets one line. The lab's own courtyard plans
(`s03-courtyard` in four copies) get the same four lines. A courtyard *not* drawn as a room is
enclosed floor no room claims (ARE-4's `floor/unclaimed`), and a door into it still "leads to a
space not drawn"; recognising it as outside is CNT-7's.

**The lab's 1,092 readable plans** (up to 400 rooms), against the exposure before MSG-13:

| Change | Walls | Why, mostly |
|---|---:|---|
| exterior → interior | 246 | partitions beside floor no room claims (a forgotten room), walls of pods marked `inside` and of rooms beside rooms that do not list the wall |
| detached → exterior | 157 | walls stated exterior whose rooms cannot be drawn |
| detached → interior | 109 | walls no room lists, with a room on both faces |
| interior → exterior | 102 | walls stated exterior with rooms on both sides (kept), and walls with a stretch facing outside |
| interior → detached | 5 | |

193 `wall/kind-differs` lines in 68 plans: 176 kept (stated exterior: gardens, plots and
driveways drawn as rooms round a house, courtyards, balconies, terraces, porches, a carport) and
17 partitions facing outside (a loft's edge, a gallery rail). 157 doors in 57 plans on walls not
stated exterior, with nothing past them, are now ways out instead of "a space not drawn".

**The two shared flats**: the Madrid flat's light well and the Berlin flat's balcony are drawn as
rooms against walls stated exterior: three lines and one. The other shared fixtures (the flat,
the villa, the three-bed house, the room-in-room plan) agree with their stated kinds and get none.

**The scoreboard** moved no count. Its damage set and sound plans state every wall's kind and agree
with the worked-out one: no sound plan gets a line, and the damage outcomes are as they were. A
full run takes about 45 s instead of 35.

## Tests that changed on purpose

- `geometry/export/__tests__/ifc.test.ts`: `follows the declared kind, not how exposed the wall
  turns out to be` pinned MS-11's disagreement (all walls declared interior, all not external).
  It is now `follows how exposed the wall is, as the drawing and the DXF do, when no kind says
  exterior` and asserts the IFC agrees with `wallExposure` wall by wall.
- `geometry/__tests__/rules-check.test.ts`, "a flat drawn on its own": a front door on a wall that
  says `interior` with nothing behind it is now a way out (new test). The "space not drawn"
  finding and notice the old tests pinned are kept, with the landing drawn as three walls and no
  room.
- `rules/src/checks/__tests__/rules-escape.test.ts`: `windows only onto the hall` now draws the
  hall (with `interiorBottom`); a wall that only said `interior` with nothing behind it faces
  outside now. A new test: a bedroom whose walls state no kind escapes as one with exterior walls.
- `geometry/__tests__/room-rows-flats.test.ts`: the Madrid and Berlin flats now expect their
  `wall/kind-differs` lines instead of no issue.
- Tests that imported `wallExposure` from `room.ts` import it from `exposure.ts`.

No expected figure (area, length, count) changed. New tests: `geometry/__tests__/exposure.test.ts`.

## For lane B

- `packages/cli/src/describe/facts.ts:256` says a door leads "outside" when `wall.kind ===
  'exterior'`, else "nothing drawn". It should read `wallSides`/`wallExposure` (and, for a door,
  `outsideTest` in `geometry/rules/graph.ts`) so `grid describe` agrees with the drawing and the
  checks.
- `packages/cli/src/quantities/areas.ts:67` takes the outer walls as those stated exterior; the
  gross area of a plan with no kinds stated is then empty. `wallExposure(...) === 'exterior'`
  gives the same walls on a plan with kinds, and the right ones on a plan without.
- `packages/cli/src/quantities/takeoff.ts` groups walls by stated kind; a take-off by exposure
  would be a separate column.
- The viewer draws one exposure per wall. Drawing each stretch (WR-5: inside along the
  extension, outside above it) needs `wallSides(index, id).stretches`.

## Still open

- Party walls and walls onto an undrawn landing (CNT-6), and outdoor rooms counting as outside
  (CNT-7), as above.
- A wall that faces outside for part of its length is one `IsExternal` and one DXF layer; the
  DXF could put each stretch on its own layer.
