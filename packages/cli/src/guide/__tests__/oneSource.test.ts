/**
 * CMD-7: the README, the guide for agents, the plugin's skill and the tool server's instructions
 * say what they share in the same words, written once in `paragraphs.ts`. A paragraph changed in
 * one of them and not in the others fails here. Line breaks and runs of spaces do not count.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pluginFiles } from '../../distribution/listing'
import { INSTRUCTIONS } from '../../mcp/protocol'
import { agentGuide } from '../guide'
import { SHARED, type GuidePlace } from '../paragraphs'

const repo = resolve(__dirname, '../../../../..')
const plain = (text: string): string => text.replace(/\s+/g, ' ')

const places: Readonly<Record<GuidePlace, string>> = {
  instructions: INSTRUCTIONS,
  skill: pluginFiles('0.0.0')['skills/grid/SKILL.md'] as string,
  guide: readFileSync(join(repo, 'docs', 'agent-guide.md'), 'utf8'),
  readme: readFileSync(join(repo, 'README.md'), 'utf8'),
}

describe('the paragraphs Grid tells an agent in more than one place', () => {
  for (const [name, { text, in: where }] of Object.entries(SHARED)) {
    for (const place of where) {
      it(`${name} is in the ${place} as written once`, () => {
        expect(plain(places[place])).toContain(plain(text))
      })
    }
  }

  it('are each carried by at least two places', () => {
    for (const { in: where } of Object.values(SHARED)) expect(where.length).toBeGreaterThanOrEqual(2)
  })

  it('are the whole of the instructions, in order', () => {
    expect(INSTRUCTIONS).toBe(Object.values(SHARED).map(({ text }) => text).join(' '))
  })

  it('reach the guide the server serves, which is the page', () => {
    expect(places.guide).toBe(agentGuide())
  })
})
