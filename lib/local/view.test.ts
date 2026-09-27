import { describe, expect, it } from "vitest";
import { groupLocal, searchSummary } from "./view";
import type { LeadState, LocalBiz } from "@/lib/types";

const b = (id: string, name: string, segment: LocalBiz["segment"]) => ({ id, name, segment } as LocalBiz);
const st = (status: LeadState["status"]): LeadState => ({ kind: "local", status, updatedAt: "t" });

describe("groupLocal", () => {
  const local = [b("1", "Zeta", "no_website"), b("2", "Alpha", "no_website"), b("3", "Down Co", "site_down"), b("4", "Won Co", "no_website"), b("5", "Beta", "no_website")];
  const state = { "4": st("won"), "5": st("sent") };
  it("groups by segment in priority order, new first then by name, hiding closed ones", () => {
    const g = groupLocal(local, state, "open");
    expect(g.map((x) => x.segment)).toEqual(["site_down", "no_website"]);
    expect(g[1]!.items.map((i) => [i.biz.name, i.status])).toEqual([["Alpha", "new"], ["Zeta", "new"], ["Beta", "sent"]]);
    expect(g[1]!.label).toBe("No website");
  });
  it("shows closed ones with show=all", () => {
    expect(groupLocal(local, state, "all")[1]!.items).toHaveLength(4);
  });
});

describe("searchSummary", () => {
  const r = { added: 5, scanned: 120, partial: false, skippedAudits: 0, areaLabel: "Andheri" };
  it("says how many new businesses were added and how many were scanned", () => {
    expect(searchSummary(r)).toBe("Andheri: 5 navin dukane (120 tapasli)");
  });
  it("says a partial search should be run again for more", () => {
    expect(searchSummary({ ...r, partial: true })).toBe("Andheri: 5 navin dukane (120 tapasli) — partial, jast sathi parat shodha");
  });
  it("counts the websites left unchecked, which a later search checks again", () => {
    expect(searchSummary({ ...r, partial: true, skippedAudits: 3 })).toBe(
      "Andheri: 5 navin dukane (120 tapasli) — partial (3 website tapasayche rahile), jast sathi parat shodha",
    );
  });
});
