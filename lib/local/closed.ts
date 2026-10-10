/**
 * Permanently closed businesses. OpenStreetMap marks them in several ways; the Overpass query drops what it can
 * (overpassClosedStatements) and toCandidate() checks every rule again (isClosed) as a safety net.
 */

/** Lifecycle prefixes: disused:shop=bakery means the bakery has closed. */
const GONE_PREFIX_RE = /^(disused|abandoned|removed|demolished|destroyed|razed|closed):/;
/** was:* is history: beside a live business tag (was:name, or was:shop on a premises that is now a cafe) it records a
 * rename or change of use, so it only means "closed" when no live business tag is left. */
const WAS_PREFIX_RE = /^was:/;
const BUSINESS_KEYS = ["shop", "amenity", "office", "craft", "healthcare", "leisure", "tourism"];

/** "(Closed)", "[band]", "(permanently closed)", "… - closed", "closed down". "band" counts only inside brackets, so
 * "Bandra Medical" and "Shree Ganesh Brass Band" stay. */
export const CLOSED_NAME_RE =
  /[([]\s*(?:permanently\s+)?(?:closed|band|shut)(?:\s+(?:down|zala|zale|ahe|aahe|hai))?\s*[)\]]|\bpermanently\s+(?:closed|shut)\b|\b(?:closed|shut)\s+down\b|\s*[-–—:|,]\s*(?:now\s+)?closed\s*$/i;

/** Last moment of the period an OSM date names ("2019", "2019-05", "2019-05-31", "~2019"); null if unreadable. */
export function endOfDate(raw: string): number | null {
  const m = /^\s*~?\s*(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/.exec(raw);
  if (!m) return null;
  const y = Number(m[1]);
  if (m[3]) return Date.UTC(y, Number(m[2]) - 1, Number(m[3]) + 1) - 1;
  if (m[2]) return Date.UTC(y, Number(m[2]), 1) - 1;
  return Date.UTC(y + 1, 0, 1) - 1;
}

export function isClosed(tags: Record<string, string>, now: Date = new Date()): boolean {
  const live = BUSINESS_KEYS.some((k) => tags[k] && tags[k] !== "vacant" && tags[k] !== "no");
  for (const k of Object.keys(tags)) {
    if (GONE_PREFIX_RE.test(k)) return true;
    if (WAS_PREFIX_RE.test(k) && !live) return true;
  }
  if (tags.disused === "yes" || tags.abandoned === "yes") return true;
  if (tags.shop === "vacant" || tags.amenity === "vacant") return true;
  if (/^\s*(closed|off)\s*$/i.test(tags.opening_hours ?? "")) return true;
  if (tags.end_date) {
    const end = endOfDate(tags.end_date);
    if (end !== null && end < now.getTime()) return true;
  }
  return CLOSED_NAME_RE.test(tags.name ?? "");
}

/** Years before `year` as an Overpass regex prefix: an end_date in an earlier year is in the past whatever the day. */
function pastYearsRe(year: number): string {
  const ys: string[] = [];
  for (let y = 2000; y < year; y++) ys.push(String(y));
  return `^ *~? *(1[0-9][0-9][0-9]|${ys.join("|")})`;
}

/**
 * Overpass statements that collect the closed members of set `.found` into the default set. Overpass regexes are
 * POSIX (no \s, no lookarounds), so the name rule is a simpler bracket form; isClosed() catches the rest.
 */
export function overpassClosedStatements(now: Date = new Date()): string[] {
  return [
    'nwr.found[~"^(disused|abandoned|removed|demolished|destroyed|razed|closed):"~"."];',
    'nwr.found["disused"="yes"];',
    'nwr.found["abandoned"="yes"];',
    'nwr.found["shop"="vacant"];',
    'nwr.found["opening_hours"~"^ *(closed|off) *$",i];',
    `nwr.found["end_date"~"${pastYearsRe(now.getUTCFullYear())}"];`,
    'nwr.found["name"~"[[(] *(permanently +)?(closed|band|shut)( +(down|zala|zale|ahe|aahe|hai))? *[])]",i];',
    'nwr.found["name"~"permanently +(closed|shut)",i];',
  ];
}
