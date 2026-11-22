# VEW-9 review: a route and a walk-through

For the owner. What VEW-9 adds, how each done-when item is met, every expectation that changed,
the choices made without you, and the checks run.

## What VEW-9 adds

**A route's walked length** (`packages/cli/src/quantities/walked.ts`, pure). `grid_measure
what=route` already gave the rooms in order and every door (CNT-13); it now also gives `length`
and `legs` (each room's share). The rule, said with every answer: from the middle of the room it
starts in (the centre of its widest circle, `poleOfInaccessibility`) to the middle of each doorway
on the room's face, straight through the hole to the middle of its far face (the near middle
mirrored across the wall's centre line, so a wall's thickness is walked once), and on to the
middle of the room it ends in, or to the outside face of the door out. Inside a room the line is
the shortest that keeps to the floor: a straight line when it crosses no side, else Dijkstra over
the room's inside corners and its holes' corners (a visibility graph). A dividing line is crossed
at the middle of the stretch the two rooms share. The doorway's middle on a face comes from
CNT-13's `openingMouth` and `lineMouth`. With `width`, the way it gets through by carries its
length too.

**The walk-through** (`packages/cli/src/describe/walk.ts`; `grid describe --length walk`,
`grid_describe length=walk`). Each floor starts at its way in (see For the owner, 1), then goes
room by room through the doors, doorless openings and open sides as the way-out check reads them
(`wayGraph`): the ways on from each room are taken from left to right as you stand in its
doorway, depth first. In each room you stand at the middle of the doorway you came in by, facing
in square to the wall, and the room is said by wall: ahead (each thing so far to your left or
right), on your left and on your right (each so far ahead), and in the wall you stand in; a
fixture is on the wall nearest its middle; each wall with how far it is, straight out from where
you stand. The room's size as you face it (across, deep) and its area come first. A floor laid out
like an earlier one is said once (VEW-5's `repeats`); `--floor`/`floor` walks one. A room no way
reaches is listed. With the plan's y running down the page, left and right are the building's.
The person's form never prints an id; the agent's is one line a stop with a key line.

**Pictures.** `--pictures <folder>` (CLI) or `pictures=true` (tool) take a picture from each
doorway with VEW-3's `eyeCamera`: eye 1.6 m up (`grid_view kind=eye`'s default), half a metre
into the room (less in a shallow one), looking ahead. The CLI writes `walk-01.png` and on into a
folder that must exist, checked before the plan is read (CMD-15), and names each under its room.
The tool returns at most 12 pictures as image content after the text (`WALK_PICTURES_MAX`) and
says so when there are more; that needed `images` on a tool's answer, beside the one `image`
(`toolkit.ts`, `protocol.ts`, `serveTools.ts`).

**Docs**: `docs/tool-server.md` (a section "A route's length, and a walk-through", and the
`grid_measure` and `grid_describe` rows), `docs/commands.md` (the table row, the lengths table and
a paragraph), a line under "Unreleased" in `CHANGELOG.md`, the agents' changelog in
`docs/result-contract.md`, and one sentence in `AGENTS.md`.

## The done-when items

| Done when | Test |
|---|---|
| 1. The route from bedroom 1 to the hall returns the rooms, the doors and 4.34 m | `packages/cli/src/quantities/__tests__/walked.test.ts`: "from Bedroom 1 to the Hall: the rooms, the door and 4.34 m" (`['bed1', 'hall']`, `door-bed1`, 4.342 m: 2.192 in the bedroom, 0.10 through the wall, 2.05 in the hall), and through the tool, "in its text and its data, with the rule" ("Walked, 4.34 m: "Bedroom 1" 2.19 m, "Hall" 2.05 m, and 0.10 m through the walls.") |
| 2. The walk-through of the block's ground floor matches the witnesses on 19 of 19 checks (AD-4) | `packages/cli/src/describe/__tests__/walk.test.ts`, "the walk of the block's ground floor: 19 checks written from the plan (AD-4)": 19 of 19 pass |

The flat is `packages/floorplan/fixtures/two-bed-flat.json`, the lab's two-bed flat with a Hall
(the CLI's own `fixtures/two-bed-flat.json` is another flat, with no Hall). The block is the
scoreboard's stored `D/scenarios/d2-block-g+5.json`, the six-storey block VEW-5 measured.

The test file also covers: the person's and the agent's wording, a floor said once and a floor
with no door from outside starting in its stair room, a mirrored plan, `--floor` and `--pictures`
refused with another length, six PNGs written for the flat, and the tool's six pictures in the
walk's order. `walked.test.ts` also walks round an L's inside corner and round a hole.

## Expectations changed

- `packages/cli/src/command/__tests__/describe.e2e.test.ts`: the refusal of an unknown `--length`
  now lists `walk` ("line, rooms, walls, walk"), and the usage line has `walk`, `--floor <id>` and
  `--pictures <folder>`. Both are the new length and options, nothing else.

Added to existing test files:

- `packages/cli/src/command/__tests__/everyPath.e2e.test.ts`: `describe --pictures` is a new slot
  that takes a path, so it is listed (CMD-15 fails a path option that is not); the six T-5 paths
  and the link out of the project are refused there like every other slot.
- `packages/cli/src/mcp/__tests__/replay/harness.ts`: a reply now counts its pictures (`images`).

`grid_describe` checks an unknown `floor` before anything else, so MS-19's test (every tool with
`floor` refuses `basement-99` naming the plan's floors) passes unchanged.

## For the owner

1. **Where a floor's walk starts.** The front door the plan names (`front.opening`, CNT-3); else
   the widest door from outside into a room used as a corridor or reception; else the widest door
   from outside. On the block that is the 1.8 m main door into the Entrance lobby. A floor with
   no door from outside starts in its stair room, standing in its middle facing its first door;
   with no stair room, in its first room. Rooms left over that have their own door from outside
   start a new walk from it. Reversible: `wayIn` in `walk.ts`.
2. **The witnesses (AD-4).** AD-4's witness data is not in the repository (nothing names AD-4,
   and the scoreboard's lab data holds plans, not walk-throughs). The 19 checks were written from
   the block's walls and openings by hand, each figure worked out in the test's comments, then
   run. If you have the witnesses' 19 statements, they can replace the table one for one.
3. **The 4.34 m figure.** The lab prototype's method is not in the repository either. Of the
   rules tried, "middle of the room, middle of the doorway on each face, middle of the room" gives
   4.342 m; going to the doorway's middle on the wall's centre line instead gives 4.328 m (4.33),
   and room centres on the wall centre lines 4.45 m. The first is the one kept, and is the rule
   the answer states.
4. **The room's middle is the widest circle's centre**, the same point `grid_measure what=room`
   gives. In a long room it is somewhere on its middle line (the hall's is at its middle). A
   route from or to a zone (CNT-8) is measured from its whole room, as the route already was.
5. **Eye height 1.6 m and half a metre in** for the pictures: the eye view's own default, and a
   step so the picture is not taken from inside the door's hole. Not a setting yet.
6. **A thing on a slanted wall** is put on the nearest of ahead, left, right or behind by the
   wall's direction (ties at 45° go ahead or behind).
7. **Bundle**: VEW-9 adds about 18 kB (529,751 to 548,061 bytes on its own). After merging main
   at 90a933b1 (HND-11, COD-8) it is 560,742 bytes: under the 600 kB cap `grid.e2e.test.ts`
   holds, over the 550 kB the brief named. The pictures load the 3D chunk only when asked.

## Checks run

- Before merging main: the full suite (`--maxWorkers=2`) did not finish inside 1500 s on this
  machine with other sessions running, twice; run in two halves with the same flags, everything
  but `packages/cli` (227 files, 4,292 passed, 3 skipped) and `packages/cli` (90 files, 1,254
  passed, 1 skipped), all green. The one failure of the first whole run was `grid check` under
  500 ms, a timing test, which passes on its own. Scoreboard: the same as the stored figures.
- After merging main at 90a933b1 (conflicts only in the docs' tables and changelogs and in
  `readTools.ts`'s imports, both sides kept): type check and lint clean; the affected tests
  (`describe`, `quantities`, `mcp`, the zones edit, and the `describe`, `everyPath` and `grid`
  end-to-end tests: 42 files, 545 passed, 1 skipped) green; scoreboard the same as the stored
  figures.
