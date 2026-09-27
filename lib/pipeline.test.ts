import { describe, expect, it } from "vitest";
import { buildPipeline } from "./pipeline";
import { emptyData } from "./defaults";
import { toParam } from "./ids";
import type { GigsDoc } from "./types";

describe("buildPipeline", () => {
  it("puts acted-on leads in stage columns, soonest follow-up first, with titles and subtitles", () => {
    const gigs: GigsDoc = { updatedAt: "", lastRun: null, items: [{ id: "g1", source: "freelancer.com", title: "Marketplace MVP" } as never, { id: "g2", source: "remotive", title: "Dashboard" } as never] };
    const data = emptyData("t");
    data.local.push({ id: "node/1", name: "A9 Digital Prints", catLabel: "print shop", area: "Andheri" } as never);
    data.state = {
      g1: { kind: "gig", status: "sent", bidAmount: 18000, bidCurrency: "INR", followUpAt: "2026-09-29T05:30:00.000Z", updatedAt: "t" },
      "node/1": { kind: "local", status: "sent", followUpAt: "2026-09-28T05:30:00.000Z", updatedAt: "t" },
      g2: { kind: "gig", status: "drafted", updatedAt: "t" },
      g9: { kind: "gig", status: "skipped", updatedAt: "t" },
    };
    const p = buildPipeline(gigs, data);
    expect(p.sent.map((i) => [i.title, i.sub])).toEqual([
      ["A9 Digital Prints", "print shop · Andheri"],
      ["Marketplace MVP", "Bid INR 18000"],
    ]);
    expect(p.drafted.map((i) => i.title)).toEqual(["Dashboard"]);
    expect(p.won).toEqual([]);
    expect(Object.keys(p)).toEqual(["drafted", "sent", "replied", "won", "lost"]);
  });

  it("links a lead whose record exists to its detail page", () => {
    const gigs: GigsDoc = { updatedAt: "", lastRun: null, items: [{ id: "freelancer.com:1", source: "freelancer.com", title: "Shop site" } as never] };
    const data = emptyData("t");
    data.local.push({ id: "node/1", name: "A9 Digital Prints", catLabel: "print shop", area: "Andheri" } as never);
    data.state = {
      "freelancer.com:1": { kind: "gig", status: "replied", updatedAt: "t" },
      "node/1": { kind: "local", status: "replied", followUpAt: "2026-09-28T05:30:00.000Z", updatedAt: "t" },
    };
    const p = buildPipeline(gigs, data);
    expect(p.replied.map((i) => [i.href, i.param])).toEqual([
      [`/local/${toParam("node/1")}`, toParam("node/1")],
      [`/gigs/${toParam("freelancer.com:1")}`, toParam("freelancer.com:1")],
    ]);
  });

  it("keeps an acted-on lead whose record is gone (old gig dropped from gigs.json): id as title, no link to a 404", () => {
    const gigs: GigsDoc = { updatedAt: "", lastRun: null, items: [] };
    const data = emptyData("t");
    data.state = {
      "freelancer.com:40734895": { kind: "gig", status: "sent", bidAmount: 18000, bidCurrency: "INR", notes: "chased", updatedAt: "t" },
      "remotive:7": { kind: "gig", status: "replied", updatedAt: "t" },
      "node/404": { kind: "local", status: "won", updatedAt: "t" },
    };
    const p = buildPipeline(gigs, data);
    expect(p.sent).toEqual([
      expect.objectContaining({ title: "freelancer.com:40734895", sub: "Bid INR 18000", href: null, notes: "chased", param: toParam("freelancer.com:40734895") }),
    ]);
    expect(p.replied).toEqual([expect.objectContaining({ title: "remotive:7", sub: "remotive", href: null })]);
    expect(p.won).toEqual([expect.objectContaining({ title: "node/404", sub: "local", href: null, kind: "local" })]);
  });
});
