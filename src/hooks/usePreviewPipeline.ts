import { useEffect } from 'react';
import { activeFrame } from '../core/defaults';
import { mmToPx, printPixelSize } from '../core/units';
import { printJobFromDoc } from '../export/printJob';
import { useDocument } from '../state/documentStore';
import { usePreview, useUi } from '../state/uiStore';
import { LatestScheduler, pipeline, printPipeline } from '../worker/pipelineClient';
import { overviewScale, type PrintRegion, type PrintViewRequest, type RenderRequest } from '../worker/protocol';

/** Longest side of the interactive draft raster, in pixels. */
const PREVIEW_LONG_SIDE = 1600;
/** Idle time after an edit before the 300 DPI halftone is recomputed. */
const PRINT_DELAY_MS = 250;
/** Idle time after pan / zoom before a sharper detail tile is requested. */
const DETAIL_DELAY_MS = 120;

function buildDraftRequest(): RenderRequest {
  const { doc } = useDocument.getState();
  const image = activeFrame(doc);
  const ui = useUi.getState();
  const longMm = Math.max(image.artboard.widthMm, image.artboard.heightMm);
  return {
    imageId: image.source?.imageId ?? null,
    crop: image.crop,
    artboard: image.artboard,
    placement: image.placement,
    rotation: image.rotation,
    pxPerMm: Math.min(PREVIEW_LONG_SIDE / longMm, mmToPx(1)),
    layers: image.layers.map((l) => ({ id: l.id, color: l.color, tone: l.tone, visible: l.visible })),
    adjust: image.adjust,
    separation: image.separation,
    view: ui.viewMode,
    soloLayerId: ui.selectedLayerId,
    paperColor: image.paperColor,
    transparentPaper: ui.viewMode !== 'layer',
    thumbWidth: 96,
  };
}

/**
 * The part of the print raster that is on screen, when the view is zoomed in
 * past the overview's resolution. k keeps the tile close to device pixel size.
 */
function visibleDetailRegion(): PrintRegion | null {
  const image = activeFrame(useDocument.getState().doc);
  const ui = useUi.getState();
  const { width, height } = printPixelSize(image.artboard.widthMm, image.artboard.heightMm);
  const printPxPerMm = mmToPx(1);
  const devicePxPerMm = ui.zoom * (window.devicePixelRatio || 1);
  if (devicePxPerMm <= (printPxPerMm / overviewScale(width, height)) * 1.05) return null;
  const x0 = Math.max(0, -ui.panX / ui.zoom);
  const y0 = Math.max(0, -ui.panY / ui.zoom);
  const x1 = Math.min(image.artboard.widthMm, (ui.viewportW - ui.panX) / ui.zoom);
  const y1 = Math.min(image.artboard.heightMm, (ui.viewportH - ui.panY) / ui.zoom);
  if (x1 <= x0 || y1 <= y0) return null;
  return {
    x: x0 * printPxPerMm,
    y: y0 * printPxPerMm,
    width: (x1 - x0) * printPxPerMm,
    height: (y1 - y0) * printPxPerMm,
    k: Math.max(1, Math.floor(printPxPerMm / devicePxPerMm)),
  };
}

function buildPrintRequest(wantOverview: boolean): PrintViewRequest {
  const { doc } = useDocument.getState();
  const image = activeFrame(doc);
  const ui = useUi.getState();
  const { rev, print } = usePreview.getState();
  return {
    rev,
    job: printJobFromDoc(doc),
    view: ui.viewMode === 'layer' ? 'layer' : 'composite',
    soloLayerId: ui.selectedLayerId,
    paperColor: image.paperColor,
    transparentPaper: ui.viewMode !== 'layer',
    colors: image.layers.map((l) => l.color),
    visible: image.layers.map((l) => l.visible),
    overview: wantOverview || print?.rev !== rev,
    detail: visibleDetailRegion(),
  };
}

const wantsPrint = () => {
  const ui = useUi.getState();
  return ui.halftonePreview && ui.viewMode !== 'original' && !!activeFrame(useDocument.getState().doc).source;
};

export function usePreviewPipeline() {
  useEffect(() => {
    const preview = usePreview.getState();
    const draft = new LatestScheduler(pipeline.render, preview.setResult);
    const print = new LatestScheduler(printPipeline.render, preview.setPrint);
    let frame = 0;
    let printTimer = 0;

    const scheduleDraft = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        draft.request(buildDraftRequest());
      });
    };
    const schedulePrint = (wantOverview: boolean, delay: number) => {
      window.clearTimeout(printTimer);
      printTimer = window.setTimeout(() => wantsPrint() && print.request(buildPrintRequest(wantOverview)), delay);
    };
    const onContentChange = () => {
      usePreview.getState().bumpRev();
      scheduleDraft();
      schedulePrint(true, PRINT_DELAY_MS);
    };

    onContentChange();
    const unsubDoc = useDocument.subscribe((s, p) => s.doc !== p.doc && onContentChange());
    const unsubUi = useUi.subscribe((s, p) => {
      if (
        s.viewMode !== p.viewMode ||
        s.halftonePreview !== p.halftonePreview ||
        (s.selectedLayerId !== p.selectedLayerId && s.viewMode === 'layer')
      ) {
        onContentChange();
      } else if (
        s.zoom !== p.zoom ||
        s.panX !== p.panX ||
        s.panY !== p.panY ||
        s.viewportW !== p.viewportW ||
        s.viewportH !== p.viewportH
      ) {
        schedulePrint(false, DETAIL_DELAY_MS);
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(printTimer);
      unsubDoc();
      unsubUi();
    };
  }, []);
}
