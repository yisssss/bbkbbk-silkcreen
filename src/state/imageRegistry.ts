/**
 * Main-thread handles to original images. Originals live outside the document
 * store so history snapshots never copy pixel data, and are never modified.
 */
interface SourceEntry {
  blob: Blob;
  bitmap: ImageBitmap;
}

const entries = new Map<string, SourceEntry>();

export const imageRegistry = {
  set(id: string, entry: SourceEntry) {
    entries.set(id, entry);
  },
  get(id: string | null | undefined) {
    return id ? entries.get(id) : undefined;
  },
  remove(id: string) {
    entries.get(id)?.bitmap.close();
    entries.delete(id);
  },
};
