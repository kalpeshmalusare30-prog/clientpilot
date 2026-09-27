export const NAV = [
  { href: "/", label: "Aaj", icon: "today" },
  { href: "/gigs", label: "Gigs", icon: "gigs" },
  { href: "/local", label: "Local", icon: "local" },
  { href: "/pipeline", label: "Pipeline", icon: "pipeline" },
  { href: "/settings", label: "Settings", icon: "settings" },
] as const;

export type NavIcon = (typeof NAV)[number]["icon"];
