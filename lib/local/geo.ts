/* eslint-disable @typescript-eslint/no-explicit-any */
import type { OsmElement } from "./classify";

const OSM_UA = "ClientPilot/1.0 (personal lead research; kalpeshmalusare30@gmail.com)";
export const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

export interface Bbox {
  south: number;
  west: number;
  north: number;
  east: number;
}

const withTimeout = (ms: number, signal?: AbortSignal) =>
  signal ? AbortSignal.any([AbortSignal.timeout(ms), signal]) : AbortSignal.timeout(ms);

export function pickGeoResult(results: any[]): any | null {
  const badAddr = new Set(["state", "state_district", "district", "county"]);
  const goodAddr = new Set(["city", "town", "suburb", "borough", "neighbourhood", "village", "quarter"]);
  const survivors = results.filter((r) => {
    if (badAddr.has(r.addresstype)) return false;
    const isPlace = r.class === "place";
    const isAdmin = r.class === "boundary" && r.type === "administrative" && goodAddr.has(r.addresstype);
    if (!isPlace && !isAdmin) return false;
    const bb = r.boundingbox.map(Number);
    return bb[1] - bb[0] <= 0.3 && bb[3] - bb[2] <= 0.3;
  });
  return survivors[0] || results.find((r) => !badAddr.has(r.addresstype)) || null;
}

export function toBbox(r: any): Bbox {
  let [south, north, west, east] = r.boundingbox.map(Number) as [number, number, number, number];
  const lat = Number(r.lat);
  const lon = Number(r.lon);
  if (north - south < 0.02 || east - west < 0.02) {
    south = lat - 0.02; north = lat + 0.02; west = lon - 0.02; east = lon + 0.02;
  }
  if (north - south > 0.3) { south = lat - 0.15; north = lat + 0.15; }
  if (east - west > 0.3) { west = lon - 0.15; east = lon + 0.15; }
  const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
  return { south: r6(south), west: r6(west), north: r6(north), east: r6(east) };
}

const geoCache = new Map<string, { bbox: Bbox; label: string }>();

export async function geocode(area: string, signal?: AbortSignal): Promise<{ bbox: Bbox; label: string }> {
  const key = area.trim().toLowerCase();
  const hit = geoCache.get(key);
  if (hit) return hit;
  const url = "https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=in&q=" + encodeURIComponent(area);
  const res = await fetch(url, { headers: { "User-Agent": OSM_UA }, signal: withTimeout(15_000, signal), cache: "no-store" });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const results = (await res.json()) as any[];
  if (!results.length) throw new Error(`area not found: "${area}"`);
  const pick = pickGeoResult(results) || results[0];
  const entry = { bbox: toBbox(pick), label: String(pick.display_name || area).split(",")[0]!.trim() };
  geoCache.set(key, entry);
  return entry;
}

export function overpassQuery(b: Bbox, selectors: string[]): string {
  const bb = `(${b.south},${b.west},${b.north},${b.east})`;
  return `[out:json][timeout:25];\n(\n${selectors.map((s) => `  nwr${s}${bb};`).join("\n")}\n);\nout tags center 3000;`;
}

export function splitBbox(b: Bbox, maxSpan = 0.09): Bbox[] {
  const rows = Math.max(1, Math.ceil((b.north - b.south) / maxSpan - 1e-9));
  const cols = Math.max(1, Math.ceil((b.east - b.west) / maxSpan - 1e-9));
  const dLat = (b.north - b.south) / rows;
  const dLon = (b.east - b.west) / cols;
  const tiles: Bbox[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles.push({ south: b.south + r * dLat, north: b.south + (r + 1) * dLat, west: b.west + c * dLon, east: b.west + (c + 1) * dLon });
    }
  }
  return tiles;
}

/** One pass over the mirrors; each attempt capped at 25 s and by the caller's deadline signal. */
export async function fetchElements(bbox: Bbox, selectors: string[], signal?: AbortSignal): Promise<OsmElement[]> {
  let lastErr: unknown = new Error("no Overpass mirror answered");
  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const res = await fetch(mirror, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": OSM_UA },
        body: "data=" + encodeURIComponent(overpassQuery(bbox, selectors)),
        signal: withTimeout(25_000, signal),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
      return ((await res.json()) as { elements?: OsmElement[] }).elements ?? [];
    } catch (e) {
      lastErr = e;
      if (signal?.aborted) break;
    }
  }
  throw lastErr;
}
