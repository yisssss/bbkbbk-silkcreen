import type { Artboard, Rect } from './types';

export const MOCKUP_SRC = {
  tshirt: `${import.meta.env.BASE_URL}assets/tshirt.png`,
  paper: `${import.meta.env.BASE_URL}assets/paper.jpg`,
} as const;

export type MockupPhoto = keyof typeof MOCKUP_SRC;

/** The photographed shirt is a 700 × 700 mm garment. The print keeps its real output size on top of it. */
export const TSHIRT_MM = 700;

/**
 * Photo rectangle in artboard millimetres.
 * The shirt is the real garment, centred on the print.
 * The postcard texture is the print area itself, composited as the canvas background.
 */
export function mockupFrame(artboard: Artboard, kind: MockupPhoto): Rect {
  if (kind === 'paper') {
    return { x: 0, y: 0, width: artboard.widthMm, height: artboard.heightMm };
  }
  return {
    x: (artboard.widthMm - TSHIRT_MM) / 2,
    y: (artboard.heightMm - TSHIRT_MM) / 2,
    width: TSHIRT_MM,
    height: TSHIRT_MM,
  };
}
