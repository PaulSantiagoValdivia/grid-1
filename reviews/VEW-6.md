# VEW-6 review: boxes, one floor per picture, and a crop

For the owner. Lane B built VEW-6 (step 3) in `packages/viewer` and `packages/cli`.

## What it adds

- **Boxes.** Every `grid_view kind=plan` answer carries `boxes`: for each room, door, window,
  doorless opening and wall drawn, its id, kind and box in image pixels from the top-left corner
  (`x`, `y`, `width`, `height`, to a tenth of a pixel), cut to the image. A room's box is the
  outline the picture draws, an opening's its hole through the wall, a wall's its body. They are
  worked out from the plan in metres (`packages/cli/src/draw/partBoxes.ts`) and put through the
  picture's own framing, so they hold for a crop too; a part outside a crop is left out.
- **One floor per picture.** A plan picture already showed one floor; the answer says which.
- **A crop** (`crop`): a room, door, window or wall id, or a room's name in any case. The picture
  frames that part, at least 2 m each way about its middle, so a door is shown with its walls. Two
  rooms on the floor with the name asked are refused, naming their ids; a name or id that is
  nothing on the floor is refused naming the floor's rooms. `crop` with `kind=3d` or `eye` is
  refused by name. The viewer takes the frame as `PictureOptions.frame` (plan metres); labels and
  lines keep their size in pixels, so a crop is a closer look, not a larger copy.

Tests: `packages/cli/src/mcp/__tests__/cropView.test.ts`. The ids of the boxes are the plan's
rooms, openings and walls; each opening's box holds the point where the check view draws its id
(its drawn centre on the wall's face); a crop by id, by room id and by room name each puts that
part in the middle of a closer picture; the refusals.

## Decisions taken without you

- Crop by box (a rectangle the agent picks) is not taken: the tool server keeps no state, so a
  box in the pixels of an earlier picture would need that picture's framing sent back. A crop by
  id covers what the lab asked for (SI4, SI5); a box in plan metres can be added when asked.
- Walls are in the boxes, though the roadmap names rooms, doors and windows: an agent asked about
  a wall needs to find it too.
- A room's box is drawn from its outline, so its label, which may sit outside the room with a
  leader, can be outside the box. The test checks the openings' drawn centres; for rooms, the box
  holds the room, which is what a crop shows.

## Still open

- The boxes of rooms' labels themselves (where the name is written) are not returned.
- `grid draw` takes no crop yet.
