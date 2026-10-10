import { describe, expect, it } from "vitest";
import { CATEGORY_OPTIONS, mergeTags, selectorOf, selectorsFor } from "./categories";
import { GENERAL_CATS, TEMPLATE_BY_CAT, templateFor } from "./biz";

const keys = CATEGORY_OPTIONS.map((c) => c.key);
const opt = (k: string) => CATEGORY_OPTIONS.find((c) => c.key === k)!;

describe("search categories", () => {
  it("keeps every category the picker had before", () => {
    for (const k of ["all", "print", "dental", "clinic", "food", "beauty", "fitness", "education", "hotel", "shop", "office"]) expect(keys).toContain(k);
  });

  it("adds the businesses that usually pay for a website", () => {
    for (const k of ["preschool", "optician", "realestate", "finance", "design", "photo", "events", "travel", "bakery", "fashion", "furniture",
      "electronics", "auto", "vet", "pharmacy", "florist"]) expect(keys).toContain(k);
  });

  it("has unique keys, starts with All and ends with the low-value industrial option", () => {
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys[0]).toBe("all");
    expect(keys.at(-1)).toBe("industrial");
    const firstLow = CATEGORY_OPTIONS.findIndex((c) => c.lowValue);
    expect(CATEGORY_OPTIONS.slice(firstLow).every((c) => c.lowValue)).toBe(true);
  });

  it("uses the agreed OSM tags", () => {
    const sel = (k: string) => selectorsFor(k).join(" ");
    expect(sel("beauty")).toContain('["shop"~"^(beauty|hairdresser|massage|tattoo)$"]["name"]');
    expect(sel("fitness")).toMatch(/\["leisure"~"\^\(fitness_centre\|sports_centre\)\$"\]/);
    expect(sel("fitness")).toMatch(/\["sport"~"[^"]*\byoga\b/);
    expect(sel("education")).toMatch(/\["amenity"~"[^"]*\btraining\b[^"]*\blanguage_school\b[^"]*\bmusic_school\b[^"]*\bdriving_school\b/);
    expect(sel("education")).toContain('["office"~"^(educational_institution)$"]');
    expect(sel("clinic")).toMatch(/\["amenity"~"\^\(clinic\|doctors\|hospital\)\$"\]/);
    expect(sel("clinic")).toMatch(/\["healthcare"~"[^"]*\bphysiotherapist\b[^"]*\blaboratory\b/);
    expect(sel("optician")).toContain('["shop"~"^(optician)$"]');
    expect(sel("vet")).toContain('["amenity"~"^(veterinary)$"]');
    expect(sel("vet")).toMatch(/\["shop"~"\^\(pet\b/);
    expect(sel("realestate")).toMatch(/\["office"~"\^\(estate_agent\b/);
    expect(sel("finance")).toMatch(/\["office"~"[^"]*\baccountant\b[^"]*\btax_advisor\b[^"]*\blawyer\b[^"]*\binsurance\b[^"]*\bfinancial\b/);
    expect(sel("design")).toMatch(/\["office"~"\^\(architect\b/);
    expect(sel("design")).toContain('["shop"~"^(interior_decoration)$"]');
    expect(sel("photo")).toContain('["craft"~"^(photographer)$"]');
    expect(sel("events")).toMatch(/\["amenity"~"\^\(events_venue\b/);
    expect(sel("events")).toContain('["craft"~"^(caterer)$"]');
    expect(sel("travel")).toContain('["shop"~"^(travel_agency)$"]');
    expect(sel("travel")).toMatch(/\["office"~"\^\(travel_agent\b/);
    expect(sel("hotel")).toMatch(/\["tourism"~"\^\(hotel\|guest_house\b/);
    expect(sel("bakery")).toContain('["shop"~"^(bakery|confectionery|pastry|chocolate)$"]');
    expect(sel("fashion")).toMatch(/\["shop"~"\^\(boutique\|clothes\|tailor\b[^"]*\bjewelry\b/);
    expect(sel("auto")).toMatch(/\["shop"~"\^\(car_repair\|motorcycle_repair\b/);
    expect(sel("preschool")).toContain('["amenity"~"^(kindergarten|childcare|school)$"]');
    expect(sel("florist")).toMatch(/\bflorist\b/);
    expect(sel("pharmacy")).toMatch(/\["amenity"~"\^\(pharmacy\)\$"\]/);
    expect(sel("industrial")).toContain('["shop"~"^(wholesale|trade|agrarian)$"]["name"]');
    expect(sel("industrial")).toContain('["industrial"]["name"]');
  });

  it("every selector asks for a named place and is well formed", () => {
    for (const c of CATEGORY_OPTIONS) {
      expect(c.selectors.length, c.key).toBeGreaterThan(0);
      for (const s of c.selectors) expect(s, c.key).toMatch(/^(\["[a-z_:]+"(?:(?:~|!~)"\^\([a-z0-9_|]+\)\$")?\])+\["name"\]$/);
    }
  });

  it("All leaves out industrial, manufacturing and wholesale places", () => {
    const all = selectorsFor("all").join("\n");
    expect(all).toContain('["shop"]["shop"!~"^(wholesale|trade|agrarian)$"]["name"]');
    expect(all).toMatch(/\["craft"\]\["craft"!~"\^\([^"]*metal_construction[^"]*\)\$"\]/);
    expect(all).toMatch(/\["office"\]\["office"!~"\^\([^"]*government[^"]*industrial[^"]*\)\$"\]/);
    expect(all).not.toMatch(/man_made|\["industrial"\]/);
    // ...while still covering everything the specific options ask for.
    for (const k of ["beauty", "fitness", "education", "clinic", "events", "hotel", "food", "auto", "vet", "preschool"]) {
      for (const t of opt(k).tags) {
        if (!t.values) continue;
        const line = selectorsFor("all").find((s) => s.startsWith(`["${t.key}"`))!;
        expect(line, `${k}: ${t.key}`).toBeDefined();
        if (line.startsWith(`["${t.key}"~`)) for (const v of t.values) expect(line, `${k}: ${t.key}=${v}`).toMatch(new RegExp(`[(|]${v}[|)]`));
      }
    }
  });

  it("falls back to All for an unknown key", () => {
    expect(selectorsFor("nope")).toEqual(selectorsFor("all"));
  });

  it("maps every value the picker searches to a demo template on purpose", () => {
    const unmapped: string[] = [];
    for (const c of CATEGORY_OPTIONS) {
      if (c.lowValue) continue;
      for (const t of c.tags) for (const v of t.values ?? []) if (!TEMPLATE_BY_CAT[v] && !GENERAL_CATS.includes(v)) unmapped.push(`${c.key}:${v}`);
    }
    expect(unmapped).toEqual([]);
  });

  it("routes each new category to the template that fits it", () => {
    const cases: [string, string, string][] = [
      ["hairdresser", "salon", "salon"], ["beauty", "beauty salon", "salon"], ["massage", "spa & massage centre", "salon"],
      ["fitness_centre", "gym", "fitness"], ["yoga", "yoga studio", "fitness"], ["karate", "karate class", "fitness"],
      ["prep_school", "tuition classes", "coaching"], ["training", "training institute", "coaching"], ["kindergarten", "preschool", "coaching"],
      ["driving_school", "driving school", "coaching"],
      ["clinic", "clinic", "health"], ["physiotherapist", "physiotherapy clinic", "health"], ["laboratory", "diagnostic lab", "health"],
      ["veterinary", "veterinary clinic", "health"], ["hospital", "hospital", "health"],
      ["accountant", "accounting firm", "pro"], ["lawyer", "law firm", "pro"], ["estate_agent", "real estate agency", "pro"],
      ["architect", "architecture firm", "pro"], ["travel_agency", "travel agency", "pro"],
      ["events_venue", "events venue", "events"], ["caterer", "catering service", "events"], ["photographer", "photographer", "events"],
      ["jewelry", "jewellery store", "retail"], ["furniture", "furniture store", "retail"], ["mobile_phone", "mobile shop", "retail"],
      ["optician", "optical store", "retail"], ["pharmacy", "pharmacy", "retail"], ["florist", "flower shop", "retail"], ["pet", "pet shop", "retail"],
      ["car_repair", "garage", "auto"], ["motorcycle_repair", "bike service centre", "auto"],
      ["bakery", "bakery", "cafe"], ["confectionery", "sweet shop", "cafe"], ["dentist", "dental clinic", "dental"], ["copyshop", "print shop", "print"],
      ["hotel", "hotel", "general"], ["supermarket", "supermarket", "general"],
    ];
    for (const [key, label, want] of cases) expect(templateFor(key, label), key).toBe(want);
  });
});

describe("selector helpers", () => {
  it("builds value, any-value and excluded-value filters", () => {
    expect(selectorOf({ key: "shop", values: ["bakery", "pastry"] })).toBe('["shop"~"^(bakery|pastry)$"]["name"]');
    expect(selectorOf({ key: "craft" })).toBe('["craft"]["name"]');
    expect(selectorOf({ key: "shop", not: ["wholesale"] })).toBe('["shop"]["shop"!~"^(wholesale)$"]["name"]');
  });
  it("merges conditions per key and drops low-value values from any-value keys", () => {
    const merged = mergeTags(
      [{ key: "shop", values: ["a"] }, { key: "shop", values: ["b"] }, { key: "craft" }, { key: "office", values: ["x"] }, { key: "office", not: ["gov"] }],
      [{ key: "craft", values: ["welder"] }, { key: "office", values: ["logistics"] }],
    );
    expect(merged).toEqual([
      { key: "shop", values: ["a", "b"] },
      { key: "craft", not: ["welder"] },
      { key: "office", not: ["gov", "logistics"] },
    ]);
  });
});
