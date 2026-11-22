/**
 * SHT-7: what a floor plan picture shows, from `grid draw`'s `--hide`, `--colour` and `--key`, and
 * from `grid_view`'s `hide`, `colour` and `key`. Light on purpose: the tool server reads it
 * without loading the drawing code.
 */
import type { PictureShow } from '@ongrid/viewer/src/picture/planSvg'
import { UsageError } from './options'

/** SHT-7: what `--hide` may name. */
export const HIDE_PARTS = ['title', 'key', 'notes', 'sketch', 'dimensions', 'areas', 'swings', 'warnings', 'above'] as const

/** SHT-7: what a drawing shows, from `--hide`, `--colour` and `--key`. */
export interface DrawShow {
  readonly showDimensions: boolean
  readonly show: PictureShow
}

/** SHT-7: reads `--hide`, `--colour` and `--key`, refusing a word Grid does not know by name. */
export function drawShowOf(request: { readonly hide?: string; readonly colour?: string; readonly key?: boolean }): DrawShow {
  const hidden = new Set<string>()
  for (const word of (request.hide ?? '').split(',').map((w) => w.trim()).filter((w) => w.length > 0)) {
    if (!(HIDE_PARTS as readonly string[]).includes(word)) {
      throw new UsageError(`--hide ${JSON.stringify(word)} is not a part Grid can leave off: use ${HIDE_PARTS.join(', ')}, joined by commas.`)
    }
    hidden.add(word)
  }
  if (request.hide !== undefined && hidden.size === 0) throw new UsageError(`--hide needs the parts to leave off: ${HIDE_PARTS.join(', ')}, joined by commas.`)
  if (request.colour !== undefined && request.colour !== 'use') throw new UsageError(`--colour ${JSON.stringify(request.colour)} is not a way Grid colours rooms: use use.`)
  if (request.key && hidden.has('key')) throw new UsageError('--key adds a key and --hide key leaves it off: give one of them.')
  const show: PictureShow = {
    ...(request.key ? { key: true } : {}),
    ...(request.colour === 'use' ? { colourBy: 'use' as const } : {}),
    ...Object.fromEntries([...hidden].filter((part) => part !== 'dimensions').map((part) => [part, false])),
  }
  return { showDimensions: !hidden.has('dimensions'), show }
}
