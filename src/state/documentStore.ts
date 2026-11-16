import { create } from 'zustand';
import {
  createEmptyDoc,
  createLayer,
  DEFAULT_ADJUST,
  DEFAULT_ANGLES,
  DEFAULT_HALFTONE,
  DEFAULT_WHITE_POINT,
  defaultTone,
  coverPlacement,
  fitPlacement,
  relayoutLayers,
} from '../core/defaults';
import type {
  Artboard,
  ColorCount,
  HalftoneSettings,
  ImageAdjust,
  InkLayer,
  MockupKind,
  LayerTone,
  Placement,
  ProjectDoc,
  Rect,
  SeparationSettings,
} from '../core/types';
import { sources } from '../worker/pipelineClient';
import { imageRegistry } from './imageRegistry';

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg'];

type LayerPatch = Partial<Omit<InkLayer, 'id' | 'tone' | 'halftone'>>;

interface DocumentState {
  doc: ProjectDoc;
  loading: boolean;
  error: string | null;

  loadImage(file: File): Promise<void>;
  openProject(doc: ProjectDoc, source: Blob | null): Promise<void>;
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
  dismissError(): void;
}

const newId = () => crypto.randomUUID();

/** Height / width of the cropped image, used to keep placement proportional. */
function cropAspect(doc: ProjectDoc) {
  const c = doc.crop;
  return c && c.width > 0 ? c.height / c.width : doc.placement.heightMm / doc.placement.widthMm;
}

export const useDocument = create<DocumentState>((set, get) => {
  const patchDoc = (fn: (doc: ProjectDoc) => Partial<ProjectDoc>) =>
    set((s) => ({ doc: { ...s.doc, ...fn(s.doc) } }));

  const mapLayer = (id: string, fn: (l: InkLayer) => InkLayer) =>
    patchDoc((d) => ({ layers: d.layers.map((l) => (l.id === id ? fn(l) : l)) }));

  return {
    doc: createEmptyDoc(),
    loading: false,
    error: null,

    async loadImage(file) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        set({ error: 'PNG, JPG, JPEG 파일만 업로드할 수 있습니다.' });
        return;
      }
      set({ loading: true, error: null });
      const id = newId();
      try {
        const [meta, bitmap] = await Promise.all([sources.add(id, file), createImageBitmap(file)]);
        const prevId = get().doc.source?.imageId;
        imageRegistry.set(id, { blob: file, bitmap });
        patchDoc((d) => ({
          source: {
            imageId: id,
            fileName: file.name,
            mimeType: file.type,
            width: meta.width,
            height: meta.height,
            hasAlpha: meta.hasAlpha,
          },
          crop: { x: 0, y: 0, width: meta.width, height: meta.height },
          placement: fitPlacement(d.artboard, meta.width, meta.height),
        }));
        if (prevId) {
          imageRegistry.remove(prevId);
          sources.remove(prevId);
        }
      } catch (e) {
        console.error(e);
        set({ error: '이미지를 불러오지 못했습니다. 파일이 손상되었는지 확인해 주세요.' });
      } finally {
        set({ loading: false });
      }
    },

    async openProject(doc, source) {
      set({ loading: true, error: null });
      const prevId = get().doc.source?.imageId;
      let added: string | null = null;
      try {
        let next = doc;
        if (doc.source) {
          if (!source) throw new Error('프로젝트에 원본 이미지가 없습니다.');
          const id = doc.source.imageId;
          const blob = source.type ? source : new Blob([source], { type: doc.source.mimeType });
          const [meta, bitmap] = await Promise.all([sources.add(id, blob), createImageBitmap(blob)]);
          imageRegistry.get(id)?.bitmap.close();
          imageRegistry.set(id, { blob, bitmap });
          added = id;
          next = {
            ...doc,
            source: { ...doc.source, width: meta.width, height: meta.height, hasAlpha: meta.hasAlpha },
          };
        }
        if ((next.preview.mockup as string) === 'transparent' || (next.preview.mockup as string) === 'none') {
          next = { ...next, preview: { ...next.preview, mockup: 'tshirt' } };
        }
        set({ doc: next });
        if (prevId && prevId !== next.source?.imageId) {
          imageRegistry.remove(prevId);
          sources.remove(prevId);
        }
      } catch (e) {
        console.error(e);
        if (added && added !== prevId) {
          imageRegistry.remove(added);
          sources.remove(added);
        }
        set({ error: e instanceof Error ? e.message : '프로젝트를 열지 못했습니다.' });
      } finally {
        set({ loading: false });
      }
    },

    clearImage() {
      const id = get().doc.source?.imageId;
      if (id) {
        imageRegistry.remove(id);
        sources.remove(id);
      }
      patchDoc((d) => ({ source: null, crop: null, placement: fitPlacement(d.artboard, 3, 4) }));
    },

    setColorCount(count) {
      patchDoc((d) => ({
        layers: d.layers.length ? relayoutLayers(d.layers, count) : [createLayer(0, count)],
      }));
    },

    updateLayer(id, patch) {
      mapLayer(id, (l) => ({ ...l, ...patch }));
    },

    updateTone(id, patch) {
      mapLayer(id, (l) => ({ ...l, tone: { ...l.tone, ...patch } }));
    },

    resetTone(id) {
      const layers = get().doc.layers;
      const index = layers.findIndex((l) => l.id === id);
      mapLayer(id, (l) => ({ ...l, tone: defaultTone(index, layers.length) }));
    },

    resetGradient() {
      patchDoc((d) => ({
        separation: { ...d.separation, whitePoint: DEFAULT_WHITE_POINT },
        layers: d.layers.map((l, i) => ({ ...l, tone: defaultTone(i, d.layers.length) })),
      }));
    },

    setAdjust(patch) {
      patchDoc((d) => ({ adjust: { ...d.adjust, ...patch } }));
    },

    resetAdjust() {
      patchDoc(() => ({ adjust: { ...DEFAULT_ADJUST } }));
    },

    setSeparation(patch) {
      patchDoc((d) => ({ separation: { ...d.separation, ...patch } }));
    },

    setHalftone(patch) {
      patchDoc((d) => {
        const next = { ...d.halftone, ...patch };
        if (next.minDotPct > next.maxDotPct) {
          if (patch.minDotPct !== undefined) next.maxDotPct = next.minDotPct;
          else next.minDotPct = next.maxDotPct;
        }
        return { halftone: next };
      });
    },

    resetHalftone() {
      patchDoc((d) => ({
        halftone: { ...DEFAULT_HALFTONE },
        layers: d.layers.map((l, i) => ({ ...l, halftone: { ...l.halftone, angleDeg: DEFAULT_ANGLES[i] ?? 22.5 } })),
      }));
    },

    setLayerAngle(id, angleDeg) {
      mapLayer(id, (l) => ({ ...l, halftone: { ...l.halftone, angleDeg } }));
    },

    setArtboard(patch) {
      patchDoc((d) => ({ artboard: { ...d.artboard, ...patch } }));
    },

    setPlacement(patch) {
      patchDoc((d) => {
        const next = { ...d.placement, ...patch };
        if (d.lockRatio) {
          const aspect = cropAspect(d);
          if (patch.widthMm !== undefined && patch.heightMm === undefined) next.heightMm = next.widthMm * aspect;
          if (patch.heightMm !== undefined && patch.widthMm === undefined) next.widthMm = next.heightMm / aspect;
        }
        next.widthMm = Math.max(1, next.widthMm);
        next.heightMm = Math.max(1, next.heightMm);
        return { placement: next };
      });
    },

    setLockRatio(lockRatio) {
      patchDoc((d) => {
        if (!lockRatio) return { lockRatio };
        const p = d.placement;
        return { lockRatio, placement: { ...p, heightMm: p.widthMm * cropAspect(d) } };
      });
    },

    setCrop(crop, placement) {
      patchDoc(() => ({ crop, placement }));
    },

    resetCrop() {
      patchDoc((d) => {
        if (!d.source || !d.crop) return {};
        const { width, height } = d.source;
        const scale = d.placement.widthMm / d.crop.width;
        const originX = d.placement.xMm - d.crop.x * scale;
        const originY = d.placement.yMm - d.crop.y * scale;
        return {
          crop: { x: 0, y: 0, width, height },
          placement: { xMm: originX, yMm: originY, widthMm: width * scale, heightMm: height * scale },
        };
      });
    },

    fitImage() {
      patchDoc((d) => (d.crop ? { placement: coverPlacement(d.artboard, d.crop.width, d.crop.height) } : {}));
    },

    centerImage() {
      patchDoc((d) => ({
        placement: {
          ...d.placement,
          xMm: (d.artboard.widthMm - d.placement.widthMm) / 2,
          yMm: (d.artboard.heightMm - d.placement.heightMm) / 2,
        },
      }));
    },

    setPaperColor(paperColor) {
      patchDoc((d) => ({ preview: { ...d.preview, paperColor } }));
    },

    setMockup(mockup) {
      patchDoc((d) => ({ preview: { ...d.preview, mockup } }));
    },

    dismissError() {
      set({ error: null });
    },
  };
});
