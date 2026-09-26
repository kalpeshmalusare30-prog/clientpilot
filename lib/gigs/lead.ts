import type { Gig } from "@/lib/types";
import { DAY_MS } from "@/lib/time";
import { strip } from "./text";

export type LeadDraft = Omit<Gig, "score" | "fetchedAt">;

export const KEYWORDS = [
  "full stack", "fullstack", "full-stack",
  "react", "next.js", "nextjs", "node", "express",
  "javascript", "typescript", "mern", "mongodb", "postgres", "mysql",
  "web app", "web develop", "website", "frontend", "front-end",
  "backend", "back-end", "api", "dashboard", "saas", "wordpress", "shopify",
];
export const FREELANCER_QUERIES = ["full stack", "react", "node.js", "website"];
export const MAX_AGE_DAYS = 21;
const FREELANCE_SOURCES = new Set(["freelancer.com", "hn-thread", "reddit"]);

export interface RawLead {
  source: string;
  id: string | number | null | undefined;
  title?: unknown;
  desc?: unknown;
  url?: unknown;
  date?: string;
  budget?: string;
  tags?: unknown[];
  extra?: string;
}

/** Normalise one source item. Returns null when it has no stable id or no URL. */
export function makeLead(o: RawLead): LeadDraft | null {
  if (o.id === undefined || o.id === null || o.id === "") return null;
  const url = typeof o.url === "string" ? o.url.trim() : "";
  if (!url) return null;
  return {
    id: `${o.source}:${o.id}`,
    source: o.source,
    title: strip(o.title).slice(0, 160) || "(untitled)",
    desc: strip(o.desc).slice(0, 700),
    url,
    date: o.date || "",
    budget: o.budget || "",
    tags: (o.tags ?? [])
      .filter((t) => t !== null && t !== undefined)
      .map((t) => String(t).trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 8),
    extra: o.extra || "",
  };
}

/** Plain substring matching, same as bot.js ("api" also matches "rapid"). */
export function keywordHits(l: Pick<LeadDraft, "title" | "desc" | "tags">): { inTitle: number; inBody: number } {
  const title = l.title.toLowerCase();
  const body = `${l.desc} ${l.tags.join(" ")}`.toLowerCase();
  let inTitle = 0;
  let inBody = 0;
  for (const k of KEYWORDS) {
    if (title.includes(k)) inTitle++;
    else if (body.includes(k)) inBody++;
  }
  return { inTitle, inBody };
}

export function score(l: LeadDraft, now: number): number {
  const { inTitle, inBody } = keywordHits(l);
  let s = Math.min(inTitle * 3, 9) + Math.min(inBody, 5);
  const t = l.date ? Date.parse(l.date) : NaN;
  const age = Number.isFinite(t) ? (now - t) / DAY_MS : 99;
  if (age <= 2) s += 4;
  else if (age <= 7) s += 2;
  else if (age <= 14) s += 1;
  if (l.budget) s += 2;
  if (FREELANCE_SOURCES.has(l.source)) s += 3;
  if (l.extra.includes("low-bids")) s += 2;
  return s;
}

export function isTooOld(iso: string, now: number, maxAgeDays: number = MAX_AGE_DAYS): boolean {
  const t = Date.parse(iso);
  return Number.isFinite(t) && now - t > maxAgeDays * DAY_MS;
}
