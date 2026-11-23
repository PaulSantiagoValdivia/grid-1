# 2026-11-22: one printable sheet at a true scale (SHT-6)

## For people

- `grid sheet --scale 1:100 --paper A4` writes one floor as a drawing to print and measure (SHT-6):
  a vector PDF, an SVG and a PNG, at a true scale on A4 to A0, in the technical look with walls
  joined, dimensions along the walls and room sizes (`--room-sizes off` leaves them out), with a
  scale bar, a caption, the north arrow, a title block (project, drawing, scale, date, status) and
  the label "General guidance, not your local rules". Text is sized in millimetres on the paper.
  Printed at 100%, a 10 m wall at 1:100 measures 100 mm. Left out, the scale and paper are the
  largest scale and smallest paper the floor fits; a floor too large for the paper is refused
  with what fits. It runs the same on Linux, macOS and Windows.

## For agents

- No new code in the record. No plan field (C32 is unused).
- `grid_sheet` takes layout `drawing`, with `scale` (N in 1:N), `paper` (`A4` to `A0`), `floor`
  and `roomSizes`; these four are refused with layout `client` or `check`. It writes
  `exports/<name>-drawing.pdf`, `.svg` and `.png` and answers with the PNG as its image; its data
  adds `svg`, `png`, `scale` and `paper` (null for a client or check sheet), and `pages` holds one
  page of kind `drawing`.
