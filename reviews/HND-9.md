# HND-9: personal data kept out of hand-over files

## What changed

- **An occupancy file of its own.** Who sits where is kept beside the plan, named after it:
  `plan.occupancy.json` beside `plan.json` (`packages/cli/src/occupancy/occupancy.ts`). Each
  seat names a room of the plan by its id, may name a desk in that room, and lists its
  occupants. The plan knows nothing of the file, and nothing that writes an export, a sheet or a
  tool answer reads it.
- **Read the one way.** The file is read through `fs/projectFiles.ts` (a link out of the project
  is refused), held to the plan's text rule (MSG-9: ids 64 characters, names and desk labels
  120, one line each) and checked strictly. A refusal names the place (`seats[2].occupants[0]`)
  and never the text, since the text is a person's name; a file that is not JSON is refused
  without the parser's message, which quotes the text around the fault.
- **`grid occupancy [<plan.json>]`** lists each seat by its room's name, with its desk and
  people, and names any seat whose room the plan no longer has (by `seats[n]` and the id). It
  reads the project's `plan.json` when no plan is named. With no occupancy file it is refused
  (exit 1) and says where the file goes.
- **Room names travel, and the guide and the tool server say so.** One sentence,
  `ROOM_NAMES_TRAVEL` in `packages/cli/src/mcp/protocol.ts`, is in the server's instructions,
  in the descriptions of `grid_write_rooms`, `grid_export` and `grid_sheet`, and in the skill the
  plugin carries. The docs say it in `plan-file.md` (new section "People are kept out of the
  plan", with the file's format), `rooms-first.md`, `tool-server.md` and `commands.md` (new
  section for `grid occupancy`). README's docs table names the command and the section.
- **What travels, measured.** I exported the lab's two-bedroom flat in every format and looked:
  the DXF writes each room's name (not its id), the IFC its name and id, OBJ and GLB its id. The
  sentence and the docs say exactly that.
- Changelog line under "Unreleased"; an entry at the top of the agents' changelog in
  `docs/result-contract.md` (descriptions and instructions change, no answer does).

## Tests

- `packages/cli/src/occupancy/__tests__/occupancy.test.ts`: the file's name, the link to rooms
  and desks, a seat whose room is gone, no file, six wrong files (each refusal names the place
  and holds no name), a link out of the project refused, and `grid occupancy` run in process.
  **The exports:** with an occupancy file of three distinctive names beside the plan, each of
  DXF, IFC, OBJ and GLB is written by `exportIntoProject` and its bytes searched, as UTF-8 and as
  Latin-1, for every name and every word of every name and for the desk label: none is there.
  The same test holds that the room name (DXF, IFC) or id (IFC, OBJ, GLB) is there, so the
  guide's statement stays true.
- `packages/cli/src/mcp/__tests__/roomNamesTravel.test.ts`: the sentence is in the
  instructions, the three tool descriptions and the skill, and the guide pages carry it.
- `everyPath.e2e.test.ts`: **added** the `occupancy` command's plan slot and a `PLAN_READERS`
  line, as that test asks of a new command that takes a path. Nothing changed or removed.

## For the owner

1. **A linked file, not a marked section in the plan.** The card allows either. A section in
   the plan would be a schema change (CNT-1's rule) and would travel with the plan file itself,
   which is a hand-over file too; a file of its own keeps the plan free of names and needs no
   schema change. No plan-format change was made.
2. **No way to put occupants into an export.** The card says "unless asked"; I built no opt-in.
   Every export and sheet leaves them out, always. An opt-in (say `--with-occupants` on the IFC,
   as `IfcOccupant`) is a later card if anyone needs it.
3. **The tool server has no occupancy tool.** So people's names never reach an agent's context
   through Grid. If the owner wants agents to answer "who sits in the office?", that is a tool to
   decide on, with that cost.
4. **Desks are labels of the occupancy file.** The plan has no desks (CNT-11: fixtures now,
   furniture later), so a desk is a label inside its room. When furniture lands, a seat could
   name a desk item by id instead.
5. **One file per plan, by name.** `<plan>.occupancy.json` beside the plan, so a project with
   several plans keeps them apart. There is no option to name another file.
6. **Not in `.gitignore`, not in `grid check`.** `grid init` and the export writer still add
   only `exports/` to `.gitignore`; the owner may want the occupancy file ignored too. A seat
   whose room is gone is said by `grid occupancy` only, not by `grid check`, so no message code
   was added to the result contract.
7. **The sheet is not searched.** The PDF draws its text through the canvas, so a byte search
   proves little; the sheet reads only the plan and the sheet words, never this file.
8. **The skill.** I took "the guide" to be the docs pages and the skill the plugin carries; both
   say it.
