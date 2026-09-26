import { describe, expect, it } from "vitest";
import {
  findHNThreadId, parseFreelancer, parseHimalayas, parseHNThread, parseJobicy,
  parseRemoteOK, parseRemotive, parseWorkingNomads, parseWWR,
} from "./parsers";

const S = 1790000000; // epoch seconds
const ISO_S = new Date(S * 1000).toISOString();

describe("parseFreelancer", () => {
  it("maps projects, budget, tags and bid counts; skips projects without a URL", () => {
    const out = parseFreelancer({ result: { projects: [
      { id: 101, title: "React <b>dashboard</b>", description: "Build &amp; ship", seo_url: "react/React-dashboard", submitdate: S, budget: { minimum: 250, maximum: 750 }, currency: { sign: "$", code: "USD" }, type: "fixed", jobs: [{ name: "React.js" }, { name: "Node.js" }], bid_stats: { bid_count: 4 } },
      { id: 102, title: "Hourly", description: "", preview_description: "Preview text", seo_url: "x/Hourly", submitdate: S, budget: { minimum: 10 }, currency: { code: "INR" }, type: "hourly", jobs: [], bid_stats: { bid_count: 25 } },
      { id: 103, title: "No url" },
    ] } });
    expect(out).toEqual([
      { id: "freelancer.com:101", source: "freelancer.com", title: "React dashboard", desc: "Build & ship", url: "https://www.freelancer.com/projects/react/React-dashboard", date: ISO_S, budget: "$250–$750", tags: ["react.js", "node.js"], extra: "low-bids (4 bids)" },
      { id: "freelancer.com:102", source: "freelancer.com", title: "Hourly", desc: "Preview text", url: "https://www.freelancer.com/projects/x/Hourly", date: ISO_S, budget: "INR10+/hr", tags: [], extra: "25 bids" },
    ]);
  });
  it("tolerates an empty payload", () => {
    expect(parseFreelancer({})).toEqual([]);
  });
});

describe("Hacker News", () => {
  it("finds the monthly freelancer thread and keeps only SEEKING FREELANCER comments", () => {
    expect(findHNThreadId({ hits: [{ title: "Ask HN: Who is hiring?", objectID: "1" }, { title: "Ask HN: Freelancer? Seeking freelancer? (October 2026)", objectID: "42" }] })).toBe("42");
    expect(findHNThreadId({ hits: [] })).toBeNull();
    const out = parseHNThread({ children: [
      { id: 1, text: "<p>SEEKING FREELANCER | React dev</p>", created_at: "2026-10-01T10:00:00.000Z", author: "acme" },
      { id: 2, text: "SEEKING WORK - me" },
    ] });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "hn-thread:1", title: "SEEKING FREELANCER | React dev", url: "https://news.ycombinator.com/item?id=1", date: "2026-10-01T10:00:00.000Z", extra: "by acme" });
  });
});

describe("job boards", () => {
  it("parseRemotive", () => {
    expect(parseRemotive({ jobs: [{ id: 7, title: "Full Stack Engineer", description: "<p>Node</p>", url: "https://remotive.com/x", publication_date: "2026-09-20T08:00:00Z", salary: "$50k", tags: ["react"], company_name: "Acme", job_type: "contract" }] })).toEqual([
      { id: "remotive:7", source: "remotive", title: "Full Stack Engineer", desc: "Node", url: "https://remotive.com/x", date: "2026-09-20T08:00:00.000Z", budget: "$50k", tags: ["react"], extra: "Acme · contract" },
    ]);
  });
  it("parseRemoteOK skips the legal notice row", () => {
    const out = parseRemoteOK([{ legal: "terms" }, { id: "9", position: "Senior React Dev", description: "d", url: "https://remoteok.com/remote-jobs/9", date: "2026-09-25T00:00:00+00:00", salary_min: 80000, salary_max: 120000, tags: ["React"], company: "Co" }]);
    expect(out).toEqual([
      { id: "remoteok:9", source: "remoteok", title: "Senior React Dev", desc: "d", url: "https://remoteok.com/remote-jobs/9", date: "2026-09-25T00:00:00.000Z", budget: "$80000–$120000/yr", tags: ["react"], extra: "Co" },
    ]);
  });
  it("parseWWR reads RSS items, unwraps CDATA and survives bad dates", () => {
    const xml = `<rss><channel>
<item><title><![CDATA[Acme: Full-Stack Developer]]></title><link>https://weworkremotely.com/remote-jobs/acme-fs</link><pubDate>Fri, 25 Sep 2026 10:00:00 +0000</pubDate><description><![CDATA[<p>React &amp; Node</p>]]></description><category>Full-Stack Programming</category><region>Anywhere in the World</region></item>
<item><title>No link</title></item>
<item><title>Bad date</title><link>https://weworkremotely.com/remote-jobs/bad</link><pubDate>garbage</pubDate></item>
</channel></rss>`;
    expect(parseWWR(xml)).toEqual([
      { id: "weworkremotely:https://weworkremotely.com/remote-jobs/acme-fs", source: "weworkremotely", title: "Acme: Full-Stack Developer", desc: "React & Node", url: "https://weworkremotely.com/remote-jobs/acme-fs", date: "2026-09-25T10:00:00.000Z", budget: "", tags: ["full-stack programming"], extra: "Anywhere in the World" },
      { id: "weworkremotely:https://weworkremotely.com/remote-jobs/bad", source: "weworkremotely", title: "Bad date", desc: "", url: "https://weworkremotely.com/remote-jobs/bad", date: "", budget: "", tags: [], extra: "" },
    ]);
  });
  it("parseWorkingNomads splits comma tags and skips items without a url", () => {
    expect(parseWorkingNomads([{ url: "https://www.workingnomads.com/jobs/1", title: "React Dev", description: "d", pub_date: "2026-09-24T00:00:00Z", tags: "react, node", company_name: "C", location: "Remote" }, { title: "no url" }])).toEqual([
      { id: "workingnomads:https://www.workingnomads.com/jobs/1", source: "workingnomads", title: "React Dev", desc: "d", url: "https://www.workingnomads.com/jobs/1", date: "2026-09-24T00:00:00.000Z", budget: "", tags: ["react", "node"], extra: "C · Remote" },
    ]);
  });
  it("parseJobicy", () => {
    expect(parseJobicy({ jobs: [{ id: 5, jobTitle: "Frontend Dev", jobExcerpt: "x", url: "https://jobicy.com/jobs/5", pubDate: "2026-09-23T10:00:00Z", annualSalaryMin: 60000, annualSalaryMax: 90000, salaryCurrency: "USD", jobIndustry: ["Dev"], jobType: ["contract"], companyName: "J" }] })).toEqual([
      { id: "jobicy:5", source: "jobicy", title: "Frontend Dev", desc: "x", url: "https://jobicy.com/jobs/5", date: "2026-09-23T10:00:00.000Z", budget: "USD60000–90000/yr", tags: ["dev", "contract"], extra: "J" },
    ]);
  });
  it("parseHimalayas uses epoch seconds", () => {
    expect(parseHimalayas({ jobs: [{ guid: "g1", title: "Full stack", excerpt: "e", applicationLink: "https://himalayas.app/jobs/g1", pubDate: S, minSalary: 50000, maxSalary: 70000, currency: "USD", salaryPeriod: "year", categories: ["Engineering"], companyName: "H" }] })).toEqual([
      { id: "himalayas:g1", source: "himalayas", title: "Full stack", desc: "e", url: "https://himalayas.app/jobs/g1", date: ISO_S, budget: "USD50000–70000/year", tags: ["engineering"], extra: "H" },
    ]);
  });
});
