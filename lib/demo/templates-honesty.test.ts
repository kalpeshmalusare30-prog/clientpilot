import { describe, expect, it } from "vitest";
import { HIDE_WA_STYLE, demoVarsFor, renderDemo } from "./render";
import { TEMPLATES } from "./templates.gen";
import { TEMPLATE_KEYS, type LocalBiz, type TemplateKey } from "@/lib/types";

const biz = (over: Partial<LocalBiz> = {}): LocalBiz => ({
  id: "node/1", slug: "shree-sai-snacks", name: "Shree Sai Snacks", area: "Thane", catKey: "restaurant", catLabel: "restaurant",
  addr: "", waNum: "919820011111", telNum: "", phoneDisplay: "+91 98200 11111", email: "", website: "", social: "", segment: "no_website", evidence: "",
  whatsapp: "", emailSubject: "", emailBody: "", template: "cafe", createdAt: "", ...over,
});

const FORBIDDEN = [
  "Rane", "400 053", "400053", "Est. 2019", "on Google", "Open now", ".cafe", "Mumbai, Mumbai", "Thane, Mumbai", "+Thane+Mumbai",
  "Keema", "Omelette", "Egg", "Priya Sardesai", "Rahul Kamble", "Meher Doshi", "900+", "300+", "4.8", "4.9", "Open 7 days",
  "Linking Road", "Sai Plaza", "What patients say", "Sample review", "Hospital-grade", "unsplash", "fonts.googleapis",
];
const NOTICE = "Free demo made for Shree Sai Snacks by Kalpesh Malusare. Text, menu, prices, timings and photos are samples, not real details of Shree Sai Snacks.";
const KEYS = Object.keys(TEMPLATES) as TemplateKey[];

/** Invented credentials, social proof and superlatives, in any template (new ones are covered automatically). */
const CLAIM_RE = [
  /\b\d+\s*\+/, // "500+ members"
  /\byears? of\b|\bsince \d{4}\b|\bestablished\b|\bEst\./i,
  /\bcertified\b|\baward|\bexperts?\b|\bexperienced\b|\bspecialists? in\b|\btrusted\b|\bguarantee/i,
  /\bthe best\b|\bbest (in|of)\b|\bno\.?\s?1\b|#1\b|\bleading\b|\btop[- ]rated\b/i,
  /\breviews\b|\b(customer|patient|google) reviews?\b|\btestimonials?\b|\bhappy (clients|customers|patients)\b|\brated\b|★|⭐/i,
  /\bopen now\b|\b24\s*[x×/]\s*7\b|\bfree (home )?delivery\b|\bdiscount\b|% off/i,
  /@[a-z0-9_.]{3,}/i, // social handles
];

describe("every template is bundled and typed", () => {
  it("TEMPLATES has exactly the keys in TEMPLATE_KEYS", () => {
    expect([...KEYS].sort()).toEqual([...TEMPLATE_KEYS].sort());
  });
});

describe("demo templates publish no invented specifics", () => {
  for (const key of KEYS) {
    const html = renderDemo(key, demoVarsFor(biz({ template: key }), 2026));
    it(`${key}: none of the invented claims`, () => {
      // Icon path data and CSS hold numbers like "4.8"; only visible text and attributes count.
      const text = html.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
      const found = FORBIDDEN.filter((s) => text.includes(s));
      expect(found).toEqual([]);
    });
    it(`${key}: no invented credentials, reviews, superlatives or handles`, () => {
      const visible = html.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "")
        .replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&");
      const hits = CLAIM_RE.map((re) => re.exec(visible)?.[0]).filter(Boolean);
      expect(hits).toEqual([]);
    });
    it(`${key}: hours and rates are labelled as samples`, () => {
      expect(html).toMatch(/Sample timings|Sample timetable|Sample batch timings/);
      if (/₹/.test(html)) expect(html).toMatch(/Sample (prices|rates)/);
    });
    it(`${key}: shows the sample-content notice`, () => {
      expect(html).toContain(NOTICE);
    });
    it(`${key}: map searches use name + area only`, () => {
      const maps = [...html.matchAll(/href="(https:\/\/www\.google\.com\/maps[^"]*)"/g)].map((m) => m[1]);
      for (const u of maps) {
        expect(u).toMatch(/query=Shree%20Sai%20Snacks\+Thane$/);
        expect(u).not.toMatch(/Mumbai/);
      }
    });
    it(`${key}: shows the stored address, or says where it goes`, () => {
      expect(renderDemo(key, demoVarsFor(biz({ template: key, addr: "12, Station Rd" }), 2026))).toContain("12, Station Rd");
      expect(html).toContain("Full address goes here");
    });
    it(`${key}: a landline page hides every WhatsApp element but keeps a call button`, () => {
      const land = renderDemo(key, demoVarsFor(biz({ template: key, waNum: "", telNum: "912225401234", phoneDisplay: "+91 22 2540 1234" }), 2026));
      expect(land).toContain(HIDE_WA_STYLE);
      const waAnchors = [...land.matchAll(/<a\b[^>]*href="https:\/\/wa\.me\/[^"]*"[^>]*>/g)].map((m) => m[0]);
      expect(waAnchors.length).toBeGreaterThan(0);
      for (const a of waAnchors) expect(a).toMatch(/\sdata-wa\b/);
      const telAnchors = [...land.matchAll(/<a\b[^>]*href="tel:\+912225401234"[^>]*>/g)].map((m) => m[0]);
      expect(telAnchors.some((a) => !/\sdata-wa\b/.test(a))).toBe(true);
    });
  }
});
