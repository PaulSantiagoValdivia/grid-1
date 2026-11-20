import { describe, expect, it } from 'vitest'
import { scanFolders, scanText as scan } from '../check-data.mjs'

describe('the data scan', () => {
  it.each([
    ['a macOS home folder', '{"name":"/Users/someone/Documents/plan.json"}'],
    ['a Linux home folder', 'read from /home/someone/lab'],
    ['a Windows drive path', '{"path":"C:\\\\Users\\\\someone\\\\plan.json"}'],
    ['a path from the home folder', 'saved in ~/Documents/x'],
    ['a temporary folder', 'at /private/tmp/x/plan.json'],
    ['a file address', 'file:///etc/hosts'],
    ['a path into the lab', 'grid-test/lab'],
    ['an e-mail address', 'written by someone@example.com'],
    ['a field that holds a person', '{"author":"x"}'],
    ['a title and a name', 'for Mrs Smith'],
    ["a person's room", "Anna's bedroom"],
  ])('finds %s', (_what, text) => {
    expect(scan(text)).not.toEqual([])
  })

  it.each([["Men's changing"], ["Women's showers"], ['Bedroom 2'], ['a 1.20 m wide hall'], ["Grid's own check"], ['walls.3.thickness']])(
    'lets %j pass',
    (text) => {
      expect(scan(text)).toEqual([])
    },
  )

  it('finds no machine path and no personal data in the scoreboard data', () => {
    expect(scanFolders(['scoreboard'])).toEqual([])
  })
})
