# 2026-11-22: walls by kind, detail at 1:50, tints with a key, light files and contrast (SHT-10)

## For people

- Drawings read more clearly (SHT-10). Outside, inside and partition walls are each drawn their
  own way: on screen near-black, mid grey and lighter grey; in the technical look three tones
  inside the black outline, a partition with a lighter pen. A window above the plan's cut (its
  sill at 1.2 m or higher, or a high-level window) is drawn dashed. In the technical look at 1:50
  and larger, each wall whose type names a material is hatched, one hatch per material and listed
  in the key, and doors and windows get their frames, a window two panes of glass and its sills.
  `grid draw --colour finish` tints each room by its floor finish, and a drawing tinted by use or
  finish, or hatched by material, now always carries its key. Every look's text and lines are held
  to a contrast ratio (4.5 to 1 for text, 3 to 1 for lines and marks), so some soft greys, the
  dividing lines and the warning colour are a little darker. A file is always on light paper,
  whatever the screen's theme: `grid draw --look dark` is refused, and only the preview page's own
  drawing follows a dark page.

## For agents

- No new code in the record. No plan field: these are drawing options of the looks (C27 is unused).
- `grid_view` with `look` `dark` now draws the working look, on light paper, and says
  `working (asked as dark)`; a 3D picture is always light. `grid_view` with `colour` `use` now
  draws the key it lists. `grid_preview_sync` still draws the page's own 2D drawing in `dark` for
  a dark page, and hands on a light picture.
- In an SVG, each wall carries `data-wall-kind` (`outside`, `inside`, `partition`) and a window
  above the plan's cut `data-above="true"`; at 1:50 and larger in the technical look, a drawing
  adds `wall-hatches` (each `wall-hatch` with its `data-material`) and `opening-detail` (each
  `frame` and `sill`), and a window's glass is two `window-glass` lines.
- New tolerance entry `sillProjection` (0.03 m); `frameFace`, `frameDepth` and `glassThickness`
  now also size the plan's detail.
