import { create } from 'zustand';
import { normalizeHex } from '../core/color';
import {
  activeFrame,
  coverPlacement,
  createEmptyDoc,
  createFrame,
  createLayer,
  DEFAULT_ADJUST,
  DEFAULT_ANGLES,
  DEFAULT_HALFTONE,
  DEFAULT_WHITE_POINT,
  defaultTone,
  fitPlacement,
  MAX_IMAGES,
  MAX_PALETTE,
  relayoutLayers,
} from '../core/defaults';
import { normalizeDoc } from '../core/normalizeDoc';
import { migrateSeparation } from '../core/separation';
import type {
  Artboard,
  ColorCount,
  HalftoneSettings,
  ImageAdjust,
  ImageFrame,
  InkLayer,
  LayerTone,
  MockupKind,
  Placement,
  ProjectDoc,
  Rect,
  SeparationSettings,
} from '../core/types';
import { sources } from '../worker/pipelineClient';
import { imageRegistry } from './imageRegistry';
import { useUi } from './uiStore';

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg'];

type LayerPatch = Partial<Omit<InkLayer, 'id' | 'tone' | 'halftone'>>;

interface LoadedFile {
  id: string;
  file: File;
  meta: { width: number; height: number; hasAlpha: boolean };
}

interface IncomingSource {
  imageId: string;
  blob: Blob;
}

interface DocumentState {
  doc: ProjectDoc;
  loading: boolean;
  error: string | null;

  addImages(files: File[]): Promise<void>;
  replaceImage(file: File): Promise<void>;
  openProject(doc: ProjectDoc, incoming: IncomingSource[]): Promise<void>;
  selectImage(id: string): void;
  removeImage(id: string): void;
  clearImage(): void;
  setColorCount(count: ColorCount): void;
  updateLayer(id: string, patch: LayerPatch): void;
  updateTone(id: string, patch: Partial<LayerTone>): void;
  resetTone(id: string): void;
  resetGradient(): void;
  setAdjust(patch: Partial<ImageAdjust>): void;
  resetAdjust(): void;
  setSeparation(patch: Partial<SeparationSettings>): void;
  setHalftone(patch: Partial<HalftoneSettings>): void;
  resetHalftone(): void;
  setLayerAngle(id: string, angleDeg: number): void;
  setArtboard(patch: Partial<Artboard>): void;
  setPlacement(patch: Partial<Placement>): void;
  setLockRatio(lock: boolean): void;
  setCrop(crop: Rect, placement: Placement): void;
  resetCrop(): void;
  fitImage(): void;
  centerImage(): void;
  setPaperColor(hex: string): void;
  setMockup(mockup: MockupKind): void;
  addPaletteColor(color: string, name: string): void;
  updatePaletteColor(id: string, patch: { name?: string; color?: string }): void;
  removePaletteColor(id: string): void;
  dismissError(): void;
}

const newId = () => crypto.randomUUID();

/** Height / width of the cropped image, used to keep placement proportional. */
function cropAspect(img: ImageFrame) {
  const c = img.crop;
  return c && c.width > 0 ? c.height / c.width : img.placement.heightMm / img.placement.widthMm;
}

function fileStem(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '') || fileName;
}

function withSource(img: ImageFrame, loaded: LoadedFile): ImageFrame {
  const { file, meta, id } = loaded;
  return {
    ...img,
    name: fileStem(file.name),
    source: {
      imageId: id,
      fileName: file.name,
      mimeType: file.type,
      width: meta.width,
      height: meta.height,
      hasAlpha: meta.hasAlpha,
    },
    crop: { x: 0, y: 0, width: meta.width, height: meta.height },
    placement: fitPlacement(img.artboard, meta.width, meta.height),
  };
}

async function readFile(file: File): Promise<LoadedFile> {
  const id = newId();
  try {
    const [meta, bitmap] = await Promise.all([sources.add(id, file), createImageBitmap(file)]);
    imageRegistry.set(id, { blob: file, bitmap });
    return { id, file, meta };
  } catch (error) {
    imageRegistry.remove(id);
    sources.remove(id);
    throw error;
  }
}

function releaseImage(id: string) {
  imageRegistry.remove(id);
  sources.remove(id);
}

function leaveCropIfEmpty(doc: ProjectDoc) {
  if (!activeFrame(doc).source && useUi.getState().tool === 'crop') useUi.getState().set({ tool: 'move' });
}

/** Keep the layer highlight when the active picture's inks are a different set. */
function keepLayerSelection(doc: ProjectDoc, preferIndex = 0) {
  const layers = activeFrame(doc).layers;
  const selected = useUi.getState().selectedLayerId;
  if (selected && layers.some((l) => l.id === selected)) return;
  useUi.getState().set({ selectedLayerId: layers[preferIndex]?.id ?? layers[0]?.id ?? null });
}

export const useDocument = create<DocumentState>((set, get) => {
  const patchDoc = (fn: (doc: ProjectDoc) => Partial<ProjectDoc>) =>
    set((s) => ({ doc: { ...s.doc, ...fn(s.doc) } }));

  const patchActive = (fn: (img: ImageFrame, doc: ProjectDoc) => ImageFrame) =>
    patchDoc((d) => ({
      images: d.images.map((img) => (img.id === d.activeImageId ? fn(img, d) : img)),
    }));

  const mapLayer = (id: string, fn: (l: InkLayer) => InkLayer) =>
    patchActive((img) => ({ ...img, layers: img.layers.map((l) => (l.id === id ? fn(l) : l)) }));

  return {
    doc: createEmptyDoc(),
    loading: false,
    error: null,

    async addImages(files) {
      if (get().loading) return;
      const rejected = files.filter((file) => !ACCEPTED_TYPES.includes(file.type));
      const accepted = files.filter((file) => ACCEPTED_TYPES.includes(file.type));
      if (!accepted.length) {
        if (rejected.length) set({ error: 'PNG, JPG, JPEG 파일만 업로드할 수 있습니다.' });
        return;
      }
      const doc = get().doc;
      const active = activeFrame(doc);
      const preferLayer = Math.max(0, active.layers.findIndex((l) => l.id === useUi.getState().selectedLayerId));
      const capacity = MAX_IMAGES - doc.images.length + (active.source ? 0 : 1);
      const batch = accepted.slice(0, Math.max(0, capacity));
      if (!batch.length) {
        set({ error: `이미지는 최대 ${MAX_IMAGES}개까지 올릴 수 있습니다.` });
        return;
      }
      set({ loading: true, error: null });
      const loaded: LoadedFile[] = [];
      const failed: string[] = [];
      try {
        for (const file of batch) {
          try {
            loaded.push(await readFile(file));
          } catch (error) {
            console.error(error);
            failed.push(file.name);
          }
        }
        if (!loaded.length) {
          set({ error: '이미지를 불러오지 못했습니다. 파일이 손상되었는지 확인해 주세요.' });
          return;
        }
        let firstId = '';
        patchDoc((d) => {
          const images = d.images.map((img) => ({ ...img }));
          let cursor = 0;
          const currentIndex = images.findIndex((img) => img.id === d.activeImageId);
          const current = images[currentIndex];
          if (current && !current.source) {
            const next = withSource(current, loaded[cursor]);
            images[currentIndex] = next;
            firstId = next.id;
            cursor += 1;
          }
          const template = images[currentIndex] ?? images[0];
          for (; cursor < loaded.length; cursor++) {
            const next = withSource(createFrame(images.length, template), loaded[cursor]);
            if (!firstId) firstId = next.id;
            images.push(next);
          }
          return { images, activeImageId: firstId || d.activeImageId };
        });
        keepLayerSelection(get().doc, preferLayer);
        const notes: string[] = [];
        if (rejected.length) notes.push('PNG, JPG, JPEG가 아닌 파일은 제외했습니다.');
        if (accepted.length > batch.length) notes.push(`이미지는 최대 ${MAX_IMAGES}개까지라 나머지는 추가하지 않았습니다.`);
        if (failed.length) notes.push(`불러오지 못한 파일: ${failed.join(', ')}`);
        if (notes.length) set({ error: notes.join(' ') });
      } finally {
        set({ loading: false });
      }
    },

    async replaceImage(file) {
      if (get().loading) return;
      if (!ACCEPTED_TYPES.includes(file.type)) {
        set({ error: 'PNG, JPG, JPEG 파일만 업로드할 수 있습니다.' });
        return;
      }
      set({ loading: true, error: null });
      const prevId = activeFrame(get().doc).source?.imageId;
      try {
        const loaded = await readFile(file);
        patchActive((img) => withSource(img, loaded));
        if (prevId && prevId !== loaded.id) releaseImage(prevId);
      } catch (error) {
        console.error(error);
        set({ error: '이미지를 불러오지 못했습니다. 파일이 손상되었는지 확인해 주세요.' });
      } finally {
        set({ loading: false });
      }
    },

    async openProject(doc, incoming) {
      if (get().loading) return;
      set({ loading: true, error: null });
      const prevIds = get().doc.images.flatMap((img) => (img.source ? [img.source.imageId] : []));
      const added: string[] = [];
      try {
        let next = normalizeDoc(migrateSeparation(doc));
        const byId = new Map(incoming.map((item) => [item.imageId, item.blob]));
        const images: ImageFrame[] = [];
        for (const img of next.images) {
          if (!img.source) {
            images.push(img);
            continue;
          }
          const blob = byId.get(img.source.imageId);
          if (!blob) throw new Error(`「${img.name}」 원본 이미지를 찾지 못했습니다.`);
          const typed = blob.type ? blob : new Blob([blob], { type: img.source.mimeType });
          const [meta, bitmap] = await Promise.all([sources.add(img.source.imageId, typed), createImageBitmap(typed)]);
          imageRegistry.get(img.source.imageId)?.bitmap.close();
          imageRegistry.set(img.source.imageId, { blob: typed, bitmap });
          added.push(img.source.imageId);
          images.push({
            ...img,
            source: { ...img.source, width: meta.width, height: meta.height, hasAlpha: meta.hasAlpha },
          });
        }
        next = { ...next, images };
        set({ doc: next });
        leaveCropIfEmpty(next);
        for (const id of prevIds) {
          if (!images.some((img) => img.source?.imageId === id)) releaseImage(id);
        }
      } catch (error) {
        console.error(error);
        for (const id of added) {
          if (!prevIds.includes(id)) releaseImage(id);
        }
        set({ error: error instanceof Error ? error.message : '프로젝트를 열지 못했습니다.' });
      } finally {
        set({ loading: false });
      }
    },

    selectImage(id) {
      const doc = get().doc;
      if (!doc.images.some((img) => img.id === id) || doc.activeImageId === id) return;
      const prev = activeFrame(doc);
      const next = doc.images.find((img) => img.id === id)!;
      const preferLayer = Math.max(0, prev.layers.findIndex((l) => l.id === useUi.getState().selectedLayerId));
      const sizeChanged =
        prev.artboard.widthMm !== next.artboard.widthMm || prev.artboard.heightMm !== next.artboard.heightMm;
      patchDoc(() => ({ activeImageId: id }));
      keepLayerSelection(get().doc, preferLayer);
      if (sizeChanged) useUi.getState().requestFit();
      leaveCropIfEmpty(get().doc);
    },

    removeImage(id) {
      const doc = get().doc;
      const img = doc.images.find((item) => item.id === id);
      if (!img) return;
      if (doc.images.length === 1) {
        get().clearImage();
        return;
      }
      const index = doc.images.findIndex((item) => item.id === id);
      const images = doc.images.filter((item) => item.id !== id);
      const activeImageId = doc.activeImageId === id ? images[Math.max(0, index - 1)].id : doc.activeImageId;
      patchDoc(() => ({ images, activeImageId }));
      keepLayerSelection(get().doc);
      if (img.source) releaseImage(img.source.imageId);
      leaveCropIfEmpty(get().doc);
    },

    clearImage() {
      const id = activeFrame(get().doc).source?.imageId;
      if (id) releaseImage(id);
      patchActive((img) => ({
        ...img,
        source: null,
        crop: null,
        placement: fitPlacement(img.artboard, 3, 4),
      }));
      leaveCropIfEmpty(get().doc);
    },

    setColorCount(count) {
      patchActive((img) => ({
        ...img,
        layers: img.layers.length ? relayoutLayers(img.layers, count) : [createLayer(0, count)],
      }));
      keepLayerSelection(get().doc);
    },

    updateLayer(id, patch) {
      mapLayer(id, (l) => ({ ...l, ...patch }));
    },

    updateTone(id, patch) {
      mapLayer(id, (l) => ({ ...l, tone: { ...l.tone, ...patch } }));
    },

    resetTone(id) {
      const layers = activeFrame(get().doc).layers;
      const index = layers.findIndex((l) => l.id === id);
      mapLayer(id, (l) => ({ ...l, tone: defaultTone(index, layers.length) }));
    },

    resetGradient() {
      patchActive((img) => ({
        ...img,
        separation: { ...img.separation, whitePoint: DEFAULT_WHITE_POINT },
        layers: img.layers.map((l, i) => ({ ...l, tone: defaultTone(i, img.layers.length) })),
      }));
    },

    setAdjust(patch) {
      patchActive((img) => ({ ...img, adjust: { ...img.adjust, ...patch } }));
    },

    resetAdjust() {
      patchActive((img) => ({ ...img, adjust: { ...DEFAULT_ADJUST } }));
    },

    setSeparation(patch) {
      patchActive((img) => ({ ...img, separation: { ...img.separation, ...patch } }));
    },

    setHalftone(patch) {
      patchActive((img) => {
        const next = { ...img.halftone, ...patch };
        if (next.minDotPct > next.maxDotPct) {
          if (patch.minDotPct !== undefined) next.maxDotPct = next.minDotPct;
          else next.minDotPct = next.maxDotPct;
        }
        return { ...img, halftone: next };
      });
    },

    resetHalftone() {
      patchActive((img) => ({
        ...img,
        halftone: { ...DEFAULT_HALFTONE },
        layers: img.layers.map((l, i) => ({ ...l, halftone: { ...l.halftone, angleDeg: DEFAULT_ANGLES[i] ?? 22.5 } })),
      }));
    },

    setLayerAngle(id, angleDeg) {
      mapLayer(id, (l) => ({ ...l, halftone: { ...l.halftone, angleDeg } }));
    },

    setArtboard(patch) {
      patchActive((img) => ({ ...img, artboard: { ...img.artboard, ...patch } }));
    },

    setPlacement(patch) {
      patchActive((img) => {
        const next = { ...img.placement, ...patch };
        if (img.lockRatio) {
          const aspect = cropAspect(img);
          if (patch.widthMm !== undefined && patch.heightMm === undefined) next.heightMm = next.widthMm * aspect;
          if (patch.heightMm !== undefined && patch.widthMm === undefined) next.widthMm = next.heightMm / aspect;
        }
        next.widthMm = Math.max(1, next.widthMm);
        next.heightMm = Math.max(1, next.heightMm);
        return { ...img, placement: next };
      });
    },

    setLockRatio(lockRatio) {
      patchActive((img) => {
        if (!lockRatio) return { ...img, lockRatio };
        const p = img.placement;
        return { ...img, lockRatio, placement: { ...p, heightMm: p.widthMm * cropAspect(img) } };
      });
    },

    setCrop(crop, placement) {
      patchActive((img) => ({ ...img, crop, placement }));
    },

    resetCrop() {
      patchActive((img) => {
        if (!img.source || !img.crop) return img;
        const { width, height } = img.source;
        const scale = img.placement.widthMm / img.crop.width;
        const originX = img.placement.xMm - img.crop.x * scale;
        const originY = img.placement.yMm - img.crop.y * scale;
        return {
          ...img,
          crop: { x: 0, y: 0, width, height },
          placement: { xMm: originX, yMm: originY, widthMm: width * scale, heightMm: height * scale },
        };
      });
    },

    fitImage() {
      patchActive((img) => (img.crop ? { ...img, placement: coverPlacement(img.artboard, img.crop.width, img.crop.height) } : img));
    },

    centerImage() {
      patchActive((img) => ({
        ...img,
        placement: {
          ...img.placement,
          xMm: (img.artboard.widthMm - img.placement.widthMm) / 2,
          yMm: (img.artboard.heightMm - img.placement.heightMm) / 2,
        },
      }));
    },

    setPaperColor(paperColor) {
      patchActive((img) => ({ ...img, paperColor }));
    },

    setMockup(mockup) {
      patchDoc((d) => ({ preview: { ...d.preview, mockup } }));
    },

    addPaletteColor(color, name) {
      const hex = normalizeHex(color);
      if (!hex) return;
      if (get().doc.palette.length >= MAX_PALETTE) {
        set({ error: `색상 라이브러리는 최대 ${MAX_PALETTE}개까지입니다.` });
        return;
      }
      const label = name.trim().slice(0, 40) || hex;
      patchDoc((d) => ({ palette: [...d.palette, { id: newId(), name: label, color: hex }] }));
    },

    updatePaletteColor(id, patch) {
      patchDoc((d) => ({
        palette: d.palette.map((swatch) => {
          if (swatch.id !== id) return swatch;
          const color = patch.color !== undefined ? (normalizeHex(patch.color) ?? swatch.color) : swatch.color;
          const name = patch.name !== undefined ? patch.name.trim().slice(0, 40) || swatch.name : swatch.name;
          return { ...swatch, color, name };
        }),
      }));
    },

    removePaletteColor(id) {
      patchDoc((d) => ({ palette: d.palette.filter((swatch) => swatch.id !== id) }));
    },

    dismissError() {
      set({ error: null });
    },
  };
});
