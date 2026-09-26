import { describe, expect, it } from "vitest";
import { fromParam, toParam } from "./ids";

describe("id params", () => {
  it("round-trips ids with slashes, colons and unicode", () => {
    for (const id of [
      "freelancer.com:40734895",
      "weworkremotely:https://weworkremotely.com/remote-jobs/x-y",
      "node/12395684120",
      "ä/ü:?&#",
    ]) {
      const p = toParam(id);
      expect(p).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(fromParam(p)).toBe(id);
    }
  });
});
