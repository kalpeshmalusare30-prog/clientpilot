import { describe, expect, it } from "vitest";
import { filterFetched, mergeGigs } from "./merge";
import type { LeadDraft } from "./lead";
import type { Gig } from "@/lib/types";

const NOW = Date.parse("2026-09-27T12:00:00Z");
const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();
const lead = (id: string, over: Partial<LeadDraft> = {}): LeadDraft => ({
  id, source: "remotive", title: "React developer", desc: "", url: `https://x/${id}`, date: iso(1), budget: "", tags: [], extra: "", ...over,
});

describe("filterFetched", () => {
  it("drops duplicates, stale gigs and gigs with no keyword; keeps undated ones", () => {
    const out = filterFetched([
      lead("a"),
      lead("a"),                                   // same id
      lead("b", { url: "https://x/a" }),           // same url
      lead("c", { date: iso(22) }),                // older than 21 days
      lead("d", { title: "Chef wanted" }),         // no keyword
      lead("e", { date: "" }),                     // undated → kept
    ], NOW);
    expect(out.map((l) => l.id)).toEqual(["a", "e"]);
  });
});

describe("mergeGigs", () => {
  const old = (id: string, over: Partial<Gig> = {}): Gig => ({ ...lead(id), score: 1, fetchedAt: iso(5), ...over });

  it("adds new gigs with fetchedAt=now and refreshes existing ones in place", () => {
    const { items, added } = mergeGigs([old("a", { extra: "3 bids" })], [lead("a", { extra: "40 bids" }), lead("b")], NOW);
    expect(added).toBe(1);
    const a = items.find((g) => g.id === "a")!;
    expect(a.extra).toBe("40 bids");
    expect(a.fetchedAt).toBe(iso(5));
    expect(items.find((g) => g.id === "b")!.fetchedAt).toBe(new Date(NOW).toISOString());
    expect(items.every((g) => g.score > 1)).toBe(true); // rescored
  });

  it("drops gigs older than 30 days unless pinned by keepIds", () => {
    const stale = old("s", { date: iso(40), fetchedAt: iso(40) });
    const pinned = old("p", { date: iso(40), fetchedAt: iso(40) });
    const { items } = mergeGigs([stale, pinned], [], NOW, { keepIds: new Set(["p"]) });
    expect(items.map((g) => g.id)).toEqual(["p"]);
  });

  it("caps the list by score but never drops pinned gigs", () => {
    const many = Array.from({ length: 10 }, (_, i) => old(`g${i}`, { title: i < 5 ? "React node dashboard saas api" : "React" }));
    const { items } = mergeGigs(many, [], NOW, { cap: 3, keepIds: new Set(["g9"]) });
    expect(items).toHaveLength(3);
    expect(items.map((g) => g.id)).toContain("g9");
  });

  it("counts as added only the new gigs that make it into the list", () => {
    const strong = lead("strong", { title: "React node dashboard saas api" });
    expect(mergeGigs([], [strong, lead("weak")], NOW, { cap: 1 })).toMatchObject({ added: 1 });
    const pinned = old("p");
    const r = mergeGigs([pinned], [lead("a")], NOW, { cap: 1, keepIds: new Set(["p"]) });
    expect(r.items.map((g) => g.id)).toEqual(["p"]);
    expect(r.added).toBe(0);
  });
});
