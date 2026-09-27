import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryBackend } from "./memory";

// Next (`next dev` and builds) loads lib/store once per bundle: route handlers and pages get
// separate module instances. vi.resetModules() + a fresh import reproduces that here.
type StoreModule = typeof import("./index");
async function freshInstance(): Promise<StoreModule> {
  vi.resetModules();
  return import("./index");
}
const slot = () => (globalThis as { __cpStore?: unknown }).__cpStore;

afterEach(() => {
  delete (globalThis as { __cpStore?: unknown }).__cpStore;
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("getStore singleton", () => {
  it("returns the store set via setStoreForTests and keeps it in the global slot", async () => {
    const m = await freshInstance();
    const s = m.createStore(new MemoryBackend());
    m.setStoreForTests(s);
    expect(m.getStore()).toBe(s);
    expect(slot()).toBe(s);
  });

  it("is shared by separate module instances (route-handler bundle vs page bundle)", async () => {
    const api = await freshInstance();
    const page = await freshInstance();
    expect(page).not.toBe(api); // really two module instances
    const s = api.createStore(new MemoryBackend());
    api.setStoreForTests(s);
    expect(page.getStore()).toBe(s);
  });

  it("in memory mode, a write through one module instance is read by another", async () => {
    vi.stubEnv("STORE_BACKEND", "memory");
    const api = await freshInstance();
    const page = await freshInstance();
    await api.getStore().mutateData((d) => {
      d.state["g1"] = { kind: "gig", status: "sent", followUpAt: "2026-09-27T05:30:00.000Z", updatedAt: "t" };
      return d;
    });
    expect((await page.getStore().readData()).state["g1"]?.status).toBe("sent");
    expect(page.getStore()).toBe(api.getStore());
  });
});
