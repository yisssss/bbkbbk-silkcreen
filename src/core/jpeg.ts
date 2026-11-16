import { PRINT_DPI } from './units';

/**
 * Canvas JPEG files omit a useful print resolution. This writes 300 DPI
 * into the JFIF header so the file opens at its physical size.
 */
export function injectJfifDensity(jpeg: Uint8Array, dpi = PRINT_DPI): Uint8Array {
  if (jpeg.length < 20 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('JPEG 데이터가 아닙니다.');
  const out = jpeg.slice();
  let p = 2;
  while (p + 16 < out.length && out[p] === 0xff) {
    const marker = out[p + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const len = (out[p + 2] << 8) | out[p + 3];
    const isJfif = marker === 0xe0 && out[p + 4] === 0x4a && out[p + 5] === 0x46 && out[p + 6] === 0x49 && out[p + 7] === 0x46;
    if (isJfif) {
      out[p + 11] = 1;
      out[p + 12] = (dpi >> 8) & 0xff;
      out[p + 13] = dpi & 0xff;
      out[p + 14] = (dpi >> 8) & 0xff;
      out[p + 15] = dpi & 0xff;
      return out;
    }
    p += 2 + len;
  }
  return out;
}

export function readJfifDensity(jpeg: Uint8Array): { units: number; x: number; y: number } | null {
  let p = 2;
  while (p + 16 < jpeg.length && jpeg[p] === 0xff) {
    const marker = jpeg[p + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const len = (jpeg[p + 2] << 8) | jpeg[p + 3];
    if (marker === 0xe0 && jpeg[p + 4] === 0x4a) {
      return { units: jpeg[p + 11], x: (jpeg[p + 12] << 8) | jpeg[p + 13], y: (jpeg[p + 14] << 8) | jpeg[p + 15] };
    }
    p += 2 + len;
  }
  return null;
}
