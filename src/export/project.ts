import { activeFrame } from '../core/defaults';
import { imageRegistry } from '../state/imageRegistry';
import { useDocument } from '../state/documentStore';
import { saveBytes } from './download';
import { packProject, projectFileName } from './projectFile';

/** .bbk zip: project.json plus every original image, unmodified. */
export async function saveProject() {
  const doc = useDocument.getState().doc;
  const sources: Record<string, Uint8Array> = {};
  for (const img of doc.images) {
    if (!img.source) continue;
    const entry = imageRegistry.get(img.source.imageId);
    if (!entry) throw new Error(`「${img.name}」 원본 이미지를 찾을 수 없습니다. 이미지를 다시 열어 주세요.`);
    sources[img.source.imageId] = new Uint8Array(await entry.blob.arrayBuffer());
  }
  saveBytes(packProject(doc, sources), projectFileName(activeFrame(doc).source?.fileName), 'application/zip');
}
