import { FREELANCER_QUERIES, type LeadDraft } from "./lead";
import {
  findHNThreadId, parseFreelancer, parseHimalayas, parseHNThread, parseJobicy,
  parseRemoteOK, parseRemotive, parseWorkingNomads, parseWWR,
} from "./parsers";

const UA = "Mozilla/5.0 (compatible; ClientPilot/1.0; personal job aggregator)";

export async function fetchText(url: string, timeoutMs = 15_000): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "*/*" },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export async function fetchJSON(url: string, timeoutMs?: number): Promise<unknown> {
  return JSON.parse(await fetchText(url, timeoutMs));
}

export interface Source {
  key: string;
  run: () => Promise<LeadDraft[]>;
}

const freelancerUrl = (q: string) =>
  "https://www.freelancer.com/api/projects/0.1/projects/active/?query=" +
  encodeURIComponent(q) + "&limit=30&full_description=true&job_details=true";

export const SOURCES: Source[] = [
  {
    key: "freelancer.com",
    run: async () => {
      const pages = await Promise.all(FREELANCER_QUERIES.map((q) => fetchJSON(freelancerUrl(q))));
      const seen = new Set<string>();
      return pages.flatMap(parseFreelancer).filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true)));
    },
  },
  {
    key: "hn-thread",
    run: async () => {
      const id = findHNThreadId(await fetchJSON("https://hn.algolia.com/api/v1/search_by_date?query=%22Seeking%20freelancer%22&tags=story&hitsPerPage=5"));
      return id ? parseHNThread(await fetchJSON("https://hn.algolia.com/api/v1/items/" + id)) : [];
    },
  },
  { key: "remotive", run: async () => parseRemotive(await fetchJSON("https://remotive.com/api/remote-jobs?search=" + encodeURIComponent("full stack") + "&limit=50")) },
  { key: "remoteok", run: async () => parseRemoteOK(await fetchJSON("https://remoteok.com/api")) },
  { key: "weworkremotely", run: async () => parseWWR(await fetchText("https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss")) },
  { key: "workingnomads", run: async () => parseWorkingNomads(await fetchJSON("https://www.workingnomads.com/api/exposed_jobs/")) },
  { key: "jobicy", run: async () => parseJobicy(await fetchJSON("https://jobicy.com/api/v2/remote-jobs?count=50&industry=dev")) },
  { key: "himalayas", run: async () => parseHimalayas(await fetchJSON("https://himalayas.app/jobs/api?limit=100")) },
];

/** Runs every source in parallel; one failing source never stops the others. */
export async function fetchAll(sources: Source[] = SOURCES): Promise<{ leads: LeadDraft[]; failed: string[] }> {
  const results = await Promise.allSettled(sources.map((s) => s.run()));
  const leads: LeadDraft[] = [];
  const failed: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") leads.push(...r.value);
    else failed.push(sources[i]!.key);
  });
  return { leads, failed };
}
