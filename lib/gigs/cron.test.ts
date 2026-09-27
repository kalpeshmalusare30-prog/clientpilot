import { describe, expect, it } from "vitest";
import { MAX_PINNED, pinnedGigIds, runGigCron } from "./cron";
import { createStore } from "@/lib/store";
import { MemoryBackend } from "@/lib/store/memory";
import type { Gig, LeadState } from "@/lib/types";
import type { LeadDraft } from "./lead";

const NOW = Date.parse("2026-09-27T01:30:00Z");
const lead = (id: string, title = "React developer"): LeadDraft => ({
  id, source: "remotive", title, desc: "", url: `https://x/${id}`, date: "2026-09-26T10:00:00.000Z", budget: "", tags: [], extra: "",
});

describe("runGigCron", () => {
  it("merges fetched gigs, records lastRun and keeps gigs Kalpesh acted on", async () => {
    const store = createStore(new MemoryBackend());
    await store.mutateGigs((g) => ({
      ...g,
      items: [{ ...lead("old"), date: "2026-08-01T00:00:00.000Z", fetchedAt: "2026-08-01T00:00:00.000Z", score: 5 }],
    }));
    await store.mutateData((d) => {
      d.state["old"] = { kind: "gig", status: "sent", updatedAt: "t" };
      return d;
    });
    const res = await runGigCron(store, async () => ({ leads: [lead("a"), lead("b", "Chef wanted")], failed: ["remoteok"] }), NOW);
    expect(res).toEqual({ added: 1, total: 2, failed: ["remoteok"] });
    const gigs = await store.readGigs({ fresh: true });
    expect(gigs.items.map((g) => g.id).sort()).toEqual(["a", "old"]);
    expect(gigs.lastRun).toEqual({ at: new Date(NOW).toISOString(), added: 1, failed: ["remoteok"] });
  });

  it("fetches once and re-merges onto the newer doc when a concurrent write causes an ETag conflict", async () => {
    const backend = new MemoryBackend();
    const store = createStore(backend);
    await store.mutateGigs((g) => g);
    let fetches = 0;
    backend.beforeNextPut = () => {
      const concurrent = { updatedAt: "t", lastRun: null, items: [{ ...lead("c"), fetchedAt: "2026-09-26T00:00:00.000Z", score: 0 }] };
      backend.set("gigs.json", JSON.stringify(concurrent));
    };
    const res = await runGigCron(store, async () => {
      fetches++;
      return { leads: [lead("a")], failed: [] };
    }, NOW);
    expect(fetches).toBe(1);
    expect(res).toEqual({ added: 1, total: 2, failed: [] });
    const gigs = await store.readGigs({ fresh: true });
    expect(gigs.items.map((g) => g.id).sort()).toEqual(["a", "c"]);
  });

  const oldGig = (id: string): Gig => ({ ...lead(id), date: "2026-08-01T00:00:00.000Z", fetchedAt: "2026-08-01T00:00:00.000Z", score: 5 });

  it("lets an old skipped gig age out but keeps an old gig with a bid sent", async () => {
    const store = createStore(new MemoryBackend());
    await store.mutateGigs((g) => ({ ...g, items: [oldGig("skip"), oldGig("sent")] }));
    await store.mutateData((d) => {
      d.state["skip"] = { kind: "gig", status: "skipped", updatedAt: "2026-08-02T00:00:00.000Z" };
      d.state["sent"] = { kind: "gig", status: "sent", updatedAt: "2026-08-02T00:00:00.000Z" };
      return d;
    });
    const res = await runGigCron(store, async () => ({ leads: [lead("a")], failed: [] }), NOW);
    expect(res).toEqual({ added: 1, total: 2, failed: [] });
    const gigs = await store.readGigs({ fresh: true });
    expect(gigs.items.map((g) => g.id).sort()).toEqual(["a", "sent"]);
  });

  it("keeps room for fresh gigs however many old gigs Kalpesh has acted on", async () => {
    const store = createStore(new MemoryBackend());
    const n = 650;
    const ids = Array.from({ length: n }, (_, i) => `g${String(i).padStart(3, "0")}`);
    await store.mutateGigs((g) => ({ ...g, items: ids.map(oldGig) }));
    await store.mutateData((d) => {
      // g649 was touched most recently, g000 longest ago.
      ids.forEach((id, i) => (d.state[id] = { kind: "gig", status: "sent", updatedAt: new Date(NOW - (n - i) * 60_000).toISOString() }));
      return d;
    });
    const res = await runGigCron(store, async () => ({ leads: [lead("a")], failed: [] }), NOW);
    const gigs = await store.readGigs({ fresh: true });
    const got = gigs.items.map((g) => g.id);
    expect(got).toContain("a");
    expect(got).toHaveLength(MAX_PINNED + 1);
    expect(got).toContain("g649"); // most recently touched stays pinned
    expect(got).not.toContain("g000"); // least recently touched ages out once past the pin limit
    expect(res).toEqual({ added: 1, total: MAX_PINNED + 1, failed: [] });
    expect(gigs.lastRun?.added).toBe(1);
  });
});

describe("pinnedGigIds", () => {
  const st = (status: LeadState["status"], updatedAt: string, kind: LeadState["kind"] = "gig"): LeadState => ({ kind, status, updatedAt });

  it("pins only gigs still being worked on or closed as won/lost, most recently updated first, up to the limit", () => {
    const state: Record<string, LeadState> = {
      n: st("new", "2026-09-26T00:00:00.000Z"),
      s: st("skipped", "2026-09-26T00:00:00.000Z"),
      loc: st("sent", "2026-09-26T00:00:00.000Z", "local"),
      d: st("drafted", "2026-09-20T00:00:00.000Z"),
      se: st("sent", "2026-09-21T00:00:00.000Z"),
      r: st("replied", "2026-09-22T00:00:00.000Z"),
      w: st("won", "2026-09-23T00:00:00.000Z"),
      l: st("lost", "2026-09-24T00:00:00.000Z"),
      bad: st("sent", "not a date"),
    };
    expect([...pinnedGigIds(state)].sort()).toEqual(["bad", "d", "l", "r", "se", "w"]);
    expect([...pinnedGigIds(state, 3)].sort()).toEqual(["l", "r", "w"]);
    expect([...pinnedGigIds(state, 6)]).toContain("bad");
  });
});
