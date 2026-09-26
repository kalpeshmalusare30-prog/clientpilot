import { type Backend, PreconditionFailed, type StoredDoc } from "./backend";

/** In-memory backend for tests and STORE_BACKEND=memory local runs. */
export class MemoryBackend implements Backend {
  private files = new Map<string, StoredDoc>();
  private n = 0;
  /** Test hook: runs once right before the next put (simulates a concurrent writer). */
  public beforeNextPut: (() => void) | null = null;

  async get(path: string): Promise<StoredDoc | null> {
    const f = this.files.get(path);
    return f ? { ...f } : null;
  }

  async put(path: string, text: string, opts: { ifMatch?: string; create?: boolean } = {}): Promise<{ etag: string }> {
    const hook = this.beforeNextPut;
    this.beforeNextPut = null;
    hook?.();
    if (opts.create && this.files.has(path)) throw new PreconditionFailed(path);
    const cur = this.files.get(path);
    if (opts.ifMatch !== undefined && cur?.etag !== opts.ifMatch) throw new PreconditionFailed(path);
    return this.set(path, text);
  }

  /** Unconditional write that bypasses hooks. */
  set(path: string, text: string): { etag: string } {
    const etag = `"m${++this.n}"`;
    this.files.set(path, { text, etag });
    return { etag };
  }
}
