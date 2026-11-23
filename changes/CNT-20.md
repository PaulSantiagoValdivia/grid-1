# 2026-11-22: a library of fixtures, furniture and typical rooms, placed by name, and one registry of kinds (CNT-20)

## For people

- Grid has a small library of plain fixtures and furniture with real sizes, and typical rooms
  made of them: a WC, basins, showers, baths, kitchen runs, single and double beds, side tables,
  desks, dining tables, chairs, sofas, a wardrobe and drawers, and a bathroom, a cloakroom and
  single and double bedrooms. Each size is Grid's own, not a code figure, and each item keeps
  the clear floor in front of it it needs. "Will a double bed and two side tables fit" is now
  answered the same way every time: `grid_place_item` (`grid edit place`) puts an entry in the
  plan by name and says whether it fits, and `grid_measure what=fit name=double-bed` tries its
  size. An office keeps its own entries, such as its standard bathroom, in a `library` folder
  beside the plan; one placed from there is copied into the plan, so the plan reads the same
  without the folder (CNT-20).
- Beds, tables, chairs, sofas and storage are kinds of item now, drawn with their own plain
  symbols. They are counted and measured as fixtures are, and take no free floor: they can be
  moved.
- The DXF writes each fixture and piece of furniture as a block, as it does doors and windows:
  one block per library entry or kind and size, so a CAD program can count them and swap one
  for all.
- Grid's checks now say when two items stand in each other and when something stands in the
  clear floor an item keeps in front of it.

## For agents

- The plan format holds `library` (convention C30): entries `{ name, kind, size, height,
  clearance?, label?, source? }`. An item may name one in `library` and leave out its `kind`,
  `size`, `height`, `clearance` and `label`: the reading fills them from the plan's own entry,
  else Grid's built-in one, and lists them in the item's `fromLibrary`, which is Grid's reading
  only and never written back. An item may state `clearance`, metres of clear floor kept in front
  of it, as wide as it is.
- The item kinds are now `toilet`, `basin`, `shower`, `bath`, `kitchen-run` (fixtures) and `bed`,
  `table`, `chair`, `sofa`, `storage` (furniture), and any kind another program adds through the
  kinds registry. A table or a chair is no longer `item/unknown-kind`.
- New tool `grid_place_item`, after `grid_square_scan`: `name`, `x`, `y`, `turn`, `floor`, `id`,
  `out`. It answers as every change does, with `placed` (the new ids), `fits` and `worthALook`.
  33 tools. New verb `grid edit place`.
- `grid_measure` takes `what=library` (the entries, with `name` one of them) and `name` for
  `what=fit` instead of `width` and `depth`.
- The fixture schedule's rows carry `group` (`fixture` or `furniture`) and `library`. Furniture
  takes no free floor.
- The DXF's fixtures are block inserts (`GRID-DOUBLE-BED-1400x2000`, `GRID-TOILET-400x650`) on
  the fixtures layer, no longer loose polylines.
- New codes, all worth a look: `item/unknown-library` (an item names an entry no library holds;
  it is drawn from what it states), `item/overlap` (an item stands in another) and
  `item/clearance-blocked` (a wall or an item stands in the clear floor an item keeps). A kind
  added through the registry may give lines of its own codes, worded in its own words.

## Codes

| `item/unknown-library` | {thing} names a library entry no library holds | a name from the plan's own library or Grid's built-in one |
| `item/overlap` | {thing} stands in another item | every item clear of the others, against them at most |
| `item/clearance-blocked` | Something stands in the floor {thing} keeps clear | the floor in front of it, as wide as it and as deep as its clearance, clear of walls and other items |
