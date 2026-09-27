import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";

/**
 * SSRF guard for the website audit. Website addresses come from OpenStreetMap tags, which anyone can edit,
 * so before every request (including each redirect hop) the audit checks that the URL is plain http(s) on
 * the default ports and that its host is, and resolves only to, public addresses.
 *
 * Known gap: the address is resolved here and then again by fetch itself, so a hostile DNS server with a
 * zero TTL could answer "public" to this check and "private" to fetch (DNS rebinding). Closing that needs
 * the connection pinned to the checked address (an undici dispatcher), which Node's built-in fetch only
 * accepts from its own bundled undici; the repo only has a different undici major via @vercel/blob.
 */

export type LookupFn = (host: string) => Promise<{ address: string; family: number }[]>;

export const systemLookup: LookupFn = (host) => dnsLookup(host, { all: true });

// Two lists: a BlockList also matches IPv4 addresses against its IPv6 rules in mapped form, so the
// ::ffff:0:0/96 rule below would otherwise block every IPv4 address.
const BLOCKED_V4 = new net.BlockList();
const BLOCKED_V6 = new net.BlockList();
for (const [prefix, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  BLOCKED_V4.addSubnet(prefix, bits, "ipv4");
}
for (const [prefix, bits] of [
  ["::", 96], // ::, ::1 and the IPv4-compatible forms ::a.b.c.d
  ["::ffff:0:0", 96], // IPv4-mapped ::ffff:a.b.c.d
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
] as const) {
  BLOCKED_V6.addSubnet(prefix, bits, "ipv6");
}

/** True for loopback, private, CGNAT, link-local, multicast and reserved addresses, and for anything that is not an IP. */
export function isBlockedAddress(ip: string): boolean {
  const bare = ip.replace(/^\[(.*)\]$/, "$1").replace(/%.*$/, "");
  const version = net.isIP(bare);
  if (version === 0) return true;
  return version === 4 ? BLOCKED_V4.check(bare, "ipv4") : BLOCKED_V6.check(bare, "ipv6");
}

/** Checks that need no network: scheme, port, credentials, host shape, localhost and IP literals. Returns the problem, or null. */
export function urlProblem(url: URL): string | null {
  if (url.protocol !== "http:" && url.protocol !== "https:") return "only http and https addresses are checked";
  if (url.port !== "" && url.port !== "80" && url.port !== "443") return "unusual port";
  if (url.username || url.password) return "address carries credentials";
  const host = url.hostname.replace(/\.$/, "");
  if (host.startsWith("[") || net.isIPv4(host)) return isBlockedAddress(host) ? "private address" : null;
  if (host === "localhost" || host.endsWith(".localhost")) return "private address";
  // After WHATWG parsing the host is lowercase punycode; anything else (";", "_", a single label) is not a real site.
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return "malformed host";
  return null;
}

/**
 * The full check before a request: `urlProblem`, then resolve the host and refuse it if ANY address is blocked.
 * Returns the problem, or null when the URL may be fetched. DNS errors are not caught (the caller classifies
 * them), and an aborted signal rejects with its reason.
 */
export async function publicUrlProblem(url: string, opts: { lookup?: LookupFn; signal?: AbortSignal } = {}): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "invalid URL";
  }
  const problem = urlProblem(parsed);
  if (problem) return problem;
  const host = parsed.hostname.replace(/\.$/, "");
  if (host.startsWith("[") || net.isIPv4(host)) return null; // a public IP literal, already checked
  const addresses = await untilAborted((opts.lookup ?? systemLookup)(host), opts.signal);
  if (!addresses.length) return "host has no address";
  if (addresses.some((a) => isBlockedAddress(a.address))) return "host resolves to a private address";
  return null;
}

function untilAborted<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}
