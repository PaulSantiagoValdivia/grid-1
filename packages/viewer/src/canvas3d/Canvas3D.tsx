// 3D model: extruded walls, real openings, orbit camera
import { useCallback, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { floorElevations } from '@ongrid/floorplan/geometry'
import type { PlaybackClock } from '../preview/playback'
import type { PlanBuild } from '../preview/useBuildFrame'
import { isStillClick } from '../preview/click'
import { useReducedMotion } from '../preview/useReducedMotion'
import { usePlanColors } from './usePlanColors'
import { buildingFrame, buildingLayout } from './building'
import { moveRig } from './pivot'
import { Storey3D, type StoreyPointer } from './Storey3D'

type BuildClock = PlaybackClock<PlanBuild>

const NO_BUILDS: ReadonlyMap<string, BuildClock> = new Map()

interface Canvas3DProps {
  floorPlan: FloorPlan
  /**
   * The storey to show as a cutaway, or null for the whole building. A floor
   * the plan doesn't have counts as the whole building; one storey is always
   * shown on its own, exactly as 3D drew before storeys were stacked.
   */
  focus: string | null
  /** Each floor's live build, by floor id. Every storey builds in its own place. */
  builds?: ReadonlyMap<string, BuildClock>
  /** A room to show, its slab drawn in the plan-note colour. Without it nothing changes. */
  highlightRoom?: string | null
  /** A still click on a storey other than the focused one. */
  onFocus?: (floorId: string) => void
}

/** Where the hover label sits, from the pointer, in pixels. */
const LABEL_OFFSET = 14

export function Canvas3D({
  floorPlan,
  focus,
  builds = NO_BUILDS,
  highlightRoom = null,
  onFocus
}: Canvas3DProps): JSX.Element {
  const colors = usePlanColors()
  const reducedMotion = useReducedMotion()

  // One stacking rule for 3D and IFC (`floorElevations`); the layout and the
  // framing only read it.
  const elevations = useMemo(() => floorElevations(floorPlan), [floorPlan])
  const layout = useMemo(() => buildingLayout(floorPlan, focus, elevations), [floorPlan, focus, elevations])
  const frame = useMemo(() => buildingFrame(floorPlan, elevations, focus), [floorPlan, elevations, focus])

  // The camera props are initial-only: the camera never moves on its own when
  // the plan changes. The pivot follows the footprint's centre in x and z, as
  // it always has, and only a change of focus eases its height (and the
  // camera's with it).
  const [initial] = useState(frame)
  const frameRef = useRef(frame)
  frameRef.current = frame
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the focus is the trigger, not the plan
  const goalY = useMemo(() => frameRef.current.target[1], [focus])

  // Hover: which storey is under the pointer changes React state; the label
  // follows the pointer through its own DOM node, with no render per move.
  const container = useRef<HTMLDivElement>(null)
  const label = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  const pointer = useMemo<StoreyPointer | undefined>(() => {
    if (layout.single) return undefined
    return {
      onMove: (floorId: string, event: ThreeEvent<PointerEvent>) => {
        // The nearest storey under the pointer takes it.
        event.stopPropagation()
        setHovered(floorId)
        const box = container.current?.getBoundingClientRect()
        if (box && label.current) {
          label.current.style.transform = `translate(${event.clientX - box.left + LABEL_OFFSET}px, ${
            event.clientY - box.top + LABEL_OFFSET
          }px)`
        }
      },
      onLeave: (floorId: string) => setHovered((current) => (current === floorId ? null : current)),
      onClick: (floorId: string, event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation()
        // Orbiting, panning and zooming are not clicks.
        if (!isStillClick(event.delta)) return
        if (floorId !== layout.focus) onFocus?.(floorId)
      }
    }
  }, [layout.single, layout.focus, onFocus])

  // A storey that is no longer drawn can't stay hovered.
  const shownHover = layout.storeys.some((s) => s.floorId === hovered && s.look !== 'hidden') ? hovered : null
  const hoveredName = layout.storeys.find((s) => s.floorId === shownHover)?.name ?? null
  const onRoof = useCallback((floorId: string) => layout.roof?.floorIds.includes(floorId) ?? false, [layout.roof])

  const { shadow } = frame
  const [cx, , cz] = frame.target

  return (
    <div ref={container} className="relative size-full overflow-hidden" style={{ cursor: shownHover ? 'pointer' : undefined }}>
      <Canvas shadows camera={{ position: initial.position, fov: 45 }}>
        <color attach="background" args={[colors.background]} />
        <hemisphereLight args={['#fdfbf5', '#6b6553', 2.2]} />
        <directionalLight
          position={shadow.position}
          intensity={1.3}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0005}
          shadow-camera-left={-shadow.extent}
          shadow-camera-right={shadow.extent}
          shadow-camera-top={shadow.extent}
          shadow-camera-bottom={-shadow.extent}
          shadow-camera-near={shadow.near}
          shadow-camera-far={shadow.far}
        />

        {/* At the ground, where it reads as ground; basements go below it. */}
        <Grid
          position={[cx, -0.01, cz]}
          args={[40, 40]}
          cellSize={1}
          cellColor={colors.grid}
          sectionSize={5}
          sectionColor={colors.gridSection}
          fadeDistance={45}
          infiniteGrid
        />

        {layout.storeys.map((storey) =>
          storey.look === 'hidden' ? null : (
            <Storey3D
              key={storey.floorId}
              floorPlan={floorPlan}
              storey={storey}
              roofAt={onRoof(storey.floorId) && layout.roof ? layout.roof.bottom - storey.base : null}
              build={builds.get(storey.floorId) ?? null}
              colors={colors}
              highlightRoom={highlightRoom}
              hovered={storey.floorId === shownHover}
              castShadow={!layout.single}
              pointer={pointer}
            />
          )
        )}

        {/* Orbiting lets the build keep rising, like scrolling while code is written. */}
        <OrbitControls target={initial.target} makeDefault />
        <BuildingCamera x={cx} z={cz} goalY={goalY} reducedMotion={reducedMotion} />
      </Canvas>

      {!layout.single && (
        <div
          ref={label}
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-sm"
          style={{ visibility: hoveredName ? 'visible' : 'hidden' }}
        >
          {hoveredName}
        </div>
      )}
    </div>
  )
}

/** The orbit controls `makeDefault` registers, as far as the rig needs them. */
interface OrbitRig {
  target: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void }
  update: () => void
}

/**
 * Keeps the orbit pivot on the footprint's centre (`x`, `z`) and eases it to
 * `goalY`, moving the camera up or down by the same amount so the angle and
 * distance the user orbited to hold (design D3). It renders nothing.
 */
function BuildingCamera({
  x,
  z,
  goalY,
  reducedMotion
}: {
  x: number
  z: number
  goalY: number
  reducedMotion: boolean
}): null {
  const controls = useThree((state) => state.controls) as unknown as OrbitRig | null
  const camera = useThree((state) => state.camera)

  useFrame((_, dt) => {
    if (!controls) return
    const { target } = controls
    if (target.x === x && target.y === goalY && target.z === z) return
    // A new footprint centre is taken at once, as 3D always did: only the
    // view's direction changes, never the camera's place.
    target.set(x, target.y, z)
    const next = moveRig(
      [target.x, target.y, target.z],
      [camera.position.x, camera.position.y, camera.position.z],
      goalY,
      dt,
      reducedMotion
    )
    target.set(...next.target)
    camera.position.set(...next.camera)
    controls.update()
  })
  return null
}
