import type { Gig, LeadState } from "@/lib/types";

export type GigFilter = "new" | "drafted" | "sent" | "all";

export const GIG_FILTERS: { key: GigFilter; label: string }[] = [
  { key: "new", label: "New" },
  { key: "drafted", label: "Drafted" },
  { key: "sent", label: "Bid sent" },
  { key: "all", label: "All" },
];

export function parseFilter(v: string | undefined): GigFilter {
  return GIG_FILTERS.some((f) => f.key === v) ? (v as GigFilter) : "new";
}

export function filterGigs(items: Gig[], state: Record<string, LeadState>, f: GigFilter): Gig[] {
  return items.filter((g) => {
    const s = state[g.id]?.status ?? "new";
    if (f === "all") return s !== "skipped";
    if (f === "sent") return s === "sent" || s === "replied" || s === "won";
    return s === f;
  });
}

export function currencyFromBudget(budget: string): string {
  if (/₹|INR/.test(budget)) return "INR";
  if (/€|EUR/.test(budget)) return "EUR";
  if (/£|GBP/.test(budget)) return "GBP";
  if (/\$|USD/.test(budget)) return "USD";
  return "INR";
}

/** The Gigs list shows at most this many rows (best score first) and says when it cut some off. */
export const GIG_LIST_CAP = 150;

/** Gig URLs come from third-party feeds: only a plain http(s) URL becomes a link, anything else "". */
export function httpUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch {
    return "";
  }
}

/** The warning shown while the proposal is longer than `max`, or null when it fits. */
export function limitWarning(len: number, max: number): string | null {
  return len > max ? `${len}/${max} characters — limit peksha ${len - max} jasta. Pathavnyapurvi kami kar.` : null;
}

/** POST /api/ai/proposal's reply (lib/ai/proposal.ts draftProposal + chars). */
export interface ProposalReply {
  text: string;
  chars?: number;
  changes: string[];
  removedLinks: string[];
  overLimit: boolean;
}

/** What the panel shows after an AI draft: the change notes, and a warning when the AI could not fit the limit. */
export function describeProposal(r: ProposalReply, max: number): { notes: string[]; warning: string | null } {
  // The same link is often stripped several times from one draft; say it once.
  const removed = [...new Set(r.removedLinks ?? [])];
  const notes = [...(r.changes ?? []), ...removed.map((l) => `Removed link not on your allow-list: ${l}`)];
  const warning =
    r.overLimit === true
      ? `AI la ${max} characters madhe basavta ala nahi (${r.chars ?? (r.text ?? "").length}) — pathavnyapurvi kami kar.`
      : null;
  return { notes, warning };
}
