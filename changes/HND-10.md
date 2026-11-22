# 2026-11-22: a trace image placed, scaled and drawn under the plan (HND-10)

## For people

- A scan, photo or sketch can be traced over: the plan's `referenceImage` now says which floor it
  lies under, where its top-left corner lies (`at`), its turn (`rotation`) and its scale, stated
  (`scale`) or set from two points on it and the known length between them (`calibration`).
  `grid draw` and the pictures an agent gets draw it under the plan, over the rooms' fills and
  under every line, and say where it lies and at what scale, or why it is not drawn (HND-10).
- A trace image must be a `.png`, `.jpg` or `.jpeg` inside the project folder: a plan naming
  anything else (a script, a page, another kind of file) is refused, as one naming a path out of
  the folder already was (HND-10).

## For agents

- `grid_view` (`kind=plan`) draws the plan's trace image under the floor it lies under, and its
  text gains one line on it: its size in pixels, its scale and where that came from, where its
  top-left corner lies and how pixel (u, v) maps to a point of the plan; or why it is not drawn
  (not in the folder yet, not a PNG or JPEG, too large, under another floor or a floor the plan
  does not have). The view frames the picture with the drawing.
- Every tool and command that reads a plan refuses one whose `referenceImage.path` does not end
  in `.png`, `.jpg` or `.jpeg`, naming the path and the project folder.
- `referenceImage` takes `floor`, `at`, `rotation`, `scale` and `calibration` (C31). A
  calibration with two equal points, a length of 0, or a scale beside a calibration is read as
  `plan/value-left-out` on that field alone; the image keeps its path.
- No new code in the record.
