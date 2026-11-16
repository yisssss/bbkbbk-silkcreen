/**
 * Floyd–Steinberg error diffusion on a grid of `grain`-pixel cells (serpentine scan).
 * Cells are averaged first so each printed grain is large enough for the mesh;
 * pixels with no coverage of their own stay open so image edges remain crisp.
 */
export function floydSteinberg(coverage: Uint8Array, width: number, height: number, grain: number, out: Uint8Array) {
  const g = Math.max(1, Math.round(grain));
  const gw = Math.ceil(width / g);
  const gh = Math.ceil(height / g);
  const grid = new Float32Array(gw * gh);

  if (g === 1) {
    for (let i = 0; i < coverage.length; i++) grid[i] = coverage[i];
  } else {
    const counts = new Uint16Array(gw * gh);
    for (let y = 0, i = 0; y < height; y++) {
      const row = ((y / g) | 0) * gw;
      for (let x = 0; x < width; x++, i++) {
        const cell = row + ((x / g) | 0);
        grid[cell] += coverage[i];
        counts[cell]++;
      }
    }
    for (let c = 0; c < grid.length; c++) grid[c] /= counts[c] || 1;
  }

  const on = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    const ltr = (y & 1) === 0;
    const dir = ltr ? 1 : -1;
    for (let k = 0; k < gw; k++) {
      const x = ltr ? k : gw - 1 - k;
      const idx = y * gw + x;
      const old = grid[idx];
      const val = old >= 127.5 ? 255 : 0;
      on[idx] = val ? 1 : 0;
      const err = old - val;
      const xn = x + dir;
      const xp = x - dir;
      if (xn >= 0 && xn < gw) grid[idx + dir] += (err * 7) / 16;
      if (y + 1 < gh) {
        const below = idx + gw;
        if (xp >= 0 && xp < gw) grid[below - dir] += (err * 3) / 16;
        grid[below] += (err * 5) / 16;
        if (xn >= 0 && xn < gw) grid[below + dir] += (err * 1) / 16;
      }
    }
  }

  for (let y = 0, i = 0; y < height; y++) {
    const row = ((y / g) | 0) * gw;
    for (let x = 0; x < width; x++, i++) {
      out[i] = coverage[i] > 0 && on[row + ((x / g) | 0)] ? 255 : 0;
    }
  }
}
