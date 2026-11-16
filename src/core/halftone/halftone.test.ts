import { describe, expect, it } from 'vitest';
import { DEFAULT_HALFTONE } from '../defaults';
import type { HalftonePattern } from '../types';
import { downsampleMask, halftoneLayer, INK, knockoutMasks } from './index';

const W = 300;
const H = 300;
const flat = (v: number) => new Uint8Array(W * H).fill(v);
const inkShare = (m: Uint8Array) => m.reduce((s, v) => s + (v ? 1 : 0), 0) / m.length;
const settings = (pattern: HalftonePattern) => ({ ...DEFAULT_HALFTONE, pattern, minDotPct: 0, maxDotPct: 100 });
const PATTERNS: HalftonePattern[] = ['ordered', 'floyd-steinberg', 'stochastic'];

describe.each(PATTERNS)('%s halftone', (pattern) => {
  it('produces only 0 or INK', () => {
    const cov = new Uint8Array(W * H);
    for (let i = 0; i < cov.length; i++) cov[i] = i % 256;
    const mask = halftoneLayer(cov, W, H, settings(pattern), 22.5, 0);
    expect(mask.every((v) => v === 0 || v === INK)).toBe(true);
  });

  it.each([0.1, 0.25, 0.5, 0.75, 0.9])('ink area tracks %f coverage', (c) => {
    const mask = halftoneLayer(flat(Math.round(c * 255)), W, H, settings(pattern), 37, 1);
    expect(Math.abs(inkShare(mask) - c)).toBeLessThan(0.03);
  });

  it('0% stays open and 100% prints solid', () => {
    expect(inkShare(halftoneLayer(flat(0), W, H, settings(pattern), 0, 0))).toBe(0);
    expect(inkShare(halftoneLayer(flat(255), W, H, settings(pattern), 0, 0))).toBe(1);
  });
});

describe('dot clamp', () => {
  it('drops coverage below the minimum dot and fills above the maximum', () => {
    const s = { ...DEFAULT_HALFTONE, minDotPct: 10, maxDotPct: 90 };
    expect(inkShare(halftoneLayer(flat(Math.round(0.05 * 255)), W, H, s, 45, 0))).toBe(0);
    expect(inkShare(halftoneLayer(flat(Math.round(0.95 * 255)), W, H, s, 45, 0))).toBe(1);
  });
});

describe('screen angle', () => {
  it('different angles place dots differently', () => {
    const a = halftoneLayer(flat(80), W, H, settings('ordered'), 15, 0);
    const b = halftoneLayer(flat(80), W, H, settings('ordered'), 75, 0);
    let diff = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
    expect(diff / a.length).toBeGreaterThan(0.05);
  });
});

describe('knockout', () => {
  it('never prints one pixel with two inks and keeps the darkest plate intact', () => {
    const light = halftoneLayer(flat(128), W, H, settings('ordered'), 22.5, 0);
    const dark = halftoneLayer(flat(128), W, H, settings('ordered'), 52.5, 1);
    const [l, d] = knockoutMasks([light, dark], [0, 1]);
    expect(d).toBe(dark);
    for (let i = 0; i < l.length; i++) expect(l[i] && d[i]).toBeFalsy();
  });
});

describe('downsampleMask', () => {
  it('averages ink share per block', () => {
    const m = new Uint8Array([INK, 0, INK, INK, 0, 0, INK, INK]);
    expect([...downsampleMask(m, 4, 0, 0, 4, 2, 2)]).toEqual([64, 255]);
  });
});
