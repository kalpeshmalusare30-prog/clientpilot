/**
 * In-memory login throttle per client IP. Lives in the function instance's
 * memory on purpose: writing counters to Blob would let failed logins burn the
 * Hobby Blob quota. A cold start resets it, which is acceptable because the
 * passphrase (4 random words + a number) cannot be brute-forced online.
 */
type Bucket = { fails: number; lockedUntil: number; last: number };

const buckets = new Map<string, Bucket>();

export const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const DECAY_MS = 15 * 60 * 1000;
const MAX_KEYS = 5000;

export function retryAfterMs(key: string, now: number = Date.now()): number {
  const b = buckets.get(key);
  if (!b) return 0;
  return b.lockedUntil > now ? b.lockedUntil - now : 0;
}

export function recordFailure(key: string, now: number = Date.now()): void {
  if (buckets.size > MAX_KEYS) buckets.clear();
  let b = buckets.get(key);
  if (!b || now - b.last > DECAY_MS) b = { fails: 0, lockedUntil: 0, last: now };
  b.fails += 1;
  b.last = now;
  if (b.fails >= MAX_FAILS) {
    b.lockedUntil = now + LOCK_MS;
    b.fails = 0;
  }
  buckets.set(key, b);
}

export function recordSuccess(key: string): void {
  buckets.delete(key);
}
