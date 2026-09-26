import { beforeAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/login/route";

beforeAll(() => {
  process.env.APP_PASSWORD = "river lamp tiger 42";
  process.env.SESSION_SECRET = "test-secret-0123456789";
});

const login = (password: string, ip: string) =>
  POST(
    new Request("https://x.test/api/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": ip },
      body: JSON.stringify({ password }),
    }),
  );

describe("POST /api/login", () => {
  it("sets the session cookie on the right password", async () => {
    const res = await login("river lamp tiger 42", "10.0.0.1");
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/cp_session=\d+\.[0-9a-f]{64}/);
    expect(res.headers.get("set-cookie")).toMatch(/HttpOnly/i);
  });
  it("returns 401 on a wrong password and 429 after 5 failures from one IP", async () => {
    for (let i = 0; i < 5; i++) expect((await login("wrong", "10.0.0.2")).status).toBe(401);
    const locked = await login("river lamp tiger 42", "10.0.0.2");
    expect(locked.status).toBe(429);
    expect(locked.headers.get("retry-after")).toBeTruthy();
    // another IP is unaffected
    expect((await login("river lamp tiger 42", "10.0.0.3")).status).toBe(200);
  });
});
