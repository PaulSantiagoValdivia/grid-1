# VEW-2 review: a picture with the numbers, and an id on every part

For the owner. Lane B built VEW-2 (step 3) in `packages/viewer` and `packages/cli`.

## What it adds

- **The check view** (`@ongrid/viewer`, `LabelStyle.ids`). Each room's label reads its name and
  then its id in brackets, `Kitchen [kitchen]`, and each door, window and doorless opening has its
  id just off the middle of its wall, on the side its normal points to. The ids are those of the
  plan file. Every text is upright, as on the ordinary drawing: nothing in the picture is rotated.
  The label of a room is placed with its id included, so it still keeps clear of the swings,
  walls and dimension numbers.
- **`grid_view kind=plan ids=true`.** The PNG, as before (the sample flat's is far under 1.5 MB),
  and, in the text, after the usual line: a line on how to read the ids, the counts on the floor
  (rooms, doors, windows, doorless openings), the agent's description of the plan
  (`grid describe --for agent`: every room with its id, name, use and area, every opening with
  the rooms it joins), and the drawing's problems, the first eight quoted. `data.ids` lists the
  ids drawn. `ids` with `kind=3d` or `eye` is refused by name, and an unknown floor names the
  floors there are (as before).
- **`grid draw --ids`** gives a person the same drawing, SVG or PNG. Refused with `--3d`.

Tests: `packages/cli/src/mcp/__tests__/checkView.test.ts` (the set of ids drawn equals the plan's;
no rotation; the ordinary drawing has no ids; under 1.5 MB; every id in the text; the counts;
`grid draw --ids` gives the same SVG).

## Against done_when

1. *An image under 1.5 MB inside the result plus a link to the file, and text naming rooms, areas,
   what each door joins, counts and warnings.* Done except **the link**: `grid_view` is a reading
   tool (read-only hint) and writes no file. The person gets the same picture with `grid draw
   --ids --png --out <file>`; a tool that writes it into `exports/` and returns the path would be
   a second, writing tool, or a `save` argument that changes the hint. Left for a decision.
2. *Every room, door and window id is drawn and appears in the text; all text is upright.* Done.
3. *An unknown floor or room is an error naming what exists.* Already so (CMD-5); tested again.

## Decisions taken without you

- The tool is `grid_view` with `ids`, not a new `grid_look`: the tool server keeps 13 tools in a
  fixed order, and `grid_view` already returns the picture with its numbers.
- Ids are drawn as the file holds them, not shortened to letters and numbers (R1, D2): the
  roadmap asks for ids "that match the file", and a short code would need a key in the text.
- The problems listed are those of the whole plan, said so ("on every floor"); the counts and the
  ids are of the floor drawn. The description covers every floor.

## Still open

- A room whose label finds no clear spot at all is drawn without a label, and so without its id
  (the same as the ordinary drawing). It still appears in the text.
- Ids can overlap each other where openings are close together; nothing moves them apart yet.
- The link to a file (above).
