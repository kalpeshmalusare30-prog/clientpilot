/* eslint-disable @typescript-eslint/no-explicit-any */
import { defaultSettings } from "./defaults";
import { score } from "./gigs/lead";
import { demoUrl, hasPhone, templateFor, uniqueSlug } from "./local/biz";
import { buildMessages, isValidEmail } from "./local/messages";
import type { Store } from "./store";
import type { DataDoc, Gig, GigsDoc, LeadState, LocalBiz, Settings } from "./types";

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
/** Lead Hunter audited the site_down/old_site businesses on this day (map-leads.json). */
export const LH_AUDITED_AT = "2026-09-19";
const A9_FIRST_PITCH = "2026-09-20T06:30:00.000Z";
const A9_NOTES =
  'First pitch sent 19–20 Sep; they replied "?". Send the follow-up below on WhatsApp from the same number around 11 AM. ' +
  "No reply by Monday evening → send the email. If they say YES: ₹10,000; small advance (₹2–3k) or pay after it is live; domain ~₹1,000/year extra.";

/** First address of a Lead Hunter email field, or "" unless it passes the strict check (no ?bcc= tricks). */
function validEmail(raw: unknown): string {
  const first = String(raw ?? "").split(/[;,s]+/).find(Boolean) ?? "";
  return isValidEmail(first) ? first : "";
}

export interface ImportInput {
  leads: any[];
  mapLeads: any[];
  hunt: any;
  seen: Record<string, string>;
  origin: string;
  now: string;
  /** Settings used for the outreach messages (production's, when merging). Default: defaultSettings(). */
  settings?: Settings;
  /** Slugs already in use (production businesses), so imported slugs never collide. */
  takenSlugs?: Iterable<string>;
  /** Business ids already stored: they are not rebuilt (the stored record wins). */
  skipLocalIds?: Iterable<string>;
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

  const settings = input.settings ?? defaultSettings();
  const taken = new Set<string>(input.takenSlugs ?? []);
  const skip = new Set<string>(input.skipLocalIds ?? []);
  const warm = input.hunt?.warm?.final;
  const local: LocalBiz[] = input.mapLeads.filter((m) => !skip.has(String(m.id))).map((m) => {
    const base = {
      id: String(m.id), name: String(m.name), area: String(m.area ?? ""), catKey: String(m.catKey ?? "business"),
      catLabel: String(m.catLabel ?? "business"), addr: String(m.addr ?? ""), waNum: String(m.waNum ?? ""),
      telNum: String(m.telNum ?? ""), phoneDisplay: String(m.phoneDisplay ?? ""), email: validEmail(m.email),
      website: String(m.website ?? ""), social: String(m.social ?? ""), segment: m.segment, evidence: String(m.evidence ?? ""),
      ...(m.segment === "site_down" || m.segment === "old_site" ? { auditedAt: LH_AUDITED_AT } : {}),
    };
    const slug = uniqueSlug(base.name, taken);
    const template = templateFor(base.catKey, base.catLabel);
    const msgs = base.id === A9_ID && warm
      ? { whatsapp: String(warm.whatsappHinglish), emailSubject: String(warm.emailSubject), emailBody: String(warm.emailBody) }
      : buildMessages(base, settings, hasPhone(base) ? demoUrl(input.origin, slug) : null, input.now);
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
  if (input.mapLeads.some((m) => String(m.id) === A9_ID)) {
    state[A9_ID] = { kind: "local", status: "sent", sentAt: A9_FIRST_PITCH, followUpAt: A9_FOLLOW_UP, notes: A9_NOTES, updatedAt: input.now };
  }

  return {
    gigs: { updatedAt: input.now, lastRun: null, items },
    data: { state, local, settings, updatedAt: input.now },
  };
}

/** Adds imported gigs whose id is not stored yet; stored gigs (cron output) and lastRun stay as they are. */
export function mergeImportedGigs(doc: GigsDoc, imported: Gig[]): { doc: GigsDoc; added: number } {
  const byId = new Map(doc.items.map((g) => [g.id, g]));
  let added = 0;
  for (const g of imported) {
    if (byId.has(g.id)) continue;
    byId.set(g.id, g);
    added++;
  }
  return { doc: { ...doc, items: [...byId.values()].sort((a, b) => b.score - a.score) }, added };
}

/**
 * Merges the Lead Hunter import into the stored data.json. Everything stored wins: lead states, settings and
 * businesses. New businesses get slugs that do not collide with stored ones and messages built with the stored
 * settings. Stored businesses that came from a previous import and were never contacted (no state, or "new")
 * get their messages rebuilt with the current (honest) builder, keeping their slug; A9 keeps its approved message.
 */
export function mergeImportedData(doc: DataDoc, input: ImportInput): { doc: DataDoc; added: number; regenerated: number } {
  const stored = new Set(doc.local.map((b) => b.id));
  const built = buildImport({
    ...input,
    settings: doc.settings,
    takenSlugs: doc.local.map((b) => b.slug),
    skipLocalIds: stored,
  }).data;
  const importedIds = new Set(input.mapLeads.map((m) => String(m.id)));
  let regenerated = 0;
  const kept = doc.local.map((b) => {
    const st = doc.state[b.id];
    if (!importedIds.has(b.id) || b.id === A9_ID || (st && st.status !== "new")) return b;
    regenerated++;
    const m = input.mapLeads.find((x) => String(x.id) === b.id);
    const withAudit: LocalBiz =
      !b.auditedAt && (b.segment === "site_down" || b.segment === "old_site") && m ? { ...b, auditedAt: LH_AUDITED_AT } : b;
    return { ...withAudit, ...buildMessages(withAudit, doc.settings, hasPhone(b) ? demoUrl(input.origin, b.slug) : null, input.now) };
  });
  return {
    doc: { ...doc, local: [...kept, ...built.local], state: { ...built.state, ...doc.state } },
    added: built.local.length,
    regenerated,
  };
}

export interface ImportResult {
  gigsAdded: number;
  gigsTotal: number;
  lastRunAt: string | null;
  bizAdded: number;
  bizTotal: number;
  messagesRegenerated: number;
  states: number;
}

/** The one-time import as a merge through the conditional mutators (one write per document, never a blind overwrite). */
export async function importInto(store: Store, input: ImportInput): Promise<ImportResult> {
  const { gigs } = buildImport(input);
  let gigsAdded = 0;
  const g = await store.mutateGigs((doc) => {
    const r = mergeImportedGigs(doc, gigs.items);
    gigsAdded = r.added;
    return r.doc;
  });
  let bizAdded = 0;
  let messagesRegenerated = 0;
  const d = await store.mutateData((doc) => {
    const r = mergeImportedData(doc, input);
    bizAdded = r.added;
    messagesRegenerated = r.regenerated;
    return r.doc;
  });
  return {
    gigsAdded,
    gigsTotal: g.items.length,
    lastRunAt: g.lastRun?.at ?? null,
    bizAdded,
    bizTotal: d.local.length,
    messagesRegenerated,
    states: Object.keys(d.state).length,
  };
}
