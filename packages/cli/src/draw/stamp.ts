/**
 * MSG-3: the label "General guidance, not your local rules" stamped in the top-left corner of a
 * picture Grid draws straight onto a canvas (a 3D still, a view from inside a room, plans side
 * by side). A 2D plan carries it in its SVG (`pictureToSvg`), so its PNG has it already.
 */
import type { SKRSContext2D } from '@napi-rs/canvas'
import { GENERAL_GUIDANCE_LABEL } from '@ongrid/rules'

/** The colours of the strip and its text; the working look's by default. */
export interface StampColours {
  readonly paper: string
  readonly ink: string
}

const WORKING: StampColours = { paper: '#ffffff', ink: '#75726a' }

/** Draws the label on a paper-coloured strip, its size following the picture's width. */
export function stampLabel(context: SKRSContext2D, width: number, colours: StampColours = WORKING): void {
  const px = Math.max(11, Math.round(width / 110))
  context.save()
  context.font = `${px}px sans-serif`
  const strip = context.measureText(GENERAL_GUIDANCE_LABEL).width + px
  context.globalAlpha = 0.9
  context.fillStyle = colours.paper
  context.fillRect(0, 0, strip, Math.round(px * 1.9))
  context.globalAlpha = 1
  context.fillStyle = colours.ink
  context.fillText(GENERAL_GUIDANCE_LABEL, px / 2, Math.round(px * 1.35))
  context.restore()
}
