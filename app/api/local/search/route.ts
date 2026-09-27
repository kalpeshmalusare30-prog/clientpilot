import { z } from "zod";
import { requireSession } from "@/lib/auth/guard";
import { CATEGORY_OPTIONS } from "@/lib/local/categories";
import { searchLocal } from "@/lib/local/search";
import { publicOrigin } from "@/lib/origin";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  area: z.string().trim().min(2).max(80),
  category: z.string().refine((k) => CATEGORY_OPTIONS.some((c) => c.key === k), "unknown category"),
});

/** Nominatim and Overpass ask for one request at a time; one search per warm instance is enough. */
let running = false;

export async function POST(req: Request) {
  const denied = await requireSession(req);
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "area and a known category are required" }, { status: 400 });
  if (running) return Response.json({ ok: false, error: "A search is already running — try again in a minute." }, { status: 409 });

  running = true;
  try {
    const store = getStore();
    const data = await store.readData();
    const result = await searchLocal({
      area: parsed.data.area,
      category: parsed.data.category,
      existing: data.local,
      settings: data.settings,
      origin: publicOrigin(req),
      nowIso: new Date().toISOString(),
      deadline: Date.now() + 50_000,
    });
    if (result.added.length) {
      await store.mutateData((d) => {
        const known = new Set(d.local.map((b) => b.id));
        d.local.push(...result.added.filter((b) => !known.has(b.id)));
        return d;
      });
    }
    return Response.json({
      ok: true,
      added: result.added.length,
      partial: result.partial,
      scanned: result.scanned,
      skippedAudits: result.skippedAudits,
      areaLabel: result.areaLabel,
    });
  } catch (e) {
    return Response.json({ ok: false, error: `Search failed: ${String((e as Error)?.message ?? e).slice(0, 160)}` }, { status: 502 });
  } finally {
    running = false;
  }
}
