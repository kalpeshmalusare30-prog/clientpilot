import type { Store } from "@/lib/store";
import { filterFetched, mergeGigs } from "./merge";
import { fetchAll as realFetchAll } from "./sources";
import type { LeadDraft } from "./lead";

export interface CronResult {
  added: number;
  total: number;
  failed: string[];
}

export async function runGigCron(
  store: Store,
  fetchAllFn: () => Promise<{ leads: LeadDraft[]; failed: string[] }> = () => realFetchAll(),
  now: number = Date.now(),
): Promise<CronResult> {
  const { leads, failed } = await fetchAllFn();
  const data = await store.readData();
  const keepIds = new Set(
    Object.entries(data.state)
      .filter(([, s]) => s.kind === "gig" && s.status !== "new")
      .map(([id]) => id),
  );
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
