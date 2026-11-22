/**
 * `grid sheet <plan> --layout client|check`: the plan as an A3 PDF for people (VEW-7).
 * The work is in `src/sheet/`; this file holds the options.
 */
import { LANG_OPTION } from './language'
import { PROJECT_OPTION, type OptionSpecs } from './options'

export const SHEET_OPTIONS: OptionSpecs = {
  '--layout': { takesValue: true, help: 'client (a presentation, with the words of sheet.json) or check (a working set with ids and findings).' },
  '--sheet': { takesValue: true, help: 'Client only: the words, as a sheet.json file inside the project. sheet.json beside the plan when left out.' },
  '--out': { takesValue: true, help: 'The PDF to write, inside the project. exports/ beside the plan when left out.' },
  ...LANG_OPTION,
  ...PROJECT_OPTION,
}
