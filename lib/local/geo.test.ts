import { describe, expect, it } from "vitest";
import { overpassQuery, pickGeoResult, splitBbox, toBbox } from "./geo";

describe("geo", () => {
  it("prefers a small place result over a state", () => {
    const state = { addresstype: "state", class: "boundary", type: "administrative", boundingbox: ["15", "22", "72", "80"], lat: "19", lon: "75", display_name: "Maharashtra" };
    const suburb = { addresstype: "suburb", class: "place", type: "suburb", boundingbox: ["19.10", "19.14", "72.82", "72.87"], lat: "19.12", lon: "72.84", display_name: "Andheri, Mumbai" };
    expect(pickGeoResult([state, suburb])).toBe(suburb);
  });
  it("widens tiny boxes and clamps huge ones", () => {
    expect(toBbox({ boundingbox: ["19.119", "19.121", "72.839", "72.841"], lat: "19.12", lon: "72.84" })).toEqual({ south: 19.1, west: 72.82, north: 19.14, east: 72.86 });
    const big = toBbox({ boundingbox: ["18", "20", "72", "74"], lat: "19", lon: "73" });
    expect(big.north - big.south).toBeCloseTo(0.3);
  });
  it("splits boxes into ≤ 0.09° tiles", () => {
    expect(splitBbox({ south: 0, west: 0, north: 0.17, east: 0.17 })).toHaveLength(4);
    expect(splitBbox({ south: 0, west: 0, north: 0.04, east: 0.04 })).toHaveLength(1);
  });
  it("builds an Overpass query with the given selectors", () => {
    const q = overpassQuery({ south: 1, west: 2, north: 3, east: 4 }, ['["amenity"="dentist"]["name"]']);
    expect(q).toContain("[out:json][timeout:25];");
    expect(q).toContain('nwr["amenity"="dentist"]["name"](1,2,3,4);');
    expect(q).toContain("out tags center");
  });
});
