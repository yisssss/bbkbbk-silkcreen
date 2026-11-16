/**
 * Splits an RGBA raster into an 8-bit luminance plane and an alpha plane.
 * Luminance uses Rec. 709 weights on the stored sRGB values.
 */
export function extractLumAlpha(rgba: Uint8ClampedArray, pixelCount: number) {
  const lum = new Uint8Array(pixelCount);
  const alpha = new Uint8Array(pixelCount);
  for (let i = 0, p = 0; i < pixelCount; i++, p += 4) {
    lum[i] = (rgba[p] * 0.2126 + rgba[p + 1] * 0.7152 + rgba[p + 2] * 0.0722 + 0.5) | 0;
    alpha[i] = rgba[p + 3];
  }
  return { lum, alpha };
}
