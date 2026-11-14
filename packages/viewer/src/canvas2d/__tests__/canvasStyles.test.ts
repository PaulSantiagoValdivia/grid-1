import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { describe, expect, it } from 'vitest'

/**
 * The canvases carry no CSS Modules and none of the old tokens.
 */
const preview = resolve(__dirname, '../..')
const folders = ['canvas2d', 'canvas3d'].map((name) => join(preview, name))

function sources(): { path: string; text: string }[] {
  return folders.flatMap((folder) =>
    readdirSync(folder)
      .filter((name) => /\.(tsx?|css)$/.test(name))
      .map((name) => ({ path: join(folder, name), text: readFileSync(join(folder, name), 'utf8') }))
  )
}

describe('canvas styles', () => {
  it('has no CSS Module left in Canvas2D or Canvas3D', () => {
    for (const folder of folders) {
      expect(readdirSync(folder).filter((name) => name.endsWith('.module.css'))).toEqual([])
    }
  })

  it('leaves no `styles.` or old-token leftovers', () => {
    for (const { path, text } of sources()) {
      expect(text, path).not.toMatch(/\bstyles\.|var\(--bg-|var\(--text-|\.module\.css/)
    }
  })

  it('keeps the plan finish in a plain stylesheet on the --plan-* tokens', () => {
    const sheet = join(preview, 'canvas2d', 'plan.css')
    expect(existsSync(sheet)).toBe(true)
    const css = readFileSync(sheet, 'utf8')
    for (const part of ['room', 'wall', 'virtual', 'opening', 'label', 'dimension-line', 'pulse']) {
      expect(css).toContain(`.canvas [data-part='${part}']`)
    }
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const colors = [...rules.matchAll(/(?:fill|stroke):\s*([^;]+);/g)].map((match) => match[1].trim())
    for (const color of colors) expect(color).toMatch(/^(none|var\(--plan-[a-z0-9-]+, #[0-9a-f]{6}\))$/)
  })
})
