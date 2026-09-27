import { beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/d/[slug]/route";
import { createStore, setStoreForTests } from "@/lib/store";
import { MemoryBackend } from "@/lib/store/memory";
import type { LocalBiz } from "@/lib/types";

const A9 = {
  id: "node/12395684120", slug: "a9-digital-prints", name: "A9 Digital Prints", area: "Andheri", catKey: "copyshop", catLabel: "print shop", addr: "",
  waNum: "919322214085", telNum: "", phoneDisplay: "+91 93222 14085", email: "", website: "", social: "", segment: "no_website", evidence: "",
  whatsapp: "", emailSubject: "", emailBody: "", template: "print", createdAt: "",
} satisfies LocalBiz;
const NOPHONE = { ...A9, id: "node/2", slug: "no-phone", waNum: "", telNum: "", phoneDisplay: "" } satisfies LocalBiz;
const LOST = { ...A9, id: "node/3", slug: "said-no" } satisfies LocalBiz;
const SKIPPED = { ...A9, id: "node/4", slug: "skipped-one" } satisfies LocalBiz;
const REPLIED = { ...A9, id: "node/5", slug: "replied-one" } satisfies LocalBiz;
const LANDLINE = { ...A9, id: "node/6", slug: "landline-shop", waNum: "", telNum: "912226741533", phoneDisplay: "" } satisfies LocalBiz;

beforeEach(async () => {
  const s = createStore(new MemoryBackend());
  await s.mutateData((d) => ({
    ...d,
    local: [A9, NOPHONE, LOST, SKIPPED, REPLIED, LANDLINE],
    state: {
      "node/3": { kind: "local", status: "lost", updatedAt: "t" },
      "node/4": { kind: "local", status: "skipped", updatedAt: "t" },
      "node/5": { kind: "local", status: "replied", updatedAt: "t" },
    },
  }));
  setStoreForTests(s);
});

const get = (slug: string) => GET(new Request(`https://x.test/d/${slug}`), { params: Promise.resolve({ slug }) });

describe("GET /d/[slug]", () => {
  it("renders a known business publicly with caching and noindex headers", async () => {
    const res = await get("a9-digital-prints");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    expect(res.headers.get("x-robots-tag")).toMatch(/noindex/);
    expect(res.headers.get("cache-control")).toMatch(/s-maxage=300/);
    expect(await res.text()).toContain("A9 Digital Prints");
  });
  it("404s for unknown slugs and businesses without a phone", async () => {
    expect((await get("nope")).status).toBe(404);
    expect((await get("no-phone")).status).toBe(404);
  });
  it("F-13: sandboxes the page with a CSP so it cannot call the app's API with the owner's cookie", async () => {
    for (const slug of ["a9-digital-prints", "nope"]) {
      const csp = (await get(slug)).headers.get("content-security-policy") ?? "";
      expect(csp).toMatch(/(^|;s*)sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox/);
      expect(csp).not.toMatch(/allow-same-origin/);
      expect(csp).toMatch(/base-uri 'none'/);
      expect(csp).toMatch(/form-action 'none'/);
    }
  });
  it("F-13: unpublishes businesses that said no or were skipped; others stay", async () => {
    expect((await get("said-no")).status).toBe(404);
    expect((await get("skipped-one")).status).toBe(404);
    expect((await get("replied-one")).status).toBe(200);
  });
  it("F-13: rejects malformed slugs before reading data.json, with a long CDN cache", async () => {
    const s = createStore(new MemoryBackend());
    let reads = 0;
    setStoreForTests({ ...s, readData: async (o) => (reads++, s.readData(o)) });
    for (const slug of ["A9", "a".repeat(49), "x.y", "../data", "a b", ""]) {
      const res = await get(slug);
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toMatch(/s-maxage=3600/);
    }
    expect(reads).toBe(0);
  });
  it("F-8: a landline business's demo hides WhatsApp", async () => {
    const html = await (await get("landline-shop")).text();
    expect(html).toContain("[data-wa]{display:none!important}");
    expect(html).toContain("tel:+912226741533");
    const a9 = await (await get("a9-digital-prints")).text();
    expect(a9).not.toContain("[data-wa]{display:none!important}");
  });
});
