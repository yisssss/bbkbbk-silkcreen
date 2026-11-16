import { describe, expect, it } from 'vitest';
import { createEmptyDoc } from './defaults';
import { injectJfifDensity, readJfifDensity } from './jpeg';
import { packProject, projectFileName, unpackProject } from '../export/projectFile';

/** SOI + a minimal JFIF APP0 + EOI. */
function tinyJpeg(): Uint8Array {
  const app0 = new Uint8Array([
    0xff, 0xe0, 0x00, 0x10,
    0x4a, 0x46, 0x49, 0x46, 0x00,
    0x01, 0x01, 0x00,
    0x00, 0x01, 0x00, 0x01,
    0x00, 0x00,
  ]);
  const out = new Uint8Array(2 + app0.length + 2);
  out[0] = 0xff;
  out[1] = 0xd8;
  out.set(app0, 2);
  out[out.length - 2] = 0xff;
  out[out.length - 1] = 0xd9;
  return out;
}

describe('JFIF density', () => {
  it('writes 300 DPI', () => {
    const jpeg = injectJfifDensity(tinyJpeg());
    expect(readJfifDensity(jpeg)).toEqual({ units: 1, x: 300, y: 300 });
  });
});

describe('project file', () => {
  it('round-trips the document and the original bytes', () => {
    const doc = createEmptyDoc();
    doc.source = {
      imageId: 'img-1',
      fileName: 'poster.png',
      mimeType: 'image/png',
      width: 10,
      height: 20,
      hasAlpha: true,
    };
    const source = new Uint8Array([1, 2, 3, 4]);
    const unpacked = unpackProject(packProject(doc, source));
    expect(unpacked.doc.source?.fileName).toBe('poster.png');
    expect(unpacked.doc.layers).toHaveLength(1);
    expect([...(unpacked.source ?? [])]).toEqual([1, 2, 3, 4]);
  });

  it('names the file after the source', () => {
    expect(projectFileName('My Poster.png')).toBe('My_Poster.bbk');
    expect(projectFileName(undefined)).toBe('프로젝트.bbk');
  });
});
