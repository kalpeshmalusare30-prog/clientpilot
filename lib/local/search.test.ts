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

  // Two tiles: a 0.15° tall box splits into 2 rows of at most 0.09°.
  const twoTiles = async () => ({ bbox: { south: 19.0, west: 72.8, north: 19.15, east: 72.85 }, label: "Andheri" });

  it("keeps the first tile's leads and reports partial when a later tile fails (T8-2)", async () => {
    let fetches = 0;
    const d: SearchDeps = {
      ...deps(),
      geocode: twoTiles,
      fetchElements: async () => {
        if (fetches++ === 0) return ELEMENTS;
        throw new Error("Overpass HTTP 504");
      },
    };
    const r = await searchLocal({ ...base, deadline: Date.now() + 50_000 }, d);
    expect(fetches).toBe(2);
    expect(r.partial).toBe(true);
    expect(r.scanned).toBe(ELEMENTS.length);
    expect(r.added.map((b) => b.name)).toEqual(["Sai Dental Care", "Old Site Clinic"]);
  });
  it("still fails when the first tile fails, since there is nothing to show", async () => {
    const d: SearchDeps = { ...deps(), geocode: twoTiles, fetchElements: async () => Promise.reject(new Error("Overpass HTTP 504")) };
    await expect(searchLocal({ ...base, deadline: Date.now() + 50_000 }, d)).rejects.toThrow("Overpass HTTP 504");
  });

  it("counts an audit the deadline cut short as skipped, never as a site_down lead (T8-1)", async () => {
    const d: SearchDeps = {
      ...deps(),
      audit: async (url, _name, signal) =>
        url.includes("oldsite")
          ? { verdict: "UNKNOWN", evidence: "audit cut short", incomplete: true }
          : { verdict: signal.aborted ? "UNKNOWN" : "OK", evidence: "" },
    };
    const r = await searchLocal({ ...base, deadline: Date.now() + 50_000 }, d);
    expect(r.partial).toBe(true);
    expect(r.skippedAudits).toBe(1);
    expect(r.added.map((b) => [b.name, b.segment])).toEqual([["Sai Dental Care", "no_website"]]);
  });

  it("clears an email only when it is at the dead domain itself or a subdomain (T8-8)", async () => {
    const d: SearchDeps = {
      ...deps(),
      fetchElements: async () => [
        el(11, { name: "Shop One", shop: "clothes", phone: "9820011122", website: "https://shop.example", email: "info@myshop.example" }),
        el(12, { name: "Shop Two", shop: "clothes", phone: "9820011133", website: "https://www.dead.example", email: "Owner@Dead.Example" }),
        el(13, { name: "Shop Three", shop: "clothes", phone: "9820011144", website: "https://third.example", email: "sales@mail.third.example" }),
      ],
      audit: async (url) => ({ verdict: "DOWN", evidence: "the domain does not seem to be working any more", url }),
    };
    const r = await searchLocal({ ...base, deadline: Date.now() + 50_000 }, d);
    expect(Object.fromEntries(r.added.map((b) => [b.name, b.email]))).toEqual({ "Shop One": "info@myshop.example", "Shop Two": "", "Shop Three": "" });
  });
});
