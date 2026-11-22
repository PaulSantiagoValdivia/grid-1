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
24. **Main has moved again**, to 4fe29edc (COD-8, a firm's own standards as checks), while this
    merge was made. It is not merged here; that is the next merge.

## After merging main at 4fe29edc

Main brought COD-8: a firm's own standards (`firm-standards.json` beside the plan) set against
the plan as `firm/` findings, under their own heading, apart from the code figures, and four
skills in the plugin. Seven files conflicted: `CHANGELOG.md`, `docs/result-contract.md`,
`command/check.ts`, `command/main.ts`, `mcp/readTools.ts`, rules `result/catalogue.ts` and
`result/inspect.ts`. Main adds no tool and no plan field. Main's English output is kept word for
word.

### How the conflicts were resolved

- **The record** (`result/catalogue.ts`, `inspect.ts`, `firm.ts`): MSG-11's files, with COD-8's
  parts added. The seven codes are logic only: `firmEntry(measure)` gives a `firm/` line its
  values (`figure`, `measured`, `what`, `measures`, `named`, `file`, `where`) and the `none`
  wording of `says` and `found` when nothing was measured; `firm/not-read` takes `file`. The
  words are `line.firm/<code>.says[.none]|found[.none]|needed|fix`. `firmLines`, the `firm` field
  on a line and on the record, and `InspectOptions.firm` are main's, beside MSG-11's `language`;
  the stage is `firm` (`line.part.stage.firm`, "firm standards"). A part left empty (no name, no
  place) is no longer put in a line's `values`, so a firm line's values are `figure`, `measured`,
  `file` and the line's names.
- **The firm's own words** (`firm.ts`): `FIRM_HEADING`, `FIRM_NOTE` and each measure's `what` and
  `measures` are now read from `en.ts` (`report.firm.title`, `report.firm.note`,
  `line.part.firm.what.*`, `line.part.firm.measures.*`), the same English; `FirmUsed.heading` is
  typed `string` instead of the literal. `FirmMeasured` gains an optional `sentence` (the place it
  was measured, by key); `said` stays its English.
- **Where each part was measured** (`firm/measure.ts`): said by key (`line.part.firm.at.*`,
  `line.part.firm.point`), with `said` its English as main writes it; `besideSaid` says what
  `besideText` (`quantities/use.ts`) says.
- **The report** (`command/check.ts`, `command/main.ts`): MSG-11's `checkPlan` with main's `firm`
  passed to `inspectPlan`; `countsText`, `firmHeadingText`, `firmNoNoteText`, `firmStandardsText`
  and the new `firmSectionTitle` say their words with `t()` (`report.count.firm.*`,
  `report.firm.*`); a standard's room uses are said by their label in the report's language.
  `grid check` reads the firm's file and passes the language and the firm.
- **`grid_check`** (`mcp/readTools.ts`): the firm's heading, the firm lines past the first 12
  (`tool.check.firm.more`), "no findings outside the firm's own standards"
  (`tool.check.firm.noCodeFindings`) and the full list of standards, inside MSG-11's
  `inLanguage`; `data.firm` is main's. Main gave the output schema an explicit list of what is
  always there; `language` is added to it, as MSG-11's data always has it.
- **Docs**: `CHANGELOG.md` keeps every Unreleased line; the contract keeps MSG-11's section first
  of the day, with a line on COD-8 in Spanish, then main's COD-8 section and its code-table rows.

New keys (90), in `en.ts` with main's English and in `es.ts` as a draft: `line.part.firm.what.*`
(6), `line.part.firm.measures.*` (6), `line.part.firm.named`, `line.part.firm.where`,
`line.part.firm.point`, `line.part.firm.at.*` (16), `line.firm/<code>.*` for the six measures (36)
and `firm/not-read` (3), `line.part.stage.firm`; `report.firm.*` (15), `report.count.firm.all|some`,
`tool.check.firm.more|noCodeFindings`.

A test in rules `result/__tests__/language.test.ts` says a `firm/corridor-width` line in Spanish:
the message, the found with its place, the needed, the same code, `firm` and values, no word of
approval and no placeholder left.

### The ownWords guard

`rules/src/result/firm.ts` and `cli/src/firm/measure.ts` are at none, and are added to the list
held at none. Listed: `firm/standards.ts` 18 (the refusals of a firm's file, as the command
line's), `readTools.ts` 284 → 285 (the tool's description), `distribution/listing.ts` 33 → 82
(the plugin's four new skills, English for the agent, under "developer" with the rest of the
listing). The ratchet moves from 1253 to 1271.

### Results after 4fe29edc

- `npm run build`: `dist/grid.mjs` 550,002 bytes, under main's cap of 600,000 in `grid.e2e` (raised
  by CNT-17); the Spanish chunk 156,388 bytes. COD-8's measuring is called by every `grid check`,
  so it is in the main file; nothing was moved and the cap was not touched.
- `npm run typecheck`, `npm run lint`: clean.
- All of rules `src` (COD-8's `firm.test.ts`, `contract.test.ts` among them), floorplan
  `messages/` and `types/`, viewer `picture/__tests__/language.test.ts`: 45 files, 624 tests pass.
- The CLI's guard, `firm/` (COD-8's `firm.test.ts`, `standards.test.ts`), `mcp/` (tools, server,
  replay), `command/` (everyPath, grid.e2e, language.e2e), `distribution/` (COD-8's
  `listing.test.ts`), `describe/`, `draw/`, `sheet/`, `quantities/` and the scoreboard's
  `approvalWords.test.ts`: 78 files, 1,009 tests pass (1 skipped); `grid.e2e`'s speed test (grid
  check under 500 ms) took 3.4 s under that load and passes alone. No expectation of main's
  changed; main's tests pass unchanged.
- By hand: `grid check --lang es --full` beside a firm's file of a door width and a room area says
  "Para revisar (8): 8 hallazgos de las normas propias del estudio.", the heading "Las normas
  propias del estudio (8), de "firm-standards.json": …", each line with its found ("0,75 m, su
  hueco de 0,80 m menos 0,05 m de la hoja abierta y su tope; medido como …"), "Ningún hallazgo
  fuera de las normas propias del estudio. …" and the list of the standards; without `--lang` it is
  main's English.
- Not run here: the full suite and the scoreboard.

### For the owner (4fe29edc)

25. **The ratchet was raised, 1253 to 1271**, by the 18 refusals of a firm's file
    (`firm/standards.ts`), which stay in English as the plan's own schema refusals do. In a
    Spanish report, `firm/not-read`'s found (why the file was not read) is that English.
26. **"The firm" is "el estudio"** in the Spanish draft ("Las normas propias del estudio", "el
    valor propio del estudio"), and a standard is "norma". A reviewer may prefer "despacho" or
    "la empresa"; it is one word in `es.ts`'s `report.firm.*` and `line.firm/*` keys.
27. **The record's `firm.heading` stays English** in every language, as data, like the codes; the
    heading in the text is said in the language.
28. **The main file is 550,002 bytes**, 2 bytes over the 550,000 this branch held to before CNT-17
    raised main's cap to 600,000; the cap in force is main's.

## After merging main at 90a933b1

Main brought HND-11: a survey drawn from its own numbers. A wall may be placed by a face
(`face`), a plan keeps lengths taped on site (`taped`, a new top-level field) and every run sets
each against the drawing, and a plan at survey coordinates states `site.origin`, which the
far-from-origin check measures from and the exports write from. Eight files conflicted:
`CHANGELOG.md`, `docs/result-contract.md`, `mcp/readTools.ts`, floorplan `geometry/validate.ts`,
rules `result/__tests__/result.test.ts`, `result/catalogue.ts`, `result/inspect.ts` and
`result/types.ts`. Main adds no tool. Main's English output is kept word for word.

### How the conflicts were resolved

- **The record** (`result/catalogue.ts`, `inspect.ts`, `types.ts`): MSG-11's files, with HND-11's
  parts added. `room/taped-differs` and `plan/taped-not-measured` are logic only: `tapedValues`
  gives a line what was taped (`what`, and `What` as a sentence starts it), the two figures
  (`figures`) and, as data, `taped`, `drawn`, `off` and `within` in metres; a `.none` wording
  keeps main's fallback for a line with no taped row. `Subject.taped` is now the row's figures
  (`Pick<TapedRow, …>`) instead of main's three English strings, and the catalogue says them.
  The `taped` stage is in `Stage` (`line.part.stage.taped`); `record(…, taped, firm)` and the
  record's `taped` are main's, beside MSG-11's `language`. A taped length naming no room is
  labelled `issue.part.named.room` (`room "x"`, main's English).
- **The taped lengths in words** (floorplan `geometry/taped.ts`): `tapedWhatSaid`,
  `tapedFiguresSaid`, `tapedWithinSaid` and `tapedMissingSaid` give each a sentence by key
  (`line.part.taped.*`); main's `tapedWhatText`, `tapedFiguresText`, `tapedWithinText` and
  `tapedMissingText` stay, as their English.
- **The table** (cli `taped/table.ts`): its heading, count, columns, states and "… and n more"
  are `report.taped.*`, said with `t()`, so `grid check` and `grid_check` give it in the
  report's language. A change's answer (the edit tools, `grid edit`, `grid write`,
  `grid_write_rooms`), not moved yet, calls it outside `inLanguage` and stays English.
- **`plan/far-from-origin`** (`validate.ts`): MSG-11's `said` with a new `{from}` value, `the
  origin` or `its site's origin (x, y)` (`issue.part.origin[.site]`, the point by
  `issue.part.point`); the line's `needed` and `fix` take main's new English.
- **A GLB's origin note** (`geometry/export/gltf.ts`): main's `asset.extras.gridOrigin.note` is
  `drawing.glb.origin`, said in English as the file's own words, so the file stays at none.
- **`grid_check`** (`mcp/readTools.ts`): MSG-11's `inLanguage` body with main's table after the
  firm's note and `taped` in the data; the output schema's list of what is always there has both
  `language` and `taped`.
- **Tests and docs**: `result.test.ts` keeps MSG-11's `values` and takes main's `face` in a
  wall's fields; the plan's field list is main's (`taped` after `accessible`), and
  `sheet/coverage.ts` is main's. `CHANGELOG.md` keeps every Unreleased line; the contract keeps
  MSG-11's section first of the day, with a line on HND-11 in Spanish, then main's HND-11 section
  and its two code-table rows.

New keys (46), in `en.ts` with main's English and in `es.ts` as a draft: `issue.part.origin`,
`issue.part.origin.site`, `drawing.glb.origin`, `line.part.stage.taped`, `line.part.taped.*`
(14), `line.room/taped-differs.*` (7), `line.plan/taped-not-measured.*` (5), `report.taped.*`
(16). Changed to main's English: `issue.plan/far-from-origin` (takes `{from}`),
`line.plan/far-from-origin.needed` and `.fix`.

A test in rules `result/__tests__/language.test.ts` says a `room/taped-differs` and a
`plan/taped-not-measured` line in English (main's words) and in Spanish: the message, found and
needed, the same code, kind, thing, `also` and values, the same `taped` rows, no word of approval
and no placeholder left.

### The ownWords guard

`floorplan/src/geometry/taped.ts`, `cli/src/taped/table.ts` and `floorplan/src/geometry/export/gltf.ts`
are at none, and are added to the list held at none. Listed: `types/floorplan.ts` 50 → 53 (the
three refusals of a taped length in the plan's schema, English as the schema's other refusals),
`geometry/tolerances.ts` 201 → 205 (`tapedAgree`'s description and `farFromOrigin`'s new one,
for docs/tolerances.md), `sheet/coverage.ts` 21 → 22 (why the sheet does not show `taped`). The
ratchet moves from 1271 to 1274, by the three schema refusals.

### Results after 90a933b1

- `npm run build`: `dist/grid.mjs` 552,385 bytes, under main's cap of 600,000 in `grid.e2e`; the
  Spanish chunk 160,420 bytes. The cap was not touched.
- `npm run typecheck`, `npm run lint`: clean.
- All of rules `src`, floorplan `messages/`, `geometry/` (HND-11's `survey.test.ts` and the
  export tests among them), `types/` and `export/`, viewer `picture/`: 165 files, 3,691 tests
  pass (1 skipped). `diff-size`'s one-second test failed once at 1,010 ms in a run under the
  load of other sessions' suites, and passed on the rerun.
- The CLI's guard, `describe/`, `draw/`, `sheet/`, `mcp/` (tools, server, replay), `command/`
  (everyPath, grid.e2e, language.e2e), `quantities/`, `firm/`, `edit/` and HND-11's `taped/`:
  81 files, 1,008 tests pass (1 skipped). No expectation of main's changed; main's tests pass
  unchanged.
- By hand: `grid check --lang es` on a plan with three taped lengths gives "Con cinta frente al
  dibujo (3; 1 difiere, 1 sin medir): …" with its table in decimal commas ("3,700 m  3,800 m
  +0,100  difiere (margen 0,010 m)"), and the two lines in Spanish; a plan far from its stated
  `site.origin` says "… del origen de su emplazamiento, (499000,50; 4000000,00)". Without
  `--lang` it is main's English.
- Not run here: the full suite and the scoreboard.

### For the owner (90a933b1)

29. **The ratchet was raised, 1271 to 1274**, by the three refusals of a taped length in the
    plan's schema (`types/floorplan.ts`), which stay in English as the schema's other refusals.
30. **The taped table in a change's answer stays English** (the edit tools, `grid edit`, `grid
    write`, `grid_write_rooms`), as the rest of those answers; `grid check` and `grid_check` say
    it in the language asked for.
31. **"Taped" is "medida con cinta"** in the Spanish draft, and the table's heading "Con cinta
    frente al dibujo". A reviewer may prefer "medición en obra"; it is in `es.ts`'s
    `line.part.taped.*`, `report.taped.*` and the two codes' keys. The Spanish `says` of
    `room/taped-differs` keeps the label as English does ("… tomada con cinta en Estancia
    "Hall", …"), capital and all.
32. **A GLB's `gridOrigin.note` is a key now** (`drawing.glb.origin`), said in English as every
    export's own words are; the Spanish draft of it is there for when exports take a language.

## After merging main at fbe5160e

Main brought CNT-10 (existing, demolished and new parts, and a fit-out on a fixed shell: the
`phase` of a wall, opening and room and a plan's `base`, three new codes, the drawing's phase key,
`grid diff --since phase`, `grid_takeoff for=change`), VEW-9 (a route's walked length and `grid
describe --length walk`, with `--floor` and `--pictures`), VEW-4 (the preview the person and the
agent both point at: `grid_preview_sync`, the 31st tool, and `grid preview`) and WRT-7's sheet in
the person's own units. Fifteen files conflicted: `CHANGELOG.md`, `docs/plan-file.md`,
`docs/result-contract.md`, cli `command/__tests__/describe.e2e.test.ts`, `command/check.ts`,
`command/describe.ts`, `command/main.ts`, `describe/card.ts`, `mcp/readTools.ts`,
`sheet/pages.ts`, rules `result/__tests__/result.test.ts`, `result/catalogue.ts`,
`result/inspect.ts`, viewer `picture/planSvg.ts` and `picture/writing.ts`. Main's English output
is kept word for word, and main's tests pass unchanged.

### How the conflicts were resolved

- **The sheet** (`sheet/pages.ts`): WRT-7's `sheetUnits` now takes the sheet's words and writes
  every figure on the sheet: the cover's and the summary's figures, the area tables and their
  totals, the room and opening schedules. In English it gives exactly WRT-7's strings. In another
  language it adds the language's decimal mark to the figures only (never to a name), unless the
  display states its own `decimal` (`mark`, by `decimalFor`). Square feet are said in the language
  (`sheet.unit.sqft`: `sq ft`, `pies²`). The headings take the unit (`sheet.rooms`, `sheet.roomSchedule.heading`:
  `Rooms / {unit}`), a height and a sill take the whole length with its unit (`sheet.high`
  `{height} high`, `sheet.sill` `sill {sill}`), and the total beside square feet gives square metres
  (`sheet.total.rooms.metric`). MSG-11's `Words.n` is gone: every figure goes through the units.
- **The record** (`result/catalogue.ts`, `inspect.ts`): MSG-11's files, with CNT-10's parts.
  `opening/phase-wall`, `room/phase-wall` and `plan/read-after-work` are catalogue entries of
  logic only; `plan/read-after-work` gives its counts and base as `values` (`existing`,
  `demolished`, `new`, `base`). The `phases` stage is in `Stage` (`line.part.stage.phases`). Main's
  `whole` plan (patterns expanded, base merged) is used where main uses it, with MSG-11's `noun`
  and `valueWord` for a mark.
- **The phase clashes** (floorplan `geometry/phases.ts`): `PhaseClash` carries `said`
  (`issue.opening/phase-wall`, `issue.room/phase-wall`, with `issue.part.phase.*` and
  `issue.part.states.*`), and `message` is its English. `PHASE_WORDS` now holds keys;
  `STATE_WORDS`, which nothing read, is gone. `validatePhases` passes the sentence to `issue`.
- **The drawing's key** (viewer `picture/writing.ts`, `planSvg.ts`): MSG-11's `words` and main's
  `phases`; `Existing wall`, `New wall` and `To be demolished` are `drawing.key.existingWall`,
  `.newWall` and `.demolished`.
- **The description** (`describe/card.ts`, `command/describe.ts`, `command/main.ts`,
  `mcp/readTools.ts`): CNT-10's sentence on the work is `describe.work` and `describe.work.base`,
  its counts `describe.count.wall|opening|room`; the agent's `WORK` clause stays as main wrote it.
  VEW-9's walk takes the language: `walkText` and `describeWalk` take MSG-11's words, the
  person's form is `describe.walk.*` (49 keys; the facing letters are `describe.c.*`), and
  `grid_describe length=walk` names its pictures in the language (`describe.walk.pictureName`,
  `picture 1`, `imagen 1`). The agent's form of the walk stays as it is. `--floor`, `--pictures`
  and `--lang` are all in the usage line, and `floor`, `pictures` and `language` in the tool's
  arguments; `grid describe --length walk --lang es` and `grid_describe length=walk language=es`
  walk in Spanish.
- **`grid check`** (`command/check.ts`): MSG-11's language and label with main's base.
- **Tests and docs**: `result.test.ts` keeps MSG-11's `values` with main's `phase` in a wall's
  fields; `describe.e2e` takes the usage line with both sides' options. `CHANGELOG.md` keeps every
  Unreleased line; `docs/plan-file.md` keeps both sides' sentences on what follows the display;
  the contract keeps MSG-11's section first of the day, with a new paragraph on CNT-10, VEW-9 and
  WRT-7, then main's four sections and their code-table rows. `docs/languages.md` and
  `docs/commands.md` say that the walk and the sheet's units follow the language; the Spanish
  terms table adds the work, the phases, a fit-out, the walk-through and square feet.

New keys (76), in `en.ts` with main's English and in `es.ts` as a draft: `issue.opening/phase-wall`,
`issue.room/phase-wall`, `issue.part.phase.*` (3), `issue.part.states.*` (3),
`line.part.stage.phases`, `line.part.work`, `line.part.work.base`, `line.plan/read-after-work.*`
(3), `line.opening/phase-wall.*` (3), `line.room/phase-wall.*` (3), `drawing.key.existingWall`,
`.newWall`, `.demolished`, `describe.count.opening.*` (2), `describe.work`, `describe.work.base`,
`describe.walk.*` (49), `sheet.unit.sqft`, `sheet.total.rooms.metric`. Changed: `sheet.rooms`,
`sheet.roomSchedule.heading` (take `{unit}`), `sheet.high`, `sheet.sill` (take the length with its
unit), and the Spanish `sheet.total.rooms` (`pies²`).

Tests added: sheet `language.test.ts`, "a sheet in Spanish in the person's own units (MSG-11,
WRT-7)": feet and inches (`pies²`, `8'-6" de alto`, `antepecho 35"`, square metres beside them with
a decimal comma), millimetres (`… mm de alto`, `62,4 m²`, no decimal point in any figure), and a
display's own decimal mark kept; describe `language.test.ts`, the walk in Spanish and a
refurbishment's work in Spanish and in main's English; rules `language.test.ts`, the three CNT-10
codes in main's English and in Spanish, with the same codes, things, `also` and values.

### The ownWords guard

`floorplan/src/geometry/phases.ts` is at none and joins the list held at none. `describe/walk.ts`
is listed with 4 (`agentForm`: its agent KEY lines and the `a room left out` token, as
`card.ts`'s), and `card.ts` 12 → 13 (the agent's `WORK` clause). Not counted by the ratchet:
`mcp/previewTools.ts` 39, `mcp/serveTools.ts` 1, `mcp/readTools.ts` 285 → 294, `mcp/writeTools.ts`
99 → 90 (`tools`); `mcp/protocol.ts` 16 → 23, `preview/localServer.ts` 6 (`agent`);
`distribution/listing.ts` 82 → 84, `sheet/coverage.ts` 22 → 23 (`developer`). The ratchet moves
from 1274 to 1329, by 55 of the kinds MSG-11 left for later: the commands' new options, usage and
refusals (`command/describe.ts` 6 → 9, `main.ts` 52 → 58, `plan.ts` 24 → 29, `tidy.ts` 11 → 12,
`write.ts` 26 → 28, `preview/record.ts` 4), `quantities/change.ts` 18 (the change takeoff),
`edit/phases.ts` 4 (the edits' receipts in a plan with phases), `quantities/areas.ts` 6 → 8 (the
note that areas are after the work), `quantities/walked.ts` 1 (the walked rule),
`versions/diff.ts` 8 → 10 and `markers.ts` 18 → 19 (diff by phase), `rooms/compile.ts` 115 → 116
(a size that looks like millimetres or feet) and `viewer/src/page/previewPage.ts` 5 (the preview
page).

### Results after fbe5160e

Committed as the merge alone (1e0cc086), before main moved again; the checks were run on it:
`npm run build` 582,849 bytes for `dist/grid.mjs` (the Spanish chunk 167,183), under the cap;
typecheck and lint clean; rules `src`, floorplan `messages/`, `geometry/`, `types/`, `export/`,
`rooms/` and viewer `picture/`: 173 files, 3,768 tests pass (1 skipped); the CLI's guard,
`describe/`, `draw/`, `sheet/`, `mcp/`, `command/`, `quantities/`, `edit/`, `preview/`,
`versions/`, `firm/`, `taped/` and viewer `page/`: 92 files, 1,192 tests pass (1 skipped).
`grid.e2e`'s 500 ms speed test failed once at a load average near 240 from other sessions'
suites, and passed when run alone. Main's tests pass unchanged.

## After merging main at 65e37ca1

Main moved while the merge above was checked: HND-12 (a plan from a phone room scan, `grid write
--scan`, `scan` on `grid_write_rooms`, the scan kept beside the plan) and BRF-4 (massing before
walls: a floor's `outline`, `homes` and `parking`, the site's limits, `floor/past-outline`). Six
files conflicted: `CHANGELOG.md`, `docs/result-contract.md`, floorplan `geometry/plot.ts`,
`geometry/spaces.ts`, `types/floorplan.ts` and rules `result/catalogue.ts`. Main adds no tool.

### How the conflicts were resolved

- **A ring of corners** (`geometry/plot.ts`, main's new `geometry/ring.ts`): main moved the ring
  check into `ring.ts`, so the schema can read it for a floor's outline. MSG-11's `ringFault`
  (by key, `issue.part.boundary.*`) moved there with it, and `ringProblem` is its English, as
  before; `plot.ts` re-exports both.
- **A floor too far out** (`geometry/spaces.ts`): MSG-11's `farSaid` and `unknown`, with main's
  outline: `outlineFarSaid` (`issue.part.far.outline`), and `outlineFarReason` its English.
- **`floor/past-outline`** (`geometry/validate.ts`, auto-merged, `result/catalogue.ts`): the issue
  says `issue.floor/past-outline`, so `validate.ts` stays at none; the line's words are
  `line.floor/past-outline.*`, and its catalogue entry is logic only.
- **The schema** (`types/floorplan.ts`): both sides' imports. **Docs**: `CHANGELOG.md` keeps every
  Unreleased line; the contract keeps MSG-11's section first of the day, with a paragraph on
  BRF-4 and HND-12, then main's two new sections.

New keys (5), in `en.ts` with main's English and in `es.ts` as a draft: `issue.floor/past-outline`,
`issue.part.far.outline`, `line.floor/past-outline.says`, `.needed`, `.fix`. A test in rules
`result/__tests__/language.test.ts` says the line in main's English and in Spanish, with the same
code, thing and values.

### The ownWords guard

`geometry/validate.ts` and the other moved files stay at none. Not counted by the ratchet:
`brief/brief.ts` 40 → 50 (`agent`), `mcp/briefTool.ts` 36 → 44, `readTools.ts` 294 → 296,
`writeTools.ts` 90 → 93 (`tools`), `geometry/tolerances.ts` 205 → 213 and `sheet/coverage.ts`
23 → 26 (`developer`). The ratchet moves from 1329 to 1442, by 113 of the kinds MSG-11 left for
later: the phone scan's refusals and notes, as rooms text's are (`scan/roomModel.ts` 22,
`scan/toPlan.ts` 30, `scan/evidence.ts` 2, `command/scan.ts` 22), the site limits' measures
(`quantities/limits.ts` 29), the area rules for an outline (`geometry/areas.ts` 32 → 36), the
outline's schema refusal (`types/floorplan.ts` 53 → 54) and the commands' new options
(`command/main.ts` 58 → 60, `write.ts` 28 → 29).

### Results after 65e37ca1

- `npm run build`: `dist/grid.mjs` 628,121 bytes, under main's cap, which HND-12 raised to
  650,000 in `grid.e2e` (not touched here); the Spanish chunk 167,997 bytes.
- `npm run typecheck`, `npm run lint`: clean.
- Rules `src`, floorplan `messages/`, `geometry/`, `types/`, `export/`, `rooms/`, `scan/` and
  viewer `picture/` and `page/`: 176 files, 3,800 tests pass (1 skipped).
- The CLI's guard, `describe/`, `draw/`, `sheet/`, `mcp/` (tools, server, replay, phases,
  preview, massing), `command/` (everyPath, grid.e2e, language.e2e, preview.e2e), `quantities/`,
  `edit/`, `preview/`, `versions/`, `firm/`, `taped/` and `brief/`: 95 files, 1,219 tests pass (1
  skipped). `drawStill`'s timing test failed once under the load of other sessions' suites and
  passed when run alone. Main's tests pass unchanged.
- Not run here: the full suite and the scoreboard.

## After merging main at ed8b9f75

Main moved once more: CNT-4 (flats and flat types: `flats` and `flatTypes` in the plan, a new
kind of thing, `flat`, six `flat/` codes, the flat schedule on the sheet and in `grid_schedule
of=flats`, each flat's outline on the drawing). Seven files conflicted: `CHANGELOG.md`,
`docs/result-contract.md`, cli `describe/card.ts`, `sheet/pages.ts`, floorplan
`geometry/validate.ts`, rules `result/catalogue.ts` and `result/inspect.ts`. Main adds no tool.

### How the conflicts were resolved

- **The flats' faults** (floorplan `geometry/flats.ts`): each issue says its sentence by key
  (`issue.flat/*`, with `issue.part.flatTypes.*` for what follows an unknown type) and carries it
  as `said` (`withSaid`); `message` is its English, word for word. The file is at none and joins
  the list held at none.
- **The record** (`result/catalogue.ts`, `inspect.ts`): the six codes are logic only;
  `flat/duplicate-type` takes the type as `{type}`, with a `.one` wording when there is none.
  A flat is named by `thing.flat` (`Flat "Flat A"`, `Vivienda "Flat A"`), and `thing.at.flat` and
  `report.thing.flat` name it in a refusal and in the report.
- **The sheet** (`sheet/pages.ts`): the flat schedule and its mix by type are `sheet.flat*` keys;
  its areas stay in square metres, as CNT-4 writes them, with the sheet's decimal mark (`mark`).
- **The description** (`describe/card.ts`): MSG-11's `describe.unsaid.flats`, under main's
  condition that the plan lists no flats.
- **Docs**: `CHANGELOG.md` keeps every Unreleased line; the contract's MSG-11 section adds a
  paragraph on CNT-4, before main's new section.

New keys (46), in `en.ts` with main's English and in `es.ts` as a draft: `thing.flat`,
`thing.at.flat`, `report.thing.flat`, `issue.flat/*` (7), `issue.part.flatTypes.*` (3),
`line.flat/*` (19), `sheet.flatSchedule`, `.heading` and `sheet.flat.*` (12). Tests: rules
`language.test.ts` says `flat/unknown-room` and `flat/unknown-type` in main's English and in
Spanish; sheet `language.test.ts`, "the flat schedule in Spanish (MSG-11, CNT-4)".

### The ownWords guard

`floorplan/src/geometry/flats.ts` is at none. `mcp/readTools.ts` 296 → 306 (`tools`) and
`sheet/coverage.ts` 26 → 27 (`developer`) are not counted. The ratchet moves from 1442 to 1452:
`rooms/compile.ts` 116 → 117 (flats in rooms text), `types/floorplan.ts` 54 → 55 (the schema),
`geometry/areas.ts` 36 → 37 and cli `quantities/areas.ts` 8 → 9 (the area rules for flats),
`quantities/schedule.ts` 7 → 10 (the flat schedule's rules), `command/planText.ts` 18 → 19 and
`write.ts` 29 → 31 (the commands' refusals).

### Results after ed8b9f75

- `npm run build`: `dist/grid.mjs` 635,968 bytes, under main's cap of 650,000 (not touched); the
  Spanish chunk 171,976 bytes.
- `npm run typecheck`, `npm run lint`: clean.
- Rules `src`, floorplan `messages/`, `geometry/` (CNT-4's flats tests among them), `types/`,
  `export/`, `rooms/`, `scan/` and viewer `picture/` and `page/`: 179 files, 3,823 tests pass (1
  skipped).
- The CLI's guard, `describe/`, `draw/`, `sheet/`, `mcp/` (tools, server, replay, flats, phases,
  preview, massing), `command/` (everyPath, grid.e2e, language.e2e, preview.e2e), `quantities/`,
  `edit/`, `preview/`, `versions/`, `firm/`, `taped/`, `brief/` and `seen/`: 96 files, 1,227 tests
  pass (1 skipped). Main's tests pass unchanged.
- Not run here: the full suite and the scoreboard.

### For the owner (fbe5160e, 65e37ca1 and ed8b9f75)

33. **The ratchet was raised three times, 1274 → 1329 → 1442 → 1452**, by main's new text of the kinds MSG-11
    left for later (the lists are above). The largest parts are HND-12's scan notes and
    refusals (76) and BRF-4's site limits (29), CNT-10's change takeoff (18): each would move as
    rooms text, the measures and the takeoffs move, not before.
34. **The sheet in the person's units follows the language's decimal mark only on figures**, and
    a display's own `decimal` wins: a Spanish sheet with `"decimal": "point"` writes points. In
    English the sheet is WRT-7's to the byte, including its one figure that keeps a point in a
    comma display (the square metres beside a square-feet total, `areaText` unmarked); in
    Spanish that figure takes the comma.
35. **"Square feet" is `pies²` in the Spanish draft** (`sheet.unit.sqft`, and `sheet.total.rooms`,
    which said `sq ft` before); a reviewer may prefer `ft²`.
36. **The schedules' notes on a sheet stay English**, as before: the opening schedule's rule says
    "in metres" even on a sheet in feet and inches; that is main's sentence (`quantities/schedule.ts`).
37. **The walk's fixtures** are named by their label as the schedule gives it (`el aparato
    toilet`): the labels are not translated yet. The walk's agent form stays as main wrote it.
38. **The phases in Spanish**: a part's phase is "existente", "de demolición" or "de obra nueva"
    in a drawing issue ("es de la fase de demolición"), and "a demoler" on the drawing's key and
    in the description; "the work" is "la obra" and a fit-out "acondicionamiento". To review.
39. **The preview page** (`viewer/src/page/previewPage.ts`) and the preview's server and record
    stay English; the page takes no language yet. `grid_preview` answers in English, as the other
    tools do, and its picture is `grid_view`'s, which takes no language from it.
40. **"Flat" is "vivienda"** in the Spanish draft (the flat schedule is "Cuadro de viviendas", the
    mix by type "Mezcla por tipo"). A flat's line names it by its name (`Flat "Flat A"`), as main
    does; its found names it by id, as the drawing check does.
41. **The flat schedule on the sheet stays in square metres** in every display, as CNT-4 writes
    it; in Spanish its figures take the comma.

## After merging main at cf8b8084

Main moved again: LVL-5 (walls and windows through floors, floors that line up: a wall's
`through`, `overhang: "meant"` on a floor or a stair or lift room, and four codes,
`wall/through-floor`, `floor/out-of-line`, `room/stair-shifted` and `room/lift-shifted`; a window
that cannot be drawn is called a window). Eight files conflicted: `docs/result-contract.md`, cli
`firm/measure.ts`, floorplan `geometry/levels.ts`, `geometry/rules/index.ts`,
`geometry/rules/messages.ts`, `geometry/validate.ts`, rules `result/__tests__/result.test.ts` and
`result/catalogue.ts`. Main adds no tool.

### How the conflicts were resolved

- **Heights through floors** (`geometry/levels.ts`, `geometry/validate.ts`): MSG-11's sentences by
  key with main's figures: `issue.wall/above-storey` names the floor the wall rises through
  (`storeyFloorOf`), `issue.opening/too-tall` the wall's whole rise. The overlap check for a wall
  through floors, which auto-merged with main's English, says `issue.opening/overlap` by key, so
  `validate.ts` stays at none.
- **A wall through floors that names no floor above** (`geometry/through.ts`, new): its issue says
  `issue.wall/through-floor.unknown` or `.below`, with the floors above it
  (`issue.part.through.*`), and carries it as `said` (`withSaid`); `message` is main's English.
- **Floors that do not line up** (`geometry/stacking.ts`, new): `issue.floor/out-of-line`, each
  stretch by key (`issue.part.lineUp.*`), its parts joined by a new `join.semicolonAnd` (`; and `).
- **A moved stair or shaft** (`geometry/rules/messages.ts`, `check.ts`): `saids.shifted` by key
  (`check.shifted.stair`, `.lift`); how far and which way (`shiftWays`, `shiftedHowSaid`) and
  where each stands (`shiftedBoxSaid`) by key too, the ways by `describe.way.*`. The finding
  carries its sentence (`withSentence`).
- **Openings by what they are** (`geometry/rules/messages.ts`): main's `openingWords` is kept,
  English made from `openingsSaid`, which names openings by key (`check.openings.<kind>.<this,
  that, a, these, those, plain>`, `.any.*` for openings of no known kind and `.mixed.*` for
  several kinds); `saids.doorsNotDrawn` takes the kinds (`check.doorsNotDrawn.kinds.one`, `.many`).
- **The record** (`result/catalogue.ts`): the four codes are logic only. The two shifted codes
  share one entry: `wording` is the finding's sentence, `found` names the ways (`ways`) or, for a
  shaft not moved as a whole, its sides (`sideWays`), with a `none` wording for a line with no
  finding. `floor/not-checked-doors-not-drawn` takes the notice's `openingKinds` as `plain` and
  `those`, with `.kinds` wordings of `found` and `needed` and `.kinds.one` and `.kinds.many` of
  `fix`; with no kinds its words are as before. `room/cross-floor`'s `needed` and `fix` take
  main's new English.
- **The firm's doors** (`firm/measure.ts`): MSG-11's words by key, at main's floor (`facts.floor`).
- **Tests**: `result.test.ts` keeps main's wall field list (`through` after `floor`) and MSG-11's
  `values`. **Docs**: `CHANGELOG.md` merged cleanly with every Unreleased line; the contract keeps
  MSG-11's section first of the day, with a paragraph on LVL-5, then main's new section.

New keys (71), in `en.ts` with main's English and in `es.ts` as a draft: `join.semicolonAnd`,
`issue.wall/through-floor.*` (2), `issue.part.through.*` (2), `issue.floor/out-of-line`,
`issue.part.lineUp.*` (6), `check.shifted.*` (8), `check.doorsNotDrawn.kinds.*` (2),
`check.openings.*` (24), `line.wall/through-floor.*` (3), `line.floor/out-of-line.*` (3),
`line.room/stair-shifted.*` and `line.room/lift-shifted.*` (7 each) and
`line.floor/not-checked-doors-not-drawn.*` (5). Changed: `line.room/cross-floor.needed` and `.fix`.
A test in rules `result/__tests__/language.test.ts`, "walls through floors and floors that line
up, in Spanish", says the four codes and the window that cannot be drawn in main's exact English
and in Spanish, with the same codes, things, ids and values.

### The ownWords guard

`geometry/through.ts` and `geometry/stacking.ts` are at none and join the list held at none.
`geometry/tolerances.ts` 213 → 219 (`developer`, LVL-5's `stackShift` and its line) is not counted.
The ratchet moves from 1452 to 1453: `floorplan/src/notes/notes.ts` 17 → 18, the note on a moved
stair or shaft, as the other notes are (`notYet`).

### Results after cf8b8084

- `npm run build`: `dist/grid.mjs` 636,265 bytes, under main's cap of 650,000 (not touched); the
  Spanish chunk 178,611 bytes.
- `npm run typecheck`, `npm run lint`: clean.
- Rules `src`, floorplan `src` (LVL-5's `through`, `lineUp` and `held` tests among them) and viewer
  `picture/`: 187 files, 3,881 tests pass (1 skipped).
- The new Spanish test with rules `result/` and floorplan `messages/`: 3 files, 37 tests pass.
- The CLI's guard, `firm/`, `describe/`, `sheet/`, `quantities/`, `preview/`, `mcp/` tools and
  `command/` (grid.e2e, language.e2e, describe.e2e, sheet.e2e): 30 files, 476 tests pass. Main's
  tests pass unchanged.
- Not run here: the full suite and the scoreboard.

### For the owner (cf8b8084)

42. **A point on the plan in Spanish is written `(1,20; 0,00)`**, with a semicolon between the two
    figures: with the decimal comma, `(1,20, 0,00)` would not read as two figures. English keeps
    main's `(1.20, 0.00)`. To review with the language.
43. **Openings of several kinds in Spanish are "estos huecos (puertas y ventanas)"**, so the
    determiner needs no gender for a list of mixed kinds; one kind agrees as usual ("esta
    ventana", "estos huecos sin puerta"). A reviewer may prefer another wording.
44. **The "could not be drawn" line in Spanish says "que no se consiguió dibujar"**, an impersonal
    form that holds for one opening and many, where main's English needs none.
45. **The plan's own words stay as they are in every language**: `through` and `overhang "meant"`
    are written as the file writes them in the Spanish lines, as the other field names are.
46. **The note on a moved stair or shaft** (`notes/notes.ts`, the plan's notes) stays English, as
    the other notes do; the ratchet counts it.

## After merging main at 8a0c839e

Main moved while the merge above was checked: BRF-6 (a first layout from the brief, `grid write
--layout tidy|sizes` and `layout` on `grid_write_rooms`, and the alignment offered for a door
between rooms that share no wall). Two files conflicted, `CHANGELOG.md` and
`docs/result-contract.md`: the Unreleased list keeps MSG-11's line and BRF-6's; the contract keeps
MSG-11's section first of the day, with a line on BRF-6, then main's new section. Main adds no
code to the record and no tool, so no key moves.

### The ownWords guard

BRF-6's text answers as rooms text does, in English. Not counted: `geometry/tolerances.ts`
219 → 223 (`developer`, its three limits) and `mcp/writeTools.ts` 93 → 100 (`tools`). The ratchet
moves from 1453 to 1474, by 21 of the kinds MSG-11 left for later: the first layout's refusals and
answer (`floorplan/src/rooms/layout.ts` 4 and `cli/src/brief/layout.ts` 12, both new and listed),
the alignment offered in rooms text (`rooms/compile.ts` 117 → 118) and the command's new option
(`command/main.ts` 60 → 63, `write.ts` 31 → 32).

### Results after 8a0c839e

- `npm run build`: `dist/grid.mjs` 648,688 bytes, under main's cap of 650,000 (not touched), 1,312
  bytes to spare; the Spanish chunk 178,611 bytes.
- `npm run typecheck`, `npm run lint`: clean.
- Floorplan `rooms/` (BRF-6's layout tests among them), `messages/` and the tolerances test, rules
  `result/`, the CLI's guard, `brief/`, `write`, `mcp/` tools and `command/` (everyPath,
  grid.e2e, language.e2e): 34 files, 460 tests pass. Main's tests pass unchanged.
- Not run here: the full suite and the scoreboard.

### For the owner (8a0c839e)

47. **The bundle is 1,312 bytes under main's 650,000 cap** after BRF-6. The next change to main or
    MSG-11 that adds code will need the cap raised; that is main's to decide, so it is not touched.
