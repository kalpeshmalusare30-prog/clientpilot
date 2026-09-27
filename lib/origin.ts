/** Public origin for links sent to other people (demo pages). On Vercel this is the production domain. */
export function publicOrigin(req: Request): string {
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;
  return new URL(req.url).origin;
}
