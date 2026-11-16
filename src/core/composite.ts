import type { RGB } from './types';

/**
 * Preview-only colour composite. Ink colour enters the pipeline here and nowhere earlier.
 * Without overprint the inks occupy separate areas, so colours mix by area share.
 * With overprint inks are laid down in print order and stack multiplicatively.
 */
export function compositeInks(
  out: Uint8ClampedArray,
  coverages: Uint8Array[],
  colors: RGB[],
  printOrder: number[],
  paper: RGB,
  overprint: boolean,
  /** Unprinted pixels stay transparent so a mockup can show through. */
  transparentPaper = false,
) {
  const n = out.length >> 2;
  for (let p = 0, o = 0; p < n; p++, o += 4) {
    if (transparentPaper) {
      writeInkOnly(out, o, coverages, colors, printOrder, p, overprint);
      continue;
    }
    let r = paper[0];
    let g = paper[1];
    let b = paper[2];
    if (overprint) {
      for (let k = 0; k < printOrder.length; k++) {
        const li = printOrder[k];
        const cv = coverages[li][p];
        if (cv === 0) continue;
        const c = cv / 255;
        const ink = colors[li];
        r *= 1 - c + (c * ink[0]) / 255;
        g *= 1 - c + (c * ink[1]) / 255;
        b *= 1 - c + (c * ink[2]) / 255;
      }
    } else {
      let total = 0;
      let ir = 0;
      let ig = 0;
      let ib = 0;
      for (let k = 0; k < printOrder.length; k++) {
        const li = printOrder[k];
        const cv = coverages[li][p];
        if (cv === 0) continue;
        const c = cv / 255;
        const ink = colors[li];
        total += c;
        ir += ink[0] * c;
        ig += ink[1] * c;
        ib += ink[2] * c;
      }
      if (total > 0) {
        const scale = total > 1 ? 1 / total : 1;
        const bare = 1 - Math.min(1, total);
        r = r * bare + ir * scale;
        g = g * bare + ig * scale;
        b = b * bare + ib * scale;
      }
    }
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = 255;
  }
}

/**
 * The colour stays as composited on white. Opacity comes from the source image,
 * so a page colour drawn behind the bitmap shows only through real transparency.
 */
export function copySourceAlpha(out: Uint8ClampedArray, alpha: Uint8Array) {
  for (let i = 0, o = 3; i < alpha.length; i++, o += 4) out[o] = alpha[i];
}

/** Coverage shown as black ink on white: what the screen will carry. */
export function renderCoverageGray(out: Uint8ClampedArray, coverage: Uint8Array) {
  for (let p = 0, o = 0; p < coverage.length; p++, o += 4) {
    const v = 255 - coverage[p];
    out[o] = v;
    out[o + 1] = v;
    out[o + 2] = v;
    out[o + 3] = 255;
  }
}

/** Ink colour with coverage as alpha. Paper does not contribute. */
function writeInkOnly(
  out: Uint8ClampedArray,
  o: number,
  coverages: Uint8Array[],
  colors: RGB[],
  printOrder: number[],
  p: number,
  overprint: boolean,
) {
  if (overprint) {
    let r = 1;
    let g = 1;
    let b = 1;
    let remain = 1;
    for (let k = 0; k < printOrder.length; k++) {
      const cv = coverages[printOrder[k]][p];
      if (cv === 0) continue;
      const c = cv / 255;
      const ink = colors[printOrder[k]];
      r *= 1 - c + (c * ink[0]) / 255;
      g *= 1 - c + (c * ink[1]) / 255;
      b *= 1 - c + (c * ink[2]) / 255;
      remain *= 1 - c;
    }
    const alpha = 1 - remain;
    if (alpha <= 0) {
      out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0;
      return;
    }
    out[o] = ((r - remain) / alpha) * 255;
    out[o + 1] = ((g - remain) / alpha) * 255;
    out[o + 2] = ((b - remain) / alpha) * 255;
    out[o + 3] = alpha * 255;
    return;
  }
  let total = 0;
  let ir = 0;
  let ig = 0;
  let ib = 0;
  for (let k = 0; k < printOrder.length; k++) {
    const cv = coverages[printOrder[k]][p];
    if (cv === 0) continue;
    const c = cv / 255;
    const ink = colors[printOrder[k]];
    total += c;
    ir += ink[0] * c;
    ig += ink[1] * c;
    ib += ink[2] * c;
  }
  if (total <= 0) {
    out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0;
    return;
  }
  out[o] = ir / total;
  out[o + 1] = ig / total;
  out[o + 2] = ib / total;
  out[o + 3] = Math.min(1, total) * 255;
}

/** Transformed, adjusted source over paper, for the "original" view. */
export function renderOriginal(
  out: Uint8ClampedArray,
  rgba: Uint8ClampedArray,
  paper: RGB,
  adjustLut: Uint8Array,
  transparentPaper = false,
) {
  for (let o = 0; o < rgba.length; o += 4) {
    const a = rgba[o + 3] / 255;
    if (transparentPaper) {
      out[o] = adjustLut[rgba[o]];
      out[o + 1] = adjustLut[rgba[o + 1]];
      out[o + 2] = adjustLut[rgba[o + 2]];
      out[o + 3] = rgba[o + 3];
      continue;
    }
    out[o] = paper[0] + (adjustLut[rgba[o]] - paper[0]) * a;
    out[o + 1] = paper[1] + (adjustLut[rgba[o + 1]] - paper[1]) * a;
    out[o + 2] = paper[2] + (adjustLut[rgba[o + 2]] - paper[2]) * a;
    out[o + 3] = 255;
  }
}
