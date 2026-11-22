/**
 * `grid describe`'s lines on north and facing (CNT-3) for a person, in the person's language
 * (MSG-11): the same lines `facingDescription` (`quantities/facing.ts`) gives, said by key. The
 * geometry is `planFacing` in the core; this only words it. The agent's lines are
 * `facingDescription`'s, a format of codes that stays as it is.
 */
import { bearingOf, COMPASS_POINTS, compassPoint, planFacing, type CompassPoint, type FloorPlan, type PlanFacing } from '@ongrid/floorplan/geometry'
import { say, type MessageKey, type Values } from '@ongrid/floorplan/messages'
import type { Words } from './card'

const deg = (value: number): number => Math.round(value * 10) / 10 + 0

function wayOf(facing: PlanFacing, direction: { x: number; y: number }): CompassPoint {
  return compassPoint(bearingOf(direction, facing.orientation, facing.northUsed)!)
}

/** The person's lines on north, the ways the rooms face and the front; empty for a plan that states none of them. */
export function personFacing(plan: FloorPlan, w: Words): string[] {
  if (plan.north === undefined && plan.front === undefined && plan.yAxis !== 'down') return []
  const t = (key: MessageKey, values?: Values): string => say(w.language, key, values, w.options)
  const way = (point: CompassPoint): string => t(`describe.way.${point}`)
  const facing = planFacing(plan)
  const name = new Map(plan.rooms.map((r) => [r.id, r.name]))
  const byWay = new Map<CompassPoint, string[]>()
  for (const r of facing.rooms) for (const wall of r.walls) byWay.set(wall.faces, [...(byWay.get(wall.faces) ?? []), r.room])
  const ways = COMPASS_POINTS.filter((point) => byWay.has(point))
  const lines: string[] = []
  if (facing.northStated) {
    const turn = facing.orientation.north!
    const left = turn <= 180 ? turn : 360 - turn
    const north = turn === 0 ? t('describe.north.up') : t(turn <= 180 ? 'describe.north.ccw' : 'describe.north.cw', { deg: deg(left) })
    const side = (x: number, y: number): string => way(wayOf(facing, { x, y }))
    const sides = t('describe.sides', { top: side(0, 1), right: side(1, 0), foot: side(0, -1), left: side(-1, 0) })
    lines.push(t('describe.north.stated', { north, sides }))
  } else lines.push(t('describe.north.none'))
  if (facing.orientation.yAxis === 'down') lines.push(t('describe.north.down'))
  if (ways.length > 0) {
    const each = ways.map((point) => t('describe.facing.way', { way: way(point), rooms: byWay.get(point)!.map((id) => name.get(id) ?? id).join(t('join.comma')) }))
    lines.push(t('describe.facing', { ways: each.join(t('join.semicolon')) }))
  }
  const front = facing.front
  if (front !== null) lines.push('missing' in front ? t('describe.front.none') : t('describe.front', { way: way(front.faces) }))
  return lines
}
