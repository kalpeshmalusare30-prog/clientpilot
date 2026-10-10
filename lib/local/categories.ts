/**
 * Search picker. Each option narrows the Overpass query to OSM tags that classify.ts understands; lib/local/biz.ts
 * maps every listed value to a demo template. Options are ordered by how likely the business is to pay for a website.
 */

/** One OSM tag condition: no `values` = any value; `not` = values left out. */
export interface TagSel {
  key: string;
  values?: string[];
  not?: string[];
}

export interface CategoryOption {
  key: string;
  label: string;
  tags: TagSel[];
  /** Rarely buys a website: left out of "All businesses" and listed last. */
  lowValue?: boolean;
  /** Overpass filters, one statement each, e.g. ["shop"~"^(bakery|pastry)$"]["name"]. */
  selectors: string[];
}

const t = (key: string, ...values: string[]): TagSel => (values.length ? { key, values } : { key });

/** Industrial, manufacturing and wholesale businesses: they seldom buy a website from a freelancer. */
const LOW_VALUE: TagSel[] = [
  t("shop", "wholesale", "trade", "agrarian"),
  t("craft", "metal_construction", "welder", "sawmill", "blacksmith", "stonemason", "insulation", "scaffolder"),
  t("office", "industrial", "manufacturer", "logistics"),
  t("man_made", "works"),
  t("industrial"),
];

/** Never worth a search: government and political offices. */
const OFFICE_SKIP = ["government", "political_party", "diplomatic", "religion"];

type Def = Omit<CategoryOption, "selectors">;

const DEFS: Def[] = [
  { key: "beauty", label: "Salon / parlour / spa", tags: [t("shop", "beauty", "hairdresser", "massage", "tattoo"), t("amenity", "spa")] },
  {
    key: "fitness",
    label: "Gym / yoga / fitness",
    tags: [
      t("leisure", "fitness_centre", "sports_centre"),
      t("amenity", "gym"),
      t("sport", "yoga", "fitness", "aerobics", "pilates", "zumba", "crossfit", "martial_arts", "karate", "taekwondo", "boxing"),
    ],
  },
  {
    key: "education",
    label: "Coaching / tuition / classes",
    tags: [
      t("amenity", "coaching", "training", "prep_school", "language_school", "music_school", "dancing_school", "driving_school"),
      t("office", "educational_institution"),
    ],
  },
  { key: "preschool", label: "Preschool / play school / school", tags: [t("amenity", "kindergarten", "childcare", "school")] },
  {
    key: "clinic",
    label: "Clinic / doctor / physio / lab",
    tags: [
      t("amenity", "clinic", "doctors", "hospital"),
      t("healthcare", "clinic", "doctor", "hospital", "physiotherapist", "laboratory", "sample_collection", "centre", "alternative",
        "psychotherapist", "counselling", "rehabilitation", "speech_therapist", "occupational_therapist", "audiologist", "nutrition_counselling", "dialysis"),
    ],
  },
  { key: "dental", label: "Dentist", tags: [t("amenity", "dentist"), t("healthcare", "dentist")] },
  { key: "optician", label: "Optician / eye care", tags: [t("shop", "optician"), t("healthcare", "optometrist")] },
  { key: "realestate", label: "Real estate / property agent", tags: [t("office", "estate_agent", "property_management"), t("shop", "estate_agent")] },
  {
    key: "finance",
    label: "CA / tax / lawyer / insurance",
    tags: [t("office", "accountant", "tax_advisor", "lawyer", "notary", "insurance", "financial", "financial_advisor", "consulting")],
  },
  { key: "design", label: "Architect / interior designer", tags: [t("office", "architect", "interior_design"), t("shop", "interior_decoration")] },
  { key: "photo", label: "Photographer / photo studio", tags: [t("craft", "photographer"), t("shop", "photo")] },
  {
    key: "events",
    label: "Banquet hall / caterer / events",
    tags: [t("amenity", "events_venue", "banquet_hall", "conference_centre"), t("craft", "caterer"), t("office", "event_management")],
  },
  { key: "travel", label: "Travel agent / tours", tags: [t("shop", "travel_agency"), t("office", "travel_agent", "travel_agency")] },
  { key: "hotel", label: "Hotel / guest house", tags: [t("tourism", "hotel", "guest_house", "hostel", "motel")] },
  { key: "food", label: "Restaurant / cafe / fast food", tags: [t("amenity", "restaurant", "cafe", "fast_food", "ice_cream"), t("shop", "beverages", "deli", "tea", "coffee")] },
  { key: "bakery", label: "Bakery / cake / sweet shop", tags: [t("shop", "bakery", "confectionery", "pastry", "chocolate")] },
  {
    key: "fashion",
    label: "Boutique / tailor / jeweller",
    tags: [t("shop", "boutique", "clothes", "tailor", "fabric", "jewelry", "shoes", "bag", "watches"), t("craft", "tailor", "dressmaker")],
  },
  {
    key: "furniture",
    label: "Furniture / home decor / kitchen",
    tags: [t("shop", "furniture", "bed", "kitchen", "lighting", "curtain", "carpet", "houseware", "bathroom_furnishing", "tiles")],
  },
  { key: "electronics", label: "Mobile / electronics / computer", tags: [t("shop", "mobile_phone", "electronics", "computer", "appliance", "hifi")] },
  {
    key: "auto",
    label: "Car / bike service / showroom",
    tags: [t("shop", "car_repair", "motorcycle_repair", "tyres", "car", "motorcycle", "car_parts"), t("amenity", "car_wash")],
  },
  { key: "vet", label: "Vet / pet shop", tags: [t("amenity", "veterinary"), t("shop", "pet", "pet_grooming")] },
  { key: "pharmacy", label: "Pharmacy / chemist", tags: [t("amenity", "pharmacy"), t("shop", "chemist", "medical_supply"), t("healthcare", "pharmacy")] },
  { key: "florist", label: "Florist / gift shop", tags: [t("shop", "florist", "gift")] },
  { key: "print", label: "Print / xerox / stationery / photo", tags: [t("shop", "copyshop", "stationery", "photo"), t("craft", "printer")] },
  { key: "shop", label: "Other shops (all)", tags: [{ key: "shop", not: LOW_VALUE.find((s) => s.key === "shop")!.values }] },
  { key: "office", label: "Offices (CA, lawyer, IT, insurance…)", tags: [t("office", "accountant", "lawyer", "it", "company", "insurance", "architect", "estate_agent", "coworking", "tax_advisor", "financial", "consulting")] },
  { key: "industrial", label: "Industrial / factory / wholesale (kami chance)", tags: LOW_VALUE, lowValue: true },
];

/** Broad tags that "All businesses" adds beyond the options above (unlisted crafts, healthcare and offices). */
const ALL_EXTRA: TagSel[] = [{ key: "craft" }, { key: "healthcare" }, { key: "office", not: OFFICE_SKIP }];

const escRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const alt = (vs: string[]) => `^(${vs.map(escRe).join("|")})$`;

export function selectorOf(s: TagSel): string {
  let q = s.values?.length ? `["${s.key}"~"${alt(s.values)}"]` : `["${s.key}"]`;
  if (s.not?.length) q += `["${s.key}"!~"${alt(s.not)}"]`;
  return q + '["name"]';
}

/** One condition per OSM key: a key any option takes whole stays whole (minus low-value values), otherwise values are merged. */
export function mergeTags(sels: TagSel[], lowValue: TagSel[]): TagSel[] {
  const byKey = new Map<string, { any: boolean; values: Set<string>; not?: Set<string> }>();
  for (const s of sels) {
    const e = byKey.get(s.key) ?? { any: false, values: new Set<string>() };
    if (!s.values) {
      e.any = true;
      // Two "any value" conditions on one key only leave out what both leave out.
      const not = new Set(s.not ?? []);
      e.not = e.not ? new Set([...e.not].filter((v) => not.has(v))) : not;
    } else s.values.forEach((v) => e.values.add(v));
    byKey.set(s.key, e);
  }
  const out: TagSel[] = [];
  for (const [key, e] of byKey) {
    if (!e.any) {
      out.push({ key, values: [...e.values] });
      continue;
    }
    const not = new Set(e.not);
    for (const l of lowValue) if (l.key === key) (l.values ?? []).forEach((v) => not.add(v));
    out.push(not.size ? { key, not: [...not] } : { key });
  }
  return out;
}

const withSelectors = (d: Def): CategoryOption => ({ ...d, selectors: d.tags.map(selectorOf) });

const ALL_TAGS = mergeTags([...DEFS.filter((d) => !d.lowValue).flatMap((d) => d.tags), ...ALL_EXTRA], LOW_VALUE);

export const CATEGORY_OPTIONS: CategoryOption[] = [
  withSelectors({ key: "all", label: "All businesses", tags: ALL_TAGS }),
  ...DEFS.filter((d) => !d.lowValue).map(withSelectors),
  ...DEFS.filter((d) => d.lowValue).map(withSelectors),
];

export function selectorsFor(key: string): string[] {
  return (CATEGORY_OPTIONS.find((c) => c.key === key) ?? CATEGORY_OPTIONS[0]!).selectors;
}
