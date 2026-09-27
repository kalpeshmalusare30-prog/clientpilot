import type { LocalBiz, TemplateKey } from "@/lib/types";
import { TEMPLATES } from "./templates.gen";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export interface DemoVars {
  name: string;
  area: string;
  phoneDisplay: string;
  /** Digits only; used for wa.me and tel: links. */
  waNumber: string;
  category: string;
  year: number;
  /** Street address from OpenStreetMap; "" when unknown (the page then says the full address goes here). */
  addr?: string;
  /** false for a landline-only business: every WhatsApp element (marked data-wa) is hidden. Default true. */
  hasWhatsApp?: boolean;
}

export function demoVarsFor(b: LocalBiz, year: number): DemoVars {
  const num = (b.waNum || b.telNum).replace(/\D/g, "");
  return {
    name: b.name,
    area: b.area || "Mumbai",
    phoneDisplay: b.phoneDisplay || (num ? "+" + num.replace(/^91/, "91 ") : ""),
    waNumber: num,
    category: b.catLabel || "local business",
    year,
    addr: b.addr ?? "",
    hasWhatsApp: !!b.waNum,
  };
}

/** Injected for landline-only businesses: WhatsApp buttons would open "not on WhatsApp", so they are hidden. */
export const HIDE_WA_STYLE = "<style>[data-wa]{display:none!important}</style>";

/** Text/attribute tokens are HTML-escaped; *_URL tokens (inside href) are URL-encoded. */
export function renderDemo(key: TemplateKey, v: DemoVars): string {
  const addr = (v.addr ?? "").trim();
  const map: Record<string, string> = {
    "{{BIZ_NAME_URL}}": encodeURIComponent(v.name),
    "{{AREA_URL}}": encodeURIComponent(v.area),
    "{{PHONE_DISPLAY_URL}}": encodeURIComponent(v.phoneDisplay),
    "{{BIZ_NAME}}": escapeHtml(v.name),
    "{{AREA}}": escapeHtml(v.area),
    "{{ADDR}}": addr ? escapeHtml(addr) : "Full address goes here",
    "{{PHONE_DISPLAY}}": escapeHtml(v.phoneDisplay),
    "{{CATEGORY}}": escapeHtml(v.category),
    "{{WA_NUMBER}}": v.waNumber.replace(/\D/g, ""),
    "{{YEAR}}": String(v.year),
  };
  let html = TEMPLATES[key] ?? TEMPLATES.general;
  for (const [token, value] of Object.entries(map)) html = html.split(token).join(value);
  if (v.hasWhatsApp === false) html = html.replace(/<\/head>/i, `${HIDE_WA_STYLE}</head>`);
  return html;
}
