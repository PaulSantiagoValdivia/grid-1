# 2026-11-23: a guide for agents, sample plans, a quick-start and the plan's JSON Schema (CMD-7)

## For people

- A guide for agents, `docs/agent-guide.md`: rooms first, then the raw-wall form for what rooms
  text cannot say, then the answers to what every test model asked before its first plan (what to
  draw for a stair, the use word for an office or a toilet, whether a size is inside or outside,
  whether a dividing line has a thickness, and L-shaped rooms). The tool server serves it as
  `grid://guide`, and the package carries it as `guide.md` (CMD-7).
- The plan file's five conventions written out, each with a drawing, with the later ones in a
  table: `docs/conventions.md` (CMD-7).
- Three sample plans in `docs/samples/`, a flat, a two-storey house and an open-plan home, as rooms
  text and as plan files; every check looks at each of them (CMD-7).
- The plan's structure as a JSON Schema (draft-07, format version 1), made from the code on every
  build: `plan.schema.json` beside the command and in the package, and `grid://schema/plan` on the
  tool server (CMD-7).
- A five-step quick-start at the top of the README (CMD-7).

## For agents

- The server's instructions are sent on `initialize` too, not only on `server/discover`, and now
  carry the answers to the first questions (a stair, the use words, inside sizes, dividing lines,
  L-shaped rooms) and point to the guide and the schema. The README, the guide, the skill and the
  instructions share these paragraphs word for word.
- `resources/list` offers `grid://guide` (`text/markdown`) and `grid://schema/plan`
  (`application/schema+json`) after the preview page. The MCP Apps extension in the capabilities
  still lists only the preview page's type.
- No new code in the record.
