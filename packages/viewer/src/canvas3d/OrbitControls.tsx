// The orbit camera: three's own orbit controls, made the canvas's default controls.
import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

interface OrbitControlsProps {
  /** Where the camera orbits around, set once when the controls are made. */
  target: readonly [number, number, number]
}

/**
 * Orbiting, panning and zooming with the pointer, eased (damping on). The controls are the
 * canvas's `controls`, so `BuildingCamera` can move their pivot. It renders nothing.
 */
export function OrbitControls({ target }: OrbitControlsProps): null {
  const camera = useThree((state) => state.camera)
  const element = useThree((state) => (state.events.connected as HTMLElement | undefined) ?? state.gl.domElement)
  const set = useThree((state) => state.set)
  const get = useThree((state) => state.get)

  const controls = useMemo(() => {
    const made = new ThreeOrbitControls(camera)
    made.enableDamping = true
    return made
  }, [camera])

  // The pivot is initial-only, as the camera is: the caller hands the same target every render.
  useEffect(() => {
    controls.target.set(...target)
    controls.update()
  }, [controls, target])

  useEffect(() => {
    controls.domElement = element
    controls.connect()
    return () => controls.disconnect()
  }, [controls, element])

  useEffect(() => {
    const previous = get().controls
    set({ controls })
    return () => set({ controls: previous })
  }, [controls, get, set])

  // Before the scene draws, so damping carries on after the pointer lets go.
  useFrame(() => {
    if (controls.enabled) controls.update()
  }, -1)

  return null
}
