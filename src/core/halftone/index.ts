import type { HalftoneSettings } from '../types';
import { floydSteinberg } from './errorDiffusion';
import { orderedHalftone } from './ordered';
import { stochasticHalftone } from './stochastic';

/** Mask value for an inked pixel. Masks hold only 0 (open) or INK. */
export const INK = 255;

export const usesScreenAngle = (s: HalftoneSettings) => s.pattern === 'ordered';

/** Drops coverage below the minimum dot and fills coverage above the maximum dot. */
export function buildDotClampLut(minDotPct: number, maxDotPct: number): Uint8Array {
  const lut = new Uint8Array(256);
  const lo = (minDotPct / 100) * 255;
  const hi = (maxDotPct / 100) * 255;
  for (let i = 0; i < 256; i++) lut[i] = i === 0 ? 0 : i < lo ? 0 : i > hi ? 255 : i;
  return lut;
}

/**
 * Converts one layer's coverage map (0..255, modified in place by the dot clamp)
 * into a binary mask at print resolution.
 */
export function halftoneLayer(
  coverage: Uint8Array,
  width: number,
  height: number,
  settings: HalftoneSettings,
  angleDeg: number,
  layerIndex: number,
  out: Uint8Array = new Uint8Array(coverage.length),
): Uint8Array {
  const clamp = buildDotClampLut(settings.minDotPct, settings.maxDotPct);
  for (let i = 0; i < coverage.length; i++) coverage[i] = clamp[coverage[i]];
  switch (settings.pattern) {
    case 'ordered':
      orderedHalftone(coverage, width, height, angleDeg, settings.lpi, out);
      break;
    case 'floyd-steinberg':
      floydSteinberg(coverage, width, height, settings.fmGrainPx, out);
      break;
    case 'stochastic':
      stochasticHalftone(coverage, width, height, settings.fmGrainPx, layerIndex, out);
      break;
  }
  return out;
}

/**
 * Without overprint a darker plate wins wherever dots of different plates collide,
 * so no pixel is printed by two inks. Returns new arrays for every plate but the darkest.
 */
export function knockoutMasks(masks: Uint8Array[], lightToDark: number[]): Uint8Array[] {
  if (masks.length <= 1) return masks.slice();
  const out = masks.slice();
  const n = masks[0].length;
  const darkToLight = lightToDark.slice().reverse();
  const occupied = masks[darkToLight[0]].slice();
  for (let k = 1; k < darkToLight.length; k++) {
    const li = darkToLight[k];
    const src = masks[li];
    const dst = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (src[i] && !occupied[i]) {
        dst[i] = INK;
        occupied[i] = INK;
      }
    }
    out[li] = dst;
  }
  return out;
}

/**
 * Share of inked pixels in each k×k block of a region, as 0..255 coverage.
 * Used to display print masks at any zoom without changing them.
 */
export function downsampleMask(
  mask: Uint8Array,
  width: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  k: number,
): Uint8Array {
  const ow = Math.ceil(rw / k);
  const oh = Math.ceil(rh / k);
  const out = new Uint8Array(ow * oh);
  if (k === 1) {
    for (let y = 0; y < rh; y++) out.set(mask.subarray((ry + y) * width + rx, (ry + y) * width + rx + rw), y * ow);
    return out;
  }
  const sums = new Uint32Array(ow);
  const counts = new Uint32Array(ow);
  for (let oy = 0; oy < oh; oy++) {
    sums.fill(0);
    counts.fill(0);
    const y1 = Math.min(ry + rh, ry + (oy + 1) * k);
    for (let y = ry + oy * k; y < y1; y++) {
      const row = y * width;
      for (let x = 0; x < rw; x++) {
        const ox = (x / k) | 0;
        sums[ox] += mask[row + rx + x];
        counts[ox]++;
      }
    }
    for (let ox = 0; ox < ow; ox++) out[oy * ow + ox] = counts[ox] ? Math.round(sums[ox] / counts[ox]) : 0;
  }
  return out;
}
