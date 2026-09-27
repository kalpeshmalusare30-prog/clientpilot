import { describe, expect, it } from "vitest";
import { summarize } from "./dashboard";
import { emptyData } from "./defaults";
import { toParam } from "./ids";
import type { GigsDoc } from "./types";

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
