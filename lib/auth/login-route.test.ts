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
  it("locks after exactly 5 concurrent wrong attempts from one IP (no race)", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => login("wrong", "10.0.0.4")));
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 401)).toHaveLength(5);
    expect(statuses.filter((s) => s === 429)).toHaveLength(5);
  });
  it("does not admit a correct password fired alongside 5 concurrent wrong ones", async () => {
    const results = await Promise.all([
      login("wrong", "10.0.0.5"),
      login("wrong", "10.0.0.5"),
      login("wrong", "10.0.0.5"),
      login("wrong", "10.0.0.5"),
      login("wrong", "10.0.0.5"),
      login("river lamp tiger 42", "10.0.0.5"),
    ]);
    const correct = results[results.length - 1]!;
    expect(correct.status).not.toBe(200);
    expect(correct.status).toBe(429);
  });
  it("treats a JSON body of null as a wrong password, not a crash", async () => {
    const res = await POST(
      new Request("https://x.test/api/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-real-ip": "10.0.0.6" },
        body: "null",
      }),
    );
    expect(res.status).toBe(401);
  });
});
