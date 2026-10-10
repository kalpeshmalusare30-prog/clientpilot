import type { LocalBiz, TemplateKey } from "@/lib/types";

const BY_TEMPLATE: Record<Exclude<TemplateKey, "general">, string[]> = {
  print: ["copyshop", "stationery", "photo", "printer"],
  dental: ["dentist", "orthodontist"],
  cafe: ["restaurant", "cafe", "fast_food", "ice_cream", "food_court", "bakery", "confectionery", "pastry", "chocolate", "beverages", "deli", "tea", "coffee"],
  salon: ["beauty", "hairdresser", "massage", "tattoo", "spa", "cosmetics"],
  fitness: ["fitness_centre", "sports_centre", "gym", "yoga", "fitness", "aerobics", "pilates", "zumba", "crossfit", "martial_arts", "karate", "taekwondo", "boxing"],
  coaching: ["coaching", "training", "prep_school", "language_school", "music_school", "dancing_school", "driving_school", "educational_institution",
    "kindergarten", "childcare", "school", "college", "tutor"],
  health: ["clinic", "doctors", "doctor", "hospital", "physiotherapist", "laboratory", "sample_collection", "centre", "alternative", "psychotherapist",
    "counselling", "rehabilitation", "speech_therapist", "occupational_therapist", "audiologist", "nutrition_counselling", "dialysis", "optometrist", "veterinary"],
  pro: ["accountant", "tax_advisor", "lawyer", "notary", "insurance", "financial", "financial_advisor", "consulting", "estate_agent", "property_management",
    "architect", "interior_design", "interior_decoration", "travel_agent", "travel_agency", "it", "company"],
  retail: ["boutique", "clothes", "tailor", "dressmaker", "fabric", "jewelry", "shoes", "bag", "watches", "furniture", "bed", "kitchen", "lighting", "curtain",
    "carpet", "houseware", "bathroom_furnishing", "tiles", "mobile_phone", "electronics", "computer", "appliance", "hifi", "optician", "pet", "pet_grooming",
    "pharmacy", "chemist", "medical_supply", "florist", "gift", "toys", "books", "sports", "perfumery"],
  events: ["events_venue", "banquet_hall", "conference_centre", "caterer", "event_management", "photographer"],
  auto: ["car_repair", "motorcycle_repair", "tyres", "car", "motorcycle", "car_parts", "car_wash"],
};

/** OSM value (LocalBiz.catKey) → demo design. Values not listed get the neutral "general" page. */
export const TEMPLATE_BY_CAT: Record<string, TemplateKey> = Object.fromEntries(
  Object.entries(BY_TEMPLATE).flatMap(([tpl, keys]) => keys.map((k) => [k, tpl as TemplateKey])),
);
/** Values that deliberately get the neutral page (hotels, general stores, …); categories.test.ts checks every picker value is mapped. */
export const GENERAL_CATS = ["hotel", "guest_house", "hostel", "motel", "coworking", "supermarket", "convenience", "general", "variety_store", "hardware", "doityourself"];

/** Label words for businesses whose catKey is not an OSM value (imported leads, older data). Order matters. */
const LABEL_RULES: [RegExp, TemplateKey][] = [
  [/print|xerox|copy|stationer|photo studio/, "print"],
  [/dent|orthodont/, "dental"],
  [/restaurant|cafe|food|bakery|cake|\bdeli\b|sweet|confectionery|beverage|\btea\b|coffee/, "cafe"],
  [/salon|parlou?r|beauty|\bspa\b|massage|\bhair|\bnail|makeup|mehendi|tattoo/, "salon"],
  [/gym|fitness|yoga|zumba|pilates|martial|karate|crossfit/, "fitness"],
  [/coaching|tuition|classes|academy|institute|school|training|tutor|preschool|play ?group|day ?care/, "coaching"],
  [/clinic|doctor|hospital|physio|diagnos|patholog|lab\b|health|ayurved|homeo|nursing|veterin|eye care|optometr/, "health"],
  [/chartered|accountant|\bca\b|tax|lawyer|advocate|legal|notary|insurance|financ|consult|estate|property|realt|architect|interior|travel|tours?\b/, "pro"],
  [/banquet|caterer|catering|event|wedding|photograph|decorator/, "events"],
  [/garage|car |bike|motor|auto|tyre|car$/, "auto"],
  [/boutique|cloth|tailor|jewel|furniture|decor|electronic|mobile|computer|optic|pet|pharmac|chemist|medical store|florist|gift|footwear|shoe|store|showroom/, "retail"],
];

/** Dental is for dentists/orthodontists only; hospitals and clinics get the health page. */
export function templateFor(catKey: string, catLabel: string): TemplateKey {
  const byKey = TEMPLATE_BY_CAT[catKey];
  if (byKey) return byKey;
  if (GENERAL_CATS.includes(catKey)) return "general";
  const c = `${catKey.replace(/_/g, " ")} ${catLabel}`.toLowerCase();
  return LABEL_RULES.find(([re]) => re.test(c))?.[1] ?? "general";
}

/** A lead stored before the trade-specific designs existed has "general"; its demo uses the design that now fits,
 * unless "general" was picked by hand. */
export function demoTemplateOf(b: Pick<LocalBiz, "template" | "templatePinned" | "catKey" | "catLabel">): TemplateKey {
  return b.template === "general" && !b.templatePinned ? templateFor(b.catKey, b.catLabel) : b.template;
}

/** Same rule as make-demo.js, so existing demo slugs (a9-digital-prints, …) are unchanged. */
export function slugify(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  return s || "biz";
}

export function uniqueSlug(name: string, taken: Set<string>): string {
  const base = slugify(name);
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  taken.add(slug);
  return slug;
}

export function demoUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/+$/, "")}/d/${slug}`;
}

/** A demo needs a number for its call/WhatsApp buttons. */
export function hasPhone(b: Pick<LocalBiz, "waNum" | "telNum">): boolean {
  return !!(b.waNum || b.telNum);
}
