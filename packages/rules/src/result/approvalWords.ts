/**
 * MSG-3: the words that would make a line read as a pass or as the reader's law. No line Grid
 * writes holds one outside quoted user text: a report, a list, a note, a drawing or an export.
 * The tests hold every output to it, and the retelling scorer holds an agent's retelling of a
 * report to it too.
 *
 * Quoted text is the user's: Grid quotes every name it takes from a plan file, so a room named
 * "Approved store" is the plan's words, not Grid's. A message code in brackets (`[opening/
 * too-small-to-pass]`) is an identifier, not a sentence, and is left out as well; codes are
 * stable within a result version (docs/result-contract.md).
 *
 * MSG-11: the Spanish words of the same kind are here too (cumple, aprobado, conforme, homologado,
 * certificado, válido, autorizado, reglamentario and their kin), so a Spanish line is held to the
 * same rule.
 */

/** Each forbidden word or phrase, as a pattern over lower-case text. */
const FORBIDDEN: readonly RegExp[] = [
  /\bpass(?:es|ed|ing)?\b/,
  /\bcompl(?:y|ies|ied|ying|iant|iance)\b/,
  /\bapprov(?:e|es|ed|al)\b/,
  /\bcertif(?:y|ies|ied|icate)\b/,
  /\bmeets? (?:the |all |any |every |local |your )?(?:building )?(?:codes?|regulations?)\b/,
  // MSG-11: the same in Spanish. A letter before or after, accented or not, makes it another word.
  /(?<!\p{L})cumpl(?:e|en|ir|ido|ida|idos|idas|imiento|iría|irá|a|an)(?!\p{L})/u,
  /(?<!\p{L})(?:aprob(?:ar|ado|ada|ados|adas|ación)|aprueb(?:a|an|e|en))(?!\p{L})/u,
  /(?<!\p{L})conform(?:e|es|idad)(?!\p{L})/u,
  /(?<!\p{L})homolog(?:a|ado|ada|ados|adas|ación)(?!\p{L})/u,
  /(?<!\p{L})certific(?:a|an|ado|ada|ados|adas|ación)(?!\p{L})/u,
  /(?<!\p{L})(?:válid[oa]s?|validad[oa]s?|validez)(?!\p{L})/u,
  /(?<!\p{L})autoriz(?:a|ado|ada|ados|adas|ación)(?!\p{L})/u,
  /(?<!\p{L})(?:reglamentari[oa]s?|normativ[oa] vigente)(?!\p{L})/u,
  /(?<!\p{L})supera(?:n|do|da)? (?:la|las|el|los) (?:comprobaci|revisi|inspecci)/u
]

/** A name in double quotes, as Grid writes one (JSON escapes inside it). */
const QUOTED = /"(?:[^"\\]|\\.)*"|“[^”]*”/g
/** A message code in brackets, as `grid check` prints it. */
const CODE = /\[[a-z]+\/[a-z0-9-]+\]/g

/**
 * The forbidden words in a text, lower case, once each, in the order found. `userText` is more
 * text that is the user's and not Grid's, such as the names in a plan where an export writes
 * them unquoted.
 */
export function approvalWords(text: string, userText: readonly string[] = []): string[] {
  let own = text.replace(QUOTED, ' ').replace(CODE, ' ')
  for (const user of [...userText].filter((u) => u.length > 0).sort((a, b) => b.length - a.length)) {
    own = own.split(user).join(' ')
  }
  const lower = own.toLowerCase()
  const found: string[] = []
  for (const pattern of FORBIDDEN) {
    const match = new RegExp(pattern.source, pattern.flags.includes('u') ? 'gu' : 'g')
    for (const hit of lower.matchAll(match)) if (!found.includes(hit[0])) found.push(hit[0])
  }
  return found
}
