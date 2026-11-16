import { imageRegistry } from '../state/imageRegistry';
import { useDocument } from '../state/documentStore';
import { saveBytes } from './download';
import { packProject, projectFileName } from './projectFile';

/** .bbk zip: project.json plus the original image bytes, unmodified. */
export async function saveProject() {
  const doc = useDocument.getState().doc;
  let source: Uint8Array | null = null;
  if (doc.source) {
    const entry = imageRegistry.get(doc.source.imageId);
    if (!entry) throw new Error('원본 이미지를 찾을 수 없습니다. 이미지를 다시 열어 주세요.');
    source = new Uint8Array(await entry.blob.arrayBuffer());
  }
  saveBytes(packProject(doc, source), projectFileName(doc.source?.fileName), 'application/zip');
}
