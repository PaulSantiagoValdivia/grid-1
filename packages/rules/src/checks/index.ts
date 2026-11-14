export * from './types'
export { FIGURE_LIMITS, FIGURE_RULES, HABITABLE_USES, RULE_FIGURES, RULES } from './catalogue'
export type { FigureRuleId } from './catalogue'
export { basisOf, checkLocalRules } from './check'
export type { CheckOptions } from './check'
export {
  ESCAPE_TOP_LEVEL,
  FIGURE_KEYS,
  FIGURES,
  US_MODEL_CODES,
  VERIFICATION_STATUSES,
  baselineApplies,
  isFigureKey,
  isPlausible,
  resolveFigure
} from './figures'
export type { FigureKey, FigureSpec, FigureUnit, Provenance, SourceCitation, Verification, VerificationStatus } from './figures'
export { figuresFromSheet } from './fromSheet'
