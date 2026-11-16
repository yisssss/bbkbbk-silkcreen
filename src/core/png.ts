import { PRINT_DPI } from './units';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** PNG CRC-32 over chunk type + data. */
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Pixels per metre for a DPI value, the unit a pHYs chunk stores. */
export const pixelsPerMeter = (dpi: number) => Math.round((dpi / 25.4) * 1000);

interface Chunk {
  type: string;
  start: number;
  end: number;
}

function chunksOf(png: Uint8Array): Chunk[] {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: Chunk[] = [];
  let p = 8;
  while (p + 12 <= png.length) {
    const len = view.getUint32(p);
    const end = p + 12 + len;
    if (end > png.length) break;
    chunks.push({ type: String.fromCharCode(png[p + 4], png[p + 5], png[p + 6], png[p + 7]), start: p, end });
    p = end;
  }
  return chunks;
}

function physChunk(dpi: number): Uint8Array {
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  const ppm = pixelsPerMeter(dpi);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4);
  view.setUint32(8, ppm);
  view.setUint32(12, ppm);
  chunk[16] = 1;
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  return chunk;
}

/**
 * Writes a pHYs chunk so the file opens at its physical print size.
 * Canvas-encoded PNGs carry no resolution, so this is inserted after IHDR.
 */
export function injectPhys(png: Uint8Array, dpi = PRINT_DPI): Uint8Array {
  if (png.length < 24 || png[0] !== 0x89 || png[1] !== 0x50) throw new Error('PNG 데이터가 아닙니다.');
  const chunks = chunksOf(png);
  const ihdr = chunks.find((c) => c.type === 'IHDR');
  if (!ihdr) throw new Error('PNG에 IHDR 청크가 없습니다.');
  const phys = physChunk(dpi);
  const kept = chunks.filter((c) => c.type !== 'pHYs');
  const out = new Uint8Array(8 + kept.reduce((n, c) => n + (c.end - c.start), 0) + phys.length);
  out.set(png.subarray(0, 8));
  let p = 8;
  for (const c of kept) {
    out.set(png.subarray(c.start, c.end), p);
    p += c.end - c.start;
    if (c === ihdr) {
      out.set(phys, p);
      p += phys.length;
    }
  }
  return out;
}

/** Reads the pHYs resolution, or null when the file has none. */
export function readPhys(png: Uint8Array): { ppmX: number; ppmY: number; unit: number } | null {
  const chunk = chunksOf(png).find((c) => c.type === 'pHYs');
  if (!chunk) return null;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { ppmX: view.getUint32(chunk.start + 8), ppmY: view.getUint32(chunk.start + 12), unit: png[chunk.start + 16] };
}
