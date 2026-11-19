import type { Placement, QuarterTurn, Rect } from './types';

export function orientedSize(width: number, height: number, rotation: QuarterTurn) {
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };
}

export function nextQuarter(rotation: QuarterTurn, clockwise: boolean): QuarterTurn {
  return ((rotation + (clockwise ? 90 : 270)) % 360) as QuarterTurn;
}

/** Crop rectangle after a quarter turn. `width` and `height` are the size before the turn. */
export function turnCrop(crop: Rect, width: number, height: number, clockwise: boolean): Rect {
  if (clockwise) {
    return {
      x: height - (crop.y + crop.height),
      y: crop.x,
      width: crop.height,
      height: crop.width,
    };
  }
  return {
    x: crop.y,
    y: width - (crop.x + crop.width),
    width: crop.height,
    height: crop.width,
  };
}

/** Swaps the print box around its centre, matching a 90° turn. */
export function turnPlacement(placement: Placement): Placement {
  const cx = placement.xMm + placement.widthMm / 2;
  const cy = placement.yMm + placement.heightMm / 2;
  return {
    xMm: cx - placement.heightMm / 2,
    yMm: cy - placement.widthMm / 2,
    widthMm: placement.heightMm,
    heightMm: placement.widthMm,
  };
}

type Drawable = CanvasImageSource & { width: number; height: number };
type DrawCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Draws the source so `rotation` is upright inside `dest`. */
export function paintOriented(ctx: DrawCtx, bitmap: Drawable, rotation: QuarterTurn, dest: Rect) {
  const oriented = orientedSize(bitmap.width, bitmap.height, rotation);
  ctx.save();
  ctx.translate(dest.x, dest.y);
  ctx.scale(dest.width / oriented.width, dest.height / oriented.height);
  if (rotation === 90) {
    ctx.translate(bitmap.height, 0);
    ctx.rotate(Math.PI / 2);
  } else if (rotation === 180) {
    ctx.translate(bitmap.width, bitmap.height);
    ctx.rotate(Math.PI);
  } else if (rotation === 270) {
    ctx.translate(0, bitmap.width);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.drawImage(bitmap, 0, 0);
  ctx.restore();
}
