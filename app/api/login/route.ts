import { NextResponse } from "next/server";
import { COOKIE_NAME, SESSION_MAX_AGE_S, signSession } from "@/lib/auth/crypto";
import { checkPassword, clientIp } from "@/lib/auth/guard";
import { recordFailure, recordSuccess, retryAfterMs } from "@/lib/auth/lockout";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";

  // No await from here to recordFailure/recordSuccess: check-then-record must
  // run as one synchronous step, or concurrent requests can all pass the
  // lock check before any of them is recorded.
  const ip = clientIp(req);
  const lockMs = retryAfterMs(ip);
  if (lockMs > 0) {
    return NextResponse.json(
      { ok: false, error: `Too many attempts. Try again in ${Math.ceil(lockMs / 60000)} min.` },
      { status: 429, headers: { "Retry-After": String(Math.ceil(lockMs / 1000)) } },
    );
  }
  if (!password || !checkPassword(password)) {
    recordFailure(ip);
    return NextResponse.json({ ok: false, error: "Wrong password" }, { status: 401 });
  }
  recordSuccess(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, await signSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  return res;
}
