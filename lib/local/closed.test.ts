import { describe, expect, it } from "vitest";
import { CLOSED_NAME_RE, endOfDate, isClosed, overpassClosedStatements } from "./closed";
import { toCandidate } from "./classify";
import { overpassQuery } from "./geo";

const NOW = new Date("2026-10-10T08:00:00Z");
const open = { name: "Sai Beauty Parlour", shop: "beauty", phone: "9820011111" };

describe("isClosed", () => {
  it("keeps an ordinary open business", () => {
    expect(isClosed(open, NOW)).toBe(false);
  });

  it.each(["disused:shop", "abandoned:amenity", "removed:shop", "demolished:building", "closed:shop", "destroyed:amenity", "razed:shop"])(
    "drops a place with a %s tag",
    (k) => {
      expect(isClosed({ ...open, [k]: "beauty" }, NOW)).toBe(true);
    },
  );

  it("treats was:* as closed only when no live business tag is left", () => {
    expect(isClosed({ name: "Sai Beauty Parlour", "was:shop": "beauty", phone: "9820011111" }, NOW)).toBe(true);
    expect(isClosed({ name: "Sai Yoga", sport: "yoga", "was:leisure": "fitness_centre" }, NOW)).toBe(true);
    expect(isClosed({ ...open, shop: "vacant", "was:shop": "beauty" }, NOW)).toBe(true);
    // A rename or change of use keeps the place open.
    expect(isClosed({ ...open, "was:name": "Sai Ladies Parlour" }, NOW)).toBe(false);
    expect(isClosed({ ...open, "was:shop": "clothes" }, NOW)).toBe(false);
  });

  it("drops disused=yes, abandoned=yes and vacant premises", () => {
    expect(isClosed({ ...open, disused: "yes" }, NOW)).toBe(true);
    expect(isClosed({ ...open, abandoned: "yes" }, NOW)).toBe(true);
    expect(isClosed({ ...open, disused: "no" }, NOW)).toBe(false);
    expect(isClosed({ name: "Shop No 4", shop: "vacant" }, NOW)).toBe(true);
  });

  it.each(["closed", "off", " Closed ", "OFF"])('drops opening_hours="%s"', (oh) => {
    expect(isClosed({ ...open, opening_hours: oh }, NOW)).toBe(true);
  });
  it("keeps real opening hours, including ones that close on some days", () => {
    expect(isClosed({ ...open, opening_hours: "Mo-Sa 10:00-20:00; Su closed" }, NOW)).toBe(false);
    expect(isClosed({ ...open, opening_hours: "Mo-Su off; PH 10:00-12:00" }, NOW)).toBe(false);
  });

  it("drops an end_date in the past and keeps one in the future", () => {
    expect(isClosed({ ...open, end_date: "2019" }, NOW)).toBe(true);
    expect(isClosed({ ...open, end_date: "~2021" }, NOW)).toBe(true);
    expect(isClosed({ ...open, end_date: "2026-09" }, NOW)).toBe(true);
    expect(isClosed({ ...open, end_date: "2026-10-09" }, NOW)).toBe(true);
    expect(isClosed({ ...open, end_date: "2026-10-10" }, NOW)).toBe(false); // ends tonight
    expect(isClosed({ ...open, end_date: "2026" }, NOW)).toBe(false);
    expect(isClosed({ ...open, end_date: "2027-03-31" }, NOW)).toBe(false);
    expect(isClosed({ ...open, end_date: "unknown" }, NOW)).toBe(false);
  });

  it.each([
    "Sai Clinic (Closed)",
    "Sai Clinic (permanently closed)",
    "Sai Clinic [CLOSED]",
    "Sai Clinic (Band)",
    "Sai Clinic (band zala)",
    "Sai Clinic - Permanently Closed",
    "Sai Clinic - closed",
    "Sai Clinic: now closed",
    "Sai Clinic closed down",
    "Permanently closed Sai Clinic",
  ])("drops the name %s", (name) => {
    expect(isClosed({ ...open, name }, NOW)).toBe(true);
  });

  it.each([
    "Bandra Medical",
    "Bandra Kurla Dental Clinic",
    "Shree Ganesh Brass Band",
    "Band Baaja Baarat Events",
    "Sai Clinic (Bandra West)",
    "Bandu Snacks Centre",
    "Closed Loop Fitness",
    "Enclosed Spaces Interiors",
    "Om Sai Band & Dhol Party",
  ])("keeps the name %s", (name) => {
    expect(isClosed({ ...open, name }, NOW)).toBe(false);
    expect(CLOSED_NAME_RE.test(name)).toBe(false);
  });
});

describe("endOfDate", () => {
  it("returns the last moment of the named period", () => {
    expect(new Date(endOfDate("2020")!).toISOString()).toBe("2020-12-31T23:59:59.999Z");
    expect(new Date(endOfDate("2024-02")!).toISOString()).toBe("2024-02-29T23:59:59.999Z");
    expect(new Date(endOfDate("2024-02-10")!).toISOString()).toBe("2024-02-10T23:59:59.999Z");
    expect(endOfDate("soon")).toBeNull();
  });
});

describe("toCandidate drops closed businesses", () => {
  const el = (tags: Record<string, string>) => ({ type: "node", id: 9, tags });
  it("counts them as excluded", () => {
    expect(toCandidate(el({ ...open, "disused:shop": "beauty" }), "Thane", NOW)).toBe("excluded");
    expect(toCandidate(el({ ...open, name: "Glow Parlour (Closed)" }), "Thane", NOW)).toBe("excluded");
    expect(toCandidate(el({ ...open, end_date: "2022" }), "Thane", NOW)).toBe("excluded");
    expect(toCandidate(el({ ...open, name: "Bandra Glow Parlour" }), "Thane", NOW)).toMatchObject({ name: "Bandra Glow Parlour" });
  });
});

describe("Overpass query", () => {
  const q = overpassQuery({ south: 1, west: 2, north: 3, east: 4 }, ['["shop"~"^(beauty)$"]["name"]'], NOW);

  it("collects the matches, subtracts the closed ones and prints the rest", () => {
    expect(q).toContain('nwr["shop"~"^(beauty)$"]["name"](1,2,3,4);\n)->.found;');
    expect(q).toContain(")->.closed;\n(.found; - .closed;);\nout tags center 3000;");
  });

  it("filters every closed rule Overpass can express", () => {
    const s = overpassClosedStatements(NOW).join("\n");
    expect(s).toContain('nwr.found[~"^(disused|abandoned|removed|demolished|destroyed|razed|closed):"~"."];');
    expect(s).toContain('nwr.found["disused"="yes"];');
    expect(s).toContain('nwr.found["abandoned"="yes"];');
    expect(s).toContain('nwr.found["shop"="vacant"];');
    expect(s).toContain('nwr.found["opening_hours"~"^ *(closed|off) *$",i];');
    expect(s).toMatch(/nwr\.found\["end_date"~"[^"]*\|2025\)"\];/);
    expect(s).not.toMatch(/end_date[^\n]*2026/);
    expect(q).not.toMatch(/\\s|\(\?/); // POSIX regexes only
  });

  it("the Overpass end_date rule only matches earlier years", () => {
    const re = new RegExp(/end_date"~"([^"]*)"/.exec(overpassClosedStatements(NOW).join("\n"))![1]!);
    expect(["2019", "~2021-05", "2025-12-31", "1998"].every((d) => re.test(d))).toBe(true);
    expect(["2026", "2026-01", "2027", "unknown"].some((d) => re.test(d))).toBe(false);
  });

  it("the Overpass name rule (POSIX) agrees with the JavaScript one on bracketed markers", () => {
    const src = /\["name"~"(\[\[[^"]*)",i\]/.exec(overpassClosedStatements(NOW).join("\n"))![1]!;
    const re = new RegExp(src.replace("[])]", "[\\])]"), "i"); // POSIX "[])]" is "] or )" — JavaScript needs the ] escaped
    for (const n of ["Sai Clinic (Closed)", "Sai Clinic [band]", "Sai (permanently closed)", "X (shut down)"]) expect(re.test(n), n).toBe(true);
    for (const n of ["Bandra Medical", "Sai Clinic (Bandra West)", "Shree Ganesh Brass Band"]) expect(re.test(n), n).toBe(false);
  });
});
