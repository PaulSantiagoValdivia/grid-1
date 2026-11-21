/**
 * The canvas every PNG is drawn with: Skia through `@napi-rs/canvas` (MIT), a native module.
 * The npm package lists it as optional (CMD-9), so an install where its binary did not come
 * along still runs every command and tool that draws no PNG. Loaded on the first PNG.
 */

/** The PNG canvas is not installed. The message is one line and says what to do. */
export class CanvasMissing extends Error {
  override readonly name = 'CanvasMissing'
}

export async function loadCanvas(): Promise<typeof import('@napi-rs/canvas')> {
  try {
    return await import('@napi-rs/canvas')
  } catch {
    throw new CanvasMissing('Drawing a PNG needs the optional package @napi-rs/canvas, which is not installed with Grid here: run npm install @napi-rs/canvas beside Grid. Everything that draws no PNG works without it.')
  }
}
