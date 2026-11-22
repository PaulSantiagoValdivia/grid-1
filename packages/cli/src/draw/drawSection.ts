/**
 * LVL-9: `drawSection`, a section of a plan as SVG or PNG, from a plain function call: the
 * viewer's `sectionPicture`, written out as `drawPlan` writes a plan. Loaded only when a section
 * is drawn.
 */
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import type { PlanSection, SectionLine } from '@ongrid/floorplan/geometry/section'
import { pictureToSvg } from '@ongrid/viewer/src/picture/planSvg'
import { sectionPicture, type SectionPictureOptions } from '@ongrid/viewer/src/picture/section'
import { pictureToPng } from './drawPlan'

export type DrawSectionOptions = SectionPictureOptions & ({ readonly format: 'svg' } | { readonly format: 'png'; readonly scale?: number })

/**
 * The section as a file's text (SVG) or bytes (PNG), with the section it was drawn from and the
 * line `grid draw` prints on standard error about what it took.
 */
export async function drawSection(plan: FloorPlan, line: SectionLine, options: DrawSectionOptions): Promise<{ file: string | Uint8Array; section: PlanSection; note: string | null }> {
  const picture = sectionPicture(plan, line, options)
  const file = options.format === 'svg' ? pictureToSvg(picture) : await pictureToPng(picture, { scale: options.scale ?? 1 })
  return { file, section: picture.section, note: sectionNote(picture.section) }
}

/** LVL-9: the line `grid draw --section` prints on standard error: what the section took, or `null`. */
export function sectionNote(section: PlanSection): string | null {
  const hatched = section.assumed.filter((a) => a.hatched).length
  const listed = section.assumed.length - hatched
  if (section.assumed.length === 0) return null
  const parts = [...(hatched > 0 ? [`hatched ${hatched === 1 ? 'one part' : `${hatched} parts`}`] : []), ...(listed > 0 ? [`listed ${listed === 1 ? 'one thing' : `${listed} things`}`] : [])]
  return `The section ${parts.join(' and ')} that the plan does not state: each is listed under the drawing.\n`
}

