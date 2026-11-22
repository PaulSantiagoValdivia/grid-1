# Grid rules

The plan checks of Grid that compare a plan with a figure from a building code, and the
figures themselves, each with where it was read and how far it has been checked.

## What the checks are

`@ongrid/floorplan` runs four checks on the drawing itself. They need no figure and cite no
document: a way out of the ground floor, a door on every room, a route from every room to
a way out, and doors that lead somewhere.

Which rooms a door or a dividing line joins is read from where it stands, never from the wall
it names: a dividing line joins the rooms beside it all along its length, stretch by stretch,
so lines that cross join every room round the crossing. A door leads outside when no room and
no enclosed floor lies past it, or its wall is stated exterior; a door into floor the walls
enclose and no room claims "leads to a space that is not drawn", on every floor. When the only
way out of a floor is such a door, the rooms that reach neither it nor an exit are still named.
`doorsThatChangedRooms(before, after)` (in `@ongrid/floorplan/geometry`) names each door that
joins other rooms after an edit: "door-living joined hall and living; it now joins hall and
kitchen".

This package adds two checks that apply figures:

| Check | What it looks at | Basis | Read for |
|---|---|---|---|
| Room area | Bedrooms, living rooms and dining rooms under a minimum floor area | US model codes: IBC 2024 and IRC 2024 | Homes |
| Escape opening | A bedroom's window or door to the outside: its size and the height of its sill | US model codes: IBC 2024 and IRC 2024 | Homes |

`checkLocalRules(plan)` runs all six and returns one report. Only this package exports a
`checkLocalRules`; the plan-only check in `@ongrid/floorplan` is called `checkPlanSanity`.

## The front door

`inspectPlan(raw, options)` reads a plan (parsed JSON or its text), runs every check and
returns one result record: the refusals, the drawing's problems, the door sweeps, the findings
and what was not checked, in one list with one count, each line with its code, thing, floor,
what was found and needed, and the fix. It never throws. `docs/result-contract.md` is its
contract; `src/result/catalogue.ts` holds the one wording of every code.

## What they are not

- **Not your local rules.** The figures here come from two US model codes. A model code is
  not law until a state or a city adopts it, often with changes, and other countries have
  rules of their own. Every report carries the label "General guidance, not your local
  rules".
- **Not a finding that a plan complies.** No findings means these checks found nothing.
  Every report lists what the checks never look at, and no message says a plan complies or
  is approved.
- **Read for homes only.** Every figure here was read for homes (houses and flats), and records
  it as `readFor` beside its document, edition, clause and status. A plan may say what kind of
  building it is, and a floor may say otherwise (CNT-5). A figure check runs only where the
  plan, or that floor, is a home (`READ_FOR_BUILDINGS`, `RULE_BUILDINGS`), or where the plan
  does not say; elsewhere it skips the rooms and says why. Where the plan does not say, the
  figures are applied to any plan, a café's seating or a hotel's rooms as well, and every note
  and every pass that used a figure says which kind of building it was read for (COD-2).
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
3. **Say who it applies to.** Building type, thresholds and exceptions go in `appliesTo`, and
   the kind of building it was read for in `readFor`, which decides where it runs. A rule that
   only holds for some buildings or places must only run there, and say so.
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
