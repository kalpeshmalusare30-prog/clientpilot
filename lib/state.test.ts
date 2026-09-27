import { describe, expect, it } from "vitest";
import { ActionSchema, applyAction, sendResultText } from "./state";
import type { LeadState } from "./types";

const NOW = "2026-09-26T10:00:00.000Z";

describe("applyAction", () => {
  it("creates state for a new lead and moves new → drafted on proposal", () => {
    const s = applyAction(undefined, "gig", { type: "proposal", proposal: "Hi" }, NOW);
    expect(s).toMatchObject({ kind: "gig", status: "drafted", proposal: "Hi", updatedAt: NOW });
  });
  it("keeps a later status when the proposal is edited", () => {
    const sent = applyAction(undefined, "gig", { type: "bid", amount: 18000, currency: "INR" }, NOW);
    const edited = applyAction(sent, "gig", { type: "proposal", proposal: "v2" }, NOW);
    expect(edited.status).toBe("sent");
    expect(edited.proposal).toBe("v2");
  });
  it("records a bid with a follow-up in 3 days", () => {
    const s = applyAction(undefined, "gig", { type: "bid", amount: 18000, currency: "INR" }, NOW);
    expect(s).toMatchObject({
      status: "sent",
      bidAmount: 18000,
      bidCurrency: "INR",
      sentAt: NOW,
      followUpAt: "2026-09-29T10:00:00.000Z",
    });
  });
  it("marks a WhatsApp send the same way", () => {
    const s = applyAction(undefined, "local", { type: "sent" }, NOW);
    expect(s).toMatchObject({ kind: "local", status: "sent", sentAt: NOW, followUpAt: "2026-09-29T10:00:00.000Z" });
  });
  it("clears the follow-up for closed stages and skip", () => {
    const sent = applyAction(undefined, "gig", { type: "sent" }, NOW);
    for (const status of ["won", "lost", "skipped"] as const) {
      expect(applyAction(sent, "gig", { type: "stage", status }, NOW).followUpAt).toBeUndefined();
    }
    expect(applyAction(sent, "gig", { type: "skip" }, NOW)).toMatchObject({ status: "skipped", followUpAt: undefined });
    expect(applyAction(sent, "gig", { type: "stage", status: "replied" }, NOW).followUpAt).toBe(sent.followUpAt);
  });
  it("sets and clears follow-up dates and notes", () => {
    const a = applyAction(undefined, "local", { type: "followUp", followUpAt: "2026-09-28T05:30:00.000Z" }, NOW);
    expect(a.followUpAt).toBe("2026-09-28T05:30:00.000Z");
    expect(applyAction(a, "local", { type: "followUp", followUpAt: null }, NOW).followUpAt).toBeUndefined();
    expect(applyAction(a, "local", { type: "notes", notes: "call Monday" }, NOW).notes).toBe("call Monday");
  });
});

describe("ActionSchema", () => {
  it("accepts valid actions and rejects bad ones", () => {
    expect(ActionSchema.safeParse({ type: "bid", amount: 380, currency: "USD" }).success).toBe(true);
    expect(ActionSchema.safeParse({ type: "stage", status: "won" }).success).toBe(true);
    expect(ActionSchema.safeParse({ type: "stage", status: "bogus" }).success).toBe(false);
    expect(ActionSchema.safeParse({ type: "bid", amount: -1, currency: "INR" }).success).toBe(false);
    expect(ActionSchema.safeParse({ type: "proposal", proposal: "x".repeat(5001) }).success).toBe(false);
    expect(ActionSchema.safeParse({ type: "nope" }).success).toBe(false);
  });
});

describe("F-5: sending again never demotes an engaged lead", () => {
  const T = "2026-09-28T06:00:00.000Z";
  const prev = (status: LeadState["status"], extra: Partial<LeadState> = {}): LeadState => ({ kind: "local", status, updatedAt: "t", ...extra });
  it("replied stays replied, gets sentAt and a follow-up", () => {
    const s = applyAction(prev("replied"), "local", { type: "sent" }, T);
    expect(s.status).toBe("replied");
    expect(s.sentAt).toBe(T);
    expect(s.followUpAt).toBe("2026-10-01T06:00:00.000Z");
  });
  it("won stays won with no new follow-up", () => {
    const s = applyAction(prev("won", { followUpAt: undefined }), "local", { type: "sent" }, T);
    expect(s).toMatchObject({ status: "won", sentAt: T });
    expect(s.followUpAt).toBeUndefined();
  });
  it("lost stays lost (only a stage change resets it), no follow-up", () => {
    const s = applyAction(prev("lost"), "local", { type: "sent" }, T);
    expect(s).toMatchObject({ status: "lost", sentAt: T });
    expect(s.followUpAt).toBeUndefined();
  });
  it("new/drafted/sent/skipped become sent with a follow-up", () => {
    for (const st of ["new", "drafted", "sent", "skipped"] as const) {
      const s = applyAction(prev(st), "local", { type: "sent" }, T);
      expect(s).toMatchObject({ status: "sent", sentAt: T, followUpAt: "2026-10-01T06:00:00.000Z" });
    }
  });
  it("a re-bid keeps replied/won/lost and records the bid", () => {
    expect(applyAction(prev("replied", { kind: "gig" }), "gig", { type: "bid", amount: 5, currency: "USD" }, T)).toMatchObject({ status: "replied", bidAmount: 5, sentAt: T });
    const won = applyAction(prev("won", { kind: "gig" }), "gig", { type: "bid", amount: 5, currency: "USD" }, T);
    expect(won).toMatchObject({ status: "won", bidAmount: 5 });
    expect(won.followUpAt).toBeUndefined();
    expect(applyAction(prev("lost", { kind: "gig" }), "gig", { type: "bid", amount: 5, currency: "USD" }, T).status).toBe("lost");
    expect(applyAction(prev("drafted", { kind: "gig" }), "gig", { type: "bid", amount: 5, currency: "USD" }, T).status).toBe("sent");
  });
});

describe("F-5: the toast says what was stored", () => {
  it("names the kept status instead of always 'Sent mark kela'", () => {
    expect(sendResultText("sent", "sent")).toBe("Sent mark kela · follow-up 3 divasani");
    expect(sendResultText("sent", "bid")).toBe("Bid saved · follow-up 3 divasani");
    expect(sendResultText("replied", "sent")).toBe("Contact save kela · status Reply aala tasach · follow-up 3 divasani");
    expect(sendResultText("won", "sent")).toBe("Contact save kela · status Client zala tasach");
    expect(sendResultText("lost", "bid")).toBe("Bid saved · status Lost tasach (badlaycha tar Pipeline madhe)");
  });
});
