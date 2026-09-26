import { describe, expect, it } from "vitest";
import { defaultSettings, emptyData, normalizeData } from "./defaults";

describe("defaults", () => {
  it("default settings carry the facts, NEVER list, links and a WA template with all placeholders", () => {
    const s = defaultSettings();
    expect(s.facts).toContain("Kaizen Infotech Solutions");
    expect(s.facts).toContain("https://agentbandhu.com");
    expect(s.never).toMatch(/React Native/);
    expect(s.allowedLinks).toEqual([
      "https://agentbandhu.com",
      "https://kalpesh-malusare.vercel.app",
      "https://demos-kal1201.vercel.app",
    ]);
    for (const p of ["{intro}", "{name}", "{benefit}", "{demo_line}"]) expect(s.waTemplate).toContain(p);
    expect(s.waTemplate).not.toMatch(/google/i);
  });
  it("normalizeData fills missing settings fields and collections", () => {
    const d = normalizeData({ updatedAt: "x" } as never);
    expect(d.state).toEqual({});
    expect(d.local).toEqual([]);
    expect(d.settings.facts).toBe(defaultSettings().facts);
    const custom = normalizeData({ ...emptyData("t"), settings: { facts: "mine" } as never });
    expect(custom.settings.facts).toBe("mine");
    expect(custom.settings.allowedLinks.length).toBe(3);
  });
});
