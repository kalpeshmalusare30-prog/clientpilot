import { describe, expect, it } from "vitest";
import { errKind, judgePage } from "./audit";

const ctx = { usedUrl: "https://shop.example", certBroken: false, schemeless: false, bizName: "Shree Shop", year: 2026 };
const pad = (s: string) => s + "<p>" + "x".repeat(600) + "</p>";

describe("errKind", () => {
  it("classifies fetch failures", () => {
    const e = (code: string) => Object.assign(new TypeError("fetch failed"), { cause: { code } });
    expect(errKind(Object.assign(new Error("t"), { name: "TimeoutError" }))).toBe("TIMEOUT");
    expect(errKind(e("ENOTFOUND"))).toBe("DNS_DEAD");
    expect(errKind(e("EAI_AGAIN"))).toBe("DNS_DEAD");
    expect(errKind(e("ECONNREFUSED"))).toBe("CONN_FAIL");
    expect(errKind(e("CERT_HAS_EXPIRED"))).toBe("CERT_ERROR");
    expect(errKind(new Error("x"))).toBe("OTHER");
  });
});

describe("judgePage", () => {
  it("error pages and bot blocks", () => {
    expect(judgePage({ status: 404, finalUrl: ctx.usedUrl, body: "" }, ctx)).toEqual({ verdict: "DOWN", evidence: "it shows an error page instead of your business", url: ctx.usedUrl });
    expect(judgePage({ status: 403, finalUrl: ctx.usedUrl, body: "" }, ctx).verdict).toBe("UNKNOWN");
  });
  it("domain-for-sale, social redirects and parking pages", () => {
    expect(judgePage({ status: 200, finalUrl: "https://www.hugedomains.com/domain_profile.cfm?d=shop", body: pad("") }, ctx).evidence).toMatch(/domain-for-sale/);
    expect(judgePage({ status: 200, finalUrl: "https://www.instagram.com/shop", body: pad("") }, ctx).verdict).toBe("SOCIAL");
    expect(judgePage({ status: 200, finalUrl: ctx.usedUrl, body: pad("Buy this domain today") }, ctx).evidence).toMatch(/parking page/);
  });
  it("blank placeholder pages", () => {
    expect(judgePage({ status: 200, finalUrl: ctx.usedUrl, body: "<html></html>" }, ctx).evidence).toBe("it opens as a blank placeholder page");
    expect(judgePage({ status: 200, finalUrl: ctx.usedUrl, body: "<title>Hi</title>" }, ctx).verdict).toBe("UNKNOWN");
  });
  it("old sites: no mobile viewport plus an old copyright year", () => {
    const r = judgePage({ status: 200, finalUrl: ctx.usedUrl, body: pad("<footer>© 2012 Shree Shop</footer>") }, ctx);
    expect(r.verdict).toBe("OLD");
    expect(r.evidence).toBe("it does not display properly on mobile phones, where most customers browse today");
  });
  it("modern sites are OK", () => {
    const body = pad('<meta name="viewport" content="width=device-width"><footer>© 2025</footer>');
    expect(judgePage({ status: 200, finalUrl: ctx.usedUrl, body }, ctx)).toEqual({ verdict: "OK", evidence: "" });
  });
  it("a broken certificate on a working site leads the evidence", () => {
    const body = pad('<meta name="viewport" content="width=device-width">');
    expect(judgePage({ status: 200, finalUrl: ctx.usedUrl, body }, { ...ctx, certBroken: true }).evidence).toBe("it shows a 'Not Secure' warning in the browser");
  });
  it("schemeless map tags that do not mention the business are UNKNOWN", () => {
    const r = judgePage({ status: 200, finalUrl: ctx.usedUrl, body: pad("<footer>© 2010 Another Company</footer>") }, { ...ctx, schemeless: true });
    expect(r).toEqual({ verdict: "UNKNOWN", evidence: "website tag does not appear to belong to this business" });
  });
});
