export interface StoredDoc {
  text: string;
  etag: string;
}

export interface Backend {
  /** `fresh: true` must return the latest write (bypassing any cache). null = not stored yet. */
  get(path: string, opts: { fresh: boolean }): Promise<StoredDoc | null>;
  /** With `ifMatch`, throws PreconditionFailed if the stored etag differs. */
  put(path: string, text: string, opts: { ifMatch?: string }): Promise<{ etag: string }>;
}

export class PreconditionFailed extends Error {
  constructor(path: string) {
    super(`precondition failed for ${path}`);
    this.name = "PreconditionFailed";
  }
}
