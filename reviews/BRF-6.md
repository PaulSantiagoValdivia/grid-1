# BRF-6 review: from a list of rooms and sizes to a first layout

For the owner. Grid now takes the rooms of the brief beside the plan (BRF-1), with their sizes
and the rooms they should touch, packs them into rooms text, writes it as any rooms text is
(WRT-2), and says each size it could not keep in the brief's own words and by how much. A door
written between two rooms that do not touch is refused with the line that would make them touch.
No new tool and no new message code.

## Findings reproduced first (main at 26e928e1, before any change)

- **WR-19, the estate agent's five rooms.** The lab drew the listing twice
  (`I/scenarios/s4-listing/attempt-1-exact-sizes.json` and `attempt-2-tidy-outline.json`). The
  listing's own text is not in the lab data, so the five sizes are read from the exact-sizes plan
  as Grid measures it, to the faces of the walls: Bedroom 1 4.10 x 3.20, Kitchen 2.40 x 3.00,
  Bathroom 1.70 x 2.00, Lounge 4.50 x 3.60, Bedroom 2 2.70 x 3.10. Written as BRF-1's brief and
  read against the two plans on the unchanged code: the exact-sizes plan meets all five; the
  tidy plan misses three, Kitchen drawn 2.40 x 3.20 (0.48 m² more), Bathroom 1.70 x 3.20 (2.04 m²
  more), Bedroom 2 2.70 x 3.60 (1.35 m² more): the card's "0.48 to 2.04 m²". Nothing in Grid went
  from the list to a layout: `grid_write_rooms` with `layout` answered `grid_write_rooms takes
  plan, rooms and replace, not "layout".` Both are in
  `packages/cli/src/brief/__tests__/layout.test.ts`; the second test failed on the unchanged code.
- **AB-11, a narrow room lined up on the wrong side.** Rooms text with a corridor, a bedroom west
  of it and a narrower bedroom north of that (lined up west, the default) and a door between the
  narrow bedroom and the corridor: refused `rooms/no-shared-wall`, "'bed2' and 'corridor' do not
  share a wall … 'bed2' shares walls with: bed1.", with nothing on what would fix it.
- **Found on the way (pre-existing on main).** Rooms text with no height on its `walls` line was
  written with every wall at `height: 2.7` and `unstated: ["height"]` in the file; `grid_check`
  then named `plan/unknown-field` ("unstated") on every wall: seven lines for two rooms. WRT-6 meant
  such a wall to be written with no height. A first layout writes no height, so it met this at
  once.

## Done when

**"The estate agent's five rooms produce a first layout plus a list of each size not kept and by
how much (WR-19)."** `packages/cli/src/brief/__tests__/layout.test.ts`, "done when: the five
rooms produce a first layout, with each size not kept and by how much": the brief written, then
`grid_write_rooms plan=plan.json layout=tidy`. The answer, as the test holds it:

```text
First layout from the brief ("plan.brief.json"): 5 rooms in two rows along "Hall", 7.00 x 8.90 m inside the outside walls, in a rectangle. It places no door or window: add them to the rooms text.
Added "Hall", 1.10 m wide (Grid's own size, not a code figure): the brief names no corridor for the rooms to stand along.
Sizes not kept (3):
  met (must): "Kitchen" inside asked 2.4 x 3, drawn 2.40 x 3.10 m: 0.24 m² more.
  missed (must): "Bathroom" inside asked 1.7 x 2, drawn 1.70 x 3.10 m: 1.87 m² more.
  missed (must): "Bedroom 1" inside asked 4.1 x 3.2, drawn 3.30 x 4.50 m: 1.73 m² more.
The rooms text written, to change and write again:
  # A first layout from the brief (BRF-6), in a rectangle: rooms that do not fit it are made larger. Change it and write it again.
  room hall "Hall" corridor 7 x 1.1
  room kitchen "Kitchen" kitchen 2.4 x 3.1 south of hall align west
  room bathroom "Bathroom" bathroom 1.7 x 3.1 east of kitchen align north
  room bedroom-2 "Bedroom 2" bedroom 2.7 x 3.1 east of bathroom align north
  room bedroom-1 "Bedroom 1" bedroom 3.3 x 4.5 north of hall align west
  room lounge "Lounge" living 3.6 x 4.5 east of bedroom-1 align south
```

The same test holds that the plan is an ordinary rooms-written plan (`written` set, six rooms),
that `grid_check` gives only `floor/no-exit` and `room/no-door` (no doors are placed), that
`grid_describe as=rooms` reads it back as rooms text that writes again, and that writing the
same brief again gives the plan file byte for byte. `grid_areas` on it: net 59.83 m², gross
internal 62.30 m², gross external 72.20 m² (the lab's two plans: 60.83 and 65.00 m² against the
listing's 58 m²). Three sizes not kept, 3.84 m² in all; the lab's tidy outline left 3.87 m² in
three rooms. `layout=sizes` keeps all five (same file, "keeps every size with layout=sizes").

AB-11: the same file and `packages/floorplan/src/rooms/__tests__/layout.test.ts` hold the
refusal "… With line 3 written 'room bed2 "Bedroom 2" bedroom 2.0 x 3.5 north of bed1 align
east', they share a wall.", the fix as data on the problem (`fixes: [{ line: 3, text }]`), and
that writing that line in place writes the plan; a door no alignment would help gets no fix.

## What changed

1. **The packer** (`packages/floorplan/src/rooms/layout.ts`, pure, `layOut`): rooms in two rows
   either side of an east-west hall (one row for fewer than three rooms and no corridor), each
   room turned as needed; every way of sharing the rooms between the rows and every depth a row
   could take is tried, keeping the most wishes to touch held (must 3, should 1, avoid broken
   -3), then the smallest rectangle, then the squarest, then the first in the brief's order; a
   row's order is chosen for the wishes (rows of up to 6). `tidy` stretches each room to its row's
   depth and the shorter row's changed (else largest) room to the length left over; `sizes` keeps
   every size. It writes rooms text with relative placements (`south of hall align west`, `east
   of kitchen align north`), and reports each room's drawn size and whether it was kept.
2. **From the brief** (`packages/cli/src/brief/layout.ts`, `writeLayout`): the brief's room
   wishes as rooms (named wishes `count` times; use wishes topped up to their count, named after
   the use; `avoid` and count 0 placed nowhere; a room with no size not placed and named; the first
   corridor the hall), the touch wishes, then `writeRoomsIntoProject`, so the write is refused or
   allowed exactly as rooms text is. Sizes not kept are the brief's own lines (BRF-1) for the rooms
   changed, with the change of area.
3. **Exposed** on `grid_write_rooms` as `layout` (`tidy`, `sizes`) in place of `rooms`, which is
   no longer required (one of the two), with `layout` in the receipt; on `grid write --layout`.
4. **The door's alignment** (`packages/floorplan/src/rooms/compile.ts`): for each
   `rooms/no-shared-wall`, the other alignments of the room written last, then of the other, are
   tried by compiling the text with that line changed; the first with which that door line is no
   longer refused, and no problem is that was not before, is offered in the message and as
   `RoomsProblem.fixes` (`{ line, text }`). `ROOMS_WALLS` names the default wall thicknesses the
   compiler and the packer share.
5. **Heights not stated stay out of the file** (`packages/cli/src/command/write.ts`, `statedWall`
   on the walls written).
6. **Tolerances**: `layoutHall` (1.1 m, "Grid's own size, not a code figure"), `layoutRooms`
   (10) and `layoutRowOrders` (6), in the table and `docs/tolerances.md`.
7. **Docs**: `docs/brief.md` ("A first layout from the brief"), `docs/rooms-first.md` (the door's
   alignment, and a pointer), `docs/tool-server.md`, `docs/commands.md`, `docs/result-contract.md`
   (receipt and changelog), `CHANGELOG.md`.

## Changed test expectations

- `floorplan/src/geometry/__tests__/tolerances.test.ts`: the entries that say "Grid's own size,
  not a code figure" gain `layoutHall` (1.1 m), and the test's name says so: it is a size a
  reader could take for a requirement (MSG-18).
- `cli/src/command/__tests__/grid.e2e.test.ts`: the built file's cap 550 kB → 560 kB. BRF-6 takes
  the bundle from 539,491 to 551,290 bytes, no new dependency; trimming the new descriptions and
  table words saved 300 bytes, not enough. Main has since raised the cap to 600 kB (CNT-17,
  e199961e): on merge, main's cap and comment stand.
- `cli/src/command/__tests__/everyPath.e2e.test.ts`: two slots added, not changed: `grid write
  --layout tidy --plan <path>` and `grid_write_rooms` with `layout`. `writeLayout` resolves the
  plan's path first, so the refusal names it rather than the brief beside it.
- New tests: `cli/src/brief/__tests__/layout.test.ts`, `floorplan/src/rooms/__tests__/layout.test.ts`,
  and in `cli/src/command/__tests__/write.test.ts` "keeps a wall height the text did not state out
  of the plan file" (it fails with the old line).

## Checks

Run once each, in order, on a laptop shared with other sessions (load average about 240),
`--maxWorkers=2 --minWorkers=1`, at 30396421.

| Gate | Result |
| --- | --- |
| `npm run build` | passes; `packages/cli/dist/grid.mjs` is **551,290 bytes** (26e928e1: 539,491) |
| `npm run typecheck` | passes |
| `npm run lint` | passes |
| `npm run check:licenses` | passes: 363 licences, none GPL, LGPL, AGPL, MPL or EPL |
| Full suite (`timeout 1500 vitest run --exclude '.claude/**'`) | **stopped by the 1,500 s timeout** after 151 of 294 files, all of them passing, no failure printed. The other 143 files run next, alone, under the same timeout: 142 passed, 1 failed, 990 of 991 tests, in 1,335 s. The one: `diff-size.test.ts`, "diffs 1,000 entities … well inside a second" (19.8 s under the load); rerun alone, 4 of 4 passed. So every file passed, none needed a change |
| `npm run scoreboard` | **Same as the stored figures**: rooms measured wrong 197, damage silent 278, turns 19 of 67, mistakes 5 of 9, checks 20 of 42; guards 735 and 95. Nothing to store |

## For the owner

1. **Exposed on `grid_write_rooms` and `grid write`, not a new tool.** The tool list is at its
   cap of 30, and a layout is one more way to write rooms text. A tool of its own
   (`grid_first_layout`) would be a reversible change if agents miss it.
2. **The two shapes, and no default.** The caller chooses `tidy` (a rectangle, sizes stretched)
   or `sizes` (every size, outline stepping). Examples and docs show `tidy` first, as WR-19's agent
   chose. Which one should lead is yours.
3. **A hall is added** when there are three rooms or more and the brief names no corridor: 1.10 m
   wide (`layoutHall`, the lab's own hall width), said in the answer. The packing needs it: it is
   what every room stands along.
4. **Wishes to touch come before area.** A `should` touch between Kitchen and Lounge puts them in
   one row and costs a larger rectangle (7.80 x 9.00 m, three rooms 2.70 to 4.32 m² more, against
   7.00 x 8.90 m without it). The weights (must 3, should 1, avoid -3) are mine.
5. **"Sizes not kept" lists every room the packing changed**, met or missed: Kitchen 0.24 m² more
   is within BRF-1's 5% and reads "met (must)". Listing only the missed ones is one filter.
6. **`at_least` and `at_most` are packed at that figure**; a room given only an area takes its
   row's depth, which can make a long thin room.
7. **The door's fix is data only in the core.** A tool's refusal is text, by the result contract,
   so `grid_write_rooms` gives the corrected line in its message only; `RoomsProblem.fixes` holds
   it for code. Allowing structured data on a refusal would be a contract change. Only alignments
   are tried, not `shift`.
8. **Plans written before this keep their `unstated`** and the `plan/unknown-field` note until
   written again; the reader does not read a file's own `unstated`, as WRT-6 decided.
9. **The packing's limits**: one floor; one straight east-west hall with a row on each side (no L,
   T or U plans, no rooms reached through other rooms, no corridor that turns); rectangles only;
   no orientation, sun, plot, footprint or street (the footprint wish is reported, not packed to);
   no doors or windows; walls at rooms text's defaults (0.3 m outside, 0.1 m inside); at most 10
   rooms (`layoutRooms`; 10 rooms take about 0.2 s here); every order tried only in rows of up
   to 6; rooms in the two rows never touch each other across the hall; and a room whose name holds
   both kinds of quote is not placed.
10. **The bundle cap** (see above).

## Not built

- Doors and windows in the layout, and a front door.
- Packing to the footprint or the plot, orientation to north or the street, more than one floor.
- Plans other than two rows along one hall; rooms that are not rectangles; more than 10 rooms.
- Structured data for the door's fix in a tool refusal, and `shift` as a fix.

## After merging main at 4fe29edc and 90a933b1

Merged COD-8, CNT-17 and LVL-9 (ef73f5ae), then HND-11 (b69c913a). Conflicts: both changelogs
(every entry kept), `docs/commands.md` (`grid write --layout` beside COD-8's firm standards on
`grid check`), the bundle cap in `grid.e2e.test.ts` (main's 600 kB from CNT-17 kept, BRF-6's share
noted), and with HND-11 `write.ts` (both imports: BRF-6's unstated-height fix and HND-11's taped
rows), `writeTools.ts` (`grid_write_rooms` answers both `layout` and `taped`), `tolerances.ts`
(both sets) and the contract's write-tools row (both fields). After the merges: build, typecheck
and lint clean; the tests either side touched, in two runs, 59 files (676 passed, 1 skipped) and
56 files (826 passed); scoreboard "Same as the stored figures". No second full suite.
