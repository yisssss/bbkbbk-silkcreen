import { describe, expect, it } from 'vitest';
import { nextQuarter, orientedSize, turnCrop, turnPlacement } from './orient';
import type { QuarterTurn } from './types';

describe('quarter turns', () => {
  const crop = { x: 10, y: 5, width: 20, height: 8 };

  it('rotates a crop clockwise and back without changing the pixels it covers', () => {
    const once = turnCrop(crop, 100, 50, true);
    expect(once).toEqual({ x: 37, y: 10, width: 8, height: 20 });
    expect(turnCrop(once, 50, 100, false)).toEqual(crop);
  });

  it('steps through every quarter and returns to the start', () => {
    let rotation: QuarterTurn = 0;
    let box = crop;
    let width = 100;
    let height = 40;
    for (let i = 0; i < 4; i++) {
      box = turnCrop(box, width, height, true);
      const swapped = orientedSize(width, height, 90);
      width = swapped.width;
      height = swapped.height;
      rotation = nextQuarter(rotation, true);
    }
    expect(rotation).toBe(0);
    expect(box).toEqual(crop);
  });

  it('keeps the print box centred when its sides swap', () => {
    expect(turnPlacement({ xMm: 10, yMm: 20, widthMm: 40, heightMm: 10 })).toEqual({
      xMm: 25,
      yMm: 5,
      widthMm: 10,
      heightMm: 40,
    });
  });
});
