import { istDayEnd } from "@/lib/time";
import type { LocalBiz, Settings } from "@/lib/types";

const BENEFIT_BULLETS = {
  food: "Customers can see your menu, photos and location before visiting",
  health: "Patients can check your services and timings, and send appointment inquiries directly",
  fitness: "People nearby can see your plans and photos, and send membership inquiries",
  hotel: "Guests can see your rooms and photos, and send booking inquiries directly to you - no commission to booking apps",
  education: "Parents and students can see your courses and batches, and send admission inquiries",
  beauty: "Clients can see your services and work photos, and book directly",
  shop: "Customers can browse your products and photos before they walk in",
  default: "Customers can see your services and past work before they contact you",
};

export function benefitOf(catKey: string): string {
  if (/restaurant|cafe|fast_food|bakery|confectionery|deli|seafood|beverages/.test(catKey)) return BENEFIT_BULLETS.food;
  if (/clinic|dentist|doctors|hospital|pharmacy|veterinary|healthcare/.test(catKey)) return BENEFIT_BULLETS.health;
  if (/gym|fitness|sports/.test(catKey)) return BENEFIT_BULLETS.fitness;
  if (/hotel|guest_house/.test(catKey)) return BENEFIT_BULLETS.hotel;
  if (/coaching|driving_school|school|college|educat|institut|tuition|university|kindergarten|music|dance/.test(catKey)) return BENEFIT_BULLETS.education;
  if (/hairdresser|beauty|tailor|photo/.test(catKey)) return BENEFIT_BULLETS.beauty;
  if (/supermarket|clothes|jewelry|furniture|electronics|mobile_phone|hardware|optician|store|books|gift|toys|shoes|florist/.test(catKey)) return BENEFIT_BULLETS.shop;
  return BENEFIT_BULLETS.default;
}

type MsgBiz = Pick<LocalBiz, "name" | "area" | "catKey" | "catLabel" | "segment" | "evidence" | "website"> & { auditedAt?: string };

/** The website check ran on the same IST calendar day as `nowIso`. */
function checkedToday(auditedAt: string | undefined, nowIso: string): boolean {
  const a = Date.parse(auditedAt ?? "");
  const n = Date.parse(nowIso);
  return Number.isFinite(a) && Number.isFinite(n) && istDayEnd(a) === istDayEnd(n);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** " today", " on 19 Sep", or " recently" when the check date is unknown. */
function whenChecked(auditedAt: string | undefined, nowIso: string): string {
  if (checkedToday(auditedAt, nowIso)) return " today";
  const a = Date.parse(auditedAt ?? "");
  if (!Number.isFinite(a)) return " recently";
  const ist = new Date(a + 5.5 * 3_600_000); // the IST calendar day, read with UTC getters
  return ` on ${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]}`;
}

/**
 * Opening line per segment. It only claims what the app knows: leads come from OpenStreetMap (never "on Google"),
 * a missing website tag means we could not find one (not that they have none), and a website check is dated.
 */
export function introFor(b: MsgBiz, nowIso: string = new Date().toISOString()): string {
  const today = checkedToday(b.auditedAt, nowIso);
  switch (b.segment) {
    case "site_down":
      return `Hello! I tried to open the website listed online for ${b.name}${whenChecked(b.auditedAt, nowIso)} and ${b.evidence || "it is not opening"}.${today ? "" : " If it is working again now, please ignore this part."}`;
    case "old_site":
      return `Hello! I visited the website of ${b.name}${whenChecked(b.auditedAt, nowIso)} and noticed ${b.evidence || "it looks outdated"}.${today ? "" : " If it has been updated since, please ignore this part."}`;
    case "social_only":
      return `Hello! I came across ${b.name} and saw your social media page, but could not find a website of your own listed online.`;
    default:
      return `Hello! I came across ${b.name}, your ${b.catLabel} in ${b.area}, and could not find a website listed for it online.`;
  }
}

export function demoLine(name: string, url: string | null): string {
  return url
    ? `I have made a FREE demo website for ${name} - please open it on your phone: ${url}\nThe text, photos, menu, prices and timings on it are only samples - I will put in your real details. No charge, no risk: if you like it, reply YES and we talk further.`
    : `I can make a FREE demo website for ${name} - no charge, no risk. Should I? Just reply YES.`;
}

export function fillTemplate(tpl: string, vars: Partial<Record<"intro" | "name" | "area" | "category" | "benefit" | "demo_line", string>>): string {
  return tpl.replace(/\{(intro|name|area|category|benefit|demo_line)\}/g, (whole, k: keyof typeof vars) => vars[k] ?? whole);
}

const SIGN_EMAIL = "\n\nBest regards,\nKalpesh Malusare\nWeb Developer, Mumbai\nPortfolio: https://kalpesh-malusare.vercel.app\nWhatsApp: +91 88051 79649";

function subjectFor(b: MsgBiz, nowIso: string): string {
  switch (b.segment) {
    case "site_down":
      return checkedToday(b.auditedAt, nowIso) ? `Your website is not opening - ${b.name}` : `About the ${b.name} website`;
    case "old_site":
      return `Quick note about the ${b.name} website`;
    case "social_only":
      return `A website to go with ${b.name}'s social media page`;
    default:
      return `A free demo website for ${b.name}`;
  }
}

export function buildMessages(
  b: MsgBiz,
  settings: Settings,
  demoUrl: string | null,
  nowIso: string = new Date().toISOString(),
): { whatsapp: string; emailSubject: string; emailBody: string } {
  const whatsapp = fillTemplate(settings.waTemplate, {
    intro: introFor(b, nowIso),
    name: b.name,
    area: b.area,
    category: b.catLabel,
    benefit: benefitOf(b.catKey),
    demo_line: demoLine(b.name, demoUrl),
  }).trim();
  return {
    whatsapp,
    emailSubject: subjectFor(b, nowIso),
    emailBody: `Hello,\n\n${whatsapp.replace(/^Hello! /, "")}${SIGN_EMAIL}`,
  };
}

export function waLink(num: string, text: string): string | null {
  const digits = num.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}

/** Strict: letters, digits and . _ + - before the @; a dotted host with a letter TLD. No ?, &, %, spaces or a second @. */
const EMAIL_RE = /^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

/** "" for anything but a strict address, so an OpenStreetMap value cannot add ?bcc= or ?to= headers. */
export function mailtoLink(email: string, subject: string, body: string): string {
  if (!isValidEmail(email)) return "";
  return `mailto:${encodeURIComponent(email).replace(/%40/g, "@")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
