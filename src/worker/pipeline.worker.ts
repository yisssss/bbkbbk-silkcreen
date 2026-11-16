import * as Comlink from 'comlink';
import { hexToRgb } from '../core/color';
import { compositeInks, copySourceAlpha, renderCoverageGray, renderOriginal } from '../core/composite';
import { applyCoverageLut, buildCoverageLuts, darknessOrder } from '../core/separation';
import { buildAdjustLut } from '../core/tone';
import type { PipelineApi, RenderRequest, RenderResult, SourceMeta } from './protocol';
import { detectAlpha, imageDataToBitmap, rasterize, rasterKey, type BaseRaster, type RasterGeometry } from './raster';

const sources = new Map<string, ImageBitmap>();

let base: BaseRaster | null = null;
/** Stage 3 coverage per layer, keyed by layer id + its lookup table; invalidated when the base raster changes. */
const coverageCache = new Map<string, { key: string; data: Uint8Array }>();

function getBase(req: RenderRequest): BaseRaster {
  const geometry: RasterGeometry = {
    imageId: req.imageId,
    crop: req.crop,
    placement: req.placement,
    width: Math.max(1, Math.round(req.artboard.widthMm * req.pxPerMm)),
    height: Math.max(1, Math.round(req.artboard.heightMm * req.pxPerMm)),
    pxPerMm: req.pxPerMm,
  };
  if (base?.key === rasterKey(geometry)) return base;
  base = rasterize(req.imageId ? sources.get(req.imageId) : undefined, geometry, true);
  coverageCache.clear();
  return base;
}

function getCoverage(b: BaseRaster, layerId: string, lut: Uint8Array, binaryAlpha: boolean): Uint8Array {
  const key = `${binaryAlpha ? 1 : 0}:${lut.join(',')}`;
  const hit = coverageCache.get(layerId);
  if (hit?.key === key) return hit.data;
  const data = applyCoverageLut(b.lum, b.alpha, lut, hit?.data, binaryAlpha);
  coverageCache.set(layerId, { key, data });
  return data;
}

function makeThumb(coverage: Uint8Array, b: BaseRaster, ink: [number, number, number], thumbWidth: number) {
  const tw = Math.max(1, Math.min(thumbWidth, b.width));
  const th = Math.max(1, Math.round((b.height / b.width) * tw));
  const img = new ImageData(tw, th);
  const sx = b.width / tw;
  const sy = b.height / th;
  for (let y = 0, o = 0; y < th; y++) {
    const row = Math.min(b.height - 1, Math.floor((y + 0.5) * sy)) * b.width;
    for (let x = 0; x < tw; x++, o += 4) {
      const c = coverage[row + Math.min(b.width - 1, Math.floor((x + 0.5) * sx))] / 255;
      img.data[o] = 255 + (ink[0] - 255) * c;
      img.data[o + 1] = 255 + (ink[1] - 255) * c;
      img.data[o + 2] = 255 + (ink[2] - 255) * c;
      img.data[o + 3] = 255;
    }
  }
  let inked = 0;
  for (let i = 0; i < coverage.length; i++) if (coverage[i] > 0) inked++;
  return { bitmap: imageDataToBitmap(img), inkArea: inked / coverage.length };
}

const api: PipelineApi = {
  async setSource(id: string, blob: Blob): Promise<SourceMeta> {
    const bitmap = await createImageBitmap(blob);
    sources.set(id, bitmap);
    return { width: bitmap.width, height: bitmap.height, hasAlpha: detectAlpha(bitmap) };
  },

  removeSource(id: string) {
    sources.get(id)?.close();
    sources.delete(id);
    if (base?.key.includes(id)) base = null;
  },

  async render(req: RenderRequest): Promise<RenderResult> {
    const t0 = performance.now();
    const b = getBase(req);
    const { separation, adjust } = req;
    const luts = buildCoverageLuts(req.layers, separation, adjust);
    const coverages = req.layers.map((l, i) => getCoverage(b, l.id, luts[i], false));
    const order = darknessOrder(req.layers);
    const plainPaper = !req.transparentPaper && req.view === 'composite';
    const paper = hexToRgb(plainPaper ? '#FFFFFF' : req.paperColor);
    const inks = req.layers.map((l) => hexToRgb(l.color));

    const img = new ImageData(b.width, b.height);
    if (req.view === 'original') {
      renderOriginal(img.data, b.rgba!, paper, buildAdjustLut(adjust), req.transparentPaper);
    } else if (req.view === 'layer') {
      const idx = Math.max(0, req.layers.findIndex((l) => l.id === req.soloLayerId));
      renderCoverageGray(img.data, coverages[idx]);
    } else {
      const printOrder = order.filter((i) => req.layers[i].visible);
      compositeInks(img.data, coverages, inks, printOrder, paper, separation.overprint, req.transparentPaper);
      if (plainPaper) copySourceAlpha(img.data, b.alpha);
    }
    const bitmap = imageDataToBitmap(img);

    const thumbs = req.layers.map((l, i) => ({ id: l.id, ...makeThumb(coverages[i], b, inks[i], req.thumbWidth) }));

    const result: RenderResult = {
      bitmap,
      width: b.width,
      height: b.height,
      pxPerMm: req.pxPerMm,
      thumbs,
      ms: performance.now() - t0,
    };
    return Comlink.transfer(result, [bitmap, ...thumbs.map((t) => t.bitmap)]);
  },
};

Comlink.expose(api);
