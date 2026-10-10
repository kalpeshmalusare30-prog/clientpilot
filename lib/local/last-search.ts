import { z } from "zod";
import type { LeadState, LocalBiz, Status } from "@/lib/types";
import type { SearchReply } from "./view";

/**
 * The last "Navin shodh" survives opening a business and coming back, back/forward and refresh: the search API
 * sets this cookie and the Local page reads it, so the form keeps its inputs and the new businesses stay listed
 * under "Last search". A new search overwrites it. Every business one search adds shares its `createdAt`
 * (the search's start time), which is how the page finds them again.
 */
export const LAST_SEARCH_COOKIE = "cp_last_search";
export const LAST_SEARCH_MAX_AGE_S = 24 * 60 * 60;

const Schema = z.object({
  at: z.string().min(1).max(40),
  area: z.string().max(80),
  category: z.string().max(40),
  areaLabel: z.string().max(120),
  added: z.number().int().min(0),
  scanned: z.number().int().min(0),
  partial: z.boolean(),
  skippedAudits: z.number().int().min(0),
});

export type LastSearch = z.infer<typeof Schema>;

/** The cookie value as JSON; Next's cookie API URL-encodes it on the way out and decodes it on the way in. */
export function encodeLastSearch(s: LastSearch): string {
  // Never throws after a search that worked: over-long text is cut to what parseLastSearch accepts.
  return JSON.stringify({ ...s, area: s.area.slice(0, 80), category: s.category.slice(0, 40), areaLabel: s.areaLabel.slice(0, 120) });
}

/** null for a missing, damaged or tampered cookie (the page then simply has no "Last search"). */
export function parseLastSearch(raw: string | undefined | null): LastSearch | null {
  if (!raw) return null;
  try {
    const got = Schema.safeParse(JSON.parse(raw));
    return got.success ? got.data : null;
  } catch {
    return null;
  }
}

export function lastSearchReply(s: LastSearch): SearchReply {
  return { added: s.added, partial: s.partial, scanned: s.scanned, skippedAudits: s.skippedAudits, areaLabel: s.areaLabel };
}

/** The businesses that search added, in the order the list uses (new first, then by name), with their status. */
export function lastSearchItems(local: LocalBiz[], state: Record<string, LeadState>, s: LastSearch | null): { biz: LocalBiz; status: Status }[] {
  if (!s) return [];
  return local
    .filter((b) => b.createdAt === s.at)
    .map((biz) => ({ biz, status: state[biz.id]?.status ?? ("new" as Status) }))
    .sort((a, b) => Number(a.status !== "new") - Number(b.status !== "new") || a.biz.name.localeCompare(b.biz.name));
}
