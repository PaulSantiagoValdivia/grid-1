# WRT-8: compare two versions by what stands where, as a command and a tool from a start marker

Card: "`grid diff` and a diff tool compare two versions of a plan by what stands where in the
building, not by ids": a short verdict first, room by room; the changes one line each; the
issues; a scope check against the rooms the agent meant to edit; a three-colour picture. The
earlier version is the last one in git or a start marker the agent set. Lab evidence WR-8, WR-21,
Y-4, RT-8, U-4 (and U-5 for the issues), CP1 for the picture.

## Done when

| Item | Where it is shown |
|---|---|
| 1. The same building under new ids compares as 0 changes, with one line saying how many ids were renamed | `compareBuildings` (`packages/floorplan/src/geometry/diff/building.ts`) on `alignPlans` (`place.ts`). Test: `geometry/__tests__/diff-building.test.ts` "the same building under new ids" (the two-bedroom flat with every id new, every wall the other way round, the lists reversed, the origin 0.15 m away and points slipped 4 mm: id diff 56, by place 0, "Same building, 28 ids renamed (9 walls, 13 openings, 6 rooms)"). Lab numbers below |
| 2. After a one-number edit on a rooms-first flat, at most two change lines, and the kitchen door stayed where it was | Rooms-first plans (both with `written`) are compared by rooms and openings. Tests: `diff-building.test.ts` "a one-number edit…" (id diff 23 with "moved 4.40 m"; by place exactly two lines, `door-kitchen` "stayed where it was, in "Hall" and "Kitchen", on the wall that replaced its own"), and `cli/src/versions/__tests__/diff.test.ts` through `grid write`, `grid mark`, `grid write --replace`, `grid diff --json` |
| 3. Splitting a room and merging it back compares as 0 changes (U-4), and a door that now joins other rooms is named in the summary | A room's wall list compares as a ring (`sameRing`, `props.ts`); `doorsThatChangedRooms` (MSG-14) on the aligned plans leads the issues. Tests: `cli/src/versions/__tests__/diff.test.ts` "names the door that now joins other rooms, and reads a split merged back as no change" (`grid edit split`, `grid diff`, `grid edit merge`, `grid diff`), `diff-building.test.ts` "a room list read as a ring", `diff-rooms-floors.test.ts` |
| 4. With no `.git`: `grid mark start`, an edit, `grid diff --since start` works, and the tool returns the summary and a three-colour picture | `versions/markers.ts`, `command/diff.ts`, `mcp/diffTools.ts`. Tests: `diff.test.ts` (the folder is checked to have no `.git`), "answers through the tools with the summary and a three-colour picture" (`grid_mark_start`, `grid_split_room`, `grid_diff` with an image); the picture: `viewer/src/picture/__tests__/comparison.test.ts` |
