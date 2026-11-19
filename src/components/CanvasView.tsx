import { useCallback, useEffect, useRef, useState } from 'react';
import { activeFrame } from '../core/defaults';
import {
  ALL_HANDLES,
  CORNER_HANDLES,
  cropFrameOf,
  HANDLE_POS,
  moveCrop,
  placementFromCrop,
  placementToRect,
  rectToPlacement,
  resizeCrop,
  resizeRect,
  type CropFrame,
  type Handle,
} from '../core/geometry';
import type { Placement, Rect } from '../core/types';
import { MOCKUP_SRC, mockupFrame, type MockupPhoto } from '../core/mockup';
import { orientedSize, paintOriented } from '../core/orient';
import { clamp, mmToPx, mmToUnit } from '../core/units';
import { useDocument } from '../state/documentStore';
import { imageRegistry } from '../state/imageRegistry';
import { printPreviewReady, usePreview, useUi } from '../state/uiStore';
import type { PrintTile } from '../worker/protocol';
import { CanvasFooter } from './CanvasFooter';
import { ImageTabs } from './ImageTabs';

const HANDLE_SIZE = 8;
const HIT_RADIUS = 9;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 60;
const ACCENT = '#4C8DFF';

type Drag =
  | { kind: 'pan'; sx: number; sy: number; panX: number; panY: number }
  | { kind: 'move'; sx: number; sy: number; start: Placement }
  | { kind: 'resize'; sx: number; sy: number; start: Rect; handle: Handle }
  | { kind: 'crop-move' | 'crop-resize'; sx: number; sy: number; start: Rect; frame: CropFrame; handle?: Handle };

const HANDLE_CURSOR: Record<Handle, string> = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
};

const MOCKUP_KINDS: MockupPhoto[] = ['tshirt', 'paper'];

/** Multiply the photo by a flat color, keeping the shirt's transparency and the paper grain. */
function tintPhoto(img: HTMLImageElement, color: string): HTMLCanvasElement {
  const maxSide = 1400;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');

/** Artboard-mm rect → screen rect for the current view. */
function toScreen(r: Rect) {
  const { zoom, panX, panY } = useUi.getState();
  return { x: panX + r.x * zoom, y: panY + r.y * zoom, width: r.width * zoom, height: r.height * zoom };
}

function hitHandle(screen: Rect, handles: Handle[], px: number, py: number): Handle | null {
  for (const h of handles) {
    const [fx, fy] = HANDLE_POS[h];
    if (Math.abs(px - (screen.x + screen.width * fx)) <= HIT_RADIUS && Math.abs(py - (screen.y + screen.height * fy)) <= HIT_RADIUS) return h;
  }
  return null;
}

const inside = (r: Rect, px: number, py: number) => px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height;

function drawHandles(ctx: CanvasRenderingContext2D, r: Rect, handles: Handle[]) {
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1.5;
  for (const h of handles) {
    const [fx, fy] = HANDLE_POS[h];
    const x = Math.round(r.x + r.width * fx - HANDLE_SIZE / 2) + 0.5;
    const y = Math.round(r.y + r.height * fy - HANDLE_SIZE / 2) + 0.5;
    ctx.fillRect(x, y, HANDLE_SIZE, HANDLE_SIZE);
    ctx.strokeRect(x, y, HANDLE_SIZE, HANDLE_SIZE);
  }
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, bg = 'rgba(20,20,24,.85)') {
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
  const w = ctx.measureText(text).width + 12;
  ctx.fillStyle = bg;
  ctx.fillRect(x, y - 16, w, 18);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, x + 6, y - 3);
}

export function CanvasView() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const dragRef = useRef<Drag | null>(null);
  const spaceRef = useRef(false);
  const frameRef = useRef(0);
  const [cursor, setCursor] = useState('default');
  const [dragOver, setDragOver] = useState(false);
  const photos = useRef<Partial<Record<MockupPhoto, HTMLImageElement>>>({});
  const tinted = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null);
  const [photosReady, setPhotosReady] = useState(0);
  const source = useDocument((s) => activeFrame(s.doc).source);
  const addImages = useDocument((s) => s.addImages);
  const requestFit = useUi((s) => s.requestFit);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const { w, h } = sizeRef.current;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#1E1E22';
    ctx.fillRect(0, 0, w, h);

    const { doc } = useDocument.getState();
    const image = activeFrame(doc);
    const ui = useUi.getState();
    const preview = usePreview.getState();
    const result = preview.result;
    const ab = toScreen({ x: 0, y: 0, width: image.artboard.widthMm, height: image.artboard.heightMm });

    const photoKind = doc.preview.mockup;
    const photo = photos.current[photoKind];
    if (photoKind && photo) {
      const frame = toScreen(mockupFrame(image.artboard, photoKind));
      const key = `${photoKind}|${image.paperColor}`;
      if (tinted.current?.key !== key) tinted.current = { key, canvas: tintPhoto(photo, image.paperColor) };
      ctx.drawImage(tinted.current.canvas, frame.x, frame.y, frame.width, frame.height);
    } else {
      ctx.fillStyle = image.paperColor;
      ctx.fillRect(ab.x, ab.y, ab.width, ab.height);
    }

    const print = preview.print;
    if (ui.viewMode !== 'original' && ui.halftonePreview && printPreviewReady() && print?.overview) {
      const printPxPerMm = mmToPx(1);
      const drawTile = ({ bitmap, region: r }: PrintTile) => {
        const dest = toScreen({
          x: r.x / printPxPerMm,
          y: r.y / printPxPerMm,
          width: r.width / printPxPerMm,
          height: r.height / printPxPerMm,
        });
        ctx.imageSmoothingEnabled = (ui.zoom * dpr * r.k) / printPxPerMm < 1;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bitmap, 0, 0, r.width / r.k, r.height / r.k, dest.x, dest.y, dest.width, dest.height);
      };
      drawTile(print.overview);
      if (print.detail && print.detailRev === preview.rev) drawTile(print.detail);
    } else if (result) {
      ctx.imageSmoothingEnabled = ui.zoom / result.pxPerMm < 2;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(result.bitmap, ab.x, ab.y, ab.width, ab.height);
    }

    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(ab.x) - 0.5, Math.round(ab.y) - 0.5, Math.round(ab.width) + 1, Math.round(ab.height) + 1);

    const fmt = (mm: number) => mmToUnit(mm, ui.unit).toFixed(ui.unit === 'cm' ? 1 : 0);
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fillText(`인쇄 영역 ${fmt(image.artboard.widthMm)} × ${fmt(image.artboard.heightMm)} ${ui.unit}`, ab.x, ab.y - 8);

    if (!image.source || !image.crop) return;
    const pr = toScreen(placementToRect(image.placement));

    if (ui.tool === 'crop') {
      const frame = cropFrameOf(image.crop, image.placement);
      const oriented = orientedSize(image.source.width, image.source.height, image.rotation);
      const full = toScreen({
        x: frame.originX,
        y: frame.originY,
        width: oriented.width * frame.scale,
        height: oriented.height * frame.scale,
      });
      const entry = imageRegistry.get(image.source.imageId);
      ctx.save();
      ctx.beginPath();
      ctx.rect(full.x, full.y, full.width, full.height);
      ctx.rect(pr.x, pr.y, pr.width, pr.height);
      ctx.clip('evenodd');
      ctx.globalAlpha = 0.35;
      if (entry) paintOriented(ctx, entry.bitmap, image.rotation, full);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(full.x, full.y, full.width, full.height);
      ctx.restore();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,.5)';
      ctx.strokeRect(full.x, full.y, full.width, full.height);
      ctx.setLineDash([]);

      ctx.strokeStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath();
      for (const f of [1 / 3, 2 / 3]) {
        ctx.moveTo(pr.x + pr.width * f, pr.y);
        ctx.lineTo(pr.x + pr.width * f, pr.y + pr.height);
        ctx.moveTo(pr.x, pr.y + pr.height * f);
        ctx.lineTo(pr.x + pr.width, pr.y + pr.height * f);
      }
      ctx.stroke();
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(pr.x, pr.y, pr.width, pr.height);
      drawHandles(ctx, pr, ALL_HANDLES);
      drawLabel(ctx, `크롭 ${Math.round(image.crop.width)} × ${Math.round(image.crop.height)}px · Enter로 완료`, pr.x, pr.y - 6, ACCENT);
      return;
    }

    if (ui.tool === 'move') {
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(pr.x) + 0.5, Math.round(pr.y) + 0.5, Math.round(pr.width), Math.round(pr.height));
      ctx.setLineDash([]);
      drawHandles(ctx, pr, image.lockRatio ? CORNER_HANDLES : ALL_HANDLES);
      drawLabel(
        ctx,
        `${fmt(image.placement.widthMm)} × ${fmt(image.placement.heightMm)} ${ui.unit}`,
        pr.x,
        pr.y + pr.height + 22,
      );
    }
  }, []);

  const requestDraw = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      draw();
    });
  }, [draw]);

  const fit = useCallback(() => {
    const { w, h } = sizeRef.current;
    if (!w || !h) return;
    const { doc } = useDocument.getState();
    const frame = mockupFrame(activeFrame(doc).artboard, doc.preview.mockup);
    const pad = 72;
    const zoom = clamp(Math.min((w - pad * 2) / frame.width, (h - pad * 2) / frame.height), MIN_ZOOM, MAX_ZOOM);
    useUi.getState().set({
      zoom,
      panX: (w - frame.width * zoom) / 2 - frame.x * zoom,
      panY: (h - frame.height * zoom) / 2 - frame.y * zoom,
    });
  }, []);

  const cover = useCallback(() => {
    const { w, h } = sizeRef.current;
    if (!w || !h) return;
    const { widthMm, heightMm } = activeFrame(useDocument.getState().doc).artboard;
    const zoom = clamp(Math.max(w / widthMm, h / heightMm), MIN_ZOOM, MAX_ZOOM);
    useUi.getState().set({
      zoom,
      panX: (w - widthMm * zoom) / 2,
      panY: (h - heightMm * zoom) / 2,
    });
  }, []);

  const zoomAt = useCallback((px: number, py: number, factor: number) => {
    const { zoom, panX, panY, set } = useUi.getState();
    const next = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const k = next / zoom;
    set({ zoom: next, panX: px - (px - panX) * k, panY: py - (py - panY) * k });
  }, []);

  useEffect(() => {
    let alive = true;
    for (const kind of MOCKUP_KINDS) {
      const img = new Image();
      img.onload = () => {
        if (!alive) return;
        photos.current[kind] = img;
        tinted.current = null;
        setPhotosReady((n) => n + 1);
      };
      img.src = MOCKUP_SRC[kind];
    }
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    requestDraw();
  }, [photosReady, requestDraw]);

  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    let first = true;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { w: width, h: height };
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      useUi.getState().set({ viewportW: width, viewportH: height });
      if (first && width > 0) {
        first = false;
        fit();
      }
      draw();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw, fit]);

  useEffect(() => {
    const unsubs = [
      useDocument.subscribe(requestDraw),
      useUi.subscribe((s, p) => {
        if (s.fitRequest !== p.fitRequest) fit();
        if (s.coverRequest !== p.coverRequest) cover();
        requestDraw();
      }),
      usePreview.subscribe(requestDraw),
    ];
    return () => unsubs.forEach((u) => u());
  }, [requestDraw, fit, cover]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.01));
      } else {
        const { panX, panY, set } = useUi.getState();
        set({ panX: panX - e.deltaX, panY: panY - e.deltaY });
      }
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const ui = useUi.getState();
      const hasImage = !!activeFrame(useDocument.getState().doc).source;
      const mod = e.metaKey || e.ctrlKey;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!spaceRef.current) {
          spaceRef.current = true;
          setCursor('grab');
        }
        return;
      }
      if (mod && e.key === '0') {
        e.preventDefault();
        fit();
      } else if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        zoomAt(sizeRef.current.w / 2, sizeRef.current.h / 2, 1.25);
      } else if (mod && e.key === '-') {
        e.preventDefault();
        zoomAt(sizeRef.current.w / 2, sizeRef.current.h / 2, 0.8);
      } else if (!mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        zoomAt(sizeRef.current.w / 2, sizeRef.current.h / 2, 1.25);
      } else if (!mod && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        zoomAt(sizeRef.current.w / 2, sizeRef.current.h / 2, 0.8);
      } else if (!mod && e.key.toLowerCase() === 'v') ui.set({ tool: 'move' });
      else if (!mod && e.key.toLowerCase() === 'c' && hasImage) ui.set({ tool: 'crop' });
      else if (!mod && e.key.toLowerCase() === 'h') ui.set({ tool: 'hand' });
      else if (!mod && e.key.toLowerCase() === 'r' && hasImage) {
        e.preventDefault();
        useDocument.getState().rotateImage(!e.shiftKey);
      }
      else if ((e.key === 'Enter' || e.key === 'Escape') && ui.tool === 'crop') ui.set({ tool: 'move' });
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceRef.current = false;
        setCursor('default');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [fit, zoomAt]);

  const localPoint = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** Decides what a press at this point would grab, for both pointerdown and hover cursors. */
  const hitTest = (x: number, y: number): { kind: Drag['kind'] | 'none'; handle?: Handle } => {
    const { doc } = useDocument.getState();
    const { tool } = useUi.getState();
    if (tool === 'hand' || spaceRef.current) return { kind: 'pan' };
    const image = activeFrame(doc);
    if (!image.source || !image.crop) return { kind: 'pan' };
    const pr = toScreen(placementToRect(image.placement));
    if (tool === 'crop') {
      const h = hitHandle(pr, ALL_HANDLES, x, y);
      if (h) return { kind: 'crop-resize', handle: h };
      return inside(pr, x, y) ? { kind: 'crop-move' } : { kind: 'none' };
    }
    const h = hitHandle(pr, image.lockRatio ? CORNER_HANDLES : ALL_HANDLES, x, y);
    if (h) return { kind: 'resize', handle: h };
    return inside(pr, x, y) ? { kind: 'move' } : { kind: 'pan' };
  };

  const cursorFor = (hit: ReturnType<typeof hitTest>) => {
    if (hit.handle) return HANDLE_CURSOR[hit.handle];
    if (hit.kind === 'move' || hit.kind === 'crop-move') return 'move';
    if (hit.kind === 'pan') return useUi.getState().tool === 'hand' || spaceRef.current ? 'grab' : 'default';
    return 'default';
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const { x, y } = localPoint(e);
    const ui = useUi.getState();
    const image = activeFrame(useDocument.getState().doc);
    const hit = e.button === 1 ? { kind: 'pan' as const } : hitTest(x, y);
    if (hit.kind === 'none') return;
    try {
      canvasRef.current!.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
    if (hit.kind === 'pan') {
      dragRef.current = { kind: 'pan', sx: x, sy: y, panX: ui.panX, panY: ui.panY };
      setCursor('grabbing');
    } else if (hit.kind === 'move') {
      dragRef.current = { kind: 'move', sx: x, sy: y, start: image.placement };
    } else if (hit.kind === 'resize') {
      dragRef.current = { kind: 'resize', sx: x, sy: y, start: placementToRect(image.placement), handle: hit.handle! };
    } else if (image.crop) {
      dragRef.current = {
        kind: hit.kind,
        sx: x,
        sy: y,
        start: image.crop,
        frame: cropFrameOf(image.crop, image.placement),
        handle: hit.handle,
      };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const { x, y } = localPoint(e);
    const drag = dragRef.current;
    if (!drag) {
      setCursor(cursorFor(hitTest(x, y)));
      return;
    }
    const ui = useUi.getState();
    const docState = useDocument.getState();
    const image = activeFrame(docState.doc);
    let dx = (x - drag.sx) / ui.zoom;
    let dy = (y - drag.sy) / ui.zoom;

    switch (drag.kind) {
      case 'pan':
        ui.set({ panX: drag.panX + (x - drag.sx), panY: drag.panY + (y - drag.sy) });
        break;
      case 'move':
        if (e.shiftKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
        docState.setPlacement({ xMm: drag.start.xMm + dx, yMm: drag.start.yMm + dy });
        break;
      case 'resize': {
        const lock = image.lockRatio !== e.shiftKey;
        docState.setPlacement(rectToPlacement(resizeRect(drag.start, drag.handle, dx, dy, lock)));
        break;
      }
      case 'crop-move':
      case 'crop-resize': {
        if (!image.source) break;
        const { width: sw, height: sh } = orientedSize(image.source.width, image.source.height, image.rotation);
        const dxPx = dx / drag.frame.scale;
        const dyPx = dy / drag.frame.scale;
        const crop =
          drag.kind === 'crop-move'
            ? moveCrop(drag.start, dxPx, dyPx, sw, sh)
            : resizeCrop(drag.start, drag.handle!, dxPx, dyPx, sw, sh);
        docState.setCrop(crop, placementFromCrop(crop, drag.frame));
        break;
      }
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (canvasRef.current?.hasPointerCapture(e.pointerId)) canvasRef.current.releasePointerCapture(e.pointerId);
    const { x, y } = localPoint(e);
    setCursor(cursorFor(hitTest(x, y)));
  };

  return (
    <main className="canvas-column">
      <CanvasFooter
        onFit={fit}
        onZoom={(f) => zoomAt(sizeRef.current.w / 2, sizeRef.current.h / 2, f)}
      />
      <ImageTabs />
      <div
        ref={wrapRef}
        className={`canvas-wrap ${dragOver ? 'drag-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setDragOver(false);
          const files = [...e.dataTransfer.files];
          if (files.length) {
            await addImages(files);
            requestFit();
          }
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ cursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={() => useUi.getState().tool === 'crop' && useUi.getState().set({ tool: 'move' })}
        />
        {!source && (
          <div className="empty-state">
            <p className="empty-title">이미지를 여기로 드래그하거나 상단에서 추가하세요. 여러 장을 올리면 탭마다 따로 조정할 수 있습니다.</p>
          </div>
        )}
      </div>
    </main>
  );
}
