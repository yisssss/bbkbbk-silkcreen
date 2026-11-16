import type { LengthUnit } from './types';

export const PRINT_DPI = 300;
export const MM_PER_INCH = 25.4;

export const mmToPx = (mm: number, dpi = PRINT_DPI) => (mm / MM_PER_INCH) * dpi;
export const pxToMm = (px: number, dpi = PRINT_DPI) => (px / dpi) * MM_PER_INCH;

export const mmToUnit = (mm: number, unit: LengthUnit) => (unit === 'cm' ? mm / 10 : mm);
export const unitToMm = (value: number, unit: LengthUnit) => (unit === 'cm' ? value * 10 : value);

/** Pixel size of an artboard when rendered at the fixed print resolution. */
export function printPixelSize(widthMm: number, heightMm: number) {
  return {
    width: Math.max(1, Math.round(mmToPx(widthMm))),
    height: Math.max(1, Math.round(mmToPx(heightMm))),
  };
}

/** How many source pixels land on each printed inch. */
export function effectiveDpi(sourcePx: number, printedMm: number) {
  if (printedMm <= 0) return 0;
  return sourcePx / (printedMm / MM_PER_INCH);
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const clamp01 = (v: number) => clamp(v, 0, 1);
