# VEW-4 review: a preview the person can point at, and the agent can point back

For the owner. What VEW-4 adds, how each done-when item is met, every expectation that changed,
the choices made without you, and the checks run.

## What VEW-4 adds

**One viewer page** (`packages/viewer/src/page/previewPage.ts`). Plain DOM code, no React, no
Three: it shows the 2D drawing as the viewer's own SVG (`planPicture` → `pictureToSvg`, the same
picture `grid draw` and `grid_view` make, every part with its `data-id`) and the 3D model as a
still taken through VEW-3's camera record. It draws only what it is given and measures nothing:
the boxes it frames a room with come from the server (`partBounds`). It runs in two places:

- **As an MCP App.** The tool server now offers one resource, `ui://grid/preview`, of type
  `text/html;profile=mcp-app` (`projectResources` in `serveTools.ts`). `grid_preview` names it in
  `_meta.ui.resourceUri` (and the older `_meta["ui/resourceUri"]`). The page speaks the
  standard's postMessage JSON-RPC: `ui/initialize`, `ui/notifications/initialized`,
  `ui/notifications/size-changed`, reads `ui/notifications/tool-input` and `tool-result` for the
  plan, `host-context-changed` for the theme, answers `ui/resource-teardown` and `ping`, calls
  `tools/call` and tells the host the selection with `ui/update-model-context`. It ignores a
  message whose source is not its parent window. It loads nothing from anywhere else (inline
  script and style, `data:` pictures), so the standard's default content security policy holds.
- **As a local page.** `grid preview [plan] [--port n]` (`packages/cli/src/preview/localServer.ts`)
  serves the same page at `http://127.0.0.1:4178/` (another free port when that is in use) and
  answers its one call through the same `handleLine` and tools an agent's host talks to.

**One shared record** beside the plan, `<plan>.preview.json` (`packages/cli/src/preview/record.ts`),
read and written only through `projectFiles.ts`: `view`, `floor`, `camera` (VEW-3's record),
`selected`, `highlight`, `frame`, `note`, `revision`, `changedBy`. The page writes `view`,
`floor`, `camera` and `selected`; the agent everything but `selected`. The tool server still keeps
no state between lines: the file is the state, so a host's server process and `grid preview`'s
share it.

**Two tools** (`packages/cli/src/mcp/previewTools.ts`, moved out of `writeTools.ts`):

- `grid_preview` (the agent's) takes `floor`, `room` (now framed), `view`, `note`, and new
  `highlight` (ids; `[]` clears) and `camera` (a `grid_view` record). It writes the record and
  answers with what the preview shows, what the person selected and the picture, drawn by
  `grid_view` itself (the plan cropped to the room with the parts picked out, or the model
  through the camera). With no argument but `plan` it reads what the person selected and writes
  nothing.
- `grid_preview_sync` (the page's, `_meta.ui.visibility: ["app"]`) reads the drawing and the
  record and writes what the person did: `floor`, `view`, `select`, `clear`, `pick` (x, y on the
  3D picture), `camera`. `since` makes an unchanged answer one line; a record-only change sends
  no drawing.

**A click returns the id it hit.** On the 2D drawing, the page reads the `data-id` of the part
under the pointer. On the 3D picture, the server turns the point into a ray through the camera
record and meets the nearest wall, door or window in its hole, or room floor
(`pickInModel`, `packages/floorplan/src/geometry/pick.ts`, pure). Simplified: no slab thickness,
roof, stair or fixture is met.

**Reload.** The page reads `grid_preview_sync` with `since` every 500 ms as a local page and every
1.5 s in a host. The server hashes the plan, the view, the floor, the look and (3d) the camera;
an unchanged plan answers "Nothing changed." without drawing anything.

## The done-when items

1. **The page opens as a local page and reloads within 2 s of the plan file changing.**
   `packages/cli/src/preview/__tests__/page.dom.test.ts` opens the page from a real
   `startLocalPreview` server in jsdom, with the page's own script and calls, and times a change
   to `plan.json` until the new room name is drawn: about 0.6 s here, held under 2 s.
   `packages/cli/src/command/__tests__/preview.e2e.test.ts` runs the built `grid preview` and holds
   the same through its HTTP call.
2. **A click returns the id it hit, and highlight and frame sent by the agent change what the
   page shows.** The same jsdom test clicks the kitchen and a door, and `grid_preview` reads them
   back; then `grid_preview` with `room` and `highlight` colours the parts (`grid-hl`) and sets the
   SVG's view box round the room; `highlight: []` clears them; `view: '3d'` turns the page to the
   model. A second test runs the page as an MCP App against a stand-in host over postMessage.
   **By hand in a real browser** (Chromium, the desktop app's browser pane) on the lab's
   three-bed house: clicking the kitchen selected it and wrote the record; `grid_preview room=bed1
   highlight=[d-bed1, w-bed1]` through `grid serve` framed the bedroom and coloured the door and
   window by the next screenshot; in 3D, clicks selected the living room's window, the kitchen's
   window and the living room's floor, and a drag turned the model. That run found and fixed one
   fault the jsdom test could not: the 3D picture is letterboxed, so a click is now read on the
   picture, not the element.
3. **A client with no viewer support still gets an image and text from every tool.**
   `packages/cli/src/mcp/__tests__/preview.test.ts` ("a client with no viewer") calls every tool
   that draws (`grid_view` plan, 3d, eye, facade, section; `grid_compare` with a picture;
   `grid_diff`; `grid_preview` in 2d and 3d; `grid_preview_sync` in 2d and 3d) and holds that each
   answers text first and a PNG. `grid_preview` gained the picture it lacked: before, it answered
   one line and no image.

## Expectations that changed, and why

- `packages/cli/src/mcp/__tests__/tools.test.ts`: the order gains `grid_preview_sync` after
  `grid_preview`; the cap goes from 30 to 31 tools (the new tool is the page's, listed to the page
  only by a host that shows MCP Apps); `grid_preview` leaves the read-only set, because it now
  writes the record beside the plan (`readOnlyHint` false, `destructiveHint` false, as the other
  tools that write a file beside the plan); `grid_preview_sync` joins the tools that need not say
  "metres" and the calls every tool is answered with.
- `packages/cli/src/mcp/__tests__/server.test.ts`: `grid_preview {floor, view: 3d}` answered the
  one line "Showing floor "ground" in 3d."; it now writes the record and adds the picture's text.
  This test's server is bundled alone, without `@napi-rs/canvas`, so the answer now ends with the
  canvas's install line: the preview still moves, only the PNG is missing. The tool count goes
  from 30 to 31.
- `packages/cli/src/command/__tests__/everyPath.e2e.test.ts`: `grid preview` and
  `grid_preview_sync` join the commands and tools whose paths get the T-5 cases.
- `grid_preview` with no `floor`, `room` or `view` used to be refused ("Pass a floor id…"); it now
  reads the selection. No test held the refusal.

## Choices made without you (reversible)

- **The tool count, 31.** The page needs a call of its own to read the drawing and write clicks.
  Folding it into `grid_preview` would give the agent arguments it must never use. It is one tool
  with `visibility: ["app"]`; a host without MCP Apps lists it, and its description says not to
  use it as an agent.
- **`grid_preview` reads the selection** when called with no argument but `plan`, rather than a
  new `grid_selection` tool, to keep the agent's list as it was.
- **`grid_preview`'s hint is now write-file**, not read: it writes `<plan>.preview.json`. A host
  that asks before every non-read-only call will now ask for it.
- **The 3D view in the page is a still**, drawn by the server through the camera record, not a
  WebGL scene. One page then holds no Three or React (about 11 kB, loaded only when asked for), the
  picture is the very one `grid_view` gives, and a click is met in the core. The cost: turning
  the model waits for a new still to be drawn and sent, and there is no smooth orbit.
  The viewer's `Canvas3D` could replace it later inside the same page if you want live orbiting.
- **The local page listens on 127.0.0.1:4178**, refuses any `Host` but `127.0.0.1` or `localhost`
  on its port (a renamed site, "DNS rebinding"), any `Origin` but its own, any call that is not
  JSON (which a page of another site cannot send without asking), and any tool but its own.
- **The record is a file beside the plan**, not memory, so `grid serve` (started by the host) and
  `grid preview` (started by the person) share it without talking to each other.
- **jsdom's types**: `packages/cli/src/preview/__tests__/jsdom.d.ts` declares the few parts the
  test uses, rather than adding `@types/jsdom`. jsdom itself was already in the lock file (the
  viewer's DOM tests run in it). No new dependency.

## For the owner

- **Which clients show an MCP App served by a local (stdio) server is not verified.** Grid
  follows the MCP Apps standard as published for 2026-01-26 (SEP-1865, Final): the resource, the
  tool `_meta`, the extension in the server's capabilities and the page's postMessage protocol.
  It was tried against a stand-in host in a test, not against a real one. What to check, with
  `npx -y ongrid mcp` in each: Claude Desktop, claude.ai (through a connector), Claude Code (its
  terminal shows no apps; expect the image and text), VS Code with GitHub Copilot, Cursor,
  Goose, and ChatGPT's apps. An issue on the standard's repository (ext-apps #671, May 2026)
  reports an app whose calls worked but whose page did not show in Claude Desktop or claude.ai,
  so the first check is whether the page appears at all; where it does not, `grid preview` is the
  way, and every answer still carries its picture.
- The standard's own text does not settle the `protocolVersion` a page sends in `ui/initialize`;
  the page sends `2026-01-26`. A host that refuses it would show the page with an error line.
- The bundle: `dist/grid.mjs` is 559,890 bytes after merging HND-11, under the test's 600 kB cap
  but over the 550 kB the brief named (the test holds 600 kB since CNT-17). VEW-4 adds about
  17 kB; the page is its own chunk.

## Checks run

After merging `main` at 4fe29edc (COD-8), on a machine at a load average near 300:

- `npm run build`: `dist/grid.mjs` 557,659 bytes (cap 600,000).
- `npm run typecheck` and `npm run lint`: clean.
- Full suite (`vitest run --maxWorkers=2`): the first run reached its 25-minute limit with 159
  files passed and none failed; the other 163 files, run next, gave 1,115 tests passed and one
  failed, `diff-size.test.ts` "diffs 1,000 entities … well inside a second" (15.9 s under load).
  Run alone it passed (4 of 4). No other failure.
- `npm run scoreboard`: the same as the stored figures, in 360 s.

After merging `main` again at 90a933b1 (HND-11): build, type check and lint clean, `grid.mjs`
559,890 bytes; the affected tests (the preview's, the tool list, the server, the contract, the
command's end-to-end and every-path tests, the bundle cap, the 3D pick and `src/__tests__`): 13
files, 259 tests, all passed.

