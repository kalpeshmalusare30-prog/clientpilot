import { beforeAll, describe, expect, it } from "vitest";
import { constantTimeEqual, signSession, verifySession } from "./crypto";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-0123456789";
});

describe("constantTimeEqual", () => {
  it("compares strings", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });
});

describe("session tokens", () => {
  const now = 1_800_000_000_000;
  it("verifies a token it signed", async () => {
    const t = await signSession(now);
    expect(t).toMatch(/^\d+\.[0-9a-f]{64}$/);
    expect(await verifySession(t, now + 1000)).toBe(true);
  });
  it("rejects expired, tampered, empty and foreign tokens", async () => {
    const t = await signSession(now);
    const [exp, sig] = t.split(".");
    expect(await verifySession(t, Number(exp) + 1)).toBe(false);
    expect(await verifySession(`${Number(exp) + 999}.${sig}`, now)).toBe(false);
    expect(await verifySession(undefined, now)).toBe(false);
    expect(await verifySession("garbage", now)).toBe(false);
    process.env.SESSION_SECRET = "another-secret";
    expect(await verifySession(t, now)).toBe(false);
    process.env.SESSION_SECRET = "test-secret-0123456789";
  });
  it("rejects everything when SESSION_SECRET is empty", async () => {
    const t = await signSession(now);
    process.env.SESSION_SECRET = "";
    expect(await verifySession(t, now)).toBe(false);
    process.env.SESSION_SECRET = "test-secret-0123456789";
  });
});
