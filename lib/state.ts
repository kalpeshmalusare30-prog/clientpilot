import { z } from "zod";
import { STATUSES, type LeadKind, type LeadState, type Status } from "./types";
import { addDaysISO } from "./time";

export const FOLLOW_UP_DAYS = 3;
const CLOSED: Status[] = ["won", "lost", "skipped"];

export const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("proposal"), proposal: z.string().max(5000) }),
  z.object({ type: z.literal("bid"), amount: z.number().positive().max(100_000_000), currency: z.string().min(1).max(8) }),
  z.object({ type: z.literal("sent") }),
  z.object({ type: z.literal("skip") }),
  z.object({ type: z.literal("stage"), status: z.enum(STATUSES as [Status, ...Status[]]) }),
  z.object({ type: z.literal("followUp"), followUpAt: z.string().datetime().nullable() }),
  z.object({ type: z.literal("notes"), notes: z.string().max(2000) }),
]);
export type Action = z.infer<typeof ActionSchema>;

export function applyAction(prev: LeadState | undefined, kind: LeadKind, action: Action, nowIso: string): LeadState {
  const s: LeadState = { ...(prev ?? { kind, status: "new", updatedAt: nowIso }), updatedAt: nowIso };
  switch (action.type) {
    case "proposal":
      s.proposal = action.proposal;
      if (s.status === "new") s.status = "drafted";
      break;
    case "bid":
      s.status = "sent";
      s.bidAmount = action.amount;
      s.bidCurrency = action.currency;
      s.sentAt = nowIso;
      s.followUpAt = addDaysISO(nowIso, FOLLOW_UP_DAYS);
      break;
    case "sent":
      s.status = "sent";
      s.sentAt = nowIso;
      s.followUpAt = addDaysISO(nowIso, FOLLOW_UP_DAYS);
      break;
    case "skip":
      s.status = "skipped";
      s.followUpAt = undefined;
      break;
    case "stage":
      s.status = action.status;
      if (CLOSED.includes(action.status)) s.followUpAt = undefined;
      break;
    case "followUp":
      s.followUpAt = action.followUpAt ? action.followUpAt : undefined;
      break;
    case "notes":
      s.notes = action.notes;
      break;
  }
  return s;
}
