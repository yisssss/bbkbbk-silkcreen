import * as Comlink from 'comlink';
import type { PipelineApi, PrintApi, SourceMeta } from './protocol';

/** Fast continuous-tone preview at reduced resolution. */
export const pipeline = Comlink.wrap<PipelineApi>(
  new Worker(new URL('./pipeline.worker.ts', import.meta.url), { type: 'module' }),
);

/**
 * 300 DPI halftone masks. Runs in its own worker so slow print renders
 * never delay the interactive draft preview.
 */
export const printPipeline = Comlink.wrap<PrintApi>(
  new Worker(new URL('./print.worker.ts', import.meta.url), { type: 'module' }),
);

/** Both workers keep their own decoded copy of each original. */
export const sources = {
  async add(id: string, blob: Blob): Promise<SourceMeta> {
    const [meta] = await Promise.all([pipeline.setSource(id, blob), printPipeline.setSource(id, blob)]);
    return meta;
  },
  remove(id: string) {
    void pipeline.removeSource(id);
    void printPipeline.removeSource(id);
  },
};

/**
 * Latest-wins queue: while a job is in flight only the newest pending
 * request is kept, so slider drags never pile up work.
 */
export class LatestScheduler<Req, Res> {
  private busy = false;
  private pending: Req | null = null;

  constructor(
    private run: (req: Req) => Promise<Res>,
    private onResult: (result: Res) => void,
    private onError: (error: unknown) => void = console.error,
  ) {}

  get idle() {
    return !this.busy && !this.pending;
  }

  request(req: Req) {
    this.pending = req;
    if (!this.busy) void this.pump();
  }

  private async pump() {
    this.busy = true;
    while (this.pending) {
      const req = this.pending;
      this.pending = null;
      try {
        this.onResult(await this.run(req));
      } catch (e) {
        this.onError(e);
      }
    }
    this.busy = false;
  }
}
