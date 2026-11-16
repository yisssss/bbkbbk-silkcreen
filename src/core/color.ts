import type { Hex, RGB } from './types';

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Returns '#RRGGBB' or null when the input is not a valid hex colour. */
export function normalizeHex(input: string): Hex | null {
  const m = HEX_RE.exec(input.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return `#${h.toUpperCase()}`;
}

export function hexToRgb(hex: Hex): RGB {
  const n = normalizeHex(hex) ?? '#000000';
  return [parseInt(n.slice(1, 3), 16), parseInt(n.slice(3, 5), 16), parseInt(n.slice(5, 7), 16)];
}
