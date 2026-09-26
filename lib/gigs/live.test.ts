import { describe, expect, it } from "vitest";
import { freelancerProjectId, parseLive } from "./live";

describe("live status", () => {
  it("extracts the Freelancer project id", () => {
    expect(freelancerProjectId("freelancer.com:40734895")).toBe(40734895);
    expect(freelancerProjectId("remotive:7")).toBeNull();
  });
  it("parses an open project", () => {
    expect(parseLive({ result: { id: 5, status: "active", frontend_project_status: "open", bid_stats: { bid_count: 52, bid_avg: 24640.4 }, currency: { code: "INR" } } }, 5)).toEqual({
      open: true, status: "open", bidCount: 52, bidAvg: 24640, currency: "INR",
    });
  });
  it("reports closed projects and rejects a payload for another project", () => {
    expect(parseLive({ result: { id: 5, status: "closed", frontend_project_status: "closed", bid_stats: {} , currency: {} } }, 5)).toEqual({
      open: false, status: "closed", bidCount: null, bidAvg: null, currency: "",
    });
    expect(parseLive({ result: { id: 6 } }, 5)).toBeNull();
    expect(parseLive({}, 5)).toBeNull();
  });
});
