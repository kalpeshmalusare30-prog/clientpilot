export const NAV = [
  { href: "/", label: "Aaj", icon: "sun" },
  { href: "/gigs", label: "Gigs", icon: "briefcase" },
  { href: "/local", label: "Local", icon: "store" },
  { href: "/pipeline", label: "Pipeline", icon: "kanban" },
  { href: "/settings", label: "Settings", icon: "sliders" },
] as const;

export type NavIcon = (typeof NAV)[number]["icon"];
