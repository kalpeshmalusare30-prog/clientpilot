import { describe, expect, it } from "vitest";
import { fetchAll, SOURCES } from "./sources";

describe("fetchAll", () => {
  it("collects leads from sources that succeed and names the ones that fail", async () => {
    const res = await fetchAll([
      { key: "ok", run: async () => [{ id: "ok:1", source: "ok", title: "t", desc: "", url: "https://u", date: "", budget: "", tags: [], extra: "" }] },
      { key: "bad", run: async () => { throw new Error("HTTP 500"); } },
    ]);
    expect(res.leads.map((l) => l.id)).toEqual(["ok:1"]);
    expect(res.failed).toEqual(["bad"]);
  });
  it("wires exactly the eight ported sources", () => {
    expect(SOURCES.map((s) => s.key)).toEqual([
      "freelancer.com", "hn-thread", "remotive", "remoteok", "weworkremotely", "workingnomads", "jobicy", "himalayas",
    ]);
  });
});
