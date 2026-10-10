import { describe, expect, it } from "vitest";
import { encodeLastSearch, lastSearchItems, lastSearchReply, parseLastSearch, type LastSearch } from "./last-search";
import type { LeadState, LocalBiz } from "@/lib/types";

const LAST: LastSearch = {
  at: "2026-10-10T09:30:00.000Z", area: "Dombivli East", category: "beauty", areaLabel: "Dombivli East",
  added: 2, scanned: 140, partial: false, skippedAudits: 0,
};

const biz = (id: string, name: string, createdAt: string) => ({ id, name, createdAt }) as LocalBiz;

describe("last search cookie", () => {
  it("round-trips through the cookie value", () => {
    const raw = encodeLastSearch(LAST);
    expect(parseLastSearch(raw)).toEqual(LAST);
    // What the browser stores after Next URL-encodes it, and what the page reads back after Next decodes it.
    expect(parseLastSearch(decodeURIComponent(encodeURIComponent(raw)))).toEqual(LAST);
    expect(raw.length).toBeLessThan(400);
  });

  it("cuts an over-long area label instead of failing the search", () => {
    const long = { ...LAST, areaLabel: "Dombivli ".repeat(30) };
    expect(parseLastSearch(encodeLastSearch(long))?.areaLabel).toBe(long.areaLabel.slice(0, 120));
  });

  it("ignores a missing, damaged or tampered cookie", () => {
    expect(parseLastSearch(undefined)).toBeNull();
    expect(parseLastSearch("")).toBeNull();
    expect(parseLastSearch("garbage")).toBeNull();
    expect(parseLastSearch("{not json")).toBeNull();
    expect(parseLastSearch(JSON.stringify({ ...LAST, added: -1 }))).toBeNull();
    expect(parseLastSearch(JSON.stringify({ area: "x" }))).toBeNull();
    expect(parseLastSearch("null")).toBeNull();
  });

  it("turns back into the reply the summary line is built from", () => {
    expect(lastSearchReply(LAST)).toEqual({ added: 2, partial: false, scanned: 140, skippedAudits: 0, areaLabel: "Dombivli East" });
  });
});

describe("lastSearchItems", () => {
  const local = [
    biz("node/1", "Zara Salon", LAST.at),
    biz("node/2", "Older Salon", "2026-10-01T09:30:00.000Z"),
    biz("node/3", "Asha Parlour", LAST.at),
    biz("node/4", "Bina Spa", LAST.at),
  ];
  const state: Record<string, LeadState> = { "node/3": { kind: "local", status: "sent", updatedAt: "x" } };

  it("returns only what that search added, new first, then by name", () => {
    expect(lastSearchItems(local, state, LAST).map((x) => [x.biz.id, x.status])).toEqual([
      ["node/4", "new"],
      ["node/1", "new"],
      ["node/3", "sent"],
    ]);
  });

  it("is empty without a last search, or when it added nothing", () => {
    expect(lastSearchItems(local, state, null)).toEqual([]);
    expect(lastSearchItems(local, state, { ...LAST, at: "2026-10-10T10:00:00.000Z", added: 0 })).toEqual([]);
  });
});

describe("last search lists saved businesses found again", () => {
  it("includes a business whose lastSeenAt matches the search", async () => {
    const { lastSearchItems } = await import("./last-search");
    const at = "2026-10-10T10:00:00.000Z";
    const mk = (id: string, extra: object) => ({ id, name: id, createdAt: "2026-09-01T00:00:00.000Z", ...extra }) as never;
    const items = lastSearchItems([mk("a", { lastSeenAt: at }), mk("b", {}), mk("c", { createdAt: at })], {}, { at } as never);
    expect(items.map((x) => x.biz.id).sort()).toEqual(["a", "c"]);
  });
});
