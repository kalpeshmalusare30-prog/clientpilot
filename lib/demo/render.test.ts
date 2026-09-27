import { describe, expect, it } from "vitest";
import { demoVarsFor, escapeHtml, renderDemo } from "./render";
import { TEMPLATES } from "./templates.gen";
import type { LocalBiz, TemplateKey } from "@/lib/types";

const biz = (over: Partial<LocalBiz> = {}): LocalBiz => ({
  id: "node/1", slug: "amar-fast-food-restaurant", name: "Amar Fast Food & Restaurant", area: "Andheri", catKey: "restaurant", catLabel: "restaurant",
  addr: "", waNum: "919820011111", telNum: "", phoneDisplay: "+91 98200 11111", email: "", website: "", social: "", segment: "no_website", evidence: "",
  whatsapp: "", emailSubject: "", emailBody: "", template: "cafe", createdAt: "", ...over,
});

describe("escapeHtml", () => {
  it("escapes the five HTML metacharacters", () => {
    expect(escapeHtml(`<a href="x">Tom's & Co</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom&#39;s &amp; Co&lt;/a&gt;");
  });
});

describe("renderDemo", () => {
  for (const key of Object.keys(TEMPLATES) as TemplateKey[]) {
    it(`${key}: fills every token, keeps the badge and noindex`, () => {
      const html = renderDemo(key, demoVarsFor(biz({ template: key }), 2026));
      expect(html).not.toMatch(/\{\{[A-Z_]+\}\}/);
      expect(html).toMatch(/Demo preview — made for/);
      expect(html).toMatch(/<meta name="robots" content="noindex/);
      expect(html).toContain("Amar Fast Food &amp; Restaurant");
      expect(html).toContain("wa.me/919820011111?text=Hi%20Amar%20Fast%20Food%20%26%20Restaurant");
    });
  }
  it("escapes hostile names in text and encodes them in links", () => {
    const html = renderDemo("general", demoVarsFor(biz({ name: '<script>alert(1)</script>' }), 2026));
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("%3Cscript%3Ealert(1)%3C%2Fscript%3E");
  });
  it("falls back to the landline and a Mumbai area", () => {
    const v = demoVarsFor(biz({ waNum: "", telNum: "912226741533", phoneDisplay: "", area: "" }), 2026);
    expect(v).toMatchObject({ waNumber: "912226741533", phoneDisplay: "+91 2226741533", area: "Mumbai" });
  });
});
