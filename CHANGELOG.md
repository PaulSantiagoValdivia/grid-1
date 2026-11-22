# Changelog

What changed in Grid, for the people who use it. Agents have a changelog of their own, beside
the result contract in [docs/result-contract.md](docs/result-contract.md), which says what a
tool's answer holds and what may change in it. [RELEASING.md](RELEASING.md) says how a version
is cut.

A change people will notice adds a line under "Unreleased", in plain words: what you can do now,
or what works differently. The release step turns "Unreleased" into the release's section and
records which versions of the result record and the plan format it carries.

Every report Grid gives is labelled "General guidance, not your local rules". No release makes
Grid say that a plan complies with anything.

## Unreleased

- A survey can be drawn from its own numbers (HND-11). A wall may be placed by a face (`"face": "left"` or `"right"`), with its thickness left out: a thickness guessed later grows away from the room, so guessing the outside walls 8 cm thicker no longer changes an inside size. A plan keeps what was taped on site in `taped`, a room's side along a wall or a diagonal between two corners, and `grid check`, `grid_check` and every change print each one taped against drawn, naming the ones that differ (`room/taped-differs`). A plan kept at survey coordinates states a point near the building as `site.origin`: the far-from-origin warning measures from it, the IFC is written from it, and the GLB holds the model near zero in one node moved by that offset, every point within 1 mm of the plan.
- A 3D view can be asked for the way a person describes it: from a bearing or a side or corner, looking down so many degrees, from so far or with the eye so high, at a room, with a lens in millimetres, and moved with "a bit lower and more from the left" in one step. Every 3D picture comes with its camera, which says whether it stands in a room or outside any room. A view can be saved by name with the plan (`grid_save_view`) and called up again, the same, by an agent (`grid_view view=…`), by you (`grid draw --view …`) or in the app's 3D view; it is stored as Grid's setting and as the camera the open BCF format writes (VEW-3).
- "Which rooms get the sun" has an answer as a table: `grid_measure what=sun` gives each room's window walls, the way each faces (a bearing and a point of the compass, by the plan's north or, said first, the top of the drawing), the window area against the floor area, and how deep the room runs from each window wall. It is geometry, not a daylight result, and says so on every line (BRF-5).

- A floor can state its roof: flat, mono-pitch, gable or hip, with an eaves height and a pitch or a ridge height (LVL-6). Its walls are cut to the roof, so an attic's gables are gables in the 3D view, the OBJ, the glTF and the IFC, and a door or window whose top would stand above the roof is refused with the height that fits. `grid_areas` gives each attic room's floor with at least 1.5 m and at least 2.2 m of headroom, Grid's own bands; the IFC holds the volume under the roof, in its bodies and in the base quantities of its walls, spaces and roof slab; rooflights are windows in the roof. Dormers are not supported yet, and the plan says so.
- Keep what the person asked for beside the plan, in `plan.brief.json`: room areas and counts, inside sizes, the footprint, rooms that must or must not touch, and their own figures such as a door width, each with how much it matters (must, should, avoid), their words, and whether they said it or the agent assumed it. The agent writes it in one call, `grid_write_brief`, before the first room. After every change Grid says each line met or missed, as "asked 4.5, drawn 11.93 m²", never as a score; until the brief gives a room a size, a size in its name ("6 tatami", "12 m²") is checked against the room. The first plan written with no brief gets one line saying so (BRF-1).
- `grid diff` (and the tool `grid_diff`) says what a change did, by what stands where in the building rather than by ids: issues first, then room by room, then each change, with a picture in three colours. The same building under new ids reads as no change, with how many ids were renamed. It compares with a start marker set by `grid mark` (or `grid_mark_start`), kept in `plan.markers.json` beside the plan, so no git is needed, or with the last commit in the project's own `.git` (WRT-8).

- The plan says where it will be built, in `site.country` (`US`, `USA`, `United States`, `Spain`…), and `grid check` reads it on its own; `--country` (or `country` for `grid_check`) names another place for one check and takes the same names. With no place stated, room sizes and escape openings are no longer checked against the US figures: the report says so on its first line, with how many lines the US figures would have given. A place Grid does not know is refused, and the report names a place only by Grid's own name for it (COD-3).
- Walls, doors, windows, rooms and floors can carry facts of your own in `properties` (a fire rating, a department, a head count), and a room its number. They are kept through edits and `grid tidy`, listed in the schedules, and written into the IFC (a `Grid_Properties` set) and the DXF (layer `GRID-FACTS`). Three tools ask across them: `grid_fields`, `grid_find` and `grid_count`, and `grid_view` picks out or colours their answers (CNT-9).
- A plan can say where its values came from, given, measured, scanned or assumed, and how sure each is, in its `marks`. What was assumed is drawn dashed and listed under "To confirm" in `grid check`; areas from scanned walls say "from a scan, about ± x%"; `grid edit square` (`grid_square_scan`) squares a scan and says how far each wall moved. A wall that states no height is now described as "height not stated", and Grid no longer writes 2.7 m into a file that left it out (WRT-6).
- Fixtures are obstacles now (CNT-13). A door that swings into one names it ("Door "d1" hits "Table 2" (kitchen run "table-2") when it opens"), and `grid check` says when a fixture stands in front of a doorway or in front of a window above its sill. `grid_measure what=use` gives a room's use indicators: can a wheelchair turn, the clear width each doorway leaves, the way through, the floor in front of and beside each fixture and a blocked window; `what=route` with a `width` says whether a body or a trolley that wide gets through. Each says what it measured and against which width, yours or Grid's own indicator, never a rule.
- `grid check` and `grid_check` are short by default and about your plan: what to look at, the figures those notes used, and what each check looked at. `--full` (or `full` for the tool) gives the whole report. A note you have looked at can be set aside as seen, with why and who (`grid check --seen 3 --reason … --by …`, or `grid_mark_seen`): it stays listed under Seen, in `plan.seen.json` beside the plan, and comes back as new when its part of the plan changes (MSG-10).
- Lengths may be typed in feet and inches, millimetres or centimetres, or with a decimal comma, and are stored in metres. A plan's `display` (or `--units` and `--decimal`) shows areas, dimensions and schedules in the person's units: `12'-6"`, a sill of `48"`, `2860` (WRT-7).
- The IFC file arrives with its data: each room carries its number, its use and its net area with the rule it follows; walls, spaces, slabs, roofs, ceilings, doors and windows carry base quantities; walls are typed by kind and thickness with a material, doors and windows by size. Slabs and roofs Grid works out are marked assumed, and a plan at survey coordinates is written near the origin (HND-2).

Grid has not been released yet. The first release will hold:

- Every floor has a slab from its outline, open over its stairs, lift shafts and voids, and every
  part with nothing above has a flat roof, with a parapet when the floor states one: in the 3D
  view, the OBJ, glTF and IFC files, and `grid_takeoff`, whose slab and roof lines are marked
  assumed. A room can carry a ceiling with lowered zones, and the site a ground level: a door or
  window below it is named.
- `grid write` writes a plan from rooms text, with each room's size and neighbours, and works
  out the walls; `grid describe --as rooms` reads any plan back the same way.
- `grid check` gives one list of what to look at in a plan, with one count: parts that cannot
  be drawn, parts very likely wrong, what the checks found, and what they could not check.
- Every report, `grid_check` and the check sheet list what the checks never look at, ceiling
  height and which walls carry load among them.
- "General guidance, not your local rules" comes first in every report, list and tool answer,
  and is on every drawing and in every DXF, IFC, GLB and OBJ file. No line says a plan passes,
  complies or is approved, and a figure is given as the figure used here, with where it comes
  from and how far a person has checked it.
- `grid tidy` lists the walls that do not meet and makes the fixes you choose.
- Every note and pass that used a figure says which kind of building the figure was read for:
  today, homes.
- A plan can say what kind of building it is (a home, an office, a shop, a school…), and a floor
  can say otherwise for itself, such as a shop under flats. The home figures then run only where
  it is a home, or where the plan does not say, and the report says in plain words which checks
  did not apply to an office or a shop. Rooms have 27 uses, from office and classroom to plant
  and parking; a plain word such as "WC" or "staff room" is read as its use, and the person's
  own word stays the room's name. A room can say who it is for (private, shared, common or
  commercial) and carry the firm's own room type.
- `grid describe`, `grid draw`, `grid export` and `grid sheet` describe a plan, draw it, export
  it and lay it out as an A3 sheet in PDF.
- `grid init` makes a folder a Grid project, where the commands read its `plan.json`.
- An agent that meets a problem in Grid can draft an issue about it with `grid_report_problem`:
  the plan cut down and cleared of names and paths. Grid sends nothing; you decide whether to
  file it.
- Every pull request is checked on GitHub, on Linux and on Windows: the type check, the lint,
  the tests, the licence check and the scoreboard.
- Who sits where is kept in a file of its own beside the plan, `plan.occupancy.json`, linked to
  its rooms and desks. No export or sheet carries it; `grid occupancy` lists it by room.
- `grid serve`, or `grid mcp`, is the tool server an agent uses, with 30 tools.
- A room schedule (number, name, use, area, height, floor, with the totals of each floor and of
  all floors) and a door and window schedule that lists each opening once with the two rooms it
  joins, as text, as CSV for a spreadsheet, and as tables at the end of the check sheet.
- Quantities for a first estimate: floor finishes and wall faces by room use, ceilings,
  skirting, reveals, walls by kind and thickness, the outside face, doors and windows by size,
  and the slab, upper floors and roof worked out from the outlines and marked assumed, each line
  with its rule. A cost comes only from your own rates file beside the plan, which must name its
  currency; without one you get a rate card to fill in, and lines with no rate or a rate in the
  wrong unit are listed, never filled.
- Plans can hold several floors at their levels, steps inside a floor, rooms inside rooms and
  rooms with holes, such as a courtyard.
- A plan can say where north is, which way its y runs, which side is its front and where it
  sits. The drawing then shows a north arrow, the IFC file states that north (and no north for
  a plan that states none), and an agent can ask which rooms face east.
- The door-swing check stays quick on a floor of thousands of rooms, and the 2D view checks
  only the floor it shows.
- `grid check` says where an opening does not fit: a door or window that runs into a wall meeting
  its wall, a wall that ends inside a window, an opening as long as its wall, a door on a dividing
  line, and a window between two rooms (perhaps a borrowed light). `grid_split_room` will not end
  a new wall inside a door or window, and says the nearest size that is clear.
