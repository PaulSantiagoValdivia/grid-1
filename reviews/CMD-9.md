# CMD-9 review: one line installs Grid in an agent

For the owner. Built in `packages/cli`, with the README and `AGENTS.md`. Nothing was published:
no npm publish, no registry, no accounts. Every `package.json` stays `"private": true`.

## What it adds

- **`grid mcp` and `ongrid mcp`.** The same tool server as `grid serve`, under the name agents
  start it by: `npx -y ongrid mcp`.
- **Both eras of the protocol** (`src/mcp/protocol.ts`). An older client opens with
  `initialize` and is answered as before (2024-11-05, 2025-03-26, 2025-06-18). A 2026-07-28 client
  sends no handshake: each request names its version and capabilities in `params._meta`, it starts
  with `server/discover`, and each result carries `resultType: "complete"` and the server's name;
  the tool list and the discover answer say how long they may be kept (`ttlMs`, `cacheScope`).
  A version Grid does not speak gets `-32022` with `data.supported`, and its message names every
  version Grid speaks; so does "method not found", which is what a client of neither era gets.
  A requested version is repeated back only when it is shaped like a date (T-3). The era is read
  from each request, so the server keeps no state between lines.
- **One source for every install** (`src/distribution/listing.ts`): the npm package's manifest
  (with `mcpName`), the registry's `server.json`, the plugin folder for Claude Code and Codex (a
  manifest and the server for each, and one skill), a marketplace folder for each, the Add to
  Cursor link, the set-up lines for Claude Code, Codex, VS Code and the Copilot command line, and
  the `.mcpb` manifest for Claude's desktop app. The README's install section is `installText()`,
  word for word; a test fails when they part.
- **`npm run pack:local --workspace ongrid`** (`pack.mjs`, after a build) writes all of it into
  `packages/cli/dist/release/`: `ongrid-<version>.tgz` from `npm pack` (550 kB: the bundled
  `grid.mjs`, its chunks, LICENSE, NOTICE, a short README), `server.json`, `marketplace/`,
  `install.md`, and `grid-<platform>-<arch>.mcpb` (14 MB on this Mac, nearly all the canvas).
- **A zip writer** (`src/distribution/zip.ts`) for the `.mcpb`, pure and reproducible, so no
  dependency was added. Python's `zipfile` and the system `unzip -t` both read what it writes.
- **The canvas is optional in the package.** `@napi-rs/canvas` is native, so it stays outside the
  bundle; the package lists it as an optional dependency. Without it every tool works except a
  PNG, which is refused in one line saying what to install (`src/draw/canvas.ts`), for the tool
  server and for `grid draw --png`. The `.mcpb` carries the canvas of the computer it is packed on.

## done_when

1. **`npx -y ongrid mcp` from a packed tarball in an empty folder** answers an `initialize`
   client (handshake, tool list, a call) and a 2026-07-28 client (`server/discover`, tool list, a
   call), and refuses a version it does not speak and a method of neither era, naming the
   versions it speaks. Run as `npx -y --package=<tarball> ongrid mcp`, the same line told where
   the package is, since it is not on npm. Met: `install.e2e.test.ts`.
2. **Each generated install artefact installs and makes one call.** The tarball is installed into
   an empty folder; then the server named by the plugin's `.mcp.json` and portable `mcp.json`, by
   the Cursor link (decoded), by the VS Code line (its JSON parsed) and by the `claude`, `codex`
   and `copilot mcp add` lines (the command after `--`) is started exactly as written and answers a
   call. The `.mcpb` is unzipped, run as its manifest says with a project folder put in for the
   one the person would pick, and answers a call and draws a PNG. Met, with the limits below.
3. **No hidden state.** Two plans, `grid_describe` and `grid_areas` on each, A then B in one
   server and B then A in another, in both eras: the answers for each plan are the same. Met.

Every npm run in these tests is offline, against a registry address that answers nothing, with
its own cache, so none can reach the network or any agent's configuration on the machine.

## What waits on CMD-8 (publishing)

- **`npx -y ongrid mcp` itself**, and so every artefact, needs `ongrid` on npm. Each artefact
  already holds that exact line; the tests run it against a local install of the tarball.
- **The package's `"private": true`**, kept in the packed manifest too; publishing removes it.
- **The registry entry**: `server.json` is generated, but the registry accepts it only once the
  package is on npm, through `mcp-publisher` and a GitHub login for the `io.github.ongrid-arch`
  namespace. Not tried.
- **The plugin lines** (`/plugin marketplace add ongrid-arch/grid`, `codex plugin marketplace
  add ongrid-arch/grid`) need `.claude-plugin/marketplace.json`, `.agents/plugins/marketplace.json`
  and `plugins/grid/` committed at the top of the repository, which this task was not to touch.
  `pack.mjs` writes that folder; copying it to the top is one step when publishing is approved.
- **The `.mcpb` on releases**: one per platform, built where its canvas binary is, attached to a
  GitHub release (the lab's decision list asks for the owner's yes). NOTICE should then name
  `@napi-rs/canvas` (MIT) and Skia, which the bundle carries; NOTICE is outside this task's files.

## Decisions taken without you

- **Requests in neither era are still answered.** A tool call with no `initialize` before it and
  no version in its `_meta` is answered as an older client's, as before. Refusing it would need
  the server to remember the handshake, and many existing tests and the replay call tools without
  one. A client that names an unknown version, or calls a method Grid does not know, is refused
  with the versions. (CMD-5 left "answer before initialize" open too.)
- **The plan text is not yet taken in place of a path.** The card's how asks every tool to take
  the plan by path or as text, for clients that share no folder. Not built: it touches every tool
  and the three that change the plan would need to give the new text back instead of writing it.
  The desktop bundle asks the person for the project folder instead (`user_config`, a directory),
  so its tools have files to read. Left for a follow-up.
- **`supportedVersions` lists only 2026-07-28.** The older versions need `initialize`, so a
  2026-07-28 client that retried with one would be refused. They are named in every message.
- **2025-11-25 is not added** to the `initialize` versions: nothing here needed it, and the
  answer to an unknown version (`2025-06-18`) is an expected figure of an existing test.
- **The registry name is `io.github.ongrid-arch/grid`**, from the repository's GitHub owner. The
  plugin and server are named `grid`; the package `ongrid`.
- **Codex gets the portable plugin format** (root `plugin.json` and `mcp.json`, read from
  developers.openai.com), beside Claude Code's `.claude-plugin/plugin.json` and `.mcp.json`, in
  one folder. The old `.codex-plugin/` manifest is not written.
- **VS Code gets the `code --add-mcp` line only.** Its install link format could not be read on
  its documentation pages, so no `vscode:` link is written.
- **The tool descriptions in the `.mcpb` manifest** are each tool's first sentence, cut at 200
  characters.

## Existing tests changed

- `src/__tests__/fileAccess.test.ts`: `pack.mjs` is added to the files scanned and to the files
  allowed to touch the disk (it reads the build and writes `dist/release/`). No figure changed.
- No expected figure changed, and no `it.fails` was touched.

## Sources read (21 November 2026, not tried against the hosts)

MCP 2026-07-28 changelog, versioning, basic and server/discover pages (modelcontextprotocol.io);
MCPB README and MANIFEST.md (github.com/modelcontextprotocol/mcpb); MCP Registry server.json and
package-types docs (github.com/modelcontextprotocol/registry); Claude Code plugins reference and
marketplaces (code.claude.com); Codex plugins (developers.openai.com/plugins/build/plugins) and
MCP (learn.chatgpt.com); Cursor install links (cursor.com/docs/context/mcp/install-links); VS Code
MCP configuration (code.visualstudio.com, read only in part); Copilot CLI MCP servers
(docs.github.com).

## Checks

Run in the worktree, each under `timeout 900`, all exit 0: `npm ci`, `npm run build`,
`npm run typecheck`, `npm run lint` (after fixing one unused variable in the new install test),
vitest with `--exclude '.claude/**'` (159 files, 3726 tests; the install tests then ran again on
their own after the lint fix, 38 of 38), `npm run check:licenses`, and `npm run scoreboard`
(same as the stored figures). Vitest was run as `./node_modules/.bin/vitest`, the repository's
own copy, because a local hook refuses `npx vitest`.
