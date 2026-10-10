import { describe, expect, it } from "vitest";
import { cronHealth, DAILY_SEND_GOAL, greeting, PICKS, summarize } from "./dashboard";
import { emptyData } from "./defaults";
import { toParam } from "./ids";
import type { GigsDoc, LocalBiz } from "./types";

const NOW = Date.parse("2026-09-28T04:00:00Z"); // Mon 28 Sep, 09:30 IST
const gig = (id: string, fetchedAt: string) => ({ id, source: "remotive", title: `Gig ${id}`, desc: "", url: "https://x", date: "", budget: "", tags: [], extra: "", score: 5, fetchedAt });

describe("summarize", () => {
  it("lists today's and overdue follow-ups, skips closed and later ones, counts new gigs and stages", () => {
    const gigs: GigsDoc = {
      updatedAt: "",
      lastRun: { at: "2026-09-28T01:30:00.000Z", added: 3, failed: ["remoteok"] },
      items: [gig("g1", "2026-09-28T01:30:00.000Z"), gig("g2", "2026-09-28T01:30:00.000Z"), gig("g3", "2026-09-20T00:00:00.000Z")],
    };
    const data = emptyData("t");
    data.local.push({ id: "node/1", name: "A9 Digital Prints" } as never);
    data.state = {
      "node/1": { kind: "local", status: "sent", followUpAt: "2026-09-28T05:30:00.000Z", updatedAt: "t" },   // today 11:00 IST
      g1: { kind: "gig", status: "sent", followUpAt: "2026-09-27T05:30:00.000Z", updatedAt: "t" },          // overdue
      g3: { kind: "gig", status: "won", followUpAt: "2026-09-27T05:30:00.000Z", updatedAt: "t" },           // closed → skipped
      g4: { kind: "gig", status: "sent", followUpAt: "2026-09-30T05:30:00.000Z", updatedAt: "t" },          // later → skipped
    };
    const s = summarize(gigs, data, NOW);
    expect(s.followUps.map((f) => [f.title, f.when])).toEqual([
      ["Gig g1", "overdue"],
      ["A9 Digital Prints", "today"],
    ]);
    expect(s.followUps[1]!.href).toBe(`/local/${toParam("node/1")}`);
    expect(s.newGigs).toBe(1); // g2 only: g1 has state, g3 is older than 24 h
    expect(s.counts.sent).toBe(3);
    expect(s.counts.won).toBe(1);
    expect(s.lastRun?.failed).toEqual(["remoteok"]);
  });
});

const biz = (id: string, over: Partial<LocalBiz> = {}) =>
  ({ id, name: `Biz ${id}`, catLabel: "salon", area: "Thane", segment: "no_website", waNum: "919800000000", telNum: "", createdAt: "2026-09-27T00:00:00.000Z", ...over }) as LocalBiz;

describe("summarize: dashboard aggregates", () => {
  it("counts leads sent today and this IST week from sentAt, and leads touched today from updatedAt", () => {
    const gigs: GigsDoc = { updatedAt: "", lastRun: null, items: [] };
    const data = emptyData("t");
    data.state = {
      a: { kind: "gig", status: "sent", sentAt: "2026-09-28T03:00:00.000Z", updatedAt: "2026-09-28T03:00:00.000Z" }, // today 08:30 IST
      b: { kind: "local", status: "sent", sentAt: "2026-09-27T17:00:00.000Z", updatedAt: "2026-09-28T02:00:00.000Z" }, // Sun 22:30 IST: last week; note edited today
      c: { kind: "local", status: "replied", sentAt: "2026-09-28T01:00:00.000Z", updatedAt: "2026-09-27T10:00:00.000Z" },
      d: { kind: "gig", status: "drafted", updatedAt: "bad" },
    };
    const s = summarize(gigs, data, NOW);
    expect(s.activity).toEqual({ sentToday: 2, sentWeek: 2, touchedToday: 2 });
    expect(s.cron).toBe("never");
  });

  it("picks the best-scored fresh new gigs and the most urgent reachable local leads", () => {
    const g = (id: string, score: number, fetchedAt = "2026-09-28T01:30:00.000Z") => ({ ...gig(id, fetchedAt), score });
    const gigs: GigsDoc = {
      updatedAt: "",
      lastRun: null,
      items: [g("low", 2), g("top", 30), g("mid", 12), g("acted", 99), g("old", 50, "2026-09-20T00:00:00.000Z"), g("mid2", 12, "2026-09-27T01:30:00.000Z")],
    };
    const data = emptyData("t");
    data.local.push(
      biz("node/1", { segment: "old_site" }),
      biz("node/2", { segment: "site_down" }),
      biz("node/3", { segment: "no_website", waNum: "", telNum: "" }), // no phone: cannot be messaged
      biz("node/4", { segment: "no_website" }),
      biz("node/5", { segment: "site_down" }),
      biz("node/6", { segment: "site_down", telNum: "912200000000", waNum: "" }),
    );
    data.state = {
      acted: { kind: "gig", status: "sent", updatedAt: "t" },
      "node/5": { kind: "local", status: "sent", updatedAt: "t" },
    };
    const s = summarize(gigs, data, NOW);
    expect(s.topGigs.map((x) => x.id)).toEqual(["top", "mid", "mid2"]);
    expect(s.topGigs[0]).toMatchObject({ href: `/gigs/${toParam("top")}`, score: 30, source: "remotive" });
    expect(s.topGigs).toHaveLength(PICKS);
    expect(s.localToMessage.map((x) => x.id)).toEqual(["node/2", "node/6", "node/4"]);
    expect(s.localToMessage[0]).toMatchObject({ segmentLabel: "Site DOWN", href: `/local/${toParam("node/2")}` });
    expect(s.localToMessageTotal).toBe(4);
    // 5 untouched gigs (all but "acted") + 5 untouched local businesses (all but node/5).
    expect(s.untouched).toBe(10);
  });

  it("rates the last cron run", () => {
    expect(cronHealth(null, NOW)).toBe("never");
    expect(cronHealth({ at: "2026-09-28T01:30:00.000Z", added: 4, failed: [] }, NOW)).toBe("ok");
    expect(cronHealth({ at: "2026-09-28T01:30:00.000Z", added: 4, failed: ["remoteok"] }, NOW)).toBe("partial");
    expect(cronHealth({ at: "2026-09-26T01:30:00.000Z", added: 4, failed: [] }, NOW)).toBe("stale");
    expect(cronHealth({ at: "nope", added: 0, failed: [] }, NOW)).toBe("stale");
  });

  it("greets by the IST time of day and keeps a positive daily goal", () => {
    expect(greeting(NOW)).toBe("Shubh sakal"); // 09:30 IST
    expect(greeting(Date.parse("2026-09-28T08:30:00Z"))).toBe("Shubh dupar"); // 14:00 IST
    expect(greeting(Date.parse("2026-09-28T13:30:00Z"))).toBe("Shubh sandhyakal"); // 19:00 IST
    expect(greeting(Date.parse("2026-09-28T18:00:00Z"))).toBe("Shubh ratri"); // 23:30 IST
    expect(DAILY_SEND_GOAL).toBeGreaterThan(0);
  });
});
