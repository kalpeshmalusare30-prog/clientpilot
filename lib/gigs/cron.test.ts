import { describe, expect, it } from "vitest";
import { runGigCron } from "./cron";
import { createStore } from "@/lib/store";
import { MemoryBackend } from "@/lib/store/memory";
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
});
