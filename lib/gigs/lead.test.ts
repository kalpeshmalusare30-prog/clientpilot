import { describe, expect, it } from "vitest";
import { isTooOld, keywordHits, makeLead, score } from "./lead";
import { safeIso, strip } from "./text";

const NOW = Date.parse("2026-09-27T12:00:00Z");
const DAY = 86_400_000;

describe("text helpers", () => {
  it("strips tags and decodes entities", () => {
    expect(strip("<p>React &amp; Node&#39;s</p>  <br>x")).toBe("React & Node's x");
    expect(strip(undefined)).toBe("");
  });
  it("safeIso never throws", () => {
    expect(safeIso(1790000000, "s")).toBe(new Date(1790000000 * 1000).toISOString());
    expect(safeIso("Fri, 25 Sep 2026 10:00:00 +0000")).toBe("2026-09-25T10:00:00.000Z");
    expect(safeIso("garbage")).toBe("");
    expect(safeIso(undefined)).toBe("");
    expect(safeIso("")).toBe("");
  });
});

describe("makeLead", () => {
  it("builds a lead and lowercases/trims tags", () => {
    expect(makeLead({ source: "remotive", id: 7, title: "<b>Dev</b>", url: " https://a.b/c ", tags: [" React ", "", null] })).toEqual({
      id: "remotive:7", source: "remotive", title: "Dev", desc: "", url: "https://a.b/c", date: "", budget: "", tags: ["react"], extra: "",
    });
  });
  it("skips items without a stable id or url", () => {
    expect(makeLead({ source: "x", id: undefined, url: "https://a" })).toBeNull();
    expect(makeLead({ source: "x", id: "", url: "https://a" })).toBeNull();
    expect(makeLead({ source: "x", id: 1, url: "" })).toBeNull();
  });
});

describe("score", () => {
  const base = { id: "freelancer.com:1", source: "freelancer.com", title: "React developer for dashboard", desc: "Need node and typescript", url: "https://x", tags: [], budget: "$100–$200", extra: "low-bids (3 bids)", date: new Date(NOW - DAY).toISOString() };
  it("counts keywords in title (x3, max 9) and body (max 5)", () => {
    expect(keywordHits(base)).toEqual({ inTitle: 2, inBody: 2 });
  });
  it("adds recency, budget, freelance-source and low-bid bonuses", () => {
    expect(score(base, NOW)).toBe(19); // 6 + 2 + 4 + 2 + 3 + 2
    expect(score({ ...base, source: "remotive", budget: "", extra: "", date: new Date(NOW - 10 * DAY).toISOString() }, NOW)).toBe(9); // 6 + 2 + 1
    expect(score({ ...base, source: "remotive", budget: "", extra: "", date: "" }, NOW)).toBe(8);
  });
  it("isTooOld keeps undated and unparseable dates", () => {
    expect(isTooOld(new Date(NOW - 22 * DAY).toISOString(), NOW)).toBe(true);
    expect(isTooOld(new Date(NOW - 20 * DAY).toISOString(), NOW)).toBe(false);
    expect(isTooOld("nope", NOW)).toBe(false);
  });
});
