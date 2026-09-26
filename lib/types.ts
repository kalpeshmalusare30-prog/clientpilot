export type Status = "new" | "drafted" | "sent" | "replied" | "won" | "lost" | "skipped";
export const STATUSES: Status[] = ["new", "drafted", "sent", "replied", "won", "lost", "skipped"];

/** One freelance gig. `id` is "<source>:<source id>", e.g. "freelancer.com:40734895". */
export interface Gig {
  id: string;
  source: string;
  title: string;
  desc: string;
  url: string;
  /** ISO timestamp of the post, or "" when the source gave none. */
  date: string;
  budget: string;
  tags: string[];
  /** Source-specific note, e.g. "12 bids", "low-bids (4 bids)", company name. */
  extra: string;
  score: number;
  /** ISO timestamp of the cron run that first stored this gig. */
  fetchedAt: string;
}

export interface LastRun {
  at: string;
  added: number;
  /** Source keys that threw during this run. */
  failed: string[];
}

export interface GigsDoc {
  updatedAt: string;
  lastRun: LastRun | null;
  items: Gig[];
}

export type LeadKind = "gig" | "local";

export interface LeadState {
  kind: LeadKind;
  status: Status;
  proposal?: string;
  bidAmount?: number;
  bidCurrency?: string;
  sentAt?: string;
  followUpAt?: string;
  notes?: string;
  updatedAt: string;
}

export type Segment = "site_down" | "no_website" | "old_site" | "social_only";
export type TemplateKey = "print" | "dental" | "cafe" | "general";

export interface LocalBiz {
  id: string;
  slug: string;
  name: string;
  area: string;
  catKey: string;
  catLabel: string;
  /** Street address from OpenStreetMap, "" when unknown. */
  addr: string;
  /** Digits only, with country code, e.g. "919322214085". "" when unknown. */
  waNum: string;
  telNum: string;
  phoneDisplay: string;
  email: string;
  website: string;
  social: string;
  segment: Segment;
  evidence: string;
  whatsapp: string;
  emailSubject: string;
  emailBody: string;
  template: TemplateKey;
  createdAt: string;
}

export interface Settings {
  /** The only facts the AI may state about Kalpesh. */
  facts: string;
  /** Claims the AI must never make, one per line. */
  never: string;
  allowedLinks: string[];
  pricing: string;
  /** WhatsApp template; placeholders {intro} {name} {area} {category} {benefit} {demo_line}. */
  waTemplate: string;
}

export interface DataDoc {
  state: Record<string, LeadState>;
  local: LocalBiz[];
  settings: Settings;
  updatedAt: string;
}
