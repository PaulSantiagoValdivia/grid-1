// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { FloorPlan } from '@ongrid/core/geometry'
import { Canvas2D } from '../Canvas2D'
import { installResizeObserver, mixedPlan, wall } from './canvas-test-utils'

/**
 * The diff layer: ghosts of the version before, and markers on the
 * current elements. The canvas is given a status by id, the ids in focus, and
 * optionally the version before (`base`, for ghosts) and the diff's area changes
 * (`areaChange`, for "before → after" labels). What changed is decided elsewhere.
 */

beforeAll(() => {
  installResizeObserver().set(800, 600)
})

afterEach(cleanup)

type Status = Record<string, 'added' | 'removed' | 'modified'>

const empty = (): FloorPlan => ({ version: '1', units: 'm', walls: [], rooms: [], openings: [] })

/** The same plan with the bottom wall of the first room moved 1 m forward. */
function withMovedWall(): FloorPlan {
  const plan = mixedPlan()
  plan.walls = plan.walls.map((w) => (w.id === 'w1' ? { ...w, start: [0, -1], end: [4, -1] } : w))
  return plan
}

function draw(current: FloorPlan, base: FloorPlan, status: Status, focus: string[] = [], floor?: string) {
  return render(<Canvas2D floorPlan={current} floor={floor} diff={{ base, status, focus }} />)
}

const ghosts = (root: ParentNode) => [...root.querySelectorAll('[data-ghost-of]')]
const ghostsOf = (root: ParentNode, id: string) => [...root.querySelectorAll(`[data-ghost-of="${id}"]`)]
const current = (root: ParentNode, part: string, id: string) =>
  [...root.querySelectorAll(`[data-part="${part}"][data-id="${id}"]`)]

describe('a diff that cannot be drawn', () => {
  it('draws the current plan when the base is empty', () => {
    const plain = render(<Canvas2D floorPlan={mixedPlan()} />)
    const walls = plain.container.querySelectorAll('[data-part="wall"]').length
    cleanup()

    const { container } = draw(mixedPlan(), empty(), { w1: 'modified', r1: 'removed' })
    expect(container.querySelectorAll('[data-part="wall"][data-id]').length).toBe(walls)
    expect(ghosts(container)).toHaveLength(0)
  })

  it('draws no ghost for something the base could not draw', () => {
    const base = mixedPlan()
    base.walls.push(wall('bad', [1, 1], [1, 1])) // zero length: the base drawing skips it
    const { container } = draw(mixedPlan(), base, { bad: 'removed' })
    expect(ghosts(container)).toHaveLength(0)
  })

  it('ignores a status and a focus for ids that no version has', () => {
    const { container } = draw(mixedPlan(), mixedPlan(), { nowhere: 'removed', ghosted: 'modified' }, ['also-nowhere'])
    expect(ghosts(container)).toHaveLength(0)
    expect(container.querySelector('[data-focus]')).toBeNull()
  })
})

describe('ghosts', () => {
  it('draws a moved wall and, under it, a ghost at its old position', () => {
    const { container } = draw(withMovedWall(), mixedPlan(), { w1: 'modified' })

    const now = current(container, 'wall', 'w1')
    const before = ghostsOf(container, 'w1')
    expect(now.length).toBeGreaterThan(0)
    expect(before).toHaveLength(now.length)
    for (const g of before) {
      expect(g.getAttribute('data-part')).toBe('wall')
      expect(g.getAttribute('data-diff')).toBe('before')
      expect(g.hasAttribute('data-id')).toBe(false)
    }
    expect(before[0]!.getAttribute('d')).not.toBe(now[0]!.getAttribute('d'))
  })

  it('draws only a ghost for a removed room', () => {
    const plan = mixedPlan()
    plan.rooms = plan.rooms.filter((r) => r.id !== 'r2')
    const { container } = draw(plan, mixedPlan(), { r2: 'removed' })

    expect(current(container, 'room', 'r2')).toHaveLength(0)
    // One ghost of the room's shape, and one group holding its label.
    const g = ghostsOf(container, 'r2')
    expect(g.map((el) => el.getAttribute('data-part'))).toEqual(['room', null])
    expect(g[1]!.querySelector('[data-part="label"]')).not.toBeNull()
  })

  it('draws no ghost for an added or an unchanged entity', () => {
    const { container } = draw(mixedPlan(), mixedPlan(), { w1: 'added', r1: 'added' })
    expect(ghosts(container)).toHaveLength(0)
  })

  it('draws the ghost of a removed opening as the base drew it, even if its wall changed', () => {
    const base = mixedPlan()
    const plan = withMovedWall()
    plan.openings = plan.openings.filter((o) => o.id !== 'o1')

    const baseOnly = render(<Canvas2D floorPlan={base} />)
    const drawnBefore = current(baseOnly.container, 'opening', 'o1')[0]!.getAttribute('d')
    cleanup()

    const { container } = draw(plan, base, { o1: 'removed', w1: 'modified' })
    const g = ghostsOf(container, 'o1')
    expect(g).toHaveLength(1)
    expect(g[0]!.getAttribute('d')).toBe(drawnBefore)
  })

  it('draws a ghost only on the floor it belongs to', () => {
    const base: FloorPlan = {
      ...mixedPlan(),
      floors: [
        { id: 'ground', name: 'Ground', level: 0 },
        { id: 'first', name: 'First', level: 1 }
      ]
    }
    base.walls = [...base.walls, wall('up-w', [0, 0], [4, 0], { floor: 'first' })]
    const now: FloorPlan = { ...base, walls: base.walls.filter((w) => w.id !== 'up-w') }

    const onGround = draw(now, base, { 'up-w': 'removed' }, [], 'ground')
    expect(ghosts(onGround.container)).toHaveLength(0)
    cleanup()

    const onFirst = draw(now, base, { 'up-w': 'removed' }, [], 'first')
    expect(ghostsOf(onFirst.container, 'up-w').length).toBeGreaterThan(0)
  })

  it('keeps ghosts out of selection and out of the pointer', () => {
    const { container } = draw(withMovedWall(), mixedPlan(), { w1: 'modified', r1: 'modified' })

    const all = ghosts(container)
    expect(all.length).toBeGreaterThan(0)
    for (const g of all) {
      expect(g.hasAttribute('data-id')).toBe(false)
      expect(g.hasAttribute('data-selectable')).toBe(false)
      expect(g.getAttribute('pointer-events')).toBe('none')
    }
    expect(container.querySelectorAll('svg[role="img"]')).toHaveLength(1)
  })

  it('draws ghost rooms under the current rooms, and ghost walls and openings over their fills', () => {
    // r1 is removed: its ghost room, walls and door lie inside where current rooms are filled.
    const { container } = draw(withMovedWall(), mixedPlan(), {
      w1: 'modified',
      r1: 'modified',
      d1: 'modified'
    })
    const before = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    const rooms = [...container.querySelectorAll('[data-part="room"][data-id]')]
    const firstWall = container.querySelector('[data-part="wall"][data-id]')!
    const lastRoom = rooms[rooms.length - 1]!
    const ghostRooms = ghosts(container).filter((g) => g.getAttribute('data-part') === 'room')
    const ghostLines = ghosts(container).filter((g) => g.getAttribute('data-part') !== 'room')
    expect(ghostRooms.length).toBeGreaterThan(0)
    expect(ghostLines.length).toBeGreaterThan(0)
    for (const g of ghostRooms) expect(before(g, rooms[0]!)).toBe(true)
    for (const g of ghostLines) {
      expect(before(lastRoom, g)).toBe(true)
      expect(before(g, firstWall)).toBe(true)
    }
  })

  it('clears the selection when a ghost is clicked, and selects nothing', () => {
    const { container } = draw(withMovedWall(), mixedPlan(), { w1: 'modified' })
    fireEvent.click(current(container, 'wall', 'w1')[0]!)
    expect(container.querySelector('[data-selected="true"]')).not.toBeNull()

    fireEvent.click(ghostsOf(container, 'w1')[0]!)
    expect(container.querySelector('[data-selected="true"]')).toBeNull()
  })
})

describe('markers on the current elements', () => {
  it('says what happened to each, and unchanged for what the status does not mention', () => {
    const { container } = draw(mixedPlan(), mixedPlan(), { w2: 'added', r1: 'modified', v1: 'modified' })

    expect(current(container, 'wall', 'w2')[0]!.getAttribute('data-diff')).toBe('added')
    expect(current(container, 'room', 'r1')[0]!.getAttribute('data-diff')).toBe('modified')
    expect(container.querySelector('[data-part="virtual"][data-id="v1"]')!.getAttribute('data-diff')).toBe('modified')
    expect(current(container, 'wall', 'w3')[0]!.getAttribute('data-diff')).toBe('unchanged')
    expect(current(container, 'opening', 'o2')[0]!.getAttribute('data-diff')).toBe('unchanged')
    expect(current(container, 'room', 'r2')[0]!.getAttribute('data-diff')).toBe('unchanged')
  })

  it('marks the focus on the current element and on its ghost, and on nothing else', () => {
    const { container } = draw(withMovedWall(), mixedPlan(), { w1: 'modified' }, ['w1'])

    const focused = [...container.querySelectorAll('[data-focus="true"]')]
    expect(focused.length).toBeGreaterThan(0)
    for (const el of focused) {
      expect(el.getAttribute('data-id') ?? el.getAttribute('data-ghost-of')).toBe('w1')
    }
    expect(focused.some((el) => el.hasAttribute('data-ghost-of'))).toBe(true)
    expect(focused.some((el) => el.hasAttribute('data-id'))).toBe(true)
  })
})

const areaTexts = (root: ParentNode) =>
  [...root.querySelectorAll('[data-part="area"]')].map((el) => el.textContent)

/** The first room made narrower: 4 m long becomes 3 m. */
function narrowerRoom(): FloorPlan {
  const plan = mixedPlan()
  plan.walls = plan.walls.map((w) => {
    if (w.id === 'w1') return { ...w, end: [3, 0] }
    if (w.id === 'w2') return { ...w, start: [3, 0], end: [3, 3] }
    if (w.id === 'w3') return { ...w, start: [3, 3] }
    return w
  })
  return plan
}

type AreaChange = { roomId: string; before: number | null; after: number | null }

function drawWithAreas(current: FloorPlan, base: FloorPlan | undefined, status: Status, areaChange?: AreaChange[]) {
  return render(<Canvas2D floorPlan={current} diff={{ base, status, focus: [], areaChange }} />)
}

describe('the area of a room that changed', () => {
  it('shows before and after in place of the area, from the area changes it is given', () => {
    const { container } = drawWithAreas(narrowerRoom(), mixedPlan(), { r1: 'modified' }, [
      { roomId: 'r1', before: 10.64, after: 7.84 }
    ])
    expect(areaTexts(container)).toEqual(['10.64 → 7.84 m²', '10.64 m²'])
  })

  it('draws the numbers it is given and computes none of its own', () => {
    // The geometry did not change at all: only the given numbers can produce this label.
    const { container } = drawWithAreas(mixedPlan(), mixedPlan(), {}, [{ roomId: 'r2', before: 20, after: 30 }])
    expect(areaTexts(container)).toEqual(['10.64 m²', '20.00 → 30.00 m²'])
  })

  it('shows the plain area without area changes, even when the base differs', () => {
    const { container } = draw(narrowerRoom(), mixedPlan(), { r1: 'modified' })
    expect(areaTexts(container)).toEqual(['7.84 m²', '10.64 m²'])
  })

  it('shows the plain area for a room with no earlier or no later area', () => {
    const { container } = drawWithAreas(mixedPlan(), mixedPlan(), { r2: 'added' }, [
      { roomId: 'r2', before: null, after: 10.64 },
      { roomId: 'r1', before: 10.64, after: null }
    ])
    expect(areaTexts(container)).toEqual(['10.64 m²', '10.64 m²'])
  })

  it('ignores an area change for a room it does not draw', () => {
    const { container } = drawWithAreas(mixedPlan(), mixedPlan(), {}, [{ roomId: 'gone', before: 1, after: 2 }])
    expect(areaTexts(container)).toEqual(['10.64 m²', '10.64 m²'])
  })

  it('draws the area labels without a base too (the Before canvas)', () => {
    const { container } = drawWithAreas(mixedPlan(), undefined, {}, [{ roomId: 'r1', before: 10.64, after: 7.84 }])
    expect(areaTexts(container)).toEqual(['10.64 → 7.84 m²', '10.64 m²'])
  })
})

describe('the label of a removed room', () => {
  const withoutStudy = (): FloorPlan => {
    const plan = mixedPlan()
    plan.rooms = plan.rooms.filter((r) => r.id !== 'r2')
    return plan
  }
  const ghostLabels = (root: ParentNode, id: string) =>
    [...root.querySelectorAll(`[data-ghost-of="${id}"] [data-part="label"]`)]

  it('names the room, its earlier area and that it was removed, on its ghost', () => {
    const { container } = draw(withoutStudy(), mixedPlan(), { r2: 'removed' })
    const labels = ghostLabels(container, 'r2')
    expect(labels.map((el) => el.textContent)).toEqual(['Study · 10.64 m² · removed'])
    // The current plan's own label is the only other one.
    expect(container.querySelectorAll('[data-part="label"]')).toHaveLength(2)
  })

  it('sits at the base room’s label point, inside a ghost group that never takes the pointer', () => {
    const base = mixedPlan()
    const { container } = draw(withoutStudy(), base, { r2: 'removed' })
    const group = ghostLabels(container, 'r2')[0]!.closest('[data-ghost-of]')!
    expect(group.getAttribute('data-diff')).toBe('before')
    expect(group.hasAttribute('data-id')).toBe(false)
    expect(group.getAttribute('pointer-events')).toBe('none')
    const [x, y] = group.getAttribute('transform')!.match(/translate\(([-\d.e]+) ([-\d.e]+)\)/)!.slice(1).map(Number)
    // The study is the room right of x = 4, 3 m deep: its label point is inside it.
    expect(x).toBeGreaterThan(4)
    expect(-y).toBeGreaterThan(0)
    expect(-y).toBeLessThan(3)
  })

  it('carries the focus when the room is in focus, and only then', () => {
    const focused = draw(withoutStudy(), mixedPlan(), { r2: 'removed' }, ['r2'])
    expect(ghostLabels(focused.container, 'r2')[0]!.closest('[data-ghost-of]')!.getAttribute('data-focus')).toBe('true')
    cleanup()
    const plain = draw(withoutStudy(), mixedPlan(), { r2: 'removed' })
    expect(ghostLabels(plain.container, 'r2')[0]!.closest('[data-ghost-of]')!.hasAttribute('data-focus')).toBe(false)
  })

  it('is drawn for removed rooms only, not for the ghost of a modified one', () => {
    const { container } = draw(narrowerRoom(), mixedPlan(), { r1: 'modified' })
    expect(ghostsOf(container, 'r1').length).toBeGreaterThan(0)
    expect(ghostLabels(container, 'r1')).toHaveLength(0)
  })

  it('carries no style of its own: colours and fading stay in the stylesheet', () => {
    const { container } = draw(withoutStudy(), mixedPlan(), { r2: 'removed' }, ['r2'])
    const label = ghostLabels(container, 'r2')[0]!
    for (const el of [label, label.closest('[data-ghost-of]')!]) {
      expect(el.getAttribute('style')).toBeNull()
      expect(el.getAttribute('fill')).toBeNull()
      expect(el.getAttribute('opacity')).toBeNull()
    }
  })
})

describe('without a base (the Before canvas of Side by side)', () => {
  /** The canvas draws the earlier plan; the statuses are the diff's. */
  function drawBefore(plan: FloorPlan, status: Status, focus: string[] = []) {
    return render(<Canvas2D floorPlan={plan} diff={{ status, focus }} />)
  }

  it('draws no ghosts and no ghost labels', () => {
    const { container } = drawBefore(mixedPlan(), { r2: 'removed', w1: 'modified' })
    expect(ghosts(container)).toHaveLength(0)
  })

  it('marks a drawn element that was removed as removed, and the rest as before', () => {
    const { container } = drawBefore(mixedPlan(), { r2: 'removed', w5: 'removed', w1: 'modified' })
    expect(current(container, 'room', 'r2')[0]!.getAttribute('data-diff')).toBe('removed')
    for (const el of current(container, 'wall', 'w5')) expect(el.getAttribute('data-diff')).toBe('removed')
    expect(current(container, 'wall', 'w1')[0]!.getAttribute('data-diff')).toBe('modified')
    expect(current(container, 'room', 'r1')[0]!.getAttribute('data-diff')).toBe('unchanged')
  })

  it('marks the focus on the drawn element', () => {
    const { container } = drawBefore(mixedPlan(), { r2: 'removed' }, ['r2'])
    expect(current(container, 'room', 'r2')[0]!.getAttribute('data-focus')).toBe('true')
  })

  it('keeps every element selectable, the same as without a diff', () => {
    const plain = render(<Canvas2D floorPlan={mixedPlan()} />)
    const ids = [...plain.container.querySelectorAll('[data-id]')].map((el) => el.getAttribute('data-id'))
    cleanup()
    const { container } = drawBefore(mixedPlan(), { r2: 'removed' })
    expect([...container.querySelectorAll('[data-id]')].map((el) => el.getAttribute('data-id'))).toEqual(ids)
  })
})

const viewBoxOf = (root: ParentNode) =>
  root.querySelector('svg[role="img"]')!.getAttribute('viewBox')!.split(' ').map(Number) as [
    number,
    number,
    number,
    number
  ]

describe('framing with the ghosts', () => {
  /** A free wall that used to be far away at x 30..34 and is now at x 12..14. */
  const farBase = (): FloorPlan => {
    const plan = mixedPlan()
    plan.walls.push(wall('far', [30, 0], [34, 0], { kind: 'interior' }))
    return plan
  }
  const farNow = (): FloorPlan => {
    const plan = mixedPlan()
    plan.walls.push(wall('far', [12, 0], [14, 0], { kind: 'interior' }))
    return plan
  }

  it('holds both the wall and its ghost in the first view', () => {
    const { container } = draw(farNow(), farBase(), { far: 'modified' })
    const [x, , width] = viewBoxOf(container)
    expect(x).toBeLessThanOrEqual(0)
    expect(x + width).toBeGreaterThanOrEqual(34)
  })

  it('frames only the plan when the diff has no ghost', () => {
    const plain = render(<Canvas2D floorPlan={farNow()} />)
    const expected = viewBoxOf(plain.container)
    cleanup()

    const { container } = draw(farNow(), farBase(), { far: 'added' })
    expect(viewBoxOf(container)).toEqual(expected)
    expect(expected[0] + expected[2]).toBeLessThan(34)
  })
})

describe('a zoom the user chose', () => {
  /** jsdom lays nothing out: give the svg the box the stubbed ResizeObserver reports. */
  const svg = (root: ParentNode): SVGSVGElement => {
    const element = root.querySelector<SVGSVGElement>('svg[role="img"]')!
    element.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0 }) as DOMRect
    return element
  }

  it('survives a diff whose status and focus are recreated with the same content', () => {
    const status: Status = { w1: 'modified', r1: 'modified' }
    const view = (focus: string[], next: Status) => (
      <Canvas2D floorPlan={withMovedWall()} diff={{ base: mixedPlan(), status: next, focus }} />
    )
    const { container, rerender } = render(view([], status))
    fireEvent.wheel(svg(container), { deltaY: -200, clientX: 400, clientY: 300 })
    const zoomed = viewBoxOf(container)

    rerender(view(['w1'], { ...status }))
    expect(viewBoxOf(container)).toEqual(zoomed)
  })

  it('survives a new status that leaves the framed area as it was', () => {
    const base = mixedPlan()
    const now = withMovedWall()
    const view = (next: Status) => <Canvas2D floorPlan={now} diff={{ base, status: next, focus: [] }} />
    const { container, rerender } = render(view({ w1: 'modified', r1: 'modified' }))
    fireEvent.wheel(svg(container), { deltaY: -200, clientX: 400, clientY: 300 })
    const zoomed = viewBoxOf(container)

    rerender(view({ w1: 'modified' }))
    expect(viewBoxOf(container)).toEqual(zoomed)
  })
})
