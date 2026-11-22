# CMD-13: report a problem, the agent drafts the issue, the person decides to send it

## What changed

- **`grid_report_problem`** (`packages/cli/src/mcp/reportTool.ts`), a 16th tool, read-only
  (`readOnlyHint: true`, `openWorldHint: false`), last of the reading tools: after `grid_check`,
  before `grid_preview`. It takes `plan`, `tool` (the tool called), `arguments`, `answer`,
  `expected` (required), `code` (the record line's code), `parts` (ids) and `client`. It reads
  the plan through `projectFiles.ts`, writes nothing and sends nothing. It answers with the
  draft (`title`, `body`, `labels`), `link`, `linkHasBody`, `code`, `plan`, `kept` and
  `sent: false`.
- **The draft** (`packages/cli/src/report/draft.ts`):
  - **What it holds.** Grid's version and the result record's version, the protocol version
    when the request names it, the client's name when the agent gives it, the call with its
    arguments and answer (the first 4,000 characters), what was expected, and the record's
    line for the code.
  - **The record.** It comes from the same code as `grid_check` (`checkPlan` on the loaded
    plan). When the command refuses the plan, the draft carries the refusal and the record
    `inspectPlan` gives for the plan as JSON, so a refusal can be reported too. A file that is
    not JSON gives a draft without a plan.
  - **The cut.** The plan is cut down to the parts the line names: its thing, `also`, and ids
    quoted in its words, since `wall/overrun`, for example, names the corner wall only in
    `found`. The parts in `parts` count too. A room brings its walls, a door or window its wall,
    and a wall named itself the walls that cross it or meet it (within half the thicker wall
    plus the `gap` tolerance) and its openings. With nothing named, the whole plan is kept.
  - **The clearing.** Room names become uses (`bedroom`, `bedroom 2`, `room`) and ids become
    kind and number (`wall-3`, `door-2`). Floor names become `floor N`. Fixture labels, the
    trace image, `projectId`, `written` and every field Grid does not know go; only numbers and
    Grid's own enum words are copied. The same replacements run, in one pass, over every text
    of the draft. Paths (the plan's own, the project folder's, and anything path-shaped), file
    names, web addresses and emails become `<path>`, `<file>`, `<address>` and `<email>`. The
    cleared plan must pass MSG-9's `planTextProblem`.
  - **The link.** `REPOSITORY/issues/new?template=agent-drafted.md&labels=agent-drafted&title=…&body=…`.
    The body is left out of the link when the link would pass 8,000 characters
    (`linkHasBody: false`), and the answer says the person pastes it.
- **Protocol.** `ServerTool.call` takes the request's own `protocolVersion`: a 2026-07-28
  request names it in `_meta` (already checked against the versions Grid speaks), and
  `ToolContext` carries it. The server still keeps nothing between requests, so after
  `initialize` the draft says the version is one of the three and cannot say which.
- **Issue templates.** `.github/ISSUE_TEMPLATE/agent-drafted.md` (label `agent-drafted`, the
  draft's headings) and `problem.md` for people. A test holds that the template the link opens
  carries the label.
- **Docs.** `docs/tool-server.md` has a row and a section, "Reporting a problem". The agents'
  changelog in `docs/result-contract.md` has an entry. `CHANGELOG.md` has a line and "16
  tools", as do `docs/commands.md` and `AGENTS.md`. The plugin's skill gained step 6.

## Tests

- New `packages/cli/src/mcp/__tests__/reportProblem.test.ts`, 12 tests:
  - **S-11**: a draft from `grid_check`'s first wall or room line. It holds the version, the
    call, the answer, the code and the client. The plan is cut down and holds together. No room
    name, no original id, no project folder and no file name is in the body, and a `<path>` is.
    The link is the issue form with the template, the label, the title and the body, and
    `sent` is false.
  - **T-1**: the five T-1 texts as room names, in a file named after a person. No word of them
    and no part of the file name is in the draft, and the room kept is named by its use. The
    same holds for the variant with line breaks.
  - **Refusals**: a plan the schema refuses (with a person's name as a room's name and id) is
    reported with the refusal and `Read: no`, and without the name. A file that is not JSON
    gets no plan.
  - **The tool itself**: it is read-only, the folder is unchanged after a call, and a
    2026-07-28 request's protocol version is in the draft. A trace image outside the project is
    not in the draft, and its key is not in the plan.
- `everyPath.e2e.test.ts`: added the `grid_report_problem` `plan` slot.

### Changed expectations

- `tools.test.ts`:
  - `ORDER` and `READ_ONLY` gain `grid_report_problem`, after `grid_check`.
  - "keeps about a dozen tools" is now at most 16, not 15, because of the new tool.
  - `CALLS` gains a call for it, since that test requires one per tool.
- `server.test.ts`: `tools/list` has 16 tools, not 15.
- `everyPath.e2e.test.ts`: `PLAN_TOOLS`, the tools that must refuse a plan whose trace image
  leads out of the project, leaves out `grid_report_problem`, as it already leaves out
  `grid_write_rooms`. This tool never follows the path, the draft drops it, and a refused trace
  image is one of the failures worth reporting. Its own test holds that the path is not in the
  draft.

Nothing was removed.

## For the owner

1. **The repository URL.** The issue-form link is built from `REPOSITORY` in
   `packages/cli/src/distribution/listing.ts` (`https://github.com/ongrid-arch/grid`), the
   address the package listing already uses. It needs the real repository's URL before
   release. The `agent-drafted` and `problem` labels must exist there for the link's `labels`
   to apply.
2. **Which plans T-1 and S-11 are.** I found no lab index that names them. I took T-1 as the
   lab's T-1 texts (`attackCases.ts`, text in a name that talks to the agent) put into the
   two-bedroom flat, and S-11 as `B/scenarios/s11-junctions.json`, the lab's scenario 11. If
   either means another plan, the tests take any plan with a wall or room line.
3. **A markdown template, not an issue form.** GitHub prefills `body=` only for a markdown
   template; a YAML form takes one query parameter per field. So `agent-drafted.md` is a
   markdown template with the draft's headings.
4. **The client's name comes from the agent.** The server keeps no state, so the
   `clientInfo` of `initialize` is gone by the time of a call, and I did not guess a `_meta`
   key for it in the 2026-07-28 era. The agent passes `client`.
5. **Ids are renamed.** HND-9 says ids travel and must not hold names, but plans written before
   it may. Renaming them all (`wall-3`) keeps the draft safe, at the cost of the person seeing
   other ids than their plan's. The message's words get the same names, so the draft reads
   consistently.
6. **What the clearing cannot catch.** A person's name typed by the agent into `expected` or
   `answer` that is not a name in the plan stays. The tool tells the agent to show the person
   the draft exactly, and the template asks the person to read it before submitting.
7. **A line about a floor or the whole plan keeps the whole plan.** Cutting to one floor's
   parts would be a small follow-up.
8. **The tool count.** 16 tools now, one past the "about a dozen" test's old ceiling of 15.
