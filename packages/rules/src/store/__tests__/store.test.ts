import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { RulesStore } from '../store'
import type { RulesSheet } from '../../sheet/rulesSheet'

let home: string
let root: string
const ID = '3f2c1a9e-0b7d-4c55-9a51-1d2e3f4a5b6c'
const OTHER = '9a8b7c6d-0000-4000-8000-000000000001'

const sheet = (municipality = 'Valencia'): RulesSheet => ({
  schemaVersion: 1,
  location: { municipality, country: 'Spain' },
  lookedUpAt: '2026-11-14T10:00:00.000Z',
  figures: {
    routeMinWidth: {
      value: 1.2,
      unit: 'm',
      sourceUrl: 'https://www.boe.es/x',
      quote: 'at least 1.20 m',
      retrievedAt: '2026-11-14T10:00:00.000Z'
    }
  },
  dropped: [],
  notFound: ['exitDoorClearWidth']
})

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'grid-rules-store-'))
  root = join(home, 'rules')
})
afterEach(() => rmSync(home, { recursive: true, force: true }))

describe('the location', () => {
  it('is set, read back and cleared', () => {
    const store = new RulesStore(root)
    expect(store.getLocation(ID)).toBeNull()
    store.setLocation(ID, { municipality: 'Valencia', country: 'Spain' })
    expect(store.getLocation(ID)).toEqual({ municipality: 'Valencia', country: 'Spain' })
    expect(new RulesStore(root).getLocation(ID)).toEqual({ municipality: 'Valencia', country: 'Spain' })
    expect(store.getLocation(OTHER)).toBeNull()
    store.clearLocation(ID)
    expect(store.getLocation(ID)).toBeNull()
  })

  it('is written to one file in the rules folder, readable by this user only', () => {
    const store = new RulesStore(root)
    store.setLocation(ID, { municipality: 'Valencia', country: 'Spain' })
    const file = join(root, 'locations.json')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ [ID]: { municipality: 'Valencia', country: 'Spain' } })
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600)
  })

  it('reads a corrupt file as none, and keeps it aside', () => {
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'locations.json'), '{ not json')
    const store = new RulesStore(root)
    expect(store.getLocation(ID)).toBeNull()
    expect(readdirSync(root).some((f) => /^locations\.json\.bak-\d+$/.test(f))).toBe(true)
    store.setLocation(ID, { municipality: 'Valencia', country: 'Spain' })
    expect(store.getLocation(ID)).toEqual({ municipality: 'Valencia', country: 'Spain' })
  })

  it('reads a file of the wrong shape as none', () => {
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'locations.json'), JSON.stringify({ [ID]: { municipality: '', country: 3 } }))
    expect(new RulesStore(root).getLocation(ID)).toBeNull()
  })
})

describe('the sheet', () => {
  it('is stored, read back and deleted', () => {
    const store = new RulesStore(root)
    expect(store.getSheet(ID)).toBeNull()
    store.setSheet(ID, sheet())
    expect(new RulesStore(root).getSheet(ID)).toEqual(sheet())
    const file = join(root, 'sheets', `${ID}.json`)
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600)
    store.deleteSheet(ID)
    expect(store.getSheet(ID)).toBeNull()
    expect(existsSync(file)).toBe(false)
  })

  it('goes with the location when it is cleared', () => {
    const store = new RulesStore(root)
    store.setLocation(ID, { municipality: 'Valencia', country: 'Spain' })
    store.setSheet(ID, sheet())
    store.clearLocation(ID)
    expect(store.getSheet(ID)).toBeNull()
  })

  it('reads as none when it no longer parses, and is kept aside', () => {
    const store = new RulesStore(root)
    store.setSheet(ID, sheet())
    writeFileSync(join(root, 'sheets', `${ID}.json`), JSON.stringify({ ...sheet(), schemaVersion: 2 }))
    expect(store.getSheet(ID)).toBeNull()
    expect(readdirSync(join(root, 'sheets')).some((f) => f.startsWith(`${ID}.json.bak-`))).toBe(true)
  })

  it('leaves nothing behind, set aside copies included, when deleted', () => {
    const store = new RulesStore(root)
    store.setSheet(ID, sheet())
    writeFileSync(join(root, 'sheets', `${ID}.json`), 'nope')
    store.getSheet(ID)
    store.deleteSheet(ID)
    expect(readdirSync(join(root, 'sheets'))).toEqual([])
  })
})

describe('project ids', () => {
  it.each([['../escape'], ['a/b'], [''], ['x'.repeat(65)], ['C:\\x'], ['.'], ['..'], [42]])(
    'refuses %s before any path is built',
    (id) => {
      const store = new RulesStore(root)
      expect(() => store.getLocation(id as string)).toThrow('Invalid project id')
      expect(() => store.setLocation(id as string, { municipality: 'A', country: 'B' })).toThrow('Invalid project id')
      expect(() => store.getSheet(id as string)).toThrow('Invalid project id')
      expect(() => store.setSheet(id as string, sheet())).toThrow('Invalid project id')
      expect(() => store.deleteSheet(id as string)).toThrow('Invalid project id')
      expect(existsSync(root)).toBe(false)
    }
  )
})

describe('the run folder', () => {
  it('is inside the rules folder', () => {
    expect(new RulesStore(root).runsDir()).toBe(join(root, 'runs'))
  })
})
