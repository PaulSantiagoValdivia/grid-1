/**
 * How Three turns a lit colour into a screen colour, for the settings React Three Fiber gives
 * the app's canvas: ACES filmic tone mapping at exposure 1, then the sRGB transfer curve.
 *
 * `acesFilmic` follows Three's `ACESFilmicToneMapping` shader chunk (three.js r168,
 * `src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js`, MIT License,
 * Copyright 2010-2024 three.js authors), itself a fit by Stephen Hill of the ACES transform.
 * See `NOTICE`.
 */

function rrtAndOdtFit(v: number): number {
  const a = v * (v + 0.0245786) - 0.000090537
  const b = v * (0.983729 * v + 0.432951) + 0.238081
  return a / b
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

/** A linear colour, tone-mapped into 0 to 1, still linear. Writes into `out`. */
export function acesFilmic(r: number, g: number, b: number, out: Float64Array | number[]): void {
  const exposure = 1 / 0.6
  r *= exposure
  g *= exposure
  b *= exposure
  // Three's ACESInputMat, written out by rows.
  const ir = rrtAndOdtFit(0.59719 * r + 0.35458 * g + 0.04823 * b)
  const ig = rrtAndOdtFit(0.076 * r + 0.90834 * g + 0.01566 * b)
  const ib = rrtAndOdtFit(0.0284 * r + 0.13383 * g + 0.83777 * b)
  // And its ACESOutputMat.
  out[0] = clamp01(1.60475 * ir - 0.53108 * ig - 0.07367 * ib)
  out[1] = clamp01(-0.10208 * ir + 1.10813 * ig - 0.00605 * ib)
  out[2] = clamp01(-0.00327 * ir - 0.07276 * ig + 1.07602 * ib)
}

/** A linear value from 0 to 1 on the sRGB curve, from 0 to 1. */
export function linearToSrgb(c: number): number {
  const v = clamp01(c)
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
}
