import { describe, expect, it } from 'vitest';
import { defaultTone } from './defaults';
import { resizeRect } from './geometry';
import { applyCoverageLut, buildCoverageLuts, coverageAtDarkness, migrateLayerTone } from './separation';
import { NEUTRAL_ADJUST } from './tone';
import type { LayerTone, SeparationSettings } from './types';

const tone = (solidLo: number, solidHi = solidLo): LayerTone => ({ solidLo, solidHi });
const layersOf = (...spans: LayerTone[]) => spans.map((tone) => ({ tone }));
const sep = (overprint = false, whitePoint = 0): SeparationSettings => ({ overprint, whitePoint });
const samples = Array.from({ length: 101 }, (_, i) => i / 100);

describe('solid span and gradient shoulders', () => {
  const layers = layersOf(tone(20, 40), tone(60, 80));

  it('is solid inside each span and fades to paper outside them', () => {
    expect(coverageAtDarkness(0, layers, sep())).toEqual([0, 0]);
    expect(coverageAtDarkness(0.3, layers, sep())).toEqual([1, 0]);
    expect(coverageAtDarkness(0.7, layers, sep())).toEqual([0, 1]);
    expect(coverageAtDarkness(1, layers, sep())).toEqual([0, 0]);
  });

  it('cross-fades between spans and never stacks without overprint', () => {
    for (const d of samples) {
      const c = coverageAtDarkness(d, layers, sep());
      expect(c[0] + c[1]).toBeLessThanOrEqual(1 + 1e-9);
    }
    const mid = coverageAtDarkness(0.5, layers, sep());
    expect(mid[0]).toBeCloseTo(0.5);
    expect(mid[1]).toBeCloseTo(0.5);
  });

  it('a collapsed span is a tonal peak', () => {
    const peak = layersOf(tone(40), tone(100));
    expect(coverageAtDarkness(0.2, peak, sep())[0]).toBeCloseTo(0.5);
    expect(coverageAtDarkness(0.7, peak, sep())[0]).toBeCloseTo(0.5);
    expect(coverageAtDarkness(0.7, peak, sep())[1]).toBeCloseTo(0.5);
    expect(coverageAtDarkness(1, peak, sep())).toEqual([0, 1]);
  });

  it('with overprint a lighter ink stays on after it becomes solid', () => {
    expect(coverageAtDarkness(0.7, layers, sep(true))).toEqual([1, 1]);
    expect(coverageAtDarkness(1, layers, sep(true))).toEqual([1, 1]);
  });

  it('tones lighter than the white point stay paper', () => {
    const one = layersOf(tone(40, 100));
    expect(coverageAtDarkness(0.1, one, sep(false, 20))[0]).toBe(0);
    expect(coverageAtDarkness(0.3, one, sep(false, 20))[0]).toBeCloseTo(0.5);
  });

  it('where solids overlap, the darker ink wins unless overprint is on', () => {
    const overlap = layersOf(tone(20, 60), tone(40, 80));
    expect(coverageAtDarkness(0.5, overlap, sep())).toEqual([0, 1]);
    expect(coverageAtDarkness(0.5, overlap, sep(true))).toEqual([1, 1]);
  });
});

describe('defaults', () => {
  it('1 colour: paper white → no ink, black → full ink', () => {
    const luts = buildCoverageLuts([{ tone: defaultTone(0, 1) }], sep(), NEUTRAL_ADJUST);
    expect(luts[0][255]).toBe(0);
    expect(luts[0][0]).toBe(255);
  });
});

describe('image adjustment', () => {
  it('brightness shifts which tones receive ink', () => {
    const layers = [{ tone: defaultTone(0, 1) }];
    const base = buildCoverageLuts(layers, sep(), NEUTRAL_ADJUST)[0][128];
    const brighter = buildCoverageLuts(layers, sep(), { brightness: 30, contrast: 0, gamma: 1 })[0][128];
    expect(brighter).toBeLessThan(base);
  });
});

describe('alpha', () => {
  it('transparent pixels never receive ink', () => {
    const lut = buildCoverageLuts([{ tone: defaultTone(0, 1) }], sep(), NEUTRAL_ADJUST)[0];
    const raw = applyCoverageLut(new Uint8Array([0, 0]), new Uint8Array([0, 255]), lut);
    expect([...raw]).toEqual([0, 255]);
  });
});

describe('legacy projects', () => {
  it('keeps a threshold band as the solid span and a tonal stop as a peak', () => {
    expect(migrateLayerTone({ rangeLo: 25, rangeHi: 50 }, 'threshold')).toEqual({ solidLo: 25, solidHi: 50 });
    expect(migrateLayerTone({ stop: 66 }, 'tonal')).toEqual({ solidLo: 66, solidHi: 66 });
  });
});

describe('resizeRect', () => {
  it('keeps aspect ratio and anchors the opposite corner', () => {
    expect(resizeRect({ x: 0, y: 0, width: 100, height: 50 }, 'se', 100, 0, true)).toEqual({ x: 0, y: 0, width: 200, height: 100 });
    expect(resizeRect({ x: 0, y: 0, width: 100, height: 50 }, 'nw', -100, 0, true)).toEqual({ x: -100, y: -50, width: 200, height: 100 });
  });

  it('shrinks proportionally when dragging a corner inward along one axis', () => {
    expect(resizeRect({ x: 0, y: 0, width: 100, height: 50 }, 'se', -50, 0, true)).toEqual({ x: 0, y: 0, width: 50, height: 25 });
  });
});
