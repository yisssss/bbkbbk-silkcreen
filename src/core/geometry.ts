import type { Placement, Rect } from './types';
import { clamp } from './units';

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const CORNER_HANDLES: Handle[] = ['nw', 'ne', 'se', 'sw'];
export const ALL_HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Handle anchor point as fractions of the rect (0..1). */
export const HANDLE_POS: Record<Handle, [number, number]> = {
  nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5],
  se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5],
};

export const placementToRect = (p: Placement): Rect => ({ x: p.xMm, y: p.yMm, width: p.widthMm, height: p.heightMm });
export const rectToPlacement = (r: Rect): Placement => ({ xMm: r.x, yMm: r.y, widthMm: r.width, heightMm: r.height });

/** Resizes a rect by dragging one handle; with lockRatio the opposite side stays anchored. */
export function resizeRect(start: Rect, handle: Handle, dx: number, dy: number, lockRatio: boolean, min = 1): Rect {
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;
  if (handle.includes('w')) left = Math.min(left + dx, right - min);
  if (handle.includes('e')) right = Math.max(right + dx, left + min);
  if (handle.includes('n')) top = Math.min(top + dy, bottom - min);
  if (handle.includes('s')) bottom = Math.max(bottom + dy, top + min);

  if (!lockRatio) return { x: left, y: top, width: right - left, height: bottom - top };

  const ratio = start.height / start.width;
  let w = right - left;
  let h = bottom - top;
  const horizontal = handle.includes('e') || handle.includes('w');
  const vertical = handle.includes('n') || handle.includes('s');
  if (horizontal && vertical) {
    if (Math.abs(w / start.width - 1) >= Math.abs(h / start.height - 1)) h = w * ratio;
    else w = h / ratio;
  } else if (horizontal) {
    h = w * ratio;
  } else {
    w = h / ratio;
  }
  const x = handle.includes('w') ? right - w : horizontal ? left : start.x + (start.width - w) / 2;
  const y = handle.includes('n') ? bottom - h : vertical ? top : start.y + (start.height - h) / 2;
  return { x, y, width: w, height: h };
}

/**
 * The source image is fixed on the artboard while the crop window changes;
 * `scale` is mm per source pixel and `originMm` is where source (0,0) lands.
 */
export interface CropFrame {
  scale: number;
  originX: number;
  originY: number;
}

export function cropFrameOf(crop: Rect, placement: Placement): CropFrame {
  const scale = placement.widthMm / crop.width;
  return { scale, originX: placement.xMm - crop.x * scale, originY: placement.yMm - crop.y * scale };
}

export function placementFromCrop(crop: Rect, frame: CropFrame): Placement {
  return {
    xMm: frame.originX + crop.x * frame.scale,
    yMm: frame.originY + crop.y * frame.scale,
    widthMm: crop.width * frame.scale,
    heightMm: crop.height * frame.scale,
  };
}

export function resizeCrop(start: Rect, handle: Handle, dxPx: number, dyPx: number, srcW: number, srcH: number, min = 4): Rect {
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;
  if (handle.includes('w')) left = clamp(left + dxPx, 0, right - min);
  if (handle.includes('e')) right = clamp(right + dxPx, left + min, srcW);
  if (handle.includes('n')) top = clamp(top + dyPx, 0, bottom - min);
  if (handle.includes('s')) bottom = clamp(bottom + dyPx, top + min, srcH);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function moveCrop(start: Rect, dxPx: number, dyPx: number, srcW: number, srcH: number): Rect {
  return {
    ...start,
    x: clamp(start.x + dxPx, 0, srcW - start.width),
    y: clamp(start.y + dyPx, 0, srcH - start.height),
  };
}
