/**
 * The parts of a door or window in 3D (CNT-14): its frame, its leaves and its glass, as boxes
 * square to its wall, worked out here once so the 3D view, the OBJ, the GLB and the IFC hold the
 * same parts (the viewer draws them and works out nothing).
 *
 * Every box is in the wall's own terms: `along` from the wall's start (C2), `across` from its
 * axis toward the face its normal points at (`left`), and `up` from the floor. The sizes are
 * Grid's own drawing sizes (`frameFace`, `frameDepth`, `leafThickness`, `glassThickness`): the
 * plan holds no frame, so they only draw the model.
 *
 * - A door: a frame lining its wall's whole depth, round the jambs and the head, and its leaves
 *   closed, hung from the face of the wall it opens toward (SHT-2), or in the middle of the wall
 *   when the plan does not say which face. A pair has two leaves, a folding door its panels, a
 *   sliding door two leaves in the wall's thickness, a pocket door one in its middle, a roller or
 *   garage door one curtain on the face it runs on. A door that opens only in part has a fixed,
 *   glazed panel beside its leaf.
 * - A window: a frame in the middle of its wall, its sill to its head, and in it a sash with its
 *   glass for each part that opens (one, two for a pair, two passing each other for a sliding
 *   window), or only glass when it is fixed. A window that opens in part has fixed glass beside
 *   its sash.
 * - A doorless opening, and anything in a dividing line (no wall to hang from), has none.
 */

import type { Opening, Wall } from '../types/floorplan'
import { doorKindOf, foldingPanels, pairLeaves, partHeight, partWidth, windowKindOf } from './openingKinds'
import { limit, tolerance } from './tolerances'
import { openingSpan } from './wall'

export type OpeningPartKind = 'frame' | 'leaf' | 'glass'

/** One box of a door or window, in its wall's terms (metres): along from the wall's start, across from its axis toward its left face, up from the floor. */
export interface OpeningBox {
  readonly part: OpeningPartKind
  readonly along: readonly [number, number]
  readonly across: readonly [number, number]
  readonly up: readonly [number, number]
}

type Range = readonly [number, number]

const box = (part: OpeningPartKind, along: Range, across: Range, up: Range): OpeningBox | null => {
  const room = tolerance('noLength')
  return along[1] - along[0] > room && across[1] - across[0] > room && up[1] - up[0] > room ? { part, along, across, up } : null
}

/** A rectangle's frame: four members `face` wide round `along` × `up`, `across` deep. */
function frameRound(along: Range, up: Range, across: Range, face: number, sill = true): (OpeningBox | null)[] {
  const [a0, a1] = along
  const [u0, u1] = up
  return [
    box('frame', [a0, a0 + face], across, up),
    box('frame', [a1 - face, a1], across, up),
    box('frame', [a0 + face, a1 - face], across, [u1 - face, u1]),
    ...(sill ? [box('frame', [a0 + face, a1 - face], across, [u0, u0 + face])] : [])
  ]
}

/** A sash: its frame and its glass, filling `along` × `up` at `across`. */
function sash(along: Range, up: Range, across: Range, face: number, glass: number): (OpeningBox | null)[] {
  const mid = (across[0] + across[1]) / 2
  return [...frameRound(along, up, across, face), box('glass', [along[0] + face, along[1] - face], [mid - glass / 2, mid + glass / 2], [up[0] + face, up[1] - face])]
}

/**
 * The 3D parts of one door or window on its wall, in the order they are written: frame, then the
 * leaves or sashes, then the glass. Empty for a doorless opening, for an opening in a dividing
 * line, and for one too small to hold its frame.
 */
export function openingParts(opening: Opening, wall: Wall): readonly OpeningBox[] {
  if (opening.type === 'opening' || wall.virtual === true || !(wall.thickness > 0)) return []
  const span = openingSpan(opening)
  const [a0, a1] = [span.from, span.to]
  const width = a1 - a0
  const bottom = opening.sill
  const top = opening.sill + opening.height
  const face = Math.min(limit('frameFace'), width / 4, opening.height / 4)
  const half = wall.thickness / 2
  const leaf = Math.min(limit('leafThickness'), wall.thickness)
  const glass = Math.min(limit('glassThickness'), wall.thickness)
  const parts: (OpeningBox | null)[] = []
  const startHung = (opening.hinge ?? 'start') === 'start'
  // Along the opening from the end it hangs from: `s` metres in from that end, as a range.
  const fromHinge = (s0: number, s1: number): Range => (startHung ? [a0 + s0, a0 + s1] : [a1 - s1, a1 - s0])

  if (opening.type === 'door') {
    const kind = doorKindOf(opening.kind)
    parts.push(...frameRound([a0, a1], [bottom, top], [-half, half], face, false))
    const clear: Range = [bottom, top - face]
    // Closed, a leaf hangs from the face of the wall it opens toward, or sits in the middle of the wall.
    const onFace: Range = opening.swing === 'left' ? [half - leaf, half] : opening.swing === 'right' ? [-half, -half + leaf] : [-leaf / 2, leaf / 2]
    const inner = width - 2 * face
    if (kind === 'single' || kind === 'folding') {
      const opens = Math.min(partWidth(width, opening.opens), width - face) - face
      if (kind === 'single') parts.push(box('leaf', fromHinge(face, face + opens), onFace, clear))
      else {
        const panels = foldingPanels(opens + face, limit('foldingPanel'))
        for (let k = 0; k < panels; k++) parts.push(box('leaf', fromHinge(face + (opens * k) / panels, face + (opens * (k + 1)) / panels), onFace, clear))
      }
      if (face + opens < width - face) {
        // The part that does not open: a fixed glazed panel, in its own frame.
        const rest = fromHinge(face + opens, width - face)
        parts.push(...sash(rest, [bottom, top - face], [-Math.min(limit('frameDepth'), wall.thickness) / 2, Math.min(limit('frameDepth'), wall.thickness) / 2], face, glass))
      }
    } else if (kind === 'double') {
      const [main] = pairLeaves(width, opening.opens)
      const split = Math.min(Math.max(main, face), width - face)
      parts.push(box('leaf', fromHinge(face, split), onFace, clear), box('leaf', fromHinge(split, width - face), onFace, clear))
    } else if (kind === 'sliding') {
      const overlap = inner / 20
      const middle = a0 + face + inner / 2
      parts.push(box('leaf', [a0 + face, middle + overlap], [0, leaf], clear), box('leaf', [middle - overlap, a1 - face], [-leaf, 0], clear))
    } else if (kind === 'pocket') {
      parts.push(box('leaf', [a0 + face, a1 - face], [-leaf / 2, leaf / 2], clear))
    } else {
      parts.push(box('leaf', [a0 + face, a1 - face], onFace, clear))
    }
    return parts.filter((p): p is OpeningBox => p !== null)
  }

  // A window: its frame in the middle of the wall, a sash for each part that opens.
  const kind = windowKindOf(opening.kind)
  const depth = Math.min(limit('frameDepth'), wall.thickness)
  const frameAcross: Range = [-depth / 2, depth / 2]
  parts.push(...frameRound([a0, a1], [bottom, top], frameAcross, face))
  const inside: Range = [a0 + face, a1 - face]
  const rise: Range = [bottom + face, top - face]
  const pane = (along: Range, up: Range): OpeningBox | null => box('glass', along, [-glass / 2, glass / 2], up)
  if (kind === 'fixed') {
    parts.push(pane(inside, rise))
  } else if (kind === 'sliding') {
    const inner = inside[1] - inside[0]
    const middle = inside[0] + inner / 2
    const overlap = inner / 20
    parts.push(...sash([inside[0], middle + overlap], rise, [0, depth / 2], face, glass), ...sash([middle - overlap, inside[1]], rise, [-depth / 2, 0], face, glass))
  } else if (kind === 'double') {
    const inner = inside[1] - inside[0]
    const [main] = pairLeaves(inner, opening.opens === undefined ? undefined : { ...opening.opens, width: Math.min(opening.opens.width, inner) })
    const split = startHung ? inside[0] + main : inside[1] - main
    parts.push(...sash([inside[0], split], rise, frameAcross, face, glass), ...sash([split, inside[1]], rise, frameAcross, face, glass))
  } else {
    // One casement (or a high-level window): the part that opens at the end it hangs from, from
    // the sill up; fixed glass in the rest.
    const inner = inside[1] - inside[0]
    const opensWide = Math.min(partWidth(width, opening.opens), inner)
    const opensHigh = Math.min(partHeight(opening.height, opening.opens), rise[1] - rise[0])
    const along: Range = startHung ? [inside[0], inside[0] + opensWide] : [inside[1] - opensWide, inside[1]]
    const up: Range = [rise[0], rise[0] + opensHigh]
    parts.push(...sash(along, up, frameAcross, face, glass))
    const sideRest: Range = startHung ? [along[1], inside[1]] : [inside[0], along[0]]
    parts.push(pane(sideRest, rise), pane(along, [up[1], rise[1]]))
  }
  return parts.filter((p): p is OpeningBox => p !== null)
}
