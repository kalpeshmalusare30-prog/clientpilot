// Pure helpers for the Pipeline follow-up control and the Settings form (testable without a DOM).

/** A complete datetime-local value ("2026-09-30T11:00"). */
const FULL_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/;

/** The followUp write for a picker value, or null for a blank/half-typed one (clearing is its own button). */
export function followUpActionFor(input: string): { type: "followUp"; followUpAt: string } | null {
  if (!FULL_LOCAL.test(input)) return null;
  const t = new Date(input);
  if (!Number.isFinite(t.getTime())) return null;
  return { type: "followUp", followUpAt: t.toISOString() };
}

/** The phone's local time as a datetime-local value. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** What the picker shows after a failed write: the stored date, never the unsaved one. */
export function revertFollowUpInput(stored: string | undefined): string {
  return stored ? toLocalInput(stored) : "";
}

export function notSaved(e: unknown): string {
  return `Save zala nahi — ${(e as Error)?.message ?? String(e)}`;
}

export const SETTINGS_OK_MS = 3500;

/** The inline result under the Settings buttons: an error stays (role alert) until closed or retried; "Saved" clears. */
export function settingsResult(err: unknown): { text: string; role: "alert" | "status"; clearAfterMs: number | null } {
  return err ? { text: notSaved(err), role: "alert", clearAfterMs: null } : { text: "Saved", role: "status", clearAfterMs: SETTINGS_OK_MS };
}
