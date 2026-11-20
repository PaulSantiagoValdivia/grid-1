/**
 * The app's own 3D scene, built in plain Node for a still.
 *
 * React Three Fiber builds Three objects from React components and only hands them to a
 * renderer to draw. Here it is given a renderer that draws nothing, so mounting the app's
 * `BuildingScene` leaves the very meshes, materials and lights the app would show in a
 * `THREE.Scene`, which `rasterise` then draws in software. No browser, no WebGL, no GPU.
 */
import * as THREE from 'three'
import { _roots, advance, createRoot, extend, flushSync, type RootState } from '@react-three/fiber'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { floorElevations } from '@ongrid/floorplan/geometry'
import { BuildingScene } from '../canvas3d/BuildingScene'
import { buildingFrame, buildingLayout, type BuildingFrame, type BuildingLayout } from '../canvas3d/building'
import { openingCamera } from '../canvas3d/camera'
import type { PlanColors3D } from '../canvas3d/usePlanColors'

export interface StillSceneOptions {
  /** The storey to show as a cutaway, as the app's floor focus does. The whole building by default. */
  readonly focus?: string | null
  readonly colors: PlanColors3D
  /** The picture's size in pixels, which sets the camera's aspect. */
  readonly width: number
  readonly height: number
}

export interface StillScene {
  readonly scene: THREE.Scene
  /** The camera as the app opens it, pointed at the pivot as its orbit controls point it. */
  readonly camera: THREE.PerspectiveCamera
  readonly frame: BuildingFrame
  readonly layout: BuildingLayout
  /** Unmounts the scene and frees its geometry. */
  readonly close: () => void
}

/** The parts of a renderer React Three Fiber calls while it builds a scene. It draws nothing. */
function nullRenderer(canvas: object): THREE.WebGLRenderer {
  const renderer = {
    domElement: canvas,
    render() {},
    setPixelRatio() {},
    setSize() {}
  }
  return renderer as unknown as THREE.WebGLRenderer
}

let extended = false

/** Mounts the app's 3D scene for `plan` and returns it with the opening camera. */
export function stillScene(plan: FloorPlan, options: StillSceneOptions): StillScene {
  if (!extended) {
    // The app's canvas does the same: every Three class can be written as a component.
    extend(THREE as unknown as Parameters<typeof extend>[0])
    extended = true
  }
  const focus = options.focus ?? null
  const elevations = floorElevations(plan)
  const layout = buildingLayout(plan, focus, elevations)
  const frame = buildingFrame(plan, elevations, focus)

  // Fiber keeps one root per canvas: any object will do as the key.
  const canvas = {}
  const root = createRoot(canvas as HTMLCanvasElement)
  root.configure({
    gl: nullRenderer(canvas),
    frameloop: 'never',
    dpr: 1,
    size: { width: options.width, height: options.height, top: 0, left: 0 },
    camera: openingCamera(frame)
  })

  let store: ReturnType<typeof root.render> | undefined
  flushSync(() => {
    store = root.render(<BuildingScene floorPlan={plan} layout={layout} frame={frame} colors={options.colors} />)
  })
  const state: RootState = store!.getState()
  // One frame, as the app draws before anything is seen: it puts every part at rest.
  advance(0, true, state)

  const camera = state.camera as THREE.PerspectiveCamera
  camera.aspect = options.width / options.height
  camera.lookAt(...frame.target)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()

  const close = (): void => {
    // Unmounting runs the components' clean-ups, which free their geometry. Fiber's own
    // unmount waits half a second before letting go of the root, which would hold a
    // command open, so the root is dropped here instead.
    flushSync(() => {
      root.render(null)
    })
    _roots.delete(canvas as HTMLCanvasElement)
  }

  return { scene: state.scene, camera, frame, layout, close }
}
