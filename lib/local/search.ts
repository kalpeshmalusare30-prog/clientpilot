import type { LocalBiz, Segment, Settings } from "@/lib/types";
import { auditSite, type AuditResult } from "./audit";
import { demoUrl, hasPhone, templateFor, uniqueSlug } from "./biz";
import { selectorsFor } from "./categories";
import { SEG_ORDER, toCandidate, type Candidate, type OsmElement } from "./classify";
import { fetchElements, geocode, splitBbox, type Bbox } from "./geo";
import { buildMessages } from "./messages";

const MAX_TILES = 4;
const MIN_MS_FOR_TILE = 10_000;
const MIN_MS_FOR_AUDIT = 7_000;
const AUDIT_CONCURRENCY = 8;

export interface SearchDeps {
  geocode(area: string, signal: AbortSignal): Promise<{ bbox: Bbox; label: string }>;
  fetchElements(bbox: Bbox, selectors: string[], signal: AbortSignal): Promise<OsmElement[]>;
  audit(url: string, name: string, signal: AbortSignal): Promise<AuditResult>;
}

export const realDeps: SearchDeps = {
  geocode: (area, signal) => geocode(area, signal),
  fetchElements: (bbox, selectors, signal) => fetchElements(bbox, selectors, signal),
  audit: (url, name, signal) => auditSite(url, name, { signal }),
};

export interface SearchInput {
  area: string;
  category: string;
  existing: LocalBiz[];
  settings: Settings;
  origin: string;
  nowIso: string;
  /** Epoch ms by which the search must return. */
  deadline: number;
}

export interface SearchResult {
  added: LocalBiz[];
  partial: boolean;
  scanned: number;
  skippedAudits: number;
  areaLabel: string;
}

export async function searchLocal(input: SearchInput, deps: SearchDeps = realDeps): Promise<SearchResult> {
  const remaining = () => input.deadline - Date.now();
  const signal = AbortSignal.timeout(Math.max(1, remaining()));
  let partial = false;

  const geo = await deps.geocode(input.area, signal);
  const tiles = splitBbox(geo.bbox);
  if (tiles.length > MAX_TILES) partial = true;
  const selectors = selectorsFor(input.category);
  const elements: OsmElement[] = [];
  for (const [i, tile] of tiles.slice(0, MAX_TILES).entries()) {
    // The first tile is always fetched (bounded by the deadline signal); later tiles need 10 s headroom.
    if (i > 0 && remaining() < MIN_MS_FOR_TILE) {
      partial = true;
      break;
    }
    let got: OsmElement[];
    try {
      got = await deps.fetchElements(tile, selectors, signal);
    } catch (e) {
      if (i === 0) throw e; // nothing to show without the first tile
      partial = true; // a later tile failed or hit the deadline: keep what we have
      break;
    }
    elements.push(...got);
  }

  // Normalise, exclude, and drop anything already stored (by OSM id).
  const knownIds = new Set(input.existing.map((b) => b.id));
  const seenIds = new Set<string>();
  const cands: Candidate[] = [];
  for (const el of elements) {
    const c = toCandidate(el, geo.label);
    if (!c || c === "excluded" || seenIds.has(c.id) || knownIds.has(c.id)) continue;
    seenIds.add(c.id);
    cands.push(c);
  }

  // Audit the ones that have a real website, 8 at a time, while time allows.
  const toAudit = cands.filter((c) => c.segment === undefined);
  let skippedAudits = 0;
  let next = 0;
  const worker = async () => {
    while (next < toAudit.length) {
      const c = toAudit[next++]!;
      if (remaining() < MIN_MS_FOR_AUDIT) {
        skippedAudits++;
        continue;
      }
      const a = await deps.audit(c.website, c.name, signal).catch((): AuditResult => ({ verdict: "UNKNOWN", evidence: "" }));
      if (a.incomplete) {
        // Cut short, refused or unconfirmable: not a verdict, so no lead; a later search can audit it again.
        skippedAudits++;
        continue;
      }
      if (a.url) c.website = a.url;
      if (a.verdict === "DOWN") {
        c.segment = "site_down";
        c.evidence = a.evidence;
        if (/domain/.test(a.evidence) && emailAtDomain(c.email, regDomainOf(c.website))) c.email = "";
      } else if (a.verdict === "OLD") {
        c.segment = "old_site";
        c.evidence = a.evidence;
      } else if (a.verdict === "SOCIAL") {
        c.segment = "social_only";
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(AUDIT_CONCURRENCY, toAudit.length) }, worker));
  if (skippedAudits) partial = true;

  // Keep segmented leads that can still be contacted. Stable sort by segment only (as map-hunter does),
  // so for duplicates the first OSM element wins; sort by name only at the very end.
  const rank = (s: Segment) => SEG_ORDER.indexOf(s);
  const ready = cands
    .filter((c): c is Candidate & { segment: Segment } => c.segment !== undefined && !!(c.waNum || c.telNum || c.email))
    .sort((a, b) => rank(a.segment) - rank(b.segment));
  const seenKeys = new Set<string>();
  for (const b of input.existing) {
    if (b.waNum) seenKeys.add("p:" + b.waNum);
    if (b.telNum) seenKeys.add("p:" + b.telNum);
    seenKeys.add("n:" + b.name.toLowerCase().replace(/\s+/g, " ") + "|" + b.area);
  }
  const takenSlugs = new Set(input.existing.map((b) => b.slug));
  const added: LocalBiz[] = [];
  for (const c of ready) {
    const keys = [
      ...(c.waNum ? ["p:" + c.waNum] : []),
      ...(c.telNum ? ["p:" + c.telNum] : []),
      "n:" + c.name.toLowerCase().replace(/\s+/g, " ") + "|" + c.area,
    ];
    if (keys.some((k) => seenKeys.has(k))) continue;
    keys.forEach((k) => seenKeys.add(k));
    const slug = uniqueSlug(c.name, takenSlugs);
    const template = templateFor(c.catKey, c.catLabel);
    const url = hasPhone(c) ? demoUrl(input.origin, slug) : null;
    const msgs = buildMessages({ ...c, segment: c.segment }, input.settings, url);
    added.push({ ...c, segment: c.segment, slug, template, ...msgs, createdAt: input.nowIso });
  }
  added.sort((a, b) => rank(a.segment) - rank(b.segment) || a.name.localeCompare(b.name));
  return { added, partial, scanned: elements.length, skippedAudits, areaLabel: geo.label };
}

function regDomainOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "\u0000"; // never matches an email
  }
}

/** The email is at `domain` itself or one of its subdomains (not merely a name that ends the same way). */
function emailAtDomain(email: string, domain: string): boolean {
  const e = email.toLowerCase();
  const d = domain.toLowerCase();
  return e.endsWith("@" + d) || e.endsWith("." + d);
}
