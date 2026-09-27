import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ClientPilot",
    short_name: "ClientPilot",
    description: "Gigs, local clients and follow-ups",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0f1c",
    theme_color: "#0a0f1c",
    icons: [
      { src: "/pwa-icon?size=192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon?size=512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon?size=512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
