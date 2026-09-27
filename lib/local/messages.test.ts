import { describe, expect, it } from "vitest";
import { benefitOf, buildMessages, demoLine, fillTemplate, introFor, mailtoLink, waLink } from "./messages";
import { defaultSettings } from "@/lib/defaults";

const biz = { name: "Sai Dental Care", area: "Andheri", catKey: "dentist", catLabel: "dental clinic", segment: "no_website" as const, evidence: "", website: "" };

describe("messages", () => {
  it("benefit by category", () => {
    expect(benefitOf("dentist")).toMatch(/appointment/);
    expect(benefitOf("cafe")).toMatch(/menu/);
    expect(benefitOf("zzz")).toMatch(/past work/);
  });
  it("intro by segment, never claiming Google", () => {
    expect(introFor(biz)).toBe("Hello! I came across Sai Dental Care, your dental clinic in Andheri, and noticed you do not have a website yet.");
    expect(introFor({ ...biz, segment: "site_down", evidence: "it is not opening (the server is not responding)" })).toBe(
      "Hello! I tried to open the website listed online for Sai Dental Care today and it is not opening (the server is not responding).",
    );
    for (const s of ["no_website", "site_down", "old_site", "social_only"] as const) {
      expect(introFor({ ...biz, segment: s, evidence: "x" })).not.toMatch(/google/i);
    }
  });
  it("demo line with and without a link", () => {
    expect(demoLine("Sai", "https://cp.app/d/sai")).toContain("https://cp.app/d/sai");
    expect(demoLine("Sai", "https://cp.app/d/sai")).toMatch(/samples/);
    expect(demoLine("Sai", null)).toMatch(/Should I\?/);
  });
  it("fills only known placeholders", () => {
    expect(fillTemplate("{name} {area} {unknown}", { name: "A", area: "B" })).toBe("A B {unknown}");
  });
  it("builds WhatsApp and email text from the settings template", () => {
    const m = buildMessages(biz, defaultSettings(), "https://cp.app/d/sai-dental-care");
    expect(m.whatsapp.startsWith("Hello! I came across Sai Dental Care")).toBe(true);
    expect(m.whatsapp).toContain("https://cp.app/d/sai-dental-care");
    expect(m.whatsapp).not.toMatch(/\{[a-z_]+\}/);
    expect(m.emailSubject).toBe("A free demo website for Sai Dental Care");
    expect(m.emailBody).toMatch(/^Hello,\n\nI came across Sai Dental Care/);
    expect(m.emailBody).toContain("Kalpesh Malusare");
  });
  it("links", () => {
    expect(waLink("919820011111", "Hi & bye")).toBe("https://wa.me/919820011111?text=Hi%20%26%20bye");
    expect(waLink("", "x")).toBeNull();
    expect(mailtoLink("a@b.in", "S & T", "B")).toBe("mailto:a@b.in?subject=S%20%26%20T&body=B");
  });
});
