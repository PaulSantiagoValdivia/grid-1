import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FloorPlan, Opening, Wall } from '../plan'
import type { DoorSwingValues } from '../sweep'
import { validateDoorSweeps } from '../sweep'

/**
 * Door-sweep warnings.
 *
 * Every test hands the values in through `swingOf`, so each case states its
 * swing without building a full opening.
 *
 * The base fixture is one 4 m wall along +X with a 90 cm door from x = 1 to
 * x = 1.9. With `hinge: 'start'` and `swing: 'left'` its sweep is the quarter
 * disc centred on (1, 0), radius 0.9, over +X and +Y.
 */

type Tuple = [number, number]

function wall(id: string, start: Tuple, end: Tuple, extra: Partial<Wall> = {}): Wall {
  return { id, start, end, thickness: 0.2, height: 2.5, kind: 'interior', ...extra }
}

function door(id: string, wallId: string, offset: number, extra: Partial<Opening> = {}): Opening {
  return { id, wall: wallId, type: 'door', offset, width: 0.9, sill: 0, height: 2.1, ...extra }
}

function plan(walls: Wall[], openings: Opening[]): FloorPlan {
  return { version: '1', units: 'm', walls, rooms: [], openings }
}

const base = (): FloorPlan => plan([wall('w0', [0, 0], [4, 0])], [door('d1', 'w0', 1)])

function valuesOf(map: Record<string, DoorSwingValues>) {
  return (opening: Opening): DoorSwingValues | undefined => map[opening.id]
}

const codes = (p: FloorPlan, map: Record<string, DoorSwingValues>): string[] =>
  validateDoorSweeps(p, valuesOf(map)).map((i) => `${i.code} ${i.id}`)

describe('half a swing', () => {
  it('reports a swing with no hinge, in plain language, as a warning', () => {
    const issues = validateDoorSweeps(base(), valuesOf({ d1: { swing: 'right' } }))
    expect(issues).toEqual([
      {
        code: 'opening/swing-without-hinge',
        entity: 'opening',
        id: 'd1',
        message: "This door is missing which side it hangs on, so it's drawn without a swing.",
        severity: 'warning',
        hits: []
      }
    ])
  })

  it('reports a hinge with no swing, in plain language, as a warning', () => {
    const issues = validateDoorSweeps(base(), valuesOf({ d1: { hinge: 'end', swing: null } }))
    expect(issues).toEqual([
      {
        code: 'opening/hinge-without-swing',
        entity: 'opening',
        id: 'd1',
        message: "This door is missing which way it opens, so it's drawn without a swing.",
        severity: 'warning',
        hits: []
      }
    ])
  })

  it('says nothing about a door with neither value, even one that would hit a wall', () => {
    const p = base()
    p.walls.push(wall('w1', [1.5, -1], [1.5, 2]))
    expect(validateDoorSweeps(p, valuesOf({}))).toEqual([])
    expect(validateDoorSweeps(p, valuesOf({ d1: { hinge: null, swing: undefined } }))).toEqual([])
    expect(validateDoorSweeps(p, () => null)).toEqual([])
  })

  it('never asks about a window or a doorless opening, and never names one', () => {
    const p = plan(
      [wall('w0', [0, 0], [6, 0])],
      [
        door('win', 'w0', 0.2, { type: 'window', sill: 0.9, height: 1.2 }),
        door('gap', 'w0', 2, { type: 'opening' }),
        door('d1', 'w0', 4)
      ]
    )
    const asked: string[] = []
    const issues = validateDoorSweeps(p, (opening) => {
      asked.push(opening.id)
      return { swing: 'left' }
    })
    expect(asked).toEqual(['d1'])
    expect(issues.map((i) => i.id)).toEqual(['d1'])
  })

  it('leaves out a door the plan cannot draw', () => {
    // Runs past the end of its wall: validation already reports why it is not drawn.
    const p = plan([wall('w0', [0, 0], [1, 0])], [door('d1', 'w0', 0.5)])
    expect(codes(p, { d1: { swing: 'left' } })).toEqual([])
  })
})

/** A wall parallel to the door's, with its lower face at `face`. */
const ceilingAt = (id: string, face: number): Wall => wall(id, [0, face + 0.1], [4, face + 0.1])

const OPEN_LEFT: DoorSwingValues = { hinge: 'start', swing: 'left' }

const blocked = (p: FloorPlan, values: DoorSwingValues = OPEN_LEFT) =>
  validateDoorSweeps(p, valuesOf({ d1: values }))

describe('a door against a wall', () => {
  it('reports a wall 2 cm into the sweep, in plain language, naming the wall', () => {
    const p = base()
    // The open leaf reaches y = 0.9; this face stands at y = 0.88.
    p.walls.push(ceilingAt('w1', 0.88))
    expect(blocked(p)).toEqual([
      {
        code: 'opening/door-blocked',
        entity: 'opening',
        id: 'd1',
        message: 'This door hits a wall when it opens.',
        severity: 'warning',
        hits: ['w1']
      }
    ])
  })

  it('clears once the wall stands 2 cm clear of the sweep', () => {
    const p = base()
    p.walls.push(ceilingAt('w1', 0.92))
    expect(blocked(p)).toEqual([])
  })

  it('lets a wall reach in by less than 1 cm', () => {
    const p = base()
    p.walls.push(ceilingAt('w1', 0.895))
    expect(blocked(p)).toEqual([])
  })

  it('reports a sweep that lies wholly inside a wall', () => {
    // No edge of the wall crosses the sweep and no corner lies in it.
    const p = base()
    p.walls.push(wall('w1', [-1, 0.5], [5, 0.5], { thickness: 2 }))
    expect(blocked(p).map((i) => i.hits)).toEqual([['w1']])
  })

  it('reports one warning naming every wall the sweep hits', () => {
    const p = base()
    p.walls.push(ceilingAt('w1', 0.88), wall('w2', [1.8, 0.1], [1.8, 3]))
    expect(blocked(p).map((i) => [i.code, i.hits])).toEqual([
      ['opening/door-blocked', ['w1', 'w2']]
    ])
  })

  it('checks the side the door opens to, not the other one', () => {
    const p = base()
    p.walls.push(ceilingAt('w1', 0.88))
    expect(blocked(p, { hinge: 'start', swing: 'right' })).toEqual([])
    expect(blocked(p, { hinge: 'end', swing: 'left' }).map((i) => i.hits)).toEqual([['w1']])
  })
})

describe('what counts as a wall', () => {
  it('never counts the door\'s own wall', () => {
    // Base plan alone: the sweep starts on w0's axis and opens off it.
    for (const hinge of ['start', 'end'] as const) {
      for (const swing of ['left', 'right'] as const) {
        expect(blocked(base(), { hinge, swing })).toEqual([])
      }
    }
  })

  it('never counts a virtual wall, even one drawn with a thickness', () => {
    const p = base()
    p.walls.push({ ...ceilingAt('v1', 0.5), virtual: true })
    expect(blocked(p)).toEqual([])
  })

  it('never counts a wall on another floor', () => {
    const p = base()
    p.walls.push({ ...ceilingAt('w1', 0.5), floor: 'first' })
    expect(blocked(p)).toEqual([])
  })

  it('never counts a wall meeting the door\'s wall flush with the hinge jamb', () => {
    // Its face is x = 1, the hinge: the open leaf rests against it.
    const p = base()
    p.walls.push(wall('w1', [0.9, 0], [0.9, 3]))
    expect(blocked(p)).toEqual([])
  })

  it('lets a wall sit less than 1 cm past either straight side, but not 2 cm', () => {
    // Past the open leaf: a wall meeting at the hinge jamb, slightly out of flush.
    const pastLeaf = (face: number): FloorPlan => {
      const p = base()
      p.walls.push(wall('w1', [face - 0.1, 0], [face - 0.1, 3]))
      return p
    }
    expect(blocked(pastLeaf(1.005))).toEqual([])
    expect(blocked(pastLeaf(1.02)).map((i) => i.hits)).toEqual([['w1']])

    // Past the closed leaf: a stub whose top face rises above the door's axis.
    const pastClosed = (face: number): FloorPlan => {
      const p = base()
      p.walls.push(wall('w1', [1.2, face - 0.1], [1.7, face - 0.1]))
      return p
    }
    expect(blocked(pastClosed(0.005))).toEqual([])
    expect(blocked(pastClosed(0.02)).map((i) => i.hits)).toEqual([['w1']])
  })

  it('lets the leaf swing into another wall\'s doorway, but not into a window\'s sill', () => {
    // w1's face at y = 0.75 crosses the sweep between x = 1 and about x = 1.5.
    const withGap = (type: Opening['type']): FloorPlan => {
      const p = base()
      p.walls.push(ceilingAt('w1', 0.75))
      const extra = type === 'window' ? { sill: 0.9, height: 1.2 } : {}
      p.openings.push(door('g1', 'w1', 0.9, { type, ...extra }))
      return p
    }
    expect(blocked(withGap('opening'))).toEqual([])
    expect(blocked(withGap('window')).map((i) => i.hits)).toEqual([['w1']])
  })
})

/** Every wall turned by `theta` about the origin. Openings ride along. */
function turned(p: FloorPlan, theta: number): FloorPlan {
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  const rot = ([x, y]: Tuple): Tuple => [x * c - y * s, x * s + y * c]
  return { ...p, walls: p.walls.map((w) => ({ ...w, start: rot(w.start), end: rot(w.end) })) }
}

/** `wallId` drawn the other way round, its openings mirrored so they stay put. */
function reversed(p: FloorPlan, wallId: string): FloorPlan {
  const w = p.walls.find((candidate) => candidate.id === wallId)!
  const len = Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1])
  return {
    ...p,
    walls: p.walls.map((x) => (x.id === wallId ? { ...x, start: x.end, end: x.start } : x)),
    openings: p.openings.map((o) =>
      o.wall === wallId ? { ...o, offset: len - o.offset - o.width } : o
    )
  }
}

const flipped = ({ hinge, swing }: DoorSwingValues): DoorSwingValues => ({
  hinge: hinge === 'start' ? 'end' : 'start',
  swing: swing === 'left' ? 'right' : 'left'
})

/**
 * Walls around d1 that block some swings and not others: w1 above the door
 * (every swing to the left), and a short stub below it that only the swing
 * hung from the start jamb reaches.
 */
function surrounded(): FloorPlan {
  const p = base()
  p.walls.push(ceilingAt('w1', 0.88), wall('w2', [0.5, -0.8], [1.2, -0.8], { thickness: 0.1 }))
  return p
}

const COMBINATIONS: DoorSwingValues[] = [
  { hinge: 'start', swing: 'left' },
  { hinge: 'end', swing: 'left' },
  { hinge: 'start', swing: 'right' },
  { hinge: 'end', swing: 'right' }
]

describe('the same building, however it is drawn', () => {
  it('blocks what the fixture says it blocks', () => {
    expect(COMBINATIONS.map((values) => blocked(surrounded(), values).map((i) => i.hits))).toEqual([
      [['w1']],
      [['w1']],
      [['w2']],
      []
    ])
  })

  it.each([37, 90, 211])('gives the same warnings with the plan turned by %i°', (degrees) => {
    for (const values of COMBINATIONS) {
      const turnedPlan = turned(surrounded(), (degrees * Math.PI) / 180)
      expect(blocked(turnedPlan, values)).toEqual(blocked(surrounded(), values))
    }
  })

  it('gives the same warnings with the door\'s wall drawn the other way round', () => {
    for (const values of COMBINATIONS) {
      expect(blocked(reversed(surrounded(), 'w0'), flipped(values))).toEqual(
        blocked(surrounded(), values)
      )
    }
  })
})

/** Two doors in a corner, each 30 cm from it, both opening into the corner. */
function corner(): FloorPlan {
  return plan(
    [wall('w0', [0, 0], [4, 0]), wall('wv', [0, 0], [0, 4])],
    [door('d1', 'w0', 0.3), door('d2', 'wv', 0.3)]
  )
}

// wv runs up +Y, so its left face is -X: the corner side is its right.
const INTO_CORNER = { d1: OPEN_LEFT, d2: { hinge: 'start', swing: 'right' } } as const

/**
 * Two doors on facing walls, 1.2 m apart, whose open leaves both end up on
 * x = 1. d2's sweep is moved `overlap` metres past d1's open leaf.
 */
function facing(overlap: number): FloorPlan {
  return plan(
    [wall('w0', [0, 0], [4, 0]), wall('w1', [4, 1.2], [0, 1.2])],
    // w1 runs along -X: its hinge 'start' jamb sits at x = 4 - offset.
    [door('d1', 'w0', 1), door('d2', 'w1', 3 - overlap)]
  )
}

const FACING = { d1: OPEN_LEFT, d2: OPEN_LEFT } as const

describe('a door against another door', () => {
  it('reports two doors opening into each other once, on the first, naming the second', () => {
    expect(validateDoorSweeps(corner(), valuesOf(INTO_CORNER))).toEqual([
      {
        code: 'opening/doors-collide',
        entity: 'opening',
        id: 'd1',
        message: 'These two doors hit each other when they open.',
        severity: 'warning',
        hits: ['d2']
      }
    ])
  })

  it('puts the warning on whichever door comes first in the plan', () => {
    const p = corner()
    p.openings.reverse()
    expect(
      validateDoorSweeps(p, valuesOf(INTO_CORNER)).map((i) => [i.code, i.id, i.hits])
    ).toEqual([['opening/doors-collide', 'd2', ['d1']]])
  })

  it('lets the two leaves of a double door meet in the middle', () => {
    const p = plan(
      [wall('w0', [0, 0], [4, 0])],
      [door('d1', 'w0', 1), door('d2', 'w0', 1.9)]
    )
    expect(codes(p, { d1: OPEN_LEFT, d2: { hinge: 'end', swing: 'left' } })).toEqual([])
  })

  it('lets two doors on different floors share a spot', () => {
    const p = corner()
    p.walls[1] = { ...p.walls[1]!, floor: 'first' }
    expect(codes(p, INTO_CORNER)).toEqual([])
  })

  it('leaves a door with one value out of every pair', () => {
    expect(codes(corner(), { d1: OPEN_LEFT, d2: { hinge: 'start' } })).toEqual([
      'opening/hinge-without-swing d2'
    ])
  })

  it('lets a sliver under 1 cm wide pass, but not one 2 cm wide', () => {
    expect(codes(facing(0), FACING)).toEqual([])
    expect(codes(facing(0.005), FACING)).toEqual([])
    expect(codes(facing(0.02), FACING)).toEqual(['opening/doors-collide d1'])
  })

  it.each([37, 211])('gives the same answers with the plan turned by %i°', (degrees) => {
    const theta = (degrees * Math.PI) / 180
    // A turned sliver is wide in x and in y; only its narrowest width is under 1 cm.
    const all = (p: FloorPlan, map: Record<string, DoorSwingValues>) =>
      validateDoorSweeps(p, valuesOf(map))
    for (const p of [facing(0.005), facing(0.02)]) {
      expect(all(turned(p, theta), FACING)).toEqual(all(p, FACING))
    }
    expect(all(turned(corner(), theta), INTO_CORNER)).toEqual(all(corner(), INTO_CORNER))
  })
})

describe('the sweep module', () => {
  const source = readFileSync(join(__dirname, '..', 'sweep.ts'), 'utf8')
  const FORBIDDEN = /from '(react|react-dom|three|@react-three\/[^']+|node:[^']+)'|\b(window|document)\./

  const offending = (text: string): boolean =>
    FORBIDDEN.test(text) ||
    [...text.matchAll(/from '([^']+)'/g)].some(
      ([, path]) => !path!.startsWith('./') && !path!.startsWith('../')
    )

  it('imports only from the geometry core and the shared types', () => {
    expect(offending(source)).toBe(false)
  })

  it.each([
    "import { useState } from 'react'",
    "import * as THREE from 'three'",
    "import { readFileSync } from 'node:fs'",
    'const width = window.innerWidth'
  ])('would catch %s', (line) => {
    expect(offending(`${line}\n${source}`)).toBe(true)
  })
})
