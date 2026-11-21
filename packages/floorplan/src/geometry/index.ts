/**
 * Plan geometry: turns the model into the shapes the 2D plan and the 3D scene
 * draw.
 *
 * It depends on neither React, Three nor the DOM: a FloorPlan goes in and
 * points in meters come out. That is why both views come from the same
 * computation and cannot contradict each other.
 */

export * from './vec2'
export * from './plan'
export * from './floors'
export * from './elevations'
export * from './wall'
export * from './room'
export * from './validate'
export * from './floorplan'
export * from './scene3d'
export * from './triangulate'
export * from './dimensions'
export * from './reference'
export * from './door'
export * from './sweep'
export * from './revision'
export * from './build'
export * from './export'
export * from './rules'
export * from './spaces'
export * from './nesting'
export * from './overlaps'
export * from './ghosts'
export * from './diff'
export * from './innerPoint'
