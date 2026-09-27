import { describe, expect, it } from "vitest";
import { benefitOf, buildMessages, demoLine, fillTemplate, introFor, isValidEmail, mailtoLink, waLink } from "./messages";
import { defaultSettings } from "@/lib/defaults";

const NOW = "2026-09-28T06:00:00.000Z";
const biz = { name: "Sai Dental Care", area: "Andheri", catKey: "dentist", catLabel: "dental clinic", segment: "no_website" as const, evidence: "", website: "" };

describe("messages", () => {
  it("benefit by category", () => {
    expect(benefitOf("dentist")).toMatch(/appointment/);
    expect(benefitOf("cafe")).toMatch(/menu/);
    expect(benefitOf("zzz")).toMatch(/past work/);
  });
  it("intro by segment, never claiming Google", () => {
    expect(introFor(biz)).toBe("Hello! I came across Sai Dental Care, your dental clinic in Andheri, and could not find a website listed for it online.");
    expect(introFor({ ...biz, segment: "site_down", evidence: "it is not opening (the server is not responding)", auditedAt: NOW }, NOW)).toBe(
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

describe("F-7: outreach claims only what the app knows", () => {
  it("never says the business has no website or is active on social media", () => {
    for (const seg of ["no_website", "social_only"] as const) {
      const t = introFor({ ...biz, segment: seg }, NOW);
      expect(t).not.toMatch(/do not have a website|don't have a website|no website of your own|active on social/i);
      expect(t).toMatch(/could not find a website/);
    }
    expect(introFor({ ...biz, segment: "social_only" }, NOW)).toBe(
      "Hello! I came across Sai Dental Care and saw your social media page, but could not find a website of your own listed online.",
    );
  });
  it("site_down checked on an earlier day names that day and asks to ignore it if fixed", () => {
    const b = { ...biz, segment: "site_down" as const, evidence: "it is not opening", auditedAt: "2026-09-19" };
    const t = introFor(b, NOW);
    expect(t).toBe(
      "Hello! I tried to open the website listed online for Sai Dental Care on 19 Sep and it is not opening. If it is working again now, please ignore this part.",
    );
    expect(t).not.toMatch(/today/);
    const m = buildMessages(b, defaultSettings(), null, NOW);
    expect(m.emailSubject).toBe("About the Sai Dental Care website");
    expect(m.whatsapp).not.toMatch(/today/);
  });
  it("site_down checked today says today; the subject stays direct", () => {
    const b = { ...biz, segment: "site_down" as const, evidence: "it is not opening", auditedAt: "2026-09-28T01:00:00.000Z" };
    expect(introFor(b, NOW)).toMatch(/for Sai Dental Care today and it is not opening.$/);
    expect(buildMessages(b, defaultSettings(), null, NOW).emailSubject).toBe("Your website is not opening - Sai Dental Care");
  });
  it("site_down without a stored check date never says today", () => {
    const t = introFor({ ...biz, segment: "site_down", evidence: "it is not opening" }, NOW);
    expect(t).not.toMatch(/today/);
    expect(t).toMatch(/ignore this part/);
  });
  it("old_site names the check day when it was not today", () => {
    const t = introFor({ ...biz, segment: "old_site", evidence: "it looks outdated", auditedAt: "2026-09-19" }, NOW);
    expect(t).toMatch(/on 19 Sep/);
    expect(t).toMatch(/ignore this part/);
  });
  it("demo disclaimer covers text, photos, menu, prices and timings", () => {
    const l = demoLine("Sai", "https://cp.app/d/sai");
    expect(l).toContain("The text, photos, menu, prices and timings on it are only samples");
  });
});

describe("F-11: mailto only for a strict address, encoded", () => {
  it("rejects header injection and odd characters", () => {
    expect(mailtoLink("shop@x.com?bcc=spy%40evil.com&x=", "S", "B")).toBe("");
    expect(mailtoLink("a@b.com?to=c@d.com", "S", "B")).toBe("");
    expect(mailtoLink("a b@c.com", "S", "B")).toBe("");
    expect(mailtoLink("a@b", "S", "B")).toBe("");
    expect(isValidEmail("shop@x.com?bcc=spy%40evil.com")).toBe(false);
    expect(isValidEmail("Sales.Team+1@a9-prints.co.in")).toBe(true);
  });
  it("keeps a valid address", () => {
    expect(mailtoLink("Sales.Team+1@a9-prints.co.in", "S", "B")).toBe("mailto:Sales.Team%2B1@a9-prints.co.in?subject=S&body=B");
  });
});
