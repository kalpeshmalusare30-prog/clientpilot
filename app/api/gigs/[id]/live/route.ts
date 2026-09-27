import { requireSession } from "@/lib/auth/guard";
import { fetchLive, freelancerProjectId } from "@/lib/gigs/live";
import { fromParam } from "@/lib/ids";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(req);
  if (denied) return denied;
  let id: string;
  try {
    id = fromParam((await ctx.params).id);
  } catch {
    return Response.json({ ok: false, error: "bad id" }, { status: 400 });
  }
  const pid = freelancerProjectId(id);
  if (!pid) return Response.json({ ok: false, error: "live status is only available for Freelancer.com gigs" }, { status: 400 });
  try {
    const live = await fetchLive(pid);
    if (!live) return Response.json({ ok: false, error: "project not found" }, { status: 404 });
    return Response.json({ ok: true, live });
  } catch (e) {
    return Response.json({ ok: false, error: `Freelancer API: ${String((e as Error)?.message ?? e).slice(0, 120)}` }, { status: 502 });
  }
}
