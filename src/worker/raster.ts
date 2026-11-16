import { extractLumAlpha } from '../core/luminance';
import type { Placement, Rect } from '../core/types';

/** Stage 1+2: the transformed source on the artboard, split into luminance and alpha. */
export interface BaseRaster {
  key: string;
  width: number;
  height: number;
  /** Only kept when a view needs the original colours. */
  rgba: Uint8ClampedArray | null;
  lum: Uint8Array;
  alpha: Uint8Array;
}

export interface RasterGeometry {
  imageId: string | null;
  crop: Rect | null;
  placement: Placement;
  width: number;
  height: number;
  pxPerMm: number;
}

export const rasterKey = (g: RasterGeometry) =>
  JSON.stringify([g.imageId, g.crop, g.placement, g.width, g.height, g.pxPerMm]);

export function rasterize(bitmap: ImageBitmap | undefined, g: RasterGeometry, keepRgba: boolean): BaseRaster {
  const { width, height, crop, placement: p, pxPerMm } = g;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  if (bitmap && crop && crop.width > 0 && crop.height > 0) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      bitmap,
      crop.x, crop.y, crop.width, crop.height,
      p.xMm * pxPerMm, p.yMm * pxPerMm, p.widthMm * pxPerMm, p.heightMm * pxPerMm,
    );
  }
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const { lum, alpha } = extractLumAlpha(rgba, width * height);
  return { key: rasterKey(g), width, height, rgba: keepRgba ? rgba : null, lum, alpha };
}

export function detectAlpha(bitmap: ImageBitmap): boolean {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

export function imageDataToBitmap(img: ImageData): ImageBitmap {
  const canvas = new OffscreenCanvas(img.width, img.height);
  canvas.getContext('2d')!.putImageData(img, 0, 0);
  return canvas.transferToImageBitmap();
}
