import { buildAdjustLut } from './tone';
import type { ImageAdjust, LayerTone, ProjectDoc, SeparationSettings } from './types';
import { clamp01 } from './units';

type ToneLayer = { tone: LayerTone };

/** Older projects stored a single tonal stop or a hard threshold band. */
export function migrateLayerTone(
  tone: { solidLo?: number; solidHi?: number; stop?: number; rangeLo?: number; rangeHi?: number },
  mode?: string,
): LayerTone {
  if (typeof tone?.solidLo === 'number' && typeof tone.solidHi === 'number') {
    return { solidLo: tone.solidLo, solidHi: Math.max(tone.solidLo, tone.solidHi) };
  }
  if (mode === 'threshold' && typeof tone?.rangeLo === 'number' && typeof tone.rangeHi === 'number') {
    const solidLo = Math.min(tone.rangeLo, tone.rangeHi);
    return { solidLo, solidHi: Math.max(tone.rangeLo, tone.rangeHi) };
  }
  const stop = typeof tone?.stop === 'number' ? tone.stop : 100;
  return { solidLo: stop, solidHi: stop };
}

/** Fills in the unified tone fields and drops the old tonal/threshold switch. */
export function migrateSeparation(doc: ProjectDoc): ProjectDoc {
  const legacy = doc.separation as SeparationSettings & { mode?: string };
  return {
    ...doc,
    separation: { overprint: !!legacy?.overprint, whitePoint: legacy?.whitePoint ?? 0 },
    layers: doc.layers.map((layer) => ({
      ...layer,
      tone: migrateLayerTone(layer.tone, legacy?.mode),
    })),
  };
}

function span01(tone: LayerTone) {
  const lo = tone.solidLo / 100;
  const hi = Math.max(lo, tone.solidHi / 100);
  return { lo, hi, mid: (lo + hi) / 2 };
}

/** Layer indices sorted from lightest tone to darkest (stable). This is also the print order. */
export function darknessOrder(layers: ToneLayer[]): number[] {
  return layers
    .map((l, i) => ({ i, k: span01(l.tone).mid }))
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .map((x) => x.i);
}

/**
 * One separation for every ink. [solidLo, solidHi] is 100% ink.
 * The gaps on either side fade to the neighbouring ink, or to paper.
 * Without overprint a darker solid knocks out lighter inks.
 * With overprint an ink that has reached its solid stays on through every darker tone.
 */
function plateCoverage(d: number, layers: ToneLayer[], order: number[], sep: SeparationSettings, out: number[]) {
  const wp = sep.whitePoint / 100;
  if (d < wp) return;
  for (let k = 0; k < order.length; k++) {
    const li = order[k];
    const { lo, hi } = span01(layers[li].tone);
    const prevEdge = k === 0 ? wp : Math.max(wp, span01(layers[order[k - 1]].tone).hi);
    const nextEdge = k === order.length - 1 ? 1 : span01(layers[order[k + 1]].tone).lo;
    let c: number;
    if (d < lo) c = prevEdge >= lo ? 0 : clamp01((d - prevEdge) / (lo - prevEdge));
    else if (d <= hi) c = 1;
    else if (sep.overprint) c = 1;
    else if (nextEdge <= hi) c = 0;
    else c = 1 - clamp01((d - hi) / (nextEdge - hi));
    out[li] = c;
  }
  if (!sep.overprint) {
    let darkerSolid = false;
    for (let k = order.length - 1; k >= 0; k--) {
      const li = order[k];
      if (darkerSolid) out[li] = 0;
      else if (out[li] >= 1) darkerSolid = true;
    }
  }
}

/** Ink coverage (0..1) of each layer for a darkness value 0..1 (after image adjustment). */
export function coverageAtDarkness(d: number, layers: ToneLayer[], sep: SeparationSettings): number[] {
  const out = new Array<number>(layers.length).fill(0);
  plateCoverage(d, layers, darknessOrder(layers), sep, out);
  return out;
}

/**
 * Final per-layer coverage lookup indexed by *source* luminance: image adjustment
 * and inter-layer separation are folded into one 256-entry table per layer.
 * Coverage depends only on tone and settings, never on ink colour.
 */
export function buildCoverageLuts(layers: ToneLayer[], sep: SeparationSettings, adjust: ImageAdjust): Uint8Array[] {
  const adj = buildAdjustLut(adjust);
  const luts = layers.map(() => new Uint8Array(256));
  for (let i = 0; i < 256; i++) {
    const cov = coverageAtDarkness(1 - adj[i] / 255, layers, sep);
    for (let l = 0; l < layers.length; l++) luts[l][i] = Math.round(cov[l] * 255);
  }
  return luts;
}

/**
 * Applies a coverage lookup to a luminance plane, masked by source alpha.
 * With binaryAlpha, alpha is cut at 50% so hard-edged separations stay strictly 0 / 100%.
 */
export function applyCoverageLut(
  lum: Uint8Array,
  alpha: Uint8Array,
  lut: Uint8Array,
  out: Uint8Array = new Uint8Array(lum.length),
  binaryAlpha = false,
): Uint8Array {
  for (let i = 0; i < lum.length; i++) {
    const a = alpha[i];
    const c = lut[lum[i]];
    if (binaryAlpha) out[i] = a >= 128 ? c : 0;
    else out[i] = a === 255 ? c : a === 0 ? 0 : ((c * a + 127) / 255) | 0;
  }
  return out;
}
