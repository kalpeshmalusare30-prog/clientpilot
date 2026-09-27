import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/gemini", () => ({
  GeminiProvider: class {
    async completeText() {
      return "Draft for you";
    }
    async completeJSON() {
      return { text: "Checked proposal https://agentbandhu.com", changes: [] };
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
    const json = (await res.json()) as { text: string; chars: number };
    expect(json.text).toBe("Checked proposal https://agentbandhu.com");
    expect(json.chars).toBe(json.text.length);
    const d = await getStore().readData();
    expect(d.state["freelancer.com:9"]).toMatchObject({ status: "drafted", proposal: json.text });
  });
});
