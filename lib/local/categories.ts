/** Search picker. Each option narrows the Overpass query to the OSM tags classify.ts already understands. */
const ALL = [
  '["shop"]["name"]',
  '["amenity"~"^(restaurant|cafe|fast_food|clinic|dentist|doctors|hospital|pharmacy|bank|gym|coaching|driving_school|events_venue|veterinary)$"]["name"]',
  '["office"]["name"]',
  '["craft"]["name"]',
  '["leisure"~"^(fitness_centre|sports_centre)$"]["name"]',
  '["tourism"~"^(hotel|guest_house)$"]["name"]',
  '["healthcare"]["name"]',
];

export const CATEGORY_OPTIONS: { key: string; label: string; selectors: string[] }[] = [
  { key: "all", label: "All businesses", selectors: ALL },
  { key: "print", label: "Print / xerox / stationery / photo", selectors: ['["shop"~"^(copyshop|stationery|photo)$"]["name"]'] },
  { key: "dental", label: "Dentist", selectors: ['["amenity"="dentist"]["name"]', '["healthcare"="dentist"]["name"]'] },
  { key: "clinic", label: "Clinic / doctor / hospital", selectors: ['["amenity"~"^(clinic|doctors|hospital)$"]["name"]', '["healthcare"~"^(clinic|doctor|hospital)$"]["name"]'] },
  { key: "food", label: "Restaurant / cafe / bakery / sweets", selectors: ['["amenity"~"^(restaurant|cafe|fast_food)$"]["name"]', '["shop"~"^(bakery|confectionery|beverages|deli)$"]["name"]'] },
  { key: "beauty", label: "Salon / beauty / tailor", selectors: ['["shop"~"^(hairdresser|beauty|tailor)$"]["name"]'] },
  { key: "fitness", label: "Gym / fitness / sports", selectors: ['["leisure"~"^(fitness_centre|sports_centre)$"]["name"]', '["amenity"="gym"]["name"]'] },
  { key: "education", label: "Coaching / classes / driving school", selectors: ['["amenity"~"^(coaching|driving_school)$"]["name"]', '["office"="educational_institution"]["name"]'] },
  { key: "hotel", label: "Hotel / guest house", selectors: ['["tourism"~"^(hotel|guest_house)$"]["name"]'] },
  { key: "shop", label: "Shops (clothes, electronics, furniture…)", selectors: ['["shop"]["name"]'] },
  { key: "office", label: "Offices (CA, lawyer, IT, insurance…)", selectors: ['["office"~"^(accountant|lawyer|it|company|insurance|architect|estate_agent|coworking)$"]["name"]'] },
];

export function selectorsFor(key: string): string[] {
  return (CATEGORY_OPTIONS.find((c) => c.key === key) ?? CATEGORY_OPTIONS[0]!).selectors;
}
