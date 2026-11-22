/**
 * HND-12: the scan kept beside the plan, as evidence of where its values came from.
 *
 * The file (`<plan>.scan.json`, written by the command beside the plan) keeps every surface the
 * scan gave, keyed by the scan's own id, as Grid read it: its list, category, confidence,
 * dimensions, transform, parent wall, storey and corners, and the plan part it was drawn as (or
 * null when it was not drawn). It also keeps the scan's sections, how the scan's frame was laid
 * on the plan, what was assumed, and the plan's revision as written from it, so a re-scan can
 * tell whether the plan was changed since.
 *
 * Fields of the scan Grid does not read are not kept. Pure: data in, data out.
 */
import { textProblem } from '../types/planText'
import { ScanRefused, type RoomScan, type ScanSection, type ScanSurface } from './roomModel'
import type { ScanConversion, ScanIds, ScanPartRef } from './toPlan'

/** What the evidence file says it is, and the version of its shape. */
export const SCAN_EVIDENCE_KIND = 'grid-scan-evidence'
export const SCAN_EVIDENCE_VERSION = 1

export interface KeptSurface extends Omit<ScanSurface, 'id'> {
  /** The plan part it was drawn as; null when the plan does not draw it. */
  readonly drawnAs: ScanPartRef | null
}

export interface ScanEvidence {
  readonly kind: typeof SCAN_EVIDENCE_KIND
  readonly version: typeof SCAN_EVIDENCE_VERSION
  readonly format: RoomScan['format']
  /** The plan's revision as written from this scan (`planRevision`). */
  readonly plan: string
  readonly capture: { readonly identifier: string | null; readonly version: number | null }
  /** How the scan's frame was laid on the plan: turned counter-clockwise by `turn` degrees, then moved by `shift` metres. */
  readonly frame: ScanConversion['frame']
  readonly surfaces: Readonly<Record<string, KeptSurface>>
  readonly sections: readonly ScanSection[]
  readonly assumed: readonly string[]
  /** A room drawn from the capture's own id, in a scan with no floor outline. */
  readonly captureRooms?: Readonly<Record<string, ScanPartRef>>
}

/** The evidence of a scan drawn as a plan whose revision is `revision`. */
export function scanEvidence(scan: RoomScan, conversion: ScanConversion, revision: string): ScanEvidence {
  const surfaces: Record<string, KeptSurface> = {}
  for (const { id, ...rest } of scan.surfaces) surfaces[id] = { ...rest, drawnAs: conversion.ids[id] ?? null }
  // A room drawn from the capture's own id (a scan with no floor outline) is kept by it too.
  const rooms: Record<string, ScanPartRef> = {}
  for (const [sid, ref] of Object.entries(conversion.ids)) if (!Object.hasOwn(surfaces, sid)) rooms[sid] = ref
  return {
    kind: SCAN_EVIDENCE_KIND,
    version: SCAN_EVIDENCE_VERSION,
    format: scan.format,
    plan: revision,
    capture: { identifier: scan.id, version: scan.version },
    frame: conversion.frame,
    surfaces,
    sections: scan.sections,
    assumed: conversion.assumed.map((a) => a.text),
    ...(Object.keys(rooms).length > 0 ? { captureRooms: rooms } : {}),
  }
}

const PARTS: readonly ScanPartRef['part'][] = ['wall', 'room', 'opening', 'item']
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function ref(value: unknown): ScanPartRef | null {
  if (!isObject(value)) return null
  const { part, id } = value
  if (typeof part !== 'string' || !(PARTS as readonly string[]).includes(part) || typeof id !== 'string' || id.length === 0 || textProblem(id, 'id') !== null) return null
  return { part: part as ScanPartRef['part'], id }
}

/**
 * What a re-scan needs from the evidence: the plan's revision as written from the scan, and the
 * plan part each scan id was drawn as. Throws `ScanRefused` for a file that is not Grid's scan
 * evidence; an entry it cannot read is passed over, so that part gets a new id.
 */
export function readScanEvidence(raw: unknown): { readonly plan: string | null; readonly ids: ScanIds } {
  if (!isObject(raw) || raw['kind'] !== SCAN_EVIDENCE_KIND) throw new ScanRefused('scan/evidence', 'it is not the scan Grid keeps beside a plan')
  if (raw['version'] !== SCAN_EVIDENCE_VERSION) throw new ScanRefused('scan/evidence', `it is version ${typeof raw['version'] === 'number' ? raw['version'] : 'unknown'} of Grid's scan evidence; this Grid reads version ${SCAN_EVIDENCE_VERSION}`)
  const ids: Record<string, ScanPartRef> = {}
  const add = (sid: string, value: unknown): void => {
    const read = ref(value)
    if (read !== null && textProblem(sid, 'id') === null) ids[sid] = read
  }
  if (isObject(raw['surfaces'])) for (const [sid, kept] of Object.entries(raw['surfaces'])) if (isObject(kept)) add(sid, kept['drawnAs'])
  if (isObject(raw['captureRooms'])) for (const [sid, value] of Object.entries(raw['captureRooms'])) add(sid, value)
  const plan = typeof raw['plan'] === 'string' && /^[0-9a-f]{16}$/.test(raw['plan']) ? raw['plan'] : null
  return { plan, ids }
}
