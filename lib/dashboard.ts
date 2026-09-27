import { toParam } from "./ids";
import { DAY_MS, followUpState } from "./time";
import { STATUSES, type DataDoc, type GigsDoc, type LastRun, type LeadKind, type Status } from "./types";

export interface FollowItem {
  id: string;
  kind: LeadKind;
  title: string;
  followUpAt: string;
  when: "overdue" | "today";
  href: string;
}

export interface TodaySummary {
  followUps: FollowItem[];
  newGigs: number;
  counts: Record<Status, number>;
  lastRun: LastRun | null;
}

const CLOSED = new Set<Status>(["won", "lost", "skipped"]);

export function leadHref(kind: LeadKind, id: string): string {
  return `/${kind === "gig" ? "gigs" : "local"}/${toParam(id)}`;
}

export function summarize(gigs: GigsDoc, data: DataDoc, now: number): TodaySummary {
  const gigTitle = new Map(gigs.items.map((g) => [g.id, g.title]));
  const bizName = new Map(data.local.map((b) => [b.id, b.name]));
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  const followUps: FollowItem[] = [];
  for (const [id, s] of Object.entries(data.state)) {
    counts[s.status]++;
    if (CLOSED.has(s.status) || !s.followUpAt) continue;
    const when = followUpState(s.followUpAt, now);
    if (when !== "overdue" && when !== "today") continue;
    const title = (s.kind === "gig" ? gigTitle.get(id) : bizName.get(id)) ?? id;
    followUps.push({ id, kind: s.kind, title, followUpAt: s.followUpAt, when, href: leadHref(s.kind, id) });
  }
  followUps.sort((a, b) => Date.parse(a.followUpAt) - Date.parse(b.followUpAt));
  const newGigs = gigs.items.filter(
    (g) => now - Date.parse(g.fetchedAt) <= DAY_MS && (data.state[g.id]?.status ?? "new") === "new",
  ).length;
  return { followUps, newGigs, counts, lastRun: gigs.lastRun };
}
