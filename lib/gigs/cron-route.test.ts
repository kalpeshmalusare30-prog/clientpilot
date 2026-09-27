import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/gigs/sources", () => ({
  fetchAll: async () => ({
    leads: [{ id: "remotive:1", source: "remotive", title: "React developer", desc: "", url: "https://x/1", date: "", budget: "", tags: [], extra: "" }],
    failed: [],
  }),
}));

import { GET } from "@/app/api/cron/gigs/route";
import { createStore, setStoreForTests } from "@/lib/store";
import { MemoryBackend } from "@/lib/store/memory";

beforeEach(() => {
  process.env.CRON_SECRET = "cron-secret-xyz";
  setStoreForTests(createStore(new MemoryBackend()));
});

const call = (auth?: string) =>
  GET(new Request("https://x.test/api/cron/gigs", { headers: auth ? { authorization: auth } : {} }));

describe("GET /api/cron/gigs", () => {
  it("rejects missing or wrong secrets", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer nope")).status).toBe(401);
    process.env.CRON_SECRET = "";
    expect((await call("Bearer ")).status).toBe(401);
  });
  it("rejects every request when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    expect((await call()).status).toBe(401);
    expect((await call("Bearer ")).status).toBe(401);
    expect((await call("Bearer undefined")).status).toBe(401);
  });
  it("runs with the right secret", async () => {
    const res = await call("Bearer cron-secret-xyz");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, added: 1, total: 1, failed: [] });
  });
});
