import { describe, expect, it } from 'vitest'
import type { FloorPlan, Opening, Room, Wall } from '@ongrid/floorplan/types/floorplan'
import {
  IDLE,
  matchViewWords,
  nextFollowState,
  noticeText,
  planChange,
  type FollowInput,
  type FollowState,
  type FollowView
} from '../follow'

function wall(id: string, floor: string, extra: Partial<Wall> = {}): Wall {
  return { id, start: [0, 0], end: [4, 0], thickness: 0.2, height: 2.7, kind: 'exterior', floor, ...extra }
}

function room(id: string, floor: string, walls: string[], extra: Partial<Room> = {}): Room {
  return { id, name: id, boundary: walls, floor, ...extra }
}

function opening(id: string, wallId: string, extra: Partial<Opening> = {}): Opening {
  return { id, wall: wallId, type: 'window', offset: 1, width: 1, sill: 0.9, height: 1.2, ...extra }
}

function plan(walls: Wall[], rooms: Room[] = [], openings: Opening[] = []): FloorPlan {
  return {
    version: '1',
    units: 'm',
    floors: [
      { id: 'ground', name: 'Ground floor', level: 0 },
      { id: 'first', name: 'First floor', level: 1 }
    ],
    walls,
    rooms,
    openings
  }
}

const base = plan(
  [wall('g1', 'ground'), wall('g2', 'ground'), wall('f1', 'first'), wall('f2', 'first')],
  [room('gr', 'ground', ['g1', 'g2']), room('fr', 'first', ['f1', 'f2'])],
  [opening('go', 'g1'), opening('fo', 'f1')]
)

function edit(p: FloorPlan, change: Partial<FloorPlan>): FloorPlan {
  return { ...p, ...change }
}

function moveWall(p: FloorPlan, id: string, extra: Partial<Wall>): FloorPlan {
  return edit(p, { walls: p.walls.map((w) => (w.id === id ? { ...w, ...extra } : w)) })
}

describe('planChange', () => {
  it('finds nothing in identical plans', () => {
    const change = planChange(base, structuredClone(base))
    expect(change.floors.size).toBe(0)
    expect(change.heightOnly).toBe(false)
  })

  it('counts an edit on one floor', () => {
    const change = planChange(base, moveWall(base, 'f1', { end: [5, 0] }))
    expect([...change.floors]).toEqual([['first', 1]])
    expect(change.heightOnly).toBe(false)
  })

  it('counts edits on two floors', () => {
    const next = moveWall(moveWall(moveWall(base, 'f1', { end: [5, 0] }), 'f2', { end: [6, 0] }), 'g1', { end: [6, 0] })
    const change = planChange(base, next)
    expect(change.floors.get('first')).toBe(2)
    expect(change.floors.get('ground')).toBe(1)
  })

  it('counts added and removed entities on the floor they were on', () => {
    const next = edit(base, {
      walls: [...base.walls.filter((w) => w.id !== 'g2'), wall('f3', 'first')],
      rooms: [...base.rooms, room('fr2', 'first', ['f3'])]
    })
    const change = planChange(base, next)
    expect(change.floors.get('ground')).toBe(1)
    expect(change.floors.get('first')).toBe(2)
  })

  it('counts an opening on its wall\'s floor', () => {
    const next = edit(base, { openings: base.openings.map((o) => (o.id === 'fo' ? { ...o, offset: 2 } : o)) })
    expect([...planChange(base, next).floors]).toEqual([['first', 1]])
  })

  it('treats wall height changes as height-only', () => {
    const next = moveWall(moveWall(base, 'g1', { height: 3.2 }), 'g2', { height: 3.2 })
    const change = planChange(base, next)
    expect(change.heightOnly).toBe(true)
    expect(change.floors.get('ground')).toBe(2)
  })

  it('treats sill and head changes as height-only', () => {
    const next = edit(base, { openings: base.openings.map((o) => (o.id === 'go' ? { ...o, sill: 1.1, height: 1 } : o)) })
    expect(planChange(base, next).heightOnly).toBe(true)
  })

  it('is not height-only when anything else changed too', () => {
    const next = moveWall(moveWall(base, 'g1', { height: 3.2 }), 'g2', { end: [9, 0] })
    expect(planChange(base, next).heightOnly).toBe(false)
  })

  it('is not height-only when a wall was added', () => {
    const next = edit(base, { walls: [...base.walls, wall('g3', 'ground')] })
    expect(planChange(base, next).heightOnly).toBe(false)
  })
})

describe('matchViewWords', () => {
  it.each([
    ['make the living room taller, show me in 3D', '3d'],
    ['3d view please', '3d'],
    ['Show it in 3D.', '3d'],
    ['what does it look like in 3d?', '3d'],
    ['change the kitchen in plan view', '2d'],
    ['go back to the floor plan view', '2d'],
    ['show me the 2D', '2d'],
    ['in 2d please', '2d']
  ])('reads %j as %s', (text, view) => {
    expect(matchViewWords(text)).toBe(view)
  })

  it.each([
    'add a bathroom upstairs',
    'export it for a 3Dprint',
    'a 2D3D comparison',
    'compare the 2D and the 3D',
    'planview is not a phrase'
  ])('finds no view in %j', (text) => {
    expect(matchViewWords(text)).toBeNull()
  })
})

const at = (floor: string, mode: '2d' | '3d', p: FloorPlan = base): FollowView => ({ floor, mode, plan: p })

function run(state: FollowState, input: FollowInput, view: FollowView): ReturnType<typeof nextFollowState> {
  return nextFollowState(state, input, view)
}

function following(text = 'add a bathroom upstairs', view = at('ground', '2d')): FollowState {
  return run(IDLE, { type: 'message-sent', text }, view).state
}

describe('nextFollowState', () => {
  describe('the assistant points the preview', () => {
    it('shows the floor it edited', () => {
      const result = run(following(), { type: 'focus', floor: 'first' }, at('ground', '2d'))
      expect(result.move).toEqual({ floor: 'first' })
      expect(result.state.phase).toBe('directed')
    })

    it('shows a change in 3D', () => {
      expect(run(following(), { type: 'focus', floor: 'ground', view: '3d' }, at('ground', '2d')).move)
        .toEqual({ mode: '3d' })
    })

    it('shows a room\'s floor', () => {
      expect(run(following(), { type: 'focus', room: 'fr' }, at('ground', '2d')).move).toEqual({ floor: 'first' })
    })

    it('ignores an unknown floor and still applies the view', () => {
      expect(run(following(), { type: 'focus', floor: 'attic', view: '3d' }, at('ground', '2d')).move)
        .toEqual({ mode: '3d' })
    })

    it('gives no move when it asks for what is already shown', () => {
      expect(run(following(), { type: 'focus', floor: 'ground', view: '2d' }, at('ground', '2d')).move).toBeUndefined()
    })
  })

  describe('the plan\'s changes, when the assistant does not point', () => {
    it('goes to the floor of an edit on another floor', () => {
      const next = moveWall(base, 'f1', { end: [5, 0] })
      expect(run(following(), { type: 'plan-changed', prev: base, next }, at('ground', '2d', next)).move)
        .toEqual({ floor: 'first' })
    })

    it('goes to the floor with the most changes', () => {
      const next = moveWall(moveWall(moveWall(base, 'f1', { end: [5, 0] }), 'f2', { end: [6, 0] }), 'g1', { end: [6, 0] })
      expect(run(following(), { type: 'plan-changed', prev: base, next }, at('ground', '2d', next)).move)
        .toBeUndefined() // ground is among the changed floors, so it stays
      const firstOnly = moveWall(moveWall(base, 'f1', { end: [5, 0] }), 'f2', { end: [6, 0] })
      expect(run(following(), { type: 'plan-changed', prev: base, next: firstOnly }, at('ground', '2d', firstOnly)).move)
        .toEqual({ floor: 'first' })
    })

    it('stays on the floor already shown when it changed too', () => {
      const next = moveWall(moveWall(base, 'f1', { end: [5, 0] }), 'g1', { end: [5, 0] })
      expect(run(following(), { type: 'plan-changed', prev: base, next }, at('first', '2d', next)).move).toBeUndefined()
    })

    it('switches to 3D when only heights changed', () => {
      const next = moveWall(base, 'g1', { height: 3.4 })
      expect(run(following(), { type: 'plan-changed', prev: base, next }, at('ground', '2d', next)).move)
        .toEqual({ mode: '3d' })
    })

    it('keeps 3D when a wall moves', () => {
      const next = moveWall(base, 'g1', { end: [7, 0] })
      expect(run(following(), { type: 'plan-changed', prev: base, next }, at('ground', '3d', next)).move).toBeUndefined()
    })

    it('stops once the assistant has pointed', () => {
      const pointed = run(following(), { type: 'focus', floor: 'ground' }, at('first', '2d')).state
      const next = moveWall(base, 'f1', { end: [5, 0] })
      expect(run(pointed, { type: 'plan-changed', prev: base, next }, at('ground', '2d', next)).move).toBeUndefined()
    })

    it('goes to a floor the assistant just added', () => {
      const next: FloorPlan = {
        ...base,
        floors: [...(base.floors ?? []), { id: 'second', name: 'Second floor', level: 2 }],
        walls: [...base.walls, wall('s1', 'second')]
      }
      expect(run(following(), { type: 'plan-changed', prev: base, next }, at('ground', '2d', next)).move)
        .toEqual({ floor: 'second' })
    })
  })

  describe('the user\'s words', () => {
    it('switch to 3D as the message is sent', () => {
      const result = run(IDLE, { type: 'message-sent', text: 'make the living room taller, show me in 3D' }, at('ground', '2d'))
      expect(result.move).toEqual({ mode: '3d' })
      expect(result.state.viewLocked).toBe('3d')
    })

    it('are not overridden by the assistant, whose floor still applies', () => {
      const state = following('change the kitchen in plan view')
      expect(run(state, { type: 'focus', floor: 'first', view: '3d' }, at('ground', '2d')).move).toEqual({ floor: 'first' })
    })

    it('are not overridden by height-only changes', () => {
      const state = following('raise the walls in plan view')
      const next = moveWall(base, 'g1', { height: 3.4 })
      expect(run(state, { type: 'plan-changed', prev: base, next }, at('ground', '2d', next)).move).toBeUndefined()
    })

    it('leave the view to the assistant when none is named', () => {
      const result = run(IDLE, { type: 'message-sent', text: 'add a bathroom upstairs' }, at('ground', '2d'))
      expect(result.move).toBeUndefined()
      expect(result.state.viewLocked).toBeNull()
      expect(run(result.state, { type: 'focus', view: '3d' }, at('ground', '2d')).move).toEqual({ mode: '3d' })
    })
  })

  describe('the user\'s own choice', () => {
    const pick = (floor: string, mode: '2d' | '3d'): FollowInput => ({ type: 'user-picked', floor, mode })

    it('pauses following while the user looks elsewhere', () => {
      const paused = run(following(), pick('first', '2d'), at('ground', '2d')).state
      expect(paused.phase).toBe('paused')
      const next = moveWall(base, 'g1', { end: [5, 0] })
      expect(run(paused, { type: 'plan-changed', prev: base, next }, at('first', '2d', next)).move).toBeUndefined()
      expect(run(paused, { type: 'focus', floor: 'ground', view: '3d' }, at('first', '2d')).move).toBeUndefined()
    })

    it('follows again when the user goes back to where the assistant is', () => {
      const paused = run(following(), pick('first', '2d'), at('ground', '2d')).state
      const back = run(paused, pick('ground', '2d'), at('first', '2d')).state
      expect(back.phase).toBe('following')
      expect(back.away).toBeUndefined()
      const next = moveWall(base, 'f1', { end: [5, 0] })
      expect(run(back, { type: 'plan-changed', prev: base, next }, at('ground', '2d', next)).move).toEqual({ floor: 'first' })
    })

    it('keeps track of the assistant while paused, so going back means going where it is now', () => {
      const paused = run(following(), pick('ground', '3d'), at('ground', '2d')).state
      const next = moveWall(base, 'f1', { end: [5, 0] })
      const moved = run(paused, { type: 'plan-changed', prev: base, next }, at('ground', '3d', next)).state
      expect(moved.away?.at).toEqual({ floor: 'first', mode: '2d' })
      // The old spot is no longer where the assistant is.
      expect(run(moved, pick('ground', '2d'), at('ground', '3d', next)).state.phase).toBe('paused')
      expect(run(moved, pick('first', '2d'), at('ground', '3d', next)).state.phase).toBe('following')
    })

    it('goes back to where the assistant pointed, and stays directed', () => {
      const paused = run(following(), pick('ground', '3d'), at('ground', '2d')).state
      const pointed = run(paused, { type: 'focus', floor: 'first', view: '3d' }, at('ground', '3d')).state
      expect(pointed.away).toEqual({ at: { floor: 'first', mode: '3d' }, was: 'directed' })
      const back = run(pointed, pick('first', '3d'), at('ground', '3d')).state
      expect(back.phase).toBe('directed')
      const next = moveWall(base, 'g1', { end: [5, 0] })
      expect(run(back, { type: 'plan-changed', prev: base, next }, at('first', '3d', next)).move).toBeUndefined()
    })

    it('after the assistant pointed, plan changes no longer move where it is', () => {
      const directed = run(following(), { type: 'focus', floor: 'ground' }, at('ground', '2d')).state
      const paused = run(directed, pick('first', '2d'), at('ground', '2d')).state
      const next = moveWall(base, 'f1', { end: [5, 0] })
      expect(run(paused, { type: 'plan-changed', prev: base, next }, at('first', '2d', next)).state.away?.at)
        .toEqual({ floor: 'ground', mode: '2d' })
    })

    it('follows again with the next message', () => {
      const paused = run(following(), pick('first', '2d'), at('ground', '2d')).state
      const ended = run(paused, { type: 'run-ended' }, at('first', '2d')).state
      const next = run(ended, { type: 'message-sent', text: 'now the kitchen' }, at('first', '2d')).state
      expect(next.phase).toBe('following')
      expect(next.away).toBeUndefined()
    })

    it('does nothing outside a run', () => {
      expect(run(IDLE, pick('first', '2d'), at('ground', '2d')).state).toEqual(IDLE)
    })
  })

  describe('only live runs', () => {
    it('ignore the assistant and the plan while idle', () => {
      expect(run(IDLE, { type: 'focus', floor: 'first', view: '3d' }, at('ground', '2d')).move).toBeUndefined()
      const next = moveWall(base, 'f1', { end: [5, 0] })
      expect(run(IDLE, { type: 'plan-changed', prev: base, next }, at('ground', '2d', next)).move).toBeUndefined()
    })

    it('end with the run', () => {
      const ended = run(following('show me in 3d'), { type: 'run-ended' }, at('ground', '3d')).state
      expect(ended).toEqual(IDLE)
    })
  })
})

describe('noticeText', () => {
  it('leads with the assistant\'s note, with what is shown beneath', () => {
    expect(noticeText({ key: 'k', note: 'Look at the new bathroom', floorName: 'First floor', mode: '3d', modeChanged: true }))
      .toEqual({ primary: 'Look at the new bathroom', secondary: 'First floor · 3D' })
  })

  it('says what is shown without a note', () => {
    expect(noticeText({ key: 'k', floorName: 'First floor', mode: '3d', modeChanged: true }))
      .toEqual({ primary: 'Showing First floor in 3D' })
  })

  it('leaves the view out when only the floor changed', () => {
    expect(noticeText({ key: 'k', floorName: 'First floor', mode: '2d', modeChanged: false }))
      .toEqual({ primary: 'Showing First floor' })
  })
})
