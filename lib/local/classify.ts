import type { Segment } from "@/lib/types";

const CAT_LABELS: Record<string, string> = {
  restaurant: "restaurant", cafe: "cafe", fast_food: "fast food outlet",
  clinic: "clinic", dentist: "dental clinic", doctors: "clinic", hospital: "hospital",
  pharmacy: "pharmacy", chemist: "pharmacy", gym: "gym", coaching: "coaching class",
  driving_school: "driving school", events_venue: "events venue", veterinary: "veterinary clinic",
  fitness_centre: "gym", sports_centre: "sports centre", hotel: "hotel", guest_house: "guest house",
  hairdresser: "salon", beauty: "beauty salon", clothes: "clothing store", jewelry: "jewellery store",
  furniture: "furniture store", electronics: "electronics store", mobile_phone: "mobile shop",
  supermarket: "supermarket", bakery: "bakery", hardware: "hardware store", car_repair: "garage",
  travel_agency: "travel agency", estate_agent: "real estate agency", optician: "optical store",
  books: "book store", general: "general store", convenience: "general store", bed: "furniture store",
  pet: "pet shop", car: "car showroom", car_parts: "auto parts store", sports: "sports shop",
  beverages: "beverages shop", confectionery: "sweet shop", stationery: "stationery shop",
  shoes: "footwear store", gift: "gift shop", toys: "toy store", florist: "flower shop",
  butcher: "meat shop", greengrocer: "vegetable shop", laundry: "laundry service",
  dry_cleaning: "dry cleaning service", tailor: "tailoring shop", photo: "photo studio",
  copyshop: "print shop", tyres: "tyre shop", paint: "paint store", doityourself: "hardware store",
  variety_store: "variety store", kiosk: "shop", deli: "deli", seafood: "seafood shop",
  it: "IT company", company: "company", ngo: "NGO", lawyer: "law firm", accountant: "accounting firm",
  insurance: "insurance agency", architect: "architecture firm", coworking: "coworking space",
};
const EXCLUDE_CATS = new Set(["bank", "government", "personal", "blood_donation", "atm", "blood_bank", "social_facility", "townhall", "police", "post_office", "courthouse"]);
const EXCLUDE_NAME_RE = /\b(fortis|apollo|tata|reliance|hdfc|icici|axis bank|state bank|sbi\b|kotak|\blic\b|dmart|d-mart|croma|jio|airtel|vodafone|mcdonald|domino|kfc|subway|starbucks)\b/i;
export const SOCIAL_RE = /facebook\.com|instagram\.com|wa\.me|whatsapp\.com|linktr\.ee/i;

export const SEG_ORDER: Segment[] = ["site_down", "no_website", "old_site", "social_only"];
export const SEGMENT_LABELS: Record<Segment, { label: string; hint: string }> = {
  site_down: { label: "Site DOWN", hint: "website band hai — sabse garam lead" },
  no_website: { label: "No website", hint: "phone hai, website nahi" },
  old_site: { label: "Old site", hint: "website purani / kharab" },
  social_only: { label: "Social only", hint: "sirf Insta/FB, website nahi" },
};

export function categoryOf(tags: Record<string, string>): { key: string; label: string } {
  for (const key of ["shop", "amenity", "healthcare", "craft", "leisure", "tourism", "office"]) {
    const v = tags[key];
    if (!v || v === "yes") continue;
    if (CAT_LABELS[v]) return { key: v, label: CAT_LABELS[v]! };
    let label = v.replace(/_/g, " ");
    if (key === "office" && !/office|company|agency|firm/.test(label)) label += " office";
    if (key === "craft" && !/service|shop/.test(label)) label += " workshop";
    return { key: v, label };
  }
  return { key: "business", label: "business" };
}

export type Phone = { kind: "wa" | "tel"; num: string; display: string };

/** A mobile number anywhere in the string beats a landline; toll-free and placeholder numbers are rejected. */
export function normalizePhone(raw?: string | null): Phone | null {
  if (!raw) return null;
  const parts = String(raw).split(/[;,&/]|\s+(?=\+)/).map((s) => s.trim()).filter(Boolean);
  let landline: Phone | null = null;
  for (const cand of parts) {
    const hasPlus = /^[^0-9+]*\+/.test(cand);
    let d = cand.replace(/\D/g, "");
    if (hasPlus) {
      if (!d.startsWith("91")) continue;
      d = d.slice(2).replace(/^0+/, "");
    } else if (d.startsWith("0")) {
      d = d.replace(/^0+/, "");
    } else if (d.length === 12 && d.startsWith("91")) {
      d = d.slice(2);
    }
    if (d.length !== 10) continue;
    if (/^(\d)\1{9}$/.test(d)) continue;
    if (/^(\d)\1{7}$/.test(d.slice(2))) continue;
    if (/^18[06]0/.test(d)) continue;
    const first = d[0]!;
    if (first >= "6" && first <= "9") return { kind: "wa", num: "91" + d, display: "+91 " + d.slice(0, 5) + " " + d.slice(5) };
    if (!landline) landline = { kind: "tel", num: "91" + d, display: "+91 " + d };
  }
  return landline;
}

export interface OsmElement {
  type: string;
  id: number;
  tags?: Record<string, string>;
}

export interface Candidate {
  id: string;
  name: string;
  area: string;
  catKey: string;
  catLabel: string;
  addr: string;
  waNum: string;
  telNum: string;
  phoneDisplay: string;
  email: string;
  website: string;
  social: string;
  /** undefined = has a real website that still needs an audit. */
  segment: Segment | undefined;
  evidence: string;
}

/** OSM separates several values with ";" (people also use "," or a space before the next address): keep the first. */
function firstValue(raw: string): string {
  return (
    raw
      .split(/\s*[;,]\s*|\s+(?=https?:|www\.)/i)
      .map((s) => s.trim().replace(/[.,;\s]+$/, ""))
      .find(Boolean) ?? ""
  );
}

/** "excluded" = chain/bank/non-Latin (counted), null = unusable (no name or no contact). */
export function toCandidate(el: OsmElement, area: string): Candidate | "excluded" | null {
  const t = el.tags ?? {};
  if (!t.name) return null;
  if (!/[A-Za-z]/.test(t.name)) return "excluded";
  if (EXCLUDE_NAME_RE.test(t.name)) return "excluded";
  const phone = normalizePhone(t.phone || t["contact:phone"] || t["contact:mobile"]);
  let email = (t.email || t["contact:email"] || "").split(/[;,\s]/)[0] || "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) email = "";
  if (!phone && !email) return null;
  const cat = categoryOf(t);
  if (EXCLUDE_CATS.has(cat.key)) return "excluded";
  const site = firstValue(t.website || t["contact:website"] || "");
  const social = (t["contact:instagram"] || t["contact:facebook"] || "").trim().replace(/[.,;\s]+$/, "");
  const addr = [t["addr:housenumber"], t["addr:street"], t["addr:suburb"]].filter(Boolean).join(", ") || (t["addr:full"] || "").slice(0, 60);
  const hasRealSite = !!site && !SOCIAL_RE.test(site);
  return {
    id: `${el.type}/${el.id}`,
    name: t.name.slice(0, 80),
    area,
    catKey: cat.key,
    catLabel: cat.label,
    addr,
    waNum: phone?.kind === "wa" ? phone.num : "",
    telNum: phone?.kind === "tel" ? phone.num : "",
    phoneDisplay: phone?.display ?? "",
    email,
    website: site,
    social,
    segment: hasRealSite ? undefined : site || social ? "social_only" : "no_website",
    evidence: "",
  };
}
