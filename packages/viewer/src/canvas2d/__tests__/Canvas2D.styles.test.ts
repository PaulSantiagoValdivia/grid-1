import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

/**
 * How the plan tells a doorless opening from a door. The rules are read from
 * the stylesheet itself: jsdom doesn't load the stylesheet, so a DOM test can't see them.
 */
const css = readFileSync(resolve(__dirname, '../plan.css'), 'utf8')

function rule(selector: string): string | undefined {
  const start = css.indexOf(`${selector} {`)
  return start < 0 ? undefined : css.slice(start, css.indexOf('}', start))
}

describe('Canvas2D opening styles', () => {
  it('draws a doorless opening as an open gap, with no outline along the wall faces', () => {
    expect(rule(".canvas [data-part='opening'][data-type='opening']")).toMatch(/stroke:\s*none;/)
  })

  it('keeps the outline on doors and windows', () => {
    const base = rule(".canvas [data-part='opening']")
    expect(base).toMatch(/stroke:\s*var\(--plan-wall/)
    expect(rule(".canvas [data-part='opening'][data-type='door']")).toBeUndefined()
    expect(rule(".canvas [data-part='opening'][data-type='window']")).not.toMatch(/stroke:/)
  })
})
