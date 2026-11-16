import { PRINT_DPI } from '../units';

const TABLE_N = 64;
let roundTable: Float32Array | null = null;

/**
 * Threshold table for one screen cell (cell centre at 0.5, 0.5), values in 0..255.
 * Round (Euclidean) spot: circular dots grow from the centre in highlights and
 * close into circular holes at the corners in shadows. Ranking the spot function
 * makes printed area track coverage linearly.
 */
function getRoundTable(): Float32Array {
  if (roundTable) return roundTable;
  const n = TABLE_N * TABLE_N;
  const spot = new Float32Array(n);
  for (let j = 0; j < TABLE_N; j++) {
    for (let i = 0; i < TABLE_N; i++) {
      const x = Math.abs(((i + 0.5) / TABLE_N - 0.5) * 2);
      const y = Math.abs(((j + 0.5) / TABLE_N - 0.5) * 2);
      spot[j * TABLE_N + i] = x + y <= 1 ? 1 - (x * x + y * y) : (x - 1) ** 2 + (y - 1) ** 2 - 1;
    }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => spot[b] - spot[a] || a - b);
  roundTable = new Float32Array(n);
  order.forEach((idx, rank) => (roundTable![idx] = ((rank + 0.5) / n) * 255));
  return roundTable;
}

/**
 * Clustered-dot AM screen. The screen grid is anchored at the artboard origin so
 * the same settings always produce the same dots.
 */
export function orderedHalftone(
  coverage: Uint8Array,
  width: number,
  height: number,
  angleDeg: number,
  lpi: number,
  out: Uint8Array,
) {
  const table = getRoundTable();
  const period = PRINT_DPI / lpi;
  const a = (angleDeg * Math.PI) / 180;
  const ca = Math.cos(a) / period;
  const sa = Math.sin(a) / period;
  for (let y = 0, i = 0; y < height; y++) {
    const yc = y + 0.5;
    let u = 0.5 * ca + yc * sa;
    let v = -0.5 * sa + yc * ca;
    for (let x = 0; x < width; x++, i++) {
      const c = coverage[i];
      if (c === 0) out[i] = 0;
      else if (c === 255) out[i] = 255;
      else {
        const iu = ((u - Math.floor(u)) * TABLE_N) | 0;
        const iv = ((v - Math.floor(v)) * TABLE_N) | 0;
        out[i] = c > table[iv * TABLE_N + iu] ? 255 : 0;
      }
      u += ca;
      v -= sa;
    }
  }
}
