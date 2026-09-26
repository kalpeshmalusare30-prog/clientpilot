import { beforeAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/logout/route";
import { COOKIE_NAME, signSession } from "@/lib/auth/crypto";

beforeAll(() => {
  process.env.APP_PASSWORD = "river lamp tiger 42";
  process.env.SESSION_SECRET = "test-secret-0123456789";
});

const logout = (cookie?: string) =>
  POST(
    new Request("https://x.test/api/logout", {
      method: "POST",
      headers: cookie ? { cookie } : {},
    }),
  );

describe("POST /api/logout", () => {
  it("returns 401 without a valid session cookie", async () => {
    const res = await logout();
    expect(res.status).toBe(401);
  });
  it("clears the session cookie with a valid session", async () => {
    const token = await signSession();
    const res = await logout(`${COOKIE_NAME}=${token}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(new RegExp(`${COOKIE_NAME}=;`));
    expect(res.headers.get("set-cookie")).toMatch(/Max-Age=0/i);
  });
});
