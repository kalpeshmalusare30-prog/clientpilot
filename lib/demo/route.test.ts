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

beforeEach(async () => {
  const s = createStore(new MemoryBackend());
  await s.mutateData((d) => ({ ...d, local: [A9, NOPHONE] }));
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
});
