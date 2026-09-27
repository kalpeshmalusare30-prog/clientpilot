import { describe, expect, it } from "vitest";
import { demoUrl, hasPhone, slugify, templateFor, uniqueSlug } from "./biz";

describe("templateFor", () => {
  it("picks print, dental (dentists only), cafe, else general", () => {
    expect(templateFor("copyshop", "print shop")).toBe("print");
    expect(templateFor("dentist", "dental clinic")).toBe("dental");
    expect(templateFor("hospital", "hospital")).toBe("general");
    expect(templateFor("clinic", "clinic")).toBe("general");
    expect(templateFor("restaurant", "restaurant")).toBe("cafe");
    expect(templateFor("hairdresser", "salon")).toBe("general");
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
