export * from './types'
export { FIGURE_LIMIT_KEYS, FIGURE_LIMITS, FIGURE_RULES, HABITABLE_USES, RULE_BUILDINGS, RULE_FIGURES, RULE_READ_FOR, RULE_USES, RULES, ruleReadsBuilding, rulesForUse } from './catalogue'
export type { FigureRuleId } from './catalogue'
export { basisOf, checkLocalRules, SUBJECT as FIGURE_CHECK_SUBJECTS } from './check'
export type { CheckOptions } from './check'
export { noPlaceSaid, noPlaceText, PlaceRefused, placeFor, placeRefusalText, planPlace, requestedPlace, WITHOUT_PLACE } from './place'
export type { PlaceFrom, PlaceUsed, WithoutPlace } from './place'
export {
  ESCAPE_TOP_LEVEL,
  FIGURE_KEYS,
  FIGURES,
  US_MODEL_CODES,
  VERIFICATION_STATUSES,
  BUILDING_KINDS,
  READ_FOR_BUILDINGS,
  readForCovers,
  baselineApplies,
  buildingKindsSaid,
  buildingKindsText,
  buildingTypeSaid,
  readForSaid,
  findingReadFor,
  readForSentence,
  isFigureKey,
  isPlausible,
  resolveFigure
} from './figures'
export type { BuildingKind, FigureKey, FigureSpec, FigureUnit, Provenance, SourceCitation, Verification, VerificationStatus } from './figures'
export { figuresFromSheet } from './fromSheet'
export {
  FIGURE_NAMES,
  FIGURE_STATUS_WORDS,
  figureBasisSaid,
  figureBasisText,
  figureNeededSaid,
  figureNeededText,
  figureStatusSaid,
  figureStatusText,
  figureUsedSaid,
  figureUsedText,
  figureValueSaid,
  figureValueText
} from './figureWords'
export { coverageOnFloor, LOOKS_AT, roomsLookedAt, skipWhy, skipWhySaid } from './coverage'
