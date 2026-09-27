import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET, PUT } from "@/app/api/settings/route";
import { COOKIE_NAME, signSession } from "@/lib/auth/crypto";
import { defaultSettings } from "@/lib/defaults";
import { createStore, getStore, setStoreForTests } from "@/lib/store";
import { MemoryBackend } from "@/lib/store/memory";

let cookie = "";
beforeAll(async () => {
  process.env.SESSION_SECRET = "test-secret-0123456789";
  cookie = `${COOKIE_NAME}=${await signSession()}`;
});
beforeEach(() => setStoreForTests(createStore(new MemoryBackend())));

const put = (body: unknown, withCookie = true) =>
  PUT(new Request("https://x.test/api/settings", { method: "PUT", headers: { "content-type": "application/json", ...(withCookie ? { cookie } : {}) }, body: JSON.stringify(body) }));

describe("/api/settings", () => {
  it("requires a session", async () => {
    expect((await GET(new Request("https://x.test/api/settings"))).status).toBe(401);
    expect((await put(defaultSettings(), false)).status).toBe(401);
  });
  it("rejects invalid links and an empty template", async () => {
    expect((await put({ ...defaultSettings(), allowedLinks: ["not a url"] })).status).toBe(400);
    expect((await put({ ...defaultSettings(), waTemplate: "" })).status).toBe(400);
  });
  it("never widens the global link allow-list", async () => {
    for (const link of ["https://evil.example.com", "http://agentbandhu.com", "https://agentbandhu.com.evil.io", "https://user@agentbandhu.com", "https://agentbandhu.company"]) {
      expect((await put({ ...defaultSettings(), allowedLinks: ["https://agentbandhu.com", link] })).status, link).toBe(400);
    }
    expect((await put({ ...defaultSettings(), allowedLinks: [] })).status).toBe(400);
    expect((await getStore().readData()).settings.allowedLinks).toEqual(defaultSettings().allowedLinks);
    // Narrowing, and subpaths of an allowed site, are fine.
    const narrow = ["https://kalpesh-malusare.vercel.app", "https://demos-kal1201.vercel.app/salon"];
    expect((await put({ ...defaultSettings(), allowedLinks: narrow })).status).toBe(200);
    expect((await getStore().readData()).settings.allowedLinks).toEqual(narrow);
  });
  it("stores facts and the template exactly as typed and drops unknown keys", async () => {
    const s = { ...defaultSettings(), facts: "  - Built X\n\n", waTemplate: "  Hi {name}, {intro}\n", extra: "x" };
    expect((await put(s)).status).toBe(200);
    const saved = (await getStore().readData()).settings;
    expect(saved.facts).toBe("  - Built X\n\n");
    expect(saved.waTemplate).toBe("  Hi {name}, {intro}\n");
    expect(Object.keys(saved).sort()).toEqual(["allowedLinks", "facts", "never", "pricing", "waTemplate"]);
    expect((await put({ ...defaultSettings(), waTemplate: "   short   " })).status).toBe(400);
  });
  it("saves and returns settings", async () => {
    const s = { ...defaultSettings(), pricing: "₹12k per site" };
    expect((await put(s)).status).toBe(200);
    expect((await getStore().readData()).settings.pricing).toBe("₹12k per site");
    const res = await GET(new Request("https://x.test/api/settings", { headers: { cookie } }));
    expect(((await res.json()) as { settings: { pricing: string } }).settings.pricing).toBe("₹12k per site");
  });
});
