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
