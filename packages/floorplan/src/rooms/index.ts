/**
 * Writing a plan rooms first, and reading any plan back as rooms text (WRT-2). The plan file is
 * the source of truth; the rooms text is a way of writing and reading it.
 */
export { compileRoomsText, SIZE_BASES, type DerivedWallFacts, type RoomFacts, type RoomsProblem, type RoomsResult, type SizeBasis } from './compile'
export { readRoomsText, type ReadOptions, type RoomsReading } from './read'
export { problemLines, roomsAnswer } from './answer'
export { boundariesEdited, boundaryPrint, planRevision, restamped, stampFor, type WrittenStamp } from './stamp'
