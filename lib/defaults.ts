import type { DataDoc, GigsDoc, Settings } from "./types";

export const DEFAULT_FACTS = `KALPESH MALUSARE — Mumbai, India.
- ~4 years professional experience (since Jun 2022).
- Oct 2022–present: Frontend Developer & UI/UX Designer at Kaizen Infotech Solutions, Mumbai — leads frontend work on React + TypeScript products, from Figma prototypes to production. His portfolio states he builds "React platforms used across five countries".
- Jun 2022–Oct 2022: Web Designer & Developer at Swami Product Search Infotech, Mumbai — managed client projects end to end on WordPress.
- BSc Information Technology, University of Mumbai.
- Stack (portfolio): React, Next.js, TypeScript, Tailwind CSS, Node.js, Express, Redux, React Query, Framer Motion, Figma, Adobe XD, REST APIs, WordPress.
- Flagship shipped product: Agent Bandhu — WhatsApp-based CRM for Indian insurance agents (tracks renewals, birthdays, every client conversation in one dashboard). React, TypeScript, dashboard UI, WhatsApp API. Live: https://agentbandhu.com
- Portfolio: https://kalpesh-malusare.vercel.app
- Recent self-built projects (Sept 2026):
  * Live responsive business-website demos: https://demos-kal1201.vercel.app
  * ReelPilot — AI video automation platform: Next.js dashboard + Node.js worker + SQLite + Remotion programmatic video rendering + Gemini LLM + YouTube Data API (OAuth, scheduled publishing). Private dashboard, no public URL.
  * ProspectPilot — B2B prospecting CRM: Next.js 14 + TypeScript + Prisma/SQLite, lead search, kanban pipeline, tasks, CSV import/export. Not publicly deployed.
  * Lead Hunter — Node.js aggregator of 9 public job APIs/RSS feeds with a dashboard.`;

export const DEFAULT_NEVER = `Shipped React Native / native mobile apps
Payment or payout systems (Stripe/PayPal/Wise) in production
PHP/Laravel, Python/Django, DevOps/Kubernetes, blockchain
Named clients other than the employers above
Reviews, ratings or testimonials (he is a new Freelancer.com account with zero reviews)
An agency or a team`;

export const DEFAULT_ALLOWED_LINKS = [
  "https://agentbandhu.com",
  "https://kalpesh-malusare.vercel.app",
  "https://demos-kal1201.vercel.app",
];

export const DEFAULT_PRICING = `Freelancer.com profile rate: $15/hr.
Stage | International | Local (India)
0 reviews (first 5 projects) | $8–12/hr or small fixed ($50–300) | ₹10k–25k per website
5+ reviews | $15–25/hr | ₹30k–75k
15+ reviews / niche expert | $30–50/hr | ₹1L+
Always take 30–50% advance from direct clients. Discounts are fine, free work is not.`;

export const DEFAULT_WA_TEMPLATE = `{intro} I am Kalpesh, a web developer from Mumbai.

A simple website would help {name}:
- People in {area} can find you online, with your timings and location
- {benefit}
- Inquiries come straight to your WhatsApp, even after closing hours

{demo_line}`;

export function defaultSettings(): Settings {
  return {
    facts: DEFAULT_FACTS,
    never: DEFAULT_NEVER,
    allowedLinks: [...DEFAULT_ALLOWED_LINKS],
    pricing: DEFAULT_PRICING,
    waTemplate: DEFAULT_WA_TEMPLATE,
  };
}

export function emptyGigs(nowIso: string): GigsDoc {
  return { updatedAt: nowIso, lastRun: null, items: [] };
}

export function emptyData(nowIso: string): DataDoc {
  return { state: {}, local: [], settings: defaultSettings(), updatedAt: nowIso };
}

/** Fills anything a stored document is missing (older shape, partial settings). */
export function normalizeData(doc: DataDoc): DataDoc {
  const d = defaultSettings();
  const s: Partial<Settings> = doc.settings ?? {};
  return {
    state: doc.state ?? {},
    local: doc.local ?? [],
    updatedAt: doc.updatedAt ?? "",
    settings: {
      facts: s.facts ?? d.facts,
      never: s.never ?? d.never,
      allowedLinks: Array.isArray(s.allowedLinks) && s.allowedLinks.length ? s.allowedLinks : d.allowedLinks,
      pricing: s.pricing ?? d.pricing,
      waTemplate: s.waTemplate ?? d.waTemplate,
    },
  };
}
