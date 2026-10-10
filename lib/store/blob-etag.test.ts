import { describe, expect, it } from "vitest";
import { strongEtag } from "./blob";

describe("strongEtag", () => {
  it("drops the weak prefix that get() reports for compressed responses", () => {
    expect(strongEtag('W/"e5a5"')).toBe('"e5a5"');
  });
  it("leaves a strong etag unchanged", () => {
    expect(strongEtag('"e5a5"')).toBe('"e5a5"');
  });
});
