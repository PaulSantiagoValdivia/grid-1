/**
 * CMD-7 (lab Z-11): the plan format's conventions are written down for people and agents, in
 * `docs/conventions.md`: C1 to C5 each with its own section and drawing, and every later one in
 * the header of `floorplan.ts` with a row that links to the plan file's page. A convention added to
 * the header fails here until it has its row.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repo = resolve(__dirname, '../../../../..')
const docs = join(repo, 'docs')
const page = readFileSync(join(docs, 'conventions.md'), 'utf8')
const source = readFileSync(resolve(__dirname, '../floorplan.ts'), 'utf8')
const header = source.slice(0, source.indexOf('*/'))
const numbers = [...header.matchAll(/^ \* C(\d+) · /gm)].map((m) => Number(m[1]))

/** A heading's anchor as GitHub writes it. */
const slug = (heading: string): string => heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-')

describe('the conventions page', () => {
  it('gives C1 to C5 a section each, with a drawing that is there', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const section = new RegExp(`^## C${n} · [^\\n]+\\n\\n!\\[[^\\]]+\\]\\((conventions/[^)]+\\.svg)\\)`, 'm').exec(page)
      expect(section, `C${n}`).not.toBeNull()
      const drawing = join(docs, section![1]!)
      expect(existsSync(drawing), drawing).toBe(true)
      expect(readFileSync(drawing, 'utf8')).toMatch(/^<svg [^>]*role="img" aria-label="[^"]+"/)
    }
  })

  it('has a row for every later convention in the header', () => {
    const rows = [...page.matchAll(/^\| C(\d+) \|/gm)].map((m) => Number(m[1]))
    expect(rows).toEqual(numbers.filter((n) => n > 5))
  })

  it('links only to sections the pages have', () => {
    for (const [, file, anchor] of page.matchAll(/\]\(([a-z-]*\.md)?#([^)]+)\)/g)) {
      const target = file === undefined ? page : readFileSync(join(docs, file), 'utf8')
      const anchors = [...target.matchAll(/^#{1,4} (.+)$/gm)].map((m) => slug(m[1]!))
      expect(anchors, `${file ?? 'conventions.md'}#${anchor}`).toContain(anchor)
    }
  })
})
