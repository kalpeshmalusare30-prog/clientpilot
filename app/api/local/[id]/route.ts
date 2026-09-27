import { z } from "zod";
import { requireSession } from "@/lib/auth/guard";
import { fromParam } from "@/lib/ids";
import { demoUrl, hasPhone } from "@/lib/local/biz";
import { buildMessages } from "@/lib/local/messages";
import { publicOrigin } from "@/lib/origin";
import { getStore } from "@/lib/store";
import type { LocalBiz } from "@/lib/types";

export const dynamic = "force-dynamic";

const Body = z
  .object({
    whatsapp: z.string().max(4000),
    emailSubject: z.string().max(300),
    emailBody: z.string().max(6000),
    name: z.string().trim().min(1).max(80),
    area: z.string().trim().min(1).max(80),
    waNum: z.string().regex(/^\d{0,15}$/),
    phoneDisplay: z.string().max(40),
    template: z.enum(["print", "dental", "cafe", "general"]),
    regenerate: z.boolean(),
  })
  .partial();

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(req);
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "invalid fields" }, { status: 400 });
  let id: string;
  try {
    id = fromParam((await ctx.params).id);
  } catch {
    return Response.json({ ok: false, error: "bad id" }, { status: 400 });
  }
  const { regenerate, ...fields } = parsed.data;
  const origin = publicOrigin(req);
  const now = new Date().toISOString();

  let updated: LocalBiz | undefined;
  await getStore().mutateData((d) => {
    const i = d.local.findIndex((b) => b.id === id);
    if (i < 0) return d;
    let b: LocalBiz = { ...d.local[i]!, ...fields };
    if (regenerate) b = { ...b, ...buildMessages(b, d.settings, hasPhone(b) ? demoUrl(origin, b.slug) : null, now) };
    d.local[i] = b;
    updated = b;
    return d;
  });
  if (!updated) return Response.json({ ok: false, error: "not found" }, { status: 404 });
  return Response.json({ ok: true, biz: updated });
}
