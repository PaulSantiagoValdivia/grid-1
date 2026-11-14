import type { FloorPlan } from '@ongrid/core/types/floorplan'
import { floorOf, planFloors } from '@ongrid/core/geometry'

/**
 * The preview follows the assistant's work.
 *
 * Who decides, highest first:
 *   1. the user's own floor or view pick: following pauses until they go back to
 *      where the assistant is working, or send their next message;
 *   2. the user's words ("3D", "plan view"): the view is locked for the run;
 *   3. the assistant's show_in_preview call: floor and view, and the fallback stops;
 *   4. the plan's changes: the floor with the most changes, and 2D → 3D only when
 *      every change is a height.
 *
 * Pure: the host holds the state and applies the moves.
 */

export type PreviewView = '2d' | '3d'

/** A floor and view the preview can show. */
export interface FollowSpot {
  floor: string
  mode: PreviewView
}

export interface FollowState {
  /** idle: no live run. following: the fallback is on. directed: the assistant pointed. */
  phase: 'idle' | 'following' | 'directed' | 'paused'
  /** The view the user's words asked for in this run, if any. */
  viewLocked: PreviewView | null
  /**
   * While paused: where the preview would be had the user not looked away, kept up
   * to date as the assistant works, and the phase to go back to there.
   */
  away?: { at: FollowSpot; was: 'following' | 'directed' }
}

export const IDLE: FollowState = { phase: 'idle', viewLocked: null }

export type FollowInput =
  | { type: 'message-sent'; text: string }
  /** The floor and view the user picked. */
  | { type: 'user-picked'; floor: string; mode: PreviewView }
  | { type: 'run-ended' }
  | { type: 'focus'; floor?: string; view?: PreviewView; room?: string }
  | { type: 'plan-changed'; prev: FloorPlan; next: FloorPlan }

/** What the preview shows right now; `plan` is the current one. */
export interface FollowView {
  floor: string
  mode: PreviewView
  plan: FloorPlan
}

/** Only what changes: a move to what's already shown is no move. */
export interface FollowMove {
  floor?: string
  mode?: PreviewView
}

export interface PlanChange {
  /** Changed walls, rooms and openings per floor id. */
  floors: Map<string, number>
  /** Every change is a wall height or an opening's sill/height, invisible in 2D. */
  heightOnly: boolean
}

// ── The plan's changes ─────────────────────────────────────────────────────

function changedFields(a: object, b: object): string[] {
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  return [...keys].filter((key) => JSON.stringify(left[key]) !== JSON.stringify(right[key]))
}

export function planChange(prev: FloorPlan, next: FloorPlan): PlanChange {
  const floors = new Map<string, number>()
  let changes = 0
  let heightChanges = 0
  const count = (floor: string): void => {
    floors.set(floor, (floors.get(floor) ?? 0) + 1)
  }

  const wallFloor = (plan: FloorPlan): Map<string, string> =>
    new Map(plan.walls.map((wall) => [wall.id, floorOf(wall)]))
  const prevWallFloor = wallFloor(prev)
  const nextWallFloor = wallFloor(next)

  function diff<T extends { id: string }>(
    before: readonly T[],
    after: readonly T[],
    floorIn: (entity: T, side: 'prev' | 'next') => string,
    heightFields: readonly string[]
  ): void {
    const old = new Map(before.map((entity) => [entity.id, entity]))
    const now = new Map(after.map((entity) => [entity.id, entity]))
    for (const id of new Set([...old.keys(), ...now.keys()])) {
      const a = old.get(id)
      const b = now.get(id)
      if (a && b) {
        const fields = changedFields(a, b)
        if (fields.length === 0) continue
        changes++
        if (fields.every((field) => heightFields.includes(field))) heightChanges++
        const from = floorIn(a, 'prev')
        const to = floorIn(b, 'next')
        count(to)
        if (from !== to) count(from)
      } else {
        changes++
        count(a ? floorIn(a, 'prev') : floorIn(b as T, 'next'))
      }
    }
  }

  diff(prev.walls, next.walls, (wall) => floorOf(wall), ['height'])
  diff(prev.rooms, next.rooms, (room) => floorOf(room), [])
  // An opening belongs to its wall's floor (C5).
  diff(
    prev.openings,
    next.openings,
    (opening, side) =>
      (side === 'prev' ? prevWallFloor : nextWallFloor).get(opening.wall)
      ?? prevWallFloor.get(opening.wall)
      ?? nextWallFloor.get(opening.wall)
      ?? floorOf({}),
    ['sill', 'height']
  )

  return { floors, heightOnly: changes > 0 && heightChanges === changes }
}

// ── The user's words ───────────────────────────────────────────────────────

const WORDS_3D = /\b3d\b/i
const WORDS_2D = [/\b2d\b/i, /\b(plan|floor plan) view\b/i]

/** The view a message names, or null when it names none or both (design D6). */
export function matchViewWords(text: string): PreviewView | null {
  const wants3d = WORDS_3D.test(text)
  const wants2d = WORDS_2D.some((words) => words.test(text))
  if (wants3d === wants2d) return null
  return wants3d ? '3d' : '2d'
}

// ── The decision ───────────────────────────────────────────────────────────

function moveTo(view: FollowView, floor: string | undefined, mode: PreviewView | undefined): FollowMove | undefined {
  const move: FollowMove = {}
  if (floor !== undefined && floor !== view.floor) move.floor = floor
  if (mode !== undefined && mode !== view.mode) move.mode = mode
  return move.floor === undefined && move.mode === undefined ? undefined : move
}

const inRun = (state: FollowState): boolean => state.phase === 'following' || state.phase === 'directed'

/** Where the assistant's request would take a preview showing `view`. */
function focusMove(state: FollowState, input: Extract<FollowInput, { type: 'focus' }>, view: FollowView): FollowMove | undefined {
  const floors = new Set(planFloors(view.plan).map((floor) => floor.id))
  const room = input.room === undefined ? undefined : view.plan.rooms.find((r) => r.id === input.room)
  // A floor the plan doesn't have is ignored; the rest of the request still applies.
  const floor = input.floor !== undefined && floors.has(input.floor)
    ? input.floor
    : room && floors.has(floorOf(room)) ? floorOf(room) : undefined
  const mode = state.viewLocked === null ? input.view : undefined
  return moveTo(view, floor, mode)
}

/** Where the plan's changes would take a preview showing `view`. */
function changeMove(state: FollowState, input: Extract<FollowInput, { type: 'plan-changed' }>, view: FollowView): FollowMove | undefined {
  const change = planChange(input.prev, input.next)
  const floors = planFloors(input.next).map((floor) => floor.id)
  const changed = floors.filter((id) => (change.floors.get(id) ?? 0) > 0)
  if (changed.length === 0) return undefined
  // Stay when the floor shown changed too; otherwise the busiest floor, lowest first on a tie.
  const floor = changed.includes(view.floor)
    ? undefined
    : changed.reduce((best, id) => ((change.floors.get(id) ?? 0) > (change.floors.get(best) ?? 0) ? id : best))
  const mode = state.viewLocked === null && view.mode === '2d' && change.heightOnly ? '3d' : undefined
  return moveTo(view, floor, mode)
}

/** While paused, the assistant's work moves where the preview would be, not the preview. */
function moveAway(state: FollowState, move: FollowMove | undefined, was: 'following' | 'directed'): FollowState {
  const away = state.away as NonNullable<FollowState['away']>
  return { ...state, away: { at: { floor: move?.floor ?? away.at.floor, mode: move?.mode ?? away.at.mode }, was } }
}

export function nextFollowState(
  state: FollowState,
  input: FollowInput,
  view: FollowView
): { state: FollowState; move?: FollowMove } {
  switch (input.type) {
    case 'message-sent': {
      const words = matchViewWords(input.text)
      return { state: { phase: 'following', viewLocked: words }, move: moveTo(view, undefined, words ?? undefined) }
    }

    case 'user-picked': {
      if (inRun(state)) {
        const was = state.phase as 'following' | 'directed'
        return { state: { ...state, phase: 'paused', away: { at: { floor: view.floor, mode: view.mode }, was } } }
      }
      // Back where the assistant is working: following picks up again, the way
      // scrolling back to the end of streaming code starts it scrolling again.
      if (state.phase === 'paused' && state.away?.at.floor === input.floor && state.away.at.mode === input.mode) {
        return { state: { phase: state.away.was, viewLocked: state.viewLocked } }
      }
      return { state }
    }

    case 'run-ended':
      return { state: IDLE }

    case 'focus': {
      if (state.phase === 'paused' && state.away) {
        return { state: moveAway(state, focusMove(state, input, { ...view, ...state.away.at }), 'directed') }
      }
      if (!inRun(state)) return { state }
      return { state: { ...state, phase: 'directed' }, move: focusMove(state, input, view) }
    }

    case 'plan-changed': {
      if (state.phase === 'paused' && state.away?.was === 'following') {
        const at: FollowView = { ...state.away.at, plan: input.next }
        return { state: moveAway(state, changeMove(state, input, at), 'following') }
      }
      if (state.phase !== 'following') return { state }
      return { state, move: changeMove(state, input, view) }
    }
  }
}

// ── Talking to the chat ────────────────────────────────────────────────────

/** What the host is told about the run it is following. */
export type PanelFollowInput =
  | { type: 'message-sent'; text: string }
  | { type: 'focus'; floor?: string; view?: PreviewView; room?: string; note?: string }
  | { type: 'run-ended' }

/** A move following made, for the quiet line in the chat (design D8). */
export interface PreviewNotice {
  key: string
  /** The assistant's own words, when it pointed with a note. */
  note?: string
  floorName: string
  mode: PreviewView
  modeChanged: boolean
}

/** The line's copy: the assistant's note leads; without one, plain "Showing …". */
export function noticeText(notice: PreviewNotice): { primary: string; secondary?: string } {
  const view = notice.mode.toUpperCase()
  if (notice.note) return { primary: notice.note, secondary: `${notice.floorName} · ${view}` }
  return { primary: notice.modeChanged ? `Showing ${notice.floorName} in ${view}` : `Showing ${notice.floorName}` }
}
