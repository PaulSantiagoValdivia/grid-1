export * from './types'
export { diffPlans } from './diff'
export { changesOutsideScope, MIN_MOVEMENT_M } from './scope'
export { revertChanges } from './revert'
export { statusOf } from './status'
export { alignPlans, type Alignment, type AlignOptions, type Redrawn, type RenamedId } from './place'
export { sameRing } from './props'
export {
  compareBuildings,
  BUILDING_COMPARISON_VERSION,
  type BuildingComparison,
  type ChangeLine,
  type CompareOptions,
  type ComparisonIssue,
  type ComparisonIssueCode,
  type ComparisonMarks,
  type NoteLike,
  type RoomStatus,
  type RoomVerdict
} from './building'
