import { describe, expect, it } from "vitest";
import { ActionSchema, applyAction } from "./state";

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
