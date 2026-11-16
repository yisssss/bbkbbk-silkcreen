import { describe, expect, it } from 'vitest';
import { coverPlacement } from './defaults';
import { mockupFrame, TSHIRT_MM } from './mockup';

const artboard = { widthMm: 300, heightMm: 400 };

describe('mockupFrame', () => {
  it('places a 700mm shirt centred on the print', () => {
    const f = mockupFrame(artboard, 'tshirt');
    expect(f.width).toBe(TSHIRT_MM);
    expect(f.height).toBe(TSHIRT_MM);
    expect(f.x + f.width / 2).toBeCloseTo(artboard.widthMm / 2);
    expect(f.y + f.height / 2).toBeCloseTo(artboard.heightMm / 2);
  });

  it('maps the postcard texture onto the print area', () => {
    expect(mockupFrame(artboard, 'paper')).toEqual({ x: 0, y: 0, width: 300, height: 400 });
  });
});

describe('coverPlacement', () => {
  it('covers both axes and keeps the image aspect', () => {
    const p = coverPlacement(artboard, 400, 200);
    expect(p.heightMm).toBeCloseTo(artboard.heightMm);
    expect(p.widthMm).toBeGreaterThan(artboard.widthMm);
    expect(p.widthMm / p.heightMm).toBeCloseTo(2);
    expect(p.xMm).toBeLessThan(0);
    expect(p.yMm).toBeCloseTo(0);
  });
});
