"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { patchJSON, patchState } from "@/lib/client/api";
import { mailtoLink, waLink } from "@/lib/local/messages";
import { sendResultText } from "@/lib/state-rules";
import type { LeadState } from "@/lib/types";

/** PATCH /api/local/[id] accepts a WhatsApp message up to this length. */
const MAX_WA_CHARS = 4000;

type ActionKey = "wa" | "email" | "mark" | "save" | "regen" | "demo";

/** What a failed action says before the error. Every action that writes says it was not saved (spec: "not saved, retry"). */
const FAILED: Record<ActionKey, string> = {
  wa: "WhatsApp ughadla, pan sent save zala nahi",
  email: "Email ughadla, pan sent save zala nahi",
  mark: "Sent save zala nahi",
  save: "Message save zala nahi",
  regen: "Message parat banla nahi (save zala nahi)",
  demo: "Copy zala nahi",
};

/** ok/warn toasts clear themselves so they never sit over the buttons; an error stays, with Retry, until closed. */
type Toast = { text: string; tone: "ok" | "warn" | "error"; retry?: ActionKey };
const TOAST_MS = { ok: 3500, warn: 7000 } as const;

export function LocalPanel(p: {
  param: string;
  phone: string;
  isMobile: boolean;
  email: string;
  whatsapp: string;
  emailSubject: string;
  emailBody: string;
  demoUrl: string | null;
}) {
  const router = useRouter();
  const [text, setText] = useState(p.whatsapp);
  const [saved, setSaved] = useState(p.whatsapp);
  const [busy, setBusy] = useState<ActionKey | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    if (!toast || toast.tone === "error") return;
    const t = setTimeout(() => setToast(null), TOAST_MS[toast.tone]);
    return () => clearTimeout(t);
  }, [toast]);

  /** `retry` is what the Retry button runs: after WhatsApp or email has opened, only the status write is retried. */
  async function run(key: ActionKey, fn: () => Promise<void>, retry: ActionKey = key) {
    setBusy(key);
    setToast(null);
    try {
      await fn();
    } catch (e) {
      setToast({ text: `${FAILED[key]} — ${(e as Error).message}`, tone: "error", retry });
    } finally {
      setBusy(null);
    }
  }

  /** The toast reads the stored status: a replied/won/lost lead keeps it (lib/state.ts). */
  const markSentWrite = async () => {
    const j = (await patchState(p.param, "local", { type: "sent" })) as { state?: LeadState };
    setToast({ text: sendResultText(j.state?.status ?? "sent", "sent"), tone: "ok" });
    router.refresh();
  };

  const markSent = () => run("mark", markSentWrite);

  // window.open runs synchronously inside the tap, so the browser does not treat it as a pop-up.
  const sendWa = () => {
    const link = waLink(p.phone, text);
    if (!link) {
      setToast({ text: "Phone number nahi", tone: "warn" });
      return;
    }
    window.open(link, "_blank", "noopener");
    void run("wa", markSentWrite, "mark");
  };

  // "" for an address that fails the strict check; the button is hidden then.
  const mailto = mailtoLink(p.email, p.emailSubject, p.emailBody);

  const sendEmail = () => {
    if (!mailto) return;
    window.location.href = mailto;
    void run("email", markSentWrite, "mark");
  };

  const save = () =>
    run("save", async () => {
      await patchJSON(`/api/local/${p.param}`, { whatsapp: text });
      setSaved(text);
      setToast({ text: "Saved", tone: "ok" });
    });

  const regen = () =>
    run("regen", async () => {
      const j = (await patchJSON(`/api/local/${p.param}`, { regenerate: true })) as { biz: { whatsapp: string } };
      setText(j.biz.whatsapp);
      setSaved(j.biz.whatsapp);
      setToast({ text: "Message Settings chya template ne parat banvla", tone: "ok" });
      router.refresh();
    });

  const copyDemo = () =>
    run("demo", async () => {
      await navigator.clipboard.writeText(p.demoUrl ?? "");
      setToast({ text: "Demo link copied", tone: "ok" });
    });

  /** Retry calls the action as it is now, so a retried save uses the current text. */
  const actions: Record<ActionKey, () => void> = { wa: sendWa, email: sendEmail, mark: markSent, save, regen, demo: copyDemo };

  return (
    <div className="card" style={{ marginTop: 12 }}>
      {p.demoUrl ? (
        <div className="btn-row" style={{ marginTop: 0 }}>
          <a className="btn" href={p.demoUrl} target="_blank" rel="noopener noreferrer">Demo bagh</a>
          <button className="btn btn--ghost" onClick={copyDemo} disabled={!!busy}>Copy demo link</button>
        </div>
      ) : (
        <p className="note" style={{ marginTop: 0 }}>Phone number nahi, mhanun demo page nahi.</p>
      )}
      <label className="field" style={{ marginTop: 12 }}>
        <span className="field__label">WhatsApp message</span>
        <textarea className="textarea-lg" value={text} maxLength={MAX_WA_CHARS} onChange={(e) => setText(e.target.value)} />
      </label>
      {!p.isMobile && p.phone ? <p className="note">Ha landline number ahe — WhatsApp var nasel. Call karun bagh, mag &quot;Contact kela&quot; dab.</p> : null}
      <div className="btn-row">
        {!p.isMobile && p.phone ? (
          <a className="btn btn--ok" href={`tel:+${p.phone}`}>Call kar</a>
        ) : (
          <button className="btn btn--ok" onClick={sendWa} disabled={!p.phone || !!busy}>WhatsApp var pathav</button>
        )}
        {text !== saved ? <button className="btn" onClick={save} disabled={!!busy}>Save</button> : null}
        <button className="btn btn--ghost" onClick={regen} disabled={!!busy}>Message parat banva</button>
      </div>
      <div className="btn-row">
        {mailto ? <button className="btn" onClick={sendEmail} disabled={!!busy}>Email pathav</button> : null}
        {/* Records a call, or a WhatsApp/email sent outside the app. */}
        <button className="btn btn--ghost" onClick={markSent} disabled={!!busy}>Contact kela (sent mark kar)</button>
      </div>
      {toast ? (
        <div className={`toast toast--${toast.tone}`} role={toast.tone === "ok" ? "status" : "alert"}>
          <span className="toast__text">{toast.text}</span>
          {toast.retry ? <button className="btn btn--ghost toast__btn" onClick={actions[toast.retry]} disabled={!!busy}>Retry</button> : null}
          {toast.tone === "error" ? <button className="toast__close" onClick={() => setToast(null)} aria-label="Close">✕</button> : null}
        </div>
      ) : null}
    </div>
  );
}
