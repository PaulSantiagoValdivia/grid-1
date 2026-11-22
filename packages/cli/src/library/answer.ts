/**
 * CNT-20 (C30): the library as `grid_measure what=library` gives it, and a library entry as the
 * box `what=fit` tries: an item's footprint with the clear floor it keeps in front, or a typical
 * room's size. Each figure says where it came from.
 */
import { itemKindDefinition, itemKindWord } from '@ongrid/floorplan/geometry'
import { libraryFootprint, libraryNames, type FoundItem, type FoundRoom, type Library } from '@ongrid/floorplan/library'
import { english, isSaid } from '@ongrid/floorplan/messages'
import { likelyId } from '@ongrid/floorplan/types/nearest'
import { quoted } from '../fs/projectFiles'
import { ToolRefusal } from '../mcp/toolkit'

export const LIBRARY_RULE =
  'The library is Grid\'s own sizes (each says "Grid\'s own size, not a code figure"), the office\'s files in the library folder beside the plan, and the entries the plan holds itself, looked for in that order from the plan\'s own: a size is the library\'s, not a rule. clearance is the clear floor kept in front of an item, as wide as it is.'

const n2 = (value: number): string => value.toFixed(2)

function fromText(found: FoundItem | FoundRoom): string {
  if (found.from === 'office') return `from ${found.file}`
  if (found.from === 'plan') return "the plan's own"
  return "Grid's own size, not a code figure"
}

function itemLine(name: string, found: FoundItem): string {
  const { entry } = found
  const clear = entry.clearance === undefined || entry.clearance === 0 ? '' : `, ${n2(entry.clearance)} m clear in front`
  const source = found.from === 'grid' ? '' : `; ${entry.source ?? 'no source stated'}`
  return `${quoted(name)}: ${itemKindWord(entry.kind)}${entry.label === undefined ? '' : ` "${entry.label}"`}, ${n2(entry.size[0])} × ${n2(entry.size[1])} m, ${n2(entry.height)} m high${clear} (${fromText(found)}${source})`
}

function roomLine(name: string, found: FoundRoom): string {
  const { room } = found
  const parts = room.items.map((part) => part.library)
  return `${quoted(name)}: typical room${room.label === undefined ? '' : ` "${room.label}"`}${room.use === undefined ? '' : ` (${room.use})`}, ${n2(room.size[0])} × ${n2(room.size[1])} m, with ${parts.join(', ')} (${fromText(found)})`
}

const itemData = (name: string, found: FoundItem): Record<string, unknown> => ({
  name,
  kind: found.entry.kind,
  group: itemKindDefinition(found.entry.kind)?.group ?? null,
  label: found.entry.label ?? null,
  size: found.entry.size,
  height: found.entry.height,
  clearance: found.entry.clearance ?? null,
  from: found.from,
  file: found.file,
  source: found.entry.source ?? null,
})

const roomData = (name: string, found: FoundRoom): Record<string, unknown> => ({
  name,
  label: found.room.label ?? null,
  use: found.room.use ?? null,
  size: found.room.size,
  items: found.room.items.map((part) => ({ library: part.library, at: part.at, turn: part.turn ?? 0 })),
  from: found.from,
  file: found.file,
})

/** What an agent is told of a kind (the registry's words), in English. */
function aboutText(kind: string): string | null {
  const about = itemKindDefinition(kind)?.about
  if (about === undefined) return null
  return typeof about === 'string' ? about : isSaid(about) ? english(about) : null
}

/** The library listed, or one entry with what its kind is. Refused for a name no library holds. */
export function libraryAnswer(library: Library, problems: readonly string[], name: string | undefined): { lines: string[]; data: Record<string, unknown> } {
  const said = problems.map((problem) => `Left out of the library: ${problem}.`)
  if (name !== undefined) {
    const item = library.items.get(name)
    const room = library.rooms.get(name)
    if (item === undefined && room === undefined) throw refusal(library, name)
    if (item !== undefined) {
      const about = aboutText(item.entry.kind)
      return { lines: [...said, itemLine(name, item), ...(about === null ? [] : [about])], data: { items: [itemData(name, item)], rooms: [], problems } }
    }
    return { lines: [...said, roomLine(name, room!)], data: { items: [], rooms: [roomData(name, room!)], problems } }
  }
  const items = [...library.items.entries()]
  const rooms = [...library.rooms.entries()]
  return {
    lines: [...said, `Items (${items.length}):`, ...items.map(([n, found]) => `- ${itemLine(n, found)}`), `Typical rooms (${rooms.length}):`, ...rooms.map(([n, found]) => `- ${roomLine(n, found)}`)],
    data: { items: items.map(([n, found]) => itemData(n, found)), rooms: rooms.map(([n, found]) => roomData(n, found)), problems },
  }
}

function refusal(library: Library, name: string): ToolRefusal {
  const meant = likelyId(name, libraryNames(library))
  return new ToolRefusal(`No library holds ${quoted(name)}.${meant === null ? '' : ` Did you mean ${quoted(meant)}?`} what=library lists what it holds.`)
}

/** A library entry as the box what=fit tries, and the sentence that says what it is. */
export function libraryBox(library: Library, name: string): { readonly name: string; readonly width: number; readonly depth: number; readonly said: string } {
  const box = libraryFootprint(library, name)
  if (box === null) throw refusal(library, name)
  const item = library.items.get(name)
  const said =
    box.what === 'item' && item !== undefined
      ? `${quoted(name)} is ${n2(item.entry.size[0])} × ${n2(item.entry.size[1])} m${item.entry.clearance ? ` with ${n2(item.entry.clearance)} m clear in front` : ''} (${fromText(item)}), so the box tried is ${n2(box.width)} × ${n2(box.depth)} m.`
      : `${quoted(name)} is a typical room of ${n2(box.width)} × ${n2(box.depth)} m (${fromText(library.rooms.get(name)!)}).`
  return { name, width: box.width, depth: box.depth, said }
}
