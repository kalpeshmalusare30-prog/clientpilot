import { z } from "zod";
import { isAllowedLink } from "@/lib/ai/proposal";
import { requireSession } from "@/lib/auth/guard";
import { DEFAULT_ALLOWED_LINKS } from "@/lib/defaults";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/* Facts, NEVER list, pricing and the template are stored exactly as typed (the AI honesty check reads them).
 * Allowed links may only narrow the global allow-list: each must be one of the default sites or a subpath of one. */
const SettingsSchema = z.object({
  facts: z.string().max(10_000),
  never: z.string().max(4_000),
  allowedLinks: z
    .array(
      z.string().trim().url().max(300).refine((u) => isAllowedLink(u, DEFAULT_ALLOWED_LINKS), {
        message: `must be one of ${DEFAULT_ALLOWED_LINKS.join(", ")} or a subpath`,
      }),
    )
    .min(1)
    .max(15),
  pricing: z.string().max(4_000),
  waTemplate: z.string().max(3_000).refine((t) => t.trim().length >= 10, { message: "must be at least 10 characters" }),
});

export async function GET(req: Request) {
  const denied = await requireSession(req);
  if (denied) return denied;
  const d = await getStore().readData();
  return Response.json({ ok: true, settings: d.settings });
}

export async function PUT(req: Request) {
  const denied = await requireSession(req);
  if (denied) return denied;
  const parsed = SettingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message).join("; ") }, { status: 400 });
  await getStore().mutateData((d) => ({ ...d, settings: parsed.data }));
  return Response.json({ ok: true, settings: parsed.data });
}
