import { afterEach, describe, expect, it, vi } from "vitest";
import { auditSite, errKind, judgePage } from "./audit";

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

// ---- auditSite over a stubbed network (fetch and DNS). Nothing here touches the real network. ----

type Router = (url: string, init: RequestInit) => Response | Promise<Response> | undefined;
const connRefused = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
const notFound = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });

function stubFetch(route: Router) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = String(input);
      calls.push({ url, init });
      if (init.signal?.aborted) throw init.signal.reason;
      const res = await route(url, init);
      if (!res) throw connRefused();
      return res;
    }),
  );
  return calls;
}
const hangUntilAborted = (init: RequestInit) =>
  new Promise<Response>((_, reject) => {
    const s = init.signal!;
    if (s.aborted) return reject(s.reason);
    s.addEventListener("abort", () => reject(s.reason), { once: true });
  });
const deadlineHit = () => new DOMException("search deadline", "TimeoutError");

const MODERN = pad('<meta name="viewport" content="width=device-width"><footer>© 2025 Shree Shop</footer>');
const html = (body: string) => new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
const redirect = (location: string, status = 302) => new Response(null, { status, headers: { location } });
const lookedUp: string[] = [];
const publicDns = async (host: string) => {
  lookedUp.push(host);
  return [{ address: "93.184.216.34", family: 4 }];
};

afterEach(() => {
  vi.unstubAllGlobals();
  lookedUp.length = 0;
});

describe("auditSite: healthy sites", () => {
  it("judges a working site as OK, following redirects by hand", async () => {
    const calls = stubFetch((url) => (url === "https://shop.example/" ? redirect("/home", 301) : url === "https://shop.example/home" ? html(MODERN) : undefined));
    expect(await auditSite("https://shop.example", "Shree Shop", { lookup: publicDns })).toEqual({ verdict: "OK", evidence: "" });
    expect(calls.map((c) => [c.url, c.init.redirect])).toEqual([
      ["https://shop.example/", "manual"],
      ["https://shop.example/home", "manual"],
    ]);
  });
  it("uses the final address after redirects (a site that just opens Instagram is SOCIAL)", async () => {
    stubFetch((url) => (url === "https://shop.example/" ? redirect("https://www.instagram.com/shreeshop/") : url.startsWith("https://www.instagram.com/") ? html(pad("")) : undefined));
    expect((await auditSite("https://shop.example", "Shree Shop", { lookup: publicDns })).verdict).toBe("SOCIAL");
    expect(lookedUp).toEqual(["shop.example", "www.instagram.com"]);
  });
});

describe("auditSite: SSRF guard (T8-3)", () => {
  it.each(["http://169.254.169.254/latest/meta-data/", "http://127.0.0.1:80/", "http://[::1]/", "http://localhost/", "http://10.0.0.8/", "https://shop.example:8443/"])(
    "never fetches %s and returns UNKNOWN",
    async (u) => {
      const calls = stubFetch(() => html(MODERN));
      expect(await auditSite(u, "Shree Shop", { lookup: publicDns })).toMatchObject({ verdict: "UNKNOWN", incomplete: true });
      expect(calls).toEqual([]);
    },
  );
  it("refuses a public-looking host that resolves to a private address", async () => {
    const calls = stubFetch(() => html(MODERN));
    const r = await auditSite("https://evil.example", "Shree Shop", {
      lookup: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "192.168.1.1", family: 4 },
      ],
    });
    expect(r).toMatchObject({ verdict: "UNKNOWN", incomplete: true });
    expect(calls).toEqual([]);
  });
  it("refuses a redirect into a private address", async () => {
    const calls = stubFetch((url) => (url === "https://shop.example/" ? redirect("http://169.254.169.254/latest/meta-data/") : html(MODERN)));
    expect(await auditSite("https://shop.example", "Shree Shop", { lookup: publicDns })).toMatchObject({ verdict: "UNKNOWN", incomplete: true });
    expect(calls.map((c) => c.url)).toEqual(["https://shop.example/"]);
  });
  it("refuses a redirect to an unusual port or to a host that resolves privately", async () => {
    stubFetch((url) => (url === "https://shop.example/" ? redirect("https://shop.example:2375/") : html(MODERN)));
    expect(await auditSite("https://shop.example", "Shree Shop", { lookup: publicDns })).toMatchObject({ verdict: "UNKNOWN", incomplete: true });
    const calls = stubFetch((url) => (url === "https://shop.example/" ? redirect("https://internal.example/") : html(MODERN)));
    const dns = async (host: string) => [{ address: host === "internal.example" ? "10.1.1.1" : "93.184.216.34", family: 4 }];
    expect(await auditSite("https://shop.example", "Shree Shop", { lookup: dns })).toMatchObject({ verdict: "UNKNOWN", incomplete: true });
    expect(calls.map((c) => c.url)).toEqual(["https://shop.example/"]);
  });
  it("gives up after 5 redirects with UNKNOWN, not DOWN", async () => {
    const calls = stubFetch((url) => redirect(`https://loop.example/${Number(url.match(/\/(\d+)$/)?.[1] ?? 0) + 1}`));
    expect(await auditSite("https://loop.example/0", "Shree Shop", { lookup: publicDns })).toMatchObject({ verdict: "UNKNOWN", incomplete: true });
    expect(calls.length).toBe(6);
  });
});

describe("auditSite: bounded body (T8-4)", () => {
  const endless = () => {
    const s = { pulled: 0, cancelled: false };
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (s.pulled >= 20_000_000) return c.close();
        s.pulled += 65_536;
        c.enqueue(new Uint8Array(65_536).fill(97));
      },
      cancel() {
        s.cancelled = true;
      },
    });
    return { s, stream };
  };
  it("reads at most 400 KB of a huge page and cancels the rest", async () => {
    const { s, stream } = endless();
    stubFetch((url) => (url === "https://shop.example/" ? new Response(stream, { headers: { "content-type": "text/html" } }) : undefined));
    expect((await auditSite("https://shop.example", "Shree Shop", { lookup: publicDns })).verdict).toBe("OK");
    expect(s.pulled).toBeLessThanOrEqual(400_000 + 2 * 65_536);
    expect(s.cancelled).toBe(true);
  });
  it("skips the body when content-length is over the cap, and does not judge the page", async () => {
    const { s, stream } = endless();
    stubFetch((url) => (url === "https://shop.example/" ? new Response(stream, { headers: { "content-type": "text/html", "content-length": "20000000" } }) : undefined));
    expect((await auditSite("https://shop.example", "Shree Shop", { lookup: publicDns })).verdict).toBe("UNKNOWN");
    expect(s.pulled).toBeLessThanOrEqual(65_536);
  });
  it("skips non-HTML bodies instead of calling them a blank page", async () => {
    stubFetch((url) => (url === "https://shop.example/" ? new Response("%PDF-1.4", { headers: { "content-type": "application/pdf" } }) : undefined));
    expect((await auditSite("https://shop.example", "Shree Shop", { lookup: publicDns })).verdict).toBe("UNKNOWN");
  });
  it("still judges an error status when the body is skipped", async () => {
    stubFetch((url) => (url === "https://shop.example/" ? new Response("{}", { status: 503, headers: { "content-type": "application/json" } }) : undefined));
    expect(await auditSite("https://shop.example", "Shree Shop", { lookup: publicDns })).toMatchObject({ verdict: "DOWN", evidence: "it shows an error page instead of your business" });
  });
  it("reads text/plain bodies", async () => {
    stubFetch((url) => (url === "https://shop.example/" ? new Response(pad("Buy this domain today"), { headers: { "content-type": "text/plain" } }) : undefined));
    expect((await auditSite("https://shop.example", "Shree Shop", { lookup: publicDns })).evidence).toMatch(/parking page/);
  });
});

describe("auditSite: the search deadline (T8-1)", () => {
  it("returns UNKNOWN, not DOWN, when the deadline cuts the audit short", async () => {
    const deadline = new AbortController();
    const calls = stubFetch((url, init) => {
      if (url === "https://slow.example/") return hangUntilAborted(init); // port 443 silently drops packets
      if (url === "http://slow.example/") {
        deadline.abort(deadlineHit()); // the search deadline fires while http is being tried
        return hangUntilAborted(init);
      }
      return html(MODERN);
    });
    const r = await auditSite("https://slow.example", "Shree Shop", { timeoutMs: 30, signal: deadline.signal, lookup: publicDns });
    expect(r).toMatchObject({ verdict: "UNKNOWN", incomplete: true });
    expect(calls.map((c) => c.url)).toEqual(["https://slow.example/", "http://slow.example/"]);
  });
  it("does not turn an earlier certificate error into DOWN when the deadline hits", async () => {
    const deadline = new AbortController();
    stubFetch((url, init) => {
      if (url.startsWith("https:")) throw Object.assign(new TypeError("fetch failed"), { cause: { code: "CERT_HAS_EXPIRED" } });
      deadline.abort(deadlineHit());
      return hangUntilAborted(init);
    });
    expect(await auditSite("https://cert.example", "Shree Shop", { signal: deadline.signal, lookup: publicDns })).toMatchObject({ verdict: "UNKNOWN", incomplete: true });
  });
  it("does nothing once the deadline has passed", async () => {
    const calls = stubFetch(() => html(MODERN));
    const r = await auditSite("https://shop.example", "Shree Shop", { signal: AbortSignal.abort(deadlineHit()), lookup: publicDns });
    expect(r).toMatchObject({ verdict: "UNKNOWN", incomplete: true });
    expect(calls).toEqual([]);
  });
  it("still reports a site that genuinely does not respond (per-attempt timeouts, no deadline)", async () => {
    stubFetch((url, init) => (url.includes("dns.google") ? undefined : hangUntilAborted(init)));
    expect(await auditSite("https://slow.example", "Shree Shop", { timeoutMs: 20, lookup: publicDns })).toEqual({
      verdict: "DOWN",
      evidence: "it is not opening (the server is not responding)",
      url: "https://slow.example/",
    });
  });
});

describe("auditSite: dead-domain confirmation over DoH (T8-6)", () => {
  const deadDns = async (host: string): Promise<{ address: string; family: number }[]> => {
    throw Object.assign(new Error("getaddrinfo ENOTFOUND " + host), { code: "ENOTFOUND" });
  };
  const doh = "https://dns.google/resolve?name=dead.example&type=A";
  it("reports DOWN when Google DNS confirms the domain is gone", async () => {
    stubFetch((url) => {
      if (url === doh) return new Response(JSON.stringify({ Status: 3 }), { headers: { "content-type": "application/json" } });
      throw notFound();
    });
    expect(await auditSite("https://dead.example", "Shree Shop", { lookup: deadDns })).toEqual({
      verdict: "DOWN",
      evidence: "the domain does not seem to be working any more",
      url: "https://dead.example/",
    });
  });
  it("returns UNKNOWN, not DOWN, when the DoH check itself fails", async () => {
    stubFetch((url) => {
      if (url === doh) throw connRefused();
      throw notFound();
    });
    expect(await auditSite("https://dead.example", "Shree Shop", { lookup: deadDns })).toMatchObject({ verdict: "UNKNOWN", incomplete: true });
  });
  it("returns UNKNOWN when DoH answers with an HTTP error", async () => {
    stubFetch((url) => {
      if (url === doh) return new Response("oops", { status: 502 });
      throw notFound();
    });
    expect(await auditSite("https://dead.example", "Shree Shop", { lookup: deadDns })).toMatchObject({ verdict: "UNKNOWN", incomplete: true });
  });
  it("aborts the DoH check with the search deadline", async () => {
    const deadline = new AbortController();
    stubFetch((url, init) => {
      if (url === doh) {
        deadline.abort(deadlineHit());
        return hangUntilAborted(init);
      }
      throw notFound();
    });
    const t0 = Date.now();
    const r = await auditSite("https://dead.example", "Shree Shop", { signal: deadline.signal, lookup: deadDns });
    expect(r).toMatchObject({ verdict: "UNKNOWN", incomplete: true });
    expect(Date.now() - t0).toBeLessThan(2_000);
  }, 10_000);
});

describe("auditSite: malformed hosts (T8-7)", () => {
  it.each(["https://a.example;https://b.example", "https://a_b.example/", "http://intranet/"])("returns UNKNOWN for %s without fetching", async (u) => {
    const calls = stubFetch(() => html(MODERN));
    expect(await auditSite(u, "Shree Shop", { lookup: publicDns })).toMatchObject({ verdict: "UNKNOWN", incomplete: true });
    expect(calls).toEqual([]);
  });
});
