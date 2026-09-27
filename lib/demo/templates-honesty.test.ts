import { describe, expect, it } from "vitest";
import { HIDE_WA_STYLE, demoVarsFor, renderDemo } from "./render";
import { TEMPLATES } from "./templates.gen";
import type { LocalBiz, TemplateKey } from "@/lib/types";

const biz = (over: Partial<LocalBiz> = {}): LocalBiz => ({
  id: "node/1", slug: "shree-sai-snacks", name: "Shree Sai Snacks", area: "Thane", catKey: "restaurant", catLabel: "restaurant",
  addr: "", waNum: "919820011111", telNum: "", phoneDisplay: "+91 98200 11111", email: "", website: "", social: "", segment: "no_website", evidence: "",
  whatsapp: "", emailSubject: "", emailBody: "", template: "cafe", createdAt: "", ...over,
});

const FORBIDDEN = [
  "Rane", "400 053", "400053", "Est. 2019", "on Google", "Open now", ".cafe", "Mumbai, Mumbai", "Thane, Mumbai", "+Thane+Mumbai",
  "Keema", "Omelette", "Egg", "Priya Sardesai", "Rahul Kamble", "Meher Doshi", "900+", "300+", "4.8", "4.9", "Open 7 days",
  "Linking Road", "Sai Plaza",
];
const NOTICE = "Free demo made for Shree Sai Snacks by Kalpesh Malusare. Text, menu, prices, timings and photos are samples, not real details of Shree Sai Snacks.";
const KEYS = Object.keys(TEMPLATES) as TemplateKey[];

describe("demo templates publish no invented specifics", () => {
  for (const key of KEYS) {
    const html = renderDemo(key, demoVarsFor(biz({ template: key }), 2026));
    it(`${key}: none of the invented claims`, () => {
      // Icon path data and CSS hold numbers like "4.8"; only visible text and attributes count.
      const text = html.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
      const found = FORBIDDEN.filter((s) => text.includes(s));
      expect(found).toEqual([]);
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
