import { COOKIE_NAME, constantTimeEqual, verifySession } from "./crypto";

/** Vercel sets x-real-ip at its edge; clients cannot forge it. */
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return "local";
}

export function checkPassword(input: string): boolean {
  const expected = process.env.APP_PASSWORD ?? "";
  return expected.length > 0 && constantTimeEqual(input, expected);
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/** Route-handler guard. Returns a 401 Response when unauthorised, otherwise null. */
export async function requireSession(req: Request): Promise<Response | null> {
  if (await verifySession(readCookie(req, COOKIE_NAME))) return null;
  return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
}
