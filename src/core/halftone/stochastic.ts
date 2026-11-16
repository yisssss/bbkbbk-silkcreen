const TILE = 64;
let blueNoise: Float32Array | null = null;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic 64×64 blue-noise threshold tile (void-and-cluster, toroidal Gaussian σ = 1.5).
 * Values are thresholds in 0..255; the fixed seed keeps output identical between runs.
 */
export function getBlueNoise(): Float32Array {
  if (blueNoise) return blueNoise;
  const n = TILE * TILE;
  const sigma2 = 2 * 1.5 * 1.5;
  const kernel = new Float32Array(n);
  for (let dy = 0; dy < TILE; dy++) {
    for (let dx = 0; dx < TILE; dx++) {
      const wx = Math.min(dx, TILE - dx);
      const wy = Math.min(dy, TILE - dy);
      kernel[dy * TILE + dx] = Math.exp(-(wx * wx + wy * wy) / sigma2);
    }
  }
  const bits = new Uint8Array(n);
  const energy = new Float32Array(n);
  const toggle = (idx: number, on: boolean) => {
    bits[idx] = on ? 1 : 0;
    const s = on ? 1 : -1;
    const px = idx % TILE;
    const py = (idx / TILE) | 0;
    for (let y = 0; y < TILE; y++) {
      const ky = ((y - py + TILE) % TILE) * TILE;
      const row = y * TILE;
      for (let x = 0; x < TILE; x++) energy[row + x] += s * kernel[ky + ((x - px + TILE) % TILE)];
    }
  };
  const argExtreme = (wantBit: number, max: boolean) => {
    let best = -1;
    let bestE = max ? -Infinity : Infinity;
    for (let i = 0; i < n; i++) {
      if (bits[i] !== wantBit) continue;
      const e = energy[i];
      if (max ? e > bestE : e < bestE) {
        bestE = e;
        best = i;
      }
    }
    return best;
  };

  const rand = mulberry32(0x5eed);
  const initial = Math.round(n * 0.1);
  for (let placed = 0; placed < initial; ) {
    const idx = (rand() * n) | 0;
    if (!bits[idx]) {
      toggle(idx, true);
      placed++;
    }
  }
  for (let iter = 0; iter < n; iter++) {
    const cluster = argExtreme(1, true);
    toggle(cluster, false);
    const voidIdx = argExtreme(0, false);
    toggle(voidIdx, true);
    if (voidIdx === cluster) break;
  }

  const rank = new Uint32Array(n);
  const protoBits = bits.slice();
  const protoEnergy = energy.slice();
  for (let ones = initial; ones > 0; ) {
    const idx = argExtreme(1, true);
    toggle(idx, false);
    rank[idx] = --ones;
  }
  bits.set(protoBits);
  energy.set(protoEnergy);
  for (let ones = initial; ones < n; ones++) {
    const idx = argExtreme(0, false);
    toggle(idx, true);
    rank[idx] = ones;
  }

  blueNoise = new Float32Array(n);
  for (let i = 0; i < n; i++) blueNoise[i] = ((rank[i] + 0.5) / n) * 255;
  return blueNoise;
}

/**
 * FM screen: each `grain`-pixel cell compares coverage with a tiled blue-noise threshold.
 * `layerIndex` offsets the tile so different inks do not share identical grain positions.
 */
export function stochasticHalftone(
  coverage: Uint8Array,
  width: number,
  height: number,
  grain: number,
  layerIndex: number,
  out: Uint8Array,
) {
  const table = getBlueNoise();
  const g = Math.max(1, Math.round(grain));
  const ox = (layerIndex * 23) % TILE;
  const oy = (layerIndex * 41) % TILE;
  for (let y = 0, i = 0; y < height; y++) {
    const ty = ((((y / g) | 0) + oy) % TILE) * TILE;
    for (let x = 0; x < width; x++, i++) {
      const c = coverage[i];
      out[i] = c === 0 ? 0 : c === 255 ? 255 : c > table[ty + ((((x / g) | 0) + ox) % TILE)] ? 255 : 0;
    }
  }
}
