/**
 * MSG-3: every export file carries the label "General guidance, not your local rules", in a
 * place its own format keeps it, one test per file type. A broken or empty plan's file carries
 * it too, since the label is about Grid's output, not about the plan.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../../types/floorplan'
import { GENERAL_GUIDANCE_LABEL } from '../../geometry'
import { parseGlb, samplePlan } from '../../geometry/export/__tests__/glb-reader'
import { exportPlan, type ExportFormat } from '../planExport'

const OPTIONS = { projectId: 'label', projectName: 'Label', now: new Date('2026-11-22T00:00:00Z') }
const EMPTY: FloorPlan = { version: '1', units: 'm', walls: [], rooms: [], openings: [] }
const bytes = (plan: FloorPlan, format: ExportFormat): string | Uint8Array => exportPlan(plan, format, OPTIONS).data
const text = (plan: FloorPlan, format: ExportFormat): string => bytes(plan, format) as string

describe.each([
  ['a plan', samplePlan()],
  ['an empty plan', EMPTY]
])('the label in every export of %s', (_name, plan) => {
  it('DXF: a text entity on the labels layer, with the label as its value', () => {
    const lines = text(plan, 'dxf').split('\r\n')
    const at = lines.indexOf(GENERAL_GUIDANCE_LABEL)
    expect(at).toBeGreaterThan(0)
    expect(lines[at - 1]).toBe('1')
    const entity = lines.lastIndexOf('TEXT', at)
    expect(lines.slice(entity, at)).toContain('GRID-LABELS')
  })

  it('IFC: in the header, beside the view definition, and as the project description', () => {
    const ifc = text(plan, 'ifc')
    expect(ifc).toMatch(/^FILE_DESCRIPTION\(\('ViewDefinition \[CoordinationView_V2\.0\]','General guidance, not your local rules'\),'2;1'\);$/m)
    expect(ifc).toMatch(/^#\d+=IFCPROJECT\('[^']+',#\d+,'Label','General guidance, not your local rules',/m)
  })

  it('GLB: in asset.extras', () => {
    const glb = parseGlb(bytes(plan, 'glb') as Uint8Array)
    expect((glb.json.asset as { extras?: { label?: string } }).extras?.label).toBe(GENERAL_GUIDANCE_LABEL)
  })

  it('OBJ: as its first line, a comment', () => {
    expect(text(plan, 'obj').split('\n')[0]).toBe(`# ${GENERAL_GUIDANCE_LABEL}`)
  })
})
