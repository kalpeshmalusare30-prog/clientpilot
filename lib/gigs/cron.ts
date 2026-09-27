import type { Store } from "@/lib/store";
import type { LeadState, Status } from "@/lib/types";
import { filterFetched, mergeGigs } from "./merge";
import { fetchAll as realFetchAll } from "./sources";
import type { LeadDraft } from "./lead";

export interface CronResult {
  added: number;
  total: number;
  failed: string[];
}

/**
 * Statuses whose gig record the UI still needs: the Pipeline columns and Aaj follow-ups show the
 * gig's title and link to its detail page. `new` gigs follow the normal 30-day window, and so do
 * `skipped` ones, which no screen lists.
 */
export const PIN_STATUSES: readonly Status[] = ["drafted", "sent", "replied", "won", "lost"];

/**
 * At most this many acted-on gigs are pinned (most recently updated first). With mergeGigs' cap
 * of 600 this leaves at least 300 slots for fresh gigs on every run, and keeps gigs.json bounded
 * even though data.json state entries are never pruned.
 */
export const MAX_PINNED = 300;

const updatedMs = (s: LeadState) => {
  const t = Date.parse(s.updatedAt);
  return Number.isFinite(t) ? t : 0;
};

/** Ids of gigs that must survive mergeGigs' 30-day window and cap. */
export function pinnedGigIds(state: Record<string, LeadState>, max: number = MAX_PINNED): Set<string> {
  return new Set(
    Object.entries(state)
      .filter(([, s]) => s.kind === "gig" && PIN_STATUSES.includes(s.status))
      .sort(([a, x], [b, y]) => updatedMs(y) - updatedMs(x) || (a < b ? -1 : a > b ? 1 : 0))
      .slice(0, max)
      .map(([id]) => id),
  );
}

export async function runGigCron(
  store: Store,
  fetchAllFn: () => Promise<{ leads: LeadDraft[]; failed: string[] }> = () => realFetchAll(),
  now: number = Date.now(),
): Promise<CronResult> {
  const { leads, failed } = await fetchAllFn();
  const data = await store.readData();
  const keepIds = pinnedGigIds(data.state);
  const fresh = filterFetched(leads, now);
  const at = new Date(now).toISOString();
  let added = 0;
  let total = 0;
  await store.mutateGigs((doc) => {
    const merged = mergeGigs(doc.items, fresh, now, { keepIds });
    added = merged.added;
    total = merged.items.length;
    return { ...doc, items: merged.items, lastRun: { at, added, failed } };
  });
  return { added, total, failed };
}
