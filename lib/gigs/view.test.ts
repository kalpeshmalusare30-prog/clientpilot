import { describe, expect, it } from "vitest";
import { currencyFromBudget, filterGigs, parseFilter } from "./view";
import type { Gig, LeadState } from "@/lib/types";
import { describeProposal, httpUrl, limitWarning } from "./view";

const g =(id: string) => ({ id } as Gig);
const st = (status: LeadState["status"]): LeadState => ({ kind: "gig", status, updatedAt: "t" });

describe("gig view helpers", () => {
  const items = [g("a"), g("b"), g("c"), g("d"), g("e")];
  const state = { b: st("drafted"), c: st("sent"), d: st("replied"), e: st("skipped") };
  it("filters by status", () => {
    expect(filterGigs(items, state, "new").map((x) => x.id)).toEqual(["a"]);
    expect(filterGigs(items, state, "drafted").map((x) => x.id)).toEqual(["b"]);
    expect(filterGigs(items, state, "sent").map((x) => x.id)).toEqual(["c", "d"]);
    expect(filterGigs(items, state, "all").map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("parses the filter with a safe default", () => {
    expect(parseFilter("sent")).toBe("sent");
    expect(parseFilter("bogus")).toBe("new");
    expect(parseFilter(undefined)).toBe("new");
  });
  it("guesses the bid currency from the budget text", () => {
    expect(currencyFromBudget("₹12500–₹37500")).toBe("INR");
    expect(currencyFromBudget("INR10+/hr")).toBe("INR");
    expect(currencyFromBudget("$250–$750")).toBe("USD");
    expect(currencyFromBudget("€100–€300")).toBe("EUR");
    expect(currencyFromBudget("")).toBe("INR");
  });
});

describe("gig detail helpers", () => {
  it("keeps only http(s) gig links as hrefs (URLs come from third-party feeds)", () => {
    expect(httpUrl("https://www.freelancer.com/projects/x")).toBe("https://www.freelancer.com/projects/x");
    expect(httpUrl("http://remotive.com/job/1")).toBe("http://remotive.com/job/1");
    expect(httpUrl("javascript:alert(1)")).toBe("");
    expect(httpUrl(" JavaScript:alert(1)")).toBe("");
    expect(httpUrl("intent://scan/#Intent;scheme=zxing;end")).toBe("");
    expect(httpUrl("data:text/html,<b>x</b>")).toBe("");
    expect(httpUrl("/relative/path")).toBe("");
    expect(httpUrl("")).toBe("");
  });

  it("warns only when the proposal is over the limit, naming the excess", () => {
    expect(limitWarning(0, 1500)).toBeNull();
    expect(limitWarning(1500, 1500)).toBeNull();
    const w = limitWarning(1620, 1500);
    expect(w).toContain("1620/1500");
    expect(w).toContain("120");
  });

  it("turns the AI reply into change notes and flags an over-limit draft", () => {
    const ok = describeProposal({ text: "short", changes: ["Removed a claim"], removedLinks: ["https://evil.io"], overLimit: false }, 1500);
    expect(ok).toEqual({ notes: ["Removed a claim", "Removed link not on your allow-list: https://evil.io"], warning: null });

    const over = describeProposal(
      { text: "x".repeat(1612), changes: ["Over 1500 characters (1612) — trim before sending"], removedLinks: [], overLimit: true },
      1500,
    );
    expect(over.notes).toEqual(["Over 1500 characters (1612) — trim before sending"]);
    expect(over.warning).toContain("1612");
    expect(over.warning).toContain("1500");
  });

  it("lists a link that was removed several times only once", () => {
    const r = describeProposal({ text: "t", changes: [], removedLinks: ["https://evil.io/a", "https://evil.io/a", "https://x.io"], overLimit: false }, 1500);
    expect(r.notes).toEqual(["Removed link not on your allow-list: https://evil.io/a", "Removed link not on your allow-list: https://x.io"]);
  });

  it("tolerates a reply that lacks the optional fields", () => {
    expect(describeProposal({ text: "t" } as never, 1500)).toEqual({ notes: [], warning: null });
  });
});
