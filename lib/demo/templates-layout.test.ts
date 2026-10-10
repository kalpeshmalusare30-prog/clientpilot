import { describe, expect, it } from "vitest";
import { demoVarsFor, renderDemo } from "./render";
import { TEMPLATES } from "./templates.gen";
import type { LocalBiz, TemplateKey } from "@/lib/types";

// Guards for the phone layout of the public demo pages (opened from WhatsApp on 320–430px screens).
const biz = (over: Partial<LocalBiz> = {}): LocalBiz => ({
  id: "node/1", slug: "x", name: "Shree Siddhivinayak Xerox & Digital Print Hub", area: "Dombivli East", catKey: "shop", catLabel: "print shop",
  addr: "", waNum: "919820011111", telNum: "", phoneDisplay: "+91 98200 11111", email: "", website: "", social: "", segment: "no_website", evidence: "",
  whatsapp: "", emailSubject: "", emailBody: "", template: "print", createdAt: "", ...over,
});

const KEYS = Object.keys(TEMPLATES) as TemplateKey[];

/** Innermost `selector{declarations}` pairs of every <style> block (media-query prefixes stay in the selector text). */
function cssRules(html: string): { sel: string; body: string }[] {
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1].replace(/\/\*[\s\S]*?\*\//g, "")).join("\n");
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2].replace(/\s+/g, "") }));
}

describe("demo templates fit a phone screen", () => {
  for (const key of KEYS) {
    const html = renderDemo(key, demoVarsFor(biz({ template: key }), 2026));
    const rules = cssRules(html);

    it(`${key}: has a device-width viewport`, () => {
      expect(html).toMatch(/<meta name="viewport" content="width=device-width, initial-scale=1/);
    });

    it(`${key}: never sets white-space:nowrap without clipping it (long names overflowed the screen)`, () => {
      const bad = rules.filter((r) => /white-space:nowrap/.test(r.body) && !(/overflow:hidden/.test(r.body) && /text-overflow:ellipsis/.test(r.body)));
      expect(bad.map((r) => r.sel)).toEqual([]);
    });

    it(`${key}: the header name wraps to two lines instead of pushing the call button off screen`, () => {
      const name = rules.find((r) => r.sel === ".brand-name");
      expect(name?.body).toMatch(/-webkit-line-clamp:2/);
      expect(name?.body).toMatch(/overflow-wrap:anywhere/);
      expect(rules.find((r) => r.sel === ".brand")?.body).toMatch(/min-width:0/);
    });

    it(`${key}: the sample notice can wrap`, () => {
      const notice = /<div class="demo-sample-notice" style="([^"]*)"/.exec(html);
      expect(notice).not.toBeNull();
      expect(notice![1]).not.toMatch(/nowrap/);
      expect(notice![1]).toMatch(/overflow-wrap:anywhere/);
    });

    it(`${key}: the demo badge is clipped to the screen width`, () => {
      const badge = rules.find((r) => r.sel === ".demo-badge");
      expect(badge?.body).toMatch(/left:0;right:0|max-width:calc\(100vw/);
      expect(badge?.body).toMatch(/text-overflow:ellipsis/);
    });

    it(`${key}: scroll-reveal only hides content after the script has run`, () => {
      const hiding = rules.filter((r) => /\.reveal\b/.test(r.sel) && /opacity:0(?![.\d])/.test(r.body));
      expect(hiding.length).toBeGreaterThan(0);
      for (const r of hiding) expect(r.sel).toMatch(/^\.js-reveal \.reveal$/);
      expect(html).toContain("document.documentElement.classList.add('js-reveal')");
    });

    it(`${key}: the footer leaves room for the sticky action bar`, () => {
      expect(html).toMatch(/<nav class="dock"/);
      expect(rules.find((r) => r.sel === "footer")?.body).toMatch(/padding:[^;]*var\(--dock\)/);
    });

    it(`${key}: is self-contained (no external fonts, scripts or images)`, () => {
      expect(html).not.toMatch(/<link\b|<script\s[^>]*src=|<img\b|@import|url\(\s*["']?https?:/i);
      const hosts = [...html.matchAll(/https?:\/\/([^/"'\s?]+)/g)].map((m) => m[1]);
      expect(hosts.filter((h) => h !== "wa.me" && h !== "www.google.com")).toEqual([]);
    });

    it(`${key}: every tap target in the action bar and header is at least 44px`, () => {
      expect(rules.find((r) => r.sel === ".dock .btn")?.body).toMatch(/height:50px/);
      expect(rules.find((r) => r.sel === ".top-call")?.body).toMatch(/height:44px/);
      expect(rules.find((r) => r.sel === ".btn")?.body).toMatch(/min-height:52px/);
    });
  }
});
