import { describe, expect, it } from "vitest";
import { categoryOf, normalizePhone, toCandidate } from "./classify";

describe("categoryOf", () => {
  it("maps known OSM values and builds labels for unknown ones", () => {
    expect(categoryOf({ amenity: "dentist" })).toEqual({ key: "dentist", label: "dental clinic" });
    expect(categoryOf({ shop: "copyshop" })).toEqual({ key: "copyshop", label: "print shop" });
    expect(categoryOf({ office: "educational_institution" })).toEqual({ key: "educational_institution", label: "educational institution office" });
    expect(categoryOf({ shop: "yes", amenity: "cafe" })).toEqual({ key: "cafe", label: "cafe" });
    expect(categoryOf({})).toEqual({ key: "business", label: "business" });
  });
});

describe("normalizePhone", () => {
  it.each([
    ["+91 98332 24498", { kind: "wa", num: "919833224498", display: "+91 98332 24498" }],
    ["022 2674 1533", { kind: "tel", num: "912226741533", display: "+91 2226741533" }],
    ["+91 (0)22 2674 1533", { kind: "tel", num: "912226741533", display: "+91 2226741533" }],
    ["02226741533; 9833224498", { kind: "wa", num: "919833224498", display: "+91 98332 24498" }],
    ["98332-24498 / 022-26741533", { kind: "wa", num: "919833224498", display: "+91 98332 24498" }],
    ["919833224498", { kind: "wa", num: "919833224498", display: "+91 98332 24498" }],
  ])("%s", (raw, want) => {
    expect(normalizePhone(raw)).toEqual(want);
  });
  it.each(["1800 123 4567", "+1 555 123 4567", "1111111111", "", undefined])("rejects %s", (raw) => {
    expect(normalizePhone(raw)).toBeNull();
  });
});

describe("toCandidate", () => {
  const el = (id: number, tags: Record<string, string>) => ({ type: "node", id, tags });
  it("builds a candidate with segment for no-website and social-only businesses", () => {
    expect(toCandidate(el(1, { name: "Sai Dental Care", amenity: "dentist", phone: "+91 98200 11111", "addr:street": "SV Road" }), "Andheri")).toMatchObject({
      id: "node/1", name: "Sai Dental Care", area: "Andheri", catKey: "dentist", waNum: "919820011111", segment: "no_website", addr: "SV Road",
    });
    expect(toCandidate(el(2, { name: "Glow Salon", shop: "beauty", phone: "9820022222", "contact:instagram": "glowsalon" }), "Andheri")).toMatchObject({ segment: "social_only", social: "glowsalon" });
    const withSite = toCandidate(el(3, { name: "Old Clinic", amenity: "clinic", phone: "9820033333", website: "http://old.example," }), "Andheri");
    expect(withSite).toMatchObject({ website: "http://old.example", segment: undefined });
  });
  it("excludes chains, banks and non-Latin names; skips businesses with no contact", () => {
    expect(toCandidate(el(4, { name: "HDFC Bank", amenity: "bank", phone: "9820044444" }), "A")).toBe("excluded");
    expect(toCandidate(el(5, { name: "Domino's Pizza", amenity: "fast_food", phone: "9820055555" }), "A")).toBe("excluded");
    expect(toCandidate(el(6, { name: "सेवा केंद्र", shop: "clothes", phone: "9820066666" }), "A")).toBe("excluded");
    expect(toCandidate(el(7, { name: "No Contact Shop", shop: "clothes" }), "A")).toBeNull();
    expect(toCandidate(el(8, { shop: "clothes" }), "A")).toBeNull();
  });
});
