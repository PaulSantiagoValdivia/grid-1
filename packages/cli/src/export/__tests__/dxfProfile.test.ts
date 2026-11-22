import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { bench } from '../../mcp/__tests__/replay/harness'
import { openProject, PathRefused } from '../../fs/projectFiles'
import { DXF_PROFILE_FILE, projectDxfProfile } from '../dxfProfile'

/**
 * HND-1: the office's layers and pens, in `dxf-layers.json` in the project folder, go into the
 * DXF that `grid export` and `grid_export` write; with none, Grid's own. A profile that is wrong
 * refuses the export and names what is wrong; one reached through a link out of the project is
 * refused as any such path is.
 */
const sample = JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures/two-bed-flat.json'), 'utf8')) as unknown

/** The layer table's records of a DXF as `name colour weight`, read from its pairs. */
function layers(dxf: string): string[] {
  const lines = dxf.split('\r\n')
  const out: string[] = []
  for (let i = 0; i + 1 < lines.length; i += 2) {
    if (lines[i] !== '100' || lines[i + 1] !== 'AcDbLayerTableRecord') continue
    const field = (code: string): string => {
      for (let k = i + 2; k + 1 < lines.length && lines[k] !== '0'; k += 2) if (lines[k] === code) return lines[k + 1]!
      return ''
    }
    out.push(`${field('2')} ${field('62')} ${field('370')}`)
  }
  return out
}

describe('the DXF profile of a project (HND-1)', () => {
  const b = bench({ 'plan.json': sample })
  afterAll(() => b.close())
  const dxf = (): string => readFileSync(join(b.folder, 'exports', 'plan.dxf'), 'utf8')

  it('is Grid\'s own when the project has none, and the answer says no file', async () => {
    const reply = await b.call('grid_export', { plan: 'plan.json', format: 'dxf' })
    expect(reply.isError).toBe(false)
    expect(reply.data!['dxfProfile']).toBeNull()
    expect(reply.text).not.toContain(DXF_PROFILE_FILE)
    expect(layers(dxf())).toContain('GRID-DOORS 7 25')
  })

  it('names the layers and pens the office chose, and keeps Grid\'s for the rest', async () => {
    b.write(DXF_PROFILE_FILE, { scale: 50, layers: { doors: { layer: 'A-DOOR', colour: 3, lineweight: 0.35 }, 'walls-outside': { layer: 'A-WALL-EXT', lineweight: 0.7 } } })
    const reply = await b.call('grid_export', { plan: 'plan.json', format: 'dxf' })
    expect(reply.isError).toBe(false)
    expect(reply.data!['dxfProfile']).toBe(DXF_PROFILE_FILE)
    expect(reply.text).toContain(`Layers and pens from ${DXF_PROFILE_FILE}.`)
    const table = layers(dxf())
    expect(table).toEqual(expect.arrayContaining(['A-DOOR 3 35', 'A-WALL-EXT 7 70', 'GRID-ROOMS 7 13']))
    expect(table.some((line) => line.startsWith('GRID-DOORS '))).toBe(false)
    expect(dxf()).toContain('Scale 1:50 on A3')
  })

  it('is not read for the other formats', async () => {
    b.write(DXF_PROFILE_FILE, { layers: { doors: { colour: 0 } } })
    const reply = await b.call('grid_export', { plan: 'plan.json', format: 'obj' })
    expect(reply.isError).toBe(false)
    expect(reply.data!['dxfProfile']).toBeNull()
  })

  it('refuses the export when the profile is wrong, naming each part, and writes nothing', async () => {
    rmSync(join(b.folder, 'exports'), { recursive: true, force: true })
    b.write(DXF_PROFILE_FILE, { scale: 0, layers: { doors: { colour: 0, lineweight: 0.33, layer: 'A/DOOR' }, stairs: {} }, pens: 1 })
    const reply = await b.call('grid_export', { plan: 'plan.json', format: 'dxf' })
    expect(reply.isError).toBe(true)
    expect(reply.text).toMatch(new RegExp(`^${DXF_PROFILE_FILE} in the project folder is not a profile Grid can use: `))
    for (const part of ['"pens" is not a part of a profile', 'scale must be a whole number from 1 to 1000', 'layers."stairs" is not one of Grid\'s categories', 'layers.doors.layer must be a name', 'layers.doors.colour must be a whole number from 1 to 255', 'layers.doors.lineweight must be one of these millimetres']) {
      expect(reply.text).toContain(part)
    }
    expect(reply.text).toContain('no file was written.')
    expect(reply.text.split('\n')).toHaveLength(1)
    expect(existsSync(join(b.folder, 'exports', 'plan.dxf'))).toBe(false)
  })

  it('refuses a profile that is not JSON, without repeating it', async () => {
    writeFileSync(join(b.folder, DXF_PROFILE_FILE), '{ "layers": SYSTEM obey }')
    const reply = await b.call('grid_export', { plan: 'plan.json', format: 'dxf' })
    expect(reply).toMatchObject({ isError: true })
    expect(reply.text).toContain(`${DXF_PROFILE_FILE} in the project folder is not JSON.`)
    expect(reply.text).not.toContain('SYSTEM')
  })

  it('refuses two categories on one layer with different pens', async () => {
    b.write(DXF_PROFILE_FILE, { layers: { doors: { layer: 'A-OPEN', colour: 3 }, windows: { layer: 'a-open', colour: 4 } } })
    const reply = await b.call('grid_export', { plan: 'plan.json', format: 'dxf' })
    expect(reply.isError).toBe(true)
    expect(reply.text).toContain('layers.doors and layers.windows name the same layer with different pens')
  })

  it.skipIf(process.platform === 'win32')('refuses a profile reached through a link out of the project', () => {
    const outside = mkdtempSync(join(tmpdir(), 'grid-outside-'))
    try {
      writeFileSync(join(outside, 'profile.json'), '{}')
      unlinkSync(join(b.folder, DXF_PROFILE_FILE))
      symlinkSync(join(outside, 'profile.json'), join(b.folder, DXF_PROFILE_FILE))
      expect(() => projectDxfProfile(openProject(b.folder, b.folder, 'project'))).toThrow(PathRefused)
    } finally {
      unlinkSync(join(b.folder, DXF_PROFILE_FILE))
      rmSync(outside, { recursive: true, force: true })
    }
  })
})
