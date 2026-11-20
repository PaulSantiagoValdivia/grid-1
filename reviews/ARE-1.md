# ARE-1 review: inside corners measured right

For the owner. ARE-1 landed on `main` while you were away, and the roadmap asks you to look at
two things before a release: the 53 plans whose notes changed (lab entry V-8), and the one
test whose expected figure changed. Both are below, with the decisions made without you and
what is still open.

## What ARE-1 changes

`packages/floorplan/src/geometry/room.ts` now builds a room's outline in two passes. First it
traces the outline along the wall centre lines. The way that outline turns says which face of
each wall looks into the room, wall by wall. Then it moves each wall to that face and joins
neighbours again. Before, the face was chosen from one point in the middle of the room, and in
a room with an inside corner (L, T, U, Z) that point lies behind some walls. Those rooms read
too large, and by an amount that changed when the plan was turned.

The same change brings four more things, also from the lab's patch:

- **A dividing line has no width.** A virtual wall's two faces sit on its centre line, so the
  rooms either side meet there (`wall.ts`). The thickness written on it no longer matters.
- **Walls in a row with different thickness are one side with a step.** A thick wall that
  carries on as a thin one, or as a dividing line, no longer stops the room being drawn.
- **`room/inside-out`.** A room whose walls are thicker than the gap between them has no floor.
  It is refused, and the message names two walls.
- **`room/out-of-order`.** A wall list whose neighbours do not meet (they meet kilometres away,
  or the outline crosses itself) is refused instead of measured, and the message names two
  walls.

Wall exposure (which walls face outside) is now read from the same outline, so it no longer
depends on the middle of the room either.

The code is the lab's patch, from Grid's own lab work (cluster V), applied unchanged. It
applied cleanly to today's `main`.

## The one changed expected figure

`geometry/export/__tests__/ifc.test.ts`, "exports a room bounded by a virtual wall": the room
beside a dividing line was expected to be 4.05 m by 3.0 m and is now 4.10 m by 3.0 m.

Why: the dividing line sits at x = 0 and used to take half of a 0.1 m width from the room, so
the room's face was at x = 0.05. A dividing line is a line on the floor, not a wall, so it now
takes no floor and the room runs to x = 0. This is the behaviour lab entries AR-2 and V-2 asked
for. No other expected figure changed.

## The 53 changed note sets

Of the 1,121 lab plans the scoreboard reads, 53 get different notes. That is the same 53 plans
the lab found (V-8). Over all 53, 131 note lines go, 12 are new and 19 keep their title with
new wording or a new figure. They fall into five groups:

1. **A room that could not be drawn before is drawn now** (walls in a row with different
   thickness, lab MS-7). Its doors count again, so "has no door" and "has no way out" notes
   about it and its neighbours go. Most of the 131 lines are this: 16 in each of the four
   copies of the co-living plans, and the courtyard and studio plans. Where the rooms are now
   joined but still have no way out, the note says so more precisely ("It only opens into
   Shared dining").
2. **A room's area changed, so a figure in a note changed.** For example, the studio's
   sleeping corner reads 6.41 m² instead of 5.91 to 6.16 m², because the dividing lines around
   it no longer take floor.
3. **An area crossed the 6.5 m² line.** Three note sets need your eye most:
   - `size-8-silent-L-shape` (three copies): an L-shaped bedroom read over 6.5 m² only because
     the L read too large. It is 6.01 m² and now gets the size note it was missing.
   - `s14-sweep-t09` (three copies): a thin-armed L reads 1.01 m² and gets a size note.
   - `tiny-house` (six copies): the living room gets its floor back from a dividing line,
     6.46 to 6.55 m², and loses its size note.
4. **A room is refused now** (`room/inside-out` or `room/out-of-order`). Its notes go, and the
   error takes their place: the 0.07 m² closet, the rooms beside 1e9 m and
   1e308 m walls, the 3 cm out-of-square room with a swapped list, and Room 7 of one tight
   random plan (0.35 m² before).
5. **A fence or a wall now has a room on both sides.** In the corner-plot plans the garden
   fences change from exterior to interior, so the garden notes are worded differently. They
   still say the gardens have no way out.

Every plan is listed at the end with the reason and the lines that changed.

## Results

Counts from the scoreboard's own data unless a line says otherwise.

| Check | Before | After |
|---|---:|---:|
| Generated single L, T, U, Z and cross rooms wrong (300, lab cluster L's seeds, hand-worked areas) | 197 | 0 |
| The same rooms turned six ways from 0.001° to 180° (1,800): wrong | 1,179 | 0 |
| The same rooms: area changes when turned | 23 | 0 |
| Lab plans with no error before: rooms wrong by over 0.01 m² (of 15,413) | 748 | 180 (176 at full precision, see below) |
| Lab plans with no error before: rooms right before and wrong now | – | 0 |
| Lab plans with no error before: rooms right before and refused now | – | 0 |
| Floorless rooms in 200 tight random buildings (162): refused | 1 | 162 |
| Four-sided rooms out of square with a swapped list (300): refused as `room/out-of-order` | 0 | 300 |
| L, T, U, Z and cross rooms out of square with a swapped pair (300): refused | 1 | 300 (299 out of order, 1 unclosed) |
| Rectangular rooms in 300 random buildings and 1,740 rooms cut from the shapes: wrong | 0 | 0 |

Scoreboard: rooms measured wrong 1,975 to 200, damage that passes in silence 560 to 538,
rooms Grid does not measure 1,284 to 712. The other four counts did not move.
`scoreboard/README.md` says why each one moved.

## Decisions made without you

- **180, not 176.** On the lab plans with no error, the scoreboard's data gives 180 rooms wrong
  where the lab's own run gave 176. The 4 between are copies of one co-living corridor that is
  one corner square, exactly 0.01 m², off the referee (lab entry V-10). The scoreboard stores the
  referee's figures to six decimals, which puts that difference a hair over 0.01 m². Grid's
  areas are identical to the lab's patched run room for room. I left the scoreboard's data and
  tolerance as they are.
- **The random convex rooms.** The lab's own run shows 10 of its 400 random convex rooms
  "wrong" after the patch and 0 before. They are not wrong. In each, two neighbouring walls
  are almost in line (as little as 0.3° apart) and differ in thickness, and the generator's
  expected area extends the thicker wall's face until it meets the thinner one's, metres past
  the wall's end. QAR-3's independent referee agrees with the patched Grid on all 10, and
  disagrees with the generator on 13 rooms. Against the referee, Grid was wrong on 13 of the
  400 before and is wrong on 3 now (by at most 0.024 m²), as lab entry V-4 says.
- **One swapped list stays `room/unclosed`.** Of the 600 swapped wall lists, 599 are refused
  as `room/out-of-order`. In the last one the random nudge left the two walls exactly
  parallel. That has always been `room/unclosed`, and the message names both walls and says
  "The boundary may be out of order". An existing test ("catches a boundary with consecutive
  parallel walls") and one of the lab's new tests pin that code, so I did not change it.
- **One floorless room stays `room/empty`.** Of the 162 floorless rooms, 161 are refused as
  `room/inside-out` and name two walls. In the last one the walls fill the gap exactly, so
  the room has zero area. Grid already refused it before ARE-1, as `room/empty` ("encloses
  zero area").
- **The flipped tests say what they check.** AR-12 and AR-13 used to expect "some issue". They
  now expect `room/inside-out` and `room/out-of-order`. They moved, with MS-7, to a block named
  "lab failures fixed by ARE-1", since their old block is titled "expected to fail until
  fixed".

## Still open

- **176 lab rooms are still wrong.** Almost all are rooms whose wall list does not match the
  space the walls enclose (a plot drawn round a house, pods, en-suites, furniture drawn as
  walls). They need the checks for a room inside a room, overlapping rooms and unclaimed floor
  (AR-3, AR-4, AR-15; lab entry V-9).
- **Corner squares.** Where a thick wall ends at a cross wall and a thinner wall carries on,
  the referee fills the small square at the corner and Grid does not: 14 lab rooms, 0.0225 m²
  each with 0.3 m walls (V-10). It needs one decision on corners for drawing, 3D and outlines.
- **Dividing lines, outside `room.ts`.** The 2D view still draws a dividing line's written
  width as a gap. The schema still refuses thickness 0 for a virtual wall, so `AR-2 a virtual
  wall may state thickness 0` is still an expected failure (V-2).
- **Exports and wall exposure.** In 85 lab plans some walls change exposure (for example a
  partition beside an L-shaped room is now interior), which changes DXF wall layers and the 2D
  exposure marks. The lab found exports changed in 205 plans, every one of them with a room
  whose outline changed. Those were not reviewed one by one.
- **The out-of-order message** names the two walls but does not yet suggest the right order.

## The 53 plans

Plan names are where each plan sat in the lab, as stored in `scoreboard/data/lab-plans.ndjson.gz`.
Lines starting `-` are notes before ARE-1, lines starting `+` are notes after.

### `A/scenarios/probes/studio-broken-openings.json`

Area changed: sleep 6.16 → 6.41 m²; living 7.56 → 7.75 m²; kitchen 6.93 → 7.09 m².

```diff
- [Size] Sleeping corner is under 6.5 m² :: It measures 6.16 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
+ [Size] Sleeping corner is under 6.5 m² :: It measures 6.41 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
```

### `A/scenarios/probes/studio-v1-collinear-mismatch.json`

Area changed: sleep 5.91 → 6.41 m²; kitchen 6.76 → 7.09 m². Could not be drawn before, measured now: living (7.75 m²). Walls whose exposure changed: 2 exterior → interior.

```diff
- [Exit] Ground floor has no way out :: No door leads outside.
- [Size] Sleeping corner is under 6.5 m² :: It measures 5.91 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
+ [Size] Sleeping corner is under 6.5 m² :: It measures 6.41 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
```

### `A/scenarios/probes/studio-virt01.json`

Area changed: sleep 6.02 → 6.41 m²; living 7.42 → 7.75 m²; kitchen 6.93 → 7.09 m².

```diff
- [Size] Sleeping corner is under 6.5 m² :: It measures 6.02 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
+ [Size] Sleeping corner is under 6.5 m² :: It measures 6.41 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
```

### `A/scenarios/probes/tiny-house-low-ground.json`

Area changed: kitchen 5.57 → 5.66 m²; living 6.46 → 6.55 m².

```diff
- [Size] Living is under 6.5 m² :: It measures 6.46 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
```

### `A/scenarios/probes/tiny-room-0.2.json`

Refused now: r (room/inside-out). Walls whose exposure changed: 4 exterior → detached.

```diff
- [Size] Closet is under 6.5 m² :: It measures 0.07 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
```

### `A/scenarios/studio-bigger-bath.json`

Area changed: sleep 6.16 → 6.41 m²; living 7.56 → 7.73 m²; kitchen 6.09 → 6.24 m².

```diff
- [Size] Sleeping corner is under 6.5 m² :: It measures 6.16 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
+ [Size] Sleeping corner is under 6.5 m² :: It measures 6.41 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
```

### `A/scenarios/studio.json`

Area changed: sleep 6.16 → 6.41 m²; living 7.56 → 7.75 m²; kitchen 6.93 → 7.09 m².

```diff
- [Size] Sleeping corner is under 6.5 m² :: It measures 6.16 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
+ [Size] Sleeping corner is under 6.5 m² :: It measures 6.41 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
```

### `A/scenarios/tiny-house.json`

Area changed: kitchen 5.57 → 5.66 m²; living 6.46 → 6.55 m².

```diff
- [Size] Living is under 6.5 m² :: It measures 6.46 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
```

### `AU1/scenarios/AR-1/s14-sweep-t09.json`

Area changed: room0 21.60 → 17.01 m²; room2 9.20 → 1.01 m²; room3 30.81 → 25.41 m²; room4 28.71 → 23.31 m²; room6 36.90 → 29.61 m².

```diff
+ [Size] L thin arms 6x6 notch 5 is under 6.5 m² :: It measures 1.01 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
```

### `AU1/scenarios/AR-1/size-8-silent-L-shape.json`

Area changed: r1 6.59 → 6.01 m².

```diff
+ [Size] Bedroom is under 6.5 m² :: It measures 6.01 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
```

### `AU1/scenarios/AR-12/room-narrower-than-its-walls.json`

Refused now: room (room/inside-out). Walls whose exposure changed: 4 exterior → detached.

```diff
- [Exit] Ground floor has no way out :: No door leads outside.
- [Exit] Room has no door :: Nothing joins it to another room.
```

### `AU1/scenarios/AR-12/tiny-room-0.2.json`

Refused now: r (room/inside-out). Walls whose exposure changed: 4 exterior → detached.

```diff
- [Size] Closet is under 6.5 m² :: It measures 0.07 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
```

### `AU1/scenarios/AR-13/out-of-square-out-of-order.json`

Refused now: room (room/out-of-order). Walls whose exposure changed: 4 exterior → detached.

```diff
- [Exit] Ground floor has no way out :: No door leads outside.
- [Exit] Room has no door :: Nothing joins it to another room.
```

### `AU1/scenarios/AR-2/s07a-corner-plot.json`

Area changed: street-garden 185.23 → 187.00 m²; side-w 48.02 → 50.00 m²; back 135.24 → 140.00 m². Walls whose exposure changed: 2 exterior → interior.

```diff
- [Exit] A door from Garden to both streets leads to a space that is not drawn :: If that space is a shared landing or a stair, draw it as a room, or mark the wall as exterior if the door leads outside.
- [Exit] Back garden has no way out :: None of its doors leads to a way out.
- [Exit] Garden to both streets has no way out :: None of its doors leads to a way out.
+ [Exit] Back garden has no way out :: It only opens into Garden to both streets.
+ [Exit] Garden to both streets has no way out :: It only opens into Back garden.
```

### `AU1/scenarios/AR-2/studio-virt01.json`

Area changed: sleep 6.02 → 6.41 m²; living 7.42 → 7.75 m²; kitchen 6.93 → 7.09 m².

```diff
- [Size] Sleeping corner is under 6.5 m² :: It measures 6.02 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
+ [Size] Sleeping corner is under 6.5 m² :: It measures 6.41 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
```

### `AU1/scenarios/AR-2/studio.json`

Area changed: sleep 6.16 → 6.41 m²; living 7.56 → 7.75 m²; kitchen 6.93 → 7.09 m².

```diff
- [Size] Sleeping corner is under 6.5 m² :: It measures 6.16 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
+ [Size] Sleeping corner is under 6.5 m² :: It measures 6.41 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
```

### `AU1/scenarios/AR-2/tiny-house.json`

Area changed: kitchen 5.57 → 5.66 m²; living 6.46 → 6.55 m².

```diff
- [Size] Living is under 6.5 m² :: It measures 6.46 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
```

### `AU1/scenarios/AR-2x/studio-virtual-default.json`

Area changed: sleep 5.91 → 6.41 m²; kitchen 6.76 → 7.09 m². Could not be drawn before, measured now: living (7.75 m²). Walls whose exposure changed: 2 exterior → interior.

```diff
- [Exit] Ground floor has no way out :: No door leads outside.
- [Size] Sleeping corner is under 6.5 m² :: It measures 5.91 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
+ [Size] Sleeping corner is under 6.5 m² :: It measures 6.41 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
```

### `AU1/scenarios/MS-3/wall-thickness-1e308.json`

Walls whose exposure changed: 4 exterior → detached.

```diff
- [Exit] Ground floor has no way out :: No door leads outside.
- [Exit] Room has no door :: Nothing joins it to another room.
```

### `AU1/scenarios/MS-3/wall-thickness-1e9.json`

Refused now: room (room/inside-out). Walls whose exposure changed: 4 exterior → detached.

```diff
- [Exit] Ground floor has no way out :: No door leads outside.
- [Exit] Room has no door :: Nothing joins it to another room.
```

### `AU1/scenarios/MS-4/d4-coliving-first-try.json`

Area changed: kitchen 40.46 → 40.79 m²; dining 49.39 → 49.95 m²; lounge 56.44 → 56.82 m². Could not be drawn before, measured now: corridor (60.55 m²). Walls whose exposure changed: 3 exterior → interior.

```diff
- [Exit] Ground floor has no way out :: No door leads outside.
- [Exit] Co-working has no door :: Nothing joins it to another room.
- [Exit] Laundry has no door :: Nothing joins it to another room.
- [Exit] Private room 1 has no door :: Nothing joins it to another room.
- [Exit] Private room 2 has no door :: Nothing joins it to another room.
- [Exit] Private room 3 has no door :: Nothing joins it to another room.
- [Exit] Private room 4 has no door :: Nothing joins it to another room.
- [Exit] Private room 5 has no door :: Nothing joins it to another room.
- [Exit] Private room 6 has no door :: Nothing joins it to another room.
- [Exit] Private room 7 has no door :: Nothing joins it to another room.
- [Exit] Private room 8 has no door :: Nothing joins it to another room.
- [Exit] Private room 9 has no door :: Nothing joins it to another room.
- [Exit] Private room 10 has no door :: Nothing joins it to another room.
- [Exit] Private room 11 has no door :: Nothing joins it to another room.
- [Exit] Private room 12 has no door :: Nothing joins it to another room.
- [Exit] Private room 13 has no door :: Nothing joins it to another room.
```

### `AU1/scenarios/MS-4/s03-courtyard.json`

Could not be drawn before, measured now: south (65.12 m²); north (65.12 m²). Walls whose exposure changed: 2 detached → exterior, 6 exterior → interior.

```diff
- [Exit] Ground floor has no way out :: No door leads outside.
- [Exit] Courtyard (open air) has no door :: Nothing joins it to another room.
- [Exit] East wing has no door :: Nothing joins it to another room.
- [Exit] West wing has no door :: Nothing joins it to another room.
```

### `AU1/scenarios/MS-7/courtyard-thin-shallow.json`

Could not be drawn before, measured now: south (27.40 m²). Walls whose exposure changed: 2 detached → exterior, 2 exterior → interior.

```diff
- [Exit] Ground floor has no way out :: No door leads outside.
- [Exit] East wing has no door :: Nothing joins it to another room.
```

### `AU1/scenarios/MS-7/d4-collinear-solid-thin.json`

Area changed: kitchen 40.46 → 40.67 m²; dining 49.39 → 49.80 m²; lounge 56.44 → 56.65 m². Could not be drawn before, measured now: corridor (60.11 m²). Walls whose exposure changed: 3 exterior → interior.

```diff
- [Exit] Ground floor has no way out :: No door leads outside.
- [Exit] Co-working has no door :: Nothing joins it to another room.
- [Exit] Laundry has no door :: Nothing joins it to another room.
- [Exit] Private room 1 has no door :: Nothing joins it to another room.
- [Exit] Private room 2 has no door :: Nothing joins it to another room.
- [Exit] Private room 3 has no door :: Nothing joins it to another room.
- [Exit] Private room 4 has no door :: Nothing joins it to another room.
- [Exit] Private room 5 has no door :: Nothing joins it to another room.
- [Exit] Private room 6 has no door :: Nothing joins it to another room.
- [Exit] Private room 7 has no door :: Nothing joins it to another room.
- [Exit] Private room 8 has no door :: Nothing joins it to another room.
- [Exit] Private room 9 has no door :: Nothing joins it to another room.
- [Exit] Private room 10 has no door :: Nothing joins it to another room.
- [Exit] Private room 11 has no door :: Nothing joins it to another room.
- [Exit] Private room 12 has no door :: Nothing joins it to another room.
- [Exit] Private room 13 has no door :: Nothing joins it to another room.
+ [Exit] Shared dining has no way out :: It only opens into Shared kitchen and Shared lounge.
+ [Exit] Shared kitchen has no way out :: It only opens into Shared dining.
+ [Exit] Shared lounge has no way out :: It only opens into Shared dining.
```

### `AU1/scenarios/MS-7/studio-v1-collinear-mismatch.json`

Area changed: sleep 5.91 → 6.41 m²; kitchen 6.76 → 7.09 m². Could not be drawn before, measured now: living (7.75 m²). Walls whose exposure changed: 2 exterior → interior.

```diff
- [Exit] Ground floor has no way out :: No door leads outside.
- [Size] Sleeping corner is under 6.5 m² :: It measures 5.91 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
+ [Size] Sleeping corner is under 6.5 m² :: It measures 6.41 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
```

### `AU2/scenarios/A-tiny-house/plan.json`

Area changed: kitchen 5.57 → 5.66 m²; living 6.46 → 6.55 m².

```diff
- [Size] Living is under 6.5 m² :: It measures 6.46 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
```

### `AU2/scenarios/B-s03-courtyard/plan.json`

Could not be drawn before, measured now: south (65.12 m²); north (65.12 m²). Walls whose exposure changed: 2 detached → exterior, 6 exterior → interior.

```diff
- [Exit] Ground floor has no way out :: No door leads outside.
- [Exit] Courtyard (open air) has no door :: Nothing joins it to another room.
- [Exit] East wing has no door :: Nothing joins it to another room.
- [Exit] West wing has no door :: Nothing joins it to another room.
```

### `AU2/scenarios/B-s14-sweep-t09/plan.json`

Area changed: room0 21.60 → 17.01 m²; room2 9.20 → 1.01 m²; room3 30.81 → 25.41 m²; room4 28.71 → 23.31 m²; room6 36.90 → 29.61 m².

```diff
+ [Size] L thin arms 6x6 notch 5 is under 6.5 m² :: It measures 1.01 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
```

### `AU2/scenarios/G-s07a-corner-plot/plan.json`

Area changed: street-garden 185.23 → 187.00 m²; side-w 48.02 → 50.00 m²; back 135.24 → 140.00 m². Walls whose exposure changed: 2 exterior → interior.

```diff
- [Exit] A door from Garden to both streets leads to a space that is not drawn :: If that space is a shared landing or a stair, draw it as a room, or mark the wall as exterior if the door leads outside.
- [Exit] Back garden has no way out :: None of its doors leads to a way out.
- [Exit] Garden to both streets has no way out :: None of its doors leads to a way out.
+ [Exit] Back garden has no way out :: It only opens into Garden to both streets.
+ [Exit] Garden to both streets has no way out :: It only opens into Back garden.
```

### `AU4/scenarios/K/scenarios/a-studio-broken-openings.json`

Area changed: sleep 6.16 → 6.41 m²; living 7.56 → 7.75 m²; kitchen 6.93 → 7.09 m².

```diff
- [Size] Sleeping corner is under 6.5 m² :: It measures 6.16 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
+ [Size] Sleeping corner is under 6.5 m² :: It measures 6.41 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
```

### `AU4/scenarios/K/scenarios/a-tiny-house.json`

Area changed: kitchen 5.57 → 5.66 m²; living 6.46 → 6.55 m².

```diff
- [Size] Living is under 6.5 m² :: It measures 6.46 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
```

### `AU4/scenarios/K/scenarios/b-courtyard.json`

Could not be drawn before, measured now: south (65.12 m²); north (65.12 m²). Walls whose exposure changed: 2 detached → exterior, 6 exterior → interior.

```diff
- [Exit] Ground floor has no way out :: No door leads outside.
- [Exit] Courtyard (open air) has no door :: Nothing joins it to another room.
- [Exit] East wing has no door :: Nothing joins it to another room.
- [Exit] West wing has no door :: Nothing joins it to another room.
```

### `AU4/scenarios/K/scenarios/k-far-1e9.json`

Refused now: a (room/empty). Walls whose exposure changed: 1 exterior → detached, 1 interior → exterior.

```diff
- [Exit] Ground floor has no way out :: No door leads outside.
- [Exit] Room A has no door :: Nothing joins it to another room.
```

### `AU4/scenarios/M/size-8-silent-L-shape.json`

Area changed: r1 6.59 → 6.01 m².

```diff
+ [Size] Bedroom is under 6.5 m² :: It measures 6.01 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
```

### `B/scenarios/s03-courtyard.json`

Could not be drawn before, measured now: south (65.12 m²); north (65.12 m²). Walls whose exposure changed: 2 detached → exterior, 6 exterior → interior.

```diff
- [Exit] Ground floor has no way out :: No door leads outside.
- [Exit] Courtyard (open air) has no door :: Nothing joins it to another room.
- [Exit] East wing has no door :: Nothing joins it to another room.
- [Exit] West wing has no door :: Nothing joins it to another room.
```

### `B/scenarios/s14-sweep-t09.json`

Area changed: room0 21.60 → 17.01 m²; room2 9.20 → 1.01 m²; room3 30.81 → 25.41 m²; room4 28.71 → 23.31 m²; room6 36.90 → 29.61 m².

```diff
+ [Size] L thin arms 6x6 notch 5 is under 6.5 m² :: It measures 1.01 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
```

### `D/scenarios/d4-coliving-first-try.json`

Area changed: kitchen 40.46 → 40.79 m²; dining 49.39 → 49.95 m²; lounge 56.44 → 56.82 m². Could not be drawn before, measured now: corridor (60.55 m²). Walls whose exposure changed: 3 exterior → interior.

```diff
- [Exit] Ground floor has no way out :: No door leads outside.
- [Exit] Co-working has no door :: Nothing joins it to another room.
- [Exit] Laundry has no door :: Nothing joins it to another room.
- [Exit] Private room 1 has no door :: Nothing joins it to another room.
- [Exit] Private room 2 has no door :: Nothing joins it to another room.
- [Exit] Private room 3 has no door :: Nothing joins it to another room.
- [Exit] Private room 4 has no door :: Nothing joins it to another room.
- [Exit] Private room 5 has no door :: Nothing joins it to another room.
- [Exit] Private room 6 has no door :: Nothing joins it to another room.
- [Exit] Private room 7 has no door :: Nothing joins it to another room.
- [Exit] Private room 8 has no door :: Nothing joins it to another room.
- [Exit] Private room 9 has no door :: Nothing joins it to another room.
- [Exit] Private room 10 has no door :: Nothing joins it to another room.
- [Exit] Private room 11 has no door :: Nothing joins it to another room.
- [Exit] Private room 12 has no door :: Nothing joins it to another room.
- [Exit] Private room 13 has no door :: Nothing joins it to another room.
```

### `D/scenarios/d4-collinear-solid-thin.json`

Area changed: kitchen 40.46 → 40.67 m²; dining 49.39 → 49.80 m²; lounge 56.44 → 56.65 m². Could not be drawn before, measured now: corridor (60.11 m²). Walls whose exposure changed: 3 exterior → interior.

```diff
- [Exit] Ground floor has no way out :: No door leads outside.
- [Exit] Co-working has no door :: Nothing joins it to another room.
- [Exit] Laundry has no door :: Nothing joins it to another room.
- [Exit] Private room 1 has no door :: Nothing joins it to another room.
- [Exit] Private room 2 has no door :: Nothing joins it to another room.
- [Exit] Private room 3 has no door :: Nothing joins it to another room.
- [Exit] Private room 4 has no door :: Nothing joins it to another room.
- [Exit] Private room 5 has no door :: Nothing joins it to another room.
- [Exit] Private room 6 has no door :: Nothing joins it to another room.
- [Exit] Private room 7 has no door :: Nothing joins it to another room.
- [Exit] Private room 8 has no door :: Nothing joins it to another room.
- [Exit] Private room 9 has no door :: Nothing joins it to another room.
- [Exit] Private room 10 has no door :: Nothing joins it to another room.
- [Exit] Private room 11 has no door :: Nothing joins it to another room.
- [Exit] Private room 12 has no door :: Nothing joins it to another room.
- [Exit] Private room 13 has no door :: Nothing joins it to another room.
+ [Exit] Shared dining has no way out :: It only opens into Shared kitchen and Shared lounge.
+ [Exit] Shared kitchen has no way out :: It only opens into Shared dining.
+ [Exit] Shared lounge has no way out :: It only opens into Shared dining.
```

### `G/scenarios/s07a-corner-plot.json`

Area changed: street-garden 185.23 → 187.00 m²; side-w 48.02 → 50.00 m²; back 135.24 → 140.00 m². Walls whose exposure changed: 2 exterior → interior.

```diff
- [Exit] A door from Garden to both streets leads to a space that is not drawn :: If that space is a shared landing or a stair, draw it as a room, or mark the wall as exterior if the door leads outside.
- [Exit] Back garden has no way out :: None of its doors leads to a way out.
- [Exit] Garden to both streets has no way out :: None of its doors leads to a way out.
+ [Exit] Back garden has no way out :: It only opens into Garden to both streets.
+ [Exit] Garden to both streets has no way out :: It only opens into Back garden.
```

### `G/scenarios/s07b-corner-plot-thin.json`

Area changed: street-garden 186.99 → 187.00 m²; side-w 49.99 → 50.00 m²; back 139.98 → 140.00 m². Walls whose exposure changed: 2 exterior → interior.

```diff
- [Exit] A door from Garden to both streets leads to a space that is not drawn :: If that space is a shared landing or a stair, draw it as a room, or mark the wall as exterior if the door leads outside.
- [Exit] Back garden has no way out :: None of its doors leads to a way out.
- [Exit] Garden to both streets has no way out :: None of its doors leads to a way out.
+ [Exit] Back garden has no way out :: It only opens into Garden to both streets.
+ [Exit] Garden to both streets has no way out :: It only opens into Back garden.
```

### `K/scenarios/a-studio-broken-openings.json`

Area changed: sleep 6.16 → 6.41 m²; living 7.56 → 7.75 m²; kitchen 6.93 → 7.09 m².

```diff
- [Size] Sleeping corner is under 6.5 m² :: It measures 6.16 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
+ [Size] Sleeping corner is under 6.5 m² :: It measures 6.41 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
```

### `K/scenarios/a-tiny-house.json`

Area changed: kitchen 5.57 → 5.66 m²; living 6.46 → 6.55 m².

```diff
- [Size] Living is under 6.5 m² :: It measures 6.46 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
```

### `K/scenarios/b-courtyard.json`

Could not be drawn before, measured now: south (65.12 m²); north (65.12 m²). Walls whose exposure changed: 2 detached → exterior, 6 exterior → interior.

```diff
- [Exit] Ground floor has no way out :: No door leads outside.
- [Exit] Courtyard (open air) has no door :: Nothing joins it to another room.
- [Exit] East wing has no door :: Nothing joins it to another room.
- [Exit] West wing has no door :: Nothing joins it to another room.
```

### `K/scenarios/k-far-1e9.json`

Refused now: a (room/empty). Walls whose exposure changed: 1 exterior → detached, 1 interior → exterior.

```diff
- [Exit] Ground floor has no way out :: No door leads outside.
- [Exit] Room A has no door :: Nothing joins it to another room.
```

### `L/scenarios/kinds/out-of-square-out-of-order.json`

Refused now: room (room/out-of-order). Walls whose exposure changed: 4 exterior → detached.

```diff
- [Exit] Ground floor has no way out :: No door leads outside.
- [Exit] Room has no door :: Nothing joins it to another room.
```

### `L/scenarios/kinds/room-narrower-than-its-walls.json`

Refused now: room (room/inside-out). Walls whose exposure changed: 4 exterior → detached.

```diff
- [Exit] Ground floor has no way out :: No door leads outside.
- [Exit] Room has no door :: Nothing joins it to another room.
```

### `L/scenarios/kinds/wall-thickness-1e308.json`

Walls whose exposure changed: 4 exterior → detached.

```diff
- [Exit] Ground floor has no way out :: No door leads outside.
- [Exit] Room has no door :: Nothing joins it to another room.
```

### `L/scenarios/kinds/wall-thickness-1e9.json`

Refused now: room (room/inside-out). Walls whose exposure changed: 4 exterior → detached.

```diff
- [Exit] Ground floor has no way out :: No door leads outside.
- [Exit] Room has no door :: Nothing joins it to another room.
```

### `L/scenarios/odd/numbers--wall-thickness-1e308.json`

Walls whose exposure changed: 4 exterior → detached, 1 interior → detached.

```diff
- [Exit] A door from Living leads to a space that is not drawn :: If that space is a shared landing or a stair, draw it as a room, or mark the wall as exterior if the door leads outside.
- [Exit] Bedroom has no door :: Nothing joins it to another room.
```

### `L/scenarios/odd/numbers--wall-thickness-1e9.json`

Refused now: a (room/inside-out); b (room/inside-out). Walls whose exposure changed: 4 exterior → detached, 1 interior → detached.

```diff
- [Exit] Ground floor has no way out :: No door leads outside.
- [Exit] Living has no door :: Nothing joins it to another room.
- [Exit] Bedroom has no door :: Nothing joins it to another room.
```

### `L/scenarios/random/tight-seed10002.json`

Refused now: room7 (room/inside-out). Walls whose exposure changed: 2 exterior → detached, 3 interior → exterior.

```diff
- [Exit] Room 7 has no door :: Nothing joins it to another room.
- [Escape] Room 7 has no way to escape :: It needs a window or a door to the outside that someone can climb through.
- [Size] Room 7 is under 6.5 m² :: It measures 0.35 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
```

### `M/scenarios/size-8-silent-L-shape.json`

Area changed: r1 6.59 → 6.01 m².

```diff
+ [Size] Bedroom is under 6.5 m² :: It measures 6.01 m². Rooms people sleep or live in need at least 6.5 m². Basis: US model codes (IBC 2024 1208.4, IRC 2024 R312.1). Found by an AI and not yet checked by a person.
```

### `Q/scenarios/part1-limits/courtyard-thin-shallow.json`

Could not be drawn before, measured now: south (27.40 m²). Walls whose exposure changed: 2 detached → exterior, 2 exterior → interior.

```diff
- [Exit] Ground floor has no way out :: No door leads outside.
- [Exit] East wing has no door :: Nothing joins it to another room.
```
