/**
 * A room renamed, or given another use (WRT-3, lab AB-8): "the front room is a let now", "the
 * rooms in Spanish for the guests". The answer says which of Grid's checks now look at the room
 * that did not before, and which no longer do, because the checks go by a room's stated use and
 * never by its name.
 *
 * Pure: a survey in, a patch out.
 */
import { buildingKind } from '@ongrid/floorplan/geometry'
import type { RoomUse } from '@ongrid/floorplan/types/floorplan'
import { rulesForUse } from '@ongrid/rules'
import { quoted } from '../fs/projectFiles'
import type { Survey } from '../quantities/survey'
import { emptyPatch, type Patch, type RoomChange } from './edits'
import { EditRefused } from './refused'

/** A use, or `none` to leave the room's use unstated. */
export type UseOrNone = RoomUse | 'none'

export function renameRoom(survey: Survey, roomId: string, request: { readonly name?: string; readonly use?: UseOrNone }): Patch {
  const room = survey.plan.rooms.find((r) => r.id === roomId)!
  const name = quoted(room.name)
  if (request.name === undefined && request.use === undefined) throw new EditRefused('Pass name, use or both.')
  const change: RoomChange = {}
  const said: string[] = []
  if (request.name !== undefined && request.name !== room.name) {
    change.name = request.name
    said.push(`Renamed ${name} to ${quoted(request.name)}.`)
  }
  const was = room.use
  const is = request.use === undefined ? was : request.use === 'none' ? undefined : request.use
  if (is !== was) {
    change.use = is ?? null
    said.push(`${quoted(request.name ?? room.name)} is ${is === undefined ? 'of no stated use' : `used as ${is}`} now, not ${was === undefined ? 'of no stated use' : was}.`)
  }
  if (said.length === 0) throw new EditRefused(`That is how ${name} is already: nothing to change.`)

  // Which checks look at the room before and after: they go by its use, never its name.
  const before = rulesForUse(was)
  const after = rulesForUse(is)
  const now = after.filter((rule) => !before.some((r) => r.id === rule.id))
  const noLonger = before.filter((rule) => !after.some((r) => r.id === rule.id))
  const lines: string[] = []
  if (now.length > 0) lines.push(`Checks that now look at it: ${now.map((r) => r.title).join('; ')}.`)
  if (noLonger.length > 0) lines.push(`Checks that no longer do: ${noLonger.map((r) => r.title).join('; ')}.`)
  if (is === undefined && was !== undefined) lines.push('With no use stated, grid check names it as not checked.')
  if (is !== was && lines.length === 0) lines.push('The same checks look at it as before.')
  const plan = survey.plan
  const kindBefore = buildingKind(plan)
  const kindAfter = buildingKind({ ...plan, rooms: plan.rooms.map((r) => (r.id === roomId ? { ...r, use: is } : r)) })
  if (kindBefore !== kindAfter) lines.push(kindAfter === 'home' ? 'Grid now reads the plan as a home, and asks about sizes far from a home\'s.' : 'Grid no longer reads the plan as a home: it asks about sizes far from any building\'s.')
  const patch = emptyPatch([...said, ...lines])
  ;(patch.rooms as Map<string, RoomChange>).set(roomId, change)
  return { ...patch, extra: { checks: { now: now.map((r) => r.id), noLonger: noLonger.map((r) => r.id) } } }
}
