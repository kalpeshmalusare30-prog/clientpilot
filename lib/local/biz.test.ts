import { describe, expect, it } from "vitest";
import { demoTemplateOf, demoUrl, hasPhone, slugify, templateFor, uniqueSlug } from "./biz";

describe("templateFor", () => {
  it("picks the trade design by OSM value: dental for dentists only, health for other clinics, else general", () => {
    expect(templateFor("copyshop", "print shop")).toBe("print");
    expect(templateFor("dentist", "dental clinic")).toBe("dental");
    expect(templateFor("hospital", "hospital")).toBe("health");
    expect(templateFor("clinic", "clinic")).toBe("health");
    expect(templateFor("restaurant", "restaurant")).toBe("cafe");
    expect(templateFor("hairdresser", "salon")).toBe("salon");
    expect(templateFor("hotel", "hotel")).toBe("general");
    expect(templateFor("zzz", "zzz")).toBe("general");
  });
  it("falls back to label words for leads whose key is not an OSM value", () => {
    expect(templateFor("business", "Ladies Beauty Parlour")).toBe("salon");
    expect(templateFor("business", "Chartered Accountant")).toBe("pro");
    expect(templateFor("business", "Pathology lab")).toBe("health");
    expect(templateFor("business", "IIT-JEE coaching classes")).toBe("coaching");
    expect(templateFor("business", "Two wheeler garage")).toBe("auto");
    expect(templateFor("business", "Banquet hall")).toBe("events");
    expect(templateFor("business", "Saree boutique")).toBe("retail");
    expect(templateFor("business", "Xerox centre")).toBe("print");
    expect(templateFor("business", "Hotel")).toBe("general");
  });
});

describe("demoTemplateOf", () => {
  it("upgrades an old 'general' lead to the design that now fits, unless general was picked by hand", () => {
    expect(demoTemplateOf({ template: "general", catKey: "hairdresser", catLabel: "salon" })).toBe("salon");
    expect(demoTemplateOf({ template: "general", templatePinned: true, catKey: "hairdresser", catLabel: "salon" })).toBe("general");
    expect(demoTemplateOf({ template: "cafe", catKey: "hairdresser", catLabel: "salon" })).toBe("cafe");
    expect(demoTemplateOf({ template: "general", catKey: "hotel", catLabel: "hotel" })).toBe("general");
  });
});

describe("slugs", () => {
  it("slugifies like make-demo.js", () => {
    expect(slugify("A9 Digital Prints")).toBe("a9-digital-prints");
    expect(slugify("Dr Bhanushali's Dental Studio")).toBe("dr-bhanushali-s-dental-studio");
    expect(slugify("Cromā")).toBe("crom");
    expect(slugify("सेवा")).toBe("biz");
  });
  it("makes slugs unique", () => {
    const taken = new Set(["the-bodhi-cafe", "the-bodhi-cafe-2"]);
    expect(uniqueSlug("The Bodhi Cafe", taken)).toBe("the-bodhi-cafe-3");
    expect(taken.has("the-bodhi-cafe-3")).toBe(true);
  });
  it("demo helpers", () => {
    expect(demoUrl("https://cp.vercel.app/", "a9")).toBe("https://cp.vercel.app/d/a9");
    expect(hasPhone({ waNum: "", telNum: "" })).toBe(false);
    expect(hasPhone({ waNum: "", telNum: "912226741533" })).toBe(true);
  });
});
