import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { pluginFiles } from '../../distribution/listing'
import { INSTRUCTIONS, ROOM_NAMES_TRAVEL } from '../protocol'
import { GRID_TOOLS } from '../serveTools'

/**
 * HND-9: the guide and the tool server both say that room names and ids go into every export,
 * so an agent never puts a person's name in one, and where who sits where is kept instead.
 */

const docs = (page: string): string => readFileSync(resolve(__dirname, '../../../../../docs', page), 'utf8')

describe('room names and ids travel into every export', () => {
  it('says so in one sentence, with where people go instead', () => {
    expect(ROOM_NAMES_TRAVEL).toContain('Room names and ids go into every export')
    expect(ROOM_NAMES_TRAVEL).toContain("never put a person's name in a room's name or id")
    expect(ROOM_NAMES_TRAVEL).toContain('plan.occupancy.json')
  })

  it('is in the server instructions, and in every tool that names rooms, exports or makes a sheet', () => {
    expect(INSTRUCTIONS).toContain(ROOM_NAMES_TRAVEL)
    for (const name of ['grid_write_rooms', 'grid_export', 'grid_sheet']) {
      const tool = GRID_TOOLS.find((t) => t.name === name)
      expect(tool?.description, name).toContain(ROOM_NAMES_TRAVEL)
    }
  })

  it('is in the skill the plugin carries', () => {
    const skill = Object.entries(pluginFiles('0.0.0')).find(([file]) => file.endsWith('SKILL.md'))?.[1]
    expect(skill).toContain(ROOM_NAMES_TRAVEL)
  })

  it('is in the guide: the plan file page, the rooms-first page and the tool server page', () => {
    expect(docs('plan-file.md')).toContain('## People are kept out of the plan')
    expect(docs('plan-file.md')).toContain("Room names and ids go into every export and sheet")
    expect(docs('rooms-first.md')).toContain("A room's name and its id go into every export and sheet")
    expect(docs('tool-server.md')).toContain("Room names and ids go into every export and sheet")
  })
})
