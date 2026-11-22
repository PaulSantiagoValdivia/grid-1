# 2026-11-22: named wall, door and window types, materials and room finishes (CNT-15)

## For people

- A plan can hold named wall, door and window types (`types`): a wall type's name, thickness,
  height, kind, whether it is glazed and its material; a door or window type's name, size, kind
  and material. Walls and openings name their type and take what they leave out, so "make every
  partition 120 mm" is one change: `grid_change_type` (`grid edit type`), which also adds a type,
  gives it to walls or openings and makes it the default an office keeps as its template. The IFC
  names each wall, door and window type after the plan's and writes its material, and "Not
  stated" where none is given, in place of a material named after the wall's kind. Rooms and
  zones can name their floor, wall, ceiling and skirting finishes (`grid_rename_room`); the
  finishes plan (`grid_schedule of=finishes`), the take-off and the estimate measure them from
  the same rows, and a kitchen kept as a zone after a knock-through keeps its tiled floor. The
  door and window schedules list the plan's named types first (CNT-15).

## For agents

- The plan format holds `types` (convention C24): `walls`, `doors` and `windows`, each type an
  `id`, a `name` and optional values, and `defaults` (`walls` by kind, `door`, `window`). A wall
  names its type in `wallType`, a door in `doorType`, a window in `windowType`; a room or zone may
  state `finishes` (`floor`, `walls`, `ceiling`, `skirting`). The reading fills what a part leaves
  out from its type and lists it in the part's `typed`, which is Grid's reading only and never
  written back.
- New tool `grid_change_type`, after `grid_change_opening`: `of` (`wall`, `door`, `window`),
  `type`, the values to set (`name`, `thickness`, `height`, `width`, `sill`, `kind`, `glazed`,
  `material`), `clear`, `parts`, `default`, `out`. It answers as every change does. 32 tools.
- `grid_rename_room` takes `floor_finish`, `wall_finish`, `ceiling_finish` and `skirting_finish`
  (`none` takes one out). `grid_merge_rooms` refuses to merge two rooms that name different
  finishes for one surface unless `zones: true`, and a merged room takes a finish only the second
  room names.
- `grid_schedule` takes `of=finishes`: `rows` (each room, then each zone with a finish of its
  own: `id`, `name`, `floor`, `zoneOf`, `surfaces` with each surface's `finish` and `quantity`),
  `totals` (`surface`, `finish`, null when not stated, `unit`, `quantity`, `rooms`) and `rule`.
  With `of=doors` or `of=windows`, a row of a named type has `basis: 'named'`, `key`
  `door-type:<id>` (the size after it for openings that state their own), `typeId`, `name`,
  `material` and `glazed`, and comes first; every other row has those four null. The CSV gains
  `name` and `material` columns after `type` when a row is named. An opening schedule row's
  `typeKey` is the named type's key for an opening of one.
- `grid_takeoff` gives `wallTypes` (`type`, `name`, `kind`, `material`, `glazed`, `count`,
  `gross`, `net`, `face`) and `finishes` (each finish's total) on a plan that names any, and both
  rules in `rules`; its CSV adds `wall type` and `finish` rows. With `for=estimate`, walls of a
  named type are keyed `wall-type:<id>:<thickness>`, doors and windows `door-type:<id>` and
  `window-type:<id>`, and each named finish `floor:finish:<name>`, `wall_finish:finish:<name>`,
  `ceiling:finish:<name>` and `skirting:finish:<name>`; the other lines are as before, less what
  those take.
- The IFC: every wall material layer whose material the plan does not state is of the material
  `Not stated` (was one per kind, `Exterior wall`); a named type's wall type, door style and
  window style take its name and its tag `wall-type:<id>:<thickness>`, `door-type:<id>`,
  `window-type:<id>`, and its material.
- New codes `type/unknown`, `type/duplicate-id` and `type/wrong-part`, each worth a look.

## Codes

| `type/unknown` | {thing} names a type the plan's types do not hold | a type in the plan's types, by id |
| `type/duplicate-id` | {thing} lists a type more than once | an id of its own on every type in a list |
| `type/wrong-part` | {thing} names a type it does not take | a wall type on a solid wall, a door type on a door and a window type on a window |
