export const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function addDaysISO(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY_MS).toISOString();
}

/** Epoch ms of the last millisecond of the IST calendar day that contains `now`. */
export function istDayEnd(now: number): number {
  const ist = now + IST_OFFSET_MS;
  const dayStart = Math.floor(ist / DAY_MS) * DAY_MS;
  return dayStart + DAY_MS - 1 - IST_OFFSET_MS;
}

export type FollowUpState = "overdue" | "today" | "later" | "none";

export function followUpState(followUpAt: string | undefined, now: number): FollowUpState {
  if (!followUpAt) return "none";
  const t = Date.parse(followUpAt);
  if (!Number.isFinite(t)) return "none";
  const end = istDayEnd(now);
  const start = end - DAY_MS + 1;
  if (t < start) return "overdue";
  if (t <= end) return "today";
  return "later";
}

export function formatIST(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Compact age: "5m", "3h", "2d". Empty string for a missing/invalid date. */
export function ageLabel(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (!iso || !Number.isFinite(t)) return "";
  const mins = Math.max(0, Math.floor((now - t) / 60_000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Epoch ms of the first millisecond of the IST calendar day that contains `now`. */
export function istDayStart(now: number): number {
  return istDayEnd(now) - DAY_MS + 1;
}

/** Epoch ms of the start of the IST week (Monday 00:00 IST) that contains `now`. */
export function istWeekStart(now: number): number {
  const start = istDayStart(now);
  // getUTCDay of the IST-shifted instant is the IST weekday (0 = Sunday).
  const weekday = new Date(start + IST_OFFSET_MS).getUTCDay();
  return start - ((weekday + 6) % 7) * DAY_MS;
}

/** The hour (0-23) on an IST clock at `now`. */
export function istHour(now: number): number {
  return new Date(now + IST_OFFSET_MS).getUTCHours();
}

/** "Saturday, 10 October" in IST. */
export function formatISTDay(now: number): string {
  return new Date(now).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" });
}
