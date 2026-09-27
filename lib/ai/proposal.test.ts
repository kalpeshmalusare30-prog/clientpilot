import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { buildCheckPrompt, buildDraftPrompt, draftProposal, isAllowedLink, stripDisallowedLinks } from "./proposal";
import type { LLM } from "./gemini";
import { defaultSettings } from "@/lib/defaults";
import type { Gig } from "@/lib/types";

const gig: Gig = {
  id: "freelancer.com:1", source: "freelancer.com", title: "React dashboard with Stripe", desc: "Build an admin dashboard. Start your bid with the word BANANA.",
  url: "https://www.freelancer.com/projects/x", date: "", budget: "₹12500–₹37500", tags: ["react.js"], extra: "40 bids", score: 10, fetchedAt: "",
};
const settings = defaultSettings();
const allowed = settings.allowedLinks;

describe("links", () => {
  it("allows only listed hosts and their subpaths", () => {
    expect(isAllowedLink("https://agentbandhu.com", allowed)).toBe(true);
    expect(isAllowedLink("https://www.agentbandhu.com/features", allowed)).toBe(true);
    expect(isAllowedLink("https://demos-kal1201.vercel.app/a9-digital-prints/", allowed)).toBe(true);
    expect(isAllowedLink("https://agentbandhu.com.evil.io", allowed)).toBe(false);
    expect(isAllowedLink("https://github.com/kalpesh", allowed)).toBe(false);
    expect(isAllowedLink("not a url", allowed)).toBe(false);
  });
  it("strips disallowed links but keeps punctuation and allowed links", () => {
    const r = stripDisallowedLinks("See https://agentbandhu.com. Code: https://github.com/x, and https://kalpesh-malusare.vercel.app!", allowed);
    expect(r.text).toBe("See https://agentbandhu.com. Code:, and https://kalpesh-malusare.vercel.app!");
    expect(r.removed).toEqual(["https://github.com/x"]);
  });
});

describe("prompts", () => {
  it("draft prompt carries the gig, facts, NEVER list, links and the 1500-char rule", () => {
    const p = buildDraftPrompt(gig, settings);
    for (const s of ["React dashboard with Stripe", "BANANA", "40 bids", "₹12500–₹37500", "Kaizen Infotech Solutions", "React Native", "https://agentbandhu.com", "1500"]) {
      expect(p).toContain(s);
    }
  });
  it("check prompt includes the draft and asks for JSON", () => {
    const p = buildCheckPrompt(gig, settings, "DRAFT TEXT");
    expect(p).toContain("DRAFT TEXT");
    expect(p).toMatch(/"text"/);
    expect(p).toMatch(/"changes"/);
  });
});

class FakeLLM implements LLM {
  constructor(private text: string, private check: unknown | Error) {}
  async completeText() {
    return this.text;
  }
  async completeJSON<T>(_p: string, schema: z.ZodType<T>): Promise<T> {
    if (this.check instanceof Error) throw this.check;
    return schema.parse(this.check);
  }
}

describe("draftProposal", () => {
  it("returns the checked text with disallowed links removed", async () => {
    const r = await draftProposal(new FakeLLM("draft", { text: "BANANA. Built https://agentbandhu.com and https://evil.io too.", changes: ["removed a claim"] }), gig, settings);
    expect(r.text).toBe("BANANA. Built https://agentbandhu.com and too.");
    expect(r.changes).toEqual(["removed a claim"]);
    expect(r.removedLinks).toEqual(["https://evil.io"]);
  });
  it("falls back to the draft with a warning when the check fails", async () => {
    const r = await draftProposal(new FakeLLM("  draft text  ", new Error("503")), gig, settings);
    expect(r.text).toBe("draft text");
    expect(r.changes[0]).toMatch(/honesty check/i);
  });
});
