/**
 * Reading a phone room scan into a plan (HND-12): Apple's room model first. The scan is drawn by
 * pairing each wall's two faces, and kept beside the plan as evidence, keyed by its own ids.
 */
export { readRoomScan, ScanRefused, SCAN_LISTS, SCAN_OBJECT_KINDS, SCAN_SECTION_LABELS, type RoomScan, type ScanSection, type ScanSurface } from './roomModel'
export { planFromScan, SCAN_FIXTURES, type ScanAssumption, type ScanConversion, type ScanIds, type ScanMatch, type ScanPartRef, type ScanRoomArea } from './toPlan'
export { readScanEvidence, scanEvidence, SCAN_EVIDENCE_KIND, SCAN_EVIDENCE_VERSION, type KeptSurface, type ScanEvidence } from './evidence'
