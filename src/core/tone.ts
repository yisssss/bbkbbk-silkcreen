import type { ImageAdjust } from './types';
import { clamp, clamp01 } from './units';

export const NEUTRAL_ADJUST: ImageAdjust = { brightness: 0, contrast: 0, gamma: 1 };

/** Applies brightness → contrast → gamma to a 0..1 value. */
export function adjustValue(v: number, adj: ImageAdjust): number {
  let x = v + adj.brightness / 100;
  const c = clamp(adj.contrast, -99, 99) / 100;
  const factor = Math.tan(((c + 1) * Math.PI) / 4);
  x = clamp01((x - 0.5) * factor + 0.5);
  return Math.pow(x, 1 / clamp(adj.gamma, 0.1, 10));
}

/** 8-bit lookup for the global image adjustment; used for both luminance and RGB channels. */
export function buildAdjustLut(adj: ImageAdjust): Uint8Array {
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) lut[i] = Math.round(adjustValue(i / 255, adj) * 255);
  return lut;
}
