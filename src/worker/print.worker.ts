import * as Comlink from 'comlink';
import { hexToRgb } from '../core/color';
import { compositeInks, copySourceAlpha, renderCoverageGray } from '../core/composite';
import { downsampleMask, halftoneLayer, knockoutMasks, usesScreenAngle } from '../core/halftone';
import { injectPhys } from '../core/png';
import { applyCoverageLut, buildCoverageLuts, darknessOrder } from '../core/separation';
import { mmToPx, printPixelSize } from '../core/units';
import {
  overviewScale,
  type PngExport,
  type PrintApi,
  type PrintJob,
  type PrintRegion,
  type PrintTile,
  type PrintViewRequest,
  type PrintViewResult,
  type SourceMeta,
} from './protocol';
import { detectAlpha, imageDataToBitmap, rasterize, rasterKey, type BaseRaster, type RasterGeometry } from './raster';

const sources = new Map<string, ImageBitmap>();
let base: BaseRaster | null = null;
let scratch: Uint8Array | null = null;
/** Stage 4 per layer: binary halftone before knockout, keyed by everything that shapes it. */
const rawMasks = new Map<string, { key: string; data: Uint8Array }>();
/** Stage 5: the masks that get printed. Preview and export both read these. */
let final: { key: string; masks: Uint8Array[]; order: number[]; inkArea: number[] } | null = null;

function ensureBase(job: PrintJob): BaseRaster {
  const { width, height } = printPixelSize(job.artboard.widthMm, job.artboard.heightMm);
  const geometry: RasterGeometry = {
    imageId: job.imageId,
    crop: job.crop,
    placement: job.placement,
    rotation: job.rotation,
    width,
    height,
    pxPerMm: mmToPx(1),
  };
  if (base?.key === rasterKey(geometry)) return base;
  base = null;
  rawMasks.clear();
  final = null;
  base = rasterize(job.imageId ? sources.get(job.imageId) : undefined, geometry, false);
  return base;
}

function ensureMasks(job: PrintJob) {
  const t0 = performance.now();
  const b = ensureBase(job);
  const n = b.width * b.height;
  const { separation, halftone } = job;
  const luts = buildCoverageLuts(job.layers, separation, job.adjust);
  const binaryAlpha = false;
  const angled = usesScreenAngle(halftone);

  let computed = false;
  const raws = job.layers.map((layer, i) => {
    const key = JSON.stringify([
      Array.from(luts[i]),
      binaryAlpha,
      halftone,
      angled ? layer.angleDeg : 0,
      halftone.pattern === 'stochastic' ? i : 0,
    ]);
    const hit = rawMasks.get(layer.id);
    if (hit?.key === key) return hit;
    if (!scratch || scratch.length !== n) scratch = new Uint8Array(n);
    applyCoverageLut(b.lum, b.alpha, luts[i], scratch, binaryAlpha);
    const data = halftoneLayer(scratch, b.width, b.height, halftone, layer.angleDeg, i, hit?.data);
    const entry = { key, data };
    rawMasks.set(layer.id, entry);
    computed = true;
    return entry;
  });

  const order = darknessOrder(job.layers);
  const finalKey = JSON.stringify([raws.map((r) => r.key), separation.overprint, order]);
  if (computed || final?.key !== finalKey) {
    const data = raws.map((r) => r.data);
    const masks = separation.overprint ? data : knockoutMasks(data, order);
    const inkArea = masks.map((m) => {
      let inked = 0;
      for (let i = 0; i < m.length; i++) if (m[i]) inked++;
      return inked / m.length;
    });
    final = { key: finalKey, masks, order, inkArea };
  }
  return { b, final: final!, maskMs: computed ? performance.now() - t0 : 0 };
}

function clampRegion(r: PrintRegion, width: number, height: number): PrintRegion {
  const x = Math.max(0, Math.min(width - 1, Math.floor(r.x)));
  const y = Math.max(0, Math.min(height - 1, Math.floor(r.y)));
  return {
    x,
    y,
    width: Math.max(1, Math.min(width - x, Math.ceil(r.width))),
    height: Math.max(1, Math.min(height - y, Math.ceil(r.height))),
    k: Math.max(1, Math.round(r.k)),
  };
}

function renderTile(req: PrintViewRequest, b: BaseRaster, masks: Uint8Array[], order: number[], region: PrintRegion): PrintTile {
  const r = clampRegion(region, b.width, b.height);
  const ow = Math.ceil(r.width / r.k);
  const oh = Math.ceil(r.height / r.k);
  const img = new ImageData(ow, oh);
  const sample = (li: number) => downsampleMask(masks[li], b.width, r.x, r.y, r.width, r.height, r.k);
  if (req.view === 'layer') {
    const idx = Math.max(0, req.job.layers.findIndex((l) => l.id === req.soloLayerId));
    renderCoverageGray(img.data, sample(idx));
  } else {
    const covs = masks.map((_, i) => (req.visible[i] ? sample(i) : new Uint8Array(ow * oh)));
    compositeInks(
      img.data,
      covs,
      req.colors.map(hexToRgb),
      order.filter((i) => req.visible[i]),
      hexToRgb(req.transparentPaper ? req.paperColor : '#FFFFFF'),
      req.job.separation.overprint,
      req.transparentPaper,
    );
    if (!req.transparentPaper) {
      copySourceAlpha(img.data, downsampleMask(b.alpha, b.width, r.x, r.y, r.width, r.height, r.k));
    }
  }
  return { bitmap: imageDataToBitmap(img), region: r };
}

/** Black where the mask carries ink, fully transparent elsewhere. No grey, no partial alpha. */
async function encodeMaskPng(mask: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  const img = new ImageData(width, height);
  const px = img.data;
  for (let i = 0, o = 0; i < mask.length; i++, o += 4) if (mask[i]) px[o + 3] = 255;
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d')!.putImageData(img, 0, 0);
  const raw = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  return injectPhys(raw);
}

const api: PrintApi = {
  async setSource(id: string, blob: Blob): Promise<SourceMeta> {
    const bitmap = await createImageBitmap(blob);
    sources.set(id, bitmap);
    return { width: bitmap.width, height: bitmap.height, hasAlpha: detectAlpha(bitmap) };
  },

  removeSource(id: string) {
    sources.get(id)?.close();
    sources.delete(id);
    if (base?.key.includes(id)) {
      base = null;
      rawMasks.clear();
      final = null;
    }
  },

  async render(req: PrintViewRequest): Promise<PrintViewResult> {
    const t0 = performance.now();
    const { b, final: f, maskMs } = ensureMasks(req.job);
    const overviewK = overviewScale(b.width, b.height);
    const overview = req.overview
      ? renderTile(req, b, f.masks, f.order, { x: 0, y: 0, width: b.width, height: b.height, k: overviewK })
      : null;
    const detail = req.detail ? renderTile(req, b, f.masks, f.order, req.detail) : null;
    const result: PrintViewResult = {
      rev: req.rev,
      width: b.width,
      height: b.height,
      overview,
      detail,
      inkArea: f.inkArea,
      maskMs,
      ms: performance.now() - t0,
    };
    const transfers = [overview?.bitmap, detail?.bitmap].filter((x): x is ImageBitmap => !!x);
    return Comlink.transfer(result, transfers);
  },

  async exportPngs(job, layerIndexes): Promise<PngExport> {
    const { b, final: f } = ensureMasks(job);
    // Copied up front: a preview render may reuse these buffers while encoding awaits.
    const plates = [];
    for (const index of layerIndexes) {
      const mask = f.masks[index]?.slice();
      if (!mask) continue;
      plates.push({ index, bytes: await encodeMaskPng(mask, b.width, b.height) });
    }
    return Comlink.transfer({ width: b.width, height: b.height, plates }, plates.map((p) => p.bytes.buffer));
  },
};

Comlink.expose(api);
