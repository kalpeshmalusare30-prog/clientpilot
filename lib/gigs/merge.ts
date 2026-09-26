import type { Gig } from "@/lib/types";
import { DAY_MS } from "@/lib/time";
import { isTooOld, keywordHits, score, type LeadDraft } from "./lead";

/** Same filter as bot.js: needs a URL, first occurrence of an id/url wins, ≤ 21 days old, ≥ 1 keyword hit. */
export function filterFetched(leads: LeadDraft[], now: number): LeadDraft[] {
  const seen = new Set<string>();
  return leads.filter((l) => {
    if (!l.url || seen.has(l.id) || seen.has(l.url)) return false;
    seen.add(l.id);
    seen.add(l.url);
    if (l.date && isTooOld(l.date, now)) return false;
    const { inTitle, inBody } = keywordHits(l);
    return inTitle + inBody > 0;
  });
}

const when = (g: Gig) => Date.parse(g.date || g.fetchedAt);
const byRank = (a: Gig, b: Gig) => b.score - a.score || (when(b) || 0) - (when(a) || 0);

/**
 * Merge a cron run into the stored list. Existing gigs keep their first fetchedAt;
 * everything is rescored; gigs older than `keepDays` are dropped and the list is
 * capped at `cap` — except `keepIds` (gigs Kalpesh has acted on), which always stay.
 */
export function mergeGigs(
  existing: Gig[],
  fresh: LeadDraft[],
  now: number,
  opts: { keepDays?: number; cap?: number; keepIds?: Set<string> } = {},
): { items: Gig[]; added: number } {
  const keepDays = opts.keepDays ?? 30;
  const cap = opts.cap ?? 600;
  const keepIds = opts.keepIds ?? new Set<string>();
  const nowIso = new Date(now).toISOString();

  const byId = new Map(existing.map((g) => [g.id, g]));
  let added = 0;
  for (const f of fresh) {
    const prev = byId.get(f.id);
    if (prev) byId.set(f.id, { ...prev, ...f, fetchedAt: prev.fetchedAt, score: 0 });
    else {
      byId.set(f.id, { ...f, fetchedAt: nowIso, score: 0 });
      added++;
    }
  }

  const cutoff = now - keepDays * DAY_MS;
  const rescored = [...byId.values()].map((g) => ({ ...g, score: score(g, now) }));
  const alive = rescored.filter((g) => keepIds.has(g.id) || !Number.isFinite(when(g)) || when(g) >= cutoff);
  const pinned = alive.filter((g) => keepIds.has(g.id));
  const rest = alive
    .filter((g) => !keepIds.has(g.id))
    .sort(byRank)
    .slice(0, Math.max(0, cap - pinned.length));
  return { items: [...pinned, ...rest].sort(byRank), added };
}
