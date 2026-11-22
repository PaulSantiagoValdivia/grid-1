# CMD-15: every path a tool takes stays inside the project

Card: "Every command and tool that reads or writes a file … resolves the path, follows links,
and refuses anything outside the project folder, with a plain message naming the path and the
folder." Lab evidence T-5 (reproduced), T-4, T-1.

Most of this already existed: the resolver (`packages/cli/src/fs/projectFiles.ts`), the guard
against bypassing it (`src/__tests__/fileAccess.test.ts`) and the deep cases for `check`,
`draw`, `export` and `grid_export` (`src/command/__tests__/paths.e2e.test.ts`). Since then
`write`, `describe`, `sheet`, `tidy` and fourteen more tools had been added, and the T-5 cases
had been tried only as a *path argument*. Nothing had tried them where the lab found them: as
the trace image a plan names. This session filled those gaps.

## What changed

- **The trace image a plan names is checked** (`command/plan.ts`, `traceImageCheck`).
  `loadPlan` is the one reader every command and every tool uses for a plan. After the schema,
  it resolves `referenceImage.path` with the shared resolver, starting from the project folder
  (as the schema's comment says). A plan whose trace image is a web address, a network path, a
  path out of the folder, or a link out of it is refused in one line. The line names the plan,
  the field, the path and the project folder, and says to take `referenceImage` out or name a
  picture inside the project. The picture doesn't need to exist yet. Before this change all
  six T-5 values were accepted without a word (the lab's case 3c).
- **`Project.resolve(given, relativeTo?)`** (`fs/projectFiles.ts`). The resolver can now be
  told where a relative path starts. The command's paths start from the folder Grid runs in.
  A path written inside a plan has to start from the project folder, so the same plan reads the
  same wherever Grid is run. `locate` takes the base it should use. Nothing else changed in the
  resolver.
- **`grid tidy --out` is checked before anything else** (`command/main.ts`, one line). Before
  this, `grid tidy plan.json --apply all --out ../../x.json` exited 0 when the plan had nothing
  to fix: nothing was written, but the path was never looked at. The new test found this.
- **`everyPath.e2e.test.ts`** (`packages/cli/src/command/__tests__/`), 22 tests that run the
  built `grid.mjs` as its own process with a project in a temporary folder:
  - every path slot of every command (13 slots, listed in `COMMAND_SLOTS`) gets each of the six
    T-5 paths. Each run must exit 1 with one line naming the path and the project folder, with
    nothing written anywhere;
  - every path argument of every tool (19 slots: `plan`, `plans` first and second, `out`) gets
    each of the six;
  - a link to a folder outside the project, through every command slot and every tool slot;
  - a trace image set to each T-5 path, through every plan-reading command (8, `draw --3d` and
    `write --replace` included) and every plan-reading tool (14). The trace image is also tried
    through a folder link and a file link that lead outside, and through `assets/../../outside`,
    which looks inside but leads out. A good trace image is accepted from the project root and
    from a folder outside it with `--project`, whether or not the picture is there yet;
  - **the listing guard**: the command list is read from `grid --help` and the tool list from
    the server's `tools/list`. The test fails when a command, a `plan`/`plans`/`out` tool
    argument, or any other free-text tool argument described as a file, folder or path is
    added without its slot in this file;
  - **every write lands under the project**: run from a folder outside the project with
    `--project`, and with `HOME`, `TMPDIR`, `TMP` and `TEMP` pointed at empty folders. It runs
    `export` in all four formats, `export --out`, `draw --out` (SVG and PNG), `sheet`,
    `tidy --out`, `write --plan`, then `grid_export`, `grid_sheet`, `grid_mirror`,
    `grid_move_room_side`, `grid_change_opening` (each with `out`) and `grid_write_rooms`.
    Every file must land under the project, the original plan must be unchanged, and the
    working folder, home, the temporary folder and the folder beside the project must stay
    empty or untouched.
- Unit tests for `resolve(…, 'project')` in `fs/__tests__/projectFiles.test.ts`.
- `AGENTS.md`: one sentence on the trace image and the new test, in the file-access bullet.

## done_when, one by one

1. **"All six T-5 cases and a symbolic link pointing outside the project are refused by the
   command and by the tool server."** Holds, now for every command and every tool, in both
   places the lab meant:
   - as a path argument: `everyPath.e2e.test.ts` "the six T-5 paths, given to every command…"
     and "…to every tool…", and "a symbolic link out of the project, in every slot". The deeper
     cases already on main are still in `paths.e2e.test.ts` (a file link, the `exports/` folder
     as a link, hard links);
   - as the plan's trace image: "the trace image a plan names (T-5)".
   File links are skipped on Windows, as on main (`LINK_CASES_SKIPPED_ON_WINDOWS`); folder
   links use junctions and run there. Not run on Windows.
2. **"A grep test finds no file read or write in packages/cli that bypasses the shared
   resolver."** This already held on main: `src/__tests__/fileAccess.test.ts`. It scans the
   source text with an allow-list, each entry with its reason, and builds `bin.ts` and
   `server.ts` with esbuild to check that only the resolver and the atomic writer reach Node's
   file modules. Nothing was changed there. It passes after the merge with main (CNT-12 and
   MSG-18 added no file access).
3. **"Exports, versions and proposals land only under the project folder (test with a project
   in a temporary directory)."** Holds for exports, and for every other file Grid writes
   today: "every file Grid writes lands under the project folder". **Versions (WRT-9) and
   proposals (WRT-5) don't exist on main yet**, so they can't be tested. When they are built,
   they can only write through `Project` (item 2's guard), and a new tool argument that takes
   a path fails the listing guard until it is given its slot, and so is held to the six cases
   and the link.

## Decisions for the owner

- **A bad trace image refuses the whole plan**, as a line break in a room name does (MSG-9),
  rather than being dropped with a note. Refusing is the safe default for a plan from a
  stranger, and the message says what to change. If you'd rather Grid read the plan and only
  ignore the image, that belongs in `traceImageCheck` and nowhere else.
- **No check of the picture's file type.** The lab's fix also asks for "a known picture
  ending". That is about what the viewer may open, not about where, so I left it to HND-10,
  which makes the viewer draw the image.
- **An absolute trace-image path inside the project is accepted**, as for every other path
  (the card refuses "absolute paths outside the root"). It won't travel with the plan to
  another computer. Refusing every absolute path here would be a one-line change.

## Checks run (after merging main at fc78ff7)

- `npm run build`: built.
- `npm run typecheck`: no errors.
- `npm run lint`: no problems.
- `npm run check:licenses`: "Checked 363 licences in package-lock.json: none is GPL, LGPL,
  AGPL, MPL, EPL."
- Full suite, `timeout 1500 npx vitest run --exclude '.claude/**' --minWorkers=1 --maxWorkers=2`
  (vitest 2.1.9 refuses `--maxWorkers=2` alone: "minThreads and maxThreads must not
  conflict"): 200 files, 4,256 tests passed in 1,348 s, run once, no failures.
- `npm run scoreboard`: "Same as the stored figures." in 175.8 s. No count moved, so
  `scoreboard/current.json` is unchanged.

## Left open / follow-ups

- `grid write rooms.txt --plan missing-folder/x.json` prints "something went wrong inside
  Grid" with a stack trace, because `write.ts` doesn't turn the resolver's `ENOENT` into a
  refusal. The tool server says it plainly ("Can't write …"). This is not a path that escapes
  the project; it is a wording bug in WRT-2's command.
- Still open from the first CMD-15 pass, unchanged: races between the check and the open
  (TOCTOU), hard-linked plan files can be read, and Windows has not been run.
- `everyPath.e2e.test.ts` starts about 250 Node processes. It took 40 to 60 s on this machine
  while other sessions were running, and its timeouts are 60 to 120 s per test.
