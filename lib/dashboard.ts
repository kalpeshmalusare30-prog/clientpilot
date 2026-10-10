import { toParam } from "./ids";
import { SEG_ORDER, SEGMENT_LABELS } from "./local/classify";
import { DAY_MS, followUpState, istDayStart, istHour, istWeekStart } from "./time";
import { STATUSES, type DataDoc, type GigsDoc, type LastRun, type LeadKind, type Segment, type Status } from "./types";

export interface FollowItem {
  id: string;
  kind: LeadKind;
  title: string;
  followUpAt: string;
  when: "overdue" | "today";
  href: string;
}

export interface GigPick {
  id: string;
  title: string;
  href: string;
  score: number;
  source: string;
  budget: string;
}

export interface LocalPick {
  id: string;
  name: string;
  href: string;
  segment: Segment;
  segmentLabel: string;
  catLabel: string;
  area: string;
}

/** What the stored state says happened today / this week (IST). Only `sentAt` and `updatedAt` are kept per lead,
 * so these count leads, not individual messages. */
export interface Activity {
  /** Leads whose last send/bid was today. */
  sentToday: number;
  /** Leads whose last send/bid was this IST week (Monday onwards). */
  sentWeek: number;
  /** Leads with any saved change today (send, stage, note, follow-up, proposal). */
  touchedToday: number;
}

/** "never": no cron run stored. "stale": the last run is older than a missed daily run. "partial": some sources failed. */
export type CronHealth = "ok" | "partial" | "stale" | "never";

export interface TodaySummary {
  followUps: FollowItem[];
  newGigs: number;
  counts: Record<Status, number>;
  lastRun: LastRun | null;
  cron: CronHealth;
  activity: Activity;
  /** Open leads nobody has acted on yet: gigs still in the list plus stored local businesses. */
  untouched: number;
  topGigs: GigPick[];
  localToMessage: LocalPick[];
  /** All untouched local leads with a phone number (topGigs/localToMessage show only the first few). */
  localToMessageTotal: number;
}

/** The "Aaj" progress ring's goal: pitches (sends or bids) per day. A target, not data. */
export const DAILY_SEND_GOAL = 5;
/** How many best-scored gigs and local leads "Next actions" lists. */
export const PICKS = 3;
/** A daily cron run older than this has been missed (Hobby cron fires within an hour of 06:30 IST). */
const CRON_STALE_MS = 26 * 60 * 60 * 1000;
/** "Best new gigs" only looks at gigs the cron brought in over the last three days: older posts are usually filled. */
const FRESH_GIG_MS = 3 * DAY_MS;

const CLOSED = new Set<Status>(["won", "lost", "skipped"]);

export function leadHref(kind: LeadKind, id: string): string {
  return `/${kind === "gig" ? "gigs" : "local"}/${toParam(id)}`;
}

export function cronHealth(lastRun: LastRun | null, now: number): CronHealth {
  if (!lastRun) return "never";
  const at = Date.parse(lastRun.at);
  if (!Number.isFinite(at) || now - at > CRON_STALE_MS) return "stale";
  return lastRun.failed.length ? "partial" : "ok";
}

/** Marathi greeting for the IST time of day. */
export function greeting(now: number): string {
  const h = istHour(now);
  if (h >= 4 && h < 12) return "Shubh sakal";
  if (h >= 12 && h < 17) return "Shubh dupar";
  if (h >= 17 && h < 21) return "Shubh sandhyakal";
  return "Shubh ratri";
}

const inRange = (iso: string | undefined, from: number, now: number) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) && t >= from && t <= now;
};

export function summarize(gigs: GigsDoc, data: DataDoc, now: number): TodaySummary {
  const gigTitle = new Map(gigs.items.map((g) => [g.id, g.title]));
  const bizName = new Map(data.local.map((b) => [b.id, b.name]));
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  const followUps: FollowItem[] = [];
  const dayStart = istDayStart(now);
  const weekStart = istWeekStart(now);
  const activity: Activity = { sentToday: 0, sentWeek: 0, touchedToday: 0 };
  for (const [id, s] of Object.entries(data.state)) {
    counts[s.status]++;
    if (inRange(s.sentAt, dayStart, now)) activity.sentToday++;
    if (inRange(s.sentAt, weekStart, now)) activity.sentWeek++;
    if (inRange(s.updatedAt, dayStart, now)) activity.touchedToday++;
    if (CLOSED.has(s.status) || !s.followUpAt) continue;
    const when = followUpState(s.followUpAt, now);
    if (when !== "overdue" && when !== "today") continue;
    const title = (s.kind === "gig" ? gigTitle.get(id) : bizName.get(id)) ?? id;
    followUps.push({ id, kind: s.kind, title, followUpAt: s.followUpAt, when, href: leadHref(s.kind, id) });
  }
  followUps.sort((a, b) => Date.parse(a.followUpAt) - Date.parse(b.followUpAt));

  const isNew = (id: string) => (data.state[id]?.status ?? "new") === "new";
  const newGigItems = gigs.items.filter((g) => isNew(g.id));
  const newGigs = newGigItems.filter((g) => now - Date.parse(g.fetchedAt) <= DAY_MS).length;
  const topGigs = newGigItems
    .filter((g) => now - Date.parse(g.fetchedAt) <= FRESH_GIG_MS)
    .sort((a, b) => b.score - a.score || Date.parse(b.fetchedAt) - Date.parse(a.fetchedAt))
    .slice(0, PICKS)
    .map((g) => ({ id: g.id, title: g.title, href: leadHref("gig", g.id), score: g.score, source: g.source, budget: g.budget }));

  const newLocal = data.local.filter((b) => isNew(b.id));
  const reachable = newLocal
    .filter((b) => b.waNum || b.telNum)
    .sort(
      (a, b) =>
        SEG_ORDER.indexOf(a.segment) - SEG_ORDER.indexOf(b.segment) ||
        (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) ||
        a.name.localeCompare(b.name),
    );
  const localToMessage = reachable.slice(0, PICKS).map((b) => ({
    id: b.id,
    name: b.name,
    href: leadHref("local", b.id),
    segment: b.segment,
    segmentLabel: SEGMENT_LABELS[b.segment]?.label ?? b.segment,
    catLabel: b.catLabel,
    area: b.area,
  }));

  return {
    followUps,
    newGigs,
    counts,
    lastRun: gigs.lastRun,
    cron: cronHealth(gigs.lastRun, now),
    activity,
    untouched: newGigItems.length + newLocal.length,
    topGigs,
    localToMessage,
    localToMessageTotal: reachable.length,
  };
}
