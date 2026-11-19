import { extractLumAlpha } from '../core/luminance';
import { orientedSize, paintOriented } from '../core/orient';
import type { Placement, QuarterTurn, Rect } from '../core/types';

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
  rotation: QuarterTurn;
  width: number;
  height: number;
  pxPerMm: number;
}

export const rasterKey = (g: RasterGeometry) =>
  JSON.stringify([g.imageId, g.crop, g.placement, g.rotation, g.width, g.height, g.pxPerMm]);

export function rasterize(bitmap: ImageBitmap | undefined, g: RasterGeometry, keepRgba: boolean): BaseRaster {
  const { width, height, crop, placement: p, rotation, pxPerMm } = g;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  if (bitmap && crop && crop.width > 0 && crop.height > 0) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.save();
    const dx = p.xMm * pxPerMm;
    const dy = p.yMm * pxPerMm;
    const dw = p.widthMm * pxPerMm;
    const dh = p.heightMm * pxPerMm;
    ctx.beginPath();
    ctx.rect(dx, dy, dw, dh);
    ctx.clip();
    const oriented = orientedSize(bitmap.width, bitmap.height, rotation);
    const scaleX = dw / crop.width;
    const scaleY = dh / crop.height;
    paintOriented(ctx, bitmap, rotation, {
      x: dx - crop.x * scaleX,
      y: dy - crop.y * scaleY,
      width: oriented.width * scaleX,
      height: oriented.height * scaleY,
    });
    ctx.restore();
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
