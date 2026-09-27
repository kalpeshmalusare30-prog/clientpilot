import type { LocalBiz, TemplateKey } from "@/lib/types";

/** Dental is for dentists/orthodontists only; hospitals and clinics get the neutral page. */
export function templateFor(catKey: string, catLabel: string): TemplateKey {
  const c = `${catKey} ${catLabel}`.toLowerCase();
  if (/print|xerox|copy|stationer|photo studio/.test(c)) return "print";
  if (/dent|orthodont/.test(c)) return "dental";
  if (/restaurant|cafe|food|bakery|deli|sweet|confectionery|beverage|tea|coffee/.test(c)) return "cafe";
  return "general";
}

/** Same rule as make-demo.js, so existing demo slugs (a9-digital-prints, …) are unchanged. */
export function slugify(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  return s || "biz";
}

export function uniqueSlug(name: string, taken: Set<string>): string {
  const base = slugify(name);
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  taken.add(slug);
  return slug;
}

export function demoUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/+$/, "")}/d/${slug}`;
}

/** A demo needs a number for its call/WhatsApp buttons. */
export function hasPhone(b: Pick<LocalBiz, "waNum" | "telNum">): boolean {
  return !!(b.waNum || b.telNum);
}
