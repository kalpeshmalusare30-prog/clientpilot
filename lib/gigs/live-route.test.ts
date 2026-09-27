import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/gigs/live", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/gigs/live")>()),
  fetchLive: async (pid: number) => {
    if (pid === 3) throw new Error("HTTP 503");
    return pid === 1 ? { open: true, status: "open", bidCount: 52, bidAvg: 24640, currency: "INR" } : null;
  },
}));

import { GET } from "@/app/api/gigs/[id]/live/route";
import { COOKIE_NAME, signSession } from "@/lib/auth/crypto";
import { toParam } from "@/lib/ids";

let cookie = "";
beforeAll(async () => {
  process.env.SESSION_SECRET = "test-secret-0123456789";
  cookie = `${COOKIE_NAME}=${await signSession()}`;
});

const get = (id: string, withCookie = true) =>
  GET(new Request(`https://x.test/api/gigs/${toParam(id)}/live`, { headers: withCookie ? { cookie } : {} }), { params: Promise.resolve({ id: toParam(id) }) });

describe("GET /api/gigs/[id]/live", () => {
  it("requires a session", async () => {
    expect((await get("freelancer.com:1", false)).status).toBe(401);
  });
  it("400s for non-Freelancer gigs and 404s when the project is gone", async () => {
    expect((await get("remotive:5")).status).toBe(400);
    expect((await get("freelancer.com:2")).status).toBe(404);
  });
  it("returns live info", async () => {
    const res = await get("freelancer.com:1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, live: { open: true, status: "open", bidCount: 52, bidAvg: 24640, currency: "INR" } });
  });
});

describe("GET /api/gigs/[id]/live — bad input and upstream failure", () => {
  it("400s for a malformed id param instead of throwing a 500", async () => {
    const res = await GET(new Request("https://x.test/api/gigs/!!!/live", { headers: { cookie } }), { params: Promise.resolve({ id: "!!!" }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false });
  });
  it("502s with the upstream error when the Freelancer API fails", async () => {
    const res = await get("freelancer.com:3");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: "Freelancer API: HTTP 503" });
  });
});
