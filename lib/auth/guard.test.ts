import { beforeAll, describe, expect, it } from "vitest";
import { checkPassword, clientIp, readCookie, requireSession } from "./guard";
import { COOKIE_NAME, signSession } from "./crypto";
import { isPublicPath } from "./public";

beforeAll(() => {
  process.env.APP_PASSWORD = "river lamp tiger 42";
  process.env.SESSION_SECRET = "test-secret-0123456789";
});

const req = (headers: Record<string, string>) => new Request("https://x.test/api/y", { headers });

describe("clientIp", () => {
  it("prefers x-real-ip, then the first x-forwarded-for entry, then 'local'", () => {
    expect(clientIp(req({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "9.9.9.9" }))).toBe("1.1.1.1");
    expect(clientIp(req({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" }))).toBe("2.2.2.2");
    expect(clientIp(req({}))).toBe("local");
  });
});

describe("checkPassword", () => {
  it("accepts only the exact APP_PASSWORD", () => {
    expect(checkPassword("river lamp tiger 42")).toBe(true);
    expect(checkPassword("river lamp tiger 43")).toBe(false);
    expect(checkPassword("")).toBe(false);
  });
  it("rejects everything when APP_PASSWORD is unset", () => {
    const saved = process.env.APP_PASSWORD;
    process.env.APP_PASSWORD = "";
    expect(checkPassword("")).toBe(false);
    process.env.APP_PASSWORD = saved;
  });
});

describe("readCookie / requireSession", () => {
  it("reads a cookie by name", () => {
    expect(readCookie(req({ cookie: "a=1; cp_session=xyz.abc; b=2" }), "cp_session")).toBe("xyz.abc");
    expect(readCookie(req({}), "cp_session")).toBeUndefined();
  });
  it("returns 401 without a valid session and null with one", async () => {
    const denied = await requireSession(req({}));
    expect(denied?.status).toBe(401);
    const token = await signSession();
    expect(await requireSession(req({ cookie: `${COOKIE_NAME}=${token}` }))).toBeNull();
  });
});

describe("isPublicPath", () => {
  it("allows only the public paths", () => {
    for (const p of ["/login", "/api/login", "/api/cron/gigs", "/d/a9-digital-prints", "/manifest.webmanifest", "/sw.js", "/offline.html", "/pwa-icon", "/apple-icon", "/favicon.ico", "/robots.txt"]) {
      expect(isPublicPath(p)).toBe(true);
    }
    for (const p of ["/", "/gigs", "/api/state/abc", "/api/settings", "/dashboard", "/login-bypass"]) {
      expect(isPublicPath(p)).toBe(false);
    }
  });
});
