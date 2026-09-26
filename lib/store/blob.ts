import { BlobPreconditionFailedError, get, put } from "@vercel/blob";
import { type Backend, PreconditionFailed, type StoredDoc } from "./backend";

export class BlobBackend implements Backend {
  async get(path: string, opts: { fresh: boolean }): Promise<StoredDoc | null> {
    // get() resolves to null for a missing blob; useCache:false reads from origin (private stores only).
    const res = await get(path, { access: "private", useCache: !opts.fresh });
    if (!res || res.statusCode !== 200) return null;
    const text = await new Response(res.stream).text();
    return { text, etag: res.blob.etag };
  }

  async put(path: string, text: string, opts: { ifMatch?: string }): Promise<{ etag: string }> {
    try {
      const r = await put(path, text, {
        access: "private",
        allowOverwrite: true,
        addRandomSuffix: false,
        contentType: "application/json",
        ...(opts.ifMatch ? { ifMatch: opts.ifMatch } : {}),
      });
      return { etag: r.etag };
    } catch (e) {
      if (e instanceof BlobPreconditionFailedError) throw new PreconditionFailed(path);
      throw e;
    }
  }
}
