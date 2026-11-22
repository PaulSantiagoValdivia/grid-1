# Languages

Read this when you add or change a sentence Grid writes, or add a language.

Grid writes its own words, in reports, notes, errors, drawings and files, in the person's
language (MSG-11). Every sentence is a key in one message file per language, with its numbers
and names as values. Agents get the same codes and values, and retell them in the person's
language. Room names are never translated: they are the person's own words.

## The message files

- `packages/floorplan/src/messages/en.ts`: English, the source. Every key is written here first.
- `packages/floorplan/src/messages/es.ts`: Spanish. **Status: draft translation, not reviewed.**
- `packages/floorplan/src/messages/uses.ts`: the one fixed list of room uses (`ROOM_USES`), with
  its label in each language.

A key names what it says: `label`; `join.*`, the words a list is joined with; `thing.*`, how a
line names a part; `read.*`, what the reader found and what the format wants; `issue.<code>`, a
drawing check's own sentence; `check.*`, a plan check's finding or notice, its title and its
limits; `line.<code>.<field>`, the result record's `message` (`says`), `found`, `needed` and
`fix`; `report.*` and `tool.check.*`, the words of a report around its lines; `describe.*`,
`drawing.*` and `sheet.*` for those outputs. A last part
after the field (`.one`, `.many`, `.none`) is one wording of several, chosen by the code.

A wording holds named placeholders, `{width}`. `say(language, key, values)` fills them:

| Value | Written as |
|---|---|
| `name("Kitchen")` | `"Kitchen"`: a name or id from the plan, quoted, never translated |
| `num("0.80")` | a figure as Grid rounds it, with the language's decimal mark: `0,80` in Spanish |
| a number | a count, with the decimal mark |
| `said(key, values)` | another sentence, in the same language |
| `joined([...], 'join.comma', 'join.and')` | a list, joined with the language's words |
| a plain string | as it is: an id path such as `walls[2].thickness`, never words |

## The language setting

A plan may state its language in its `display` (`"display": { "language": "es" }`), and a
command or a tool call may ask for one (`--lang es` on `grid check`, `describe`, `draw` and
`sheet`; `language: "es"` on `grid_check`, `grid_describe`, `grid_view` and `grid_sheet`), which
wins. Spanish is loaded only when it is asked for (`loadLanguage`). English is the
default. A language with a decimal comma (Spanish) writes one unless the display's `decimal`
says otherwise. Lengths stay as the display states them; the check's figures stay in metres.

## Adding or changing a sentence

1. Add the key to `en.ts`, with its placeholders, in plain English. Never anything that reads as
   "this plan complies" (MSG-3).
2. Add the same key, with the same placeholders, to every other language's file. A test fails
   when the files have different keys or a key different placeholders. When you cannot write the
   language, write the English there and say so in the change: the reviewer of that language
   will see it.
3. Say it from the code with `say` (or `said` for a part of another sentence). A test fails on an
   English sentence written anywhere else in the user-facing sources.

## Where words may be written

A sentence Grid writes for a person is a key of the message files and nowhere else.
`packages/cli/src/__tests__/ownWords.test.ts` reads every user-facing source of the four
packages and counts the string literals that look like an English sentence. A file not on its
list must have none, and a listed file must have exactly its count: a new sentence fails it, and
a moved one asks for its count to come down. The list says why each file still holds English:
agent-facing text (tool descriptions, English by design), the command line's help and refusals,
texts for people who build Grid, and what is shown to the person and not moved yet.

A record (`inspectPlan`) and a report keep every code, kind, id, figure and value the same in
every language: only the words change. Each line's `values` holds the figures, names, ids and
places its words were made with, so an agent can retell a line in any language from its code.

## Adding a language

1. Copy `en.ts` to the new file, translate every value, and keep every key and placeholder.
2. Add the language to `LANGUAGES` in `languages.ts`, with its status `draft translation, not
   reviewed` and its decimal mark, and its labels to `USE_LABELS`.
3. Add its forbidden words to `approvalWords` (`packages/rules/src/result/approvalWords.ts`):
   the words that would make a line read as a pass or as approval in that language.
4. Never copy text from a standard, a code or a regulation into the file, in any language.

## Who checks a language

A language is marked reviewed only when a named person has read every line of it: an architect
for the building terms and for the label "General guidance, not your local rules". Until then
its status stays `draft translation, not reviewed`, in the file and here. An AI is never
recorded as a language's reviewer.

| Language | File | Status |
|---|---|---|
| English | `en.ts` | source |
| Spanish | `es.ts` | draft translation, not reviewed |

## Spanish terms

The words the Spanish file uses for Grid's parts, one each, so a reviewer checks each once.
Draft, not reviewed.

| English | Spanish |
|---|---|
| General guidance, not your local rules | Orientación general, no sus normas locales |
| the plan | el plano |
| floor (storey) | planta |
| floor (surface) | suelo |
| wall | muro |
| dividing line, virtual wall | línea divisoria, muro virtual |
| room | estancia |
| opening | hueco |
| door / window | puerta / ventana |
| leaf, swing, hinge side | hoja, sentido de apertura, lado de giro |
| sill | antepecho |
| offset (along the wall) | posición |
| fixture | aparato |
| stair / lift | escalera / ascensor |
| way out | salida |
| escape opening | hueco de evacuación |
| check | comprobación |
| figure (from a code) | valor |
| finding | hallazgo |
| worth a look | conviene revisar |
| left out | excluido |
| refused | rechazado |
| not checked | no comprobado |
| to confirm | por confirmar |
| net area | superficie útil |

## Later steps

- Right-to-left languages need the drawings, sheets and reports laid out right to left.
- Chinese, Japanese and Korean need fonts with their characters in the sheet and the drawings.
- Languages with more plural forms than one and many need the plural rules of that language.
