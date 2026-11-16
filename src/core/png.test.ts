import { describe, expect, it } from 'vitest';
import { buildManifest, layerFileName, zipFileName } from './exportManifest';
import { createEmptyDoc } from './defaults';
import { crc32, injectPhys, pixelsPerMeter, readPhys } from './png';
import { PRINT_DPI } from './units';

/** Tiny valid PNG: signature, IHDR, IEND. */
function tinyPng(): Uint8Array {
  const ihdr = new Uint8Array(25);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, 13);
  ihdr.set([0x49, 0x48, 0x44, 0x52], 4);
  v.setUint32(8, 1);
  v.setUint32(12, 1);
  ihdr[16] = 8;
  ihdr[17] = 6;
  v.setUint32(21, crc32(ihdr.subarray(4, 21)));
  const iend = new Uint8Array([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
  const out = new Uint8Array(8 + ihdr.length + iend.length);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  out.set(ihdr, 8);
  out.set(iend, 8 + ihdr.length);
  return out;
}

describe('pHYs injection', () => {
  it('records 300 DPI in pixels per metre and keeps the file readable', () => {
    const png = injectPhys(tinyPng());
    const phys = readPhys(png);
    expect(phys).toEqual({ ppmX: pixelsPerMeter(PRINT_DPI), ppmY: pixelsPerMeter(PRINT_DPI), unit: 1 });
    expect(png[png.length - 8]).toBe(0x49);
    expect(readPhys(injectPhys(png))).toEqual(phys);
  });

  it('rejects data that is not a PNG', () => {
    expect(() => injectPhys(new Uint8Array(30))).toThrow();
  });
});

describe('export names', () => {
  it('keeps the ink colour in the file name and strips path characters', () => {
    expect(layerFileName(0, '잉크 1', '#F2C230')).toBe('01_잉크_1_F2C230.png');
    expect(layerFileName(1, 'a/b:c', '#000000')).toBe('02_abc_000000.png');
  });

  it('names the archive after the source file', () => {
    expect(zipFileName('poster.png')).toBe('poster_분판.zip');
    expect(zipFileName(undefined)).toBe('분판.zip');
  });

  it('lists every layer with its colour and screen angle', () => {
    const doc = createEmptyDoc();
    const manifest = buildManifest(doc, [0.5]);
    expect(manifest.dpi).toBe(300);
    expect(manifest.layers[0]).toMatchObject({ name: '잉크 1', color: '#1C1C1C', angleDeg: 22.5, inkArea: 0.5 });
  });
});
