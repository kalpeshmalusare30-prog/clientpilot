import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth/crypto";
import { requireSession } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireSession(req);
  if (denied) return denied;
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
