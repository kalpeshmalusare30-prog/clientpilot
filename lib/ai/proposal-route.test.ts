import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const ai = vi.hoisted(() => ({ text: "Draft for you", checked: "Checked proposal https://agentbandhu.com" }));

vi.mock("@/lib/ai/gemini", () => ({
  GeminiProvider: class {
    async completeText() {
      return ai.text;
    }
    async completeJSON() {
      return { text: ai.checked, changes: [] };
    }
  },
}));

import { POST } from "@/app/api/ai/proposal/route";
import { COOKIE_NAME, signSession } from "@/lib/auth/crypto";
import { createStore, getStore, setStoreForTests } from "@/lib/store";
import { MemoryBackend } from "@/lib/store/memory";

let cookie = "";
beforeAll(async () => {
  process.env.SESSION_SECRET = "test-secret-0123456789";
  process.env.GEMINI_API_KEY = "k";
  cookie = `${COOKIE_NAME}=${await signSession()}`;
});
beforeEach(async () => {
  ai.text = "Draft for you";
  ai.checked = "Checked proposal https://agentbandhu.com";
  const store = createStore(new MemoryBackend());
  await store.mutateGigs((g) => ({
    ...g,
    items: [{ id: "freelancer.com:9", source: "freelancer.com", title: "React app", desc: "d", url: "https://x", date: "", budget: "", tags: [], extra: "", score: 5, fetchedAt: "" }],
  }));
  setStoreForTests(store);
});

const post = (body: unknown, withCookie = true) =>
  POST(new Request("https://x.test/api/ai/proposal", {
    method: "POST",
    headers: { "content-type": "application/json", ...(withCookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  }));

describe("POST /api/ai/proposal", () => {
  it("requires a session", async () => {
    expect((await post({ id: "freelancer.com:9" }, false)).status).toBe(401);
  });
  it("404s for an unknown gig", async () => {
    expect((await post({ id: "nope" })).status).toBe(404);
  });
  it("returns and saves the proposal as drafted", async () => {
    const res = await post({ id: "freelancer.com:9" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { text: string; chars: number; overLimit: boolean };
    expect(json.text).toBe("Checked proposal https://agentbandhu.com");
    expect(json.chars).toBe(json.text.length);
    expect(json.overLimit).toBe(false);
    const d = await getStore().readData();
    expect(d.state["freelancer.com:9"]).toMatchObject({ status: "drafted", proposal: json.text });
  });
  it("passes overLimit through when the proposal stays over 1500 characters (T7-1)", async () => {
    const long = "Plan step is here. ".repeat(90).trim();
    ai.text = long;
    ai.checked = long;
    const res = await post({ id: "freelancer.com:9" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { text: string; chars: number; changes: string[]; overLimit: boolean };
    expect(json.overLimit).toBe(true);
    expect(json.text).toBe(long);
    expect(json.chars).toBe(long.length);
    expect(json.changes).toContain(`Over 1500 characters (${long.length}) — trim before sending`);
  });
});
