/**
 * MSG-3: what an agent is told about retelling a report. One text, carried by the tool server's
 * instructions (`INSTRUCTIONS`) and by the plugin's skill (`distribution/listing.ts`), and given
 * to the model in the retelling prompts (`scoreboard/retell/`), whose scorer holds a retelling
 * to it.
 */
import { GENERAL_GUIDANCE_LABEL } from '@ongrid/rules'

export const RETELLING_RULE =
  `When you retell what Grid said, start with its label, "${GENERAL_GUIDANCE_LABEL}", and keep it. `
  + 'Never tell the person a plan complies, is compliant, is approved, meets code or has passed anything: say what the checks found and what they did not check, which is general guidance and not the local rules. '
  + 'Give a figure as the figure used here, with its basis (the document, edition and clause, or where it was looked up) and its status, such as found by an AI and not yet checked by a person.'
