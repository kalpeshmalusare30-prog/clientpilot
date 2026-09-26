import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, verifySession } from "./crypto";

/** Server-component guard: sends the visitor to /login without a valid session. */
export async function requirePageSession(): Promise<void> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!(await verifySession(token))) redirect("/login");
}
