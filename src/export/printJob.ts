import type { ProjectDoc } from '../core/types';
import type { PrintJob } from '../worker/protocol';

/** The print-mask inputs. Ink colours are intentionally left out. */
export function printJobFromDoc(doc: ProjectDoc): PrintJob {
  return {
    imageId: doc.source?.imageId ?? null,
    crop: doc.crop,
    artboard: doc.artboard,
    placement: doc.placement,
    layers: doc.layers.map((l) => ({ id: l.id, tone: l.tone, angleDeg: l.halftone.angleDeg })),
    adjust: doc.adjust,
    separation: doc.separation,
    halftone: { ...doc.halftone, pattern: 'ordered' },
  };
}
