/* eslint-disable @typescript-eslint/no-explicit-any */
import { defaultSettings } from "./defaults";
import { score } from "./gigs/lead";
import { demoUrl, hasPhone, templateFor, uniqueSlug } from "./local/biz";
import { buildMessages } from "./local/messages";
import type { DataDoc, Gig, GigsDoc, LeadState, LocalBiz } from "./types";

/** Bids placed on Freelancer.com on 2026-09-26 (with Kalpesh's approval). */
export const PLACED_BIDS = [
  { pid: "40734895", amount: 18000, currency: "INR" },
  { pid: "40734538", amount: 7000, currency: "INR" },
  { pid: "40734499", amount: 18000, currency: "INR" },
  { pid: "40695993", amount: 380, currency: "USD" },
];
export const BIDS_SENT_AT = "2026-09-26T17:30:00.000Z";
export const BIDS_FOLLOW_UP = "2026-09-29T05:30:00.000Z"; // Tue 29 Sep, 11:00 IST
export const A9_ID = "node/12395684120";
export const A9_FOLLOW_UP = "2026-09-28T05:30:00.000Z"; // Mon 28 Sep, 11:00 IST
const A9_FIRST_PITCH = "2026-09-20T06:30:00.000Z";
const A9_NOTES =
  'First pitch sent 19–20 Sep; they replied "?". Send the follow-up below on WhatsApp from the same number around 11 AM. ' +
  "No reply by Monday evening → send the email. If they say YES: ₹10,000; small advance (₹2–3k) or pay after it is live; domain ~₹1,000/year extra.";

export interface ImportInput {
  leads: any[];
  mapLeads: any[];
  hunt: any;
  seen: Record<string, string>;
  origin: string;
  now: string;
}

export function buildImport(input: ImportInput): { gigs: GigsDoc; data: DataDoc } {
  const nowMs = Date.parse(input.now);
  const items: Gig[] = input.leads
    .map((l): Gig => {
      const g = {
        id: String(l.id), source: String(l.source), title: String(l.title ?? ""), desc: String(l.desc ?? ""),
        url: String(l.url ?? ""), date: String(l.date ?? ""), budget: String(l.budget ?? ""),
        tags: Array.isArray(l.tags) ? l.tags.map(String) : [], extra: String(l.extra ?? ""),
        fetchedAt: input.seen[l.id] ? `${input.seen[l.id]}T00:00:00.000Z` : input.now,
      };
      return { ...g, score: score(g, nowMs) };
    })
    .sort((a, b) => b.score - a.score);

  const settings = defaultSettings();
  const taken = new Set<string>();
  const warm = input.hunt?.warm?.final;
  const local: LocalBiz[] = input.mapLeads.map((m) => {
    const base = {
      id: String(m.id), name: String(m.name), area: String(m.area ?? ""), catKey: String(m.catKey ?? "business"),
      catLabel: String(m.catLabel ?? "business"), addr: String(m.addr ?? ""), waNum: String(m.waNum ?? ""),
      telNum: String(m.telNum ?? ""), phoneDisplay: String(m.phoneDisplay ?? ""), email: String(m.email ?? ""),
      website: String(m.website ?? ""), social: String(m.social ?? ""), segment: m.segment, evidence: String(m.evidence ?? ""),
    };
    const slug = uniqueSlug(base.name, taken);
    const template = templateFor(base.catKey, base.catLabel);
    const msgs = base.id === A9_ID && warm
      ? { whatsapp: String(warm.whatsappHinglish), emailSubject: String(warm.emailSubject), emailBody: String(warm.emailBody) }
      : buildMessages(base, settings, hasPhone(base) ? demoUrl(input.origin, slug) : null);
    return { ...base, slug, template, ...msgs, createdAt: input.now };
  });

  const state: Record<string, LeadState> = {};
  const huntBids = new Map<string, any>((input.hunt?.bids ?? []).map((b: any) => [String(b.pid), b]));
  for (const b of PLACED_BIDS) {
    state[`freelancer.com:${b.pid}`] = {
      kind: "gig", status: "sent", bidAmount: b.amount, bidCurrency: b.currency,
      ...(huntBids.get(b.pid)?.proposal ? { proposal: String(huntBids.get(b.pid).proposal) } : {}),
      sentAt: BIDS_SENT_AT, followUpAt: BIDS_FOLLOW_UP, updatedAt: input.now,
    };
  }
  if (local.some((b) => b.id === A9_ID)) {
    state[A9_ID] = { kind: "local", status: "sent", sentAt: A9_FIRST_PITCH, followUpAt: A9_FOLLOW_UP, notes: A9_NOTES, updatedAt: input.now };
  }

  return {
    gigs: { updatedAt: input.now, lastRun: null, items },
    data: { state, local, settings, updatedAt: input.now },
  };
}
