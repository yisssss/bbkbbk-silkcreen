import { writePsdUint8Array, type Layer, type Psd } from 'ag-psd/dist-es/index.js';
import { strToU8, zipSync } from 'fflate';
import { activeFrame } from '../core/defaults';
import { buildManifest, layerFileName, psdFileName, psdLayerName, zipFileName } from '../core/exportManifest';
import { injectJfifDensity } from '../core/jpeg';
import type { ProjectDoc } from '../core/types';
import { PRINT_DPI } from '../core/units';
import { useDocument } from '../state/documentStore';
import { usePreview } from '../state/uiStore';
import { printPipeline } from '../worker/pipelineClient';
import { printJobFromDoc } from './printJob';

export function saveBytes(bytes: Uint8Array, name: string, type: string) {
  const copy = bytes.slice();
  const blob = new Blob([copy.buffer as ArrayBuffer], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function currentDoc(): ProjectDoc {
  const doc = useDocument.getState().doc;
  if (!activeFrame(doc).source) throw new Error('내보낼 이미지가 없습니다.');
  return doc;
}

/** One plate, exactly the mask the halftone preview is showing. */
export async function downloadLayerPng(index: number) {
  const doc = currentDoc();
  const layer = activeFrame(doc).layers[index];
  if (!layer) throw new Error('레이어를 찾을 수 없습니다.');
  const { plates } = await printPipeline.exportPngs(printJobFromDoc(doc), [index]);
  const plate = plates[0];
  if (!plate) throw new Error('분판을 만들지 못했습니다.');
  saveBytes(plate.bytes, layerFileName(index, layer.name, layer.color), 'image/png');
}

/** Compatibility JPEG: same mask on white. Edges can turn gray; the PNG is the print file. */
export async function downloadLayerJpg(index: number) {
  const doc = currentDoc();
  const layer = activeFrame(doc).layers[index];
  if (!layer) throw new Error('레이어를 찾을 수 없습니다.');
  const { width, height, plates } = await printPipeline.exportPngs(printJobFromDoc(doc), [index]);
  const plate = plates[0];
  if (!plate) throw new Error('분판을 만들지 못했습니다.');
  const jpeg = await pngToJpeg(plate.bytes, width, height);
  saveBytes(jpeg, layerFileName(index, layer.name, layer.color).replace(/\.png$/, '.jpg'), 'image/jpeg');
}

/** One Photoshop layer per ink, transparent document, 300 PPI. */
export async function downloadPsd() {
  const doc = currentDoc();
  const layers = activeFrame(doc).layers;
  const indexes = layers.map((_, i) => i);
  const { width, height, plates } = await printPipeline.exportPngs(printJobFromDoc(doc), indexes);
  const children: Layer[] = [];
  for (const plate of plates) {
    const layer = layers[plate.index];
    children.push({
      name: psdLayerName(plate.index, layer.name, layer.color),
      left: 0,
      top: 0,
      canvas: await pngToCanvas(plate.bytes, width, height),
    });
  }
  const psd: Psd = {
    width,
    height,
    children,
    imageResources: {
      resolutionInfo: {
        horizontalResolution: PRINT_DPI,
        verticalResolution: PRINT_DPI,
        horizontalResolutionUnit: 'PPI',
        verticalResolutionUnit: 'PPI',
        widthUnit: 'Inches',
        heightUnit: 'Inches',
      },
    },
  };
  saveBytes(writePsdUint8Array(psd), psdFileName(activeFrame(doc).source?.fileName), 'image/vnd.adobe.photoshop');
}

async function pngToCanvas(png: Uint8Array, width: number, height: number): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(new Blob([pngBytes(png)], { type: 'image/png' }));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('화면 버퍼를 만들지 못했습니다.');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

async function pngToJpeg(png: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  const canvas = await pngToCanvas(png, width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('화면 버퍼를 만들지 못했습니다.');
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('JPG를 만들지 못했습니다.'))), 'image/jpeg', 0.92);
  });
  return injectJfifDensity(new Uint8Array(await blob.arrayBuffer()));
}

function pngBytes(png: Uint8Array): ArrayBuffer {
  const copy = png.slice();
  return copy.buffer as ArrayBuffer;
}

/** Every plate plus a manifest of names, ink colours and screen settings. */
export async function downloadZip() {
  const doc = currentDoc();
  const layers = activeFrame(doc).layers;
  const indexes = layers.map((_, i) => i);
  const { plates } = await printPipeline.exportPngs(printJobFromDoc(doc), indexes);
  const inkArea = usePreview.getState().print?.inkArea ?? null;
  const manifest = buildManifest(doc, inkArea);
  const entries: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
  };
  for (const plate of plates) {
    const layer = layers[plate.index];
    entries[layerFileName(plate.index, layer.name, layer.color)] = plate.bytes;
  }
  saveBytes(zipSync(entries, { level: 0 }), zipFileName(activeFrame(doc).source?.fileName), 'application/zip');
}
