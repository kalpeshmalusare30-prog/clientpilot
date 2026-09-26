import { describe, expect, it } from "vitest";
import { createStore, DATA_PATH, GIGS_PATH } from "./index";
import { MemoryBackend } from "./memory";
import { PreconditionFailed } from "./backend";
import { emptyData } from "../defaults";

let tick = 0;
const clock = () => `2026-09-27T00:00:${String(tick++ % 60).padStart(2, "0")}.000Z`;

describe("store", () => {
  it("returns empty documents when nothing is stored", async () => {
    const s = createStore(new MemoryBackend(), clock);
    const d = await s.readData();
    expect(d.local).toEqual([]);
    expect(d.settings.allowedLinks.length).toBe(3);
    const g = await s.readGigs();
    expect(g.items).toEqual([]);
    expect(g.lastRun).toBeNull();
  });

  it("persists a mutation and stamps updatedAt", async () => {
    const b = new MemoryBackend();
    const s = createStore(b, clock);
    await s.mutateData((d) => {
      d.state["x"] = { kind: "gig", status: "sent", updatedAt: "t" };
      return d;
    });
    const again = await s.readData();
    expect(again.state["x"]?.status).toBe("sent");
    expect(again.updatedAt).toMatch(/^2026-09-27T/);
  });

  it("re-applies the change on a concurrent write instead of losing either", async () => {
    const b = new MemoryBackend();
    const s = createStore(b, clock);
    await s.mutateData((d) => d); // create the document
    b.beforeNextPut = () => {
      const other = emptyData("t");
      other.state["other"] = { kind: "local", status: "replied", updatedAt: "t" };
      b.set(DATA_PATH, JSON.stringify(other)); // someone else wrote first
    };
    await s.mutateData((d) => {
      d.state["mine"] = { kind: "gig", status: "skipped", updatedAt: "t" };
      return d;
    });
    const d = await s.readData();
    expect(d.state["other"]?.status).toBe("replied");
    expect(d.state["mine"]?.status).toBe("skipped");
  });

  it("gives up after 3 conflicting attempts", async () => {
    const b = new MemoryBackend();
    const s = createStore(b, clock);
    await s.mutateGigs((g) => g);
    const arm = () => {
      b.beforeNextPut = () => {
        b.set(GIGS_PATH, JSON.stringify({ updatedAt: "z", lastRun: null, items: [] }));
        arm();
      };
    };
    arm();
    await expect(s.mutateGigs((g) => g)).rejects.toBeInstanceOf(PreconditionFailed);
  });

  it("writeAll overwrites both documents", async () => {
    const b = new MemoryBackend();
    const s = createStore(b, clock);
    const data = emptyData("t");
    data.state["a"] = { kind: "gig", status: "won", updatedAt: "t" };
    await s.writeAll({ updatedAt: "t", lastRun: null, items: [] }, data);
    expect((await s.readData()).state["a"]?.status).toBe("won");
  });
});
