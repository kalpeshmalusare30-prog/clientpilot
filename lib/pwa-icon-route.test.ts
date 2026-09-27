import { describe, expect, it } from "vitest";
import { iconSize } from "@/lib/pwa-icon";

describe("F-13: /pwa-icon renders only fixed sizes", () => {
  it("snaps any requested size to 180, 192 or 512", () => {
    expect(iconSize(null)).toBe(512);
    expect(iconSize("192")).toBe(192);
    expect(iconSize("180")).toBe(180);
    expect(iconSize("512")).toBe(512);
    for (const v of ["193", "1024", "48", "abc", "511.5", "-1"]) expect([180, 192, 512]).toContain(iconSize(v));
    expect(iconSize("193")).toBe(192);
    expect(iconSize("1024")).toBe(512);
  });
});
