import { publicUrlProblem, urlProblem, type LookupFn } from "./safe-url";

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const SOCIAL_RE = /facebook\.com|instagram\.com|wa\.me|whatsapp\.com|linktr\.ee/i;
const MARKETPLACE_RE = /atom\.com|sedo(parking)?\.|dan\.com|afternic|hugedomains|bodis\.com|parkingcrew/i;
const PARKED_RE = /window\.LANDER_SYSTEM|sedoparking|domain (is )?for sale|buy this domain|parked free/i;

export type Verdict = "DOWN" | "OLD" | "OK" | "UNKNOWN" | "SOCIAL";
export interface AuditResult {
  verdict: Verdict;
  evidence: string;
  url?: string;
  /**
   * The audit could not reach a verdict: cut short by the deadline, address refused by the SSRF guard,
   * malformed host, or the DNS check failed. Always with UNKNOWN; the search counts it as a skipped audit.
   */
  incomplete?: true;
}

export function regDomain(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function errKind(e: unknown): "TIMEOUT" | "DNS_DEAD" | "CONN_TIMEOUT" | "CONN_FAIL" | "CERT_ERROR" | "OTHER" {
  const err = e as { name?: string; cause?: { code?: string } } | null;
  if (err && (err.name === "TimeoutError" || err.name === "AbortError")) return "TIMEOUT";
  const code = err?.cause?.code;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "DNS_DEAD";
  if (code === "UND_ERR_CONNECT_TIMEOUT") return "CONN_TIMEOUT";
  if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "EHOSTUNREACH") return "CONN_FAIL";
  if (/CERT|TLS|SELF_SIGNED|UNABLE_TO_VERIFY/.test(String(code))) return "CERT_ERROR";
  return "OTHER";
}

/** `bodySkipped`: the body was not read (not text/html or text/plain, or content-length over the cap). */
type Page = { status: number; finalUrl: string; body: string; bodySkipped?: boolean };
/** `refused`: the SSRF guard (or an unclassifiable DNS error) stopped the request; the audit cannot judge the site. */
type Fetched = Page | { err: unknown } | { refused: string };

const MAX_BODY_BYTES = 400_000;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const withTimeout = (ms: number, signal?: AbortSignal) => (signal ? AbortSignal.any([AbortSignal.timeout(ms), signal]) : AbortSignal.timeout(ms));

/** Reads at most MAX_BODY_BYTES of an HTML or plain-text body, then cancels the rest of the stream. */
async function readBody(res: Response): Promise<{ body: string; skipped: boolean }> {
  const type = (res.headers.get("content-type") ?? "").toLowerCase();
  const length = Number(res.headers.get("content-length"));
  if (!/^\s*text\/(html|plain)\b/.test(type) || length > MAX_BODY_BYTES) {
    res.body?.cancel().catch(() => {});
    return { body: "", skipped: true };
  }
  if (!res.body) return { body: "", skipped: false };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let bytes = 0;
  try {
    while (bytes < MAX_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, MAX_BODY_BYTES - bytes);
      bytes += chunk.byteLength;
      body += decoder.decode(chunk, { stream: true });
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return { body: body + decoder.decode(), skipped: false };
}

/**
 * One GET with redirects followed by hand (at most 5), every hop checked by the SSRF guard first.
 * The per-attempt timeout covers the DNS checks, all hops and the body.
 */
async function tryFetch(url: string, timeoutMs: number, signal: AbortSignal | undefined, lookup: LookupFn | undefined): Promise<Fetched> {
  const sig = withTimeout(timeoutMs, signal);
  let current = url;
  try {
    for (let hop = 0; ; hop++) {
      let problem: string | null;
      try {
        problem = await publicUrlProblem(current, { lookup, signal: sig });
      } catch (e) {
        if (sig.aborted) return { err: sig.reason };
        // Shape the DNS error like fetch's own, so NXDOMAIN still goes through the Google DNS confirmation.
        const asFetchError = new TypeError("fetch failed", { cause: e });
        if (errKind(asFetchError) === "DNS_DEAD") return { err: asFetchError };
        return { refused: "DNS lookup failed" };
      }
      if (problem) return { refused: problem };
      const res = await fetch(current, {
        headers: { "User-Agent": BROWSER_UA, Accept: "text/html,*/*" },
        redirect: "manual",
        signal: sig,
        cache: "no-store",
      });
      const location = res.headers.get("location");
      if (REDIRECT_STATUSES.has(res.status) && location) {
        res.body?.cancel().catch(() => {});
        if (hop >= MAX_REDIRECTS) return { refused: "too many redirects" };
        try {
          current = new URL(location, current).toString();
        } catch {
          return { refused: "bad redirect" };
        }
        continue;
      }
      const { body, skipped } = await readBody(res);
      return { status: res.status, finalUrl: current, body, ...(skipped ? { bodySkipped: true } : {}) };
    }
  } catch (e) {
    return { err: e };
  }
}

/** true = Google DNS says the domain is gone; false = it resolves; null = the check itself failed or was cut short. */
async function dnsReallyDead(host: string, signal?: AbortSignal): Promise<boolean | null> {
  try {
    const res = await fetch("https://dns.google/resolve?name=" + encodeURIComponent(host) + "&type=A", { signal: withTimeout(6_000, signal), cache: "no-store" });
    if (!res.ok) return null;
    const j = (await res.json()) as { Status?: number; Answer?: unknown[] };
    if (typeof j.Status !== "number") return null;
    return j.Status === 3 || j.Status === 2 || (j.Status === 0 && !(j.Answer ?? []).length);
  } catch {
    return null;
  }
}

/** Rules 2–9 of map-hunter's auditSite, as a pure function over one fetched page. */
export function judgePage(
  p: Page,
  ctx: { usedUrl: string; certBroken: boolean; schemeless: boolean; bizName: string; year: number },
): AuditResult {
  if (p.status >= 500 || p.status === 404) return { verdict: "DOWN", evidence: "it shows an error page instead of your business", url: ctx.usedUrl };
  if (p.status === 403 || p.status === 401 || p.status === 429) return { verdict: "UNKNOWN", evidence: `bot-blocked (${p.status}) — human visitors may see it fine` };
  if (regDomain(p.finalUrl) !== regDomain(ctx.usedUrl) && MARKETPLACE_RE.test(p.finalUrl)) {
    return { verdict: "DOWN", evidence: "the domain now shows a domain-for-sale page instead of your business", url: ctx.usedUrl };
  }
  if (SOCIAL_RE.test(p.finalUrl) && !SOCIAL_RE.test(ctx.usedUrl)) return { verdict: "SOCIAL", evidence: "the website address just opens a social media page" };
  if (p.bodySkipped) return { verdict: "UNKNOWN", evidence: "not a normal web page, could not judge it" };
  if (/window\.location\.href\s*=\s*["']\/lander["']/.test(p.body) || PARKED_RE.test(p.body)) {
    return { verdict: "DOWN", evidence: "the domain now shows a parking page instead of your business", url: ctx.usedUrl };
  }
  if (p.body.length < 500) {
    return /<title[^>]*>[^<]+<\/title>/i.test(p.body)
      ? { verdict: "UNKNOWN", evidence: "page too small to judge" }
      : { verdict: "DOWN", evidence: "it opens as a blank placeholder page", url: ctx.usedUrl };
  }

  const clean = p.body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, " ");
  const reasons: string[] = [];
  let pts = 0;
  const hasViewport = /<meta[^>]+name=["']?viewport/i.test(p.body);
  if (!hasViewport) {
    pts += 2;
    reasons.push("it does not display properly on mobile phones, where most customers browse today");
  }
  let year = 0;
  for (const m of clean.matchAll(/©|&copy;|&#169;|&#xa9;|copyright/gi)) {
    const around = clean.slice(Math.max(0, m.index! - 80), m.index! + 80);
    for (const y of around.match(/(?:19|20)\d{2}/g) ?? []) {
      const n = Number(y);
      if (n >= 1990 && n <= ctx.year + 1 && n > year) year = n;
    }
  }
  if (year && year <= ctx.year - 8) {
    pts += 3;
    reasons.push(`its design looks dated (the footer still says ${year})`);
  } else if (year && year <= ctx.year - 3) {
    pts += 1;
  }
  if (!hasViewport && (/<font\b[^>]*\b(size|face|color)\s*=/i.test(clean) || /<frameset\b/i.test(clean))) {
    pts += 3;
    reasons.push("it is built with very old web technology");
  }
  const gen = p.body.match(/<meta[^>]+name=["']?generator["']?[^>]*content=["']([^"']+)["']/i) ?? p.body.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']?generator/i);
  if (gen && /FrontPage|Dreamweaver|Microsoft Word|Publisher|WordPress [0-5]\./i.test(gen[1]!)) {
    pts += 2;
    reasons.push("it runs on outdated software that is risky to keep online");
  }
  if (ctx.certBroken) {
    pts = Math.max(pts, 3);
    reasons.unshift("it shows a 'Not Secure' warning in the browser");
  }
  if (pts >= 3 && reasons.length) {
    if (ctx.schemeless && ctx.bizName) {
      const tokens = ctx.bizName.toLowerCase().match(/[a-z]{4,}/g) ?? [];
      const hay = p.body.toLowerCase();
      if (tokens.length && !tokens.some((t) => hay.includes(t))) {
        return { verdict: "UNKNOWN", evidence: "website tag does not appear to belong to this business" };
      }
    }
    return { verdict: "OLD", evidence: reasons[0]!, url: ctx.usedUrl };
  }
  return { verdict: "OK", evidence: "" };
}

export async function auditSite(
  rawUrl: string,
  bizName: string,
  opts: { timeoutMs?: number; signal?: AbortSignal; year?: number; lookup?: LookupFn } = {},
): Promise<AuditResult> {
  const timeoutMs = opts.timeoutMs ?? 6_000;
  const year = opts.year ?? new Date().getFullYear();
  const schemeless = !/^https?:\/\//i.test(rawUrl.trim());
  let url = rawUrl.trim();
  if (schemeless) url = "https://" + url;
  url = url.replace(/^(https?:\/\/)(www\.)+/i, "$1www.");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { verdict: "UNKNOWN", evidence: "invalid URL" };
  }
  url = parsed.toString(); // lowercases the host, so the variants below really differ
  const problem = urlProblem(parsed);
  if (problem) return { verdict: "UNKNOWN", evidence: `website address not checked (${problem})`, incomplete: true };
  const host = parsed.hostname;
  const apex = host.replace(/^www\./i, "");
  const variants = [...new Set([url, url.replace(host, "www." + apex), url.replace(host, apex)])];

  // Never accuse a site of being down because the search ran out of time.
  const cutShort = (): AuditResult => ({ verdict: "UNKNOWN", evidence: "audit cut short", incomplete: true });
  const refused = (why: string): AuditResult => ({ verdict: "UNKNOWN", evidence: `website address not checked (${why})`, incomplete: true });

  let used: Page | null = null;
  let usedUrl = url;
  let certBroken = false;
  let sawDns = false;
  let sawCert = false;
  for (const v of variants) {
    if (opts.signal?.aborted) return cutShort();
    const httpsUrl = v.replace(/^http:/i, "https:");
    const r1 = await tryFetch(httpsUrl, timeoutMs, opts.signal, opts.lookup);
    if ("refused" in r1) return refused(r1.refused);
    if (!("err" in r1)) { used = r1; usedUrl = v; break; }
    const k1 = errKind(r1.err);
    if (k1 === "DNS_DEAD") sawDns = true;
    if (k1 === "CERT_ERROR") sawCert = true;
    if (opts.signal?.aborted) return cutShort();
    const r2 = await tryFetch(httpsUrl.replace(/^https:/i, "http:"), timeoutMs, opts.signal, opts.lookup);
    if ("refused" in r2) return refused(r2.refused);
    if (!("err" in r2)) { used = r2; usedUrl = v; certBroken = k1 === "CERT_ERROR"; break; }
    if (errKind(r2.err) === "DNS_DEAD") sawDns = true;
  }

  if (!used) {
    if (opts.signal?.aborted) return cutShort();
    if (schemeless) return { verdict: "UNKNOWN", evidence: "low-quality map tag, could not verify" };
    if (sawDns) {
      const dead = await dnsReallyDead(apex, opts.signal);
      if (dead === null) return { verdict: "UNKNOWN", evidence: "could not confirm the domain on Google DNS", incomplete: true };
      if (!dead) return { verdict: "UNKNOWN", evidence: "domain resolves on Google DNS — not conclusively down" };
    }
    const evidence = sawCert
      ? "it shows a security warning instead of opening"
      : sawDns
        ? "the domain does not seem to be working any more"
        : "it is not opening (the server is not responding)";
    return { verdict: "DOWN", evidence, url: usedUrl };
  }
  return judgePage(used, { usedUrl, certBroken, schemeless, bizName, year });
}
