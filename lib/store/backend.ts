export interface StoredDoc {
  text: string;
  etag: string;
}

export interface Backend {
  /** `fresh: true` must return the latest write (bypassing any cache). null = not stored yet. */
  get(path: string, opts: { fresh: boolean }): Promise<StoredDoc | null>;
  /**
   * With `ifMatch`, throws PreconditionFailed if the stored etag differs.
   * With `create: true`, succeeds only if nothing is stored at `path` yet, otherwise throws PreconditionFailed.
   */
  put(path: string, text: string, opts: { ifMatch?: string; create?: boolean }): Promise<{ etag: string }>;
}

export class PreconditionFailed extends Error {
  constructor(path: string) {
    super(`precondition failed for ${path}`);
    this.name = "PreconditionFailed";
  }
}
