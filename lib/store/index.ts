import { emptyData, emptyGigs, normalizeData } from "@/lib/defaults";
import type { DataDoc, GigsDoc } from "@/lib/types";
import { type Backend, PreconditionFailed } from "./backend";
import { BlobBackend } from "./blob";
import { MemoryBackend } from "./memory";

export const GIGS_PATH = "gigs.json";
export const DATA_PATH = "data.json";
const MAX_TRIES = 3;

export interface Store {
  readGigs(opts?: { fresh?: boolean }): Promise<GigsDoc>;
  readData(opts?: { fresh?: boolean }): Promise<DataDoc>;
  mutateGigs(fn: (doc: GigsDoc) => GigsDoc): Promise<GigsDoc>;
  mutateData(fn: (doc: DataDoc) => DataDoc): Promise<DataDoc>;
}

export function createStore(backend: Backend, nowIso: () => string = () => new Date().toISOString()): Store {
  async function read<T>(path: string, fresh: boolean, empty: () => T, normalize: (x: T) => T) {
    const got = await backend.get(path, { fresh });
    return { doc: got ? normalize(JSON.parse(got.text) as T) : empty(), etag: got?.etag };
  }

  async function mutate<T extends { updatedAt: string }>(
    path: string,
    empty: () => T,
    normalize: (x: T) => T,
    fn: (doc: T) => T,
  ): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < MAX_TRIES; i++) {
      const { doc, etag } = await read(path, true, empty, normalize);
      const next = fn(structuredClone(doc));
      next.updatedAt = nowIso();
      try {
        await backend.put(path, JSON.stringify(next), etag ? { ifMatch: etag } : { create: true });
        return next;
      } catch (e) {
        lastErr = e;
        if (!(e instanceof PreconditionFailed)) throw e;
      }
    }
    throw lastErr;
  }

  const same = <T,>(x: T) => x;
  return {
    readGigs: async (o) => (await read(GIGS_PATH, o?.fresh ?? false, () => emptyGigs(nowIso()), same)).doc,
    readData: async (o) => (await read(DATA_PATH, o?.fresh ?? true, () => emptyData(nowIso()), normalizeData)).doc,
    mutateGigs: (fn) => mutate(GIGS_PATH, () => emptyGigs(nowIso()), same, fn),
    mutateData: (fn) => mutate(DATA_PATH, () => emptyData(nowIso()), normalizeData, fn),
  };
}

// The singleton lives on globalThis, not in a module-level variable: Next loads this module once per
// bundle (route handlers and pages get separate instances), and STORE_BACKEND=memory only works if
// every bundle in the process sees the same store.
const slot = globalThis as typeof globalThis & { __cpStore?: Store };

export function getStore(): Store {
  slot.__cpStore ??= createStore(process.env.STORE_BACKEND === "memory" ? new MemoryBackend() : new BlobBackend());
  return slot.__cpStore;
}

export function setStoreForTests(store: Store): void {
  slot.__cpStore = store;
}
