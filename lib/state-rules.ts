// Plain rules shared by the server (lib/state.ts) and client components; no zod, so the client bundle stays small.
import type { Status } from "./types";

export const FOLLOW_UP_DAYS = 3;
/** Sending (a WhatsApp/email tap, a re-bid) never demotes these; only an explicit stage change moves them. */
export const KEEP_ON_SEND: Status[] = ["replied", "won", "lost"];
/** No new follow-up for a lead that is already decided. */
export const NO_FOLLOW_UP: Status[] = ["won", "lost"];

const KEPT_LABEL: Partial<Record<Status, string>> = { replied: "Reply aala", won: "Client zala", lost: "Lost" };

/** Toast after a send/bid write, from the status the server stored (a replied/won/lost lead keeps its status). */
export function sendResultText(status: Status, what: "sent" | "bid"): string {
  const head = what === "bid" ? "Bid saved" : status === "sent" ? "Sent mark kela" : "Contact save kela";
  const kept = KEPT_LABEL[status];
  if (!kept) return `${head} · follow-up ${FOLLOW_UP_DAYS} divasani`;
  if (status === "lost") return `${head} · status ${kept} tasach (badlaycha tar Pipeline madhe)`;
  return `${head} · status ${kept} tasach${NO_FOLLOW_UP.includes(status) ? "" : ` · follow-up ${FOLLOW_UP_DAYS} divasani`}`;
}
