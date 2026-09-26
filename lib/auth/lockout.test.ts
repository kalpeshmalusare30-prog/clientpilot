import { beforeEach, describe, expect, it } from "vitest";
import { recordFailure, recordSuccess, retryAfterMs } from "./lockout";

let n = 0;
let key = "";
beforeEach(() => {
  key = `k${n++}`;
});
const t = 1_000_000;
const LOCK = 15 * 60 * 1000;

describe("login lockout", () => {
  it("does not lock before 5 failures", () => {
    for (let i = 0; i < 4; i++) recordFailure(key, t + i);
    expect(retryAfterMs(key, t + 10)).toBe(0);
  });
  it("locks on the 5th failure for 15 minutes", () => {
    for (let i = 0; i < 5; i++) recordFailure(key, t);
    const left = retryAfterMs(key, t);
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThanOrEqual(LOCK);
    expect(retryAfterMs(key, t + LOCK + 1)).toBe(0);
  });
  it("forgets isolated failures after 15 idle minutes", () => {
    let now = t;
    for (let i = 0; i < 20; i++) {
      recordFailure(key, now);
      now += LOCK + 1;
    }
    expect(retryAfterMs(key, now)).toBe(0);
  });
  it("clears on success", () => {
    for (let i = 0; i < 4; i++) recordFailure(key, t);
    recordSuccess(key);
    recordFailure(key, t);
    expect(retryAfterMs(key, t)).toBe(0);
  });
});
