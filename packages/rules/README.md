# Grid rules

The plan checks of Grid that compare a plan with a figure from a building code, and the
figures themselves, each with where it was read and how far it has been checked.

## What the checks are

`@ongrid/core` runs four checks on the drawing itself. They need no figure and cite no
document: a way out of the ground floor, a door on every room, a route from every room to
a way out, and doors that lead somewhere.

This package adds two checks that apply figures:

| Check | What it looks at | Basis |
|---|---|---|
| Room area | Bedrooms, living rooms and dining rooms under a minimum floor area | US model codes: IBC 2024 and IRC 2024 |
| Escape opening | A bedroom's window or door to the outside: its size and the height of its sill | US model codes: IBC 2024 and IRC 2024 |

`checkLocalRules(plan)` runs all six and returns one report.

## What they are not

- **Not your local rules.** The figures here come from two US model codes. A model code is
  not law until a state or a city adopts it, often with changes, and other countries have
  rules of their own. Every report carries the label "General guidance, not your local
  rules".
- **Not a finding that a plan complies.** No findings means these checks found nothing.
  Every report lists what the checks never look at, and no message says a plan complies or
  is approved.
- **Not checked by a person yet.** Each figure carries a status. Today every figure is
  `ai-found`: read by an AI, with no person having opened the source. Reports and notes
  show the status next to the figure.
- **Not advice.** The local authority and a licensed professional decide.
- **Not affiliated** with, or endorsed by, the publishers of the documents named. Their
  names are used only to say where a figure was read.

## Where the plan will be built

```ts
import { checkLocalRules, figuresFromSheet, planNotes } from '@ongrid/rules'

checkLocalRules(plan)                                   // no place stated
checkLocalRules(plan, { country: 'ES' })                // a two-letter country code
checkLocalRules(plan, { country: 'ES', figures })       // with figures looked up for the place
```

- With no country stated, or `US`, the two figure checks run on the carried figures, and
  every finding names them as its basis.
- With another country stated, a carried figure is not that place's rule, so it is not
  applied. A check runs only on figures that were looked up for the place, and the report
  says which checks did not run.
- A looked-up figure is always marked `ai-found`, and the report adds a line saying some
  figures were found online and have not been checked.

`planNotes(plan, report)` turns a report into notes a person reads on the plan. The store
reads and writes files, so it is a separate entry: `@ongrid/rules/store`.

## Layout

| Path | Contents |
|---|---|
| `src/checks/figures.ts` | Every figure, with its provenance |
| `src/checks/catalogue.ts` | The two rules, the figures each one uses, and what the checks leave out |
| `src/checks/size.ts`, `escape.ts` | The two checks |
| `src/checks/check.ts` | The full check: the core's plan checks and these, in one report |
| `src/notes` | The report as notes a person reads on the plan |
| `src/sheet` | The build location and the rules sheet a lookup produces, as schemas |
| `src/lookup` | The prompt of a rules lookup. Running a lookup is not part of this package yet |
| `src/store` | A project's location and sheet, as files on this computer |

## What a figure records

Each entry in `figures.ts` holds a number, a unit and a pointer to its source. It never
holds text from the source.

| Field | Meaning |
|---|---|
| `baseline`, `unit` | The figure, in metres or square metres |
| `jurisdiction` | Where it applies, such as "US model codes" |
| `citations` | Each document, its edition, the clause number, the publisher and the page it was read on |
| `original` | The figure as the document prints it, before conversion |
| `metric` | Whether the metric value is printed in the document or converted here |
| `appliesTo` | Who and what the figure is about, in our own words |
| `readOn`, `reviewBy` | The day it was read, and the day it should be read again |
| `foundBy` | A person, or "AI research" |
| `verifiedBy` | Each check by a named person against the document itself. Never an AI |
| `status` | `ai-found`, `human-entered`, `checked-once`, `checked-twice` or `disputed` |

## Adding or changing a rule

1. **Read the source yourself**, on the publisher's or the government's own page. Use only
   a source you are allowed to read. Prefer official texts that are free to reuse.
2. **Record facts only**: the number, the unit, the document, its edition and the clause
   number. Describe the rule in your own words. Never paste a sentence, a table, a
   definition or an image from a code or a standard, and never collect rules in bulk from
   one publisher's site.
3. **Say who it applies to.** Building type, thresholds and exceptions go in `appliesTo`.
   A rule that only holds for some buildings or places must only run there, and say so.
4. **Add the figure** to `figures.ts` with all its provenance fields, and name it in
   `RULE_FIGURES` under the rule that uses it. A new edition is a new entry: keep the
   edition with the clause number, because numbers move between editions.
5. **Set the status honestly.** A figure an AI found starts as `ai-found`. It becomes
   `checked-once` only when a named person has opened the document at that clause and
   confirmed three things: the clause exists in that edition, the figure there is the one
   stated, and the rule means what the description says. A second, different person makes
   it `checked-twice`. Add each check to `verifiedBy`.
6. **Test it.** The tests refuse a figure without its provenance, and a checked status
   without a named person.
7. **Check for false alarms.** Run the check on ordinary, correct plans before adding it. A
   check that flags plans that are fine is worse than no check.
