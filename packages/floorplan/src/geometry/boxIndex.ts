/**
 * A spatial index of boxes (QAR-7): which of many boxes touch a given one, without trying them
 * all.
 *
 * A check that sets each thing on a floor against every other one grows with the square of the
 * floor: on 5,000 rooms the door-swing check tried every door against every wall and took over a
 * minute. Filed here, each thing is tried only against the things whose boxes meet its own, and
 * the check does the exact test on those as before. The box test only rules out what cannot
 * touch, so a check gives the same findings with the index as without it.
 *
 * The index is built once for a fixed list and never changed: a packed R-tree, sort-tile-recursive
 * (Leutenegger, Lopez and Edgington, 1997). The boxes are sorted into tiles of `FAN_OUT`, the
 * tiles into nodes of `FAN_OUT`, up to one root; a search goes down only into nodes whose box
 * meets the one asked about. It answers by place in the list, in list order, so a check that
 * walks the answer reports in the order it always did.
 */

import type { Box } from './polygons'
import { overlaps } from './polygons'
import type { Vec2 } from './vec2'

/** Boxes per node. Any count gives the same answers; this one is quick on a floor plan. */
const FAN_OUT = 16

interface Node {
  readonly box: Box
  /** The places of the boxes in a leaf, or the nodes below. */
  readonly items: readonly number[] | null
  readonly children: readonly Node[] | null
}

export interface BoxIndex {
  /**
   * The places in the list of every box that touches `box`, edges and corners included, in
   * ascending order. A box with a coordinate that is not a number touches nothing.
   */
  near(box: Box): number[]
}

/** The box around some points. With none, an empty box that touches nothing. */
export function boxOfPoints(points: Iterable<Vec2>): Box {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of points) {
    if (p.x < x0) x0 = p.x
    if (p.x > x1) x1 = p.x
    if (p.y < y0) y0 = p.y
    if (p.y > y1) y1 = p.y
  }
  return { x0, y0, x1, y1 }
}

/** The box `by` larger on every side: everything within `by` of the box lies in it. */
export function widenBox(box: Box, by: number): Box {
  return { x0: box.x0 - by, y0: box.y0 - by, x1: box.x1 + by, y1: box.y1 + by }
}

/** The box around boxes. Written with `<` so a coordinate that is not a number is left out. */
function union(boxes: readonly Box[]): Box {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const b of boxes) {
    if (b.x0 < x0) x0 = b.x0
    if (b.y0 < y0) y0 = b.y0
    if (b.x1 > x1) x1 = b.x1
    if (b.y1 > y1) y1 = b.y1
  }
  return { x0, y0, x1, y1 }
}

const middleX = (b: Box): number => (b.x0 + b.x1) / 2 || 0
const middleY = (b: Box): number => (b.y0 + b.y1) / 2 || 0

/**
 * One level of the tree: `entries` sorted into vertical strips by the middle of their boxes,
 * each strip sorted by height and cut into groups of `FAN_OUT`.
 */
function pack<T>(entries: readonly T[], boxOf: (entry: T) => Box): T[][] {
  const groups = Math.ceil(entries.length / FAN_OUT)
  const strips = Math.ceil(Math.sqrt(groups))
  const perStrip = strips * FAN_OUT
  const byX = [...entries].sort((a, b) => middleX(boxOf(a)) - middleX(boxOf(b)))
  const out: T[][] = []
  for (let s = 0; s < byX.length; s += perStrip) {
    const strip = byX.slice(s, s + perStrip).sort((a, b) => middleY(boxOf(a)) - middleY(boxOf(b)))
    for (let g = 0; g < strip.length; g += FAN_OUT) out.push(strip.slice(g, g + FAN_OUT))
  }
  return out
}

/** Files `boxes` for searching. The list is read once; changing it later changes nothing here. */
export function boxIndex(boxes: readonly Box[]): BoxIndex {
  const own = boxes.map((b) => ({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }))
  const places = own.map((_, i) => i)

  let level: Node[] = pack(places, (i) => own[i]!).map((items) => ({
    box: union(items.map((i) => own[i]!)),
    items,
    children: null
  }))
  while (level.length > 1) {
    level = pack(level, (node) => node.box).map((children) => ({
      box: union(children.map((child) => child.box)),
      items: null,
      children
    }))
  }
  const root = level[0]

  return {
    near(box: Box): number[] {
      const found: number[] = []
      if (!root) return found
      const stack: Node[] = [root]
      while (stack.length > 0) {
        const node = stack.pop()!
        if (!overlaps(node.box, box)) continue
        if (node.items) {
          for (const i of node.items) if (overlaps(own[i]!, box)) found.push(i)
        } else {
          stack.push(...node.children!)
        }
      }
      return found.sort((a, b) => a - b)
    }
  }
}
