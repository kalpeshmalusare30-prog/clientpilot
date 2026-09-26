export const COOKIE_NAME = "cp_session";
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;
const SESSION_MS = SESSION_MAX_AGE_S * 1000;
const enc = new TextEncoder();

/** Constant-time string compare (edge-safe, no node:crypto). */
export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Token = "<expiry ms>.<HMAC-SHA256(SESSION_SECRET, expiry)>". */
export async function signSession(now: number = Date.now()): Promise<string> {
  const exp = String(now + SESSION_MS);
  return `${exp}.${await hmacHex(process.env.SESSION_SECRET ?? "", exp)}`;
}

export async function verifySession(token: string | undefined, now: number = Date.now()): Promise<boolean> {
  const secret = process.env.SESSION_SECRET ?? "";
  if (!token || !secret) return false;
  const [exp, sig, extra] = token.split(".");
  if (extra !== undefined || !exp || !sig || !/^\d+$/.test(exp) || Number(exp) <= now) return false;
  return constantTimeEqual(sig, await hmacHex(secret, exp));
}
