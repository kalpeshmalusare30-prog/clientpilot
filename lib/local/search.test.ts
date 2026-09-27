import { describe, expect, it } from "vitest";
import { searchLocal, type SearchDeps } from "./search";
import { defaultSettings } from "@/lib/defaults";
import type { LocalBiz } from "@/lib/types";

const el = (id: number, tags: Record<string, string>) => ({ type: "node", id, tags });
const ELEMENTS = [
  el(1, { name: "Sai Dental Care", amenity: "dentist", phone: "+91 98200 11111" }),
  el(2, { name: "HDFC Bank", amenity: "bank", phone: "9820044444" }),
  el(3, { name: "सेवा", shop: "clothes", phone: "9820066666" }),
  el(4, { name: "Old Site Clinic", amenity: "clinic", phone: "022 2674 1533", website: "http://oldsite.example" }),
  el(5, { name: "Fine Site Cafe", amenity: "cafe", phone: "+91 98200 22222", website: "https://fine.example" }),
  el(6, { name: "Dup Dental", amenity: "dentist", phone: "+91 98200 11111" }),
  el(7, { name: "No Contact Shop", shop: "clothes" }),
  el(8, { name: "Already Known", shop: "clothes", phone: "9820077777" }),
];

const deps = (audited: string[] = []): SearchDeps => ({
  geocode: async () => ({ bbox: { south: 19.1, west: 72.82, north: 19.14, east: 72.86 }, label: "Andheri" }),
  fetchElements: async () => ELEMENTS,
  audit: async (url) => {
    audited.push(url);
    return url.includes("oldsite")
      ? { verdict: "OLD", evidence: "its design looks dated (the footer still says 2012)", url }
      : { verdict: "OK", evidence: "" };
  },
});

const existing = [{ id: "node/8", slug: "already-known", waNum: "919820077777", telNum: "", name: "Already Known", area: "Andheri" }] as LocalBiz[];
const base = { area: "Andheri, Mumbai", category: "all", existing, settings: defaultSettings(), origin: "https://cp.app", nowIso: "2026-09-27T10:00:00.000Z" };

describe("searchLocal", () => {
  it("returns new, deduplicated, segmented businesses with messages and demo links", async () => {
    const audited: string[] = [];
    const r = await searchLocal({ ...base, deadline: Date.now() + 50_000 }, deps(audited));
    expect(r.partial).toBe(false);
    expect(r.areaLabel).toBe("Andheri");
    expect(r.added.map((b) => [b.name, b.segment, b.template])).toEqual([
      ["Sai Dental Care", "no_website", "dental"],
      ["Old Site Clinic", "old_site", "general"],
    ]);
    const sai = r.added[0]!;
    expect(sai.slug).toBe("sai-dental-care");
    expect(sai.whatsapp).toContain("https://cp.app/d/sai-dental-care");
    expect(sai.createdAt).toBe(base.nowIso);
    expect(r.added[1]!.evidence).toMatch(/2012/);
    expect(audited.sort()).toEqual(["http://oldsite.example", "https://fine.example"]);
  });
  it("skips audits and reports partial when the deadline is too close", async () => {
    const audited: string[] = [];
    const r = await searchLocal({ ...base, deadline: Date.now() + 3_000 }, deps(audited));
    expect(r.partial).toBe(true);
    expect(r.skippedAudits).toBe(2);
    expect(audited).toEqual([]);
    expect(r.added.map((b) => b.name)).toEqual(["Sai Dental Care"]);
  });
});
