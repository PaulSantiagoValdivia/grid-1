import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { rasterise, type RasterImage } from '../rasterise'
import { acesFilmic, linearToSrgb } from '../toneMap'

/** A camera at (0, 0, 5) looking down -z, as Three's examples set one up. */
function camera(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  c.position.set(0, 0, 5)
  c.lookAt(0, 0, 0)
  c.updateProjectionMatrix()
  return c
}

function scene(background = '#000000'): THREE.Scene {
  const s = new THREE.Scene()
  s.background = new THREE.Color(background)
  return s
}

function pixel(image: RasterImage, x: number, y: number): [number, number, number] {
  const i = (y * image.width + x) * 4
  return [image.data[i]!, image.data[i + 1]!, image.data[i + 2]!]
}

/** A square of side `size` at depth `z`, facing the camera. */
function square(color: string, z: number, size = 2, options: THREE.MeshBasicMaterialParameters = {}): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color, toneMapped: false, ...options }))
  mesh.position.z = z
  return mesh
}

const SIZE = { width: 32, height: 32 }

describe('rasterise', () => {
  it('fills the background with the scene background, as its hex says', () => {
    const image = rasterise(scene('#f1eee8'), camera(), SIZE)
    expect(pixel(image, 0, 0)).toEqual([0xf1, 0xee, 0xe8])
    expect(image.data.length).toBe(32 * 32 * 4)
  })

  it('draws an unlit face in its own colour, and leaves the corners alone', () => {
    const s = scene()
    s.add(square('#ff0000', 0))
    const image = rasterise(s, camera(), SIZE)
    expect(pixel(image, 16, 16)).toEqual([255, 0, 0])
    expect(pixel(image, 0, 0)).toEqual([0, 0, 0])
  })

  it('keeps the nearer face in front, whatever order they come in', () => {
    for (const order of [0, 1]) {
      const s = scene()
      const parts = [square('#ff0000', 0), square('#0000ff', 1, 1)]
      if (order) parts.reverse()
      s.add(...parts)
      expect(pixel(rasterise(s, camera(), SIZE), 16, 16)).toEqual([0, 0, 255])
    }
  })

  it('leaves out a face seen from behind, unless its material shows both sides', () => {
    const away = square('#ff0000', 0)
    away.rotation.y = Math.PI
    const s = scene()
    s.add(away)
    expect(pixel(rasterise(s, camera(), SIZE), 16, 16)).toEqual([0, 0, 0])
    ;(away.material as THREE.MeshBasicMaterial).side = THREE.DoubleSide
    expect(pixel(rasterise(s, camera(), SIZE), 16, 16)).toEqual([255, 0, 0])
  })

  it('lights a matte face by the scene lights, brighter where it faces the sun', () => {
    const s = scene()
    s.add(new THREE.HemisphereLight('#ffffff', '#000000', 1))
    const sun = new THREE.DirectionalLight('#ffffff', 2)
    sun.position.set(0, 0, 10)
    s.add(sun)
    const material = new THREE.MeshStandardMaterial({ color: '#808080', roughness: 1 })
    const facing = new THREE.Mesh(new THREE.PlaneGeometry(1, 2), material)
    facing.position.x = -0.6
    const turned = new THREE.Mesh(new THREE.PlaneGeometry(1, 2), material)
    turned.position.x = 0.6
    turned.rotation.y = 1.2
    s.add(facing, turned)
    const image = rasterise(s, camera(), { width: 64, height: 64 })
    const left = pixel(image, 23, 32)[0]
    const right = pixel(image, 40, 32)[0]
    expect(left).toBeGreaterThan(right)

    // The facing one by hand: hemisphere halfway between its colours, plus the full sun.
    const albedo = new THREE.Color('#808080').r
    const lit = (albedo / Math.PI) * (0.5 + 2)
    const out = [0, 0, 0]
    acesFilmic(lit, lit, lit, out)
    expect(left).toBe(Math.round(linearToSrgb(out[0]!) * 255))
  })

  it('draws a dashed line with gaps where its line distance falls in one', () => {
    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-2, 0, 0), new THREE.Vector3(2, 0, 0)])
    geometry.setAttribute('lineDistance', new THREE.Float32BufferAttribute([0, 4], 1))
    const solid = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#ffffff', toneMapped: false }))
    const dashed = new THREE.LineSegments(
      geometry,
      new THREE.LineDashedMaterial({ color: '#ffffff', toneMapped: false, dashSize: 0.5, gapSize: 0.5 })
    )
    const lit = (line: THREE.LineSegments): number => {
      const s = scene()
      s.add(line)
      const image = rasterise(s, camera(), { width: 64, height: 64, supersample: 1 })
      let count = 0
      for (let x = 0; x < 64; x++) if (pixel(image, x, 32)[0] > 0 || pixel(image, x, 31)[0] > 0) count++
      return count
    }
    const full = lit(solid)
    expect(full).toBeGreaterThan(40)
    expect(lit(dashed)).toBeGreaterThan(full * 0.35)
    expect(lit(dashed)).toBeLessThan(full * 0.65)
  })

  it('blends a see-through face over what is behind it', () => {
    const s = scene()
    s.add(square('#ffffff', 0, 2, { transparent: true, opacity: 0.5 }))
    const [r] = pixel(rasterise(s, camera(), SIZE), 16, 16)
    expect(r).toBeGreaterThan(120)
    expect(r).toBeLessThan(135)
  })

  it('does not draw what lies behind the camera', () => {
    const s = scene()
    s.add(square('#ff0000', 10, 50))
    expect(pixel(rasterise(s, camera(), SIZE), 16, 16)).toEqual([0, 0, 0])
  })
})
