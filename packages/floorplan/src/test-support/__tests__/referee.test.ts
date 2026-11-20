import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { enclosedArea, type SolidWall } from '../referee'
import { insideArea, outline, turn, type Point } from '../outline'

/** The referee's own checks, on shapes simple enough to need no other referee. */

const ring = (points: Point[], t = 0.2, deg = 0): SolidWall[] => outline(points, { thickness: points.map(() => t), rotate: deg }).walls

describe('the independent area referee', () => {
  it('imports nothing, so it cannot share a bug with the geometry', () => {
    const source = readFileSync(resolve(__dirname, '../referee.ts'), 'utf8')
    expect(source).not.toMatch(/^\s*import\s/m)
    expect(source).not.toMatch(/\brequire\(|\bimport\(/)
  })

  it('measures a 5 x 4 room with 0.2 m walls as 4.8 x 3.8 = 18.24 m²', () => {
    expect(enclosedArea(ring([[0, 0], [5, 0], [5, 4], [0, 4]]), [2.5, 2])).toBeCloseTo(18.24, 9)
  })

  it('does not care which way the walls are drawn', () => {
    const walls = outline([[0, 0], [5, 0], [5, 4], [0, 4]], { reverse: [0, 2] }).walls
    expect(enclosedArea(walls, [1, 1])).toBeCloseTo(18.24, 9)
  })

  it('measures a triangle with 0.2 m walls', () => {
    // A right triangle with legs 3 and 4 on the centre lines. Its inner faces sit 0.1 m in,
    // which shrinks it about its incentre (inradius (3 + 4 − 5) / 2 = 1) by (1 − 0.1) / 1.
    const walls = ring([[0, 0], [4, 0], [0, 3]])
    expect(enclosedArea(walls, [0.5, 0.5])).toBeCloseTo(6 * 0.9 * 0.9, 9)
  })

  it('agrees with the corner formula on an L, a U and a plus sign, turned any way', () => {
    const shapes: [Point[], Point][] = [
      [[[0, 0], [6, 0], [6, 3], [3, 3], [3, 6], [0, 6]], [1, 1]],
      [[[0, 0], [6, 0], [6, 5], [4, 5], [4, 2], [2, 2], [2, 5], [0, 5]], [1, 1]],
      [[[2, 0], [4, 0], [4, 2], [6, 2], [6, 4], [4, 4], [4, 6], [2, 6], [2, 4], [0, 4], [0, 2], [2, 2]], [3, 3]]
    ]
    for (const [shape, seed] of shapes) {
      for (const deg of [0, 1, 17, 45, 90, 180, 271]) {
        expect(enclosedArea(ring(shape, 0.2, deg), turn(seed, deg)), `${shape.length} corners at ${deg}°`).toBeCloseTo(insideArea(shape), 9)
      }
    }
  })

  it('refuses a seed inside a wall', () => {
    expect(() => enclosedArea(ring([[0, 0], [5, 0], [5, 4], [0, 4]]), [2.5, 0.05])).toThrow(/inside a wall/)
  })

  it('refuses a seed outside the walls, or inside an outline that does not close', () => {
    const walls = ring([[0, 0], [5, 0], [5, 4], [0, 4]])
    expect(() => enclosedArea(walls, [7, 2])).toThrow(/not enclosed/)
    expect(() => enclosedArea(walls, [2.5, -1])).toThrow(/not enclosed/)
    expect(() => enclosedArea(walls.slice(0, 3), [2.5, 2])).toThrow(/not enclosed/)
  })

  it('tells two rooms apart across a partition', () => {
    const walls: SolidWall[] = [...ring([[0, 0], [6, 0], [6, 4], [0, 4]]), { start: [2, 0], end: [2, 4], thickness: 0.1 }]
    // West: 0.1 to 1.95 by 0.1 to 3.9; east: 2.05 to 5.9.
    expect(enclosedArea(walls, [1, 2])).toBeCloseTo(1.85 * 3.8, 9)
    expect(enclosedArea(walls, [4, 2])).toBeCloseTo(3.85 * 3.8, 9)
  })
})
