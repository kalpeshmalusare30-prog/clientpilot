import { z } from "zod";
import { GeminiProvider } from "@/lib/ai/gemini";
import { draftProposal } from "@/lib/ai/proposal";
import { requireSession } from "@/lib/auth/guard";
import { applyAction } from "@/lib/state";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ id: z.string().min(1).max(600) });

export async function POST(req: Request) {
  const denied = await requireSession(req);
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "id required" }, { status: 400 });

  const store = getStore();
  const [gigs, data] = await Promise.all([store.readGigs(), store.readData()]);
  const gig = gigs.items.find((g) => g.id === parsed.data.id);
  if (!gig) return Response.json({ ok: false, error: "gig not found" }, { status: 404 });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ ok: false, error: "GEMINI_API_KEY is not set" }, { status: 500 });

  let result: Awaited<ReturnType<typeof draftProposal>>;
  try {
    result = await draftProposal(new GeminiProvider(key), gig, data.settings);
  } catch (e) {
    return Response.json({ ok: false, error: `AI failed: ${String((e as Error)?.message ?? e).slice(0, 160)}` }, { status: 502 });
  }

  const now = new Date().toISOString();
  await store.mutateData((d) => {
    d.state[gig.id] = applyAction(d.state[gig.id], "gig", { type: "proposal", proposal: result.text }, now);
    return d;
  });
  return Response.json({
    ok: true,
    text: result.text,
    chars: result.text.length,
    changes: result.changes,
    removedLinks: result.removedLinks,
    overLimit: result.overLimit,
    checked: result.checked,
  });
}
