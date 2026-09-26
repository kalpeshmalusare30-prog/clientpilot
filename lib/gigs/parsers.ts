/* External payloads are untyped JSON; each field is checked where it is read. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { makeLead, type LeadDraft } from "./lead";
import { safeIso, strip } from "./text";

type Json = any;
const keep = (x: LeadDraft | null): x is LeadDraft => x !== null;

export function parseFreelancer(j: Json): LeadDraft[] {
  return ((j?.result?.projects ?? []) as Json[])
    .map((p) => {
      const b = p.budget ?? {};
      const cur = p.currency ?? {};
      const sign = cur.sign || cur.code || "";
      const budget = b.minimum
        ? `${sign}${b.minimum}${b.maximum ? "–" + sign + b.maximum : "+"}${p.type === "hourly" ? "/hr" : ""}`
        : "";
      const bids = p.bid_stats?.bid_count;
      return makeLead({
        source: "freelancer.com",
        id: p.id,
        title: p.title,
        desc: p.description || p.preview_description,
        url: p.seo_url ? "https://www.freelancer.com/projects/" + p.seo_url : "",
        date: safeIso(p.submitdate, "s"),
        budget,
        tags: ((p.jobs ?? []) as Json[]).map((x) => x?.name),
        extra: typeof bids === "number" ? (bids < 10 ? `low-bids (${bids} bids)` : `${bids} bids`) : "",
      });
    })
    .filter(keep);
}

export function findHNThreadId(search: Json): string | null {
  const hit = ((search?.hits ?? []) as Json[]).find((h) => /freelancer\? seeking freelancer\?/i.test(h?.title ?? ""));
  return hit ? String(hit.objectID) : null;
}

export function parseHNThread(thread: Json): LeadDraft[] {
  return ((thread?.children ?? []) as Json[])
    .map((c) => {
      const text = strip(c?.text);
      if (!/SEEKING\s+FREELANCER/i.test(text)) return null; // "SEEKING WORK" posts are freelancers
      return makeLead({
        source: "hn-thread",
        id: c.id,
        title: text.slice(0, 110),
        desc: text,
        url: "https://news.ycombinator.com/item?id=" + c.id,
        date: safeIso(c.created_at),
        extra: "by " + (c.author || "?"),
      });
    })
    .filter(keep);
}

export function parseRemotive(j: Json): LeadDraft[] {
  return ((j?.jobs ?? []) as Json[])
    .map((x) =>
      makeLead({
        source: "remotive", id: x.id, title: x.title, desc: x.description, url: x.url,
        date: safeIso(x.publication_date), budget: x.salary || "", tags: x.tags ?? [],
        extra: [x.company_name, x.job_type].filter(Boolean).join(" · "),
      }),
    )
    .filter(keep);
}

export function parseRemoteOK(arr: Json): LeadDraft[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .slice(1) // first element is the API's legal notice
    .map((x: Json) =>
      makeLead({
        source: "remoteok", id: x.id || x.slug, title: x.position, desc: x.description, url: x.url,
        date: safeIso(x.date),
        budget: x.salary_min ? `$${x.salary_min}–$${x.salary_max || "?"}/yr` : "",
        tags: x.tags ?? [], extra: x.company || "",
      }),
    )
    .filter(keep);
}

export function parseWWR(xml: string): LeadDraft[] {
  const items = String(xml ?? "").match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const pick = (block: string, tag: string) => {
    const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
    return m ? m[1]!.replace(/^<!\[CDATA\[|\]\]>$/g, "") : "";
  };
  return items
    .map((it) => {
      const link = pick(it, "link").trim();
      return makeLead({
        source: "weworkremotely", id: link, title: pick(it, "title"), desc: pick(it, "description"), url: link,
        date: safeIso(pick(it, "pubDate")),
        tags: [pick(it, "category")].filter(Boolean),
        extra: pick(it, "region"),
      });
    })
    .filter(keep);
}

export function parseWorkingNomads(arr: Json): LeadDraft[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x: Json) =>
      makeLead({
        source: "workingnomads", id: x.url, title: x.title, desc: x.description, url: x.url,
        date: safeIso(x.pub_date),
        tags: String(x.tags ?? "").split(","),
        extra: [x.company_name, x.location].filter(Boolean).join(" · "),
      }),
    )
    .filter(keep);
}

export function parseJobicy(j: Json): LeadDraft[] {
  return ((j?.jobs ?? []) as Json[])
    .map((x) =>
      makeLead({
        source: "jobicy", id: x.id || x.url, title: x.jobTitle, desc: x.jobExcerpt, url: x.url,
        date: safeIso(x.pubDate),
        budget: x.annualSalaryMin ? `${x.salaryCurrency || "$"}${x.annualSalaryMin}–${x.annualSalaryMax || "?"}/yr` : "",
        tags: [...(x.jobIndustry ?? []), ...(x.jobType ?? [])],
        extra: x.companyName || "",
      }),
    )
    .filter(keep);
}

export function parseHimalayas(j: Json): LeadDraft[] {
  return ((j?.jobs ?? []) as Json[])
    .map((x) =>
      makeLead({
        source: "himalayas", id: x.guid || x.applicationLink, title: x.title, desc: x.excerpt || x.description,
        url: x.applicationLink, date: safeIso(x.pubDate, "s"),
        budget: x.minSalary ? `${x.currency || "$"}${x.minSalary}–${x.maxSalary || "?"}/${x.salaryPeriod || "yr"}` : "",
        tags: x.categories ?? [], extra: x.companyName || "",
      }),
    )
    .filter(keep);
}
