# WRT-2: write a plan rooms first and get the walls worked out

Card: "Write a plan rooms first and get the walls worked out". Lab evidence WR-20, AB-2, AA-10,
AR-10 (merged from ARE-11). The owner's decision on WRT-1 stands: rooms-first is the main way
agents write, the walls stay in the file and stay editable.

## What was built

- `packages/floorplan/src/rooms/` (pure): `compile.ts` turns rooms text into a plan, a port of
  the lab's prototype compiler (lab Q, `roomsc.py`, written by a lab agent for this project);
  `read.ts` reads any plan back as rooms text; `stamp.ts` keeps what the plan records about how
  it was written; `answer.ts` is the answer both the command and the tool give. The language is
  in the header of `compile.ts` and in the README.
- `grid write <plan.rooms>` and the tool `grid_write_rooms`; `grid describe --as rooms` and
  `grid_describe` with `as=rooms` for the read-back.
- The plan comparison (`quantities/compare.ts`) names every change of wall height or thickness.
- The server instructions, the plugin's skill and the README name rooms-first as the main way
  to write and the plan file as the source of truth.

Before porting, the TypeScript compiler was run on the lab's nine rooms files and gave the lab
compiler's JSON exactly, except where I changed the rules on purpose (ids on several floors,
floor heights; see the decisions).

## The done-when items

1. **Eight lab buildings match their originals in walls, areas and checks; the two-storey house
   5 of 5.** `rooms/__tests__/buildings.test.ts`, with the originals and the rooms files in
   `packages/floorplan/fixtures/rooms/`. For each building, per floor: the wall footprint on a
   1 cm grid (all walls, outside walls, and wall heights cell by cell) differs by under
   0.001 m²; every opening of the original on a wall it has is in the same place, size, hinge
   and swing; every room's area as Grid measures it, by floor and name, is within 0.005 m²; and
   the drawing check's and the local rules check's codes are the same, as many of each. The
   two-storey house gives 5 of 5: its rooms file now keeps the original's undecided door swing
   (`no-swing`) and its two faulty windows, written raw, so the checks find the same two
   problems. The same test shows the lab's own two-storey file still giving 3 of 5, so the
   comparison can fail.
2. **Rooms text to plan to rooms text to plan is lossless; the school's walls stay at 3.00 m.**
   `rooms/__tests__/rooms.test.ts`: for all eight buildings `diffPlans` reports 0 changes, and
   every one reads back rooms first (no floor in raw lines). The school plan (lab AB, `team.json`,
   copied as `fixtures/rooms/school.plan.json`) reads back rooms first with
   `walls outside 0.3 inside 0.15 height 3`, writes back with every wall at 3.00 m, and 0
   changes. Every hand-drawn original also writes back with 0 changes (and the same room uses,
   hinges and swings, which `diffPlans` does not compare). The comparison names a height change
   now: `grid write` of a read-back with `height 2.7` for `height 2.6` answers "but 9 walls
   another height (2.60 → 2.70 m)" (`command/__tests__/write.test.ts`).
3. **'3 x 4 inside' is 3.00 x 4.00 m between faces, the answer states the basis; '8 x 10
   outside' is 8.00 x 10.00 m to the outside faces.** `rooms.test.ts`, "sizes and what they
   measure to". The answer says, for each room, "7.40 x 9.40 m, 69.56 m² inside (written 8.00 x
   10.00 to the outside faces)", and the default once: "Sizes are to the inside faces unless a
   room says otherwise (the default)."
4. **Overlaps and gaps refused naming both rooms; a hand edit to a derived part refused with
   its own code; the guide names the source of truth.** Overlap `rooms/overlap`, gap
   `rooms/gap`, touching `rooms/touching`, each "Rooms 'a' (line n) and 'b' (line m) …"
   (`rooms.test.ts`, and through the command in `write.test.ts`). A room boundary edited by hand
   in a plan written rooms first is `room/derived-edited` from the drawing check
   (`rooms.test.ts`, `write.test.ts`). The server instructions (`writeRooms.test.ts`) and the
   plugin's skill (`listing.test.ts`) name rooms-first and the plan file as the source of truth.

## The schema change

One optional top-level field, at the end of `FloorPlanFieldsSchema`:

```
written: { from: "rooms", revision: "<16 hex>", boundaries: { "<room id>": "<8 hex>" } }
```

`revision` is the plan's fingerprint as Grid wrote it from rooms text (floors, walls, rooms and
openings, numbers to 0.1 mm); `boundaries` each room's boundary fingerprint. Optional, never
defaulted, version 1. One that cannot be read is read as unstated (`.catch(undefined)`), so a
damaged stamp never refuses a plan. The sheet's coverage table says it is not shown.

## Expected figures and tests changed

- **Tolerance table**: four entries added, none changed. `roomsWallWidest` 0.6 m (the widest
  gap between two rooms that is one wall), `roomsTouch` 0.02 m, `roomsFaceStep` 0.002 m (the
  lab's figures), and `roomsWritten` 1e-4 m (arithmetic: lengths agree to 0.1 mm when a
  read-back is checked). The README table lists the first three. The tolerance test now also
  scans `src/rooms/`.
- **Tools test**: `grid_write_rooms` added to the fixed order, first of the tools that change the
  plan, and the "about a dozen" ceiling raised from 14 to 15 (see the owner checks).
- **`grid_describe`'s output schema**: `length` and `for` may be null (with `as=rooms`), and `as`
  is added.
- **The comparison verdict**: walls are now paired by place alone. A wall in its place at another
  thickness used to read as one wall out and one new; it is now one wall "another thickness
  (0.30 → 0.20 m)", and a height change, which used to be said nowhere in the verdict, is named
  the same way ("the same building …, but 15 walls another height (3.00 → 2.70 m)").
  `Comparison` has a new list, `wallsResized`.
- No snapshot changed. The scoreboard: see the results below.

## Decisions for the owner to check

1. **Fifteen tools.** The fixed list had a ceiling of 14. Writing rooms first is the main way to
   write, so it has its own tool; the read-back is an argument of `grid_describe` rather than a
   sixteenth tool.
2. **Which parts are derived.** Only each room's boundary (the walls round it, in order): Grid
   works it out from where the rooms are, and the lab's faults with wall lists out of order come
   from writing it by hand. Walls, opening offsets and wall kinds stay editable, as decided
   (the hybrid). A hand-edited boundary is an `error`, and Grid's errors mean "left out", so the
   room is left out of the drawing until the rooms text is written again or `written` is taken
   out. Grid's own edits (`grid_move_room_side`, `grid_mirror`, `grid_change_opening`, `grid
   tidy`) print the boundaries they change again, so they never read as hand edits.
3. **When a write is refused.** Rooms text with a `based on` line (the read-back writes one) is
   refused when the plan's revision is now another (`rooms/stale`). Rooms text without one is
   refused when the plan was not written from rooms text, or was changed since (`rooms/plan-changed`),
   unless the plan is empty or still `grid init`'s starter plan. Both refusals carry the
   comparison of the plan now with the plan the text would write. `--replace` / `replace=true`
   writes over it. Grid's own edits do not move `revision`, so writing old rooms text after one
   of them is refused, with the difference.
4. **Gaps are refused.** The lab compiled a strip between 0.6 m and twice the outside wall plus
   0.6 m with a warning; the card asks for gapped rooms to be refused, so it is `rooms/gap`.
   Faces a little out of line (sizes that do not add up by 2 mm to 12 cm) stay a warning, as in
   the lab: a step may be meant.
5. **Ids on several floors.** A room's or opening's id gets its floor's id in front only when the
   same id is written on two floors (the lab put the floor in front of every id of a plan with
   two floors). Derived wall names always get it on a plan with several floors.
6. **A floor's `height`** on a `floor` line is written as the floor's stated height (LVL-1) as
   well as on its walls. The lab's originals state none, so a compiled floor differs from its
   original in that key; walls, areas and checks are the same.
7. **Raw parts** are one line of the plan file's own JSON (`raw wall {...}`), not a new
   spelling. They are not refused when they name a wall the plan does not have: they are written
   as given, warned about, and Grid's check names them, so a faulty plan reads back and writes
   back as it is.
8. **The read-back places rooms at absolute positions** (`at x,y`), with the openings measured
   from a room's corner, not by their neighbours. It loses nothing and an edit is plain, but
   moving one room does not carry its neighbours. A read-back that chains rooms ("north of
   kitchen") is a possible follow-up.
9. **A key rooms text cannot say is never dropped.** The read-back checks itself by writing the
   text again and comparing every key of every wall, room and opening, so a field a later step
   adds without a rooms spelling (as LVL-7's `floorOffset` was until this merge) puts that floor
   in Grid's own terms instead of losing it. LVL-7's step is spelt `floor <m>` on a room line
   (`room genkan "Genkan" corridor 2 x 1.5 floor -0.15`). *Owner:* this is the first field
   designed in both spellings after the fact; WRT-1 asks for both at once from now on.
10. **Sizes to centre lines or outside faces** take off the walls each side turns out to have:
   Grid places the rooms, looks at the walls, and places them again until every side has the
   wall it was taken to have (at most eight rounds).

## Not done, or left as it was

- Of the hand-drawn originals, the four-flats plan's floor reads back in raw lines: its mirrored
  flats list their boundaries in an order rooms text does not give. It still writes back with 0
  changes. Every plan written rooms first reads back rooms first.
- Curved walls and rooms with holes (ARE-6, in parallel) have no rooms spelling yet; they read
  back as raw lines, losslessly. ARE-6's new field, when it lands on `main`, needs its rooms
  spelling the same way `floorOffset` got one here.
- AB-2's third fix ("resize-room follows a side made of several walls") belongs to the edit
  tools, not to this card.
- The language takes the lab's words as they were; WRT-1's "both spellings designed together"
  checklist does not exist yet (CNT-1 is not built).

## The checks

Run on the branch with `main` merged in (LVL-7), each under a `timeout`:

| Command | What it printed |
|---|---|
| `npm run build` | `node build.mjs`, exit 0 |
| `npm run typecheck` | `tsc --noEmit` in each package, exit 0 |
| `npm run lint` | `eslint packages scripts scoreboard`, no problems, exit 0 |
| `npm run check:licenses` | "Checked 363 licences in package-lock.json: none is GPL, LGPL, AGPL, MPL, EPL.", exit 0 |
| `npx vitest run --exclude '.claude/**'` | 187 test files, 4124 tests passed, exit 0 |
| `npm run scoreboard` | Every count the same as the stored figures (197, 386, 15, 2, 5, 727, 95), "Same as the stored figures.", exit 0 |

An earlier full run, while four sessions were testing at once (load average over 100), lost
three tests to the 60 s timeout; two of them were real (`describe`'s help text and the server's
tool count, both updated here) and all three pass run again.
