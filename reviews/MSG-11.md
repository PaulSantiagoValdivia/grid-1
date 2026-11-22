# MSG-11 review: Grid speaks every language, starting with Spanish

For the owner. What MSG-11 adds, how each `done_when` is met, every expectation that changed,
the results, and the choices taken while you were away.

## The design

- **One message file per language** in `packages/floorplan/src/messages/`: `en.ts`, the source,
  and `es.ts`, Spanish, marked "draft translation, not reviewed" in the file, in
  `LANGUAGE_STATUS` and in `docs/languages.md`. Plain data: keys named by what they say
  (`label`, `join.*`, `thing.*`, `read.*`, `issue.<code>`, `check.*`, `line.<code>.<field>`,
  `report.*`, `tool.check.*`, `describe.*`, `drawing.*`, `sheet.*`), values with named
  placeholders (`{width}`). The files live in `floorplan` so `rules`, `viewer` and `cli` all read
  them; they are data, so floorplan stays pure (the purity test still holds).
- **`say(language, key, values, { decimal })`** (`say.ts`) fills a wording. A value is data: a
  name or id from the plan (`name()`, quoted, never translated), a figure as Grid already
  rounds it (`num()`, written with the language's decimal mark), a count, another sentence
  (`said()`), or a list joined with the language's words (`joined()`). `sayParts` gives the same
  sentence as runs with the names set apart, for the notes.
- **The language is threaded like WRT-7's display.** `display.language` in the plan (optional,
  never defaulted, version stays "1"; `length` may now be left out and means metres;
  `coverage.ts` already places `display`), `--lang en|es` on `grid check`, `describe`, `draw` and
  `sheet`, and a `language` argument on `grid_check`, `grid_describe`, `grid_view` and
  `grid_sheet`. The call wins over the plan; English is the default. A language with a comma
  (Spanish) writes one unless the plan's `display.decimal` says otherwise (`statedDisplay`,
  `displayFor`). Figures from codes stay in metres in the check report (as WRT-7 left them).
- **Codes and values as data.** Every result line already had a code (MSG-1). Each line now also
  carries `values`: the figures, names, ids and places its words were made with, by the names
  its wording gives them, the same in every language. Each drawing-check `Issue` carries its
  sentence as `said` (key and values; `message` is its English, made from it). Findings that
  cannot be worded again from their fields (below ground, out of line), coverage reasons, reading
  faults and reading notes carry the same, as a property that is not enumerable, so every
  existing record compares and prints as before.
- **The result catalogue** (`rules/src/result/catalogue.ts`) is now logic only: for each of the
  132 codes, which values its wording takes and, where a code has several wordings, which one a
  line gets (`variant`). `wordLine(code, subject, language)` is the one place a line is worded.
  `inspectPlan(raw, { language, decimal })` says the record in the language; the record gains
  `language` when it is not English, and its checks' titles, coverage reasons and limits are
  said in it too.
- **The report around the lines** (`grid check`, `grid_check`'s text) says its words with `t()`
  (`cli/src/command/words.ts`), set for the one report being written, as `withDisplay` sets a
  drawing's display.
- **Room uses**: one fixed list, `ROOM_USES`, with a label per language (`uses.ts`,
  `USE_LABELS`). `readUse` reads a label of any language as the use, whatever its capitals and
  accents: `dormitorio` is `bedroom`, `Salón` is `living`. A room's `name` is never translated or
  changed.
- **Spanish is loaded only when asked** (`loadLanguage('es')`, a dynamic import), so it sits in
  its own chunk (`dist/chunks/es-*.mjs`, 117 kB) and the main file does not grow with it.
- **MSG-3 in Spanish**: `approvalWords` also holds cumple/cumplimiento, aprobado/apruebe,
  conforme/conformidad, homologado, certificado/certificación, válido/validez, autorizado,
  reglamentario and "supera la comprobación"; quoted names stay the person's words.

## The done_when items

1. **Every note and error has a code with its values as data, and a test fails on an English
   sentence built outside the message catalogue.** Every result line has its code and now its
   `values` (`rules/src/result/__tests__/language.test.ts`, "keeps every code, kind, thing,
   figure and value"; `result.test.ts` shows one). The guard is
   `packages/cli/src/__tests__/ownWords.test.ts`: it reads every user-facing source of the four
   packages and counts string literals that look like an English sentence (three words or more
   in a row). A file not on its list must have none; a listed file must have exactly its count,
   so a new sentence fails and a moved one asks for its count to come down; the total still to
   move may only fall. The parts MSG-11 moved are held at none ("keeps the moved parts at
   none"): the result catalogue and front door, the checks' wordings, figure words and coverage,
   every drawing check (`validate.ts` and the files it calls), the reader's faults, the drawings
   and the sheet. What is left is listed below, under "For the owner".
2. **The English and Spanish catalogues have the same keys** (`floorplan/src/messages/__tests__/
   languages.test.ts`: "have the same keys in every language", "give each key the same
   placeholders in every language"; `es` is typed `Record<MessageKey, string>`, so a missing key
   also fails the type check). Every use has a label in every language, each label once
   ("labels every use in every language").
3. **A Spanish report prints the Spanish label, decimal commas and Spanish use names, while room
   names stay as written ('dormitorio' maps to bedroom), and every Spanish line passes MSG-3's
   words, with Spanish ones added.** `cli/src/command/__tests__/language.e2e.test.ts` runs the
   built `grid check --lang es` on a plan whose uses are written `Dormitorio` and `salón` and
   whose bedroom is named "dormitorio": the first line is "Orientación general, no sus normas
   locales", the figures read `6,5 m²`, the use names are Spanish, the room's name is printed as
   written, the bedroom is checked as a bedroom, and `approvalWords` finds nothing. The plan's
   own `display.language` gives the same without `--lang`, and `display.decimal: point` keeps the
   point. `rules/.../language.test.ts` holds every line of the fixtures and every 40th lab plan
   to the same in Spanish ("never reads as a pass or as approval, in Spanish (MSG-3)"), checks no
   placeholder is left and no English is behind, and that a stated decimal point is kept.
   `describe/__tests__/language.test.ts`, `viewer/.../picture/__tests__/language.test.ts` and
   `cli/src/sheet/__tests__/language.test.ts` do the same for the description, the drawing and
   the sheet.

## Expectations that changed, and why

- `rules/src/result/__tests__/result.test.ts` ("names thick on a wall"): the line now has
  `values` (`name`, `nearest`, `place`, `word`), the new field of the record.
- `floorplan/src/__tests__/purity.test.ts`: the browser globals are looked for in the code
  without its string literals. A message key such as `line.item/blocks-window.says` names a
  window and reaches for none; the import checks are unchanged.
- `cli/src/sheet/__tests__/pages.test.ts`: the hand-made drawing problem now carries `said`,
  which `Issue` requires.
- `scoreboard/__tests__/allPairs/sweep.ts` (the door-sweep oracle): its issues are cast to the
  type, which now requires `said`; the comparison is of the enumerable fields, as before.
- `mcp/__tests__/tools.test.ts` needed no change: `grid_check`'s data has `language` (`en` or
  `es`) and its lines may have `values`, both in its output schema.
- No English output, golden file, snapshot or scoreboard figure changed. The agents that moved
  the drawing checks and the description compared every message of every lab plan before and
  after (3,196 drawing-check messages; 6,744 descriptions): byte for byte the same.

## Results

- **Full suite, first run** (before the message files were merged into one per language): 268
  of 271 files, 5,056 of 5,063 tests passed (4 skipped). The three failures: the describe help
  line (it now shows `[--lang en|es]`; the expectation is updated, see above), `grid_check`'s
  output schema (`language` is now always in its data), and `diff-size.test.ts`, a timing test
  that took 307 s under the full load and passes alone.
- **After the merge**, the 24 affected files (the message tests, the result record, the CLI's
  guard and label tests, the language and describe end-to-end tests, the tools test, the
  bundle-cap test in `grid.e2e`, `diff-size`): all 306 tests pass.
- **Full suite, second run** (on the commit): 275 of 275 files, 5,088 tests passed, 4 skipped (868 s).
- `npm run build`, `npm run typecheck`, `npm run lint`: clean.
- `npm run scoreboard`: the same as the stored figures (no count moved), 254.5 s.
- `dist/grid.mjs`: 420,933 bytes (cap 500,000; it was 413,148 before); Spanish is its own chunk,
  `dist/chunks/es-*.mjs`, 116,466 bytes, loaded only when Spanish is asked for.

## For the owner

1. **The Spanish needs a named architect's review.** Every Spanish word is a draft by an AI and
   is marked "draft translation, not reviewed" in `es.ts`, `uses.ts`, `LANGUAGE_STATUS` and
   `docs/languages.md`. No reviewer is recorded. The review should cover first the label,
   "Orientación general, no sus normas locales", then the building terms (the table in
   `docs/languages.md`: muro, estancia, hueco, planta, antepecho, aparato, salida, hueco de
   evacuación, valor, hallazgo, superficie útil, and the agents' additions: tabique, vacío,
   cota, cubierta, tramo, meseta, huella, contrahuella, caja del ascensor, croquis, cuadro,
   altura libre), the room-use labels (dormitorio, salón, comedor, aseo, lavadero, sala de
   culto, salón de actos, instalaciones…) and the forbidden words. Once reviewed, set
   `LANGUAGE_STATUS.es` to `reviewed` and record the reviewer's name in `docs/languages.md`.
2. **Other languages are out of scope for now.** The mechanism takes one more file and a row in
   `LANGUAGES`, `LANGUAGE_STATUS`, `LANGUAGE_DECIMAL` and `USE_LABELS`; each starts as a draft.
   `loadLanguage` loads `es` by name; a third language adds its own line there.
3. **Later steps**: right-to-left layout for the drawings, sheets and reports; fonts with CJK
   characters for the sheet and the drawings (the sheet's fonts cover Spanish, checked glyph by
   glyph); plural rules beyond one and many for languages that need them.
4. **What is left on the guard's list** (`ownWords.test.ts`), 1,635 literals in 96 files today,
   by kind:
   - *Shown to the person, not moved yet* (643): rooms text and its errors (`rooms/compile.ts`,
     `read.ts`, `words.ts`, `answer.ts`), the edit receipts (`edit/*`), the measuring and quantity
     reports (`quantities/*`, and the answers of `grid_areas`, `grid_takeoff`, `grid_schedule`,
     `grid_measure`, `grid_compare` and the edit tools), the notes (`notes/notes.ts` in floorplan
     and rules), the export files' own texts (IFC property descriptions, OBJ comments,
     `leftOut.ts`), the schema's refusals (`types/floorplan.ts`, `types/units.ts`, `planText.ts`,
     `types/sheet.ts`), the area rules (`geometry/areas.ts`), the plan diff summary, and the
     seen-marks, occupancy and report-draft files. In a Spanish report, a line about a name that
     breaks the text rule still says the schema's English reason, and an error a program throws
     (`plan/check-failed`) keeps its own text.
   - *Command-line help, usage and refusals* (270): the options' help, the usage lines and the
     refusals of a mistyped command (`command/*.ts`, `fs/projectFiles.ts`).
   - *Agent-facing, English by design* (471): the tools' descriptions and schemas, the protocol,
     the argument checks, the retelling rules, the lookup prompt, and `grid describe --for
     agent`'s fixed format.
   - *For people who build or install Grid* (230): the tolerance table's descriptions (mirrored in
     `docs/tolerances.md`), the sheet's coverage table, install and programming errors.
   - *Provenance as recorded* (7): what each figure measures, in `checks/figures.ts`; and the
     sources' names ("US model codes: IBC 2024 and IRC 2024"), which are data of the figure.
   - *Not words* (2): CSS class names and a font.
   The heuristic misses a sentence of fewer than three words (a heading such as "Key"), so short
   words in unmoved files are not counted; the moved files were moved whole.
5. **`display.length` may be left out.** To state only a language (`"display": { "language":
   "es" }`) the schema no longer requires `length`; left out, lengths are in metres. A display
   that states only `decimal` is now read rather than dropped as unreadable.
6. **"dormitorio" reads as bedroom although CNT-5 reads no guessed word as bedroom, living or
   dining.** A label is the use's own name in a language, not a word Grid guesses a use from, so
   the author still chose the use; `USE_WORDS` is unchanged.
7. **The check report's figures stay in metres**; only the decimal mark and the words follow the
   language (WRT-7 left the report in metres; MSG-11 keeps that).
8. **The size cap.** `dist/grid.mjs` is 420,933 bytes, under 500,000. Spanish is a
   chunk of its own; English sits in a shared chunk the main file imports. esbuild puts a module
   in the main file or a shared chunk by who imports it: when `draw/stamp.ts` stopped importing
   `@ongrid/rules`, about 120 kB of the rules package moved from a shared chunk into the main file
   (543 kB) with no change in what starts. `stamp.ts` imports the label from `@ongrid/rules` again
   for English, which puts it back. The cap counts the main file only, so it can move with an
   import like this; the total read at start did not change.
9. **Non-enumerable `said`.** To keep every record, comparison and JSON as it was, the sentence by
   key rides on issues, findings, faults, notes and coverage reasons as a property that is not
   enumerable. A spread copy drops it, and the line then falls back to the English `message`.
   The Spanish tests over the fixtures and lab plans find no English left, but a later spread
   could bring some back; an enumerable field (a record change) would be the sturdier choice.
10. **`grid describe --for agent`** keeps its fixed English format; only its label follows the
    language (the agent retells it).

## After merging main at c05d051

Main brought MSG-5 (notes traced to their cause, held notes, lines for several rooms), CNT-9
(facts of your own), CNT-8 (zones), COD-3 (the place), WRT-8 (`grid diff`), BRF-1 (the brief),
LVL-6 (sloped roofs), BRF-5 (the sun table) and VEW-3 (the camera and saved views). 30 files
conflicted. Main's English output is kept word for word; where main wrote words in a part MSG-11
had moved, they moved into the message files with a Spanish draft.

### How the conflicts were resolved

- **Drawing checks** (`validate.ts`, `wallFaults.ts`, `spaces.ts`, `zones.ts`, `roofs.ts`): MSG-5's
  `followOn` wraps MSG-11's worded issues, and now keeps their sentence (`withSaid` on the copy:
  a spread drops the property that is not enumerable). Main's new sentences are keys:
  `issue.plan/no-walls`, `issue.opening/missing-wall.roof`, `issue.opening/above-roof` (with its
  range, where and fit), `issue.floor/rooflight-misplaced` (its two problems, which `roofs.ts` now
  gives as sentences), `issue.floor/dormers-not-drawn.one|many`, `issue.room/zone-not-in-room`
  (its five reasons, which `zones.ts` now gives as sentences) and CNT-9's
  `issue.wall/duplicate.movingFacts|facts`. CNT-8's zone lines are left out of the spaces.
- **Reading** (`readParts.ts`): MSG-5's `leftOut` parts are worked out from the faults in
  English; both sides kept.
- **Plan checks** (`rules/check.ts`, `rules/messages.ts`): MSG-5's held notes and
  `cannotBeDrawnNotices` with MSG-11's saids; `check.roomsNotDrawn` and `check.doorsNotDrawn` take
  main's new wording (the doors' names listed).
- **Figure checks** (`checks/messages.ts`, `coverage.ts`, `figures.ts`, `place.ts`): COD-3's
  `noPlace` is `check.noPlace.none|one|many` (`noPlaceSaid` beside `noPlaceText`); the new skip
  reasons are `check.skip.no_place|waits_for_part|part_of_room`; `heldCoverage` gives its skips
  their sentence.
- **The record** (`result/catalogue.ts`, `inspect.ts`, `types.ts`, `index.ts`): every new code has
  its catalogue entry and its `line.<code>.*` keys (`plan/no-walls`, `opening/above-roof`,
  `room/zone-not-in-room`, `floor/rooflight-misplaced`, `floor/dormers-not-drawn`); main's rows for
  them were already in the contract's code table. MSG-5's lines for several rooms use a `.many`
  wording per language (`check.roomWithoutDoor.many` and nine more) instead of English made
  plural; `PLURALS`, which main's test reads lines back with, moved to `result/plurals.ts` and is
  exported as before. MSG-5's held notes are `line.part.held.*` and the `found.held` variants;
  CNT-8's "the whole room with its zones" is `line.room/too-small.found.whole[.zone]`. MSG-5's
  causes, `filed`, `problems`, COD-3's `place` and `withoutPlace` are kept; the place is named
  with its article in English (`the United States`) and by Grid's name in other languages.
- **The report** (`command/check.ts`, `mcp/readTools.ts`): COD-3's first line (`placeText`) is
  `report.place.*`; `PlaceWords` is now which caller asks (`command`, `tool`, `sheet`) instead of
  English text. MSG-5's problems count, "follows from", "held back" and the held lines are
  `report.problems*`, `report.follow*`, `report.cause*`, `report.held`, `report.followsFrom`,
  `report.heldBack` and `tool.check.line.follows`; COD-3's "not run" line is `report.notRun`. The
  coverage summary's "read them for" line goes, as main took it out (the place line says it), so
  `report.who.*` and `report.readThemFor` are removed.
- **Description, drawing, sheet** (`describe/card.ts`, `draw/views.ts`, `sheet/pages.ts`,
  viewer `planSvg.ts`, `scene.ts`, `writing.ts`): CNT-8's zone counts are
  `describe.count.zone.*`, `describe.roomsAndZones`, `describe.room.zoneOf` (the agent's form keeps
  its English). VEW-3's `cameraView` replaces `modelView` and `eyeView` and stamps the label in
  the language asked. The sheet takes CNT-8's zones, CNT-9's numbers and facts and COD-3's place
  line, said in the sheet's language. CNT-9's paint key and picked parts are drawn as main draws
  them; their words are the person's own values.
- **Commands and tools**: main's `--view`, `grid diff`, `grid mark` and MSG-11's `--lang` are all
  kept (`grid draw`'s usage lists both). The tools are main's 30, in main's order; MSG-11 adds
  none. `language` stays on `grid_check`, `grid_describe`, `grid_view` and `grid_sheet`.
- **Docs**: `CHANGELOG.md` keeps every Unreleased line; the contract keeps MSG-11's row and
  main's three (`causedBy`, `each`, `held`) and every agents' changelog section, MSG-11's first of
  the day, with a line on the new codes in Spanish. `docs/tool-server.md` keeps both sections.

### The ownWords guard

The moved parts stay at none. New files and new sentences of the kinds MSG-11 left for later
were listed (`ownWords.test.ts`), each by its kind:

- *Shown to the person, not moved yet* (+223): `diff/building.ts` 22, `types/places.ts` 7,
  `brief/lines.ts` 20, `brief/answer.ts` 2, `quantities/sun.ts` 13, `versions/diff.ts` 8,
  `versions/git.ts` 19, `versions/markers.ts` 18, and more in `geometry/areas.ts` (28 → 32),
  `export/ifc.ts` (23 → 31), `rooms/compile.ts` (106 → 108), `types/floorplan.ts` (22 → 37),
  `edit/edits.ts` (40 → 42), `edit/merge.ts` (10 → 23), `edit/split.ts` (18 → 20),
  `quantities/compare.ts` (18 → 19), `quantities/takeoff.ts` (9 → 10).
- *Command line* (+33, −1): `command/diff.ts` 13, `rules/checks/place.ts` 1 (the refusal of a
  place), `draw.ts` 25 → 28, `main.ts` 46 → 52, `planText.ts` 10 → 14, `write.ts` 21 → 23,
  `projectFiles.ts` 44 → 49; `check.ts` 11 → 10 (its report words moved).
- *Agent-facing* (not in the ratchet): `briefTool.ts` 36, `diffTools.ts` 20, `viewTool.ts` 15,
  `quantities/query.ts` 26, `brief/brief.ts` 40, `draw/cameraAsk.ts` 12, `geometry/camera.ts` 1,
  `readTools.ts` 204 → 261, `editTools.ts` 66 → 69, `protocol.ts` 15 → 16.
- *For people who build Grid* (not in the ratchet): `tolerances.ts` 169 → 186, `listing.ts`
  27 → 33, `sheet/coverage.ts` 15 → 21, `result/plurals.ts` 6.

The ratchet on what is shown to the person and not moved went from 913 to 1103. 2,070 literals
in 114 files are listed in all.

### Results

- `npm run build`: `dist/grid.mjs` 527,620 bytes; the Spanish chunk 127,343 bytes.
- `npm run typecheck`, `npm run lint`: clean.
- Floorplan `messages/`, `geometry/`, `types/` and all of `rules/src`: 129 files, 3,385 tests
  pass (1 skipped). One expectation of MSG-11's own changed: `rules/.../language.test.ts`
  ("dormitorio" is checked as a bedroom) now states a place, as COD-3 needs for the room sizes to
  be checked.
- Viewer `picture/` and the CLI's guard, `describe/`, `draw/`, `sheet/`, `mcp/` (tools, server,
  replay), `command/` (everyPath, grid.e2e, language.e2e), `brief/`, `versions/`, `quantities/`,
  `edit/` and `distribution/`: 96 files, 1,157 tests pass (1 skipped). `language.e2e.test.ts`'s plan
  now states its place (`site.country: "US"`), for the same reason. Main's tests and golden files
  pass unchanged.
- Not run here: the full suite and the scoreboard.

### For the owner

11. **The ratchet was raised, 913 to 1103.** Main's nine features added 190 unmoved sentences of
    the kinds MSG-11 left for later (edit receipts, the diff, the brief's lines, git and marker
    errors, the sun table, schema refusals). Moving them is follow-up work; the guard still fails
    on any new one.
12. **The bundle cap.** `dist/grid.mjs` is 527,620 bytes: under the 550,000 main's
    `grid.e2e` test holds it to since VEW-3 (main alone: 512,435), over the 500,000 MSG-11's review
    named. The cap was not raised here.
13. **Places are named in English.** COD-3's list of places has English names; a Spanish report
    says "Lugar: Spain" and "este plano es para United Kingdom" (without the English article).
    Names per language would be a row of Spanish names in `places.ts`.
14. **Facts of your own** (CNT-9) print as the person wrote them, in every language; a yes or no
    fact keeps Grid's English word for it in the sheet's schedules.

## After merging main at 8b599e9

Main moved on to 8b599e9, which brings LVL-8 (facades drawn from the model, and opening patterns).
Eight files conflicted.

- **Opening patterns**: `geometry/patterns.ts`'s problems are worded by key with their sentence
  (`issue.pattern/…`, `issue.part.Named.pattern`), so `validatePlan`'s first issues carry `said`
  as every other drawing problem does. The six `pattern/…` codes have their catalogue entries and
  `line.pattern/…` keys; the new kind of thing is `thing.pattern`, `thing.at.pattern`,
  `report.thing.pattern` and `line.part.fieldsOf.patterns`. The record keeps LVL-8's split: the
  drawing check reads the plan as stated, the other checks the openings the patterns place.
- **Facades**: the viewer's `facade.ts` says its caption, its title and "nothing faces" by key
  (`drawing.facade.*`, with `describe.way.*` for the way a side faces), in the language asked or
  the plan's own. `grid draw --facade` takes `--lang`, `grid_view kind=facade` takes `language`,
  and the picture's accessible name is its title when it has one. The facade answer's text in
  `grid_view` stays the tool's English, as the other kinds' texts do.
- **Rooms text**: `grid describe --as rooms`'s note about opening patterns is
  `describe.rooms.patterns.one|many`, under the label, in the language asked.
- `grid draw`'s usage lists `--facade` and `--lang`; the changelog and the contract keep both
  sides, MSG-11's section first of the day, with the pattern codes and the facade's caption named
  in its line on the new codes.
- **ownWords**: `facade.ts` keeps two programming errors (`developer`); `draw.ts` 28 → 34 and
  `planText.ts` 14 → 15 (command), `types/floorplan.ts` 37 → 38 (schema refusal),
  `tolerances.ts` 186 → 192, `readTools.ts` 261 → 271. The ratchet moves from 1103 to 1111;
  2,096 literals in 115 files are listed in all.

### Results after 8b599e9

- `npm run build`: `dist/grid.mjs` 532,095 bytes (under main's 550,000); the Spanish chunk
  133,465 bytes.
- `npm run typecheck`, `npm run lint`: clean.
- Floorplan `messages/`, `geometry/`, `types/`, all of `rules/src` and viewer `picture/`: 148
  files, 3,522 tests pass (1 skipped).
- The CLI's guard, `describe/`, `draw/`, `sheet/`, `mcp/`, `command/`, `brief/`, `versions/`,
  `quantities/`, `edit/` and `distribution/`: 82 files, 1,072 tests pass (1 skipped). No
  expectation changed in this merge.
- By hand: `grid draw --facade south --lang es` names the picture "Fachada sur del plano, 2
  plantas en sus niveles" and writes its caption and label in Spanish.
- Not run here: the full suite and the scoreboard.

### For the owner (8b599e9)

15. **Main has moved again**, to 8a43380 (HND-1, the DXF), after 8b599e9. It is not merged here;
    that is the next merge.
16. A facade's level marks (`+2.95`) keep their decimal point in every language, as main draws
    them; the words around them follow the language.

## After merging main at 8a43380

Main's HND-1 (a DXF a drafter can keep working in) merged with two conflicts, the changelog and
the contract, both kept whole (MSG-11's section first of the day). The DXF's own texts (its label,
layer names and room tags) stay as main writes them: the export files' texts are among what
MSG-11 left in English. ownWords: the profile's refusals are listed as the command line's
(`geometry/export/dxfProfile.ts` 8, `export/dxfProfile.ts` 5, `command/export.ts` 16 → 17), and
`writeTools.ts` 92 → 93; the ratchet moves from 1111 to 1125, 2,111 literals in 117 files in all.

- `npm run build`: `dist/grid.mjs` 533,616 bytes (under main's 550,000); the Spanish chunk 133,465
  bytes. `npm run typecheck` and `npm run lint`: clean.
- Floorplan `geometry/` (the DXF and profile tests among them), `export/`, `messages/`, `types/`,
  rules `result/`, and the CLI's guard, `export/`, `command/` and `mcp/`: 173 files, 3,908 tests
  pass (2 skipped). No expectation changed. The full suite and the scoreboard were not run here.

## After merging main at 26e928e1

Main brought BRF-3 (the plot: its boundary, street edges, set-backs, the distances to them and
the site's things) and WRT-4 (repeat, floors copied from their line, rooms through floors, quarter
turns, and a mirrored or turned plan recognised by `grid diff`). Ten files conflicted. Main adds
no tool and no top-level plan field (the plot is under `site`, which `coverage.ts` already places,
now `drawn`). Main's English output is kept word for word.

### How the conflicts were resolved

- **The plot check** (`geometry/rules/check.ts`, `rules/messages.ts`, `rules/catalogue.ts`,
  `rules/types.ts`): the findings `setback_short` and `over_boundary` carry their sentence
  (`withSentence`) from `saids.setbackShort` and `saids.overBoundary` (`check.setbackShort`,
  `check.overBoundary`, `check.asked[.assumed]`); main's `askedText`, `setbackShortText` and
  `overBoundaryText` stay exported, as their English. An edge is named by
  `boundaryEdgeSaid` in `plot.ts` (`check.boundary.edge[.numbered]`, the way from
  `describe.way.*`), and `BoundaryEdge.name` is its English, as before. The notice
  `boundary_not_measured` is worded per reason (`check.boundaryNotMeasured.*`) from the site's
  reason by key (`SiteMeasures.whySaid`, not enumerable, `check.siteWhy.*`); `NotChecked` gains
  the optional, not enumerable `said` that findings already had. The check's title is
  `check.title.site-boundary`; main's new limit is `check.limit.plan.5`, and the structure limit,
  which stays last, is now `check.limit.plan.6`.
- **The drawing check** (`validate.ts`, `plot.ts`): `plan/boundary-crosses` is
  `issue.plan/boundary-crosses`, with the problem by key (`ringFault`, `issue.part.boundary.*`);
  `ringProblem` stays, as its English.
- **Skip reasons** (`checks/coverage.ts`): `check.skip.no_building_outline` and
  `check.skip.boundary_not_closed`; the report's parts for `looksAt: "edge"` are
  `report.parts.edge.one|many|none` (`command/check.ts`).
- **The record** (`result/catalogue.ts`, `inspect.ts`): the five new codes have their catalogue
  entries and `line.<code>.*` keys. `plan/setback-short` and `plan/over-boundary` word their found
  and needed from the finding's `boundary` (`line.part.edgeFaces*`, `line.part.setbackWho*`,
  `line.part.setbackFrom.*`), and their lines' `values` hold `edge`, `distance`, `past` and
  `asked`. The site's things are counted by key (`siteThingsSaid`, `line.part.siteThing.*`;
  `siteThingsText` is its English). The stage `site` is `line.part.stage.site`. The new sketch fix
  replaces `line.floor/sketch-drawn-only.fix` in both languages. The contract's code-table rows are
  main's.
- **Describe** (`command/describe.ts`): the person's form says the plot by key, in
  `describe/site.ts` (`describe.site.*`), as `personFacing` does for north; the agent's form keeps
  main's `siteDescription`.
- **The drawing** (`viewer/scene.ts`): both imports; the site is drawn with no words.
- **Docs**: `CHANGELOG.md` keeps every Unreleased line; the contract keeps MSG-11's section first of
  the day, with a line on BRF-3's codes in Spanish, then main's WRT-4 and BRF-3 sections.
  `docs/languages.md` adds the plot's Spanish terms (parcela, linde, tramo, retranqueo, ocupación
  de la parcela).

New keys, in `en.ts` with main's English and in `es.ts` as a draft: `join.space`;
`issue.plan/boundary-crosses`, `issue.part.boundary.*` (4); `check.boundary.edge[.numbered]`,
`check.asked[.assumed]`, `check.setbackShort`, `check.overBoundary`, `check.siteWhy.*` (4),
`check.boundaryNotMeasured.*` (4), `check.title.site-boundary`, `check.limit.plan.6`,
`check.skip.no_building_outline`, `check.skip.boundary_not_closed`; `line.part.siteThing.*` (12),
`line.part.edgeFaces[.noNorth|.street]`, `line.part.setbackWho[.assumed]`,
`line.part.setbackFrom.*` (3), `line.part.stage.site`; the `line.*` keys of `plan/setback-short`
(7), `plan/over-boundary` (6), `plan/site-things-drawn-only` (4), `plan/not-checked-boundary` (5)
and `plan/boundary-crosses` (3); `report.parts.edge.*` (3); `describe.site.*` (7).

### The ownWords guard

`plot.ts`, `geometry/site.ts`, `describe/site.ts` and the moved parts are at none. Listed:

- *Shown to the person, not moved yet* (+57): `quantities/site.ts` 19 (the `grid_measure
  what=site` answer, as `sun.ts`), `geometry/diff/turn.ts` 7, `diff/building.ts` 22 → 25,
  `notes/notes.ts` 15 → 17, `rooms/compile.ts` 108 → 115, `types/floorplan.ts` 38 → 50 (schema
  refusals of the site), `edit/edits.ts` 42 → 49.
- *Command line* (+6): `planText.ts` 15 → 18, `write.ts` 23 → 26.
- Not in the ratchet: `writeTools.ts` 93 → 99 (tools), `tolerances.ts` 192 → 197 and
  `sheet/coverage.ts` 21 → 20 (developer).

The ratchet moves from 1125 to 1188; 2,184 literals in 119 files are listed in all.

### Results after 26e928e1

- `npm run build`: `dist/grid.mjs` 548,593 bytes, under main's 550,000 (1,407 bytes to spare); the
  Spanish chunk 140,997 bytes.
- `npm run typecheck`, `npm run lint`: clean.
- Floorplan `messages/`, `geometry/`, `types/`, `rooms/`, all of `rules/src` and viewer `picture/`:
  156 files, 3,609 tests pass (1 skipped).
- The CLI's guard, `describe/`, `draw/`, `sheet/`, `mcp/` (tools, server, replay, BRF-3's `site`
  and `facing` tests), `command/` (everyPath, grid.e2e, language.e2e, the short report),
  `versions/` (WRT-4's diff), `edit/` and `quantities/`: 81 files, 1,033 tests pass (1 skipped).
  No expectation changed in this merge; main's tests and golden files pass unchanged.
- By hand: `grid check --lang es` on a house 0.90 m from the east edge where 3 m was asked says
  "El edificio está a 0,90 m de la linde este; pidió 3,00 m", with its found, needed and fix in
  Spanish; `grid describe --lang es` says "La parcela: 450,00 m², con un 20,9 % ocupado por el
  edificio; …"; the English is main's.
- Not run here: the full suite and the scoreboard.

### For the owner (26e928e1)

17. **The ratchet was raised, 1125 to 1188.** BRF-3 and WRT-4 added 63 unmoved sentences of the
    kinds MSG-11 left for later: rooms text's `repeat`, `copy` and `through`, the edit receipts
    of a turn, the diff's turn line, the site's schema refusals, the plot's notes and the
    `grid_measure what=site` answer. Everything the check report, the record, the drawing check
    and the person's description say about the plot is moved.
18. **The bundle cap is close.** 548,593 of 550,000 bytes. The next merge that adds code to the main
    file may need a cap decision, or English moved out of `en.ts` into a chunk of its own.
19. **Spanish terms for the plot are a draft**: "linde" for the boundary and "tramo" for its edge
    (so "la linde este (tramo 2)"), "retranqueo" for set-back, "parcela", "ocupación de la
    parcela", and "cancela" for a gate. A floor's outline reason (`outline.ts`) inside the
    "not measured" notice stays English, as the other measures give it.

## After merging main at e486ccba

Main brought LVL-9 (sections drawn from the model, and level, elevation and section marks on a
plan) and CNT-17 (accessibility measurements, as numbers only until a named person confirms a
figure). Seven files conflicted: `CHANGELOG.md`, `docs/result-contract.md`, `command/draw.ts`,
`command/main.ts`, `draw/views.ts`, `mcp/readTools.ts` and viewer `picture/planSvg.ts`. Main adds
no tool (`kind=section` on `grid_view` and `what=access` on `grid_measure` are arguments) and one
top-level plan field, `accessible`, which main already placed in `sheet/coverage.ts` and in the
field list of `result.test.ts`. Main's English output is kept word for word.

### How the conflicts were resolved

- **`grid draw`** (`command/draw.ts`, `command/main.ts`): both sides' options stay: main's
  `--section`, `--toward` and `--marks`, and `--lang`; the usage line lists them all, `--lang`
  before `--project`. A section is drawn in the language asked for, else the plan's own, as a
  facade is; main's `sectionAsked` result is named `drawing` in `drawFile`, as `asked` already
  held the language. The marks go on the plan with MSG-11's display and language.
- **`grid_view`** (`mcp/readTools.ts`): `language`, `cut` and `marks` are all arguments; MSG-11's
  imports with main's `confirmedFigure`. `kind=section` passes the language to the picture
  (`sectionAnswer`, `sectionView`); the answer's text and `data.section.assumed[].words` stay the
  tool's English, as the facade's do. A plan's marks are drawn with its language
  (`planView` takes both).
- **The pictures** (`picture/planSvg.ts`, `draw/views.ts`): `language` and `marks` both in
  `PictureOptions`; `planPicture` keeps MSG-11's words and main's marks; the elevation marks'
  letters are `drawing.mark.faces.*` (N, NE … in English; N, NE, E, SE, S, SO, O, NO in Spanish).
  A picture with a title and a key (a section, with its list under it) is named as main names it,
  `{title}, and a key of what to look at` (`drawing.picture.titled.keyed`): MSG-11 had given a
  titled picture its title alone, which no picture with a key had been until LVL-9.
- **The section's words**: `geometry/section.ts`'s list of what Grid took is worded by key
  (`drawing.section.taken.*`): each `SectionAssumption` carries its sentence as `said`, not
  enumerable, and `words` is its English, as before. The viewer's `section.ts` says its title,
  caption, key headings, roof and ground level names and room heights by key
  (`drawing.section.*`), takes `language` and sets the picture's `language`, so the label and the
  accessible name follow it. `grid draw --section`'s line on standard error is
  `drawing.section.note*` (`drawSection.ts`).
- **CNT-17's line** (`result/catalogue.ts`, `inspect.ts`): `plan/not-checked-access` is logic only
  (`{}`) with `line.plan/not-checked-access.*` in both languages; its counts are
  `line.part.accessCount.room|route.one|many`, joined with `join.and`; the stage is
  `line.part.stage.accessible`. Main's contract row stays.
- **Docs**: `CHANGELOG.md` keeps every Unreleased line; the contract keeps MSG-11's section first
  of the day, with a line on CNT-17's code and LVL-9's section in Spanish, then main's CNT-17 and
  LVL-9 sections. `docs/commands.md` and `docs/tool-server.md` say that a section's and a plan's
  marks' words follow the language; `docs/languages.md` adds the section's and the mark's terms.

New keys (52), in `en.ts` with main's English and in `es.ts` as a draft: `drawing.section.name`,
`.title.one|many`, `.point`, `.line.left|right`, `.hatched`, `.listed`, `.roof`, `.ground`,
`.height`, `.roofShape.mono-pitch|gable|hip`, `.taken.slab`, `.taken.roof.none|flat|sloped`,
`.taken.wallHeight.one|many`, `.taken.marked.one|many`, `.taken.ground`, `.taken.level`,
`.taken.roomHeight.one|many`, `.taken.noStair.one|many`, `.taken.risers`, `.note`,
`.note.hatched.one|many`, `.note.listed.one|many` (34); `drawing.mark.faces.*` (8);
`line.part.accessCount.room|route.one|many` (4), `line.part.stage.accessible`, and
`line.plan/not-checked-access.says|found|needed|fix` (4); `drawing.picture.titled.keyed`.

New tests: viewer `picture/__tests__/language.test.ts` (a Spanish section of the lab townhouse:
title, caption with `(4,90; -2,00)`, levels, heights and every sentence of what was taken in
Spanish; English as main draws it, with `said` not enumerable; the elevation marks' letters) and
rules `result/__tests__/language.test.ts` (`plan/not-checked-access` in Spanish, same code, thing
and ids, no word of approval).

### The ownWords guard

`geometry/section.ts`, viewer `drawingMarks.ts` and `draw/drawSection.ts` are at none, and are
added to the list held at none. Listed:

- *Shown to the person, not moved yet* (+49): `quantities/access.ts` 49, the `grid_measure
  what=access` answer, as `sun.ts` and `site.ts` are.
- *Command line* (+16): `command/section.ts` 6 (the refusals of `--section`, `--toward`, `--marks`),
  `draw.ts` 34 → 44.
- Not in the ratchet: `readTools.ts` 271 → 284 and `sectionAnswer.ts` 5 (tools);
  `tolerances.ts` 197 → 201, `sheet/coverage.ts` 20 → 21 and viewer `picture/section.ts` 1 (its
  width error, as `facade.ts`'s) (developer).

The ratchet moves from 1188 to 1253.

### Results after e486ccba

- `npm run build`: `dist/grid.mjs` 538,894 bytes, under the 550,000 this merge was asked to hold and
  under main's cap, which CNT-17 raised to 600,000 (`grid.e2e`); the Spanish chunk 145,973 bytes.
  It is smaller than before the merge (548,593) and than main alone (555,889, by main's own
  comment): the section's drawing and answer load only when a section is drawn (main's dynamic
  imports of `drawSection` and `sectionAnswer`), and esbuild places a module shared by the main
  file and a chunk in a shared chunk, so the split moved with main's new imports (as item 8
  describes). Nothing was moved by hand and the cap was not touched.
- `npm run typecheck`, `npm run lint`: clean.
- Floorplan `messages/`, `geometry/` (LVL-9's `section.test.ts` among them), `types/` (CNT-17's
  `accessible.test.ts`), all of `rules/src` (CNT-17's `confirmed.test.ts` and `access.test.ts`) and
  viewer `picture/` (LVL-9's `section.test.ts`): 158 files, 3,612 tests pass (1 skipped). In the
  first run the diff size guard (`diffs 1,000 entities … well inside a second`) took 22 s under
  load; it passed in the full rerun.
- The CLI's guard, `describe/`, `draw/`, `sheet/`, `mcp/` (tools, server, replay, LVL-9's
  `sectionView` and CNT-17's `access` tests), `command/` (everyPath, grid.e2e, language.e2e) and
  `quantities/`: 73 files, 940 tests pass (1 skipped). No expectation of main's changed; main's
  tests and golden files pass unchanged.
- By hand: `grid draw --section 2,-1:2,9 --toward right --lang es` on the two-bed flat names the
  picture "Sección A–A, que corta 2 estancias", writes "Corte de (2,00; -1,00) a (2,00; 9,00),
  mirando a la derecha de la línea…", the levels "+2.850 Cubierta" and "±0.000 Terreno", the
  heights "2,60 m" and each thing taken in Spanish, and prints "La sección raya 2 partes y enumera
  2 cosas que el plano no indica…" on standard error; without `--lang` it is main's English.
  `grid check --lang es` on a plan marking a room accessible says "Lo que el plano marca como que
  debe ser accesible (1 estancia) no se ha comprobado…".
- Not run here: the full suite and the scoreboard.

### For the owner (e486ccba)

20. **The ratchet was raised, 1188 to 1253.** CNT-17's `grid_measure what=access` answer (49
    sentences in `quantities/access.ts`) is left in English, as the other `grid_measure` answers
    (`sun.ts`, `site.ts`, `use.ts`) are: `grid_measure` takes no `language`, so moving its words
    would give a Spanish no call can ask for. Moving the measuring answers together, with a
    `language` on `grid_measure`, is follow-up work. LVL-9's refusals of `--section`, `--toward` and
    `--marks` (16) are the command line's, as before. Everything a person sees on a section, on a
    plan's marks, and in the record line about what is marked accessible is moved.
21. **A section's decimal mark.** Main writes a section in metres whatever the plan's display says
    (it refuses `--units` and `--decimal` with `--section`). So in English the section keeps the
    point, as main draws it; in another language its heights, its line's points and the figures in
    its list take the language's mark, or the one the plan's display states. The level marks
    (`+2.850`, `±0.000`) keep their point in every language, as a facade's do. A point is written
    `(2,00; -1,00)` in Spanish, a semicolon between the two figures.
22. **`grid_view kind=section`'s text and `data.section.assumed[].words` stay English**, as the
    facade's answer does: the agent retells them; the picture is in the language asked for.
23. **Spanish terms to review**: "Sección A–A, que corta N estancias", "forjado" for slab, "alero"
    for eaves, "rayado" for hatched, "Terreno" and "Cubierta" for the ground and roof levels,
    "cubierta de una vertiente, a dos aguas, a cuatro aguas", "SO", "O" and "NO" on the elevation
    marks, "recorrido" for a route, and "el programa de necesidades" for the brief in the
    accessibility line. All are drafts, in `docs/languages.md`'s table.
