import { constantTimeEqual } from "@/lib/auth/crypto";
import { runGigCron } from "@/lib/gigs/cron";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !constantTimeEqual(auth, `Bearer ${secret}`)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const result = await runGigCron(getStore());
  return Response.json({ ok: true, ...result });
}
