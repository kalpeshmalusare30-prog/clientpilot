import { describe, expect, it } from "vitest";
import { followUpActionFor, notSaved, revertFollowUpInput, settingsResult, SETTINGS_OK_MS } from "@/lib/client-forms";

describe("F-9: Pipeline follow-up", () => {
  it("a blank or half-typed picker value is not a write (never clears the follow-up)", () => {
    expect(followUpActionFor("")).toBeNull();
    expect(followUpActionFor("2026-09-")).toBeNull();
    expect(followUpActionFor("2026-09-30T")).toBeNull();
  });
  it("a complete value becomes one followUp action", () => {
    const a = followUpActionFor("2026-09-30T11:00");
    expect(a).toEqual({ type: "followUp", followUpAt: new Date("2026-09-30T11:00").toISOString() });
  });
  it("after a failed write the picker goes back to the stored date and the error says not saved", () => {
    expect(revertFollowUpInput(undefined)).toBe("");
    expect(revertFollowUpInput("")).toBe("");
    expect(revertFollowUpInput("2026-09-29T05:30:00.000Z")).toMatch(/^2026-09-29T\d\d:\d\d$/);
    expect(notSaved(new Error("HTTP 500"))).toBe("Save zala nahi — HTTP 500");
  });
});

describe("F-10: Settings result", () => {
  it("an error says not saved and stays; success clears itself", () => {
    expect(settingsResult(new Error("invalid settings"))).toEqual({ text: "Save zala nahi — invalid settings", role: "alert", clearAfterMs: null });
    expect(settingsResult(null)).toEqual({ text: "Saved", role: "status", clearAfterMs: SETTINGS_OK_MS });
  });
});

describe("F-10: the Settings result never floats over Save/Logout", () => {
  it("renders inline (no fixed .toast) with a close button", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../app/(app)/settings/SettingsForm.tsx", import.meta.url), "utf8");
    expect(src).not.toMatch(/className="toast"/);
    expect(src).toMatch(/aria-label="Close"/);
  });
});
