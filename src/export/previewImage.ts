import { activeFrame } from '../core/defaults';
import { fileSlug } from '../core/exportManifest';
import { MOCKUP_SRC, mockupFrame, type MockupPhoto } from '../core/mockup';
import { mmToPx } from '../core/units';
import { useDocument } from '../state/documentStore';
import { printPreviewReady, usePreview, useUi } from '../state/uiStore';
import type { PrintTile } from '../worker/protocol';
import { saveBytes } from './download';

/** Longest side of the saved preview, in pixels. */
const MAX_SIDE = 4096;

const photos = new Map<MockupPhoto, Promise<HTMLImageElement>>();

function loadPhoto(kind: MockupPhoto): Promise<HTMLImageElement> {
  let pending = photos.get(kind);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('목업 이미지를 불러오지 못했습니다.'));
      img.src = MOCKUP_SRC[kind];
    });
    photos.set(kind, pending);
    pending.catch(() => {
      if (photos.get(kind) === pending) photos.delete(kind);
    });
  }
  return pending;
}

/** Multiply the photo by a flat color at the export size, keeping transparency and grain. */
function tintPhoto(img: HTMLImageElement, color: string, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('미리보기 이미지를 만들지 못했습니다.');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function artboardPixels(): { width: number; height: number } {
  const { doc } = useDocument.getState();
  const ui = useUi.getState();
  const preview = usePreview.getState();
  const print = ui.viewMode !== 'original' && ui.halftonePreview && printPreviewReady() ? preview.print?.overview : null;
  if (print) {
    return {
      width: Math.max(1, Math.round(print.region.width / print.region.k)),
      height: Math.max(1, Math.round(print.region.height / print.region.k)),
    };
  }
  if (preview.result) return { width: preview.result.width, height: preview.result.height };
  const artboard = activeFrame(doc).artboard;
  const long = Math.max(artboard.widthMm, artboard.heightMm);
  const pxPerMm = Math.min(mmToPx(1), 1600 / long);
  return {
    width: Math.max(1, Math.round(artboard.widthMm * pxPerMm)),
    height: Math.max(1, Math.round(artboard.heightMm * pxPerMm)),
  };
}

function drawPrint(ctx: CanvasRenderingContext2D, tile: PrintTile, originX: number, originY: number, pxPerMm: number) {
  const r = tile.region;
  const printPxPerMm = mmToPx(1);
  ctx.drawImage(
    tile.bitmap,
    0,
    0,
    r.width / r.k,
    r.height / r.k,
    originX + (r.x / printPxPerMm) * pxPerMm,
    originY + (r.y / printPxPerMm) * pxPerMm,
    (r.width / printPxPerMm) * pxPerMm,
    (r.height / printPxPerMm) * pxPerMm,
  );
}

/** The mockup the canvas is showing, without editor chrome. */
export async function downloadPreviewImage() {
  let kind = useDocument.getState().doc.preview.mockup;
  let photo = await loadPhoto(kind).catch(() => null);
  if (useDocument.getState().doc.preview.mockup !== kind) {
    kind = useDocument.getState().doc.preview.mockup;
    photo = await loadPhoto(kind).catch(() => null);
  }

  const { doc } = useDocument.getState();
  const image = activeFrame(doc);
  const ui = useUi.getState();
  const preview = usePreview.getState();
  const frame = mockupFrame(image.artboard, kind);
  const art = artboardPixels();
  let pxPerMm = art.width / image.artboard.widthMm;
  const long = Math.max(frame.width, frame.height) * pxPerMm;
  if (long > MAX_SIDE) pxPerMm *= MAX_SIDE / long;

  const width = Math.max(1, Math.round(frame.width * pxPerMm));
  const height = Math.max(1, Math.round(frame.height * pxPerMm));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('미리보기 이미지를 만들지 못했습니다.');

  if (photo) {
    const tinted = tintPhoto(photo, image.paperColor, Math.max(width, height));
    ctx.drawImage(tinted, 0, 0, width, height);
  } else {
    ctx.fillStyle = image.paperColor;
    ctx.fillRect(0, 0, width, height);
  }

  const originX = -frame.x * pxPerMm;
  const originY = -frame.y * pxPerMm;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const print = ui.viewMode !== 'original' && ui.halftonePreview && printPreviewReady() ? preview.print?.overview : null;
  if (print) drawPrint(ctx, print, originX, originY, pxPerMm);
  else if (preview.result) {
    ctx.drawImage(
      preview.result.bitmap,
      originX,
      originY,
      image.artboard.widthMm * pxPerMm,
      image.artboard.heightMm * pxPerMm,
    );
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('미리보기 이미지를 만들지 못했습니다.'))), 'image/png');
  });
  const base = fileSlug(activeFrame(doc).source?.fileName.replace(/\.[^.]+$/, '') ?? '', '미리보기');
  const label = kind === 'paper' ? '엽서' : '티셔츠';
  saveBytes(new Uint8Array(await blob.arrayBuffer()), `${base}_${label}.png`, 'image/png');
}
