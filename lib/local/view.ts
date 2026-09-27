import type { LeadState, LocalBiz, Segment, Status } from "@/lib/types";
import { SEG_ORDER, SEGMENT_LABELS } from "./classify";
import type { SearchResult } from "./search";

export interface LocalGroup {
  segment: Segment;
  label: string;
  hint: string;
  items: { biz: LocalBiz; status: Status }[];
}

const CLOSED = new Set<Status>(["won", "lost", "skipped"]);

export function groupLocal(local: LocalBiz[], state: Record<string, LeadState>, show: "open" | "all"): LocalGroup[] {
  return SEG_ORDER.map((segment) => ({
    segment,
    ...SEGMENT_LABELS[segment],
    items: local
      .filter((b) => b.segment === segment)
      .map((biz) => ({ biz, status: state[biz.id]?.status ?? ("new" as Status) }))
      .filter((x) => show === "all" || !CLOSED.has(x.status))
      .sort((a, b) => Number(a.status !== "new") - Number(b.status !== "new") || a.biz.name.localeCompare(b.biz.name)),
  })).filter((g) => g.items.length > 0);
}

/** What POST /api/local/search replies: the search result with the added businesses counted. */
export type SearchReply = Omit<SearchResult, "added"> & { added: number };

/** One line after a search. A partial search says so and asks for another run (spec: "partial — search again for more"). */
export function searchSummary(r: SearchReply): string {
  const head = `${r.areaLabel}: ${r.added} navin dukane (${r.scanned} tapasli)`;
  if (!r.partial) return head;
  const unchecked = r.skippedAudits ? ` (${r.skippedAudits} website tapasayche rahile)` : "";
  return `${head} — partial${unchecked}, jast sathi parat shodha`;
}
