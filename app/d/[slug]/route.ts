import { demoVarsFor, renderDemo } from "@/lib/demo/render";
import { hasPhone } from "@/lib/local/biz";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const NOT_FOUND = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Demo not found</title></head><body style="font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f8fafc;color:#0f172a"><p>This demo page is not available.</p></body></html>`;

/** Slugs are slugify() output (≤ 40 chars) plus an optional "-N" suffix. */
const SLUG_RE = /^[a-z0-9-]{1,48}$/;

/** Demo pages are public and hold OpenStreetMap text: the sandbox gives them an opaque origin, so even a future
 * escaping slip cannot call /api/* with the owner's cookie. Inline scripts, fonts, images and wa.me/tel: links still work. */
const CSP = "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox; base-uri 'none'; form-action 'none'";

/** A business that said no (lost) or was skipped gets its page taken down. */
const UNPUBLISHED = new Set(["lost", "skipped"]);

/** Public demo page. Reads data.json through the CDN cache and lets Vercel's CDN cache the HTML for 5 minutes,
 * so businesses opening their demo do not use the Blob quota. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const base = { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, nofollow", "content-security-policy": CSP };
  // A malformed slug never reaches data.json, and its 404 is cached long: random URLs cannot burn the Blob quota.
  if (!SLUG_RE.test(slug)) {
    return new Response(NOT_FOUND, { status: 404, headers: { ...base, "cache-control": "public, s-maxage=3600" } });
  }
  const data = await getStore().readData({ fresh: false });
  const biz = data.local.find((b) => b.slug === slug);
  const status = biz ? data.state[biz.id]?.status : undefined;
  if (!biz || !hasPhone(biz) || (status && UNPUBLISHED.has(status))) {
    return new Response(NOT_FOUND, { status: 404, headers: { ...base, "cache-control": "public, s-maxage=60" } });
  }
  const html = renderDemo(biz.template, demoVarsFor(biz, new Date().getFullYear()));
  return new Response(html, { headers: { ...base, "cache-control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
