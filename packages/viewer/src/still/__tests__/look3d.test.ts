import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { readPlanColors } from '../../canvas3d/usePlanColors'
import { DARK_COLORS_3D, LIGHT_COLORS_3D } from '../look3d'

/**
 * A still's colours and the app's stylesheet say the same thing twice. The app reads the sheet
 * with `readPlanColors`; reading it the same way here keeps the two from drifting apart.
 */
const tokens = readFileSync(resolve(__dirname, '../../plan-tokens.css'), 'utf8')

function block(selector: ':root' | '.dark'): Pick<CSSStyleDeclaration, 'getPropertyValue'> {
  const start = tokens.indexOf(`${selector} {`)
  const body = tokens.slice(start, tokens.indexOf('}', start))
  const values = new Map([...body.matchAll(/(--plan-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]))
  return { getPropertyValue: (name: string) => values.get(name) ?? '' }
}

/** The dark block only overrides; whatever it leaves out comes from :root, as in a browser. */
function dark(): Pick<CSSStyleDeclaration, 'getPropertyValue'> {
  const root = block(':root')
  const over = block('.dark')
  return { getPropertyValue: (name: string) => over.getPropertyValue(name) || root.getPropertyValue(name) }
}

describe("a still's colours", () => {
  it('are the light theme of plan-tokens.css', () => {
    expect(LIGHT_COLORS_3D).toEqual(readPlanColors(block(':root')))
  })

  it('are the dark theme of plan-tokens.css', () => {
    expect(DARK_COLORS_3D).toEqual(readPlanColors(dark()))
  })
})
