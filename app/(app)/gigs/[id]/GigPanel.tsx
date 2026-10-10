"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getJSON, patchState, postJSON } from "@/lib/client/api";
import { describeProposal, limitWarning, type ProposalReply } from "@/lib/gigs/view";
import { sendResultText } from "@/lib/state-rules";
import type { LeadState } from "@/lib/types";

type Live = { open: boolean; status: string; bidCount: number | null; bidAvg: number | null; currency: string };
type ActionKey = "ai" | "save" | "copy" | "live" | "bid" | "skip";

/** What a failed action says before the error. Every action that writes says it was not saved (spec: "not saved, retry"). */
const FAILED: Record<ActionKey, string> = {
  ai: "AI proposal ala nahi",
  live: "Live check zala nahi",
  copy: "Copy zala nahi",
  save: "Save zala nahi",
  bid: "Bid save zala nahi",
  skip: "Skip save zala nahi",
};

/** ok/warn toasts clear themselves so they never sit over the buttons; an error stays, with Retry, until closed. */
type Toast = { text: string; tone: "ok" | "warn" | "error"; retry?: ActionKey };
const TOAST_MS = { ok: 3500, warn: 7000 } as const;

export function GigPanel(props: {
  id: string;
  param: string;
  url: string;
  isFreelancer: boolean;
  initialProposal: string;
  status: string;
  defaultCurrency: string;
  maxChars: number;
}) {
  const router = useRouter();
  const [text, setText] = useState(props.initialProposal);
  const [saved, setSaved] = useState(props.initialProposal);
  const [busy, setBusy] = useState<ActionKey | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [changes, setChanges] = useState<string[]>([]);
  const [live, setLive] = useState<Live | null>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(props.defaultCurrency);
  const max = props.maxChars;
  const over = limitWarning(text.length, max);

  useEffect(() => {
    if (!toast || toast.tone === "error") return;
    const t = setTimeout(() => setToast(null), TOAST_MS[toast.tone]);
    return () => clearTimeout(t);
  }, [toast]);

  async function run(key: ActionKey, fn: () => Promise<void>) {
    setBusy(key);
    setToast(null);
    try {
      await fn();
    } catch (e) {
      setToast({ text: `${FAILED[key]} — ${(e as Error).message}`, tone: "error", retry: key });
    } finally {
      setBusy(null);
    }
  }

  const draft = () =>
    run("ai", async () => {
      const r = (await postJSON("/api/ai/proposal", { id: props.id })) as unknown as ProposalReply;
      const v = describeProposal(r, max);
      setText(r.text);
      setSaved(r.text);
      setChanges(v.notes);
      if (v.warning) setToast({ text: v.warning, tone: v.tone ?? "warn" });
      router.refresh();
    });

  const save = () =>
    run("save", async () => {
      await patchState(props.param, "gig", { type: "proposal", proposal: text });
      setSaved(text);
      setToast({ text: "Saved", tone: "ok" });
      router.refresh();
    });

  const copy = () =>
    run("copy", async () => {
      await navigator.clipboard.writeText(text);
      setToast(
        over
          ? { text: "Copied — pan limit peksha mothi ahe, adhi kami kar", tone: "warn" }
          : { text: props.isFreelancer ? "Copied — ata Freelancer app madhe paste kar" : "Copied", tone: "ok" },
      );
    });

  const checkLive = () =>
    run("live", async () => {
      const j = (await getJSON(`/api/gigs/${props.param}/live`)) as unknown as { live: Live };
      setLive(j.live);
    });

  const bid = () => {
    // "18,000" is how amounts are usually written here.
    const n = Number(amount.replace(/[,\s]/g, ""));
    if (!Number.isFinite(n) || n <= 0) {
      setToast({ text: "Bid amount tak", tone: "warn" });
      return;
    }
    void run("bid", async () => {
      const j = (await patchState(props.param, "gig", { type: "bid", amount: n, currency })) as { state?: LeadState };
      setToast({ text: sendResultText(j.state?.status ?? "sent", "bid"), tone: "ok" });
      router.refresh();
    });
  };

  const skip = () =>
    run("skip", async () => {
      await patchState(props.param, "gig", { type: "skip" });
      router.push("/gigs");
    });

  /** Retry calls the action as it is now, so it uses the current text, amount and currency. */
  const actions: Record<ActionKey, () => void> = { ai: draft, save, copy, live: checkLive, bid, skip };

  return (
    <div className="stack">
      {props.isFreelancer ? (
        <section className="card">
          <div className="live-line">
            <button className="btn btn--ghost i-pulse" onClick={checkLive} disabled={!!busy}>{busy === "live" ? "Checking…" : "Live check"}</button>
            {live ? (
              <>
                <span className={`badge ${live.open ? "badge--ok" : "badge--danger"}`}>{live.open ? "Open" : `Closed (${live.status})`}</span>
                <span className="badge">{live.bidCount ?? "?"} bids</span>
                {live.bidAvg ? <span className="badge">avg {live.currency} {live.bidAvg}</span> : null}
              </>
            ) : (
              <span className="note">Bid karnyapurvi project open ahe ka bagh.</span>
            )}
          </div>
        </section>
      ) : null}

      <section className="card">
        <h2 className="card__title" style={{ marginBottom: 12 }}>Proposal</h2>
        <button className="btn btn--primary btn--block btn--lg i-sparkles" onClick={draft} disabled={!!busy}>{busy === "ai" ? "AI lihitoy… (30 s paryant)" : text ? "AI proposal parat lihi" : "AI proposal lihi"}</button>

        <label className="field" style={{ marginTop: 14 }}>
          <span className="field__label">Proposal text</span>
          <textarea className="textarea-lg" value={text} onChange={(e) => setText(e.target.value)} placeholder="AI proposal lihi dab, kinva swatah lihi." />
        </label>
        <div className={`counter${over ? " counter--over" : ""}`}>{text.length}/{max}</div>
        {over ? <p className="limit-alert" role="alert">{over}</p> : null}
        {changes.length ? (
          <details className="note"><summary>AI ne kay sudharla ({changes.length})</summary><ul>{changes.map((c, i) => <li key={i}>{c}</li>)}</ul></details>
        ) : null}

        <div className="btn-row">
          {text !== saved ? <button className="btn btn--ghost i-save" onClick={save} disabled={!!busy}>Save edits</button> : null}
          <button className="btn i-copy" onClick={copy} disabled={!text || !!busy}>Copy</button>
          {props.url ? (
            <a className="btn i-external" href={props.url} target="_blank" rel="noopener noreferrer">{props.isFreelancer ? "Open in Freelancer" : "Open post"}</a>
          ) : null}
        </div>
      </section>

      <section className="card">
        <h2 className="card__title">Bid lavla?</h2>
        <p className="card__sub">Amount tak ani save kar. Follow-up apoap lagel.</p>
        <div className="bid-row">
          <input className="field__input" inputMode="decimal" placeholder="Amount" aria-label="Bid amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <select className="field__input" aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {["INR", "USD", "EUR", "GBP", "AUD", "CAD"].map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <button className="btn btn--ok btn--block i-check" style={{ marginTop: 10 }} onClick={bid} disabled={!!busy}>Bid kela</button>
      </section>

      <button className="btn btn--quiet btn--block i-skip" onClick={skip} disabled={!!busy}>Skip</button>

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
