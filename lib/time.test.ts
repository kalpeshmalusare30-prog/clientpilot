import { describe, expect, it } from "vitest";
import { addDaysISO, ageLabel, followUpState, istDayEnd } from "./time";

// 2026-09-27T20:00:00Z is 28 Sep 01:30 IST.
const NOW = Date.parse("2026-09-27T20:00:00Z");

describe("istDayEnd", () => {
  it("returns the last millisecond of the IST day containing now", () => {
    expect(new Date(istDayEnd(NOW)).toISOString()).toBe("2026-09-28T18:29:59.999Z");
  });
  it("handles a time just before IST midnight", () => {
    const t = Date.parse("2026-09-27T18:29:00Z"); // 27 Sep 23:59 IST
    expect(new Date(istDayEnd(t)).toISOString()).toBe("2026-09-27T18:29:59.999Z");
  });
});

describe("followUpState", () => {
  it("is none when unset or invalid", () => {
    expect(followUpState(undefined, NOW)).toBe("none");
    expect(followUpState("nope", NOW)).toBe("none");
  });
  it("is overdue before the start of today (IST)", () => {
    expect(followUpState("2026-09-27T18:00:00Z", NOW)).toBe("overdue"); // 27 Sep 23:30 IST
  });
  it("is today within the IST day", () => {
    expect(followUpState("2026-09-28T05:30:00Z", NOW)).toBe("today"); // 28 Sep 11:00 IST
  });
  it("is later after today", () => {
    expect(followUpState("2026-09-28T19:00:00Z", NOW)).toBe("later"); // 29 Sep 00:30 IST
  });
});

describe("addDaysISO / ageLabel", () => {
  it("adds whole days", () => {
    expect(addDaysISO("2026-09-26T10:00:00.000Z", 3)).toBe("2026-09-29T10:00:00.000Z");
  });
  it("labels ages in minutes, hours and days", () => {
    expect(ageLabel(new Date(NOW - 5 * 60_000).toISOString(), NOW)).toBe("5m");
    expect(ageLabel(new Date(NOW - 3 * 3_600_000).toISOString(), NOW)).toBe("3h");
    expect(ageLabel(new Date(NOW - 2 * 86_400_000).toISOString(), NOW)).toBe("2d");
    expect(ageLabel("", NOW)).toBe("");
  });
});
