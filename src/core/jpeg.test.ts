import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { packProject, projectFileName, unpackProject } from '../export/projectFile';
import { activeFrame, createEmptyDoc, createFrame } from './defaults';
import { injectJfifDensity, readJfifDensity } from './jpeg';

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
  it('round-trips every picture and the original bytes', () => {
    const doc = createEmptyDoc();
    const second = createFrame(1, activeFrame(doc));
    second.artboard = { widthMm: 100, heightMm: 100 };
    second.paperColor = '#E8432E';
    second.halftone = { ...second.halftone, lpi: 30 };
    second.source = {
      imageId: 'img-2',
      fileName: 'back.jpg',
      mimeType: 'image/jpeg',
      width: 4,
      height: 4,
      hasAlpha: false,
    };
    doc.images = [
      {
        ...doc.images[0],
        source: {
          imageId: 'img-1',
          fileName: 'poster.png',
          mimeType: 'image/png',
          width: 10,
          height: 20,
          hasAlpha: true,
        },
      },
      second,
    ];
    const unpacked = unpackProject(
      packProject(doc, { 'img-1': new Uint8Array([1, 2, 3, 4]), 'img-2': new Uint8Array([7, 7]) }),
    );
    expect(unpacked.doc.images.map((img) => img.source?.fileName)).toEqual(['poster.png', 'back.jpg']);
    expect(unpacked.doc.images.map((img) => img.layers)).toHaveLength(2);
    expect(unpacked.doc.images[0].layers).toHaveLength(1);
    expect(unpacked.doc.images[1].artboard).toEqual({ widthMm: 100, heightMm: 100 });
    expect(unpacked.doc.images[1].paperColor).toBe('#E8432E');
    expect(unpacked.doc.images[1].halftone.lpi).toBe(30);
    expect(unpacked.doc.images[0].artboard).toEqual(activeFrame(doc).artboard);
    expect(unpacked.doc.images[0].paperColor).toBe('#FFFFFF');
    expect(unpacked.doc.palette.length).toBe(doc.palette.length);
    expect(unpacked.sources.map((item) => [...item.bytes])).toEqual([
      [1, 2, 3, 4],
      [7, 7],
    ]);
  });

  it('opens a project saved before image tabs', () => {
    const fresh = createEmptyDoc();
    const frame = activeFrame(fresh);
    const legacy = {
      version: 1,
      source: {
        imageId: 'img-1',
        fileName: 'poster.png',
        mimeType: 'image/png',
        width: 10,
        height: 20,
        hasAlpha: true,
      },
      crop: { x: 1, y: 2, width: 8, height: 9 },
      artboard: frame.artboard,
      placement: { xMm: 3, yMm: 4, widthMm: 50, heightMm: 60 },
      lockRatio: false,
      adjust: { brightness: 12, contrast: -3, gamma: 1.2 },
      separation: frame.separation,
      halftone: frame.halftone,
      layers: frame.layers,
      preview: { paperColor: '#ABCDEF', mockup: fresh.preview.mockup },
    };
    const packed = zipSync({
      'project.json': strToU8(JSON.stringify(legacy)),
      'source.png': new Uint8Array([9, 9]),
    });
    const unpacked = unpackProject(packed);
    const image = activeFrame(unpacked.doc);
    expect(unpacked.doc.images).toHaveLength(1);
    expect(image.source?.fileName).toBe('poster.png');
    expect(image.adjust).toEqual({ brightness: 12, contrast: -3, gamma: 1.2 });
    expect(image.lockRatio).toBe(false);
    expect(image.crop).toEqual({ x: 1, y: 2, width: 8, height: 9 });
    expect(image.placement).toEqual({ xMm: 3, yMm: 4, widthMm: 50, heightMm: 60 });
    expect(image.artboard).toEqual(frame.artboard);
    expect(image.paperColor).toBe('#ABCDEF');
    expect(image.layers).toHaveLength(1);
    expect(unpacked.doc.palette.map((swatch) => swatch.name)).toContain('빨강');
    expect([...unpacked.sources[0].bytes]).toEqual([9, 9]);
  });

  it('gives every tab its own copy of print settings saved once for the file', () => {
    const fresh = createEmptyDoc();
    const frame = activeFrame(fresh);
    const saved = {
      version: 1,
      images: [
        { id: 'a', name: '하나', source: null, crop: null, placement: frame.placement, lockRatio: true, adjust: frame.adjust },
        { id: 'b', name: '둘', source: null, crop: null, placement: frame.placement, lockRatio: true, adjust: frame.adjust },
      ],
      activeImageId: 'b',
      artboard: { widthMm: 120, heightMm: 80 },
      separation: { overprint: false, whitePoint: 12 },
      halftone: { ...frame.halftone, lpi: 30 },
      layers: frame.layers,
      preview: { paperColor: '#112233', mockup: 'tshirt' },
      palette: fresh.palette,
    };
    const unpacked = unpackProject(zipSync({ 'project.json': strToU8(JSON.stringify(saved)) }));
    expect(unpacked.doc.activeImageId).toBe('b');
    expect(unpacked.doc.preview.mockup).toBe('tshirt');
    expect(unpacked.doc.images.map((img) => img.paperColor)).toEqual(['#112233', '#112233']);
    expect(unpacked.doc.images.map((img) => img.artboard)).toEqual([
      { widthMm: 120, heightMm: 80 },
      { widthMm: 120, heightMm: 80 },
    ]);
    expect(unpacked.doc.images[1].halftone.lpi).toBe(30);
    expect(unpacked.doc.images[0].separation).toEqual({ overprint: false, whitePoint: 12 });
    expect(unpacked.doc.images[0].layers).not.toBe(unpacked.doc.images[1].layers);
    unpacked.doc.images[0].layers[0].color = '#000000';
    expect(unpacked.doc.images[1].layers[0].color).not.toBe('#000000');
  });

  it('names the file after the source', () => {
    expect(projectFileName('My Poster.png')).toBe('My_Poster.bbk');
    expect(projectFileName(undefined)).toBe('프로젝트.bbk');
  });
});
