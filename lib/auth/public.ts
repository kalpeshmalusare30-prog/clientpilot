const PUBLIC_EXACT = new Set([
  "/login",
  "/api/login",
  "/api/cron/gigs",
  "/manifest.webmanifest",
  "/sw.js",
  "/offline.html",
  "/favicon.ico",
  "/robots.txt",
]);
const PUBLIC_PREFIX = ["/d/", "/pwa-icon", "/apple-icon", "/icon"];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIX.some((p) => pathname.startsWith(p));
}
