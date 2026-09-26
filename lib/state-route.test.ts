import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PATCH } from "@/app/api/state/[id]/route";
import { COOKIE_NAME, signSession } from "@/lib/auth/crypto";
import { toParam } from "@/lib/ids";
import { createStore, setStoreForTests } from "@/lib/store";
import { MemoryBackend } from "@/lib/store/memory";

let cookie = "";
beforeAll(async () => {
  process.env.SESSION_SECRET = "test-secret-0123456789";
  cookie = `${COOKIE_NAME}=${await signSession()}`;
});
beforeEach(() => setStoreForTests(createStore(new MemoryBackend())));

const call = (id: string, kind: string, body: unknown, withCookie = true) =>
  PATCH(
    new Request(`https://x.test/api/state/${toParam(id)}?kind=${kind}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...(withCookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: toParam(id) }) },
  );

describe("PATCH /api/state/[id]", () => {
  it("requires a session", async () => {
    expect((await call("freelancer.com:1", "gig", { type: "skip" }, false)).status).toBe(401);
  });
  it("rejects a bad kind or body", async () => {
    expect((await call("freelancer.com:1", "other", { type: "skip" })).status).toBe(400);
    expect((await call("freelancer.com:1", "gig", { type: "nope" })).status).toBe(400);
  });
  it("applies the action and persists it", async () => {
    const res = await call("freelancer.com:1", "gig", { type: "bid", amount: 7000, currency: "INR" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { state: { status: string; bidAmount: number } };
    expect(json.state).toMatchObject({ status: "sent", bidAmount: 7000 });
  });
});
