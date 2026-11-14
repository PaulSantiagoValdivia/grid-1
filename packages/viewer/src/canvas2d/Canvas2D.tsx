// 2D floor plan: walls as lines, rooms as polygons, dimensions
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { FloorPlan } from '@ongrid/core/types/floorplan'
import type { AreaDelta, Bounds, Dimension, DiffStatusMap, Vec2 } from '@ongrid/core/geometry'
import {
  boundsWithDimensions,
  boundsWithGhosts,
  buildDimensions,
  buildFloorPlan,
  ghostsOf,
  planForFloor,
  resolveFloor,
  traceWall,
  validateDoorSweeps
} from '@ongrid/core/geometry'
import type { PlaybackClock } from '../preview/playback'
import type { PlanBuild } from '../preview/useBuildFrame'
import { useBuildFrame } from '../preview/useBuildFrame'
import type { SharedViewport, Viewport } from './viewport'
import {
  contains,
  cover,
  fitTo,
  lerpView,
  pan,
  pathOf,
  reframe,
  sharedFrom,
  unproject,
  viewBoxOf,
  viewportFrom,
  zoomAt
} from './viewport'
import { OpeningShape, RoomShape, WallShape } from './shapes'
import type { ShapeAttrs } from './shapes'
import { retainSelection } from './selection'
import { formatArea, placeDimensionLabel, roomLabelBox } from './labelPlacement'
import { dimensionKey, dimensionsProgress, openingAt, stripAcross } from './buildFrame'
import { doorHandingOf } from './doorHanding'
import { doorSymbolOf } from './doorSymbol'
import { progressOf, removalProgress } from '../preview/progress'
import { pulseAt } from '../preview/pulse'
import { CLICK_SLOP } from '../preview/click'
import { useReducedMotion } from '../preview/useReducedMotion'
import './plan.css'

/**
 * The canvas's own look. What is drawn inside it is dressed by plan.css, which hangs off
 * the plain `canvas` class. A drop outline beats the focus one, as it did before. Both
 * outlines are the focus-ring grey: a near-white accent vanished on the paper.
 */
const CANVAS_CLASS = [
  'canvas block size-full touch-none cursor-grab bg-plan-paper',
  'data-[panning=true]:cursor-grabbing',
  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
  'data-[drag-over=true]:outline-2 data-[drag-over=true]:outline-dashed',
  'data-[drag-over=true]:-outline-offset-6 data-[drag-over=true]:outline-ring'
].join(' ')

/** A status as text, the same for the same ids and states in any key order. */
function statusContent(status: DiffStatusMap): string {
  return JSON.stringify(Object.fromEntries(Object.entries(status).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))))
}

/**
 * The plan canvas: the surface the plan is drawn on and worked over. Wheel to
 * zoom, drag to pan, click to select, double click or `f` to frame.
 *
 * It emits structure, not style. Every element carries stable data attributes
 * — data-part, data-type, data-exposure, data-id — which do not go through the
 * CSS Modules hashing, so the plan's finish is defined entirely from the
 * stylesheet without touching this file.
 */

/** A room's net area in each version, as the plan diff computed it (`PlanDiff.areas`). */
export type CanvasAreaChange = Pick<AreaDelta, 'roomId' | 'before' | 'after'>

/**
 * A plan seen against another version of it. What changed is decided
 * elsewhere (the plan diff); the canvas only shows it, and computes no area.
 *
 * - With `base` (Overlay): the canvas draws the current plan, a ghost of what was
 *   removed or changed, and a label on each removed room's ghost.
 * - Without `base` (the Before canvas of Side by side): the canvas draws the plan
 *   it is given, which is the earlier one, with no ghosts; what the status calls
 *   `removed` is marked so on the drawn element.
 */
export interface CanvasDiff {
  /** What happened to each entity, by id. An id that is absent is unchanged. */
  status: DiffStatusMap
  /** Ids to emphasise: the element and its ghost both get `data-focus`. */
  focus: readonly string[]
  /** The version before. Ghosts are its own drawing of the removed and modified entities. */
  base?: FloorPlan
  /**
   * The diff's area changes. A room listed with both areas reads "before → after"
   * in place of its area; without this, every room shows its plain area.
   */
  areaChange?: readonly CanvasAreaChange[]
}

interface Canvas2DProps {
  floorPlan: FloorPlan
  /** Which floor to draw (C5). Unset means the plan's lowest floor. */
  floor?: string | null
  /** Overall and room dimensions. On by default. */
  showDimensions?: boolean
  /**
   * A live run's build, part by part. Without it the plan draws whole, as it
   * always has. Its plans are already this floor's slice.
   */
  build?: PlaybackClock<PlanBuild> | null
  /**
   * Show this plan against the version before it. Without it nothing changes.
   * Ignored while `build` is set: a live run draws the plan part by part, and
   * ghosts of a review on top of that would read as part of the drawing.
   */
  diff?: CanvasDiff
  /**
   * The view to show, as a centre and a width in meters. With it the canvas
   * is controlled: it shows exactly this, works its own height out from its shape,
   * never frames itself, and only reports gestures through `onViewportChange`.
   * Without it the canvas frames itself and keeps its own zoom and pan. During a
   * live build a controlled canvas still shows only this: it never zooms out on
   * its own to follow the plan growing.
   */
  viewport?: SharedViewport
  /** Called with the new view after a zoom, a pan or a request to frame the plan. */
  onViewportChange?: (viewport: SharedViewport) => void
}


/** The pulse's size on screen, whatever the zoom. */
const PULSE_RADIUS_PX = 6

/** The door-sweep warning mark's size on screen, whatever the zoom. */
const WARNING_RADIUS_PX = 5

/** How long the view takes to zoom out when a live build grows past the edge. */
const ZOOM_OUT_MS = 300

function sameBounds(a: Bounds, b: Bounds): boolean {
  const near = (p: number, q: number) => Math.abs(p - q) < 1e-6
  return near(a.min.x, b.min.x) && near(a.min.y, b.min.y) && near(a.max.x, b.max.x) && near(a.max.y, b.max.y)
}

export function Canvas2D({
  floorPlan,
  floor,
  showDimensions = true,
  build = null,
  diff: diffProp,
  viewport,
  onViewportChange
}: Canvas2DProps): JSX.Element {
  const hostRef = useRef<SVGSVGElement | null>(null)
  const [size, setSize] = useState({ width: 1, height: 1 })
  const [ownView, setOwnView] = useState<Viewport | null>(null)
  const [panning, setPanning] = useState(false)
  const [rawSelectedId, setSelectedId] = useState<string | null>(null)

  // One floor at a time (C5). Slicing before building, rather than filtering the
  // drawing after, is what keeps exposure and validation per-floor: a wall whose
  // only room is upstairs genuinely has no room against it on this storey.
  //
  // During a build the frame's plan stands in for the file's: what has been
  // built so far, which changes once per step.
  const frame = useBuildFrame(build)
  const reducedMotion = useReducedMotion()
  const source = frame?.plan ?? floorPlan
  const floorId = useMemo(() => resolveFloor(source, floor), [source, floor])
  const plan = useMemo(() => planForFloor(source, floorId), [source, floorId])

  const drawing = useMemo(() => buildFloorPlan(plan), [plan])

  // Which way each door opens, where the plan says so. A door that
  // doesn't say draws as a plain gap.
  const handings = useMemo(
    () => new Map(plan.openings.map((opening) => [opening.id, doorHandingOf(opening)])),
    [plan]
  )

  // Doors whose swing runs into something: a wall, or another door. The
  // warnings that only say a value is missing don't get a mark: that door has
  // no symbol, so there is nothing to point at.
  const doorWarnings = useMemo(() => {
    const byDoor = new Map<string, { messages: string[]; hits: Set<string> }>()
    for (const issue of validateDoorSweeps(plan, doorHandingOf)) {
      if (issue.hits.length === 0) continue
      const entry = byDoor.get(issue.id) ?? { messages: [], hits: new Set<string>() }
      if (!entry.messages.includes(issue.message)) entry.messages.push(issue.message)
      issue.hits.forEach((id) => entry.hits.add(id))
      byDoor.set(issue.id, entry)
    }
    return byDoor
  }, [plan])
  const [hoveredWarning, setHoveredWarning] = useState<string | null>(null)
  const hitIds = (hoveredWarning && doorWarnings.get(hoveredWarning)?.hits) || null
  /** Lit while the user hovers the warning of a door that runs into this. */
  const hit = (id: string): { 'data-hit'?: 'true' } => (hitIds?.has(id) ? { 'data-hit': 'true' } : {})

  // Where the build starts and ends. The end is what gets framed and
  // dimensioned, so neither changes on every step.
  const startPlan = frame?.prev ?? null
  const endPlan = frame?.next ?? null
  const prevDrawing = useMemo(
    () => (startPlan ? buildFloorPlan(planForFloor(startPlan, floorId)) : null),
    [startPlan, floorId]
  )
  const finalDrawing = useMemo(
    () => (endPlan ? buildFloorPlan(planForFloor(endPlan, floorId)) : null),
    [endPlan, floorId]
  )

  // A diff waits for the build to end (see the `diff` prop).
  const live = build !== null
  const diff = live ? undefined : diffProp

  // The version before, drawn for the same floor. Keyed on the parts of the diff,
  // not the object, which a caller may recreate on every render.
  const diffBase = diff?.base
  const diffStatus = diff?.status
  const diffFocus = diff?.focus
  const diffAreas = diff?.areaChange
  const baseDrawing = useMemo(
    () => (diffBase ? buildFloorPlan(planForFloor(diffBase, floorId)) : null),
    [diffBase, floorId]
  )
  // A caller may also build the status inline on every render (`statusOf(...)`):
  // the ghosts follow what it says, not the object it comes in.
  const statusKey = diffStatus ? statusContent(diffStatus) : null
  const ghosts = useMemo(
    () =>
      baseDrawing && statusKey !== null
        ? ghostsOf(baseDrawing, JSON.parse(statusKey) as DiffStatusMap)
        : null,
    [baseDrawing, statusKey]
  )
  const focused = useMemo(() => new Set(diffFocus ?? []), [diffFocus])

  // Derived, not synchronised: a selection on a floor we left, or one the
  // assistant deleted, simply stops being selected.
  const selectedId = retainSelection(drawing, rawSelectedId)

  // What gets dimensioned and framed: the plan, or during a build the plan it
  // ends on. The latter changes once per save, not once per step.
  const target = finalDrawing ?? drawing

  const dimensions = useMemo(
    () => (showDimensions ? buildDimensions(target) : []),
    [target, showDimensions]
  )

  // A dimension the build doesn't change stays put; the others fade in at the
  // dimensions step.
  const steadyDimensions = useMemo(
    () =>
      prevDrawing && showDimensions
        ? new Set(buildDimensions(prevDrawing).map(dimensionKey))
        : null,
    [prevDrawing, showDimensions]
  )
  const dimensionsShown = frame ? dimensionsProgress(frame.steps, frame.k, frame.inFlight) : 1

  // Dimensions sit outside the walls, so framing on the plan bounds alone
  // would clip them.
  const framedKey = useMemo(() => {
    const own = boundsWithDimensions(target, dimensions)
    // Ghosts can lie outside the current plan (a wall that moved away), and
    // would otherwise be clipped from the first view.
    return JSON.stringify(ghosts ? boundsWithGhosts(own, ghosts) : own)
  }, [target, dimensions, ghosts])
  // Compared by value: a new frame resets the user's zoom, so only a frame that
  // really moved may do that, not a recomputed one in the same place.
  const framed = useMemo(() => JSON.parse(framedKey) as Bounds, [framedKey])

  const aspect = size.width / Math.max(size.height, 1)

  // Given a viewport the view is derived from it and from this canvas's shape, not
  // held in state. It exists as soon as the canvas has been measured.
  const controlled = viewport !== undefined
  const measured = size.width > 1 && size.height > 1
  const view: Viewport | null = controlled
    ? measured
      ? viewportFrom(viewport, aspect)
      : null
    : ownView

  // Every gesture ends here. A controlled canvas only reports, and keeps showing
  // what it was given until the caller passes the new viewport back.
  const commit = useCallback(
    (next: Viewport) => {
      if (!controlled) setOwnView(next)
      onViewportChange?.(sharedFrom(next))
    },
    [controlled, onViewportChange]
  )

  const fit = useCallback(() => {
    commit(fitTo(framed, size.width / Math.max(size.height, 1)))
  }, [commit, framed, size.width, size.height])

  // Measure the container. The viewBox depends on the real aspect ratio;
  // without this the plan comes out stretched.
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return

    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect
      if (box && box.width > 0 && box.height > 0) {
        setSize({ width: box.width, height: box.height })
      }
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  const viewRef = useRef(view)
  viewRef.current = view
  const buildRef = useRef(build)
  buildRef.current = build

  const aspectRef = useRef(aspect)
  aspectRef.current = aspect
  const firstPlanRef = useRef(false)
  firstPlanRef.current =
    prevDrawing !== null && prevDrawing.walls.length === 0 && prevDrawing.rooms.length === 0

  const zoomOut = useRef<number | null>(null)
  const stopZoomOut = useCallback(() => {
    if (zoomOut.current !== null) cancelAnimationFrame(zoomOut.current)
    zoomOut.current = null
  }, [])
  useEffect(() => stopZoomOut, [stopZoomOut])

  /** What the view framed while live, so the run ending doesn't reframe it. */
  const heldFrame = useRef<Bounds | null>(null)

  // A new plan asks for a new frame, except during a live run: then the view
  // holds still while the plan is built, so the user keeps their place. A
  // controlled canvas never frames itself, live or not: the caller owns the view.
  useEffect(() => {
    if (controlled) {
      stopZoomOut()
      heldFrame.current = null
      return
    }

    if (!live) {
      const held = heldFrame.current
      heldFrame.current = null
      // The run ended on the plan it was building: nothing new to frame.
      if (held && sameBounds(held, framed)) return
      setOwnView(null)
      return
    }

    heldFrame.current = framed
    const current = viewRef.current
    // Not framed yet: the first framing fits the plan the build ends on.
    if (!current) return

    // A first plan draws into a frame that already fits it.
    if (firstPlanRef.current) {
      stopZoomOut()
      setOwnView(fitTo(framed, aspectRef.current))
      return
    }

    // Otherwise only a plan growing past the edge moves the view, and only
    // outwards, just enough, and smoothly.
    if (contains(current, framed)) return
    const target = cover(current, framed, aspectRef.current)
    stopZoomOut()
    const start = performance.now()
    const tick = (): void => {
      const t = Math.min(1, (performance.now() - start) / ZOOM_OUT_MS)
      setOwnView(lerpView(current, target, 1 - Math.pow(1 - t, 3)))
      zoomOut.current = t < 1 ? requestAnimationFrame(tick) : null
    }
    zoomOut.current = requestAnimationFrame(tick)
  }, [framed, live, controlled, stopZoomOut])

  // The initial framing waits until the container has been measured. Doing it
  // earlier would compute against a made-up 1:1 ratio and the plan would show
  // up at an arbitrary zoom.
  useEffect(() => {
    if (controlled) return
    if (size.width <= 1 || size.height <= 1) return
    setOwnView((current) => current ?? fitTo(framed, size.width / size.height))
  }, [size, framed, controlled])

  // Resizing must not move what the user was looking at, only fix the ratio.
  useEffect(() => {
    if (controlled) return
    setOwnView((current) => (current ? reframe(current, aspect) : current))
  }, [aspect, controlled])

  // Current values for the native listeners, which register once.
  const commitRef = useRef(commit)
  commitRef.current = commit

  /**
   * Zoom goes through a native listener rather than React's onWheel: React
   * registers those as passive, where preventDefault() has no effect, so the
   * page would scroll on top of zooming.
   */
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const onWheel = (event: WheelEvent): void => {
      // The user's zoom wins over an automatic zoom-out; the drawing goes on.
      stopZoomOut()
      const current = viewRef.current
      if (!current) return
      event.preventDefault()

      const anchor = unproject(current, event.clientX, event.clientY, host.getBoundingClientRect())
      commitRef.current(zoomAt(current, anchor, Math.exp(event.deltaY * 0.0015)))
    }

    host.addEventListener('wheel', onWheel, { passive: false })
    return () => host.removeEventListener('wheel', onWheel)
  }, [stopZoomOut])


  const drag = useRef<{ x: number; y: number; moved: number } | null>(null)
  /** Distance accumulated in the last gesture, to tell a click from a drag. */
  const moved = useRef(0)

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>): void => {
    stopZoomOut()
    if (event.button !== 0) return
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Some synthetic pointers do not support capture. Dragging still works,
      // it just stops tracking the cursor outside the element.
    }
    drag.current = { x: event.clientX, y: event.clientY, moved: 0 }
    moved.current = 0
  }

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    const state = drag.current
    const current = viewRef.current
    const rect = hostRef.current?.getBoundingClientRect()
    if (!state || !current || !rect) return

    const dx = event.clientX - state.x
    const dy = event.clientY - state.y
    state.moved += Math.abs(dx) + Math.abs(dy)
    moved.current = state.moved
    state.x = event.clientX
    state.y = event.clientY

    if (state.moved <= CLICK_SLOP) return

    const worldDx = (dx / rect.width) * current.width
    const worldDy = (dy / rect.height) * current.height

    setPanning(true)
    commit(pan(current, worldDx, worldDy))
  }

  const endDrag = (event: React.PointerEvent<SVGSVGElement>): void => {
    drag.current = null
    setPanning(false)
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    } catch {
      // See handlePointerDown.
    }
  }

  /**
   * Selection lives on `click` rather than `pointerup` on purpose: `click` is
   * emitted alike by mouse, touch and synthetic pointers, while pointer events
   * do not always arrive complete. All we take from the pointer events is how
   * far it moved, which is what separates a click from a drag.
   */
  const handleClick = (event: React.MouseEvent<SVGSVGElement>): void => {
    if (moved.current > CLICK_SLOP) return
    let target = (event.target as Element).closest('[data-id]')
    // A click never waits for the drawing: it finishes the build, then selects
    // what is under the pointer in the finished plan. Panning, zooming and keys
    // let it keep drawing.
    const build = buildRef.current
    if (build && !build.getSnapshot().idle) {
      flushSync(() => build.finish())
      target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-id]') ?? null
    }
    setSelectedId(target?.getAttribute('data-id') ?? null)
  }

  // What the frame changes per animation frame, read in the markup below.
  const leaving = removalProgress(frame?.inFlight)
  const removing = new Set(
    frame?.inFlight.filter((f) => f.step.kind === 'remove').map((f) => f.step.id) ?? []
  )

  /** How far a sliding wall still has to go, in plan meters. */
  const moveOffset = (id: string): { x: number; y: number } | null => {
    const sliding = progressOf(frame?.inFlight, 'move', id)
    if (sliding === null || !frame) return null
    const before = frame.prev.walls.find((wall) => wall.id === id)
    const after = plan.walls.find((wall) => wall.id === id)
    if (!before || !after) return null
    return {
      x: (1 - sliding) * (before.start[0] - after.start[0]),
      y: (1 - sliding) * (before.start[1] - after.start[1])
    }
  }

  /** A room's name and area follow its fill, in the second half of its step. */
  const labelOpacity = (id: string): number | undefined => {
    const filling = progressOf(frame?.inFlight, 'room', id)
    return filling === null ? undefined : Math.max(0, filling * 2 - 1)
  }

  // Where the assistant's "still working" pulse sits, if anywhere.
  const pulse = pulseAt(frame, reducedMotion)

  // What each current element says about itself when there is a diff. Nothing
  // at all without one, so the plain canvas keeps its DOM.
  const marks = (id: string): ShapeAttrs => {
    if (!diff) return {}
    const status = diffStatus?.[id]
    return {
      'data-diff': status ?? 'unchanged',
      'data-focus': focused.has(id) ? 'true' : undefined
    }
  }
  // A ghost is not an entity: no `data-id`, so selection never sees it, and no
  // pointer events, so a click goes through to what is beneath.
  const ghostAttrs = (id: string): ShapeAttrs => ({
    'data-diff': 'before',
    'data-ghost-of': id,
    'data-focus': focused.has(id) ? 'true' : undefined,
    pointerEvents: 'none'
  })

  // A room that changed size says so in place of its area, with the numbers the
  // diff gave. A room with no earlier or no later area keeps its plain label.
  const areaChanges = new Map(
    (diffAreas ?? []).flatMap(({ roomId, before, after }) =>
      before !== null && after !== null ? [[roomId, { before, after }] as const] : []
    )
  )
  // A removed room has no current label, so its ghost says what it was.
  const removedRooms = ghosts?.rooms.filter((room) => diffStatus?.[room.id] === 'removed') ?? []

  if (!view) {
    return <svg ref={hostRef} className={CANVAS_CLASS} role="img" aria-label="Floor plan" />
  }

  // The viewBox is in meters, so a font-size in pixels would come out the size
  // of a building. Each label is scaled by how many meters a pixel measures:
  // the CSS still rules and the text keeps its on-screen size.
  const metersPerPixel = view.width / size.width
  // Room numbers slide off the room names and areas at this zoom, or hide.
  // Measured from the text actually drawn, so a wider "before → after" area
  // still keeps the numbers off it.
  const labelBlocks = drawing.rooms.map((room) => {
    const change = areaChanges.get(room.id)
    const areaText = change
      ? `${change.before.toFixed(2)} → ${change.after.toFixed(2)} m²`
      : formatArea(room.area)
    return roomLabelBox({ ...room, areaText }, metersPerPixel)
  })

  return (
    <svg
      ref={hostRef}
      className={CANVAS_CLASS}
      viewBox={viewBoxOf(view)}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Floor plan with ${drawing.rooms.length} rooms`}
      tabIndex={0}
      data-panning={panning}
      // The reference image (a backdrop to trace over) is not part of this viewer yet.
      // Both of its attributes stay, so the canvas's markup does not change when it arrives.
      data-has-reference={false}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={handleClick}
      onDoubleClick={fit}
      data-drag-over={false}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setSelectedId(null)
        if (event.key === 'f') fit()
      }}
    >
      {leaving !== null && prevDrawing && (
        // Removed parts, drawn from the plan before, fading out. Not
        // clickable: they are already gone from the plan.
        <g data-leaving="true" opacity={1 - leaving} pointerEvents="none">
          {prevDrawing.rooms
            .filter((room) => removing.has(room.id))
            .map((room) => (
              <path key={room.id} d={pathOf(room.polygon)} data-part="room" data-id={room.id} />
            ))}
          {prevDrawing.walls
            .filter((wall) => removing.has(wall.id))
            .map((wall) =>
              wall.virtual ? (
                <path
                  key={wall.id}
                  d={`M${wall.centerline.map((p) => `${p.x},${-p.y}`).join('L')}`}
                  data-part="virtual"
                  data-id={wall.id}
                />
              ) : (
                wall.slices.map((slice, index) => (
                  <path
                    key={`${wall.id}:${index}`}
                    d={pathOf(slice)}
                    data-part="wall"
                    data-id={wall.id}
                    data-exposure={wall.exposure}
                  />
                ))
              )
            )}
          {prevDrawing.openings
            .filter((opening) => removing.has(opening.id))
            .map((opening) => (
              <path
                key={opening.id}
                d={pathOf(stripAcross(opening.from, opening.to, opening.normal, opening.thickness))}
                data-part="opening"
                data-type={opening.type}
                data-id={opening.id}
              />
            ))}
        </g>
      )}

      {/* A ghost room lies under the current rooms, like a floor that used to be there. */}
      {ghosts?.rooms.map((room) => (
        <RoomShape key={`ghost-room-${room.id}`} room={room} attrs={ghostAttrs(room.id)} />
      ))}

      {drawing.rooms.map((room) => {
        const filling = progressOf(frame?.inFlight, 'room', room.id)
        return (
          <path
            key={room.id}
            d={pathOf(room.polygon)}
            data-part="room"
            data-id={room.id}
            data-selectable="true"
            data-selected={room.id === selectedId}
            opacity={filling ?? undefined}
            {...marks(room.id)}
          />
        )
      })}

      {/* Ghost walls and openings go over the room fills, which are opaque: a removed
          partition or a wall that moved outward lies inside a current room. They stay
          under the current walls, so a wall that kept its place covers its own ghost. */}
      {ghosts?.walls.map((wall) => (
        <WallShape key={`ghost-wall-${wall.id}`} wall={wall} attrs={ghostAttrs(wall.id)} />
      ))}
      {ghosts?.openings.map((opening) => (
        <OpeningShape
          key={`ghost-opening-${opening.id}`}
          opening={opening}
          attrs={ghostAttrs(opening.id)}
        />
      ))}

      {drawing.walls.map((wall) => {
        const tracing = progressOf(frame?.inFlight, 'wall', wall.id)
        const offset = moveOffset(wall.id)
        const transform = offset ? `translate(${offset.x} ${-offset.y})` : undefined

        if (wall.virtual) {
          const [start, end] = wall.centerline
          const reach =
            tracing === null
              ? end
              : { x: start.x + (end.x - start.x) * tracing, y: start.y + (end.y - start.y) * tracing }
          return (
            <path
              key={wall.id}
              d={`M${[start, reach].map((p) => `${p.x},${-p.y}`).join('L')}`}
              data-part="virtual"
              data-id={wall.id}
              data-moving={offset ? wall.id : undefined}
              transform={transform}
              {...marks(wall.id)}
            />
          )
        }

        const slices = tracing === null ? wall.slices : traceWall(wall, tracing)
        return (
          <g key={wall.id} data-moving={offset ? wall.id : undefined} transform={transform}>
            {slices.map((slice, index) => (
              <path
                key={index}
                d={pathOf(slice)}
                data-part="wall"
                data-id={wall.id}
                data-exposure={wall.exposure}
                data-selectable="true"
                data-selected={wall.id === selectedId}
                {...marks(wall.id)}
                {...hit(wall.id)}
              />
            ))}
          </g>
        )
      })}

      {drawing.openings.map((opening) => {
        const opened = progressOf(frame?.inFlight, 'opening', opening.id)
        const span = opened === null ? opening : openingAt(opening, opened)
        const exposure = drawing.walls.find((wall) => wall.id === opening.wallId)?.exposure
        const door = doorSymbolOf(opening, handings.get(opening.id))
        return (
          <Fragment key={opening.id}>
            {opened !== null &&
              // The part of the gap not yet open is still wall, so the wall
              // parts from the opening's centre outwards.
              [
                [opening.from, span.from],
                [span.to, opening.to]
              ].map(([a, b], index) => (
                <path
                  key={index}
                  d={pathOf(stripAcross(a, b, opening.normal, opening.thickness))}
                  data-part="wall"
                  data-exposure={exposure}
                  data-closing="true"
                  pointerEvents="none"
                />
              ))}
            <path
              d={pathOf(stripAcross(span.from, span.to, opening.normal, opening.thickness))}
              data-part="opening"
              data-type={opening.type}
              data-id={opening.id}
              data-selectable="true"
              data-selected={opening.id === selectedId}
              {...marks(opening.id)}
              data-swing={door ? 'true' : undefined}
              {...hit(opening.id)}
            />
            {door && (
              // Drawing, not a target: clicks reach the gap or room underneath.
              <g
                data-part="door-symbol"
                data-opening={opening.id}
                pointerEvents="none"
                aria-hidden="true"
                opacity={opened ?? undefined}
              >
                {door.jambs.map(([a, b], index) => (
                  <line key={index} data-part="jamb" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                ))}
                <line
                  data-part="door-leaf"
                  x1={door.leaf[0].x}
                  y1={door.leaf[0].y}
                  x2={door.leaf[1].x}
                  y2={door.leaf[1].y}
                />
                <path data-part="door-arc" d={door.arc} />
              </g>
            )}
          </Fragment>
        )
      })}

      {dimensions.map((dim) => {
        const shown = steadyDimensions?.has(dimensionKey(dim)) ? 1 : dimensionsShown
        if (shown <= 0) return null
        return (
          <DimensionMark
            key={dim.id}
            dim={dim}
            scale={metersPerPixel}
            labelAt={dim.kind === 'room' ? placeDimensionLabel(dim, labelBlocks, metersPerPixel) : dim.labelAt}
            opacity={shown < 1 ? shown : undefined}
          />
        )
      })}

      {drawing.rooms.map((room) => {
        const change = areaChanges.get(room.id)
        return (
          <g
            key={room.id}
            transform={`translate(${room.labelAt.x} ${-room.labelAt.y}) scale(${metersPerPixel})`}
            opacity={labelOpacity(room.id)}
          >
            <text data-part="label">{room.name}</text>
            <text data-part="area" dy="16">
              {change ? (
                <>
                  {change.before.toFixed(2)} → {change.after.toFixed(2)} m²
                </>
              ) : (
                <>{room.area.toFixed(2)} m²</>
              )}
            </text>
          </g>
        )
      })}

      {/* After the current labels, so the plan's own fills never cover it. Styled,
          faded and hidden on collision by the stylesheet through the ghost's attributes. */}
      {removedRooms.map((room) => (
        <g
          key={`ghost-label-${room.id}`}
          transform={`translate(${room.labelAt.x} ${-room.labelAt.y}) scale(${metersPerPixel})`}
          {...ghostAttrs(room.id)}
        >
          <text data-part="label">{`${room.name} · ${formatArea(room.area)} · removed`}</text>
        </g>
      ))}

      {drawing.openings.map((opening) => {
        const warning = doorWarnings.get(opening.id)
        if (!warning) return null
        const message = warning.messages.join(' ')
        const at = { x: (opening.from.x + opening.to.x) / 2, y: -(opening.from.y + opening.to.y) / 2 }
        return (
          // Sized in screen pixels like the labels. Hovering it is the only
          // thing it does; a click passes on to selection as anywhere else.
          <g
            key={`warning:${opening.id}`}
            data-part="door-warning"
            data-opening={opening.id}
            role="img"
            aria-label={message}
            transform={`translate(${at.x} ${at.y}) scale(${metersPerPixel})`}
            onPointerEnter={() => setHoveredWarning(opening.id)}
            onPointerLeave={() => setHoveredWarning(null)}
          >
            <circle data-part="door-warning-dot" r={WARNING_RADIUS_PX} />
            {hoveredWarning === opening.id && (
              <text data-part="door-warning-text" x={WARNING_RADIUS_PX + 6} dy="4">
                {message}
              </text>
            )}
          </g>
        )
      })}

      {pulse && (
        // Presentation only: not part of the plan, its bounds or selection,
        // and clicks pass through to what's under it.
        <circle
          data-part="pulse"
          className="animate-grid-pulse"
          cx={pulse.x}
          cy={-pulse.y}
          r={PULSE_RADIUS_PX * metersPerPixel}
          pointerEvents="none"
          aria-hidden="true"
        />
      )}
    </svg>
  )
}

/**
 * One dimension: the dimension line, the two extension lines that tie it to
 * what it measures, and the number.
 *
 * The geometry module says what is measured and where the line goes; the tick
 * marks, line weights and typography come from the stylesheet.
 */
function DimensionMark({
  dim,
  scale,
  labelAt,
  opacity
}: {
  dim: Dimension
  scale: number
  /** Where the number goes; `null` hides it and keeps the line. */
  labelAt: Vec2 | null
  opacity?: number
}): JSX.Element {
  const shift = { x: dim.normal.x * dim.offset, y: dim.normal.y * dim.offset }
  const a = { x: dim.from.x + shift.x, y: dim.from.y + shift.y }
  const b = { x: dim.to.x + shift.x, y: dim.to.y + shift.y }

  // Extension lines overshoot the dimension line a little, as on a drawing.
  const overshoot = 0.08
  const tipA = { x: a.x + dim.normal.x * overshoot, y: a.y + dim.normal.y * overshoot }
  const tipB = { x: b.x + dim.normal.x * overshoot, y: b.y + dim.normal.y * overshoot }

  return (
    <g data-part="dimension" data-kind={dim.kind} data-id={dim.id} opacity={opacity}>
      {dim.offset !== 0 && (
        <>
          <line
            data-part="extension"
            x1={dim.from.x}
            y1={-dim.from.y}
            x2={tipA.x}
            y2={-tipA.y}
          />
          <line data-part="extension" x1={dim.to.x} y1={-dim.to.y} x2={tipB.x} y2={-tipB.y} />
        </>
      )}
      <line data-part="dimension-line" x1={a.x} y1={-a.y} x2={b.x} y2={-b.y} />
      {labelAt && (
        <g transform={`translate(${labelAt.x} ${-labelAt.y}) scale(${scale})`}>
          <text data-part="dimension-text" dy="-5">
            {dim.value.toFixed(2)}
          </text>
        </g>
      )}
    </g>
  )
}
