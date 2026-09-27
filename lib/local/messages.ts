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

type MsgBiz = Pick<LocalBiz, "name" | "area" | "catKey" | "catLabel" | "segment" | "evidence" | "website">;

/** Opening line per segment. Leads come from OpenStreetMap, so never claim "on Google". */
export function introFor(b: MsgBiz): string {
  switch (b.segment) {
    case "site_down":
      return `Hello! I tried to open the website listed online for ${b.name} today and ${b.evidence || "it is not opening"}.`;
    case "old_site":
      return `Hello! I visited the website of ${b.name} and noticed ${b.evidence || "it looks outdated"}.`;
    case "social_only":
      return `Hello! I came across ${b.name} and saw you are active on social media, but there is no website of your own.`;
    default:
      return `Hello! I came across ${b.name}, your ${b.catLabel} in ${b.area}, and noticed you do not have a website yet.`;
  }
}

export function demoLine(name: string, url: string | null): string {
  return url
    ? `I have made a FREE demo website for ${name} - please open it on your phone: ${url}\nTimings, rates and address on it are only samples - I will put in your real details. No charge, no risk: if you like it, reply YES and we talk further.`
    : `I can make a FREE demo website for ${name} - no charge, no risk. Should I? Just reply YES.`;
}

export function fillTemplate(tpl: string, vars: Partial<Record<"intro" | "name" | "area" | "category" | "benefit" | "demo_line", string>>): string {
  return tpl.replace(/\{(intro|name|area|category|benefit|demo_line)\}/g, (whole, k: keyof typeof vars) => vars[k] ?? whole);
}

const SIGN_EMAIL = "\n\nBest regards,\nKalpesh Malusare\nWeb Developer, Mumbai\nPortfolio: https://kalpesh-malusare.vercel.app\nWhatsApp: +91 88051 79649";

function subjectFor(b: MsgBiz): string {
  switch (b.segment) {
    case "site_down":
      return `Your website is not opening - ${b.name}`;
    case "old_site":
      return `Quick note about the ${b.name} website`;
    case "social_only":
      return `A website to go with ${b.name}'s social media page`;
    default:
      return `A free demo website for ${b.name}`;
  }
}

export function buildMessages(b: MsgBiz, settings: Settings, demoUrl: string | null): { whatsapp: string; emailSubject: string; emailBody: string } {
  const whatsapp = fillTemplate(settings.waTemplate, {
    intro: introFor(b),
    name: b.name,
    area: b.area,
    category: b.catLabel,
    benefit: benefitOf(b.catKey),
    demo_line: demoLine(b.name, demoUrl),
  }).trim();
  return {
    whatsapp,
    emailSubject: subjectFor(b),
    emailBody: `Hello,\n\n${whatsapp.replace(/^Hello! /, "")}${SIGN_EMAIL}`,
  };
}

export function waLink(num: string, text: string): string | null {
  const digits = num.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}

export function mailtoLink(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
