import { requireSession } from "@/lib/auth/guard";
import { fromParam } from "@/lib/ids";
import { ActionSchema, applyAction } from "@/lib/state";
import { getStore } from "@/lib/store";
import type { LeadKind, LeadState } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(req);
  if (denied) return denied;
  const kind = new URL(req.url).searchParams.get("kind");
  if (kind !== "gig" && kind !== "local") {
    return Response.json({ ok: false, error: "kind must be gig or local" }, { status: 400 });
  }
  const parsed = ActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "invalid action" }, { status: 400 });
  let id: string;
  try {
    id = fromParam((await ctx.params).id);
  } catch {
    return Response.json({ ok: false, error: "bad id" }, { status: 400 });
  }
  const now = new Date().toISOString();
  let state: LeadState | undefined;
  await getStore().mutateData((d) => {
    state = applyAction(d.state[id], kind as LeadKind, parsed.data, now);
    d.state[id] = state;
    return d;
  });
  return Response.json({ ok: true, state });
}
